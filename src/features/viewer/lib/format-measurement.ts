import type { Measurement } from "@horalix/dicom-engine";

export interface MeasurementDisplay {
  readonly toolLabel: string;
  readonly primary: string;
  readonly secondary: string | null;
  /**
   * False when the value is in pixels because the source image lacks
   * `PixelSpacing`. The panel surfaces this so an uncalibrated measurement is
   * never mistaken for a physical one — a clinical-safety requirement, not a
   * cosmetic flag.
   */
  readonly calibrated: boolean;
}

export function formatMeasurement(measurement: Measurement): MeasurementDisplay {
  switch (measurement.toolName) {
    case "length":
      return {
        toolLabel: "Length",
        primary: `${formatNumber(measurement.length)} ${measurement.unit}`,
        secondary: null,
        calibrated: isPhysicalUnit(measurement.unit)
      };
    case "probe":
      return {
        toolLabel: "Probe",
        primary: formatNumber(measurement.value),
        secondary: measurement.modality.length > 0 ? measurement.modality : null,
        calibrated: true
      };
    case "rectangleRoi":
      return {
        toolLabel: "ROI",
        primary: `${formatNumber(measurement.area)} ${measurement.areaUnit}`,
        secondary: `mean ${formatNumber(measurement.mean)} · σ ${formatNumber(
          measurement.stdDev
        )} · max ${formatNumber(measurement.max)}`,
        calibrated: isPhysicalUnit(measurement.areaUnit)
      };
    case "bidirectional":
      return {
        toolLabel: "Bidirectional",
        primary: `${formatNumber(measurement.length)} × ${formatNumber(
          measurement.width
        )} ${measurement.unit}`,
        secondary: null,
        calibrated: isPhysicalUnit(measurement.unit)
      };
    case "angle":
      return {
        toolLabel: "Angle",
        primary: `${formatNumber(measurement.angleDegrees)}°`,
        secondary: null,
        calibrated: true
      };
  }
}

function isPhysicalUnit(unit: string): boolean {
  return unit.length > 0 && !unit.toLowerCase().includes("px");
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toString() : value.toFixed(1);
}
