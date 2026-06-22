import {
  Enums as CoreEnums,
  RenderingEngine,
  eventTarget,
  type StackViewport
} from "@cornerstonejs/core";
import {
  AngleTool,
  BidirectionalTool,
  Enums as ToolsEnums,
  LengthTool,
  PanTool,
  ProbeTool,
  RectangleROITool,
  StackScrollTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool,
  annotation
} from "@cornerstonejs/tools";

import {
  AnnotationUid,
  ImageId,
  RenderingEngineId,
  ToolGroupId,
  ViewportId
} from "./brand";
import {
  toCornerstoneToolName,
  toMeasurement,
  type Measurement,
  type MeasurementToolName
} from "./measurement";
import { ensureCornerstoneRuntime, type CornerstoneRuntimeOptions } from "./runtime";
import { err, getErrorMessage, ok, type Result } from "./result";
import {
  canvasCornersToImageBox,
  canvasToImagePoint,
  type ImagePoint
} from "./segmentation-prompts";
import { toVoiRange, type WindowLevelPreset } from "./window-level";

export type ViewportError =
  | { reason: "runtime"; message: string }
  | { reason: "tool_group"; message: string }
  | { reason: "render"; message: string };

export interface StackViewportInput {
  readonly element: HTMLDivElement;
  readonly renderingEngineId: RenderingEngineId;
  readonly runtime?: CornerstoneRuntimeOptions;
  readonly toolGroupId: ToolGroupId;
  readonly viewportId: ViewportId;
}

export interface LoadStackOptions {
  readonly currentImageIdIndex?: number;
  readonly windowLevel?: WindowLevelPreset;
}

export interface StackFrameState {
  readonly currentImageId: ImageId | null;
  readonly currentIndex: number;
  readonly total: number;
}

