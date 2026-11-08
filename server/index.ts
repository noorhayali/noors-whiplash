import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import type { Ack, GameId, PlayerAction, Settings } from '../shared/types.js';
import { GAMES } from './games/registry.js';
import { RoomManager, type Room } from './rooms.js';

export function createApp() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: process.env.CORS_ORIGIN?.split(',') ?? true },
    pingInterval: 10_000,
    pingTimeout: 8_000,
  });
  const rooms = new RoomManager(io);

  app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.rooms.size }));
  app.get('/api/info', (_req, res) => {
    const lan = Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i && i.family === 'IPv4' && !i.internal)
      .map((i) => i!.address);
    res.json({ publicUrl: process.env.PUBLIC_URL ?? null, lan });
  });

  // Serve the built client (production). In dev, Vite serves it and proxies sockets here.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDir = [path.join(here, 'client'), path.join(here, '../dist/client')].find((d) =>
    fs.existsSync(path.join(d, 'index.html')),
  );
  if (clientDir) {
    app.use(express.static(clientDir, { maxAge: '1h', index: false }));
    app.get('/{*splat}', (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
  }

  io.on('connection', (socket: Socket) => {
    const data = socket.data as { code?: string; role?: 'host' | 'player'; playerId?: string };

    // Tiny per-socket rate limiter (30 events / 3s) to stop runaway clients.
    let bucket = 0;
    const refill = setInterval(() => (bucket = 0), 3000);
    // Drawing streams many small packets, so it gets a bigger budget.
    socket.use((packet, next) => ((bucket += packet[0] === 'draw' ? 0.25 : 1) > 40 ? next(new Error('Slow down')) : next()));

    const room = (): Room | undefined => (data.code ? rooms.get(data.code) : undefined);
    const reply = (cb: unknown, ack: Ack<any>) => typeof cb === 'function' && cb(ack);
    const leaveCurrent = () => {
      const r = room();
      if (!r) return;
      if (data.role === 'host') r.detachHost(socket.id);
      if (data.role === 'player' && data.playerId) r.disconnectPlayer(data.playerId, socket.id);
      data.code = data.role = data.playerId = undefined;
    };

    // ---------- host ----------
    socket.on('host:create', (p: { gameId?: GameId }, cb) => {
      const gameId = p?.gameId && GAMES[p.gameId] ? p.gameId : 'comedy-clash';
      leaveCurrent();
      const r = rooms.create(gameId);
      Object.assign(data, { code: r.code, role: 'host' });
      r.attachHost(socket.id);
      reply(cb, { ok: true, data: { code: r.code, hostToken: r.hostToken } });
    });

    socket.on('host:resume', (p: { code?: string; hostToken?: string }, cb) => {
      const r = rooms.get(p?.code);
      if (!r || r.hostToken !== p?.hostToken) return reply(cb, { ok: false, error: 'Room not found.' });
      leaveCurrent();
      Object.assign(data, { code: r.code, role: 'host' });
      r.attachHost(socket.id);
      reply(cb, { ok: true, data: { code: r.code } });
    });

    const hostOnly = (fn: (r: Room) => Ack | void) => (_p: unknown, cb: unknown) => {
      const r = room();
      if (!r || data.role !== 'host') return reply(cb, { ok: false, error: 'Not the host.' });
      reply(cb, fn(r) ?? { ok: true });
    };
    socket.on('host:skip', hostOnly((r) => r.game?.hostSkip()));
    socket.on('host:pause', (p: { paused?: boolean }, cb) => hostOnly((r) => r.setPaused(!!p?.paused))(p, cb));
    socket.on('host:backToLobby', hostOnly((r) => r.backToLobby()));
    socket.on('host:playAgain', hostOnly((r) => r.playAgain()));
    socket.on('host:kick', (p: { playerId?: string }, cb) =>
      hostOnly((r) => r.kick(String(p?.playerId)))(p, cb),
    );
    socket.on('host:setGame', (p: { gameId?: string }, cb) => hostOnly((r) => r.setGame(p?.gameId))(p, cb));
    socket.on('draw', (p: unknown) => {
      const r = room();
      if (r && data.role === 'player' && data.playerId) r.game?.draw?.(data.playerId, p);
    });
    socket.on('host:settings', (p: Partial<Settings>, cb) => hostOnly((r) => r.updateSettings(p ?? {}))(p, cb));
    socket.on('host:close', hostOnly((r) => { r.close('The host ended this room.'); data.code = undefined; }));

    // Start can come from the host screen OR the VIP phone (TVs often have no keyboard).
    socket.on('game:start', (_p, cb) => {
      const r = room();
      if (!r) return reply(cb, { ok: false, error: 'No room.' });
      const isVip = data.role === 'player' && data.playerId === r.vipId();
      if (data.role !== 'host' && !isVip) return reply(cb, { ok: false, error: 'Only the host or VIP can start.' });
      reply(cb, r.startGame());
    });
    socket.on('game:playAgain', (_p, cb) => {
      const r = room();
      if (!r) return reply(cb, { ok: false, error: 'No room.' });
      const isVip = data.role === 'player' && data.playerId === r.vipId();
      if (data.role !== 'host' && !isVip) return reply(cb, { ok: false, error: 'Only the host or VIP can do that.' });
      reply(cb, r.playAgain());
    });

    // ---------- players ----------
    socket.on('room:peek', (p: { code?: string }, cb) => {
      const r = rooms.get(p?.code);
      if (!r) return reply(cb, { ok: false, error: "We couldn't find that room code." });
      reply(cb, { ok: true, data: r.peek() });
    });

    socket.on('player:join', (p: { code?: string; name?: string; avatar?: number }, cb) => {
      const r = rooms.get(p?.code);
      if (!r) return reply(cb, { ok: false, error: "We couldn't find that room code." });
      const res = r.join(socket.id, p?.name ?? '', Number(p?.avatar));
      if (res.ok) {
        leaveCurrent();
        Object.assign(data, { code: r.code, role: 'player', playerId: res.data!.playerId });
      }
      reply(cb, res.ok ? { ok: true, data: { ...res.data, code: r.code } } : res);
    });

    socket.on('player:resume', (p: { code?: string; token?: string }, cb) => {
      const r = rooms.get(p?.code);
      if (!r) return reply(cb, { ok: false, error: 'That room has closed.' });
      const player = r.resume(socket.id, String(p?.token ?? ''));
      if (!player) return reply(cb, { ok: false, error: 'Session expired.' });
      if (data.code !== r.code || data.playerId !== player.id) leaveCurrent();
      Object.assign(data, { code: r.code, role: 'player', playerId: player.id });
      reply(cb, { ok: true, data: { playerId: player.id, code: r.code } });
    });

    socket.on('player:rename', (p: { name?: string }, cb) => {
      const r = room();
      if (!r || data.role !== 'player' || !data.playerId) return reply(cb, { ok: false, error: 'Not in a room.' });
      reply(cb, r.rename(data.playerId, String(p?.name ?? '')));
    });

    socket.on('player:leave', (_p, cb) => {
      const r = room();
      if (r && data.playerId) r.leave(data.playerId);
      data.code = data.role = data.playerId = undefined;
      reply(cb, { ok: true });
    });

    socket.on('game:action', (a: PlayerAction, cb) => {
      const r = room();
      if (!r || data.role !== 'player' || !data.playerId || !r.game)
        return reply(cb, { ok: false, error: 'Not in a game.' });
      reply(cb, r.game.action(data.playerId, a));
    });

    socket.on('disconnect', () => {
      clearInterval(refill);
      leaveCurrent();
    });
  });

  return { app, server, io, rooms };
}

// Run directly (not when imported by tests).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const { server } = createApp();
  const port = Number(process.env.PORT ?? 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`Noor’s Whiplash server on http://localhost:${port}`);
  });
}
