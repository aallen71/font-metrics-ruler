import assert from "node:assert/strict";
import { test } from "node:test";
import { metricsFromTtf } from "./ttf.js";

/**
 * Builds a minimal but structurally real sfnt binary: head, hhea, maxp,
 * hmtx, cmap (format 4), and name tables, wired together the way an actual
 * TTF/OTF file is. Three glyphs: .notdef (0, advance 0), 'A' (1, advance
 * 600), ' ' (2, advance 300).
 */
function buildSyntheticFont(): Uint8Array {
  const buffer = new ArrayBuffer(304);
  const view = new DataView(buffer);

  const tableDir = [
    { tag: "cmap", offset: 108, length: 52 },
    { tag: "head", offset: 160, length: 54 },
    { tag: "hhea", offset: 214, length: 36 },
    { tag: "hmtx", offset: 250, length: 12 },
    { tag: "maxp", offset: 262, length: 6 },
    { tag: "name", offset: 268, length: 36 },
  ];

  view.setUint32(0, 0x00010000); // sfnt version
  view.setUint16(4, tableDir.length);

  let recordOffset = 12;
  for (const entry of tableDir) {
    for (let i = 0; i < 4; i++) view.setUint8(recordOffset + i, entry.tag.charCodeAt(i));
    view.setUint32(recordOffset + 4, 0); // checksum, unchecked by the reader
    view.setUint32(recordOffset + 8, entry.offset);
    view.setUint32(recordOffset + 12, entry.length);
    recordOffset += 16;
  }

  // cmap: one Windows/Unicode-BMP format 4 subtable, mapping ' ' -> glyph 2, 'A' -> glyph 1.
  const cmap = 108;
  view.setUint16(cmap + 2, 1); // numTables
  view.setUint16(cmap + 4, 3); // platformID: Windows
  view.setUint16(cmap + 6, 1); // encodingID: Unicode BMP
  view.setUint32(cmap + 8, 12); // offset to subtable, relative to cmap table start

  const sub = cmap + 12;
  view.setUint16(sub + 0, 4); // format
  view.setUint16(sub + 6, 6); // segCountX2 (3 segments, including the sentinel)
  view.setUint16(sub + 14, 0x20); // endCode[0]
  view.setUint16(sub + 16, 0x41); // endCode[1]
  view.setUint16(sub + 18, 0xffff); // endCode[2] (sentinel)
  view.setUint16(sub + 22, 0x20); // startCode[0]
  view.setUint16(sub + 24, 0x41); // startCode[1]
  view.setUint16(sub + 26, 0xffff); // startCode[2] (sentinel)
  view.setInt16(sub + 28, 2 - 0x20); // idDelta[0]: ' ' -> glyph 2
  view.setInt16(sub + 30, 1 - 0x41); // idDelta[1]: 'A' -> glyph 1
  view.setInt16(sub + 32, 1); // idDelta[2] (sentinel, unused)
  // idRangeOffset[0..2] left at 0

  // head
  const head = 160;
  view.setUint16(head + 18, 1000); // unitsPerEm

  // hhea
  const hhea = 214;
  view.setUint16(hhea + 34, 3); // numOfLongHorMetrics

  // hmtx: glyph0 (.notdef) adv=0, glyph1 ('A') adv=600, glyph2 (' ') adv=300
  const hmtx = 250;
  view.setUint16(hmtx + 4, 600);
  view.setUint16(hmtx + 8, 300);

  // maxp (version 0.5 shape: version + numGlyphs only)
  const maxp = 262;
  view.setUint32(maxp + 0, 0x00005000);
  view.setUint16(maxp + 4, 3); // numGlyphs

  // name: one Windows/Unicode record for nameID 1 ("Test Sans", UTF-16BE)
  const name = 268;
  const familyName = "Test Sans";
  view.setUint16(name + 2, 1); // count
  view.setUint16(name + 4, 18); // stringOffset (6 + 1 record * 12)
  view.setUint16(name + 6, 3); // platformID: Windows
  view.setUint16(name + 8, 1); // encodingID: Unicode BMP
  view.setUint16(name + 10, 0x0409); // languageID: en-US
  view.setUint16(name + 12, 1); // nameID: font family
  view.setUint16(name + 14, familyName.length * 2); // length
  view.setUint16(name + 16, 0); // offset within string storage
  for (let i = 0; i < familyName.length; i++) {
    view.setUint16(name + 18 + i * 2, familyName.charCodeAt(i));
  }

  return new Uint8Array(buffer);
}

test("metricsFromTtf extracts familyName, unitsPerEm, and requested advance widths", () => {
  const metrics = metricsFromTtf(buildSyntheticFont(), { characters: ["A", " ", "z"] });

  assert.equal(metrics.familyName, "Test Sans");
  assert.equal(metrics.unitsPerEm, 1000);
  assert.equal(metrics.defaultAdvanceWidth, 0); // the .notdef glyph's advance width
  assert.equal(metrics.advanceWidths.get("A"), 600);
  assert.equal(metrics.advanceWidths.get(" "), 300);
  assert.equal(metrics.advanceWidths.has("z"), false); // not in this font's cmap
});

test("metricsFromTtf defaults to extracting printable ASCII", () => {
  const metrics = metricsFromTtf(buildSyntheticFont());

  assert.equal(metrics.advanceWidths.get("A"), 600);
  assert.equal(metrics.advanceWidths.get(" "), 300);
  assert.equal(metrics.advanceWidths.has("B"), false);
});

test("metricsFromTtf rejects data that isn't a recognized sfnt file", () => {
  const notAFont = new Uint8Array(12);
  assert.throws(() => metricsFromTtf(notAFont), /not a recognized TTF\/OTF file/);
});

test("metricsFromTtf rejects TrueType/OpenType font collections", () => {
  const ttc = new Uint8Array(12);
  new DataView(ttc.buffer).setUint32(0, 0x74746366); // 'ttcf'
  assert.throws(() => metricsFromTtf(ttc), /font collections/);
});