export interface StackViewportController {
  readonly renderingEngineId: RenderingEngineId;
  readonly toolGroupId: ToolGroupId;
  readonly viewport: StackViewport;
  readonly viewportId: ViewportId;
  destroy: () => void;
  getActiveTool: () => MeasurementToolName | null;
  getFrameState: () => StackFrameState;
  getMeasurements: () => readonly Measurement[];
  loadStack: (
    imageIds: readonly ImageId[],
    options?: LoadStackOptions
  ) => Promise<Result<void, ViewportError>>;
  removeMeasurement: (uid: AnnotationUid) => void;
  setActiveTool: (tool: MeasurementToolName | null) => void;
  setFrameIndex: (imageIdIndex: number) => Promise<Result<StackFrameState, ViewportError>>;
  setWindowLevel: (preset: WindowLevelPreset) => void;
  stepFrame: (
    delta: number,
    options?: { readonly loop?: boolean }
  ) => Promise<Result<StackFrameState, ViewportError>>;
  subscribeToFrameChange: (listener: (state: StackFrameState) => void) => () => void;
  subscribeToMeasurements: (listener: () => void) => () => void;
  /** Map a canvas point (CSS px) to image-pixel coords on the current frame. */
  toImagePoint: (canvasPoint: readonly [number, number]) => ImagePoint | null;
  /** Map two canvas corners to an image-pixel box on the current frame. */
  toImageBox: (
    start: readonly [number, number],
    end: readonly [number, number]
  ) => {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
}

export function createStackViewport(
  input: StackViewportInput
): Result<StackViewportController, ViewportError> {
  try {
    ensureCornerstoneRuntime(input.runtime);
  } catch (error) {
    return err({ reason: "runtime", message: getErrorMessage(error) });
  }

  const renderingEngine = new RenderingEngine(input.renderingEngineId);

  renderingEngine.enableElement({
    element: input.element,
    viewportId: input.viewportId,
    type: CoreEnums.ViewportType.STACK,
    defaultOptions: {
      background: [0, 0, 0]
    }
  });

  const viewport = renderingEngine.getStackViewport(input.viewportId);
  const toolGroupResult = configureDefaultToolGroup({
    renderingEngineId: input.renderingEngineId,
    toolGroupId: input.toolGroupId,
    viewportId: input.viewportId
  });

  if (!toolGroupResult.ok) {
    renderingEngine.destroy();
    return toolGroupResult;
  }

  const measurementListeners = new Set<() => void>();
  let measurementSnapshot: readonly Measurement[] = readMeasurementSnapshot();
  let activeTool: MeasurementToolName | null = null;

  const handleAnnotationChange = (): void => {
    measurementSnapshot = readMeasurementSnapshot();
    for (const listener of measurementListeners) {
      listener();
    }
  };

  for (const eventName of ANNOTATION_EVENT_NAMES) {
    eventTarget.addEventListener(eventName, handleAnnotationChange);
  }

  return ok({
    renderingEngineId: input.renderingEngineId,
    toolGroupId: input.toolGroupId,
    viewport,
    viewportId: input.viewportId,
    destroy: () => {
      for (const eventName of ANNOTATION_EVENT_NAMES) {
        eventTarget.removeEventListener(eventName, handleAnnotationChange);
      }
      measurementListeners.clear();
      ToolGroupManager.destroyToolGroup(input.toolGroupId);
      renderingEngine.destroy();
    },
    getActiveTool: () => activeTool,
    getFrameState: () => getStackFrameState(viewport),
    getMeasurements: () => measurementSnapshot,
    loadStack: async (imageIds, options) => {
      try {
        await viewport.setStack([...imageIds], options?.currentImageIdIndex ?? 0);

        if (options?.windowLevel) {
          viewport.setProperties({
            voiRange: toVoiRange(options.windowLevel)
          });
        }

        viewport.render();
        return ok(undefined);
      } catch (error) {
        return err({ reason: "render", message: getErrorMessage(error) });
      }
    },
    setFrameIndex: async (imageIdIndex) => setViewportFrameIndex(viewport, imageIdIndex),
    removeMeasurement: (uid) => {
      annotation.state.removeAnnotation(uid);
      viewport.render();
    },
    setActiveTool: (tool) => {
      setStackActiveTool({ activeTool: tool, toolGroupId: input.toolGroupId });
      activeTool = tool;
    },
    setWindowLevel: (preset) => {
      viewport.setProperties({
        voiRange: toVoiRange(preset)
      });
      viewport.render();
    },
    stepFrame: async (delta, options) => {
      const state = getStackFrameState(viewport);
      const nextIndex = getNextFrameIndex({
        currentIndex: state.currentIndex,
        delta,
        loop: options?.loop ?? false,
        total: state.total
      });

      return setViewportFrameIndex(viewport, nextIndex);
    },
    subscribeToFrameChange: (listener) => {
      const handleFrameChange = () => {
        listener(getStackFrameState(viewport));
      };

      viewport.element.addEventListener(CoreEnums.Events.STACK_NEW_IMAGE, handleFrameChange);
      viewport.element.addEventListener(
        CoreEnums.Events.STACK_VIEWPORT_SCROLL,
        handleFrameChange
      );

      return () => {
        viewport.element.removeEventListener(
          CoreEnums.Events.STACK_NEW_IMAGE,
          handleFrameChange
        );
        viewport.element.removeEventListener(
          CoreEnums.Events.STACK_VIEWPORT_SCROLL,
          handleFrameChange
        );
      };
    },
    subscribeToMeasurements: (listener) => {
      measurementListeners.add(listener);
      return () => {
        measurementListeners.delete(listener);
      };
    },
    toImagePoint: (canvasPoint) => canvasToImagePoint(viewport, canvasPoint),
    toImageBox: (start, end) => canvasCornersToImageBox(viewport, start, end)
  });
}

interface ConfigureToolGroupInput {
  readonly renderingEngineId: RenderingEngineId;
  readonly toolGroupId: ToolGroupId;
  readonly viewportId: ViewportId;
}

function configureDefaultToolGroup(
  input: ConfigureToolGroupInput
): Result<void, ViewportError> {
  const toolGroup =
    ToolGroupManager.getToolGroup(input.toolGroupId) ??
    ToolGroupManager.createToolGroup(input.toolGroupId);

  if (!toolGroup) {
    return err({
      reason: "tool_group",
      message: `Unable to create tool group ${input.toolGroupId}`
    });
  }

  for (const toolName of DEFAULT_TOOL_NAMES) {
    if (!toolGroup.hasTool(toolName)) {
      toolGroup.addTool(toolName);
    }
  }

  if (!toolGroup.getViewportIds().includes(input.viewportId)) {
    toolGroup.addViewport(input.viewportId, input.renderingEngineId);
  }

  toolGroup.setToolActive(WindowLevelTool.toolName, {
    bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }]
  });
  toolGroup.setToolActive(ZoomTool.toolName, {
    bindings: [{ mouseButton: ToolsEnums.MouseBindings.Secondary }]
  });
  toolGroup.setToolActive(PanTool.toolName, {
    bindings: [{ mouseButton: ToolsEnums.MouseBindings.Auxiliary }]
  });
  toolGroup.setToolActive(StackScrollTool.toolName, {
    bindings: [{ mouseButton: ToolsEnums.MouseBindings.Wheel }]
  });

  for (const toolName of ANNOTATION_TOOL_NAMES) {
    toolGroup.setToolPassive(toolName);
  }

  return ok(undefined);
}

