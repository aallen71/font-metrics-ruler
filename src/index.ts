export type { FontMetrics, RawFontMetrics } from "./metrics.js";
export { parseMetrics, metricsFromRaw } from "./metrics.js";

export type { MeasureOptions, TruncateOptions } from "./measure.js";
export {
  measureTextWidth,
  textWidthInUnits,
  unitsToPixels,
  advanceWidthOf,
  kerningAdjustmentOf,
  truncateToWidth,
} from "./measure.js";

export type { TtfExtractOptions } from "./ttf.js";
export { metricsFromTtf } from "./ttf.js";
