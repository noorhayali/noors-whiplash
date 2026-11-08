import crypto from 'node:crypto';
import type { Server } from 'socket.io';
import {
  AVATAR_COUNT,
  MAX_NAME,
  MAX_PLAYERS,
  MIN_PLAYERS,
  type Ack,
  type GameId,
  type HostView,
  type PeekResult,
  type Phase,
  type PlayerAction,
  type PlayerView,
  type PublicPlayer,
  type Settings,
} from '../shared/types.js';
import { GAMES } from './games/registry.js';
import { TIME_SCALE } from './timer.js';

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: number;
  score: number;
  connected: boolean;
  joinedAt: number;
  socketId: string | null;
  dropTimer?: NodeJS.Timeout;
}

/** Contract every game module implements. The room owns players/sockets; the game owns phases. */
export interface GameInstance {
  readonly phase: Phase;
  start(): void;
  action(playerId: string, action: PlayerAction): Ack;
  hostSkip(): void;
  hostView(): Partial<HostView>;
  playerView(playerId: string): Partial<PlayerView>;
  onPresenceChange(): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I / O
const LOBBY_DROP_MS = 45_000;
const HOST_GONE_MS = 20 * 60_000;

export const newToken = () => crypto.randomBytes(18).toString('base64url');

export class Room {
  readonly code: string;
  gameId: GameId;
  readonly hostToken = newToken();
  hostSocketId: string | null = null;
  hostConnected = false;
  manualPause = false;
  players = new Map<string, Player>();
  settings: Settings = { writingSeconds: 90, spicy: true };
  usedPrompts = new Set<string>();
  game: GameInstance | null = null;
  lastActivity = Date.now();
  closed = false;
  private hostGoneTimer?: NodeJS.Timeout;
  private broadcastQueued = false;

  constructor(
    private io: Server,
    code: string,
    gameId: GameId,
    private onEmpty: (room: Room) => void,
  ) {
    this.code = code;
    this.gameId = gameId;
  }

  get phase(): Phase {
    return this.game?.phase ?? 'lobby';
  }

  get inLobby() {
    return this.phase === 'lobby';
  }

  connectedPlayers() {
    return [...this.players.values()].filter((p) => p.connected);
  }

  vipId(): string | null {
    const c = this.connectedPlayers().sort((a, b) => a.joinedAt - b.joinedAt);
    return c[0]?.id ?? null;
  }

