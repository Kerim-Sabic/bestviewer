"use client";

import {
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  Send,
  X
} from "lucide-react";
import type { ReactNode } from "react";

import type { StowUploadState } from "../types";

interface LocalOrthancPushPanelProps {
  readonly fileCount: number;
  readonly onCancel: () => void;
  readonly onPush: () => void;
  readonly state: StowUploadState;
}

export function LocalOrthancPushPanel({
  fileCount,
  onCancel,
  onPush,
  state
}: LocalOrthancPushPanelProps) {
  const isRunning = state.status === "preparing" || state.status === "uploading";
  const canPush = fileCount > 0 && !isRunning;

  return (
    <div className="stow-panel" data-status={state.status}>
      <div className="stow-panel-main">
        <span className="stow-panel-icon" aria-hidden="true">
          {getStatusIcon(state)}
        </span>
        <div>
          <strong>Orthanc STOW-RS</strong>
          <span>{getStatusText(state, fileCount)}</span>
        </div>
      </div>

      <div className="stow-actions">
        {isRunning ? (
          <button className="secondary-command" onClick={onCancel} type="button">
            <X size={14} />
            <span>Cancel</span>
          </button>
        ) : null}
        <button
          className="secondary-command"
          disabled={!canPush}
          onClick={onPush}
          type="button"
        >
          <Send size={14} />
          <span>Push to Orthanc</span>
        </button>
      </div>
    </div>
  );
}

function getStatusIcon(state: StowUploadState): ReactNode {
  switch (state.status) {
    case "idle":
      return <Send size={16} />;
    case "preparing":
    case "uploading":
      return <LoaderCircle className="spin-icon" size={16} />;
    case "succeeded":
      return <CheckCircle2 size={16} />;
    case "partially_succeeded":
    case "failed":
      return <AlertTriangle size={16} />;
  }
}

function getStatusText(state: StowUploadState, fileCount: number): string {
  switch (state.status) {
    case "idle":
      return fileCount > 0
        ? `${fileCount} selected for local viewing`
        : "No local files selected";
    case "preparing":
      return `Preparing ${state.fileCount} DICOM file(s)`;
    case "uploading":
      return `Uploading ${state.fileCount} DICOM file(s)`;
    case "succeeded":
      return `${state.accepted.length} instance(s) accepted`;
    case "partially_succeeded":
      return `${state.accepted.length} accepted, ${state.rejected.length} rejected`;
    case "failed":
      return state.message;
  }
}
