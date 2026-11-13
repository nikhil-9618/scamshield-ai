'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  AlertTriangle,
  FileImage,
  FileText,
  Link2,
  Loader2,
  Mail,
  MessageSquare,
  QrCode,
  ScanLine,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import { emailSchema, LIMITS, type MessageScanInput, type UrlScanInput } from '@scamshield/validation';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldError,
  FieldHint,
  Input,
  Label,
  Progress,
  Switch,
  Textarea,
} from '@/components/ui/primitives';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/interactive';
import { scanEmailAction, scanMessageAction, scanUploadAction, scanUrlAction } from '@/lib/actions';

type ScanTab = 'message' | 'url' | 'screenshot' | 'qr' | 'email';

const TABS: Array<{ value: ScanTab; label: string; icon: typeof MessageSquare }> = [
  { value: 'message', label: 'Message', icon: MessageSquare },
  { value: 'url', label: 'URL', icon: Link2 },
  { value: 'screenshot', label: 'Screenshot', icon: FileImage },
  { value: 'qr', label: 'QR code', icon: QrCode },
  { value: 'email', label: 'Email', icon: Mail },
];

const EXAMPLES = {
  job: 'Congratulations! You are selected for a work-from-home data entry internship. Earn ₹3,500 per day. Pay a refundable registration fee of ₹499 to confirm your seat. Contact HR on Telegram: @scamshield_example',
  kyc: 'Dear customer, your SBI account will be blocked today. Update your KYC immediately at sbi-kyc-verify.top and share the OTP with our executive.',
};

const STEP_LABELS = ['Validating what you submitted', 'Running detection checks', 'Scoring findings and evidence'];

