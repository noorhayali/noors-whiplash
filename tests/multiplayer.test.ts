// End-to-end multiplayer tests: a real server on a real port, with independent
// socket.io clients acting as the TV host and each phone. Timers are scaled down
// (TIME_SCALE) so a whole game takes a few seconds.
process.env.TIME_SCALE = '0.02';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import type { Ack, HostView, PlayerView } from '../shared/types';

let url = '';
let close: () => void;

beforeAll(async () => {
  const { createApp } = await import('../server/index');
  const { server, io } = createApp();
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
  close = () => {
    io.close();
    server.close();
  };
});
afterAll(() => close?.());

class Client<V extends HostView | PlayerView = any> {
  socket: Socket;
  state: V | null = null;
  phases: string[] = [];
  listeners = new Set<() => void>();
  onState?: (s: V) => void;
  constructor() {
    this.socket = connect(url, { transports: ['websocket'], forceNew: true });
    this.socket.on('state', (s: V) => {
      this.state = s;
      if (this.phases[this.phases.length - 1] !== s.phase) this.phases.push(s.phase);
      this.onState?.(s);
      this.listeners.forEach((l) => l());
    });
  }
  emit<T = any>(ev: string, payload: unknown = {}): Promise<Ack<T>> {
    return new Promise((r) => this.socket.emit(ev, payload, r));
  }
  waitFor(pred: (s: V) => boolean, ms = 20000): Promise<V> {
    return new Promise((resolve, reject) => {
      const check = () => {
        if (this.state && pred(this.state)) {
          this.listeners.delete(check);
          clearTimeout(t);
          resolve(this.state);
        }
      };
      const t = setTimeout(() => {
        this.listeners.delete(check);
        reject(new Error(`timeout waiting; last phase=${this.state?.phase}`));
      }, ms);
      this.listeners.add(check);
      check();
    });
  }
  close() {
    this.socket.close();
  }
}

/** A phone that plays automatically. */
function bot(opts: { answer?: boolean; vote?: boolean } = {}) {
  const c = new Client<PlayerView>();
  const { answer = true, vote = true } = opts;
  const submitted = new Set<string>();
  let lastVoteKey = '';
  c.onState = (s) => {
    if (answer && s.writing && (s.phase === 'writing' || s.phase === 'finalWriting')) {
      for (const p of s.writing.prompts) {
        if (p.answer === null && !submitted.has(`${s.round}:${p.id}`)) {
          submitted.add(`${s.round}:${p.id}`);
          c.emit('game:action', { type: 'submit', promptId: p.id, text: `${s.me.name} says: ${p.text.slice(0, 20)}` });
        }
      }
    }
    if (vote && s.vote?.canVote) {
      const key = `${s.round}:${s.vote.prompt}`;
      if (key !== lastVoteKey) {
        lastVoteKey = key;
        const opt = s.vote.options.find((o) => !o.mine);
        if (opt) c.emit('game:action', { type: 'vote', choice: opt.key });
      }
    }
  };
  return c;
}

async function setupRoom(n: number, botOpts: Parameters<typeof bot>[0][] = []) {
  const host = new Client<HostView>();
  const created = await host.emit<{ code: string; hostToken: string }>('host:create', { gameId: 'comedy-clash' });
  expect(created.ok).toBe(true);
  const code = created.data!.code;
  const players: Client<PlayerView>[] = [];
  const tokens: string[] = [];
  for (let i = 0; i < n; i++) {
    const b = bot(botOpts[i]);
    const res = await b.emit<{ playerId: string; token: string }>('player:join', { code, name: `Player${i + 1}`, avatar: i });
    expect(res.ok, res.error).toBe(true);
    tokens.push(res.data!.token);
    players.push(b);
  }
  await host.waitFor((s) => s.players.length === n);
  return { host, players, code, tokens, hostToken: created.data!.hostToken };
}

