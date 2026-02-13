import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ModuleShellState =
  | 'ABSENT'
  | 'LOADING'
  | 'READY'
  | 'EMPTY'
  | 'ERROR';

export function ModuleShell({
  state,
  height,
  skeleton,
  children,
  className,
}: {
  state: ModuleShellState;
  height: number;
  skeleton: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  if (state === 'ABSENT') return null;

  if (state === 'LOADING') {
    return (
      <div
        className={cn('overflow-hidden transition-opacity duration-200', className)}
        style={{ minHeight: height }}
        data-module-state="loading"
      >
        {skeleton}
      </div>
    );
  }

  if (state === 'EMPTY' || state === 'ERROR') {
    return <>{children}</>;
  }

  return (
    <div
      className={cn('transition-opacity duration-300 opacity-100', className)}
      style={{ minHeight: height }}
      data-module-state={state.toLowerCase()}
    >
      {children}
    </div>
  );
}