function Working({ note }: { note: string }) {
  return (
    <Card className="border-primary/25">
      <CardContent className="space-y-4 pt-5">
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
          <div>
            <p className="text-sm font-medium text-ink">Analysing…</p>
            <p className="text-xs text-muted">{note}</p>
          </div>
        </div>
        <ol className="space-y-2">
          {STEP_LABELS.map((label, index) => (
            <li key={label} className="flex items-center gap-2 text-xs text-muted">
              <span className="grid h-5 w-5 place-items-center rounded-full border border-line bg-white/5 font-mono text-[10px]">
                {index + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
        <p className="text-[11px] text-muted/80">
          URL scans can take longer because each redirect and certificate is validated. No page JavaScript is executed.
        </p>
      </CardContent>
    </Card>
  );
}

function ConsentToggle({
  value,
  onChange,
  description,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-line bg-white/[0.02] p-3">
      <div className="space-y-1">
        <Label htmlFor="consent" className="text-xs">
          Store this scan content
        </Label>
        <p className="text-[11px] leading-relaxed text-muted">{description}</p>
      </div>
      <Switch id="consent" checked={value} onCheckedChange={onChange} aria-label="Store this scan content" />
    </div>
  );
}

/* ------------------------------------------------------------- message form */

const messageFormSchema = z.object({
  content: z
    .string()
    .trim()
    .min(LIMITS.messageMin, `Paste at least ${LIMITS.messageMin} characters`)
    .max(LIMITS.messageMax, 'Message is too long'),
  channel: z.enum(['sms', 'whatsapp', 'telegram', 'email', 'social', 'other']),
});
type MessageFormValues = z.infer<typeof messageFormSchema>;

function MessageForm({ defaultConsent }: { defaultConsent: boolean }) {
  const router = useRouter();
  const [consent, setConsent] = useState(defaultConsent);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<MessageFormValues>({ resolver: zodResolver(messageFormSchema), defaultValues: { content: '', channel: 'whatsapp' } });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setPending(true);
    const input: MessageScanInput = { ...values, consentToStore: consent };
    const result = await scanMessageAction(input);
    setPending(false);
    if (!result.ok || !result.data) {
      setServerError(result.message ?? 'The scan could not be completed.');
      return;
    }
    toast.success('Scan completed');
    router.push(`/scans/${result.data.id}`);
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="content">Message content</Label>
          <div className="flex gap-1.5">
            <button
              type="button"
              className="rounded-md border border-line px-2 py-0.5 text-[10px] text-muted hover:text-ink"
              onClick={() => setValue('content', EXAMPLES.job, { shouldValidate: true })}
            >
              Load example (fake job)
            </button>
            <button
              type="button"
              className="rounded-md border border-line px-2 py-0.5 text-[10px] text-muted hover:text-ink"
              onClick={() => setValue('content', EXAMPLES.kyc, { shouldValidate: true })}
            >
              Load example (KYC)
            </button>
          </div>
        </div>
        <Textarea
          id="content"
          rows={7}
          placeholder="Paste the SMS, WhatsApp, Telegram or social message here…"
          aria-invalid={Boolean(errors.content)}
          {...register('content')}
        />
        <div className="flex items-center justify-between">
          <FieldError>{errors.content?.message}</FieldError>
          <FieldHint>Do not include your own OTPs, PINs or passwords.</FieldHint>
        </div>
      </div>
      <div className="space-y-1.5 sm:max-w-xs">
        <Label htmlFor="channel">Where did you receive it?</Label>
        <select
          id="channel"
          className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink"
          {...register('channel')}
        >
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="telegram">Telegram</option>
          <option value="social">Social media</option>
          <option value="email">Email</option>
          <option value="other">Other</option>
        </select>
      </div>
      <ConsentToggle
        value={consent}
        onChange={setConsent}
        description="Off by default: only a redacted preview and hash are kept. When on, the message is encrypted at rest and deleted after your retention period."
      />
      {serverError ? <Alert variant="danger" title="Scan failed">{serverError}</Alert> : null}
      {pending ? <Working note="Rules, links and language signals are being checked." /> : null}
      <Button type="submit" loading={pending} className="w-full sm:w-auto">
        <ScanLine className="h-4 w-4" aria-hidden /> Analyse message
      </Button>
    </form>
  );
}

/* ----------------------------------------------------------------- url form */

const urlFormSchema = z.object({
  url: z
    .string()
    .trim()
    .min(4, 'Enter a URL')
    .max(2048, 'URL is too long')
    .refine((value) => /^https?:\/\//i.test(value), 'Start with http:// or https://'),
});

function UrlForm({ defaultConsent }: { defaultConsent: boolean }) {
  const router = useRouter();
  const [consent, setConsent] = useState(defaultConsent);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ url: string }>({ resolver: zodResolver(urlFormSchema), defaultValues: { url: '' } });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    setPending(true);
    const input: UrlScanInput = { url: values.url, consentToStore: consent };
    const result = await scanUrlAction(input);
    setPending(false);
    if (!result.ok || !result.data) {
      setServerError(result.message ?? 'The URL could not be scanned.');
      return;
    }
    toast.success('URL analysis completed');
    router.push(`/scans/${result.data.id}`);
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="url">Link to inspect</Label>
        <Input id="url" inputMode="url" placeholder="https://example.com/login" aria-invalid={Boolean(errors.url)} {...register('url')} />
        <FieldError>{errors.url?.message}</FieldError>
        <FieldHint>
          Private, local and internal addresses are refused. Each redirect and TLS certificate is validated. JavaScript is
          never executed.
        </FieldHint>
      </div>
      <ConsentToggle
        value={consent}
        onChange={setConsent}
        description="The analysed URL is kept as a redacted preview by default; turning this on stores the full URL encrypted with your retention period."
      />
      {serverError ? <Alert variant="danger" title="URL scan failed">{serverError}</Alert> : null}
      {pending ? <Working note="Resolving DNS, checking redirects, certificate and reputation." /> : null}
      <Button type="submit" loading={pending} className="w-full sm:w-auto">
        <Link2 className="h-4 w-4" aria-hidden /> Inspect URL
      </Button>
    </form>
  );
}

/* --------------------------------------------------------------- file forms */

function UploadForm({ type, defaultConsent }: { type: 'screenshot' | 'qr'; defaultConsent: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(defaultConsent);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isQr = type === 'qr';

  async function submit() {
    setError(null);
    if (!file) {
      setError('Choose a PNG or JPEG image first.');
      return;
    }
    const allowed = ['image/png', 'image/jpeg'];
    if (!allowed.includes(file.type)) {
      setError('Only PNG and JPEG images are supported.');
      return;
    }
    if (file.size > LIMITS.imageMaxBytes) {
      setError(`Images must be smaller than ${Math.round(LIMITS.imageMaxBytes / (1024 * 1024))} MB.`);
      return;
    }
    setPending(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('consentToStore', String(consent));
    const result = await scanUploadAction(type, formData);
    setPending(false);
    if (!result.ok || !result.data) {
      setError(result.message ?? 'The image could not be scanned.');
      return;
    }
    toast.success(isQr ? 'QR code decoded' : 'Screenshot analysed');
    router.push(`/scans/${result.data.id}`);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${type}-file`}>{isQr ? 'QR code image' : 'Screenshot image'}</Label>
        <label
          htmlFor={`${type}-file`}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-10 text-center transition-colors hover:border-primary/40 hover:bg-surface"
        >
          <UploadCloud className="h-6 w-6 text-accent" aria-hidden />
          <span className="text-sm font-medium text-ink">{file ? file.name : 'Click to choose a PNG or JPEG'}</span>
          <span className="text-xs text-muted">Maximum 5 MB. Processed in memory and never published.</span>
          <input
            ref={inputRef}
            id={`${type}-file`}
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
          />
        </label>
        {file ? (
          <div className="flex items-center justify-between rounded-lg border border-line bg-white/[0.02] px-3 py-2 text-xs text-muted">
            <span>
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </span>
            <button
              type="button"
              className="text-danger hover:underline"
              onClick={() => {
                setFile(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
            >
              Remove
            </button>
          </div>
        ) : null}
      </div>

      {isQr ? (
        <Alert variant="warning" title="QR destinations are never opened automatically">
          The image is decoded on the server. If it contains a link, the link is analysed and shown as text — ScamShield
          will not redirect your browser to it.
        </Alert>
      ) : (
        <ConsentToggle
          value={consent}
          onChange={setConsent}
          description="Screenshot images are never stored. Turning this on only stores the extracted text, encrypted, for your retention period."
        />
      )}

      {error ? <Alert variant="danger" title="Could not scan the image">{error}</Alert> : null}
      {pending ? <Working note={isQr ? 'Decoding the QR payload and analysing the destination.' : 'Extracting text with OCR and analysing it.'} /> : null}
      <Button type="button" loading={pending} onClick={submit} className="w-full sm:w-auto">
        {isQr ? <QrCode className="h-4 w-4" aria-hidden /> : <FileImage className="h-4 w-4" aria-hidden />}
        {isQr ? 'Decode and analyse QR' : 'Extract and analyse text'}
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------- email form */

function EmailForm({ defaultConsent }: { defaultConsent: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'paste' | 'file'>('paste');
  const [raw, setRaw] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(defaultConsent);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    setPending(true);
    try {
      if (mode === 'file') {
        if (!file) {
          setError('Choose an .eml file first.');
          return;
        }
        if (file.size > LIMITS.emlMaxBytes) {
          setError('Email files must be smaller than 2 MB.');
          return;
        }
        const formData = new FormData();
        formData.append('file', file);
        formData.append('consentToStore', String(consent));
        const result = await scanUploadAction('email', formData);
        if (!result.ok || !result.data) {
          setError(result.message ?? 'The email could not be analysed.');
          return;
        }
        toast.success('Email analysed');
        router.push(`/scans/${result.data.id}`);
        return;
      }
      if (raw.trim().length < 20) {
        setError('Paste the email content, including the sender and subject if you have them.');
        return;
      }
      const result = await scanEmailAction({ raw, consentToStore: consent });
      if (!result.ok || !result.data) {
        setError(result.message ?? 'The email could not be analysed.');
        return;
      }
      toast.success('Email analysed');
      router.push(`/scans/${result.data.id}`);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('paste')}
          className={`rounded-lg border px-3 py-1.5 text-xs ${mode === 'paste' ? 'border-primary/40 bg-primary/10 text-ink' : 'border-line text-muted hover:text-ink'}`}
        >
          <FileText className="mr-1 inline h-3.5 w-3.5" aria-hidden /> Paste content
        </button>
        <button
          type="button"
          onClick={() => setMode('file')}
          className={`rounded-lg border px-3 py-1.5 text-xs ${mode === 'file' ? 'border-primary/40 bg-primary/10 text-ink' : 'border-line text-muted hover:text-ink'}`}
        >
          <UploadCloud className="mr-1 inline h-3.5 w-3.5" aria-hidden /> Upload .eml
        </button>
      </div>

      {mode === 'paste' ? (
        <div className="space-y-1.5">
          <Label htmlFor="email-raw">Email content</Label>
          <Textarea
            id="email-raw"
            rows={9}
            className="font-mono text-xs"
            placeholder={'From: "HDFC Bank" <alerts@example-mail.com>\nReply-To: recovery@another-domain.top\nSubject: Your account will be suspended\n\nDear customer, verify your KYC…'}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
          />
          <FieldHint>
            Include the header block (From, Reply-To, Subject, Authentication-Results) when you have it — header mismatches
            are strong signals. Missing headers are never treated as fraud.
          </FieldHint>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="eml-file">Email file</Label>
          <label
            htmlFor="eml-file"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-surface/50 px-6 py-10 text-center hover:border-primary/40"
          >
            <UploadCloud className="h-6 w-6 text-accent" aria-hidden />
            <span className="text-sm font-medium text-ink">{file ? file.name : 'Choose an .eml file'}</span>
            <span className="text-xs text-muted">Maximum 2 MB. Attachments are not opened.</span>
            <input
              id="eml-file"
              type="file"
              accept=".eml,message/rfc822,text/plain"
              className="sr-only"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setError(null);
              }}
            />
          </label>
        </div>
      )}

      <ConsentToggle
        value={consent}
        onChange={setConsent}
        description="Off by default: only a redacted preview and hash are stored. Turning this on encrypts the raw email for your retention period."
      />

      {error ? <Alert variant="danger" title="Could not analyse the email">{error}</Alert> : null}
      {pending ? <Working note="Parsing headers, checking authentication results and inspecting links." /> : null}
      <Button type="button" loading={pending} onClick={submit} className="w-full sm:w-auto">
        <Mail className="h-4 w-4" aria-hidden /> Analyse email
      </Button>
    </div>
  );
}

/* ----------------------------------------------------------------- console */

export function ScanConsole({
  initialTab = 'message',
  defaultConsent,
  quota,
}: {
  initialTab?: ScanTab;
  defaultConsent: boolean;
  quota: { limit: number; used: number };
}) {
  const [tab, setTab] = useState<ScanTab>(initialTab);
  const usedPercent = quota.limit > 0 ? Math.min(100, (quota.used / quota.limit) * 100) : 0;

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted">
            <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
            Content is analysed server-side. Links and QR destinations are never opened in your browser.
          </div>
          <div className="w-full sm:w-48">
            <div className="mb-1 flex justify-between text-[11px] text-muted">
              <span>Daily allowance</span>
              <span className="font-mono">
                {quota.used}/{quota.limit}
              </span>
            </div>
            <Progress value={usedPercent} />
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(value) => setTab(value as ScanTab)}>
        <TabsList aria-label="Scanner type">
          {TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle>
                {tab === 'message' && 'Check a message'}
                {tab === 'url' && 'Check a link'}
                {tab === 'screenshot' && 'Check a screenshot'}
                {tab === 'qr' && 'Check a QR code'}
                {tab === 'email' && 'Check an email'}
              </CardTitle>
              <CardDescription>
                {tab === 'message' && 'SMS, WhatsApp, Telegram, job offers, payment requests or bank notifications.'}
                {tab === 'url' && 'Domain structure, redirects, certificate, page content and threat intelligence.'}
                {tab === 'screenshot' && 'Text is extracted with OCR, then messages and links are analysed.'}
                {tab === 'qr' && 'The payload is decoded and shown to you; URLs are analysed but never opened.'}
                {tab === 'email' && 'Headers, authentication results, body language and links.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TabsContent value="message">
                <MessageForm defaultConsent={defaultConsent} />
              </TabsContent>
              <TabsContent value="url">
                <UrlForm defaultConsent={defaultConsent} />
              </TabsContent>
              <TabsContent value="screenshot">
                <UploadForm type="screenshot" defaultConsent={defaultConsent} />
              </TabsContent>
              <TabsContent value="qr">
                <UploadForm type="qr" defaultConsent={defaultConsent} />
              </TabsContent>
              <TabsContent value="email">
                <EmailForm defaultConsent={defaultConsent} />
              </TabsContent>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>What we check</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs text-muted">
                {[
                  'Urgency and pressure tactics',
                  'Upfront payment and UPI/QR requests',
                  'OTP, PIN, CVV and credential requests',
                  'KYC, courier and government-scheme language',
                  'Brand claims vs the actual domain',
                  'Link structure, redirects and certificates',
                  'Known-bad domains from threat feeds',
                  'AI explanations only after the evidence',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
                    {item}
                  </div>
                ))}
              </CardContent>
            </Card>
            <Alert variant="info" title="Your privacy choices">
              <p>
                Scans are stored as a redacted preview and hash by default. Full content, when you opt in, is encrypted and
                deleted on your retention schedule.{' '}
                <Link href="/privacy" className="text-accent hover:underline">
                  Read the details
                </Link>
                .
              </p>
            </Alert>
            <Alert variant="warning" title="A clean result is not a guarantee">
              <p>
                Scammers constantly create new domains and accounts. If a request involves money, codes or identity
                documents, verify it through a channel you find yourself.
              </p>
            </Alert>
            {quota.used >= quota.limit ? (
              <Alert variant="warning" title="Daily limit reached">
                You have used {quota.used} of {quota.limit} scans in the last 24 hours. Try again later, or upgrade your
                plan from the security centre.
              </Alert>
            ) : null}
          </div>
        </div>
      </Tabs>
    </div>
  );
}

export function EmailPasteHint({ value }: { value: string }) {
  return <span className="text-xs text-muted">{emailSchema.safeParse(value).success ? 'Looks like an email' : ''}</span>;
}
