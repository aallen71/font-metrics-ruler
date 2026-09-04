import assert from "node:assert/strict";
import { test } from "node:test";
import type { FontMetrics } from "./metrics.js";
import { advanceWidthOf, measureTextWidth, textWidthInUnits, unitsToPixels } from "./measure.js";

const metrics: FontMetrics = {
  familyName: "Test Sans",
  unitsPerEm: 1000,
  defaultAdvanceWidth: 500,
  advanceWidths: new Map([
    ["H", 700],
    ["i", 200],
    [" ", 250],
    ["\u{1F600}", 900], // grinning face, outside the BMP
  ]),
};

test("advanceWidthOf returns the recorded width", () => {
  assert.equal(advanceWidthOf(metrics, "H"), 700);
});

test("advanceWidthOf falls back to defaultAdvanceWidth for unknown characters", () => {
  assert.equal(advanceWidthOf(metrics, "z"), 500);
});

test("textWidthInUnits sums per-character widths", () => {
  assert.equal(textWidthInUnits(metrics, "Hi"), 700 + 200);
});

test("textWidthInUnits is 0 for an empty string", () => {
  assert.equal(textWidthInUnits(metrics, ""), 0);
});

test("textWidthInUnits counts a character outside the BMP once, by code point", () => {
  assert.equal(textWidthInUnits(metrics, "\u{1F600}"), 900);
});

test("unitsToPixels scales by fontSize / unitsPerEm", () => {
  assert.equal(unitsToPixels(1000, metrics, 16), 16);
  assert.equal(unitsToPixels(500, metrics, 16), 8);
});

test("measureTextWidth converts summed advance widths to pixels", () => {
  const widthPx = measureTextWidth(metrics, "Hi", 10);
  assert.equal(widthPx, ((700 + 200) / 1000) * 10);
});

test("measureTextWidth adds letterSpacingPx between characters, not before or after", () => {
  const withoutSpacing = measureTextWidth(metrics, "Hi", 10);
  const withSpacing = measureTextWidth(metrics, "Hi", 10, { letterSpacingPx: 2 });
  assert.equal(withSpacing, withoutSpacing + 2);
});

test("measureTextWidth adds no letterSpacingPx for a single character", () => {
  const withoutSpacing = measureTextWidth(metrics, "H", 10);
  const withSpacing = measureTextWidth(metrics, "H", 10, { letterSpacingPx: 2 });
  assert.equal(withSpacing, withoutSpacing);
});

test("measureTextWidth treats a code point outside the BMP as a single character for spacing", () => {
  const text = "H\u{1F600}";
  const widthPx = measureTextWidth(metrics, text, 10, { letterSpacingPx: 3 });
  assert.equal(widthPx, ((700 + 900) / 1000) * 10 + 3);
});

test("measureTextWidth throws for a non-positive fontSizePx", () => {
  assert.throws(() => measureTextWidth(metrics, "Hi", 0), /fontSizePx must be positive/);
  assert.throws(() => measureTextWidth(metrics, "Hi", -1), /fontSizePx must be positive/);
});
