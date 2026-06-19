"use client";

import { CirclePause, CirclePlay, Gauge, SkipBack, SkipForward } from "lucide-react";

import type { CineMode, CinePlaybackStatus } from "../types";

const MinimumFrameRate = 1;
const MaximumFrameRate = 60;

interface CineControlStripProps {
  readonly disabled: boolean;
  readonly frameCount: number;
  readonly frameIndex: number;
  readonly frameRate: number;
  readonly mode: CineMode;
  readonly onFrameIndexChange: (frameIndex: number) => void;
  readonly onFrameRateChange: (frameRate: number) => void;
  readonly onModeChange: (mode: CineMode) => void;
  readonly onStep: (delta: number) => void;
  readonly onTogglePlayback: () => void;
  readonly playbackStatus: CinePlaybackStatus;
  readonly recommendedFrameRate: number | null;
}

export function CineControlStrip({
  disabled,
  frameCount,
  frameIndex,
  frameRate,
  mode,
  onFrameIndexChange,
  onFrameRateChange,
  onModeChange,
  onStep,
  onTogglePlayback,
  playbackStatus,
  recommendedFrameRate
}: CineControlStripProps) {
  const isCineDisabled = disabled || frameCount < 2;
  const isPlaying = playbackStatus === "playing";

  return (
    <div className="cine-strip" aria-label="Cine controls">
      <div className="cine-command-group">
        <button
          aria-label="Previous frame"
          className="cine-icon-command"
          disabled={isCineDisabled}
          onClick={() => onStep(-1)}
          type="button"
        >
          <SkipBack size={16} />
        </button>

        <button
          aria-label={isPlaying ? "Pause cine" : "Play cine"}
          className="cine-play-command"
          disabled={isCineDisabled}
          onClick={onTogglePlayback}
          type="button"
        >
          {isPlaying ? <CirclePause size={18} /> : <CirclePlay size={18} />}
          <span>{isPlaying ? "Pause" : "Play"}</span>
        </button>

        <button
          aria-label="Next frame"
          className="cine-icon-command"
          disabled={isCineDisabled}
          onClick={() => onStep(1)}
          type="button"
        >
          <SkipForward size={16} />
        </button>
      </div>

      <label className="cine-scrubber">
        <span>{formatFrameLabel(frameIndex, frameCount)}</span>
        <input
          aria-label="Cine frame"
          disabled={isCineDisabled}
          max={Math.max(frameCount, 1)}
          min={1}
          onChange={(event) => onFrameIndexChange(Number(event.currentTarget.value) - 1)}
          type="range"
          value={Math.min(frameIndex + 1, Math.max(frameCount, 1))}
        />
      </label>

      <label className="cine-rate">
        <Gauge size={14} aria-hidden="true" />
        <span>{frameRate} fps</span>
        <input
          aria-label="Cine frame rate"
          disabled={disabled}
          max={MaximumFrameRate}
          min={MinimumFrameRate}
          onChange={(event) => onFrameRateChange(Number(event.currentTarget.value))}
          type="range"
          value={frameRate}
        />
      </label>

      <div className="cine-mode-toggle" role="group" aria-label="Cine mode">
        <button
          data-active={mode === "loop"}
          disabled={disabled}
          onClick={() => onModeChange("loop")}
          type="button"
        >
          Loop
        </button>
        <button
          data-active={mode === "bounce"}
          disabled={disabled}
          onClick={() => onModeChange("bounce")}
          type="button"
        >
          Bounce
        </button>
      </div>

      <span className="cine-rate-hint">
        {recommendedFrameRate ? `${recommendedFrameRate} fps tag` : "No fps tag"}
      </span>
    </div>
  );
}

function formatFrameLabel(frameIndex: number, frameCount: number): string {
  if (frameCount < 1) {
    return "Frame 0/0";
  }

  return `Frame ${frameIndex + 1}/${frameCount}`;
}
