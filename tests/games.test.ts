// Full-game multiplayer tests for Fib Factory, Doodle Duel and Who Dunnit? — a real
// server with independent socket clients for the TV and each phone.
process.env.TIME_SCALE = '0.02';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import type { Ack, GameId, HostView, PlayerView } from '../shared/types';
import { FACTS } from '../server/games/fibFactory/facts';

let url = '';
let close: () => void;
beforeAll(async () => {
  const { createApp } = await import('../server/index');
  const { server, io } = createApp();
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
  close = () => (io.close(), server.close());
});
afterAll(() => close?.());

class Client<V extends HostView | PlayerView = any> {
  socket: Socket;
  state: V | null = null;
  phases: string[] = [];
  listeners = new Set<() => void>();
  hooks: ((s: V) => void)[] = [];
  events: { ev: string; p: any }[] = [];
  constructor() {
    this.socket = connect(url, { transports: ['websocket'], forceNew: true });
    this.socket.on('state', (s: V) => {
      this.state = s;
      if (this.phases[this.phases.length - 1] !== s.phase) this.phases.push(s.phase);
      this.hooks.forEach((h) => h(s));
      this.listeners.forEach((l) => l());
    });
    this.socket.on('draw', (p: any) => this.events.push({ ev: 'draw', p }));
  }
  emit<T = any>(ev: string, payload: unknown = {}): Promise<Ack<T>> {
    return new Promise((r) => this.socket.emit(ev, payload, r));
  }
  waitFor(pred: (s: V) => boolean, ms = 30000): Promise<V> {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.state && pred(this.state)) {
          this.listeners.delete(check);
          clearTimeout(t);
          resolve(this.state);
        }
      };
      const t = setTimeout(() => (this.listeners.delete(check), reject(new Error(`timeout; phase=${this.state?.phase}`))), ms);
      this.listeners.add(check);
      check();
    });
  }
  close() {
    this.socket.close();
  }
}

async function room(gameId: GameId, n: number) {
  const host = new Client<HostView>();
  const { data } = await host.emit('host:create', { gameId });
  const players: Client<PlayerView>[] = [];
  for (let i = 0; i < n; i++) {
    const c = new Client<PlayerView>();
    const r = await c.emit('player:join', { code: data.code, name: `P${i + 1}`, avatar: i });
    expect(r.ok, r.error).toBe(true);
    players.push(c);
  }
  await host.waitFor((s) => s.players.length === n);
  return { host, players, code: data.code };
}
const done = (cs: Client[]) => cs.forEach((c) => c.close());

describe('lobby game switching', () => {
  it('host can switch games in the lobby; min players follows the game', async () => {
    const { host, players } = await room('comedy-clash', 3);
    expect((await host.emit('host:setGame', { gameId: 'who-dunnit' })).ok).toBe(true);
    const s = await host.waitFor((v) => v.gameId === 'who-dunnit');
    expect(s.minPlayers).toBe(4);
    expect(s.canStart).toBe(false); // 3 < 4
    expect((await host.emit('host:setGame', { gameId: 'nope' })).ok).toBe(false);
    expect((await players[0].emit('host:setGame', { gameId: 'fib-factory' })).ok).toBe(false); // phones can't
    const p = await players[1].waitFor((v) => v.gameId === 'who-dunnit');
    expect(p.minPlayers).toBe(4);
    done([host, ...players]);
  });
});

