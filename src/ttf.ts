import type { FontMetrics, RawFontMetrics } from "./metrics.js";
import { metricsFromRaw } from "./metrics.js";

export interface TtfExtractOptions {
  /** Characters to extract advance widths for. Defaults to printable ASCII (0x20-0x7E). */
  readonly characters?: Iterable<string>;
}

const DEFAULT_CHARACTERS = printableAscii();

function printableAscii(): readonly string[] {
  const chars: string[] = [];
  for (let code = 0x20; code <= 0x7e; code++) {
    chars.push(String.fromCharCode(code));
  }
  return chars;
}

interface SfntTable {
  readonly offset: number;
  readonly length: number;
}

interface Sfnt {
  readonly view: DataView;
  readonly tables: ReadonlyMap<string, SfntTable>;
}

/**
 * Reads a TrueType/OpenType font's per-character advance widths straight out
 * of its binary tables, no font-rendering library involved.
 *
 * `defaultAdvanceWidth` comes from glyph 0, the font's .notdef glyph — that's
 * the glyph that would actually render for a character missing from
 * `advanceWidths`, so its width is the most honest fallback available.
 */
export function metricsFromTtf(data: Uint8Array, options: TtfExtractOptions = {}): FontMetrics {
  const sfnt = readSfnt(data);
  const unitsPerEm = readUnitsPerEm(sfnt);
  const advanceWidthsByGlyph = readAdvanceWidths(sfnt);
  const cmap = readCmap(sfnt);
  const familyName = readFamilyName(sfnt);

  const defaultAdvanceWidth = advanceWidthsByGlyph[0] ?? 0;

  const advanceWidths: Record<string, number> = {};
  for (const char of options.characters ?? DEFAULT_CHARACTERS) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) continue;

    const glyphId = cmap.get(codePoint);
    if (glyphId === undefined) continue;

    const width = advanceWidthsByGlyph[glyphId];
    if (width === undefined) continue;

    advanceWidths[char] = width;
  }

  const raw: RawFontMetrics = { familyName, unitsPerEm, defaultAdvanceWidth, advanceWidths };
  return metricsFromRaw(raw);
}

function readSfnt(data: Uint8Array): Sfnt {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const sfntVersion = view.getUint32(0);

  if (sfntVersion === 0x74746366 /* 'ttcf' */) {
    throw new Error("font extraction: TrueType/OpenType font collections (.ttc) are not supported");
  }
  const isKnownVersion =
    sfntVersion === 0x00010000 || sfntVersion === 0x4f54544f /* 'OTTO' */ || sfntVersion === 0x74727565 /* 'true' */;
  if (!isKnownVersion) {
    throw new Error("font extraction: not a recognized TTF/OTF file");
  }

  const numTables = view.getUint16(4);
  const tables = new Map<string, SfntTable>();
  let recordOffset = 12;
  for (let i = 0; i < numTables; i++) {
    const tag = readTag(view, recordOffset);
    const offset = view.getUint32(recordOffset + 8);
    const length = view.getUint32(recordOffset + 12);
    tables.set(tag, { offset, length });
    recordOffset += 16;
  }
  return { view, tables };
}

function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function requireTable(sfnt: Sfnt, tag: string): SfntTable {
  const table = sfnt.tables.get(tag);
  if (!table) {
    throw new Error(`font extraction: missing required "${tag}" table`);
  }
  return table;
}

function readUnitsPerEm(sfnt: Sfnt): number {
  const head = requireTable(sfnt, "head");
  return sfnt.view.getUint16(head.offset + 18);
}

function readNumGlyphs(sfnt: Sfnt): number {
  const maxp = requireTable(sfnt, "maxp");
  return sfnt.view.getUint16(maxp.offset + 4);
}

function readNumLongHorMetrics(sfnt: Sfnt): number {
  const hhea = requireTable(sfnt, "hhea");
  return sfnt.view.getUint16(hhea.offset + 34);
}

/** Advance width of every glyph, in font units, indexed by glyph ID. */
function readAdvanceWidths(sfnt: Sfnt): readonly number[] {
  const hmtx = requireTable(sfnt, "hmtx");
  const numLongHorMetrics = readNumLongHorMetrics(sfnt);
  const numGlyphs = readNumGlyphs(sfnt);

  const widths: number[] = [];
  let offset = hmtx.offset;
  for (let i = 0; i < numLongHorMetrics; i++) {
    widths.push(sfnt.view.getUint16(offset));
    offset += 4; // advanceWidth (uint16) + leftSideBearing (int16)
  }

  // Glyphs past numLongHorMetrics reuse the last recorded advance width;
  // only their (irrelevant here) leftSideBearing varies.
  const lastWidth = widths[widths.length - 1] ?? 0;
  for (let i = numLongHorMetrics; i < numGlyphs; i++) {
    widths.push(lastWidth);
  }

  return widths;
}

/** Maps Unicode code points to glyph IDs via the font's cmap table. */
function readCmap(sfnt: Sfnt): ReadonlyMap<number, number> {
  const cmap = requireTable(sfnt, "cmap");
  const view = sfnt.view;
  const numSubtables = view.getUint16(cmap.offset + 2);

  let bestOffset = -1;
  let bestScore = -1;
  for (let i = 0; i < numSubtables; i++) {
    const recordOffset = cmap.offset + 4 + i * 8;
    const platformId = view.getUint16(recordOffset);
    const encodingId = view.getUint16(recordOffset + 2);
    const subtableOffset = view.getUint32(recordOffset + 4);
    const score = cmapSubtableScore(platformId, encodingId);
    if (score > bestScore) {
      bestScore = score;
      bestOffset = cmap.offset + subtableOffset;
    }
  }
  if (bestOffset < 0) {
    throw new Error("font extraction: no usable cmap subtable found");
  }

  const format = view.getUint16(bestOffset);
  if (format === 4) return readCmapFormat4(view, bestOffset);
  if (format === 12) return readCmapFormat12(view, bestOffset);
  if (format === 0) return readCmapFormat0(view, bestOffset);
  throw new Error(`font extraction: unsupported cmap format ${format}`);
}

