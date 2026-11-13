import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDate(value: string | Date, options?: Intl.DateTimeFormatOptions): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...options,
  }).format(date);
}

export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function relativeTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return formatDate(date);
}

export const RISK_STYLES = {
  low: {
    label: 'Low risk',
    className: 'border-success/30 bg-success/10 text-success',
    dot: 'bg-success',
    text: 'text-success',
    ring: '#22C55E',
  },
  moderate: {
    label: 'Moderate risk',
    className: 'border-warning/30 bg-warning/10 text-warning',
    dot: 'bg-warning',
    text: 'text-warning',
    ring: '#F59E0B',
  },
  high: {
    label: 'High risk',
    className: 'border-danger/40 bg-danger/10 text-danger',
    dot: 'bg-danger',
    text: 'text-danger',
    ring: '#EF4444',
  },
  critical: {
    label: 'Critical risk',
    className: 'border-danger/60 bg-danger/15 text-danger',
    dot: 'bg-danger',
    text: 'text-danger',
    ring: '#EF4444',
  },
} as const;

export const SEVERITY_STYLES: Record<string, string> = {
  info: 'border-line bg-white/5 text-muted',
  low: 'border-accent/30 bg-accent/10 text-accent',
  medium: 'border-warning/30 bg-warning/10 text-warning',
  high: 'border-danger/40 bg-danger/10 text-danger',
  critical: 'border-danger/60 bg-danger/20 text-danger',
};

export const SCAN_TYPE_LABELS: Record<string, string> = {
  message: 'Message',
  url: 'URL',
  screenshot: 'Screenshot',
  qr: 'QR code',
  email: 'Email',
};

export function truncate(value: string, max = 140): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
