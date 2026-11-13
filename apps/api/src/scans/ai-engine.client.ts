import { Injectable, Logger } from '@nestjs/common';
import { loadEnv } from '../common/config/env';
import type { ExplanationRequest } from './detectors/explanations';

export interface ClassificationResult {
  label: string;
  probability: number;
  model: string;
  labels: Record<string, number>;
}

export interface OcrResult {
  ok: boolean;
  text: string;
  engine: string | null;
  reason?: string;
}

export interface QrResult {
  ok: boolean;
  value: string;
  contentType: 'url' | 'upi' | 'text' | 'other';
  engine: string | null;
  reason?: string;
}

export interface ModelExplanation {
  text: string;
  generator: 'llm' | 'template';
  model: string | null;
}

/**
 * Thin internal client for the Python AI engine. Every call has a hard timeout
 * and returns structured failure instead of throwing, so an unavailable AI
 * service degrades the scan rather than breaking it.
 */
@Injectable()
export class AiEngineClient {
  private readonly logger = new Logger(AiEngineClient.name);
  private readonly env = loadEnv();

  private get baseUrl(): string {
    return this.env.AI_ENGINE_URL.replace(/\/$/, '');
  }

  private get enabled(): boolean {
    return this.env.AI_ENGINE_ENABLED;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      ...(extra ?? {}),
      ...(this.env.INTERNAL_SERVICE_TOKEN ? { 'x-internal-token': this.env.INTERNAL_SERVICE_TOKEN } : {}),
    };
  }

  async classify(text: string): Promise<ClassificationResult | null> {
    if (!this.enabled) return null;
    try {
      const response = await fetch(`${this.baseUrl}/classify`, {
        method: 'POST',
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify({ text: text.slice(0, 12000) }),
        signal: AbortSignal.timeout(this.env.AI_ENGINE_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as {
        label?: string;
        probability?: number;
        model?: string;
        labels?: Record<string, number>;
      };
      if (!body.label || typeof body.probability !== 'number') return null;
      return {
        label: body.label,
        probability: Math.min(1, Math.max(0, body.probability)),
        model: body.model ?? 'nlp-text-v1',
        labels: body.labels ?? {},
      };
    } catch (error) {
      this.logger.warn(`NLP classify failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }

  async ocr(buffer: Buffer, mimeType: string): Promise<OcrResult> {
    if (!this.enabled) return { ok: false, text: '', engine: null, reason: 'AI engine disabled' };
    try {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), 'screenshot');
      const response = await fetch(`${this.baseUrl}/ocr`, {
        method: 'POST',
        headers: this.headers(),
        body: form,
        signal: AbortSignal.timeout(Math.max(this.env.AI_ENGINE_TIMEOUT_MS, 20_000)),
      });
      const body = (await response.json().catch(() => null)) as {
        text?: string;
        engine?: string;
        detail?: string;
      } | null;
      if (!response.ok) {
        return { ok: false, text: '', engine: null, reason: body?.detail ?? `OCR service returned ${response.status}` };
      }
      if (!body?.text || body.text.trim().length === 0) {
        return { ok: false, text: '', engine: body?.engine ?? null, reason: 'No readable text was found in the image.' };
      }
      return { ok: true, text: body.text.slice(0, 30_000), engine: body.engine ?? 'ocr' };
    } catch (error) {
      this.logger.warn(`OCR call failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return { ok: false, text: '', engine: null, reason: 'The OCR engine is unavailable right now.' };
    }
  }

  async decodeQr(buffer: Buffer, mimeType: string): Promise<QrResult> {
    if (!this.enabled) return { ok: false, value: '', contentType: 'other', engine: null, reason: 'AI engine disabled' };
    try {
      const form = new FormData();
      form.append('file', new Blob([new Uint8Array(buffer)], { type: mimeType }), 'qr');
      const response = await fetch(`${this.baseUrl}/qr`, {
        method: 'POST',
        headers: this.headers(),
        body: form,
        signal: AbortSignal.timeout(Math.max(this.env.AI_ENGINE_TIMEOUT_MS, 15_000)),
      });
      const body = (await response.json().catch(() => null)) as {
        value?: string;
        content_type?: string;
        engine?: string;
        detail?: string;
      } | null;
      if (!response.ok || !body?.value) {
        return {
          ok: false,
          value: '',
          contentType: 'other',
          engine: body?.engine ?? null,
          reason: body?.detail ?? 'No QR code could be decoded from that image.',
        };
      }
      const allowed = ['url', 'upi', 'text', 'other'];
      const contentType = (allowed.includes(body.content_type ?? '') ? body.content_type : 'text') as QrResult['contentType'];
      return { ok: true, value: body.value.slice(0, 4096), contentType, engine: body.engine ?? 'qr' };
    } catch (error) {
      this.logger.warn(`QR decode failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return { ok: false, value: '', contentType: 'other', engine: null, reason: 'The QR decoder is unavailable right now.' };
    }
  }

  async explain(request: ExplanationRequest): Promise<ModelExplanation | null> {
    if (!this.enabled) return null;
    try {
      const response = await fetch(`${this.baseUrl}/explain`, {
        method: 'POST',
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { text?: string; generator?: string; model?: string | null };
      if (!body.text) return null;
      return {
        text: body.text,
        generator: body.generator === 'llm' ? 'llm' : 'template',
        model: body.model ?? null,
      };
    } catch (error) {
      this.logger.warn(`Explain call failed: ${error instanceof Error ? error.message : 'unknown'}`);
      return null;
    }
  }

  async health(): Promise<{ reachable: boolean; latencyMs: number | null; detail: string; model: string | null }> {
    if (!this.enabled) {
      return { reachable: false, latencyMs: null, detail: 'AI engine disabled by configuration', model: null };
    }
    const started = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: this.headers(),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) {
        return { reachable: false, latencyMs: Date.now() - started, detail: `AI engine returned ${response.status}`, model: null };
      }
      const body = (await response.json()) as { status?: string; model?: string; llm_configured?: boolean };
      return {
        reachable: body.status === 'ok',
        latencyMs: Date.now() - started,
        detail: `AI engine online${body.llm_configured ? ' (LLM configured)' : ' (deterministic explanations only)'}`,
        model: body.model ?? null,
      };
    } catch (error) {
      return {
        reachable: false,
        latencyMs: null,
        detail: `AI engine unreachable: ${error instanceof Error ? error.message : 'unknown'}`,
        model: null,
      };
    }
  }
}
