import type { Measurement, StackViewportController } from "@horalix/dicom-engine";
import { useCallback, useSyncExternalStore } from "react";

const EMPTY_MEASUREMENTS: readonly Measurement[] = [];

const noop = (): void => {};

/**
 * Tear-free bridge from the engine's annotation event stream to React. The
 * controller caches its snapshot and only recomputes on annotation events, so
 * `getSnapshot` returns a stable reference between changes — the contract
 * {@link useSyncExternalStore} requires. Returns an empty list until the
 * viewport controller has mounted.
 */
export function useMeasurements(
  controller: StackViewportController | null
): readonly Measurement[] {
  const subscribe = useCallback(
    (onStoreChange: () => void) =>
      controller ? controller.subscribeToMeasurements(onStoreChange) : noop,
    [controller]
  );

  const getSnapshot = useCallback(
    () => (controller ? controller.getMeasurements() : EMPTY_MEASUREMENTS),
    [controller]
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
