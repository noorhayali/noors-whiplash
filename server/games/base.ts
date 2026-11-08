// Shared plumbing for games: phase timer, pause/resume, score snapshots, final results.
// A new game extends BaseGame and implements start(), action(), hostData(), playerData().
import type { Ack, Award, Highlight, HostView, Phase, PlayerAction, PlayerView, ResultsView } from '../../shared/types.js';
import type { GameInstance, Room } from '../rooms.js';
import { PhaseTimer } from '../timer.js';
import { rank } from './comedyClash/scoring.js';

export abstract class BaseGame implements GameInstance {
  phase: Phase = 'lobby';
  round = 0;
  totalRounds = 1;
  multiplier = 1;
  protected timer = new PhaseTimer();
  protected gains: Record<string, number> = {};
  protected prevScores: Record<string, number> = {};
  protected results: ResultsView | null = null;
  protected disposed = false;
  /** Phases the host's Skip button may cut short. */
  protected skippable: string[] = [];

  constructor(protected room: Room) {}

  abstract start(): void;
  abstract action(playerId: string, action: PlayerAction): Ack;
  protected abstract hostData(): unknown;
  protected abstract playerData(playerId: string): unknown;
  /** Advance early when everyone still connected is done. Called after actions and presence changes. */
  protected checkProgress(): void {}

  protected go(phase: Phase, seconds: number | null, next?: () => void) {
    if (this.disposed) return;
    this.phase = phase;
    if (seconds !== null && next) this.timer.set(seconds, next);
    else this.timer.clear();
    this.room.touch();
  }

  /** Fire the current phase timer now (e.g. everyone answered). No-op while paused. */
  protected advance() {
    if (!this.timer.paused) this.timer.fireNow();
  }

  hostSkip() {
    if (!this.timer.paused && this.skippable.includes(this.phase)) this.timer.fireNow();
  }

  pause() {
    this.timer.pause();
    this.room.touch();
  }

  resume() {
    this.timer.resume();
    if (!this.timer.paused) this.checkProgress();
    this.room.touch();
  }

  onPresenceChange() {
    if (!this.timer.paused) this.checkProgress();
    this.room.touch();
  }

  dispose() {
    this.disposed = true;
    this.timer.clear();
  }

  protected connectedIds() {
    return this.room.connectedPlayers().map((p) => p.id);
  }

  protected snapshotScores() {
    this.gains = {};
    this.prevScores = {};
    for (const p of this.room.players.values()) {
      this.prevScores[p.id] = p.score;
      this.gains[p.id] = 0;
    }
  }

  protected award(id: string, pts: number) {
    const p = this.room.players.get(id);
    if (!p || pts <= 0) return;
    p.score += pts;
    this.gains[id] = (this.gains[id] ?? 0) + pts;
  }

  protected finish(titles: string[], awards: Award[], highlights: Highlight[] = []) {
    const players = [...this.room.players.values()];
    const ranking = rank(players.map((p) => ({ id: p.id, score: p.score })));
    const winnerIds = ranking.filter((r) => r.rank === 1).map((r) => r.id);
    this.results = {
      ranking,
      winnerIds,
      winnerTitle: titles[Math.floor(Math.random() * titles.length)],
      awards: awards.filter((a) => this.room.players.has(a.playerId)).slice(0, 3),
      highlights: highlights.filter((h) => !h.playerId || this.room.players.has(h.playerId)).slice(0, 6),
    };
    this.go('gameOver', null);
  }

  /** Pick the single player with the highest value (null on ties / zero). */
  protected static leader(stats: Map<string, number>, min = 1): string | null {
    const s = [...stats.entries()].filter(([, v]) => v >= min).sort((a, b) => b[1] - a[1]);
    if (!s.length || (s[1] && s[1][1] === s[0][1])) return null;
    return s[0][0];
  }

  private common() {
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      timer: this.timer.view(),
      paused: this.timer.paused,
      multiplier: this.multiplier,
      canStart: false,
    };
  }

  hostView(): Partial<HostView> {
    const v: Partial<HostView> = { ...this.common(), data: this.hostData() };
    if (this.phase === 'scoreboard' || this.phase === 'gameOver') {
      v.gains = this.gains;
      v.prevScores = this.prevScores;
    }
    if (this.results) v.results = this.results;
    return v;
  }

  playerView(pid: string): Partial<PlayerView> {
    const v: Partial<PlayerView> = { ...this.common(), data: this.playerData(pid) };
    if (this.phase === 'scoreboard' || this.phase === 'gameOver') v.lastGain = this.gains[pid] ?? 0;
    if (this.results) v.results = this.results;
    return v;
  }
}

/** Lowercase, strip punctuation/articles/extra spaces — for comparing typed answers. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(a|an|the)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Edit distance, capped (used for "so close!" hints). */
export function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

export function cleanText(raw: unknown, max = 60): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
