"use client";

import type { StackFrameState } from "@horalix/dicom-engine";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Crosshair,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  SquareDashedMousePointer
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { fetchSegmentationServiceStatus } from "../lib/segmentation-service-client";
import type { SegmentationServiceStatus } from "../lib/segmentation-service-schema";
import type { LoadedImageReference, LoadedSeries } from "../types";

interface AiTrackingPanelProps {
  readonly frameState: StackFrameState;
  readonly series: LoadedSeries | null;
}

type ServiceState =
  | { readonly status: "checking" }
  | { readonly status: "ready"; readonly value: SegmentationServiceStatus }
  | { readonly message: string; readonly status: "unavailable" };

type PromptTool = "point" | "box";
type PointPolarity = "include" | "exclude";

type AiWorkflowState =
  | { readonly status: "unavailable"; readonly message: string }
  | { readonly status: "idle" }
  | { readonly status: "ready"; readonly image: LoadedImageReference }
  | { readonly status: "needs_prompt"; readonly image: LoadedImageReference };

export function AiTrackingPanel({ frameState, series }: AiTrackingPanelProps) {
  const [serviceState, setServiceState] = useState<ServiceState>({
    status: "checking"
  });
  const [promptTool, setPromptTool] = useState<PromptTool>("point");
  const [pointPolarity, setPointPolarity] = useState<PointPolarity>("include");
  const [segmentIndex, setSegmentIndex] = useState(1);
  const [segmentLabel, setSegmentLabel] = useState("AI segment");
  const [propagate, setPropagate] = useState(false);
  const [opacity, setOpacity] = useState(45);

  useEffect(() => {
    const controller = new AbortController();

    void refreshServiceState(controller.signal);

    return () => {
      controller.abort();
    };
  }, []);

  const activeImageReference = useMemo(
    () => getActiveImageReference(series, frameState),
    [frameState, series]
  );
  const workflow = getWorkflowState({
    activeImageReference,
    serviceState,
    series
  });
  const serviceModels =
    serviceState.status === "ready" ? serviceState.value.models : [];
  const selectedModel = serviceModels[0] ?? null;
  const promptCount = 0;
  const canRun = workflow.status === "needs_prompt" && promptCount > 0;

  async function refreshServiceState(signal: AbortSignal) {
    setServiceState({ status: "checking" });

    const result = await fetchSegmentationServiceStatus(signal);

    if (signal.aborted) {
      return;
    }

    if (!result.ok) {
      setServiceState({ message: result.message, status: "unavailable" });
      return;
    }

    if (result.value.status === "ready") {
      setServiceState({ status: "ready", value: result.value });
      return;
    }

    setServiceState({ message: result.value.message, status: "unavailable" });
  }

  return (
    <section className="viewer-panel ai-panel" aria-labelledby="ai-tracking-title">
      <div className="panel-heading">
        <span className="panel-icon" aria-hidden="true">
          <BrainCircuit size={16} />
        </span>
        <h2 id="ai-tracking-title">AI tracking</h2>
        <button
          aria-label="Refresh AI service"
          className="icon-command"
          disabled={serviceState.status === "checking"}
          onClick={() => {
            const controller = new AbortController();
            void refreshServiceState(controller.signal);
          }}
          type="button"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="ai-panel-body">
        <div className="ai-status-row" data-status={workflow.status}>
          <span aria-hidden="true">{getWorkflowIcon(workflow)}</span>
          <strong>{getWorkflowLabel(workflow)}</strong>
        </div>

        <label className="field">
          <span>Model</span>
          <select disabled={serviceModels.length === 0}>
            {selectedModel ? (
              <option value={selectedModel.id}>
                {formatModelLabel(selectedModel.id, selectedModel.version)}
              </option>
            ) : (
              <option>No configured model</option>
            )}
          </select>
        </label>

        <div className="ai-control-grid">
          <label className="field">
            <span>Segment</span>
            <input
              min={1}
              onChange={(event) => setSegmentIndex(readSegmentIndex(event.target.value))}
              type="number"
              value={segmentIndex}
            />
          </label>
          <label className="field">
            <span>Label</span>
            <input
              onChange={(event) => setSegmentLabel(event.target.value)}
              type="text"
              value={segmentLabel}
            />
          </label>
        </div>

        <div className="segmented-control" aria-label="Prompt tool">
          <button
            data-active={promptTool === "point"}
            onClick={() => setPromptTool("point")}
            type="button"
          >
            <Crosshair size={14} />
            <span>Point</span>
          </button>
          <button
            data-active={promptTool === "box"}
            onClick={() => setPromptTool("box")}
            type="button"
          >
            <SquareDashedMousePointer size={14} />
            <span>Box</span>
          </button>
        </div>

        <div className="segmented-control" aria-label="Point polarity">
          <button
            data-active={pointPolarity === "include"}
            disabled={promptTool !== "point"}
            onClick={() => setPointPolarity("include")}
            type="button"
          >
            Include
          </button>
          <button
            data-active={pointPolarity === "exclude"}
            disabled={promptTool !== "point"}
            onClick={() => setPointPolarity("exclude")}
            type="button"
          >
            Exclude
          </button>
        </div>

        <label className="checkbox-row">
          <input
            checked={propagate}
            onChange={(event) => setPropagate(event.target.checked)}
            type="checkbox"
          />
          <span>Propagate</span>
        </label>

        <label className="field">
          <span>Opacity</span>
          <input
            max={100}
            min={0}
            onChange={(event) => setOpacity(readOpacity(event.target.value))}
            type="range"
            value={opacity}
          />
        </label>

        <div className="ai-action-row">
          <button className="secondary-command" disabled={!canRun} type="button">
            <Sparkles size={14} />
            <span>Run</span>
          </button>
          <button className="secondary-command" disabled type="button">
            Cancel
          </button>
        </div>

        <dl className="metadata-list ai-provenance">
          <div>
            <dt>Prompts</dt>
            <dd>{promptCount}</dd>
          </div>
          <div>
            <dt>Frame</dt>
            <dd>{formatFrameIdentity(activeImageReference)}</dd>
          </div>
          <div>
            <dt>Output</dt>
            <dd>AI-generated</dd>
          </div>
          <div>
            <dt>Use</dt>
            <dd>Research only</dd>
          </div>
          <div>
            <dt>Edit</dt>
            <dd>Clinician editable</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

function getWorkflowState(input: {
  readonly activeImageReference: LoadedImageReference | null;
  readonly series: LoadedSeries | null;
  readonly serviceState: ServiceState;
}): AiWorkflowState {
  if (input.serviceState.status === "checking") {
    return { message: "Checking segmentation service.", status: "unavailable" };
  }

  if (input.serviceState.status === "unavailable") {
    return { message: input.serviceState.message, status: "unavailable" };
  }

  if (!input.series) {
    return { status: "idle" };
  }

  if (input.series.source === "local") {
    return {
      message: "Push local files to Orthanc before inference.",
      status: "unavailable"
    };
  }

  if (!input.activeImageReference) {
    return {
      message: "No PACS-backed frame is active.",
      status: "unavailable"
    };
  }

  return { image: input.activeImageReference, status: "needs_prompt" };
}

function getWorkflowIcon(workflow: AiWorkflowState): ReactNode {
  switch (workflow.status) {
    case "unavailable":
      return <AlertTriangle size={15} />;
    case "idle":
      return <ShieldCheck size={15} />;
    case "ready":
    case "needs_prompt":
      return <CheckCircle2 size={15} />;
  }
}

function getWorkflowLabel(workflow: AiWorkflowState): string {
  switch (workflow.status) {
    case "unavailable":
      return workflow.message;
    case "idle":
      return "Load a PACS-backed series";
    case "ready":
      return "Ready";
    case "needs_prompt":
      return "Waiting for image-space prompts";
  }
}

function getActiveImageReference(
  series: LoadedSeries | null,
  frameState: StackFrameState
): LoadedImageReference | null {
  if (!series || series.imageReferences.length === 0) {
    return null;
  }

  const byImageId = series.imageReferences.find(
    (reference) => reference.imageId === frameState.currentImageId
  );

  if (byImageId) {
    return byImageId;
  }

  return series.imageReferences[frameState.currentIndex] ?? null;
}

function formatFrameIdentity(reference: LoadedImageReference | null): string {
  if (!reference) {
    return "None";
  }

  return `${reference.sopInstanceUid} / ${reference.frameIndex}`;
}

function formatModelLabel(id: string, version: string | null): string {
  if (!version) {
    return id;
  }

  return `${id} ${version}`;
}

function readSegmentIndex(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

function readOpacity(value: string): number {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return 45;
  }

  return Math.min(Math.max(parsed, 0), 100);
}
