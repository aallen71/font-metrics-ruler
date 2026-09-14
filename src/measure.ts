import type { FontMetrics } from "./metrics.js";

export interface MeasureOptions {
  /** Extra space, in pixels, inserted between each pair of characters. */
  readonly letterSpacingPx?: number;
}

/** Advance width of a single character, in font units, falling back to the font's default. */
export function advanceWidthOf(metrics: FontMetrics, char: string): number {
  return metrics.advanceWidths.get(char) ?? metrics.defaultAdvanceWidth;
}

/** Kerning adjustment between a pair of adjacent characters, in font units, or 0 if the pair has none. */
export function kerningAdjustmentOf(metrics: FontMetrics, left: string, right: string): number {
  return metrics.kerningPairs.get(left)?.get(right) ?? 0;
}

/**
 * Total advance width of a string, in font units, including any kerning
 * adjustments between adjacent character pairs. Size-independent: multiply
 * by a font size and divide by unitsPerEm (see unitsToPixels) to get pixels.
 */
export function textWidthInUnits(metrics: FontMetrics, text: string): number {
  let total = 0;
  let previous: string | undefined;
  for (const char of text) {
    total += advanceWidthOf(metrics, char);
    if (previous !== undefined) {
      total += kerningAdjustmentOf(metrics, previous, char);
    }
    previous = char;
  }
  return total;
}

export function unitsToPixels(units: number, metrics: FontMetrics, fontSizePx: number): number {
  return (units / metrics.unitsPerEm) * fontSizePx;
}

/**
 * The question this library exists to answer: how wide, in pixels, will
 * `text` render at `fontSizePx` using `metrics`? Includes kerning
 * adjustments from `metrics.kerningPairs` between adjacent characters.
 *
 * Iterates by Unicode code point (not UTF-16 code unit) so characters
 * outside the BMP are counted once, matching how advanceWidths is keyed.
 */
export function measureTextWidth(
  metrics: FontMetrics,
  text: string,
  fontSizePx: number,
  options: MeasureOptions = {}
): number {
  if (!(fontSizePx > 0)) {
    throw new Error("measureTextWidth: fontSizePx must be positive");
  }

  const glyphWidthPx = unitsToPixels(textWidthInUnits(metrics, text), metrics, fontSizePx);
  const letterSpacingPx = options.letterSpacingPx ?? 0;
  const gapCount = Math.max(codePointCount(text) - 1, 0);

  return glyphWidthPx + gapCount * letterSpacingPx;
}

function codePointCount(text: string): number {
  let count = 0;
  for (const _ of text) count++;
  return count;
}

export interface TruncateOptions extends MeasureOptions {
  /** Appended to a truncated string. Defaults to "…". Pass "" to truncate without one. */
  readonly ellipsis?: string;
}

/**
 * Returns `text` unchanged if it already fits within `maxWidthPx`, otherwise
 * the longest leading slice that fits alongside `options.ellipsis` (default
 * "…"), with that ellipsis appended. Returns "" if even the ellipsis alone
 * doesn't fit.
 *
 * Walks code points once, reusing the same per-character width and kerning
 * math as measureTextWidth, so a prefix's width is exact rather than an
 * estimate from average character width.
 */
export function truncateToWidth(
  metrics: FontMetrics,
  text: string,
  fontSizePx: number,
  maxWidthPx: number,
  options: TruncateOptions = {}
): string {
  if (!(fontSizePx > 0)) {
    throw new Error("truncateToWidth: fontSizePx must be positive");
  }
  if (!(maxWidthPx >= 0)) {
    throw new Error("truncateToWidth: maxWidthPx must not be negative");
  }

  if (measureTextWidth(metrics, text, fontSizePx, options) <= maxWidthPx) {
    return text;
  }

  const ellipsis = options.ellipsis ?? "…";
  const ellipsisWidthPx = ellipsis.length > 0 ? measureTextWidth(metrics, ellipsis, fontSizePx, options) : 0;
  if (ellipsisWidthPx > maxWidthPx) {
    return "";
  }

  const budgetPx = maxWidthPx - ellipsisWidthPx;
  const letterSpacingPx = options.letterSpacingPx ?? 0;
  const chars = Array.from(text);

  let widthPx = 0;
  let previous: string | undefined;
  let fitCount = 0;

  for (const char of chars) {
    const unitsWidth = advanceWidthOf(metrics, char) + (previous === undefined ? 0 : kerningAdjustmentOf(metrics, previous, char));
    const gapPx = fitCount > 0 ? letterSpacingPx : 0;
    const candidateWidthPx = widthPx + unitsToPixels(unitsWidth, metrics, fontSizePx) + gapPx;
    if (candidateWidthPx > budgetPx) {
      break;
    }
    widthPx = candidateWidthPx;
    previous = char;
    fitCount++;
  }

  return chars.slice(0, fitCount).join("") + ellipsis;
}
