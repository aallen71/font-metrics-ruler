import assert from "node:assert/strict";
import { test } from "node:test";
import { metricsFromRaw, parseMetrics } from "./metrics.js";

const validRaw = {
  familyName: "Inter",
  unitsPerEm: 1000,
  defaultAdvanceWidth: 600,
  advanceWidths: { H: 722, e: 556, l: 222, o: 611, " ": 250 },
};

test("parseMetrics parses a valid document", () => {
  const metrics = parseMetrics(JSON.stringify(validRaw));
  assert.equal(metrics.familyName, "Inter");
  assert.equal(metrics.unitsPerEm, 1000);
  assert.equal(metrics.defaultAdvanceWidth, 600);
  assert.equal(metrics.advanceWidths.get("H"), 722);
  assert.equal(metrics.advanceWidths.get("z"), undefined);
});

test("parseMetrics throws on malformed JSON", () => {
  assert.throws(() => parseMetrics("{not json"), /invalid JSON/);
});

test("metricsFromRaw rejects a missing familyName", () => {
  assert.throws(
    () => metricsFromRaw({ ...validRaw, familyName: "" }),
    /familyName is required/
  );
});

test("metricsFromRaw rejects a non-positive unitsPerEm", () => {
  assert.throws(
    () => metricsFromRaw({ ...validRaw, unitsPerEm: 0 }),
    /unitsPerEm must be a positive number/
  );
});

test("metricsFromRaw rejects a negative defaultAdvanceWidth", () => {
  assert.throws(
    () => metricsFromRaw({ ...validRaw, defaultAdvanceWidth: -1 }),
    /defaultAdvanceWidth must be a non-negative number/
  );
});

test("metricsFromRaw rejects a non-object advanceWidths", () => {
  assert.throws(
    () => metricsFromRaw({ ...validRaw, advanceWidths: null as unknown as Record<string, number> }),
    /advanceWidths must be an object/
  );
});

test("metricsFromRaw rejects a negative advance width for a character", () => {
  assert.throws(
    () => metricsFromRaw({ ...validRaw, advanceWidths: { H: -5 } }),
    /advance width for "H" must be a non-negative number/
  );
});

test("metricsFromRaw defaults to an empty kerningPairs map when omitted", () => {
  const metrics = metricsFromRaw(validRaw);
  assert.equal(metrics.kerningPairs.size, 0);
});

test("metricsFromRaw parses nested kerningPairs", () => {
  const metrics = metricsFromRaw({ ...validRaw, kerningPairs: { A: { V: -80 } } });
  assert.equal(metrics.kerningPairs.get("A")?.get("V"), -80);
});

test("metricsFromRaw rejects a non-object kerningPairs", () => {
  assert.throws(
    () => metricsFromRaw({ ...validRaw, kerningPairs: "nope" as unknown as Record<string, Record<string, number>> }),
    /kerningPairs must be an object/
  );
});

test("metricsFromRaw rejects a non-object kerningPairs entry", () => {
  assert.throws(
    () =>
      metricsFromRaw({
        ...validRaw,
        kerningPairs: { A: -80 } as unknown as Record<string, Record<string, number>>,
      }),
    /kerningPairs\["A"\] must be an object/
  );
});

test("metricsFromRaw rejects a non-finite kerning adjustment", () => {
  assert.throws(
    () => metricsFromRaw({ ...validRaw, kerningPairs: { A: { V: NaN } } }),
    /kerning adjustment for "A" \+ "V" must be a finite number/
  );
});
