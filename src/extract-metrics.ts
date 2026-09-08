import { readFileSync } from "node:fs";
import { metricsFromTtf } from "./ttf.js";

function main(argv: readonly string[]): void {
  const fontPath = argv[0];
  if (!fontPath) {
    process.stderr.write("usage: extract-metrics <font.ttf|font.otf> [characters]\n");
    process.exitCode = 1;
    return;
  }

  const characterArg = argv[1];
  const fontData = readFileSync(fontPath);
  const metrics = metricsFromTtf(fontData, characterArg ? { characters: Array.from(characterArg) } : {});

  process.stdout.write(
    JSON.stringify(
      {
        familyName: metrics.familyName,
        unitsPerEm: metrics.unitsPerEm,
        defaultAdvanceWidth: metrics.defaultAdvanceWidth,
        advanceWidths: Object.fromEntries(metrics.advanceWidths),
      },
      null,
      2
    ) + "\n"
  );
}

main(process.argv.slice(2));
