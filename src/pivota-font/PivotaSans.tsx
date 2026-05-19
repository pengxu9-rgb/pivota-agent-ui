/**
 * <PivotaSans> — render arbitrary text in the Pivota Sans typeface.
 *
 * Usage:
 *   <PivotaSans>Add to bag</PivotaSans>
 *   <PivotaSans weight="bold" fontSize={48} italic>New this week</PivotaSans>
 *
 * Color inherits from `currentColor`. Set color on a parent and the
 * letterforms inherit — including across the brand gradient.
 *
 *   <h1 style={{ color: 'white' }}>
 *     <PivotaSans fontSize={64} weight="bold">pivota.</PivotaSans>
 *   </h1>
 */

import * as React from 'react';
import { metrics, glyphs, renderGlyph, type PivotaWeight } from './render';

export interface PivotaSansProps extends Omit<React.SVGProps<SVGSVGElement>, 'children'> {
  children: string;
  weight?: PivotaWeight;
  italic?: boolean;
  /** rendered height in px (sets the SVG height; width derives from it) */
  fontSize?: number;
  /** letter spacing in em units; default 30 */
  tracking?: number;
}

function weightToStroke(w?: PivotaWeight): number {
  if (typeof w === 'number') return w;
  if (w === 'bold') return metrics.strokes.bold;
  return metrics.strokes.regular;
}

export function PivotaSans({
  children,
  weight = 'regular',
  italic = false,
  fontSize = 64,
  tracking,
  'aria-label': ariaLabel,
  role,
  style,
  ...rest
}: PivotaSansProps): React.ReactElement {
  const stroke = weightToStroke(weight);
  const lsp = tracking ?? metrics.letterSpacing;

  // Walk characters, build path groups + accumulate advance.
  const chars = [...children];
  let x = stroke / 2;
  const groups: React.ReactElement[] = [];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const g = glyphs[ch];
    if (!g) {
      x += metrics.spaceWidth;
      continue;
    }
    const dotScale = stroke / metrics.strokes.regular;

    groups.push(
      <g key={i} transform={`translate(${x},0)`}>
        {g.paths.map((d, j) => (
          <path
            key={`p${j}`}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {g.dots.map(([cx, cy, r], j) => (
          <circle key={`d${j}`} cx={cx} cy={cy} r={r * dotScale} fill="currentColor" />
        ))}
      </g>
    );

    x += g.width;
    if (i < chars.length - 1 && ch !== ' ' && chars[i + 1] !== ' ') {
      x += lsp;
    }
  }

  const totalWidth = x + stroke / 2;
  const vbY = 50;
  const vbH = 1100;

  let inner: React.ReactNode = groups;
  let svgW = totalWidth;

  if (italic) {
    const tan = Math.tan((metrics.italicAngle * Math.PI) / 180);
    const xShift = tan * vbY;
    inner = (
      <g transform={`skewX(${-metrics.italicAngle}) translate(${xShift},0)`}>{groups}</g>
    );
    svgW = totalWidth + tan * (vbY + vbH);
  }

  const heightPx = fontSize * (vbH / 1000);
  const widthPx = (svgW / vbH) * heightPx;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 ${vbY} ${svgW} ${vbH}`}
      width={widthPx}
      height={heightPx}
      role={role ?? 'img'}
      aria-label={ariaLabel ?? children}
      style={{
        overflow: 'visible',
        display: 'inline-block',
        verticalAlign: 'baseline',
        ...style,
      }}
      {...rest}
    >
      {inner}
    </svg>
  );
}
