"use client";

import type { Measurement } from "@horalix/dicom-engine";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { formatMeasurement } from "../lib/format-measurement";
import {
  fetchReportAvailability,
  generateReport,
  type ReportMeasurement
} from "../lib/report-client";
import type { SegmentDefinition } from "../lib/ai-segmentation";
import type { LoadedSeries } from "../types";

interface VlmReportPanelProps {
  readonly measurements: readonly Measurement[];
  readonly segments: readonly SegmentDefinition[];
  readonly hasMask: boolean;
  readonly series: LoadedSeries | null;
}

type AvailabilityState =
  | { readonly status: "checking" }
  | { readonly status: "available" }
  | { readonly status: "unavailable"; readonly message: string };

type GenerateState =
  | { readonly status: "idle" }
  | { readonly status: "generating" }
  | { readonly status: "error"; readonly message: string };

export function VlmReportPanel({
  measurements,
  segments,
  hasMask,
  series
}: VlmReportPanelProps) {
  const [availability, setAvailability] = useState<AvailabilityState>({
    status: "checking"
  });
  const [generateState, setGenerateState] = useState<GenerateState>({
    status: "idle"
  });
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetchReportAvailability(controller.signal).then((result) => {
      if (controller.signal.aborted) {
        return;
      }
      setAvailability(
        result.available
          ? { status: "available" }
          : { status: "unavailable", message: result.message }
      );
    });
    return () => controller.abort();
  }, []);

  const reportMeasurements = useMemo<ReportMeasurement[]>(
    () =>
      measurements.map((measurement) => {
        const display = formatMeasurement(measurement);
        const value = display.secondary
          ? `${display.primary} (${display.secondary})`
          : display.primary;
        return {
          label: display.toolLabel,
          value: display.calibrated ? value : `${value} [uncalibrated]`
        };
      }),
    [measurements]
  );

  const hasInput = reportMeasurements.length > 0 || segments.length > 0;
  const canGenerate =
    availability.status === "available" &&
    hasInput &&
    generateState.status !== "generating";

  async function handleGenerate() {
    setGenerateState({ status: "generating" });
    const result = await generateReport({
      studyInstanceUid: series?.studyInstanceUid,
      seriesInstanceUid: series?.seriesInstanceUid,
      measurements: reportMeasurements,
      segments: segments.map((segment) => ({
        index: segment.index,
        label: segment.label
      }))
    });

    if (result.ok) {
      setDraft(result.text);
      setGenerateState({ status: "idle" });
      return;
    }

    setGenerateState({ status: "error", message: result.message });
  }

  return (
    <section className="viewer-panel report-panel" aria-labelledby="report-title">
      <div className="panel-heading">
        <span className="panel-icon" aria-hidden="true">
          <FileText size={16} />
        </span>
        <h2 id="report-title">Report draft</h2>
      </div>

      <div className="report-body">
        <p className="report-context">
          {reportMeasurements.length} measurement(s) · {segments.length} segment(s)
          {hasMask ? " · mask present" : ""}
        </p>

        {availability.status === "unavailable" ? (
          <p className="report-hint">{availability.message}</p>
        ) : null}

        <button
          className="primary-command report-generate"
          disabled={!canGenerate}
          onClick={handleGenerate}
          type="button"
        >
          {generateState.status === "generating" ? (
            <Loader2 size={14} className="spin" />
          ) : (
            <Sparkles size={14} />
          )}
          <span>Draft impression</span>
        </button>

        {generateState.status === "error" ? (
          <p className="ai-inline-error">{generateState.message}</p>
        ) : null}

        <textarea
          aria-label="Drafted report"
          className="report-textarea"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="The drafted impression appears here for clinician review and editing."
          rows={8}
          value={draft}
        />

        <p className="report-disclaimer">
          AI-generated draft over existing measurements — research use only, not a
          diagnosis. Clinician review and edit required. The language model never
          produces masks or measurements.
        </p>
      </div>
    </section>
  );
}
