import { init as initCore, isCornerstoneInitialized } from "@cornerstonejs/core";
import { init as initDicomImageLoader } from "@cornerstonejs/dicom-image-loader";
import {
  addTool,
  AngleTool,
  BidirectionalTool,
  LengthTool,
  PanTool,
  ProbeTool,
  RectangleROITool,
  StackScrollTool,
  WindowLevelTool,
  ZoomTool,
  init as initTools
} from "@cornerstonejs/tools";

export interface CornerstoneRuntimeOptions {
  readonly maxWebWorkers?: number;
  readonly strictDicom?: boolean;
}

let toolsRegistered = false;

export function ensureCornerstoneRuntime(
  options: CornerstoneRuntimeOptions = {}
): void {
  if (!isCornerstoneInitialized()) {
    initCore();
  }

  initDicomImageLoader({
    maxWebWorkers: options.maxWebWorkers ?? 2,
    strict: options.strictDicom ?? false
  });

  initTools();
  registerDefaultTools();
}

function registerDefaultTools(): void {
  if (toolsRegistered) {
    return;
  }

  for (const ToolClass of DEFAULT_TOOL_CLASSES) {
    addTool(ToolClass);
  }

  toolsRegistered = true;
}

const DEFAULT_TOOL_CLASSES = [
  WindowLevelTool,
  PanTool,
  ZoomTool,
  StackScrollTool,
  LengthTool,
  ProbeTool,
  RectangleROITool,
  BidirectionalTool,
  AngleTool
] as const;
