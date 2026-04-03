export type ClockDirection = 'up' | 'down';
export type ClockState = 'idle' | 'running' | 'paused' | 'expired';

export interface ClockConfig {
  id: string;
  durationMs: number;
  direction?: ClockDirection; // default: 'down'
  autoStart?: boolean;
  tickIntervalMs?: number; // default: 100 (10 fps)
  onTick?: (remainingMs: number, elapsedMs: number) => void;
  onExpire?: () => void;
  onPause?: () => void;
  onResume?: () => void;
}