describe('Fib Factory', () => {
  it('plays a full game: lies, truth rejection, no self-picks, correct scoring', async () => {
    const { host, players } = await room('fib-factory', 4);
    const ledger = new Map<string, number>();
    const seenRounds = new Set<number>();
    host.hooks.push((s) => {
      if (s.phase === 'pick') expect(JSON.stringify(s.data)).not.toContain('authors');
      if (s.phase === 'reveal' && !seenRounds.has(s.round)) {
        seenRounds.add(s.round);
        for (const o of s.data.options) {
          if (o.truth) for (const p of o.pickers) ledger.set(p, (ledger.get(p) ?? 0) + 1000 * s.multiplier);
          else for (const a of o.authors) ledger.set(a, (ledger.get(a) ?? 0) + 500 * s.multiplier * o.pickers.length);
        }
      }
    });
    let truthTested = false;
    let selfPickTested = false;
    players.forEach((c, i) => {
      const lied = new Set<number>();
      const picked = new Set<number>();
      c.hooks.push(async (s) => {
        if (s.phase === 'lie' && s.data.myLie === null && !lied.has(s.round)) {
          lied.add(s.round);
          if (i === 0 && !truthTested) {
            truthTested = true;
            const fact = FACTS.find((f) => f.q === s.data.question)!;
            const r = await c.emit('game:action', { type: 'lie', text: fact.a.toUpperCase() + '!' });
            expect(r.ok).toBe(false);
            expect(r.error).toMatch(/real answer/i);
          }
          c.emit('game:action', { type: 'lie', text: `fake ${i} r${s.round}` });
        }
        if (s.phase === 'pick' && s.data.canPick && !picked.has(s.round)) {
          picked.add(s.round);
          const mine = s.data.options.find((o: any) => o.mine);
          if (mine && !selfPickTested) {
            selfPickTested = true;
            expect((await c.emit('game:action', { type: 'pick', choice: mine.key })).ok).toBe(false);
          }
          const opts = s.data.options.filter((o: any) => !o.mine);
          await c.emit('game:action', { type: 'pick', choice: opts[(i + s.round) % opts.length].key });
          const again = await c.emit('game:action', { type: 'pick', choice: opts[0].key });
          expect(again.ok).toBe(false);
        }
      });
    });
    await host.emit('game:start');
    const end = await host.waitFor((s) => s.phase === 'gameOver', 60000);
    expect(seenRounds.size).toBe(5);
    expect(truthTested && selfPickTested).toBe(true);
    for (const p of end.players) expect(p.score).toBe(ledger.get(p.id) ?? 0);
    expect(end.results!.winnerIds.length).toBeGreaterThan(0);
    for (const ph of ['intro', 'question', 'lie', 'pick', 'reveal', 'scoreboard', 'gameOver']) expect(host.phases).toContain(ph);
    done([host, ...players]);
  });

  it('family mode never serves 18+ facts', async () => {
    const { host, players } = await room('fib-factory', 3);
    await host.emit('host:settings', { spicy: false });
    await host.waitFor((s) => !s.settings.spicy);
    const qs = new Set<string>();
    host.hooks.push((s) => s.data?.question && qs.add(s.data.question));
    await host.emit('game:start');
    await host.waitFor((s) => s.phase === 'gameOver', 60000);
    for (const q of qs) expect(FACTS.find((f) => f.q === q)?.spicy).toBeFalsy();
    done([host, ...players]);
  });
});

describe('Doodle Duel', () => {
  it('every player draws once; strokes stream to the TV; guesses score by speed', async () => {
    const { host, players } = await room('doodle-duel', 3);
    const artistsSeen = new Set<string>();
    const turnWord = new Map<number, string>();
    let rejectedForeignDraw = false;
    players.forEach((c) => {
      const chose = new Set<number>();
      const drew = new Set<number>();
      c.hooks.push(async (s) => {
        const d = s.data;
        if (s.phase === 'choose' && d.isArtist && !chose.has(s.round)) {
          chose.add(s.round);
          expect(d.choices).toHaveLength(2);
          await c.emit('game:action', { type: 'choose', index: 1 });
        }
        if (s.phase === 'draw' && d.isArtist && !drew.has(s.round)) {
          drew.add(s.round);
          artistsSeen.add(s.me.id);
          turnWord.set(s.round, d.word);
          c.socket.emit('draw', { t: 's', c: 1, w: 1, p: [100, 100, 200, 200] });
          c.socket.emit('draw', { t: 'm', p: [300, 250, 400, 300] });
          c.socket.emit('draw', { t: 's', c: 99, w: 0, p: [500, 500, 'x', 2] });
        }
        if (s.phase === 'draw' && !d.isArtist) {
          // Guessers never see the word.
          expect(d.word).toBeNull();
          if (!rejectedForeignDraw) {
            rejectedForeignDraw = true;
            c.socket.emit('draw', { t: 'c' }); // must be ignored
          }
        }
      });
    });
    // Guessers: once the artist has the word, guess wrong then right.
    const guessedTurn = new Set<string>();
    host.hooks.push(async (s) => {
      if (s.phase !== 'draw') return;
      const w = turnWord.get(s.round);
      if (!w) return;
      for (const c of players) {
        const key = `${s.round}-${c.state?.me.id}`;
        if (c.state?.me.id === s.data.artist || guessedTurn.has(key)) continue;
        guessedTurn.add(key);
        await new Promise((r) => setTimeout(r, 30));
        const wrong = await c.emit('game:action', { type: 'guess', text: 'definitely not it' });
        expect(wrong.ok && wrong.data.correct).toBe(false);
        await new Promise((r) => setTimeout(r, 750));
        const right = await c.emit('game:action', { type: 'guess', text: w.toUpperCase() });
        expect(right.data?.correct).toBe(true);
        expect(right.data.points).toBeGreaterThanOrEqual(300);
      }
    });
    await host.emit('game:start');
    const reveal = await host.waitFor((s) => s.phase === 'reveal', 30000);
    expect(reveal.data.word).toBeTruthy();
    expect(reveal.data.strokes.length).toBe(2);
    expect(reveal.data.strokes[0].p).toEqual([100, 100, 200, 200, 300, 250, 400, 300]);
    expect(reveal.data.strokes[1]).toEqual({ c: 0, w: 0, p: [500, 500] }); // bad colour clamped, junk points dropped
    const end = await host.waitFor((s) => s.phase === 'gameOver', 60000);
    expect(artistsSeen.size).toBe(3);
    // Live deltas reached the TV, and the guesser's "clear" was ignored.
    expect(host.events.filter((e) => e.ev === 'draw').length).toBeGreaterThanOrEqual(6);
    expect(host.events.some((e) => e.p.t === 'c')).toBe(false);
    // Each player: guessed right on 2 turns (≥300 each) + 2 guessers × 250 as artist.
    for (const p of end.players) expect(p.score).toBeGreaterThanOrEqual(2 * 300 + 500);
    done([host, ...players]);
  });
});

