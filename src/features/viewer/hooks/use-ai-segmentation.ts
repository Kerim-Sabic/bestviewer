"use client";

import {
  SegmentationId,
  createStackLabelmap,
  measureSegmentAreas,
  removeLabelmap,
  runSegmentation,
  setActiveSegment,
  setLabelmapOpacity,
  setSegmentColor,
  setSegmentVisibility,
  writeFrameMask,
  type SegmentationRequest,
  type StackFrameState,
  type StackViewportController
} from "@horalix/dicom-engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  activeImageReference,
  colorForSegment,
  createPromptId,
  imageIdForFrame,
  type AiRunState,
  type PendingPrompt,
  type PromptMode,
  type SegmentDefinition
} from "../lib/ai-segmentation";
import { computeLvFunction, type LvFunctionResult } from "../lib/cardiac-function";
import { fetchSegmentationServiceStatus } from "../lib/segmentation-service-client";
import type { SegmentationServiceModel } from "../lib/segmentation-service-schema";
import { exportSegmentationToOrthanc } from "../lib/seg-export-client";
import type { LoadedSeries } from "../types";

const LIVE_DEBOUNCE_MS = 220;

export type AiServiceState =
  | { readonly status: "checking" }
  | { readonly status: "ready"; readonly models: readonly SegmentationServiceModel[] }
  | { readonly status: "unavailable"; readonly message: string };

export type AiWorkflow =
  | { readonly status: "unavailable"; readonly message: string }
  | { readonly status: "idle" }
  | { readonly status: "needs_prompt" }
  | { readonly status: "ready" };

export type SegExportState =
  | { readonly status: "idle" }
  | { readonly status: "exporting" }
  | { readonly status: "done"; readonly message: string }
  | { readonly status: "error"; readonly message: string };

export interface UseAiSegmentationInput {
  readonly controller: StackViewportController | null;
  readonly series: LoadedSeries | null;
  readonly frameState: StackFrameState;
}

export interface UseAiSegmentationReturn {
  readonly serviceState: AiServiceState;
  readonly workflow: AiWorkflow;
  readonly runState: AiRunState;
  readonly exportState: SegExportState;
  readonly models: readonly SegmentationServiceModel[];
  readonly selectedModelId: string | null;
  readonly promptMode: PromptMode;
  readonly pendingPrompts: readonly PendingPrompt[];
  readonly segments: readonly SegmentDefinition[];
  readonly activeSegmentIndex: number;
  readonly propagate: boolean;
  readonly liveMode: boolean;
  readonly opacity: number;
  readonly canRun: boolean;
  readonly hasMask: boolean;
  readonly lvFunction: LvFunctionResult | null;
  computeFunction: () => void;
  jumpToFrame: (frameIndex: number) => void;
  refreshService: () => void;
  setSelectedModelId: (id: string) => void;
  setPromptMode: (mode: PromptMode) => void;
  addPointPrompt: (canvasPoint: readonly [number, number]) => void;
  addBoxPrompt: (
    start: readonly [number, number],
    end: readonly [number, number]
  ) => void;
  clearPrompts: () => void;
  setActiveSegmentIndex: (index: number) => void;
  addSegment: () => void;
  renameSegment: (index: number, label: string) => void;
  toggleSegmentVisibility: (index: number) => void;
  setPropagate: (value: boolean) => void;
  setLiveMode: (value: boolean) => void;
  setOpacity: (value: number) => void;
  run: () => void;
  cancel: () => void;
  exportSeg: () => void;
}

