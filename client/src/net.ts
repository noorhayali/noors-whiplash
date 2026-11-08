import { io, type Socket } from 'socket.io-client';
import { useSyncExternalStore } from 'react';
import type { Ack, GameView } from '../../shared/types';

// One socket for the whole app. It reconnects automatically; on every (re)connect
// we resume whichever session (host or player) this browser holds.
export const socket: Socket = io({ transports: ['websocket', 'polling'], autoConnect: true });

type Store = {
  view: GameView | null;
  connected: boolean;
  offset: number; // serverTime - localTime
  notice: string | null; // kicked / room closed message
};
let store: Store = { view: null, connected: socket.connected, offset: 0, notice: null };
const subs = new Set<() => void>();
const set = (patch: Partial<Store>) => {
  store = { ...store, ...patch };
  subs.forEach((f) => f());
};
export const useStore = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => store,
  );
export const getStore = () => store;

export const now = () => Date.now() + store.offset;

socket.on('state', (v: GameView) => set({ view: v, offset: v.serverNow - Date.now() }));
socket.on('connect', () => {
  set({ connected: true });
  resumeSession();
});
socket.on('disconnect', () => set({ connected: false }));
socket.on('kicked', (p: { reason: string }) => endSession(p.reason));
socket.on('roomClosed', (p: { reason: string }) => endSession(p.reason));

export function emit<T = any>(event: string, payload: unknown = {}): Promise<Ack<T>> {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve({ ok: false, error: 'Reconnecting… try again in a second.' });
    socket.timeout(8000).emit(event, payload, (err: unknown, ack: Ack<T>) =>
      resolve(err ? { ok: false, error: 'The server took too long to answer.' } : ack),
    );
  });
}

// ---------------- sessions ----------------
type Session = { role: 'host'; code: string; hostToken: string } | { role: 'player'; code: string; token: string };
const KEY = 'comedyclash.session';

export function getSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch {
    return null;
  }
}
export function saveSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode — session just won't survive refresh */
  }
}

let resuming: Promise<boolean> | null = null;
export function resumeSession(): Promise<boolean> {
  const s = getSession();
  if (!s || !socket.connected) return Promise.resolve(false);
  if (resuming) return resuming;
  resuming = (async () => {
    const ack =
      s.role === 'host'
        ? await emit('host:resume', { code: s.code, hostToken: s.hostToken })
        : await emit('player:resume', { code: s.code, token: s.token });
    if (!ack.ok) {
      saveSession(null);
      set({ view: null });
    }
    resuming = null;
    return ack.ok;
  })();
  return resuming;
}

function endSession(reason: string) {
  saveSession(null);
  set({ view: null, notice: reason });
}
export const clearNotice = () => set({ notice: null });
export const clearView = () => set({ view: null });

export async function createRoom(gameId = 'comedy-clash') {
  const ack = await emit<{ code: string; hostToken: string }>('host:create', { gameId });
  if (ack.ok) saveSession({ role: 'host', code: ack.data!.code, hostToken: ack.data!.hostToken });
  return ack;
}

/** Close the current room (if any) and open a fresh one on this screen. */
export async function newRoom(gameId = 'comedy-clash') {
  if (getSession()?.role === 'host') await emit('host:close');
  saveSession(null);
  const ack = await createRoom(gameId);
  set({ notice: null });
  return ack;
}

export async function joinRoom(code: string, name: string, avatar: number) {
  const ack = await emit<{ code: string; token: string; playerId: string }>('player:join', { code, name, avatar });
  if (ack.ok) saveSession({ role: 'player', code: ack.data!.code, token: ack.data!.token });
  return ack;
}

export async function leaveRoom() {
  const s = getSession();
  if (s?.role === 'host') await emit('host:close');
  else await emit('player:leave');
  saveSession(null);
  set({ view: null });
}
