/**
 * Format milliseconds as a time string.
 * - MM:SS for times >= 60 seconds (e.g., "10:00", "07:23")
 * - :SS for times < 60 seconds (e.g., ":14", ":03")
 * - :SS.T with tenths if showTenths is true (e.g., ":03.7")
 */
export function formatTime(ms: number, options?: { showTenths?: boolean }): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  if (options?.showTenths) {
    const tenths = Math.floor((Math.max(0, ms) % 1000) / 100);
    if (minutes > 0) return `${minutes}:${pad(seconds)}.${tenths}`;
    return `:${pad(seconds)}.${tenths}`;
  }

  if (minutes > 0) return `${minutes}:${pad(seconds)}`;
  return `:${pad(seconds)}`;
}