export function useAiSegmentation(
  input: UseAiSegmentationInput
): UseAiSegmentationReturn {
  const { controller, series, frameState } = input;

  const [serviceState, setServiceState] = useState<AiServiceState>({
    status: "checking"
  });
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [promptMode, setPromptMode] = useState<PromptMode>("off");
  const [pendingPrompts, setPendingPrompts] = useState<readonly PendingPrompt[]>(
    []
  );
  const [segments, setSegments] = useState<readonly SegmentDefinition[]>([
    { index: 1, label: "Segment 1", color: colorForSegment(1), visible: true }
  ]);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(1);
  const [propagate, setPropagate] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [opacity, setOpacityState] = useState(45);
  const [runState, setRunState] = useState<AiRunState>({ status: "idle" });
  const [exportState, setExportState] = useState<SegExportState>({
    status: "idle"
  });
  const [hasMask, setHasMask] = useState(false);
  const [lvFunction, setLvFunction] = useState<LvFunctionResult | null>(null);

  const segmentationIdRef = useRef<SegmentationId | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const liveTimerRef = useRef<number | null>(null);

  // Latest-value mirror so run()/export() never close over stale state.
  const latest = useRef({
    controller,
    series,
    frameState,
    selectedModelId,
    activeSegmentIndex,
    propagate,
    opacity,
    pendingPrompts,
    segments
  });
  latest.current = {
    controller,
    series,
    frameState,
    selectedModelId,
    activeSegmentIndex,
    propagate,
    opacity,
    pendingPrompts,
    segments
  };

  const refreshService = useCallback(() => {
    const refreshController = new AbortController();
    setServiceState({ status: "checking" });

    void fetchSegmentationServiceStatus(refreshController.signal).then((result) => {
      if (refreshController.signal.aborted) {
        return;
      }

      if (!result.ok) {
        setServiceState({ status: "unavailable", message: result.message });
        return;
      }

      if (result.value.status === "ready") {
        setServiceState({ status: "ready", models: result.value.models });
        setSelectedModelId((current) => current ?? result.value.models[0]?.id ?? null);
        return;
      }

      setServiceState({ status: "unavailable", message: result.value.message });
    });
  }, []);

  useEffect(() => {
    refreshService();
  }, [refreshService]);

  // Labelmap lifecycle: one segmentation per loaded series, attached to the
  // active viewport. Recreated on series change; removed on unmount.
  useEffect(() => {
    if (!controller || !series || series.imageIds.length === 0) {
      return;
    }

    const segmentationId = SegmentationId(
      `horalix-seg-${series.seriesInstanceUid}-${series.loadedAt}`
    );
    const created = createStackLabelmap({
      viewportId: controller.viewportId,
      segmentationId,
      referencedImageIds: series.imageIds
    });

    if (!created.ok) {
      segmentationIdRef.current = null;
      return;
    }

    segmentationIdRef.current = segmentationId;
    setLabelmapOpacity(segmentationId, latest.current.opacity / 100);
    setHasMask(false);
    setLvFunction(null);
    setPendingPrompts([]);
    setRunState({ status: "idle" });

    return () => {
      removeLabelmap(segmentationId);
      if (segmentationIdRef.current === segmentationId) {
        segmentationIdRef.current = null;
      }
    };
  }, [controller, series]);

  const clearPrompts = useCallback(() => {
    setPendingPrompts([]);
  }, []);

  const doRun = useCallback(async () => {
    const {
      controller: ctrl,
      series: activeSeries,
      frameState: frame,
      selectedModelId: modelId,
      activeSegmentIndex: segmentIndex,
      propagate: shouldPropagate,
      opacity: alpha,
      pendingPrompts: prompts
    } = latest.current;
    const segmentationId = segmentationIdRef.current;
    const reference = activeImageReference(activeSeries, frame);

    if (
      !ctrl ||
      !activeSeries ||
      !segmentationId ||
      !modelId ||
      !reference ||
      prompts.length === 0
    ) {
      return;
    }

    abortRef.current?.abort();
    const abortController = new AbortController();
    abortRef.current = abortController;
    setRunState({ status: "running" });
    setLvFunction(null);

    const request: SegmentationRequest = {
      modelId,
      image: {
        studyInstanceUid: reference.studyInstanceUid,
        seriesInstanceUid: reference.seriesInstanceUid,
        sopInstanceUid: reference.sopInstanceUid,
        frameIndex: reference.frameIndex
      },
      prompts: prompts.map((pending) => pending.prompt),
      segmentIndex,
      propagate: shouldPropagate
    };

    const result = await runSegmentation(request, {
      endpoint: "/api/segment",
      signal: abortController.signal
    });

    if (abortController.signal.aborted) {
      return;
    }

    if (!result.ok) {
      if (result.error.reason === "aborted") {
        return;
      }
      setRunState({ status: "error", message: result.error.message });
      return;
    }

    try {
      setSegmentColor(
        ctrl.viewportId,
        segmentationId,
        segmentIndex,
        colorForSegment(segmentIndex)
      );

      let written = 0;
      for (const maskFrame of result.value.frames) {
        const target = imageIdForFrame(
          activeSeries,
          reference.sopInstanceUid,
          maskFrame.frameIndex
        );

        if (!target) {
          continue;
        }

        const wrote = writeFrameMask({
          segmentationId,
          referencedImageId: target.imageId,
          mask: maskFrame.mask,
          width: maskFrame.width,
          height: maskFrame.height,
          segmentIndex
        });

        if (wrote.ok) {
          written += 1;
        }
      }

      setActiveSegment(ctrl.viewportId, segmentationId, segmentIndex);
      setLabelmapOpacity(segmentationId, alpha / 100);
      setHasMask(written > 0);
      setRunState({
        status: "done",
        provenance: {
          modelId: result.value.modelId,
          modelVersion: result.value.modelVersion,
          confidence: result.value.confidence,
          inferenceMs: result.value.inferenceMs,
          frameCount: written,
          at: new Date().toISOString()
        }
      });
    } catch (error) {
      setRunState({
        status: "error",
        message:
          error instanceof Error ? error.message : "Failed to render the mask."
      });
    }
  }, []);

  const run = useCallback(() => {
    void doRun();
  }, [doRun]);

  const scheduleLiveRun = useCallback(() => {
    if (liveTimerRef.current !== null) {
      window.clearTimeout(liveTimerRef.current);
    }
    liveTimerRef.current = window.setTimeout(() => {
      liveTimerRef.current = null;
      void doRun();
    }, LIVE_DEBOUNCE_MS);
  }, [doRun]);

  const addPointPrompt = useCallback(
    (canvasPoint: readonly [number, number]) => {
      const ctrl = latest.current.controller;
      if (!ctrl) {
        return;
      }

      const image = ctrl.toImagePoint(canvasPoint);
      if (!image) {
        return;
      }

      const include = promptMode !== "point-exclude";
      setPendingPrompts((current) => [
        ...current,
        {
          id: createPromptId(),
          prompt: { kind: "point", x: image.x, y: image.y, include },
          display: { kind: "point", x: canvasPoint[0], y: canvasPoint[1], include }
        }
      ]);

      if (liveMode) {
        scheduleLiveRun();
      }
    },
    [promptMode, liveMode, scheduleLiveRun]
  );

  const addBoxPrompt = useCallback(
    (start: readonly [number, number], end: readonly [number, number]) => {
      const ctrl = latest.current.controller;
      if (!ctrl) {
        return;
      }

      const box = ctrl.toImageBox(start, end);
      if (!box) {
        return;
      }

      const displayX = Math.min(start[0], end[0]);
      const displayY = Math.min(start[1], end[1]);
      const displayWidth = Math.abs(start[0] - end[0]);
      const displayHeight = Math.abs(start[1] - end[1]);

      setPendingPrompts((current) => [
        ...current,
        {
          id: createPromptId(),
          prompt: {
            kind: "box",
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height
          },
          display: {
            kind: "box",
            x: displayX,
            y: displayY,
            width: displayWidth,
            height: displayHeight
          }
        }
      ]);

      if (liveMode) {
        scheduleLiveRun();
      }
    },
    [liveMode, scheduleLiveRun]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunState({ status: "idle" });
  }, []);

  const addSegment = useCallback(() => {
    setSegments((current) => {
      const nextIndex =
        current.reduce((max, segment) => Math.max(max, segment.index), 0) + 1;
      const created: SegmentDefinition = {
        index: nextIndex,
        label: `Segment ${nextIndex}`,
        color: colorForSegment(nextIndex),
        visible: true
      };
      return [...current, created];
    });
    setActiveSegmentIndex((current) => current);
    setPendingPrompts([]);
  }, []);

  const renameSegment = useCallback((index: number, label: string) => {
    setSegments((current) =>
      current.map((segment) =>
        segment.index === index ? { ...segment, label } : segment
      )
    );
  }, []);

  const toggleSegmentVisibility = useCallback(
    (index: number) => {
      const ctrl = latest.current.controller;
      const segmentationId = segmentationIdRef.current;

      setSegments((current) =>
        current.map((segment) => {
          if (segment.index !== index) {
            return segment;
          }

          const nextVisible = !segment.visible;
          if (ctrl && segmentationId) {
            setSegmentVisibility(
              ctrl.viewportId,
              segmentationId,
              index,
              nextVisible
            );
          }
          return { ...segment, visible: nextVisible };
        })
      );
    },
    []
  );

  const setOpacity = useCallback((value: number) => {
    const clamped = Math.min(Math.max(value, 0), 100);
    setOpacityState(clamped);
    const segmentationId = segmentationIdRef.current;
    if (segmentationId) {
      setLabelmapOpacity(segmentationId, clamped / 100);
    }
  }, []);

  const selectSegment = useCallback((index: number) => {
    setActiveSegmentIndex(index);
    setPendingPrompts([]);
    const ctrl = latest.current.controller;
    const segmentationId = segmentationIdRef.current;
    if (ctrl && segmentationId) {
      setActiveSegment(ctrl.viewportId, segmentationId, index);
    }
  }, []);

  const computeFunction = useCallback(() => {
    const { series: activeSeries, activeSegmentIndex: segmentIndex } =
      latest.current;
    const segmentationId = segmentationIdRef.current;

    if (!activeSeries || !segmentationId) {
      setLvFunction(null);
      return;
    }

    const areas = measureSegmentAreas(
      segmentationId,
      activeSeries.imageIds,
      segmentIndex
    );
    setLvFunction(computeLvFunction(areas));
  }, []);

  const jumpToFrame = useCallback((frameIndex: number) => {
    void latest.current.controller?.setFrameIndex(frameIndex);
  }, []);

  const exportSeg = useCallback(() => {
    const { series: activeSeries } = latest.current;
    const segmentationId = segmentationIdRef.current;

    if (!activeSeries || !segmentationId) {
      setExportState({
        status: "error",
        message: "Load a PACS-backed series and run a segmentation first."
      });
      return;
    }

    setExportState({ status: "exporting" });

    void exportSegmentationToOrthanc({
      segmentationId,
      series: activeSeries,
      segments: latest.current.segments
    }).then((result) => {
      if (result.ok) {
        setExportState({ status: "done", message: result.message });
        return;
      }
      setExportState({ status: "error", message: result.message });
    });
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (liveTimerRef.current !== null) {
        window.clearTimeout(liveTimerRef.current);
      }
    };
  }, []);

  const workflow = useMemo<AiWorkflow>(() => {
    if (serviceState.status === "checking") {
      return { status: "unavailable", message: "Checking segmentation service." };
    }
    if (serviceState.status === "unavailable") {
      return { status: "unavailable", message: serviceState.message };
    }
    if (!series) {
      return { status: "idle" };
    }
    if (series.source === "local") {
      return {
        status: "unavailable",
        message: "Push local files to Orthanc before inference."
      };
    }
    if (!activeImageReference(series, frameState)) {
      return { status: "unavailable", message: "No PACS-backed frame is active." };
    }
    return pendingPrompts.length > 0
      ? { status: "ready" }
      : { status: "needs_prompt" };
  }, [serviceState, series, frameState, pendingPrompts.length]);

  const canRun =
    workflow.status === "ready" &&
    selectedModelId !== null &&
    runState.status !== "running";

  const models = serviceState.status === "ready" ? serviceState.models : [];

  return {
    serviceState,
    workflow,
    runState,
    exportState,
    models,
    selectedModelId,
    promptMode,
    pendingPrompts,
    segments,
    activeSegmentIndex,
    propagate,
    liveMode,
    opacity,
    canRun,
    hasMask,
    lvFunction,
    computeFunction,
    jumpToFrame,
    refreshService,
    setSelectedModelId,
    setPromptMode,
    addPointPrompt,
    addBoxPrompt,
    clearPrompts,
    setActiveSegmentIndex: selectSegment,
    addSegment,
    renameSegment,
    toggleSegmentVisibility,
    setPropagate,
    setLiveMode,
    setOpacity,
    run,
    cancel,
    exportSeg
  };
}
