import { forwardVideoBoardPayload } from './videoBoardForwarder.js';
import { isScorebugTick, } from './projectionTypes.js';
export function createProjectionIntake(options) {
    const { io, apiKey } = options;
    const live = io.of('/live');
    function unauthorized(res, message) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: message }));
    }
    function badRequest(res, message) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: message }));
    }
    function ok(res) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
    }
    function checkAuth(req) {
        if (!apiKey)
            return true;
        const header = req.headers['authorization'];
        if (typeof header !== 'string')
            return false;
        const provided = header.replace(/^Bearer\s+/i, '').trim();
        return provided === apiKey;
    }
    function readBody(req) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
            req.on('end', () => {
                try {
                    const raw = Buffer.concat(chunks).toString('utf8');
                    resolve(raw ? JSON.parse(raw) : {});
                }
                catch (err) {
                    reject(err);
                }
            });
            req.on('error', reject);
        });
    }
    async function handleScorebug(req, res) {
        if (!checkAuth(req))
            return unauthorized(res, 'invalid api key');
        try {
            const body = (await readBody(req));
            if (!body?.matchUpId)
                return badRequest(res, 'matchUpId required');
            // Two streams over the same intake route, discriminated by `kind`:
            //   - tick payloads (sub-second) → 'scorebug-tick'
            //   - event payloads (on bolt-history upsert) → 'scorebug-event'
            // Consumers subscribe to one or both depending on what they need.
            if (isScorebugTick(body)) {
                live.to(`scorebug:${body.matchUpId}`).emit('scorebug-tick', body);
            }
            else {
                live.to(`scorebug:${body.matchUpId}`).emit('scorebug-event', body);
            }
            ok(res);
        }
        catch (err) {
            badRequest(res, err?.message ?? 'parse error');
        }
    }
    async function handleVideoBoard(req, res) {
        if (!checkAuth(req))
            return unauthorized(res, 'invalid api key');
        try {
            const body = (await readBody(req));
            if (!body?.matchUpId)
                return badRequest(res, 'matchUpId required');
            live.to(`videoboard:${body.matchUpId}`).emit('videoboard', body);
            forwardVideoBoardPayload(body);
            ok(res);
        }
        catch (err) {
            badRequest(res, err?.message ?? 'parse error');
        }
    }
    function attachLiveSubscriptions() {
        live.on('connection', (socket) => {
            socket.on('subscribe:scorebug', (matchUpId) => {
                if (typeof matchUpId === 'string' && matchUpId.length > 0) {
                    socket.join(`scorebug:${matchUpId}`);
                }
            });
            socket.on('unsubscribe:scorebug', (matchUpId) => {
                socket.leave(`scorebug:${matchUpId}`);
            });
            socket.on('subscribe:videoboard', (matchUpId) => {
                if (typeof matchUpId === 'string' && matchUpId.length > 0) {
                    socket.join(`videoboard:${matchUpId}`);
                }
            });
            socket.on('unsubscribe:videoboard', (matchUpId) => {
                socket.leave(`videoboard:${matchUpId}`);
            });
        });
    }
    attachLiveSubscriptions();
    return {
        handleScorebug,
        handleVideoBoard,
    };
}
