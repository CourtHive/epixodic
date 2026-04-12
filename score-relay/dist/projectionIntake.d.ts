/**
 * HTTP intake routes for projector payloads pushed by competition-factory-server.
 *
 * Two routes:
 *   POST /api/projection/scorebug      → ScorebugPayload
 *   POST /api/projection/video-board   → VideoBoardPayload
 *
 * Each handler:
 *   1. Optionally checks Bearer token (if PROJECTION_API_KEY env is set)
 *   2. Parses JSON body
 *   3. Fans out to a Socket.IO room on the /live namespace:
 *        - scorebug payloads → room `scorebug:{matchUpId}`
 *        - video-board payloads → room `videoboard:{matchUpId}`
 *   4. Returns `{ ok: true }` on success
 *
 * Subscribers join via:
 *   socket.on('subscribe:scorebug', matchUpId)
 *   socket.on('subscribe:videoboard', matchUpId)
 *
 * Video-board payloads are also forwarded to the optional UDP target
 * (see videoBoardForwarder.ts) for sub-frame-latency renderers.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import type { Server } from 'socket.io';
export interface ProjectionIntakeOptions {
    io: Server;
    apiKey?: string;
}
export declare function createProjectionIntake(options: ProjectionIntakeOptions): {
    handleScorebug: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
    handleVideoBoard: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
};