/** Records every matchup / final result the TV showed so we can re-add the points independently. */
function scoreRecorder(host: Client<HostView>) {
  const seen = new Map<string, Record<string, number>>();
  const prev = host.onState;
  host.onState = (s) => {
    prev?.(s);
    if (s.phase === 'matchupResult' && s.matchup) {
      const pts: Record<string, number> = {};
      for (const a of s.matchup.answers) if (a.authorId) pts[a.authorId] = a.points ?? 0;
      seen.set(`r${s.round}-m${s.matchup.index}`, pts);
    }
    if (s.phase === 'finalResult' && s.final) {
      const pts: Record<string, number> = {};
      for (const a of s.final.answers) if (a.authorId) pts[a.authorId] = a.points ?? 0;
      seen.set('final', pts);
    }
  };
  return () => {
    const totals: Record<string, number> = {};
    for (const pts of seen.values()) for (const [id, p] of Object.entries(pts)) totals[id] = (totals[id] ?? 0) + p;
    return { totals, count: seen.size };
  };
}

describe('Comedy Clash — full multiplayer game', () => {
  it('plays a complete 4-player game from lobby to winner with correct scores', async () => {
    const { host, players } = await setupRoom(4);
    const totals = scoreRecorder(host);

    // Players see their own nickname/avatar; first player is VIP.
    for (const [i, p] of players.entries()) {
      const s = await p.waitFor((s) => !!s.me);
      expect(s.me.name).toBe(`Player${i + 1}`);
      expect(s.me.avatar).toBe(i);
    }
    expect((await players[0].waitFor((s) => s.canStart)).me.isVip).toBe(true);

    // A non-VIP phone cannot start the game.
    expect((await players[2].emit('game:start')).ok).toBe(false);
    expect((await host.emit('game:start')).ok).toBe(true);

    const end = await host.waitFor((s) => s.phase === 'gameOver', 45000);
    // Every stage happened, in order.
    const order = ['intro', 'roundIntro', 'writing', 'reveal', 'vote', 'matchupResult', 'scoreboard', 'finalIntro', 'finalWriting', 'finalVote', 'finalResult', 'gameOver'];
    for (const ph of order) expect(host.phases).toContain(ph);
    expect(host.phases.filter((p) => p === 'roundIntro')).toHaveLength(3);

    // 4 players × 3 rounds = 12 head-to-heads + 1 final.
    const { totals: t, count } = totals();
    expect(count).toBe(13);
    for (const p of end.players) expect(p.score).toBe(t[p.id] ?? 0);
    // Each regular matchup has 2 voters who all voted → every matchup awards exactly its pool.
    const sum = end.players.reduce((a, p) => a + p.score, 0);
    expect(sum).toBeGreaterThan(0);

    expect(end.results!.ranking).toHaveLength(4);
    expect(end.results!.winnerIds.length).toBeGreaterThanOrEqual(1);
    const top = Math.max(...end.players.map((p) => p.score));
    for (const w of end.results!.winnerIds) expect(end.players.find((p) => p.id === w)!.score).toBe(top);
    expect(end.results!.winnerTitle.length).toBeGreaterThan(3);
    // Highlights: the funniest player and a quoted line of the night.
    const hl = end.results!.highlights;
    expect(hl.some((h) => h.title === 'Funniest person here')).toBe(true);
    const line = hl.find((h) => h.title === 'Line of the night')!;
    expect(line.quote!.text).toContain('says:');
    expect(end.players.some((p) => p.id === line.playerId)).toBe(true);

    // Phones also reach the end with their own rank.
    for (const p of players) {
      const s = await p.waitFor((s) => s.phase === 'gameOver');
      expect(s.results).toBeTruthy();
    }
    [host, ...players].forEach((c) => c.close());
  });

  it('enforces voting rules and keeps answers private on the server', async () => {
    const { host, players } = await setupRoom(4, [{ answer: true, vote: false }, { vote: false }, { vote: false }, { vote: false }]);
    await host.emit('game:start');

    // During writing, a phone only ever receives its own prompts — never other answers.
    const w = await players[0].waitFor((s) => s.phase === 'writing');
    expect(w.writing!.prompts).toHaveLength(2);
    expect(JSON.stringify(w)).not.toContain('Player2 says');
    // Cannot answer someone else's prompt.
    const bad = await players[0].emit('game:action', { type: 'submit', promptId: 'not-mine', text: 'hi' });
    expect(bad.ok).toBe(false);
    // TV shows progress, but never the text.
    const hw = await host.waitFor((s) => s.phase === 'writing');
    expect(JSON.stringify(hw)).not.toContain('says:');

    const hv = await host.waitFor((s) => s.phase === 'vote');
    // Authors hidden while voting.
    expect(hv.matchup!.answers.every((a) => a.authorId === null && a.votes === null)).toBe(true);

    const states = await Promise.all(players.map((p) => p.waitFor((s) => s.phase === 'vote')));
    const authorIdx = states.findIndex((s) => s.vote!.reason === 'author');
    const author = players[authorIdx];
    const authorState = states[authorIdx];
    expect(authorState.vote!.canVote).toBe(false);
    const mineKey = authorState.vote!.options.find((o) => o.mine)!.key;
    const otherKey = authorState.vote!.options.find((o) => !o.mine)!.key;
    expect((await author.emit('game:action', { type: 'vote', choice: mineKey })).ok).toBe(false);
    expect((await author.emit('game:action', { type: 'vote', choice: otherKey })).ok).toBe(false);

    const voterIdx = states.findIndex((s) => s.vote!.canVote);
    const voter = players[voterIdx];
    expect((await voter.emit('game:action', { type: 'vote', choice: 'a0' })).ok).toBe(true);
    const again = await voter.emit('game:action', { type: 'vote', choice: 'a1' });
    expect(again.ok).toBe(false);
    expect(again.error).toMatch(/already/i);
    expect((await voter.emit('game:action', { type: 'vote', choice: 'zzz' })).ok).toBe(false);

    const res = await host.waitFor((s) => s.phase === 'matchupResult');
    expect(res.matchup!.answers.map((a) => a.votes).reduce((a, b) => a! + b!, 0)).toBe(1);
    expect(res.matchup!.answers.every((a) => a.authorId)).toBe(true);
    [host, ...players].forEach((c) => c.close());
  });

  it('reconnects a refreshed phone to the same player and handles a silent player', async () => {
    // Player 3 never answers → their matchups are forfeits; game must still finish.
    const { host, players, code, tokens } = await setupRoom(3, [{}, {}, { answer: false, vote: true }]);
    await host.emit('game:start');
    const before = await players[1].waitFor((s) => s.phase === 'writing');
    const myId = before.me.id;

    // "Refresh" player 2: kill the socket, open a new one, resume with the token.
    players[1].close();
    await host.waitFor((s) => s.players.some((p) => p.id === myId && !p.connected));
    const phone = bot();
    const resumed = await phone.emit('player:resume', { code, token: tokens[1] });
    expect(resumed.ok).toBe(true);
    expect(resumed.data.playerId).toBe(myId);
    const after = await phone.waitFor((s) => !!s.me);
    expect(after.me.name).toBe('Player2');
    await host.waitFor((s) => s.players.every((p) => p.connected));

    // Bad tokens are rejected.
    const evil = new Client();
    expect((await evil.emit('player:resume', { code, token: 'forged' })).ok).toBe(false);

    const end = await host.waitFor((s) => s.phase === 'gameOver', 45000);
    expect(host.phases).toContain('matchupResult');
    const silent = end.players.find((p) => p.name === 'Player3')!;
    expect(silent.score).toBe(0);
    expect(end.results!.awards.some((a) => a.title === 'The Mysterious Ghost' && a.playerId === silent.id)).toBe(true);
    [host, phone, players[0], players[2], evil].forEach((c) => c.close());
  });

  it('pauses when the TV disconnects and resumes when it reconnects', async () => {
    const { host, players, code, hostToken } = await setupRoom(3, [{ answer: false }, { answer: false }, { answer: false }]);
    await host.emit('game:start');
    await players[0].waitFor((s) => s.phase === 'writing');
    host.close();
    const paused = await players[0].waitFor((s) => s.paused && !s.hostConnected);
    expect(paused.phase).toBe('writing');
    await new Promise((r) => setTimeout(r, 1800)); // longer than the scaled 60s writing timer
    expect(players[0].state!.phase).toBe('writing'); // still frozen

    const tv = new Client<HostView>();
    expect((await tv.emit('host:resume', { code, hostToken })).ok).toBe(true);
    await players[0].waitFor((s) => !s.paused && s.hostConnected);
    await tv.waitFor((s) => s.phase !== 'writing', 10000); // timer resumes and expires
    [tv, ...players].forEach((c) => c.close());
  });

  it('host pause button freezes the game and resume continues it', async () => {
    const { host, players } = await setupRoom(3, [{ answer: false }, { answer: false }, { answer: false }]);
    expect((await host.emit('host:pause', { paused: true })).ok).toBe(false); // nothing to pause in lobby
    await host.emit('game:start');
    await players[0].waitFor((s) => s.phase === 'writing');
    expect((await host.emit('host:pause', { paused: true })).ok).toBe(true);
    const p = await players[0].waitFor((s) => s.paused && s.hostConnected);
    expect(p.phase).toBe('writing');
    // Even if everyone submits while paused, nothing advances.
    for (const c of players) {
      const prompts = c.state!.writing!.prompts;
      for (const pr of prompts) await c.emit('game:action', { type: 'submit', promptId: pr.id, text: 'paused answer' });
    }
    await new Promise((r) => setTimeout(r, 2500)); // longer than the scaled writing timer
    expect(host.state!.phase).toBe('writing');
    expect((await host.emit('host:pause', { paused: false })).ok).toBe(true);
    await host.waitFor((s) => s.phase !== 'writing' && !s.paused, 10000);
    [host, ...players].forEach((c) => c.close());
  });

  it('supports Play Again without repeating prompts, and Back to Lobby', async () => {
    const { host, players } = await setupRoom(3);
    const seenPrompts: string[][] = [[], []];
    let game = 0;
    players[0].onState = ((orig) => (s: PlayerView) => {
      orig?.(s);
      if (s.phase === 'writing') for (const p of s.writing!.prompts) if (!seenPrompts[game].includes(p.id)) seenPrompts[game].push(p.id);
    })(players[0].onState);

    await host.emit('game:start');
    await host.waitFor((s) => s.phase === 'gameOver', 45000);
    game = 1;
    // VIP phone can trigger Play Again too.
    expect((await players[0].emit('game:playAgain')).ok).toBe(true);
    const restarted = await host.waitFor((s) => s.phase === 'intro');
    expect(restarted.players.every((p) => p.score === 0)).toBe(true);
    await host.waitFor((s) => s.phase === 'gameOver', 45000);
    expect(seenPrompts[0].length).toBe(6);
    expect(seenPrompts[1].length).toBe(6);
    expect(seenPrompts[1].filter((id) => seenPrompts[0].includes(id))).toEqual([]);

    await host.emit('host:backToLobby');
    const lobby = await host.waitFor((s) => s.phase === 'lobby');
    expect(lobby.players).toHaveLength(3);
    expect(lobby.canStart).toBe(true);
    [host, ...players].forEach((c) => c.close());
  });

  it('validates joining: bad code, duplicate names, full rooms, game in progress, minimum players', async () => {
    const host = new Client<HostView>();
    const { data } = await host.emit('host:create', {});
    const code = data.code;
    const p = new Client();
    expect((await p.emit('player:join', { code: 'ZZZZ', name: 'A', avatar: 0 })).ok).toBe(false);
    expect((await p.emit('player:join', { code: code.toLowerCase(), name: '  Ana  ', avatar: 0 })).ok).toBe(true);
    const dup = new Client();
    expect((await dup.emit('player:join', { code, name: 'ana', avatar: 1 })).error).toMatch(/name/i);
    expect((await dup.emit('player:join', { code, name: '', avatar: 1 })).ok).toBe(false);
    // Same avatar requested → server assigns a free one.
    const r = await dup.emit('player:join', { code, name: 'Bo', avatar: 0 });
    expect(r.ok).toBe(true);
    const st = await host.waitFor((s) => s.players.length === 2);
    expect(new Set(st.players.map((x) => x.avatar)).size).toBe(2);
    // Only 2 players → cannot start.
    expect(st.canStart).toBe(false);
    expect((await host.emit('game:start')).ok).toBe(false);

    const extra: Client[] = [];
    for (let i = 0; i < 8; i++) {
      const c = new Client();
      extra.push(c);
      expect((await c.emit('player:join', { code, name: `X${i}`, avatar: i + 2 })).ok).toBe(true);
    }
    const eleventh = new Client();
    expect((await eleventh.emit('player:join', { code, name: 'Late', avatar: 0 })).error).toMatch(/full/i);
    expect((await host.emit('game:start')).ok).toBe(true);
    // Full room stays full even mid-game.
    const late = new Client();
    expect((await late.emit('player:join', { code, name: 'Later', avatar: 0 })).error).toMatch(/full/i);
    [host, p, dup, eleventh, late, ...extra].forEach((c) => c.close());
  });

  it('lets players rename themselves in the lobby (unique names, lobby only)', async () => {
    const { host, players } = await setupRoom(3);
    expect((await players[0].emit('player:rename', { name: 'Captain Chaos' })).ok).toBe(true);
    await host.waitFor((s) => s.players.some((p) => p.name === 'Captain Chaos'));
    expect((await players[1].emit('player:rename', { name: 'captain chaos' })).error).toMatch(/name/i);
    expect((await players[1].emit('player:rename', { name: '   ' })).ok).toBe(false);
    await host.emit('game:start');
    await host.waitFor((s) => s.phase !== 'lobby');
    expect((await players[2].emit('player:rename', { name: 'Too Late' })).ok).toBe(false);
    [host, ...players].forEach((c) => c.close());
  });

  it('family mode never serves 18+ prompts', async () => {
    const { host, players } = await setupRoom(4);
    await host.emit('host:settings', { spicy: false });
    await host.waitFor((s) => s.settings.spicy === false);
    const ids = new Set<string>();
    players[0].onState = ((orig) => (s: PlayerView) => {
      orig?.(s);
      s.writing?.prompts.forEach((p) => ids.add(p.id));
    })(players[0].onState);
    await host.emit('game:start');
    await host.waitFor((s) => s.phase === 'gameOver', 45000);
    expect(ids.size).toBe(7); // 2 per round × 3 + final
    for (const id of ids) expect(id).toMatch(/family/);
    [host, ...players].forEach((c) => c.close());
  });

  it('lets someone join mid-game with 0 points; they play from the next round', async () => {
    const { host, players, code } = await setupRoom(3);
    const totals = scoreRecorder(host);
    await host.emit('game:start');
    await host.waitFor((s) => s.phase === 'writing' && s.round === 1);
    const late = bot();
    const r = await late.emit('player:join', { code, name: 'Latecomer', avatar: 9 });
    expect(r.ok, r.error).toBe(true);
    const me = await late.waitFor((s) => !!s.me);
    expect(me.me.score).toBe(0);
    expect(me.me.lateJoiner).toBe(true);
    expect(me.phase).not.toBe('lobby');
    // No prompts in the round they joined…
    if (me.phase === 'writing') expect(me.writing?.prompts ?? []).toHaveLength(0);
    // …but two prompts next round.
    const r2 = await late.waitFor((s) => s.phase === 'writing' && s.round === 2, 30000);
    expect(r2.writing!.prompts).toHaveLength(2);
    const end = await host.waitFor((s) => s.phase === 'gameOver', 45000);
    expect(end.players).toHaveLength(4);
    const { totals: t } = totals();
    for (const p of end.players) expect(p.score).toBe(t[p.id] ?? 0);
    expect(end.results!.ranking).toHaveLength(4);
    [host, late, ...players].forEach((c) => c.close());
  });

  it('keeps 10 simultaneous players in sync through a full game', async () => {
    const { host, players } = await setupRoom(10);
    const totals = scoreRecorder(host);
    await host.emit('game:start');
    const end = await host.waitFor((s) => s.phase === 'gameOver', 60000);
    const { totals: t, count } = totals();
    expect(count).toBe(31); // 10 × 3 + final
    for (const p of end.players) expect(p.score).toBe(t[p.id] ?? 0);
    const finals = await Promise.all(players.map((p) => p.waitFor((s) => s.phase === 'gameOver')));
    for (const f of finals) {
      expect(f.players.map((p) => p.score)).toEqual(end.players.map((p) => p.score));
      const me = end.players.find((p) => p.id === f.me.id)!;
      expect(f.me.score).toBe(me.score);
    }
    [host, ...players].forEach((c) => c.close());
  });
});
