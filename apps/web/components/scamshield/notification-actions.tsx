'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { markAllNotificationsReadAction } from '@/lib/actions';

export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={disabled}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markAllNotificationsReadAction();
          if (result.ok) {
            toast.success('All notifications marked as read');
            router.refresh();
          } else {
            toast.error(result.message ?? 'Could not update notifications');
          }
        })
      }
    >
      <CheckCheck className="h-3.5 w-3.5" aria-hidden /> Mark all read
    </Button>
  );
}
