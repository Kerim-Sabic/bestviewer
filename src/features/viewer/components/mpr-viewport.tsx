"use client";

import type { MprController } from "@horalix/dicom-engine";
import { AlertTriangle, Box, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { LoadedSeries, WindowLevelSelection } from "../types";

interface MprViewportProps {
  readonly series: LoadedSeries;
  readonly windowLevel: WindowLevelSelection;
}

type MprStatus =
  | { readonly status: "mounting" }
  | { readonly status: "building" }
  | { readonly status: "rendered" }
  | { readonly status: "error"; readonly message: string };

const PLANES = [
  { key: "axial", label: "Axial" },
  { key: "coronal", label: "Coronal" },
  { key: "sagittal", label: "Sagittal" }
] as const;

export function MprViewport({ series, windowLevel }: MprViewportProps) {
  const axialRef = useRef<HTMLDivElement>(null);
  const coronalRef = useRef<HTMLDivElement>(null);
  const sagittalRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<MprController | null>(null);
  const windowLevelRef = useRef(windowLevel);
  const [status, setStatus] = useState<MprStatus>({ status: "mounting" });

  useEffect(() => {
    windowLevelRef.current = windowLevel;
    controllerRef.current?.setWindowLevel(windowLevel.preset);
  }, [windowLevel]);

  useEffect(() => {
    let disposed = false;
    const axial = axialRef.current;
    const coronal = coronalRef.current;
    const sagittal = sagittalRef.current;

    if (!axial || !coronal || !sagittal) {
      setStatus({ status: "error", message: "MPR panes were not mounted." });
      return;
    }

    async function mount() {
      const { createMprViewports, RenderingEngineId, ToolGroupId, VolumeId } =
        await import("@horalix/dicom-engine");

      if (disposed || !axial || !coronal || !sagittal) {
        return;
      }

      setStatus({ status: "building" });

      const result = await createMprViewports({
        elements: { axial, coronal, sagittal },
        imageIds: series.imageIds,
        renderingEngineId: RenderingEngineId("horalix-mpr-rendering-engine"),
        toolGroupId: ToolGroupId("horalix-mpr-tools"),
        volumeId: VolumeId(`horalix-vol-${series.seriesInstanceUid}-${series.loadedAt}`),
        windowLevel: windowLevelRef.current.preset
      });

      if (disposed) {
        if (result.ok) {
          result.value.destroy();
        }
        return;
      }

      if (!result.ok) {
        setStatus({ status: "error", message: result.error.message });
        return;
      }

      controllerRef.current = result.value;
      setStatus({ status: "rendered" });
    }

    void mount();

    return () => {
      disposed = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [series.seriesInstanceUid, series.loadedAt, series.imageIds]);

  return (
    <section className="viewport-stage mpr-stage" aria-label="MPR viewports">
      <div className="viewport-toolbar">
        <div className="viewport-title">
          <Box size={16} aria-hidden="true" />
          <span>Volume · MPR</span>
        </div>
        <div className="viewport-badges">
          <span>{windowLevel.preset.label}</span>
          <span>{statusText(status)}</span>
        </div>
      </div>

      <div className="mpr-grid">
        {PLANES.map((plane) => (
          <div key={plane.key} className="mpr-pane">
            <span className="mpr-pane-label">{plane.label}</span>
            <div
              ref={
                plane.key === "axial"
                  ? axialRef
                  : plane.key === "coronal"
                    ? coronalRef
                    : sagittalRef
              }
              className="mpr-element"
            />
          </div>
        ))}
      </div>

      {status.status === "building" ? (
        <div className="viewport-pending">
          <Loader2 size={18} className="spin" aria-hidden="true" />
          <span>Reconstructing volume…</span>
        </div>
      ) : null}

      {status.status === "error" ? (
        <div className="viewport-error">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{status.message}</span>
        </div>
      ) : null}
    </section>
  );
}

function statusText(status: MprStatus): string {
  switch (status.status) {
    case "mounting":
      return "Initializing";
    case "building":
      return "Reconstructing";
    case "rendered":
      return "3 planes";
    case "error":
      return "Error";
  }
}
