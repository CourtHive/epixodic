import { Server } from 'socket.io';
import type { RelayConfig, RelayMetrics } from './types.js';
export declare function getMetrics(): RelayMetrics;
export declare function createRelay(io: Server, config: RelayConfig): void;