/** Higher is preferred. Favors full-Unicode subtables over BMP-only or Mac Roman ones. */
function cmapSubtableScore(platformId: number, encodingId: number): number {
  if (platformId === 3 && encodingId === 10) return 5; // Windows, UCS-4
  if (platformId === 0 && (encodingId === 4 || encodingId === 6)) return 5; // Unicode, full repertoire
  if (platformId === 3 && encodingId === 1) return 4; // Windows, UCS-2 (BMP)
  if (platformId === 0) return 3; // Unicode, BMP
  if (platformId === 1 && encodingId === 0) return 1; // Mac Roman
  return 0;
}

function readCmapFormat0(view: DataView, offset: number): ReadonlyMap<number, number> {
  const map = new Map<number, number>();
  for (let code = 0; code < 256; code++) {
    const glyphId = view.getUint8(offset + 6 + code);
    if (glyphId !== 0) map.set(code, glyphId);
  }
  return map;
}

function readCmapFormat4(view: DataView, offset: number): ReadonlyMap<number, number> {
  const segCountX2 = view.getUint16(offset + 6);
  const segCount = segCountX2 / 2;
  const endCodeOffset = offset + 14;
  const startCodeOffset = endCodeOffset + segCountX2 + 2; // +2 skips reservedPad
  const idDeltaOffset = startCodeOffset + segCountX2;
  const idRangeOffsetOffset = idDeltaOffset + segCountX2;

  const map = new Map<number, number>();
  for (let seg = 0; seg < segCount; seg++) {
    const endCode = view.getUint16(endCodeOffset + seg * 2);
    const startCode = view.getUint16(startCodeOffset + seg * 2);
    if (startCode === 0xffff && endCode === 0xffff) continue; // sentinel segment

    const idDelta = view.getInt16(idDeltaOffset + seg * 2);
    const idRangeOffset = view.getUint16(idRangeOffsetOffset + seg * 2);

    for (let code = startCode; code <= endCode; code++) {
      let glyphId: number;
      if (idRangeOffset === 0) {
        glyphId = (code + idDelta) & 0xffff;
      } else {
        // Per the OpenType spec, the glyph index address is relative to the
        // idRangeOffset field's own position, not the start of the table.
        const fieldAddress = idRangeOffsetOffset + seg * 2;
        const rawGlyphId = view.getUint16(fieldAddress + idRangeOffset + (code - startCode) * 2);
        glyphId = rawGlyphId === 0 ? 0 : (rawGlyphId + idDelta) & 0xffff;
      }
      if (glyphId !== 0) map.set(code, glyphId);
    }
  }
  return map;
}

function readCmapFormat12(view: DataView, offset: number): ReadonlyMap<number, number> {
  const numGroups = view.getUint32(offset + 12);
  const map = new Map<number, number>();
  let groupOffset = offset + 16;
  for (let i = 0; i < numGroups; i++) {
    const startCharCode = view.getUint32(groupOffset);
    const endCharCode = view.getUint32(groupOffset + 4);
    const startGlyphId = view.getUint32(groupOffset + 8);
    for (let code = startCharCode; code <= endCharCode; code++) {
      map.set(code, startGlyphId + (code - startCharCode));
    }
    groupOffset += 12;
  }
  return map;
}

function readFamilyName(sfnt: Sfnt): string {
  const name = requireTable(sfnt, "name");
  const view = sfnt.view;
  const count = view.getUint16(name.offset + 2);
  const stringStorageOffset = name.offset + view.getUint16(name.offset + 4);

  let bestScore = -1;
  let bestRecord: { readonly platformId: number; readonly offset: number; readonly length: number } | null = null;

  for (let i = 0; i < count; i++) {
    const recordOffset = name.offset + 6 + i * 12;
    const platformId = view.getUint16(recordOffset);
    const nameId = view.getUint16(recordOffset + 6);
    if (nameId !== 1 /* font family name */) continue;

    const score = platformId === 3 || platformId === 0 ? 2 : platformId === 1 ? 1 : 0;
    if (score > bestScore) {
      bestScore = score;
      const length = view.getUint16(recordOffset + 8);
      const stringOffset = view.getUint16(recordOffset + 10);
      bestRecord = { platformId, offset: stringStorageOffset + stringOffset, length };
    }
  }
  if (!bestRecord) {
    throw new Error('font extraction: no family name (nameID 1) found in "name" table');
  }

  return decodeNameString(view, bestRecord.offset, bestRecord.length, bestRecord.platformId);
}

function decodeNameString(view: DataView, offset: number, length: number, platformId: number): string {
  let result = "";
  if (platformId === 1) {
    // Macintosh platform records are single-byte (Mac Roman); the printable
    // ASCII range used by family names matches Unicode code points directly.
    for (let i = 0; i < length; i++) {
      result += String.fromCharCode(view.getUint8(offset + i));
    }
  } else {
    // Windows (3) and Unicode (0) platform records are UTF-16BE.
    for (let i = 0; i < length; i += 2) {
      result += String.fromCharCode(view.getUint16(offset + i));
    }
  }
  return result;
}
