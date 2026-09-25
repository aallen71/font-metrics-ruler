import { readFileSync } from "node:fs";
import { parseMetrics } from "./metrics.js";
import { measureTextWidth, truncateToWidth } from "./measure.js";

function usage(): void {
  process.stderr.write(
    "usage: measure-text <metrics.json> <text> <fontSizePx> " +
      "[--letter-spacing px] [--truncate maxWidthPx] [--ellipsis str]\n"
  );
}

function main(argv: readonly string[]): void {
  const [metricsPath, text, fontSizeArg, ...rest] = argv;
  if (!metricsPath || text === undefined || !fontSizeArg) {
    usage();
    process.exitCode = 1;
    return;
  }

  const fontSizePx = Number(fontSizeArg);
  if (!Number.isFinite(fontSizePx) || fontSizePx <= 0) {
    process.stderr.write(`measure-text: fontSizePx must be a positive number, got "${fontSizeArg}"\n`);
    process.exitCode = 1;
    return;
  }

  let letterSpacingPx: number | undefined;
  let maxWidthPx: number | undefined;
  let ellipsis: string | undefined;

  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    const value = rest[i + 1];
    i++;
    if (value === undefined) {
      process.stderr.write(`measure-text: flag "${flag}" requires a value\n`);
      process.exitCode = 1;
      return;
    }

    if (flag === "--letter-spacing") {
      letterSpacingPx = Number(value);
      if (!Number.isFinite(letterSpacingPx)) {
        process.stderr.write(`measure-text: --letter-spacing must be a number, got "${value}"\n`);
        process.exitCode = 1;
        return;
      }
    } else if (flag === "--truncate") {
      maxWidthPx = Number(value);
      if (!Number.isFinite(maxWidthPx)) {
        process.stderr.write(`measure-text: --truncate must be a number, got "${value}"\n`);
        process.exitCode = 1;
        return;
      }
    } else if (flag === "--ellipsis") {
      ellipsis = value;
    } else {
      process.stderr.write(`measure-text: unrecognized flag "${flag}"\n`);
      process.exitCode = 1;
      return;
    }
  }

  const metrics = parseMetrics(readFileSync(metricsPath, "utf8"));
  const options = letterSpacingPx !== undefined ? { letterSpacingPx } : {};

  if (maxWidthPx !== undefined) {
    const truncateOptions = ellipsis !== undefined ? { ...options, ellipsis } : options;
    process.stdout.write(truncateToWidth(metrics, text, fontSizePx, maxWidthPx, truncateOptions) + "\n");
  } else {
    process.stdout.write(measureTextWidth(metrics, text, fontSizePx, options) + "\n");
  }
}

main(process.argv.slice(2));