const DEFAULT_TOOL_NAMES = [
  WindowLevelTool.toolName,
  PanTool.toolName,
  ZoomTool.toolName,
  StackScrollTool.toolName,
  LengthTool.toolName,
  ProbeTool.toolName,
  RectangleROITool.toolName,
  BidirectionalTool.toolName,
  AngleTool.toolName
] as const;

const ANNOTATION_TOOL_NAMES = [
  LengthTool.toolName,
  ProbeTool.toolName,
  RectangleROITool.toolName,
  BidirectionalTool.toolName,
  AngleTool.toolName
] as const;

const ANNOTATION_EVENT_NAMES = [
  ToolsEnums.Events.ANNOTATION_ADDED,
  ToolsEnums.Events.ANNOTATION_COMPLETED,
  ToolsEnums.Events.ANNOTATION_MODIFIED,
  ToolsEnums.Events.ANNOTATION_REMOVED
] as const;

function setStackActiveTool(input: {
  readonly activeTool: MeasurementToolName | null;
  readonly toolGroupId: ToolGroupId;
}): void {
  const toolGroup = ToolGroupManager.getToolGroup(input.toolGroupId);

  if (!toolGroup) {
    return;
  }

  for (const toolName of ANNOTATION_TOOL_NAMES) {
    toolGroup.setToolPassive(toolName);
  }

  if (input.activeTool === null) {
    toolGroup.setToolActive(WindowLevelTool.toolName, {
      bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }]
    });
    return;
  }

  toolGroup.setToolPassive(WindowLevelTool.toolName);
  toolGroup.setToolActive(toCornerstoneToolName(input.activeTool), {
    bindings: [{ mouseButton: ToolsEnums.MouseBindings.Primary }]
  });
}

function readMeasurementSnapshot(): readonly Measurement[] {
  return annotation.state
    .getAllAnnotations()
    .map(toMeasurement)
    .filter((measurement): measurement is Measurement => measurement !== null);
}

async function setViewportFrameIndex(
  viewport: StackViewport,
  imageIdIndex: number
): Promise<Result<StackFrameState, ViewportError>> {
  const total = viewport.getImageIds().length;

  if (total === 0) {
    return ok(getStackFrameState(viewport));
  }

  try {
    await viewport.setImageIdIndex(clampFrameIndex(imageIdIndex, total));
    viewport.render();
    return ok(getStackFrameState(viewport));
  } catch (error) {
    return err({ reason: "render", message: getErrorMessage(error) });
  }
}

function getStackFrameState(viewport: StackViewport): StackFrameState {
  const imageIds = viewport.getImageIds();
  const total = imageIds.length;

  if (total === 0) {
    return {
      currentImageId: null,
      currentIndex: 0,
      total
    };
  }

  const currentIndex = clampFrameIndex(viewport.getCurrentImageIdIndex(), total);
  const currentImageId = imageIds[currentIndex];

  return {
    currentImageId: currentImageId ? ImageId(currentImageId) : null,
    currentIndex,
    total
  };
}

function getNextFrameIndex(input: {
  readonly currentIndex: number;
  readonly delta: number;
  readonly loop: boolean;
  readonly total: number;
}): number {
  if (input.total < 1) {
    return 0;
  }

  const nextIndex = input.currentIndex + input.delta;

  if (input.loop) {
    return modulo(nextIndex, input.total);
  }

  return clampFrameIndex(nextIndex, input.total);
}

function clampFrameIndex(imageIdIndex: number, total: number): number {
  return Math.min(Math.max(Math.trunc(imageIdIndex), 0), Math.max(total - 1, 0));
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}
