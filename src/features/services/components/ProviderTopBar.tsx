'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, Heart, Share } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export function ProviderTopBar({ title }: { title?: string }) {
  const router = useRouter();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 96);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const buttonClass = cn(
    'flex h-[34px] w-[34px] items-center justify-center rounded-full transition-colors',
    scrolled
      ? 'border border-[var(--pv-border)] bg-white text-[var(--pv-ink)]'
      : 'bg-[rgba(0,0,0,0.36)] text-white backdrop-blur-md',
  );

  return (
    <div
      className={cn(
        'fixed left-0 right-0 top-0 z-30 transition-colors',
        scrolled ? 'border-b border-[var(--pv-border)] bg-white/90 backdrop-blur-xl backdrop-saturate-150' : 'bg-transparent',
      )}
    >
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4 md:px-6">
        <button type="button" className={buttonClass} aria-label="Back" onClick={() => router.back()}>
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <div className={cn('min-w-0 flex-1 truncate text-[13px] font-semibold', scrolled ? 'text-[var(--pv-ink)]' : 'text-transparent')}>
          {title}
        </div>
        <button type="button" className={buttonClass} aria-label="Share">
          <Share size={17} aria-hidden="true" />
        </button>
        <button type="button" className={buttonClass} aria-label="Save">
          <Heart size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
