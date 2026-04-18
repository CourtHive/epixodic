#!/usr/bin/env tsx
/**
 * INTENNSE Scorebug Terminal Client
 *
 * Connects to the score-relay's `/live` namespace and pretty-prints
 * every incoming event in real-time. Useful for:
 *   - Verifying the relay is flowing correctly
 *   - Showing the production company the exact JSON packet shapes
 *   - Capturing sample data for scorebug integration development
 *
 * Usage:
 *   npx tsx score-relay/cli/scorebug-client.ts                    # subscribe to all
 *   npx tsx score-relay/cli/scorebug-client.ts --match=<matchUpId> # specific match
 *   npx tsx score-relay/cli/scorebug-client.ts --relay=http://host:8384
 *   npx tsx score-relay/cli/scorebug-client.ts --ticks             # show clock ticks (noisy)
 *   npx tsx score-relay/cli/scorebug-client.ts --save=packets.jsonl # append packets to file
 *
 * Press Ctrl+C to disconnect.
 */

import { io, Socket } from 'socket.io-client';
import { writeFileSync, appendFileSync, existsSync } from 'fs';

// ── CLI args ────────────────────────────────────────────────

const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const flag = args.find((a) => a.startsWith(`--${name}=`));
  return flag?.split('=').slice(1).join('=');
}
const hasFlag = (name: string) => args.includes(`--${name}`);

const RELAY_URL = arg('relay') || 'http://localhost:8384';
const MATCH_ID = arg('match');
const SHOW_TICKS = hasFlag('ticks');
const SAVE_FILE = arg('save');

// ── Colours (ANSI) ──────────────────────────────────────────

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';

function coloured(colour: string, text: string): string {
  return `${colour}${text}${RESET}`;
}

function timestamp(): string {
  return coloured(DIM, new Date().toISOString().slice(11, 23));
}

// ── Formatters ──────────────────────────────────────────────

function formatScore(data: any): string {
  if (!data) return '';
  const bolt = data.boltScore
    ? `Bolt ${coloured(BOLD, `${data.boltScore.side1}–${data.boltScore.side2}`)}`
    : '';
  const arc = data.aggregateScore
    ? `ARC ${coloured(BOLD, `${data.aggregateScore.side1}–${data.aggregateScore.side2}`)}`
    : '';
  return [bolt, arc].filter(Boolean).join('  ');
}

function formatClocks(data: any): string {
  const boltMs = data.boltTimerRemainingMs ?? data.boltClockMs ?? data.bolt?.boltClockMs;
  const serveMs = data.serveClockRemainingMs ?? data.serveClockMs ?? data.bolt?.serveClockMs;
  const parts: string[] = [];
  if (typeof boltMs === 'number') {
    const mins = Math.floor(boltMs / 60000);
    const secs = Math.floor((boltMs % 60000) / 1000);
    parts.push(`Bolt ${coloured(YELLOW, `${mins}:${secs.toString().padStart(2, '0')}`)}`);
  }
  if (typeof serveMs === 'number') {
    const secs = (serveMs / 1000).toFixed(1);
    parts.push(`Serve ${coloured(CYAN, `${secs}s`)}`);
  }
  return parts.join('  ');
}

function formatIntennse(data: any): string {
  const lines: string[] = [];
  lines.push(`  ${formatScore(data)}  ${formatClocks(data)}`);
  if (data.server !== undefined) {
    const side = data.server === 0 ? 'Side 1' : 'Side 2';
    const court = data.serveSide ?? '';
    lines.push(`  Server: ${coloured(GREEN, side)} ${court}`);
  }
  if (data.playerStats) {
    const ids = Object.keys(data.playerStats);
    if (ids.length) {
      lines.push(`  Players: ${ids.length} tracked`);
      for (const id of ids.slice(0, 4)) {
        const s = data.playerStats[id];
        lines.push(
          `    ${coloured(DIM, id.slice(0, 8))}… W:${s.winners} T:${s.touches} A:${s.aces} UE:${s.unforcedErrors} pts:${s.pointsWon}`,
        );
      }
      if (ids.length > 4) lines.push(`    … and ${ids.length - 4} more`);
    }
  }
  if (data.penaltyBox?.length) {
    lines.push(
      `  ${coloured(RED, 'Penalty Box')}: ${data.penaltyBox.map((p: any) => `${p.participantName} (${Math.ceil(p.remainingMs / 1000)}s)`).join(', ')}`,
    );
  }
  return lines.join('\n');
}

