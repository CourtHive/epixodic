import type { ClockConfig } from './types';
import { Clock } from './Clock';

/**
 * Manages multiple named clocks. Singleton pattern.
 */
export class ClockManager {
  private readonly clocks = new Map<string, Clock>();

  create(config: ClockConfig): Clock {
    this.destroy(config.id);
    const clock = new Clock(config);
    this.clocks.set(config.id, clock);
    return clock;
  }

  get(id: string): Clock | undefined {
    return this.clocks.get(id);
  }

  has(id: string): boolean {
    return this.clocks.has(id);
  }

  destroy(id: string): void {
    const clock = this.clocks.get(id);
    if (clock) {
      clock.stop();
      this.clocks.delete(id);
    }
  }

  destroyAll(): void {
    for (const clock of this.clocks.values()) {
      clock.stop();
    }
    this.clocks.clear();
  }

  pauseAll(): void {
    for (const clock of this.clocks.values()) {
      if (clock.getState() === 'running') clock.pause();
    }
  }

  resumeAll(): void {
    for (const clock of this.clocks.values()) {
      if (clock.getState() === 'paused') clock.resume();
    }
  }

  getAll(): Clock[] {
    return Array.from(this.clocks.values());
  }
}

export const clockManager = new ClockManager();
