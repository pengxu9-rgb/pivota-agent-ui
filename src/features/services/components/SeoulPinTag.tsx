import { MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SeoulPinTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-[rgba(20,20,20,0.74)] py-[3px] pl-[5px] pr-[7px] text-[9.5px] font-bold uppercase leading-none tracking-[0.05em] text-white backdrop-blur-md',
        className,
      )}
    >
      <MapPin size={8.5} strokeWidth={2.5} aria-hidden="true" />
      Seoul
    </span>
  );
}