describe('Who Dunnit?', () => {
  it('one secret impostor per round, hidden questions, voting and scoring', async () => {
    const { host, players } = await room('who-dunnit', 4);
    const impostors: string[] = [];
    const rounds = new Map<number, { imp: string }>();
    const questionsByRound = new Map<number, Map<string, string>>();
    players.forEach((c, i) => {
      const answered = new Set<number>();
      const voted = new Set<number>();
      c.hooks.push(async (s) => {
        const d = s.data;
        if (s.phase === 'answer' && d.myAnswer === null && !answered.has(s.round)) {
          answered.add(s.round);
          expect(d.question).toBeTruthy();
          const qs = questionsByRound.get(s.round) ?? new Map();
          qs.set(s.me.id, d.question);
          questionsByRound.set(s.round, qs);
          await c.emit('game:action', { type: 'answer', text: `ans ${i}` });
        }
        if (s.phase === 'vote' && d.secret === 'impostor') rounds.set(s.round, { imp: s.me.id });
        if (s.phase === 'vote' && d.canVote && !voted.has(s.round)) {
          voted.add(s.round);
          // Wait until the impostor's phone has reported in (test-only knowledge).
          for (let k = 0; k < 50 && !rounds.get(s.round); k++) await new Promise((r) => setTimeout(r, 20));
          const imp = rounds.get(s.round)!.imp;
          expect((await c.emit('game:action', { type: 'accuse', target: s.me.id })).ok).toBe(false);
          const target = imp === s.me.id ? players.find((p) => p.state!.me.id !== s.me.id)!.state!.me.id : imp;
          await c.emit('game:action', { type: 'accuse', target });
        }
      });
    });
    const ledger = new Map<string, number>();
    const scored = new Set<number>();
    host.hooks.push((s) => {
      if (s.phase === 'answer') {
        expect(s.data.answers).toBeNull();
        expect(s.data.crewQuestion).toBeNull();
      }
      if (s.phase === 'result' && !scored.has(s.round)) {
        scored.add(s.round);
        impostors.push(s.data.impostor);
        expect(s.data.caught).toBe(true); // everyone voted for the impostor
        for (const p of s.players) {
          if (p.id === s.data.impostor) continue;
          ledger.set(p.id, (ledger.get(p.id) ?? 0) + 1000 + 250); // correct vote + crew bonus
        }
      }
    });
    // Exactly one phone gets the different question each round.
    host.hooks.push(() => {});
    await host.emit('game:start');
    const end = await host.waitFor((s) => s.phase === 'gameOver', 60000);
    expect(impostors).toHaveLength(4); // min(5, players)
    expect(new Set(impostors).size).toBe(4); // a different impostor every round
    for (const p of end.players) expect(p.score).toBe(ledger.get(p.id) ?? 0);
    for (const [r, qs] of questionsByRound) {
      const counts = new Map<string, number>();
      for (const q of qs.values()) counts.set(q, (counts.get(q) ?? 0) + 1);
      expect(counts.size, `round ${r}`).toBe(2);
      expect([...counts.values()].sort()).toEqual([1, 3]); // 1 impostor, 3 crew
    }
    done([host, ...players]);
  });
});