  publicPlayers(): PublicPlayer[] {
    const vip = this.vipId();
    return [...this.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
        connected: p.connected,
        isVip: p.id === vip,
      }));
  }

  canStart() {
    return this.inLobby && this.connectedPlayers().length >= GAMES[this.gameId].minPlayers;
  }

  peek(): PeekResult {
    return {
      code: this.code,
      gameId: this.gameId,
      phase: this.phase,
      playerCount: this.players.size,
      takenAvatars: [...this.players.values()].map((p) => p.avatar),
      joinable: this.inLobby && this.players.size < MAX_PLAYERS,
      spicy: this.settings.spicy,
    };
  }

  // ---------- host ----------
  attachHost(socketId: string) {
    if (this.hostSocketId && this.hostSocketId !== socketId) {
      this.io.to(this.hostSocketId).emit('kicked', { reason: 'This room was opened on another screen.' });
    }
    this.hostSocketId = socketId;
    this.hostConnected = true;
    clearTimeout(this.hostGoneTimer);
    if (!this.manualPause) this.game?.resume();
    this.touch();
  }

  detachHost(socketId: string) {
    if (this.hostSocketId !== socketId) return;
    this.hostSocketId = null;
    this.hostConnected = false;
    this.game?.pause(); // freeze timers until the TV comes back
    this.hostGoneTimer = setTimeout(() => this.close('The host screen left the game.'), HOST_GONE_MS);
    this.touch();
  }

  // ---------- players ----------
  join(socketId: string, rawName: string, rawAvatar: number): Ack<{ playerId: string; token: string }> {
    if (!this.inLobby) return { ok: false, error: 'That game has already started.' };
    if (this.players.size >= MAX_PLAYERS) return { ok: false, error: `This room is full (max ${MAX_PLAYERS}).` };
    const name = sanitizeName(rawName);
    if (!name) return { ok: false, error: 'Please enter a nickname.' };
    const taken = [...this.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase());
    if (taken) return { ok: false, error: 'Someone already has that name — try another!' };
    let avatar = Number.isInteger(rawAvatar) && rawAvatar >= 0 && rawAvatar < AVATAR_COUNT ? rawAvatar : 0;
    const usedAvatars = new Set([...this.players.values()].map((p) => p.avatar));
    if (usedAvatars.has(avatar)) {
      const free = [...Array(AVATAR_COUNT).keys()].find((a) => !usedAvatars.has(a));
      if (free !== undefined) avatar = free;
    }
    const player: Player = {
      id: crypto.randomUUID(),
      token: newToken(),
      name,
      avatar,
      score: 0,
      connected: true,
      joinedAt: Date.now(),
      socketId,
    };
    this.players.set(player.id, player);
    this.touch();
    return { ok: true, data: { playerId: player.id, token: player.token } };
  }

  resume(socketId: string, token: string): Player | null {
    const p = [...this.players.values()].find((x) => safeEqual(x.token, token));
    if (!p) return null;
    if (p.socketId && p.socketId !== socketId) {
      this.io.to(p.socketId).emit('kicked', { reason: 'You joined from another tab or device.' });
    }
    clearTimeout(p.dropTimer);
    p.socketId = socketId;
    p.connected = true;
    this.game?.onPresenceChange();
    this.touch();
    return p;
  }

  disconnectPlayer(playerId: string, socketId: string) {
    const p = this.players.get(playerId);
    if (!p || p.socketId !== socketId) return;
    p.connected = false;
    p.socketId = null;
    if (this.inLobby) {
      p.dropTimer = setTimeout(() => {
        if (!p.connected && this.inLobby) this.removePlayer(p.id);
      }, LOBBY_DROP_MS * TIME_SCALE);
    }
    this.game?.onPresenceChange();
    this.touch();
  }

  /** Players can change their nickname while in the lobby. */
  rename(playerId: string, rawName: string): Ack {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: 'Not in this room.' };
    if (!this.inLobby) return { ok: false, error: 'You can only change your name in the lobby.' };
    const name = sanitizeName(rawName);
    if (!name) return { ok: false, error: 'Please enter a nickname.' };
    const taken = [...this.players.values()].some((x) => x.id !== playerId && x.name.toLowerCase() === name.toLowerCase());
    if (taken) return { ok: false, error: 'Someone already has that name — try another!' };
    p.name = name;
    this.touch();
    return { ok: true };
  }

  /** Explicit "leave" from the phone. In lobby the player is removed; mid-game they're marked gone. */
  leave(playerId: string) {
    const p = this.players.get(playerId);
    if (!p) return;
    if (p.socketId) this.io.to(p.socketId).emit('kicked', { reason: 'You left the room.' });
    if (this.inLobby) this.removePlayer(playerId);
    else {
      p.connected = false;
      p.socketId = null;
      p.token = newToken(); // can't be resumed
      this.game?.onPresenceChange();
      this.touch();
    }
  }

  kick(playerId: string) {
    const p = this.players.get(playerId);
    if (!p || !this.inLobby) return;
    if (p.socketId) this.io.to(p.socketId).emit('kicked', { reason: 'The host removed you from the room.' });
    this.removePlayer(playerId);
  }

  private removePlayer(id: string) {
    const p = this.players.get(id);
    if (p) clearTimeout(p.dropTimer);
    this.players.delete(id);
    this.touch();
  }

  // ---------- game control ----------
  startGame(): Ack {
    if (!this.inLobby) return { ok: false, error: 'Game already running.' };
    const def = GAMES[this.gameId];
    // Drop anybody who disconnected in the lobby before starting.
    for (const p of [...this.players.values()]) if (!p.connected) this.removePlayer(p.id);
    if (this.players.size < def.minPlayers) return { ok: false, error: `Need at least ${MIN_PLAYERS} players.` };
    for (const p of this.players.values()) p.score = 0;
    this.game?.dispose();
    this.game = def.create(this);
    this.game.start();
    this.manualPause = false;
    if (!this.hostConnected) this.game.pause();
    this.touch();
    return { ok: true };
  }

  playAgain(): Ack {
    if (this.phase !== 'gameOver') return { ok: false, error: 'Game is not over yet.' };
    this.game?.dispose();
    this.game = null;
    return this.startGame();
  }

  backToLobby() {
    this.game?.dispose();
    this.game = null;
    for (const p of [...this.players.values()]) {
      p.score = 0;
      if (!p.connected) this.removePlayer(p.id);
    }
    this.touch();
  }

  /** Host pause button. Freezes every timer; the TV must be connected to un-pause. */
  setPaused(paused: boolean): Ack {
    if (!this.game || this.inLobby || this.phase === 'gameOver') return { ok: false, error: 'Nothing to pause.' };
    this.manualPause = paused;
    if (paused) this.game.pause();
    else if (this.hostConnected) this.game.resume();
    this.touch();
    return { ok: true };
  }

  updateSettings(s: Partial<Settings>) {
    if (!this.inLobby) return;
    if (s.writingSeconds && [60, 90, 120, 180].includes(s.writingSeconds)) this.settings.writingSeconds = s.writingSeconds;
    if (typeof s.spicy === 'boolean') this.settings.spicy = s.spicy;
    this.touch();
  }

  close(reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.game?.dispose();
    clearTimeout(this.hostGoneTimer);
    for (const p of this.players.values()) {
      clearTimeout(p.dropTimer);
      if (p.socketId) this.io.to(p.socketId).emit('roomClosed', { reason });
    }
    if (this.hostSocketId) this.io.to(this.hostSocketId).emit('roomClosed', { reason });
    this.onEmpty(this);
  }

  // ---------- state sync ----------
  touch() {
    this.lastActivity = Date.now();
    if (this.broadcastQueued || this.closed) return;
    this.broadcastQueued = true;
    setImmediate(() => {
      this.broadcastQueued = false;
      this.broadcastNow();
    });
  }

  hostView(): HostView {
    const g = this.game?.hostView() ?? {};
    return {
      role: 'host',
      code: this.code,
      gameId: this.gameId,
      phase: 'lobby',
      round: 0,
      totalRounds: 3,
      players: this.publicPlayers(),
      settings: this.settings,
      timer: null,
      paused: !this.hostConnected || this.manualPause,
      canStart: this.canStart(),
      multiplier: 1,
      ...g,
      serverNow: Date.now(),
    };
  }

  playerView(id: string): PlayerView | null {
    const p = this.players.get(id);
    if (!p) return null;
    const players = this.publicPlayers();
    const me = players.find((x) => x.id === id)!;
    const higher = players.filter((x) => x.score > me.score).length;
    const g = this.game?.playerView(id) ?? {};
    return {
      role: 'player',
      code: this.code,
      phase: 'lobby',
      round: 0,
      totalRounds: 3,
      me: { ...me, rank: higher + 1 },
      players,
      hostConnected: this.hostConnected,
      paused: !this.hostConnected || this.manualPause,
      timer: null,
      canStart: me.isVip && this.canStart(),
      multiplier: 1,
      ...g,
      serverNow: Date.now(),
    };
  }

  broadcastNow() {
    if (this.closed) return;
    if (this.hostSocketId) this.io.to(this.hostSocketId).emit('state', this.hostView());
    for (const p of this.players.values()) {
      if (p.socketId) this.io.to(p.socketId).emit('state', this.playerView(p.id));
    }
  }
}

export class RoomManager {
  rooms = new Map<string, Room>();
  constructor(private io: Server) {
    setInterval(() => this.sweep(), 60_000).unref();
  }

  create(gameId: GameId): Room {
    let code = '';
    do {
      code = Array.from({ length: 4 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(this.io, code, gameId, (r) => this.rooms.delete(r.code));
    this.rooms.set(code, room);
    return room;
  }

  get(code: unknown): Room | undefined {
    if (typeof code !== 'string') return undefined;
    return this.rooms.get(code.trim().toUpperCase());
  }

  /** Remove rooms idle for 3 hours. */
  private sweep() {
    const cutoff = Date.now() - 3 * 3600_000;
    for (const r of this.rooms.values()) if (r.lastActivity < cutoff) r.close('Room expired.');
  }
}

export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
}

function safeEqual(a: string, b: unknown) {
  if (typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
