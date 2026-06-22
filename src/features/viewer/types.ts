import type {
  ImageId,
  ImageReference,
  WindowLevelPreset
} from "@horalix/dicom-engine";

import type {
  StowInstanceFailure,
  StowInstanceReference,
  StowUploadFailureReason
} from "./lib/stow-rs-schema";

export type LoadStatus =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; imageCount: number }
  | { status: "error"; message: string };

export interface LoadedSeries {
  readonly imageIds: ImageId[];
  readonly imageReferences: readonly LoadedImageReference[];
  readonly instanceCount: number;
  readonly loadedAt: string;
  readonly modality: string | null;
  readonly recommendedFrameRate: number | null;
  readonly seriesInstanceUid: string;
  readonly source: "dicomweb" | "local";
  readonly studyInstanceUid: string;
  readonly wadoRoot: string;
}

export type LoadedImageReference = ImageReference & {
  readonly imageId: ImageId;
};

export interface WindowLevelSelection {
  readonly key: string;
  readonly preset: WindowLevelPreset;
}

export type StowUploadState =
  | { readonly status: "idle" }
  | { readonly fileCount: number; readonly status: "preparing" }
  | { readonly fileCount: number; readonly status: "uploading" }
  | {
      readonly accepted: readonly StowInstanceReference[];
      readonly fileCount: number;
      readonly rejected: readonly StowInstanceFailure[];
      readonly status: "succeeded";
      readonly studyRetrieveUrl: string | null;
    }
  | {
      readonly accepted: readonly StowInstanceReference[];
      readonly fileCount: number;
      readonly rejected: readonly StowInstanceFailure[];
      readonly status: "partially_succeeded";
      readonly studyRetrieveUrl: string | null;
    }
  | {
      readonly fileCount: number | null;
      readonly message: string;
      readonly reason: StowUploadFailureReason;
      readonly status: "failed";
      readonly upstreamStatus?: number | undefined;
    };

export type CineMode = "loop" | "bounce";
export type CinePlaybackStatus = "paused" | "playing";

export interface CinePlaybackState {
  readonly framesPerSecond: number;
  readonly mode: CineMode;
  readonly status: CinePlaybackStatus;
}
