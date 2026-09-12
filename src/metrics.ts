/**
 * A minimal, font-agnostic description of glyph advance widths.
 *
 * This is not a font format. It's a small JSON shape meant to be produced
 * once (e.g. by reading a TTF/OTF's hmtx table, or by hand for a handful of
 * characters you care about) and then queried many times without ever
 * touching the original font file again.
 */
export interface FontMetrics {
  readonly familyName: string;
  /** Design-space units per em, e.g. 1000 or 2048. Defines the scale of advanceWidths. */
  readonly unitsPerEm: number;
  /** Advance width, in font units, used for any character not present in advanceWidths. */
  readonly defaultAdvanceWidth: number;
  /** Advance width in font units, keyed by single character. */
  readonly advanceWidths: ReadonlyMap<string, number>;
  /**
   * Per-pair adjustment to the gap between two adjacent characters, in font
   * units, keyed by the left character then the right character. Negative
   * values pull characters closer together (e.g. "AV"), positive values push
   * them apart. Pairs not present here have no adjustment.
   */
  readonly kerningPairs: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

export interface RawFontMetrics {
  familyName: string;
  unitsPerEm: number;
  defaultAdvanceWidth: number;
  advanceWidths: Record<string, number>;
  kerningPairs?: Record<string, Record<string, number>>;
}

/**
 * Parses a JSON string into FontMetrics. Throws on malformed JSON or a shape
 * that doesn't match RawFontMetrics.
 */
export function parseMetrics(json: string): FontMetrics {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (err) {
    throw new Error(`font metrics: invalid JSON (${(err as Error).message})`);
  }
  return metricsFromRaw(raw as RawFontMetrics);
}

/**
 * Validates and converts a plain object (e.g. already-parsed JSON) into
 * FontMetrics. Kept separate from parseMetrics so callers who already have
 * an object don't have to round-trip through JSON.stringify/parse.
 */
export function metricsFromRaw(raw: RawFontMetrics): FontMetrics {
  if (typeof raw.familyName !== "string" || raw.familyName.length === 0) {
    throw new Error("font metrics: familyName is required");
  }
  if (typeof raw.unitsPerEm !== "number" || !(raw.unitsPerEm > 0)) {
    throw new Error("font metrics: unitsPerEm must be a positive number");
  }
  if (typeof raw.defaultAdvanceWidth !== "number" || !(raw.defaultAdvanceWidth >= 0)) {
    throw new Error("font metrics: defaultAdvanceWidth must be a non-negative number");
  }
  if (typeof raw.advanceWidths !== "object" || raw.advanceWidths === null) {
    throw new Error("font metrics: advanceWidths must be an object");
  }

  const advanceWidths = new Map<string, number>();
  for (const [char, width] of Object.entries(raw.advanceWidths)) {
    if (typeof width !== "number" || !(width >= 0)) {
      throw new Error(`font metrics: advance width for "${char}" must be a non-negative number`);
    }
    advanceWidths.set(char, width);
  }

  const kerningPairs = new Map<string, ReadonlyMap<string, number>>();
  if (raw.kerningPairs !== undefined) {
    if (typeof raw.kerningPairs !== "object" || raw.kerningPairs === null) {
      throw new Error("font metrics: kerningPairs must be an object");
    }
    for (const [left, rightAdjustments] of Object.entries(raw.kerningPairs)) {
      if (typeof rightAdjustments !== "object" || rightAdjustments === null) {
        throw new Error(`font metrics: kerningPairs["${left}"] must be an object`);
      }
      const adjustments = new Map<string, number>();
      for (const [right, adjustment] of Object.entries(rightAdjustments)) {
        if (typeof adjustment !== "number" || !Number.isFinite(adjustment)) {
          throw new Error(`font metrics: kerning adjustment for "${left}" + "${right}" must be a finite number`);
        }
        adjustments.set(right, adjustment);
      }
      kerningPairs.set(left, adjustments);
    }
  }

  return {
    familyName: raw.familyName,
    unitsPerEm: raw.unitsPerEm,
    defaultAdvanceWidth: raw.defaultAdvanceWidth,
    advanceWidths,
    kerningPairs,
  };
}
