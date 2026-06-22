import type { FrameArea } from "@horalix/dicom-engine";

/**
 * Cardiac function from an AI-tracked segment across a loop. Given the per-frame
 * area of the LV cavity (produced by propagating one prompt across the cardiac
 * cycle), derive end-diastole (largest area) and end-systole (smallest area) and
 * the **Fractional Area Change** — a real, area-based 2D echo metric:
 *
 *   FAC % = (EDA − ESA) / EDA × 100
 *
 * This is intentionally NOT called "ejection fraction": EF needs a volume
 * (biplane Simpson's or 3D), and claiming it from a single 2D area would cross
 * the SaMD line. FAC is honest about what a single loop supports. Output is
 * AI-derived, research use only, and clinician-editable.
 */

export interface LvFunctionResult {
  readonly frames: readonly FrameArea[];
  readonly edFrameIndex: number;
  readonly esFrameIndex: number;
  readonly edArea: number;
  readonly esArea: number;
  readonly facPercent: number;
  readonly calibrated: boolean;
  readonly unit: string;
}

export function computeLvFunction(
  areas: readonly FrameArea[]
): LvFunctionResult | null {
  if (areas.length < 2) {
    return null;
  }

  let ed = areas[0];
  let es = areas[0];
  if (!ed || !es) {
    return null;
  }

  for (const frame of areas) {
    if (frame.areaPixels > ed.areaPixels) {
      ed = frame;
    }
    if (frame.areaPixels < es.areaPixels) {
      es = frame;
    }
  }

  const calibrated = ed.areaMm2 !== null && es.areaMm2 !== null;
  const edArea = calibrated && ed.areaMm2 !== null ? ed.areaMm2 : ed.areaPixels;
  const esArea = calibrated && es.areaMm2 !== null ? es.areaMm2 : es.areaPixels;
  const facPercent =
    ed.areaPixels > 0
      ? ((ed.areaPixels - es.areaPixels) / ed.areaPixels) * 100
      : 0;

  return {
    frames: areas,
    edFrameIndex: ed.frameIndex,
    esFrameIndex: es.frameIndex,
    edArea,
    esArea,
    facPercent,
    calibrated,
    unit: calibrated ? "mm²" : "px"
  };
}

export function formatArea(value: number, unit: string): string {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded.toLocaleString()} ${unit}`;
}
