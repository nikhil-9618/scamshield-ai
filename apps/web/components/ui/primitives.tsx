import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, CheckCircle2, Info, Loader2, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { cn, RISK_STYLES, SEVERITY_STYLES } from '@/lib/utils';

/* ------------------------------------------------------------------ Button */

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white shadow-soft hover:bg-primary/90',
        secondary: 'bg-accent text-accent-foreground hover:bg-accent/90',
        outline: 'border border-line bg-transparent text-ink hover:bg-white/5',
        ghost: 'text-muted hover:bg-white/5 hover:text-ink',
        danger: 'bg-danger text-white hover:bg-danger/90',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    // Radix Slot requires exactly one child; keep the loading spinner out of the
    // asChild path (links cannot show a pending state) so the slot stays valid.
    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

/* -------------------------------------------------------------------- Card */

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line bg-card/80 shadow-card backdrop-blur-[2px]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 p-5 pb-3', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-base font-semibold tracking-tight text-ink', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm text-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5 pt-2', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-3 p-5 pt-3', className)} {...props} />;
}

/* -------------------------------------------------------------- Form fields */

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-xl border border-line bg-surface/80 px-3 py-2 text-sm text-ink placeholder:text-muted/70 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[120px] w-full rounded-xl border border-line bg-surface/80 px-3 py-2.5 text-sm text-ink placeholder:text-muted/70 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium text-ink', className)} {...props} />;
}

export function FieldHint({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-xs text-muted', className)} {...props} />;
}

export function FieldError({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-xs font-medium text-danger">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ Badge */

const badgeVariants = cva('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'border-line bg-white/5 text-muted',
      primary: 'border-primary/30 bg-primary/10 text-primary',
      accent: 'border-accent/30 bg-accent/10 text-accent',
      success: 'border-success/30 bg-success/10 text-success',
      warning: 'border-warning/30 bg-warning/10 text-warning',
      danger: 'border-danger/40 bg-danger/10 text-danger',
      outline: 'border-line text-muted',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function RiskBadge({ level, score, className }: { level: string | null | undefined; score?: number | null; className?: string }) {
  const style = level ? RISK_STYLES[level as keyof typeof RISK_STYLES] : null;
  if (!style) {
    return (
      <Badge variant="outline" className={className}>
        <ShieldQuestion className="h-3.5 w-3.5" aria-hidden />
        Not scored
      </Badge>
    );
  }
  const Icon = level === 'low' ? ShieldCheck : level === 'moderate' ? ShieldQuestion : ShieldAlert;
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium', style.className, className)}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {style.label}
      {typeof score === 'number' ? <span className="font-mono opacity-80">· {score}</span> : null}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.info,
      )}
    >
      {severity}
    </span>
  );
}

/* ------------------------------------------------------------------ Alert */

const alertStyles = {
  info: { className: 'border-accent/25 bg-accent/5 text-ink', Icon: Info },
  success: { className: 'border-success/25 bg-success/5 text-ink', Icon: CheckCircle2 },
  warning: { className: 'border-warning/30 bg-warning/5 text-ink', Icon: AlertTriangle },
  danger: { className: 'border-danger/30 bg-danger/5 text-ink', Icon: ShieldAlert },
} as const;

export function Alert({
  variant = 'info',
  title,
  children,
  className,
}: {
  variant?: keyof typeof alertStyles;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { className: style, Icon } = alertStyles[variant];
  return (
    <div role={variant === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border p-4 text-sm', style, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        {children ? <div className="text-sm text-muted">{children}</div> : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------- Layout helpers */

export function Separator({ className }: { className?: string }) {
  return <div role="separator" className={cn('h-px w-full bg-line', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-white/[0.06]', className)} aria-hidden />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-line/80 bg-white/[0.015] px-6 py-12 text-center">
      {icon ? <div className="rounded-full border border-line bg-white/5 p-3 text-muted">{icon}</div> : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------- Progress & switch */

export function Progress({ value, className }: { value: number; className?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/10', className)}
    >
      <div
        className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-500"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  id,
  disabled,
  className,
  'aria-label': ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative h-5 w-9 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50',
        checked ? 'border-primary bg-primary' : 'border-line bg-white/10',
        className,
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-[18px]' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------- Score gauge */

export function ScoreGauge({ score, level, size = 148 }: { score: number; level: string; size?: number }) {
  const radius = (size - 18) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const dash = (clamped / 100) * circumference;
  const color = RISK_STYLES[level as keyof typeof RISK_STYLES]?.ring ?? '#94A3B8';
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(148,163,184,0.16)" strokeWidth="10" fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          fill="none"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-3xl font-semibold text-ink">{clamped}</span>
        <span className="text-[11px] uppercase tracking-widest text-muted">of 100</span>
      </div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = 'text-ink',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 pt-5">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
          <p className={cn('font-mono text-2xl font-semibold', accent)}>{value}</p>
          {hint ? <p className="text-xs text-muted">{hint}</p> : null}
        </div>
        {icon ? <div className="rounded-xl border border-line bg-white/5 p-2 text-muted">{icon}</div> : null}
      </CardContent>
    </Card>
  );
}