function formatScorebugEvent(data: any): string {
  const lines: string[] = [];
  const s1 = data.side1;
  const s2 = data.side2;
  if (s1 && s2) {
    lines.push(
      `  ${coloured(BLUE, s1.teamName || 'Side 1')} ${s1.boltScore ?? '?'}–${s2.boltScore ?? '?'} ${coloured(MAGENTA, s2.teamName || 'Side 2')}`,
    );
    lines.push(
      `  ARC: ${s1.arcScore ?? '?'}–${s2.arcScore ?? '?'}  Bolt#${data.bolt?.number ?? '?'}  ${data.bolt?.state ?? ''}`,
    );
  }
  return lines.join('\n');
}

// ── Packet logger ───────────────────────────────────────────

let packetCount = 0;

function logPacket(eventName: string, data: any, colour: string, formatter?: (d: any) => string) {
  packetCount++;
  const header = `${timestamp()} ${coloured(colour, `[${eventName}]`)}`;
  const detail = formatter ? formatter(data) : '';
  console.log(`${header}${detail ? '\n' + detail : ''}`);

  if (SAVE_FILE) {
    appendFileSync(SAVE_FILE, JSON.stringify({ event: eventName, receivedAt: new Date().toISOString(), data }) + '\n');
  }
}

// ── Tick display (overwrite line for continuous clock) ───────

let lastTickLine = '';
function logTick(data: any) {
  const clocks = formatClocks(data);
  const line = `  ${coloured(DIM, '[tick]')} ${clocks}`;
  if (line !== lastTickLine) {
    process.stdout.write(`\r${line}  `);
    lastTickLine = line;
  }
  if (SAVE_FILE) {
    appendFileSync(SAVE_FILE, JSON.stringify({ event: 'scorebug-tick', receivedAt: new Date().toISOString(), data }) + '\n');
  }
}

// ── Connect ─────────────────────────────────────────────────

console.log(`\n${coloured(BOLD, '🎾 INTENNSE Scorebug Client')}`);
console.log(`${coloured(DIM, `Relay: ${RELAY_URL}`)}`);
console.log(`${coloured(DIM, `Match: ${MATCH_ID || 'all'}`)}`);
console.log(`${coloured(DIM, `Ticks: ${SHOW_TICKS ? 'shown' : 'hidden (use --ticks to enable)'}`)}`);
if (SAVE_FILE) {
  console.log(`${coloured(DIM, `Saving to: ${SAVE_FILE}`)}`);
  if (!existsSync(SAVE_FILE)) writeFileSync(SAVE_FILE, '');
}
console.log('');

const socket: Socket = io(`${RELAY_URL}/live`, {
  path: '/socket.io/',
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 2000,
});

socket.on('connect', () => {
  console.log(coloured(GREEN, `✓ Connected (id: ${socket.id})`));
  if (MATCH_ID) {
    socket.emit('subscribe', MATCH_ID);
    console.log(coloured(DIM, `  Subscribed to match ${MATCH_ID}`));
  } else {
    socket.emit('subscribe:all');
    console.log(coloured(DIM, '  Subscribed to all matches'));
  }
  console.log('');
});

socket.on('disconnect', (reason) => {
  console.log(coloured(RED, `\n✗ Disconnected: ${reason}`));
});

socket.on('connect_error', (err) => {
  console.log(coloured(RED, `✗ Connection error: ${err.message}`));
});

// ── Event listeners ─────────────────────────────────────────

socket.on('intennse', (data) => {
  logPacket('intennse', data, GREEN, formatIntennse);
});

socket.on('score', (data) => {
  logPacket('score', data, CYAN, (d) => {
    const scoreStr = d.score?.scoreStringSide1;
    return scoreStr ? `  ${scoreStr}` : '';
  });
});

socket.on('history', (data) => {
  const count = data?.points?.length ?? 0;
  logPacket('history', data, MAGENTA, () => `  ${count} points`);
});

socket.on('active', (data) => {
  const ids = Array.isArray(data) ? data : data?.matchUpIds ?? [];
  logPacket('active', data, BLUE, () => `  ${ids.length} active match(es): ${ids.join(', ')}`);
});

socket.on('scorebug-event', (data) => {
  logPacket('scorebug-event', data, YELLOW, formatScorebugEvent);
});

socket.on('scorebug-tick', (data) => {
  if (SHOW_TICKS) {
    logTick(data);
  }
});

socket.on('videoboard', (data) => {
  logPacket('videoboard', data, MAGENTA);
});

// ── Graceful shutdown ───────────────────────────────────────

process.on('SIGINT', () => {
  console.log(`\n\n${coloured(DIM, `${packetCount} packets received.`)}`);
  socket.disconnect();
  process.exit(0);
});
