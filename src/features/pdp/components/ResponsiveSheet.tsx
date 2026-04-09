'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useIsDesktop } from '@/features/pdp/hooks/useIsDesktop';
import { cn } from '@/lib/utils';

export function ResponsiveSheet({
  open,
  onClose,
  title,
  children,
  footer,
  mobileHeight = 'h-[70vh]',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  mobileHeight?: string;
}) {
  const isDesktop = useIsDesktop();
  const hasFooter = footer != null;
  const mobileSafeAreaClass = 'pb-[env(safe-area-inset-bottom)]';

  return (
    <AnimatePresence>
      {open ? (
        isDesktop ? (
          <>
            <motion.div
              className="fixed inset-0 z-[2147483647] bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.div
              className="fixed inset-0 z-[2147483647] flex items-center justify-center p-6 pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="pointer-events-auto w-full max-w-lg max-h-[80vh] rounded-2xl bg-card border border-border shadow-2xl flex flex-col overflow-hidden"
                data-testid="responsive-sheet"
                data-variant="desktop"
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
                  <div className="text-base font-semibold">{title}</div>
                  <button
                    onClick={onClose}
                    className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div
                  className="flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
                  data-testid="responsive-sheet-body"
                >
                  {children}
                </div>
                {hasFooter ? (
                  <div className="shrink-0" data-testid="responsive-sheet-footer">
                    {footer}
                  </div>
                ) : null}
              </motion.div>
            </motion.div>
          </>
        ) : (
          <>
            <motion.div
              className="fixed inset-0 z-[2147483647] bg-black/40 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.div
              className={`fixed bottom-0 left-0 right-0 z-[2147483647] ${mobileHeight} rounded-t-2xl bg-card border border-border shadow-2xl flex flex-col overflow-hidden`}
              data-testid="responsive-sheet"
              data-variant="mobile"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <div className="text-sm font-semibold">{title}</div>
                <button
                  onClick={onClose}
                  className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div
                className={cn(
                  'flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]',
                  hasFooter ? null : mobileSafeAreaClass,
                )}
                data-testid="responsive-sheet-body"
              >
                {children}
              </div>
              {hasFooter ? (
                <div
                  className={cn('shrink-0', mobileSafeAreaClass)}
                  data-testid="responsive-sheet-footer"
                >
                  {footer}
                </div>
              ) : null}
            </motion.div>
            </>
          )
      ) : null}
    </AnimatePresence>
  );
}
