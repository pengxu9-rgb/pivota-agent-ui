/**
 * Pivota Sans — renderer (TypeScript)
 *
 * Pure functions. No React, no DOM. Returns SVG strings + numeric
 * bounds so callers can decide how to mount (innerHTML, dangerouslySet,
 * RSC, server-side rasterizer, OG image generator, etc).
 */

import { glyphs, metrics, type PivotaGlyph } from './glyphs';

export type PivotaWeight = 'regular' | 'bold' | number;

export interface PivotaRenderOptions {
  /** stroke width in em units; "regular" = 90, "bold" = 160, or a number */
  weight?: PivotaWeight;
  /** apply 12° skew */
  italic?: boolean;
  /** rendered height in px (sets the SVG height; width scales from it) */
  fontSize?: number;
  /** CSS color string; defaults to `currentColor` */
  color?: string;
  /** letter spacing in em units; defaults to metrics.letterSpacing (30) */
  tracking?: number;
}

export interface RenderedGlyph {
  /** inner SVG markup (<path/>, <circle/>) */
  svg: string;
  /** advance width in em units */
  width: number;
  /** whether the character was missing from the font */
  missing?: boolean;
}

export interface RenderedText {
  /** complete <svg>...</svg> string */
  svg: string;
  /** pixel width of the rendered text */
  width: number;
  /** pixel height of the rendered text */
  height: number;
}

function weightFromOpts(w?: PivotaWeight): number {
  if (typeof w === 'number') return w;
  if (w === 'bold') return metrics.strokes.bold;
  return metrics.strokes.regular;
}

/**
 * Render one glyph. Returns the inner SVG markup (caller wraps in <svg>).
 */
export function renderGlyph(ch: string, opts: PivotaRenderOptions = {}): RenderedGlyph {
  const g: PivotaGlyph | undefined = glyphs[ch];
  if (!g) return { svg: '', width: metrics.spaceWidth, missing: true };

  const stroke = weightFromOpts(opts.weight);
  const dotScale = stroke / metrics.strokes.regular;

  const paths = g.paths
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/>`
    )
    .join('');

  const dots = g.dots
    .map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r * dotScale}" fill="currentColor"/>`)
    .join('');

  return { svg: paths + dots, width: g.width };
}

/**
 * Render a full text string to a complete <svg>...</svg> string.
 *
 * The returned SVG sets `style="color: ..."` so descendant
 * `stroke="currentColor"` and `fill="currentColor"` inherit it. Pass
 * `color: "currentColor"` to inherit from the React parent.
 */
export function renderText(str: string, opts: PivotaRenderOptions = {}): RenderedText {
  const stroke = weightFromOpts(opts.weight);
  const italic = !!opts.italic;
  const tracking = opts.tracking ?? metrics.letterSpacing;
  const fontSize = opts.fontSize ?? 80;
  const color = opts.color ?? 'currentColor';

  const chars = [...str];
  let x = stroke / 2;
  const parts: string[] = [];

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const g = renderGlyph(ch, opts);
    parts.push(`<g transform="translate(${x},0)">${g.svg}</g>`);
    x += g.width;
    if (i < chars.length - 1 && ch !== ' ' && chars[i + 1] !== ' ') {
      x += tracking;
    }
  }

  const totalWidth = x + stroke / 2;
  const vbY = 50;
  const vbH = 1100;

  let inner = parts.join('');
  let svgW = totalWidth;

  if (italic) {
    const tan = Math.tan((metrics.italicAngle * Math.PI) / 180);
    const xShift = tan * vbY;
    inner = `<g transform="skewX(${-metrics.italicAngle}) translate(${xShift},0)">${inner}</g>`;
    svgW = totalWidth + tan * (vbY + vbH);
  }

  const heightPx = fontSize * (vbH / 1000);
  const widthPx = (svgW / vbH) * heightPx;

  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${vbY} ${svgW} ${vbH}" width="${widthPx}" height="${heightPx}" style="color:${color};overflow:visible;display:inline-block;vertical-align:baseline;">${inner}</svg>`,
    width: widthPx,
    height: heightPx,
  };
}

export { metrics, glyphs };
