/**
 * Optional UDP forwarder for video board payloads.
 *
 * The in-arena video board renderer can listen on a UDP port for
 * sub-frame-latency clock anchor packets. If `VIDEO_BOARD_UDP_TARGET`
 * is set (format `host:port`), each VideoBoardPayload that hits the
 * /api/projection/video-board route is also serialized as JSON and
 * sent as a UDP datagram.
 *
 * UDP is fire-and-forget and lossy by design — the renderer's local
 * clock extrapolation between sync points absorbs jitter and dropped
 * packets, so we don't track delivery.
 */
import { createSocket } from 'dgram';

import type { VideoBoardPayload } from './projectionTypes.js';

let target: { host: string; port: number } | null = null;
const socket = createSocket('udp4');

export function configureVideoBoardForwarder(rawTarget?: string): void {
  if (!rawTarget) {
    target = null;
    return;
  }
  const [host, portRaw] = rawTarget.split(':');
  const port = Number(portRaw);
  if (!host || !Number.isFinite(port) || port <= 0) {
    console.warn(`[videoBoardForwarder] invalid VIDEO_BOARD_UDP_TARGET: "${rawTarget}"`);
    target = null;
    return;
  }
  target = { host, port };
  console.log(`[videoBoardForwarder] forwarding video-board payloads to udp://${host}:${port}`);
}

export function forwardVideoBoardPayload(payload: VideoBoardPayload): void {
  if (!target) return;
  const data = Buffer.from(JSON.stringify(payload));
  socket.send(data, target.port, target.host, (err) => {
    if (err) console.warn(`[videoBoardForwarder] send failed: ${err.message}`);
  });
}

// Test/cleanup helper.
export function shutdownVideoBoardForwarder(): void {
  target = null;
  socket.close();
}
