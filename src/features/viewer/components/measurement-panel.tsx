"use client";

import type { AnnotationUid, Measurement } from "@horalix/dicom-engine";
import { AlertTriangle, Ruler, Trash2 } from "lucide-react";

import { formatMeasurement } from "../lib/format-measurement";

interface MeasurementPanelProps {
  readonly measurements: readonly Measurement[];
  readonly onRemove: (uid: AnnotationUid) => void;
}

export function MeasurementPanel({ measurements, onRemove }: MeasurementPanelProps) {
  return (
    <section className="viewer-panel measurement-panel" aria-labelledby="measurements-title">
      <div className="panel-heading">
        <span className="panel-icon" aria-hidden="true">
          <Ruler size={16} />
        </span>
        <h2 id="measurements-title">Measurements</h2>
        {measurements.length > 0 ? (
          <span className="panel-count">{measurements.length}</span>
        ) : null}
      </div>

      {measurements.length === 0 ? (
        <p className="muted-line">Pick a tool and draw on the image to measure.</p>
      ) : (
        <ul className="measurement-list">
          {measurements.map((measurement) => (
            <MeasurementRow
              key={measurement.uid}
              measurement={measurement}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface MeasurementRowProps {
  readonly measurement: Measurement;
  readonly onRemove: (uid: AnnotationUid) => void;
}

function MeasurementRow({ measurement, onRemove }: MeasurementRowProps) {
  const display = formatMeasurement(measurement);

  return (
    <li className="measurement-row">
      <div className="measurement-body">
        <div className="measurement-headline">
          <span className="measurement-kind">{display.toolLabel}</span>
          {display.calibrated ? null : (
            <span className="measurement-uncalibrated" title="Uncalibrated: no PixelSpacing">
              <AlertTriangle size={12} aria-hidden="true" />
              uncalibrated
            </span>
          )}
        </div>
        <strong className="measurement-value">{display.primary}</strong>
        {display.secondary ? (
          <span className="measurement-detail">{display.secondary}</span>
        ) : null}
      </div>

      <button
        className="icon-command measurement-remove"
        type="button"
        aria-label={`Delete ${display.toolLabel} measurement`}
        onClick={() => onRemove(measurement.uid)}
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </li>
  );
}
