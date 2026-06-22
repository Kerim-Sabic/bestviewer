"use client";

import { Activity, HeartPulse } from "lucide-react";
import { useId } from "react";

import { formatArea, type LvFunctionResult } from "../lib/cardiac-function";

interface CardiacFunctionPanelProps {
  readonly lvFunction: LvFunctionResult | null;
  readonly hasMask: boolean;
  readonly onCompute: () => void;
  readonly onJump: (frameIndex: number) => void;
}

const SPARK_WIDTH = 248;
const SPARK_HEIGHT = 60;

export function CardiacFunctionPanel({
  lvFunction,
  hasMask,
  onCompute,
  onJump
}: CardiacFunctionPanelProps) {
  const gradientId = useId();

  return (
    <section className="viewer-panel function-panel" aria-labelledby="function-title">
      <div className="panel-heading">
        <span className="panel-icon" aria-hidden="true">
          <HeartPulse size={16} />
        </span>
        <h2 id="function-title">LV function</h2>
        <span className="panel-tag">AI · research</span>
      </div>

      <div className="function-body">
        <button
          className="primary-command"
          disabled={!hasMask}
          onClick={onCompute}
          type="button"
        >
          <Activity size={14} />
          <span>Compute from tracked loop</span>
        </button>

        {!lvFunction ? (
          <p className="function-hint">
            Segment the LV on one frame with <strong>Propagate</strong> on, Run, then
            compute. Fractional Area Change is measured across the cardiac cycle.
          </p>
        ) : (
          <>
            <div className="function-metric">
              <span className="function-metric-label">Fractional area change</span>
              <strong className="function-metric-value">
                {lvFunction.facPercent.toFixed(0)}
                <small>%</small>
              </strong>
            </div>

            <Sparkline lvFunction={lvFunction} gradientId={gradientId} />

            <dl className="function-stats">
              <button
                className="function-stat"
                onClick={() => onJump(lvFunction.edFrameIndex)}
                type="button"
              >
                <dt>End-diastole</dt>
                <dd>{formatArea(lvFunction.edArea, lvFunction.unit)}</dd>
                <span className="function-frame">frame {lvFunction.edFrameIndex + 1}</span>
              </button>
              <button
                className="function-stat"
                onClick={() => onJump(lvFunction.esFrameIndex)}
                type="button"
              >
                <dt>End-systole</dt>
                <dd>{formatArea(lvFunction.esArea, lvFunction.unit)}</dd>
                <span className="function-frame">frame {lvFunction.esFrameIndex + 1}</span>
              </button>
            </dl>

            <p className="function-disclaimer">
              {lvFunction.calibrated
                ? "Area-based (single-plane) function."
                : "Uncalibrated — areas in pixels (no PixelSpacing)."}{" "}
              AI-derived, not ejection fraction; research use only, clinician-reviewed.
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Sparkline({
  lvFunction,
  gradientId
}: {
  readonly lvFunction: LvFunctionResult;
  readonly gradientId: string;
}) {
  const frames = lvFunction.frames;
  const xs = frames.map((frame) => frame.frameIndex);
  const ys = frames.map((frame) => frame.areaPixels);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = Math.max(maxX - minX, 1);
  const spanY = Math.max(maxY - minY, 1);

  const toPoint = (frameIndex: number, areaPixels: number): [number, number] => [
    ((frameIndex - minX) / spanX) * SPARK_WIDTH,
    SPARK_HEIGHT - ((areaPixels - minY) / spanY) * (SPARK_HEIGHT - 8) - 4
  ];

  const points = frames.map((frame) => toPoint(frame.frameIndex, frame.areaPixels));
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${SPARK_HEIGHT} ${line} ${SPARK_WIDTH},${SPARK_HEIGHT}`;

  const edFrame = frames.find((frame) => frame.frameIndex === lvFunction.edFrameIndex);
  const esFrame = frames.find((frame) => frame.frameIndex === lvFunction.esFrameIndex);
  const ed = edFrame ? toPoint(edFrame.frameIndex, edFrame.areaPixels) : null;
  const es = esFrame ? toPoint(esFrame.frameIndex, esFrame.areaPixels) : null;

  return (
    <svg
      className="function-spark"
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="LV area across the cardiac cycle"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" className="function-spark-fill-top" />
          <stop offset="100%" className="function-spark-fill-bottom" />
        </linearGradient>
      </defs>
      <polygon className="function-spark-area" points={area} fill={`url(#${gradientId})`} />
      <polyline className="function-spark-line" points={line} />
      {ed ? <circle className="function-spark-ed" cx={ed[0]} cy={ed[1]} r={3.5} /> : null}
      {es ? <circle className="function-spark-es" cx={es[0]} cy={es[1]} r={3.5} /> : null}
    </svg>
  );
}
