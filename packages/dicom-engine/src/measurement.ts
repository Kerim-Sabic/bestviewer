import {
  AngleTool,
  BidirectionalTool,
  LengthTool,
  ProbeTool,
  RectangleROITool
} from "@cornerstonejs/tools";
import { z } from "zod";

import { AnnotationUid } from "./brand";

/**
 * The measurement tools this engine exposes to the UI, named in domain terms so
 * the UI never has to know Cornerstone's internal tool-name strings.
 */
export const MEASUREMENT_TOOL_NAMES = [
  "length",
  "probe",
  "rectangleRoi",
  "bidirectional",
  "angle"
] as const;

export type MeasurementToolName = (typeof MEASUREMENT_TOOL_NAMES)[number];

/**
 * A normalized, render-ready measurement. The `unit` / `areaUnit` strings are
 * surfaced exactly as the tool computed them: Cornerstone emits `mm`/`mm²` only
 * when `PixelSpacing` is present and `px`/`px²` when the image is uncalibrated.
 * We never convert or fabricate millimetres — honesty about calibration is a
 * clinical-safety requirement, not a formatting detail.
 */
export type Measurement =
  | {
      readonly toolName: "length";
      readonly uid: AnnotationUid;
      readonly label: string;
      readonly length: number;
      readonly unit: string;
    }
  | {
      readonly toolName: "probe";
      readonly uid: AnnotationUid;
      readonly label: string;
      readonly value: number;
      readonly modality: string;
    }
  | {
      readonly toolName: "rectangleRoi";
      readonly uid: AnnotationUid;
      readonly label: string;
      readonly area: number;
      readonly areaUnit: string;
      readonly mean: number;
      readonly stdDev: number;
      readonly max: number;
      readonly modality: string;
    }
  | {
      readonly toolName: "bidirectional";
      readonly uid: AnnotationUid;
      readonly label: string;
      readonly length: number;
      readonly width: number;
      readonly unit: string;
    }
  | {
      readonly toolName: "angle";
      readonly uid: AnnotationUid;
      readonly label: string;
      readonly angleDegrees: number;
    };

const CORNERSTONE_TOOL_NAME_BY_DOMAIN: Record<MeasurementToolName, string> = {
  length: LengthTool.toolName,
  probe: ProbeTool.toolName,
  rectangleRoi: RectangleROITool.toolName,
  bidirectional: BidirectionalTool.toolName,
  angle: AngleTool.toolName
};

const DOMAIN_BY_CORNERSTONE_TOOL_NAME = new Map<string, MeasurementToolName>(
  MEASUREMENT_TOOL_NAMES.map((domain): [string, MeasurementToolName] => [
    CORNERSTONE_TOOL_NAME_BY_DOMAIN[domain],
    domain
  ])
);

export function toCornerstoneToolName(tool: MeasurementToolName): string {
  return CORNERSTONE_TOOL_NAME_BY_DOMAIN[tool];
}

export function isMeasurementToolName(value: string): value is MeasurementToolName {
  return DOMAIN_BY_CORNERSTONE_TOOL_NAME.has(value);
}

/**
 * Cornerstone keys `cachedStats` by a target id (the image/volume the stats were
 * computed against). For a stack viewport an annotation has a single target, so
 * the first entry is the one to read; the per-tool schemas below validate it.
 */
const annotationEnvelope = z.object({
  annotationUID: z.string(),
  metadata: z.object({ toolName: z.string() }).optional(),
  data: z.object({
    label: z.string().optional(),
    cachedStats: z.record(z.string(), z.unknown()).optional()
  })
});

// Pixel-value statistics are scalar for grayscale data but arrive as a
// per-channel array for RGB images (e.g. color ultrasound). Accept both and
// normalize with firstChannel() below.
const channelValue = z.union([z.number(), z.array(z.number()).min(1)]);

const lengthStats = z.object({ length: z.number(), unit: z.string() });
const probeStats = z.object({ value: channelValue, Modality: z.string().default("") });
const roiStats = z.object({
  area: z.number(),
  areaUnit: z.string(),
  mean: channelValue,
  stdDev: channelValue,
  max: channelValue,
  Modality: z.string().default("")
});
const bidirectionalStats = z.object({
  length: z.number(),
  width: z.number(),
  unit: z.string()
});
const angleStats = z.object({ angle: z.number() });

/**
 * Map a raw Cornerstone annotation to a normalized {@link Measurement}, or
 * `null` when it is not one of our measurement tools or its statistics have not
 * been computed yet (e.g. on `ANNOTATION_ADDED`, before the first render). A
 * later `ANNOTATION_MODIFIED` carries the computed stats and yields the value.
 */
export function toMeasurement(input: unknown): Measurement | null {
  const parsed = annotationEnvelope.safeParse(input);

  if (!parsed.success) {
    return null;
  }

  const toolName = parsed.data.metadata?.toolName;

  if (toolName === undefined) {
    return null;
  }

  const domain = DOMAIN_BY_CORNERSTONE_TOOL_NAME.get(toolName);

  if (domain === undefined) {
    return null;
  }

  const firstStats = firstValue(parsed.data.data.cachedStats);

  if (firstStats === undefined) {
    return null;
  }

  const uid = AnnotationUid(parsed.data.annotationUID);
  const label = parsed.data.data.label ?? "";

  switch (domain) {
    case "length": {
      const stats = lengthStats.safeParse(firstStats);
      return stats.success
        ? { toolName: "length", uid, label, length: stats.data.length, unit: stats.data.unit }
        : null;
    }
    case "probe": {
      const stats = probeStats.safeParse(firstStats);
      return stats.success
        ? {
            toolName: "probe",
            uid,
            label,
            value: firstChannel(stats.data.value),
            modality: stats.data.Modality
          }
        : null;
    }
    case "rectangleRoi": {
      const stats = roiStats.safeParse(firstStats);
      return stats.success
        ? {
            toolName: "rectangleRoi",
            uid,
            label,
            area: stats.data.area,
            areaUnit: stats.data.areaUnit,
            mean: firstChannel(stats.data.mean),
            stdDev: firstChannel(stats.data.stdDev),
            max: firstChannel(stats.data.max),
            modality: stats.data.Modality
          }
        : null;
    }
    case "bidirectional": {
      const stats = bidirectionalStats.safeParse(firstStats);
      return stats.success
        ? {
            toolName: "bidirectional",
            uid,
            label,
            length: stats.data.length,
            width: stats.data.width,
            unit: stats.data.unit
          }
        : null;
    }
    case "angle": {
      const stats = angleStats.safeParse(firstStats);
      return stats.success
        ? { toolName: "angle", uid, label, angleDegrees: stats.data.angle }
        : null;
    }
  }
}

function firstValue(record: Record<string, unknown> | undefined): unknown {
  if (record === undefined) {
    return undefined;
  }

  for (const value of Object.values(record)) {
    return value;
  }

  return undefined;
}

function firstChannel(value: number | number[]): number {
  if (typeof value === "number") {
    return value;
  }

  const [first] = value;
  return first ?? 0;
}
