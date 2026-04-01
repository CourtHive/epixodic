import type { ClockConfig, ClockDirection, ClockState } from './types';

/**
 * Drift-free clock using performance.now() and requestAnimationFrame.
 * Supports countdown and countup, pause/resume, and tick callbacks.
 * Pure TypeScript — no DOM or framework dependency.
 */
export class Clock {
  readonly id: string;
  readonly durationMs: number;
  readonly direction: ClockDirection;

  private state: ClockState = 'idle';
  private elapsedMs = 0;
  private lastTimestamp: number | null = null;
  private rafId: number | null = null;
  private tickIntervalMs: number;
  private lastTickMs = 0;

  private onTick?: (remainingMs: number, elapsedMs: number) => void;
  private onExpire?: () => void;
  private onPause?: () => void;
  private onResume?: () => void;

  constructor(config: ClockConfig) {
    this.id = config.id;
    this.durationMs = config.durationMs;
    this.direction = config.direction ?? 'down';
    this.tickIntervalMs = config.tickIntervalMs ?? 100;
    this.onTick = config.onTick;
    this.onExpire = config.onExpire;
    this.onPause = config.onPause;
    this.onResume = config.onResume;

    if (config.autoStart) this.start();
  }

  start(): void {
    if (this.state === 'running') return;
    this.state = 'running';
    this.lastTimestamp = performance.now();
    this.lastTickMs = this.elapsedMs;
    this.tick();
  }

  pause(): void {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.cancelRaf();
    this.onPause?.();
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.state = 'running';
    this.lastTimestamp = performance.now();
    this.lastTickMs = this.elapsedMs;
    this.onResume?.();
    this.tick();
  }

  reset(): void {
    this.cancelRaf();
    this.elapsedMs = 0;
    this.lastTimestamp = null;
    this.lastTickMs = 0;
    this.state = 'idle';
  }

  stop(): void {
    this.cancelRaf();
    this.state = 'idle';
  }

  restart(): void {
    this.reset();
    this.start();
  }

  getState(): ClockState {
    return this.state;
  }

  getElapsedMs(): number {
    return this.elapsedMs;
  }

  getRemainingMs(): number {
    return Math.max(0, this.durationMs - this.elapsedMs);
  }

  setCallbacks(callbacks: {
    onTick?: (remainingMs: number, elapsedMs: number) => void;
    onExpire?: () => void;
    onPause?: () => void;
    onResume?: () => void;
  }): void {
    if (callbacks.onTick !== undefined) this.onTick = callbacks.onTick;
    if (callbacks.onExpire !== undefined) this.onExpire = callbacks.onExpire;
    if (callbacks.onPause !== undefined) this.onPause = callbacks.onPause;
    if (callbacks.onResume !== undefined) this.onResume = callbacks.onResume;
  }

  private tick(): void {
    if (this.state !== 'running') return;

    this.rafId = requestAnimationFrame((now) => {
      if (this.state !== 'running') return;

      const delta = now - (this.lastTimestamp ?? now);
      this.lastTimestamp = now;
      this.elapsedMs += delta;

      // Check expiry for countdown clocks
      if (this.direction === 'down' && this.elapsedMs >= this.durationMs) {
        this.elapsedMs = this.durationMs;
        this.state = 'expired';
        this.fireTick();
        this.onExpire?.();
        return;
      }

      // Fire tick at configured interval
      if (this.elapsedMs - this.lastTickMs >= this.tickIntervalMs) {
        this.fireTick();
        this.lastTickMs = this.elapsedMs;
      }

      this.tick();
    });
  }

  private fireTick(): void {
    this.onTick?.(this.getRemainingMs(), this.elapsedMs);
  }

  private cancelRaf(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastTimestamp = null;
  }
}
