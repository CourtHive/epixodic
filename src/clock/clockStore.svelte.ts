import type { ClockConfig, ClockState } from './types';
import { clockManager } from './ClockManager';

/**
 * Reactive clock store. Each named clock's state is tracked as $state
 * so Svelte components can bind directly to remaining time and state.
 */

interface ClockSnapshot {
  remainingMs: number;
  elapsedMs: number;
  state: ClockState;
}

let snapshots = $state<Record<string, ClockSnapshot>>({});

function updateSnapshot(id: string, remainingMs: number, elapsedMs: number, clockState: ClockState) {
  snapshots[id] = { remainingMs, elapsedMs, state: clockState };
}

export function getClockStore() {
  return {
    get snapshots() {
      return snapshots;
    },
  };
}

export function getClockSnapshot(id: string): ClockSnapshot | undefined {
  return snapshots[id];
}

export function createClock(config: ClockConfig) {
  const originalOnTick = config.onTick;
  const originalOnExpire = config.onExpire;
  const originalOnPause = config.onPause;
  const originalOnResume = config.onResume;

  const clock = clockManager.create({
    ...config,
    onTick: (remaining, elapsed) => {
      updateSnapshot(config.id, remaining, elapsed, 'running');
      originalOnTick?.(remaining, elapsed);
    },
    onExpire: () => {
      updateSnapshot(config.id, 0, clock.getElapsedMs(), 'expired');
      originalOnExpire?.();
    },
    onPause: () => {
      updateSnapshot(config.id, clock.getRemainingMs(), clock.getElapsedMs(), 'paused');
      originalOnPause?.();
    },
    onResume: () => {
      updateSnapshot(config.id, clock.getRemainingMs(), clock.getElapsedMs(), 'running');
      originalOnResume?.();
    },
  });

  // Initialize snapshot
  updateSnapshot(config.id, config.durationMs, 0, config.autoStart ? 'running' : 'idle');

  return clock;
}

export function destroyClock(id: string) {
  clockManager.destroy(id);
  const updated = { ...snapshots };
  delete updated[id];
  snapshots = updated;
}

export function destroyAllClocks() {
  clockManager.destroyAll();
  snapshots = {};
}

export function pauseClock(id: string) {
  clockManager.get(id)?.pause();
}

export function resumeClock(id: string) {
  clockManager.get(id)?.resume();
}

export function resetClock(id: string) {
  const clock = clockManager.get(id);
  if (clock) {
    clock.reset();
    updateSnapshot(id, clock.getRemainingMs(), 0, 'idle');
  }
}

export function restartClock(id: string) {
  const clock = clockManager.get(id);
  if (clock) {
    clock.restart();
    updateSnapshot(id, clock.getRemainingMs(), 0, 'running');
  }
}
