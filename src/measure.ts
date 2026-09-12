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
