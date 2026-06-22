import {
  Enums as CoreEnums,
  RenderingEngine,
  setVolumesForViewports,
  volumeLoader
} from "@cornerstonejs/core";
import {
  Enums as ToolsEnums,
  PanTool,
  StackScrollTool,
  ToolGroupManager,
  WindowLevelTool,
  ZoomTool
} from "@cornerstonejs/tools";

import {
  ViewportId,
  type ImageId,
  type RenderingEngineId,
  type ToolGroupId,
  type VolumeId
} from "./brand";
import { ensureCornerstoneRuntime, type CornerstoneRuntimeOptions } from "./runtime";
import { err, getErrorMessage, ok, type Result } from "./result";
import { toVoiRange, type WindowLevelPreset } from "./window-level";

/**
 * Volume / MPR rendering. CT and MR are 3D volumes that share **one** cached
 * volume across axial/coronal/sagittal viewports (the memory win, and the
 * reason annotations live in world space). A 2D stack (X-ray, echo loop) must
 * NOT be forced into a volume — callers decide via geometry before mounting
 * this. Window/level is applied per the modality-corrected VOI range, exactly
 * as the stack path does.
 */

export type VolumeError =
  | { reason: "runtime"; message: string }
  | { reason: "tool_group"; message: string }
  | { reason: "volume"; message: string }
  | { reason: "render"; message: string };

export interface MprViewportElements {
  readonly axial: HTMLDivElement;
  readonly coronal: HTMLDivElement;
  readonly sagittal: HTMLDivElement;
}

export interface CreateMprInput {
  readonly elements: MprViewportElements;
  readonly imageIds: readonly ImageId[];
  readonly renderingEngineId: RenderingEngineId;
  readonly runtime?: CornerstoneRuntimeOptions;
  readonly toolGroupId: ToolGroupId;
  readonly volumeId: VolumeId;
  readonly windowLevel?: WindowLevelPreset;
}

export interface MprController {
  readonly renderingEngineId: RenderingEngineId;
  readonly toolGroupId: ToolGroupId;
  readonly viewportIds: readonly ViewportId[];
  readonly volumeId: VolumeId;
  destroy: () => void;
  setWindowLevel: (preset: WindowLevelPreset) => void;
}

const AXIAL_VIEWPORT_ID = "horalix-mpr-axial";
const CORONAL_VIEWPORT_ID = "horalix-mpr-coronal";
const SAGITTAL_VIEWPORT_ID = "horalix-mpr-sagittal";

export async function createMprViewports(
  input: CreateMprInput
): Promise<Result<MprController, VolumeError>> {
  try {
    ensureCornerstoneRuntime(input.runtime);
  } catch (error) {
    return err({ reason: "runtime", message: getErrorMessage(error) });
  }

  if (input.imageIds.length < 2) {
    return err({
      reason: "volume",
      message: "MPR needs a multi-slice volumetric series."
    });
  }

  const renderingEngine = new RenderingEngine(input.renderingEngineId);
  const axialId = AXIAL_VIEWPORT_ID;
  const coronalId = CORONAL_VIEWPORT_ID;
  const sagittalId = SAGITTAL_VIEWPORT_ID;
  const viewportIds = [axialId, coronalId, sagittalId];

  renderingEngine.setViewports([
    {
      viewportId: axialId,
      type: CoreEnums.ViewportType.ORTHOGRAPHIC,
      element: input.elements.axial,
      defaultOptions: {
        orientation: CoreEnums.OrientationAxis.AXIAL,
        background: [0, 0, 0]
      }
    },
    {
      viewportId: coronalId,
      type: CoreEnums.ViewportType.ORTHOGRAPHIC,
      element: input.elements.coronal,
      defaultOptions: {
        orientation: CoreEnums.OrientationAxis.CORONAL,
        background: [0, 0, 0]
      }
    },
    {
      viewportId: sagittalId,
      type: CoreEnums.ViewportType.ORTHOGRAPHIC,
      element: input.elements.sagittal,
      defaultOptions: {
        orientation: CoreEnums.OrientationAxis.SAGITTAL,
        background: [0, 0, 0]
      }
    }
  ]);

  const toolGroupResult = configureVolumeToolGroup({
    renderingEngineId: input.renderingEngineId,
    toolGroupId: input.toolGroupId,
    viewportIds
  });

  if (!toolGroupResult.ok) {
    renderingEngine.destroy();
    return toolGroupResult;
  }

  try {
    await volumeLoader.createAndCacheVolumeFromImages(input.volumeId, [
      ...input.imageIds
    ]);

    await setVolumesForViewports(
      renderingEngine,
      [{ volumeId: input.volumeId }],
      viewportIds
    );
  } catch (error) {
    ToolGroupManager.destroyToolGroup(input.toolGroupId);
    renderingEngine.destroy();
    return err({ reason: "volume", message: getErrorMessage(error) });
  }

  const applyWindowLevel = (preset: WindowLevelPreset): void => {
    const voiRange = toVoiRange(preset);
    for (const viewport of renderingEngine.getVolumeViewports()) {
      viewport.setProperties({ voiRange }, input.volumeId);
    }
    renderingEngine.renderViewports(viewportIds);
  };

  if (input.windowLevel) {
    applyWindowLevel(input.windowLevel);
  } else {
    renderingEngine.renderViewports(viewportIds);
  }

  return ok({
    renderingEngineId: input.renderingEngineId,
    toolGroupId: input.toolGroupId,
    viewportIds: viewportIds.map((id) => ViewportId(id)),
    volumeId: input.volumeId,
    destroy: () => {
      ToolGroupManager.destroyToolGroup(input.toolGroupId);
      renderingEngine.destroy();
    },
    setWindowLevel: applyWindowLevel
  });
}

interface ConfigureVolumeToolGroupInput {
  readonly renderingEngineId: RenderingEngineId;
  readonly toolGroupId: ToolGroupId;
  readonly viewportIds: readonly string[];
}

function configureVolumeToolGroup(
  input: ConfigureVolumeToolGroupInput
): Result<void, VolumeError> {
  const toolGroup =
    ToolGroupManager.getToolGroup(input.toolGroupId) ??
    ToolGroupManager.createToolGroup(input.toolGroupId);

  if (!toolGroup) {
    return err({
      reason: "tool_group",
      message: `Unable to create MPR tool group ${input.toolGroupId}`
    });
  }

  for (const toolName of VOLUME_TOOL_NAMES) {
    if (!toolGroup.hasTool(toolName)) {
      toolGroup.addTool(toolName);
    }
  }

  for (const viewportId of input.viewportIds) {
    if (!toolGroup.getViewportIds().includes(viewportId)) {
      toolGroup.addViewport(viewportId, input.renderingEngineId);
    }
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

  return ok(undefined);
}

const VOLUME_TOOL_NAMES = [
  WindowLevelTool.toolName,
  PanTool.toolName,
  ZoomTool.toolName,
  StackScrollTool.toolName
] as const;
