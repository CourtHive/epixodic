import type { VideoBoardPayload } from './projectionTypes.js';
export declare function configureVideoBoardForwarder(rawTarget?: string): void;
export declare function forwardVideoBoardPayload(payload: VideoBoardPayload): void;
export declare function shutdownVideoBoardForwarder(): void;
