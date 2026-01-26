'use client';

import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

export type GenericColorOption = {
  value: string;
  label_image_url?: string;
  image_url?: string;
  swatch_hex?: string;
};

export function GenericColorSheet({
  open,
  onClose,
  options,
  selectedValue,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  options: GenericColorOption[];
  selectedValue: string | null;
  onSelect: (value: string) => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-[2147483647] bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-[2147483647] h-[70vh] rounded-t-2xl bg-card border border-border shadow-2xl"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="text-sm font-semibold">Select Color ({options.length})</div>
              <button
                onClick={onClose}
                className="h-7 w-7 rounded-full flex items-center justify-center hover:bg-secondary transition-colors"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2 overflow-y-auto px-4 pb-4">
              {options.map((option) => {
                const isSelected = option.value === selectedValue;
                const imageUrl = option.label_image_url || option.image_url;
                return (
                  <button
                    key={option.value}
                    onClick={() => {
                      onSelect(option.value);
                      onClose();
                    }}
                    className={`flex flex-col items-center gap-0.5 p-1.5 rounded-md border text-center transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <div className="relative h-16 w-11 rounded overflow-hidden bg-muted">
                      {imageUrl ? (
                        <Image
                          src={imageUrl}
                          alt={option.value}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      ) : option.swatch_hex ? (
                        <span className="absolute inset-0" style={{ backgroundColor: option.swatch_hex }} />
                      ) : null}
                    </div>
                    <span className="text-[9px] text-muted-foreground line-clamp-1">{option.value}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
