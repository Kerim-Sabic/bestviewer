"use client";

import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Crosshair,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  SquareDashedMousePointer,
  Upload,
  X
} from "lucide-react";
import type { ReactNode } from "react";

import { rgbaToCss } from "../lib/ai-segmentation";
import type { UseAiSegmentationReturn } from "../hooks/use-ai-segmentation";

interface AiTrackingPanelProps {
  readonly ai: UseAiSegmentationReturn;
}

export function AiTrackingPanel({ ai }: AiTrackingPanelProps) {
  const isPoint =
    ai.promptMode === "point-include" || ai.promptMode === "point-exclude";

  return (
    <section className="viewer-panel ai-panel" aria-labelledby="ai-tracking-title">
      <div className="panel-heading">
        <span className="panel-icon" aria-hidden="true">
          <BrainCircuit size={16} />
        </span>
        <h2 id="ai-tracking-title">AI segmentation</h2>
        <button
          aria-label="Refresh AI service"
          className="icon-command"
          disabled={ai.serviceState.status === "checking"}
          onClick={ai.refreshService}
          type="button"
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="ai-panel-body">
        <div className="ai-status-row" data-status={ai.workflow.status}>
          <span aria-hidden="true">{workflowIcon(ai)}</span>
          <strong>{workflowLabel(ai)}</strong>
        </div>

        <label className="field">
          <span>Model</span>
          <select
            disabled={ai.models.length === 0}
            onChange={(event) => ai.setSelectedModelId(event.target.value)}
            value={ai.selectedModelId ?? ""}
          >
            {ai.models.length === 0 ? (
              <option value="">No configured model</option>
            ) : (
              ai.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.version ? `${model.label} · ${model.version}` : model.label}
                </option>
              ))
            )}
          </select>
        </label>

        <div className="segmented-control" aria-label="Prompt tool">
          <button
            data-active={isPoint}
            onClick={() => ai.setPromptMode("point-include")}
            type="button"
          >
            <Crosshair size={14} />
            <span>Point</span>
          </button>
          <button
            data-active={ai.promptMode === "box"}
            onClick={() => ai.setPromptMode("box")}
            type="button"
          >
            <SquareDashedMousePointer size={14} />
            <span>Box</span>
          </button>
          <button
            data-active={ai.promptMode === "off"}
            onClick={() => ai.setPromptMode("off")}
            type="button"
          >
            <span>Off</span>
          </button>
        </div>

        <div className="segmented-control" aria-label="Point polarity">
          <button
            data-active={ai.promptMode === "point-include"}
            disabled={!isPoint}
            onClick={() => ai.setPromptMode("point-include")}
            type="button"
          >
            Include
          </button>
          <button
            data-active={ai.promptMode === "point-exclude"}
            disabled={!isPoint}
            onClick={() => ai.setPromptMode("point-exclude")}
            type="button"
          >
            Exclude
          </button>
        </div>

        <div className="ai-segment-block">
          <div className="ai-segment-head">
            <span>Segments</span>
            <button className="text-command" onClick={ai.addSegment} type="button">
              <Plus size={13} />
              <span>Add</span>
            </button>
          </div>
          <ul className="ai-segment-list">
            {ai.segments.map((segment) => (
              <li
                key={segment.index}
                className="ai-segment-row"
                data-active={segment.index === ai.activeSegmentIndex}
              >
                <button
                  className="ai-segment-select"
                  onClick={() => ai.setActiveSegmentIndex(segment.index)}
                  type="button"
                >
                  <span
                    className="ai-segment-swatch"
                    style={{ backgroundColor: rgbaToCss(segment.color) }}
                    aria-hidden="true"
                  />
                  <input
                    aria-label={`Segment ${segment.index} label`}
                    className="ai-segment-label"
                    onChange={(event) =>
                      ai.renameSegment(segment.index, event.target.value)
                    }
                    onClick={(event) => event.stopPropagation()}
                    type="text"
                    value={segment.label}
                  />
                </button>
                <button
                  aria-label={
                    segment.visible ? "Hide segment" : "Show segment"
                  }
                  className="icon-command"
                  onClick={() => ai.toggleSegmentVisibility(segment.index)}
                  type="button"
                >
                  {segment.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="ai-toggle-grid">
          <label className="checkbox-row">
            <input
              checked={ai.propagate}
              onChange={(event) => ai.setPropagate(event.target.checked)}
              type="checkbox"
            />
            <span>Track across cine (slower)</span>
          </label>
          <label className="checkbox-row">
            <input
              checked={ai.liveMode}
              onChange={(event) => ai.setLiveMode(event.target.checked)}
              type="checkbox"
            />
            <span>Live mode</span>
          </label>
        </div>

        <label className="field">
          <span>Mask opacity · {ai.opacity}%</span>
          <input
            max={100}
            min={0}
            onChange={(event) => ai.setOpacity(Number(event.target.value))}
            type="range"
            value={ai.opacity}
          />
        </label>

        <div className="ai-action-row">
          <button
            className="primary-command"
            disabled={!ai.canRun}
            onClick={ai.run}
            type="button"
          >
            {ai.runState.status === "running" ? (
              <Loader2 size={14} className="spin" />
            ) : (
              <Sparkles size={14} />
            )}
            <span>{ai.runState.status === "running" ? "Running" : "Run"}</span>
          </button>
          <button
            className="secondary-command"
            disabled={ai.runState.status !== "running"}
            onClick={ai.cancel}
            type="button"
          >
            Cancel
          </button>
          <button
            aria-label="Clear prompts"
            className="icon-command"
            disabled={ai.pendingPrompts.length === 0}
            onClick={ai.clearPrompts}
            type="button"
          >
            <X size={15} />
          </button>
        </div>

        {ai.runState.status === "error" ? (
          <p className="ai-inline-error">{ai.runState.message}</p>
        ) : null}

        <dl className="metadata-list ai-provenance">
          <div>
            <dt>Prompts</dt>
            <dd>{ai.pendingPrompts.length}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>{confidenceText(ai)}</dd>
          </div>
          <div>
            <dt>Latency</dt>
            <dd>{latencyText(ai)}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{modelText(ai)}</dd>
          </div>
          <div>
            <dt>Output</dt>
            <dd>AI-generated</dd>
          </div>
          <div>
            <dt>Use</dt>
            <dd>Research only</dd>
          </div>
        </dl>

        <button
          className="secondary-command ai-export"
          disabled={!ai.hasMask || ai.exportState.status === "exporting"}
          onClick={ai.exportSeg}
          type="button"
        >
          {ai.exportState.status === "exporting" ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <Upload size={14} />
          )}
          <span>Export DICOM SEG → Orthanc</span>
        </button>
        {ai.exportState.status === "done" ? (
          <p className="ai-inline-ok">{ai.exportState.message}</p>
        ) : null}
        {ai.exportState.status === "error" ? (
          <p className="ai-inline-error">{ai.exportState.message}</p>
        ) : null}
      </div>
    </section>
  );
}

function workflowIcon(ai: AiTrackingPanelProps["ai"]): ReactNode {
  switch (ai.workflow.status) {
    case "unavailable":
      return <AlertTriangle size={15} />;
    case "idle":
      return <ShieldCheck size={15} />;
    case "needs_prompt":
    case "ready":
      return <CheckCircle2 size={15} />;
  }
}

function workflowLabel(ai: AiTrackingPanelProps["ai"]): string {
  switch (ai.workflow.status) {
    case "unavailable":
      return ai.workflow.message;
    case "idle":
      return "Load a PACS-backed series";
    case "needs_prompt":
      return "Click the image to add prompts";
    case "ready":
      return `${ai.pendingPrompts.length} prompt(s) ready — Run`;
  }
}

function confidenceText(ai: AiTrackingPanelProps["ai"]): string {
  if (ai.runState.status !== "done" || ai.runState.provenance.confidence === null) {
    return "—";
  }
  return `${Math.round(ai.runState.provenance.confidence * 100)}%`;
}

function latencyText(ai: AiTrackingPanelProps["ai"]): string {
  if (ai.runState.status !== "done") {
    return "—";
  }
  return `${Math.round(ai.runState.provenance.inferenceMs)} ms`;
}

function modelText(ai: AiTrackingPanelProps["ai"]): string {
  if (ai.runState.status !== "done") {
    return ai.selectedModelId ?? "—";
  }
  const { modelId, modelVersion } = ai.runState.provenance;
  return modelVersion ? `${modelId} · ${modelVersion}` : modelId;
}
