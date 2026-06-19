import type { ImageId, WindowLevelPreset } from "@horalix/dicom-engine";

export type LoadStatus =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; imageCount: number }
  | { status: "error"; message: string };

export interface LoadedSeries {
  readonly imageIds: ImageId[];
  readonly instanceCount: number;
  readonly loadedAt: string;
  readonly recommendedFrameRate: number | null;
  readonly seriesInstanceUid: string;
  readonly studyInstanceUid: string;
  readonly wadoRoot: string;
}

export interface WindowLevelSelection {
  readonly key: string;
  readonly preset: WindowLevelPreset;
}

export type CineMode = "loop" | "bounce";
export type CinePlaybackStatus = "paused" | "playing";

export interface CinePlaybackState {
  readonly framesPerSecond: number;
  readonly mode: CineMode;
  readonly status: CinePlaybackStatus;
}
