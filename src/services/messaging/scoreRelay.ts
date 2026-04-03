import { io, Socket } from 'socket.io-client';

const RELAY_URL = import.meta.env.VITE_RELAY_URL || 'http://localhost:8384';

let trackerSocket: Socket | null = null;
let listenerSocket: Socket | null = null;

// --- Connection status ---

export type RelayStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

let statusValue: RelayStatus = 'disconnected';
const statusListeners = new Set<(status: RelayStatus) => void>();

function setStatus(s: RelayStatus) {
  if (s === statusValue) return;
  statusValue = s;
  for (const fn of statusListeners) fn(s);
}

export function getRelayStatus(): RelayStatus {
  return statusValue;
}

export function onRelayStatusChange(fn: (status: RelayStatus) => void): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

// Suppress repeated error logging — log once per disconnect cycle
let errorLogged = false;

function attachStatusHandlers(socket: Socket, label: string) {
  socket.on('connect', () => {
    errorLogged = false;
    setStatus('connected');
    console.log(`[scoreRelay] ${label} connected`);
  });

  socket.on('disconnect', () => {
    setStatus('disconnected');
    console.log(`[scoreRelay] ${label} disconnected`);
  });

  socket.on('connect_error', (err) => {
    setStatus('error');
    if (!errorLogged) {
      console.warn(`[scoreRelay] ${label} connection error: ${err.message}`);
      errorLogged = true;
    }
  });

  socket.io.on('reconnect_attempt', () => {
    setStatus('connecting');
  });
}

// --- Tracker connection (for sending scores from epixodic as a mobile tracker) ---

export function connectTracker(): Socket {
  if (trackerSocket?.connected) return trackerSocket;

  trackerSocket = io(`${RELAY_URL}/tracker`, {
    transports: ['websocket'],
    autoConnect: true,
  });

  attachStatusHandlers(trackerSocket, 'tracker');

  trackerSocket.on('ack', (data: any) => {
    console.log('[scoreRelay] ack:', data);
  });

  return trackerSocket;
}

export function sendScore(update: {
  matchUpId: string;
  tournamentId?: string;
  score: any;
  point?: any;
  matchUpStatus?: string;
  winningSide?: number;
}): void {
  if (!trackerSocket?.connected) {
    connectTracker();
  }
  trackerSocket?.emit('score', update);
}

export function sendHistory(history: {
  matchUpId: string;
  tournamentId?: string;
  provider?: string;
  matchUpFormat?: string;
  points: any[];
  score?: any;
  sides?: any[];
}): void {
  if (!trackerSocket?.connected) {
    connectTracker();
  }
  trackerSocket?.emit('history', history);
}

/**
 * Broadcast enriched INTENNSE update with per-player stats, aggregate scores,
 * penalty box state, and clock data. External displays subscribe to these
 * for rich scoreboard rendering.
 */
export function sendIntennseUpdate(snapshot: any): void {
  if (!trackerSocket?.connected) {
    connectTracker();
  }
  trackerSocket?.emit('intennse', snapshot);
}

// --- Listener connection (for receiving live scores as a display/dashboard) ---

export function connectListener(): Socket {
  if (listenerSocket?.connected) return listenerSocket;

  listenerSocket = io(`${RELAY_URL}/live`, {
    transports: ['websocket'],
    autoConnect: true,
  });

  attachStatusHandlers(listenerSocket, 'listener');

  return listenerSocket;
}

export function subscribeToMatch(
  matchUpId: string,
  onScore: (update: any) => void,
  onHistory?: (history: any) => void,
): () => void {
  const socket = connectListener();

  socket.emit('subscribe', matchUpId);
  socket.on('score', onScore);
  if (onHistory) socket.on('history', onHistory);

  // Return unsubscribe function
  return () => {
    socket.emit('unsubscribe', matchUpId);
    socket.off('score', onScore);
    if (onHistory) socket.off('history', onHistory);
  };
}

export function subscribeToAll(
  onScore: (update: any) => void,
  onActive?: (matchIds: string[]) => void,
): () => void {
  const socket = connectListener();

  socket.emit('subscribe:all');
  socket.on('score', onScore);
  if (onActive) socket.on('active', onActive);

  return () => {
    socket.emit('unsubscribe:all');
    socket.off('score', onScore);
    if (onActive) socket.off('active', onActive);
  };
}

export function disconnectAll(): void {
  trackerSocket?.disconnect();
  listenerSocket?.disconnect();
  trackerSocket = null;
  listenerSocket = null;
  setStatus('disconnected');
}
