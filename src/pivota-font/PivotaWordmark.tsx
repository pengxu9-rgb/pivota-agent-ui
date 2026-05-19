/**
 * <PivotaWordmark> — pre-baked Pivota wordmark.
 *
 * Drop-in replacement for the Pacifico "Pivota" wordmark currently in
 * the chat sidebar header / top bar / brand mark. Defaults are tuned
 * to read at sidebar-header scale (~28px tall).
 *
 *   <PivotaWordmark />              // "pivota." bold, 28px tall, ink
 *   <PivotaWordmark size={56} />    // hero scale
 *   <PivotaWordmark period={false} />  // just "pivota"
 *
 * Color inherits from `currentColor`. On the brand gradient hero,
 * wrap the parent with `color: white`.
 */

import * as React from 'react';
import { PivotaSans, type PivotaSansProps } from './PivotaSans';

export interface PivotaWordmarkProps extends Omit<PivotaSansProps, 'children' | 'fontSize'> {
  /** rendered height in px. Default 28 */
  size?: number;
  /** include trailing period. Default true */
  period?: boolean;
  /** text to render. Default "pivota" — override only if you really mean it */
  text?: string;
}

export function PivotaWordmark({
  size = 28,
  weight = 'bold',
  tracking = 30,
  period = true,
  text = 'pivota',
  italic,
  ...rest
}: PivotaWordmarkProps): React.ReactElement {
  return (
    <PivotaSans
      weight={weight}
      italic={italic}
      fontSize={size}
      tracking={tracking}
      {...rest}
    >
      {period ? `${text}.` : text}
    </PivotaSans>
  );
}
