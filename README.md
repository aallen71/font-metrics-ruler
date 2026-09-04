# font-metrics-ruler

Answers one question: **how wide will this text render, in pixels, given a
font's metrics?**

Most of the time you don't need this — the browser or your UI toolkit lays
text out for you. But sometimes you need the answer before you have a place
to render anything: truncating a label to fit a fixed-width column server
side, deciding whether a string will overflow a button before you build the
DOM node, or laying out a PDF by hand. Spinning up a headless browser or a
canvas context for that is a lot of machinery for one number.

This library skips the rendering entirely. You give it a small JSON table of
per-character advance widths (extracted once from a font's `hmtx` table, or
written by hand for the characters you actually use) and it does arithmetic.

## Usage

```ts
import { parseMetrics, measureTextWidth } from "font-metrics-ruler";

const metrics = parseMetrics(`{
  "familyName": "Inter",
  "unitsPerEm": 1000,
  "defaultAdvanceWidth": 600,
  "advanceWidths": {
    "H": 722,
    "e": 556,
    "l": 222,
    "o": 611,
    " ": 250
  }
}`);

measureTextWidth(metrics, "Hello", 16);
// -> width in pixels at a 16px font size

measureTextWidth(metrics, "Hello", 16, { letterSpacingPx: 1 });
// -> same, with 1px added between each pair of characters
```

Every character not listed in `advanceWidths` falls back to
`defaultAdvanceWidth`, so you only need to record the characters that appear
in your actual copy.

## How the metrics file is structured

- `unitsPerEm` — the design grid the font was drawn on (commonly 1000 or
  2048). Advance widths are expressed in these units, not pixels.
- `advanceWidths` — how far the cursor moves after drawing each character, in
  font units, keyed by the literal character.
- `defaultAdvanceWidth` — used for any character missing from
  `advanceWidths`.

`measureTextWidth` converts to pixels with
`(sum of advance widths / unitsPerEm) * fontSizePx`, which is the same
arithmetic every text layout engine does internally.

## API

- `parseMetrics(json: string): FontMetrics` — parse and validate a metrics
  JSON document. Throws on malformed JSON or missing/invalid fields.
- `metricsFromRaw(raw: RawFontMetrics): FontMetrics` — same validation, for
  callers who already have a parsed object.
- `measureTextWidth(metrics, text, fontSizePx, options?): number` — the width
  of `text` in pixels at `fontSizePx`.
- `textWidthInUnits(metrics, text): number` — the same measurement in raw
  font units, independent of font size.
- `unitsToPixels(units, metrics, fontSizePx): number` — convert a raw unit
  measurement to pixels.
- `advanceWidthOf(metrics, char): number` — the advance width of a single
  character, in font units.

Every function here is pure: no globals, no I/O, same input always produces
the same output. `FontMetrics` values are immutable once built.

## Building

```
tsc
```

Compiles `src/` to `dist/` per `tsconfig.json`. No dependencies to install
first.

## Testing

```
npm test
```

Compiles, then runs the compiled `*.test.js` files with Node's built-in test
runner (`node --test`). No test framework dependency.

## Status

Early skeleton. See the roadmap in the project notes for what's missing —
notably, there's no tool yet to extract `advanceWidths` from a real font
file, so you currently have to build that JSON by hand or from another
utility.

## License

MIT, see [LICENSE](LICENSE).
