# @epixodic/score-relay

Real-time score broadcast relay for live tennis match tracking.

## Architecture

Trackers (mobile apps, crowdsourced users) connect to the `/tracker` Socket.IO namespace and push live score updates. The relay broadcasts these to all subscribed clients on the `/live` namespace. No tournament records are mutated — scores are purely advisory. Tournament directors see live progress and officially submit scores through the normal authenticated mutation flow.

```
Trackers → /tracker namespace → in-memory store → /live namespace → TMX/TMA clients
```

## Running locally

```bash
pnpm install
pnpm dev          # Watch mode on port 8384
```

For local development with a linked factory:
```bash
# Replace the published dep with a local link
pnpm remove tods-competition-factory
pnpm add tods-competition-factory@link:../../../CourtHive/factory
```

## Testing

```bash
pnpm test                    # Unit + integration tests
pnpm dev &                   # Start server in background
npx tsx test-manual.ts       # E2E manual test (requires running server)
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RELAY_PORT` | `8384` | HTTP/Socket.IO listen port |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins |
| `STALE_MATCH_HOURS` | `4` | Hours before a match is pruned from memory |
| `PRUNE_INTERVAL_MINUTES` | `30` | How often to run the prune check |
| `FACTORY_SERVER_URL` | — | Factory server URL for persistence (dormant if unset) |
| `PERSIST_SCORES` | `true` | Enable/disable persistence (requires FACTORY_SERVER_URL) |

## Endpoints

| Path | Method | Description |
|------|--------|-------------|
| `/` | GET | Health check → `{"status":"ok","service":"score-relay"}` |
| `/metrics` | GET | Relay metrics (trackers, listeners, matches, scores relayed, uptime) |

## Deploying to courthive-nest

```bash
cd ~/Development/GitHub/CourtHive/deploy
./deploy-relay.sh
```

This builds locally and rsyncs `dist/` to the remote. See the deploy script for details.

### nginx (manual, one-time)

Add to `/etc/nginx/sites-available/courthive.net`:

```nginx
location /relay/ {
    proxy_pass http://127.0.0.1:8384/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 86400;
}
```

Then: `sudo nginx -t && sudo systemctl reload nginx`
