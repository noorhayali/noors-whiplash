import {
  FINAL_ROUND,
  MAX_ANSWER,
  REGULAR_ROUNDS,
  type Ack,
  type AnswerView,
  type Award,
  type HostView,
  type Phase,
  type PlayerAction,
  type PlayerView,
  type ResultsView,
} from '../../../shared/types.js';
import type { GameInstance, Room } from '../../rooms.js';
import { PhaseTimer } from '../../timer.js';
import { PROMPTS, deckFor, type Prompt } from './prompts.js';
import {
  FINAL_POOL,
  ROUND_POOL,
  pairPlayers,
  rank,
  roundMultiplier,
  scoreFinal,
  scoreMatchup,
  shuffle,
} from './scoring.js';

// Phase lengths in seconds (writing time comes from room settings).
export const DURATIONS = {
  intro: 12,
  roundIntro: 4.5,
  reveal: 4,
  vote: 30,
  matchupResult: 7,
  scoreboard: 9,
  finalIntro: 6,
  finalVote: 45,
  finalResult: 11,
};

interface Matchup {
  prompt: Prompt;
  authors: [string, string];
  answers: [string | null, string | null];
  eligible: string[];
  votes: Map<string, 0 | 1>;
  points: [number, number] | null;
  sweep: 0 | 1 | null;
  forfeit: boolean;
}

interface FinalState {
  prompt: Prompt;
  answers: Map<string, string>;
  order: string[]; // authorIds in display order
  eligible: string[];
  votes: Map<string, string>; // voter → author
  points: Map<string, number> | null;
}

interface Stats {
  votes: number;
  sweeps: number;
  wins: number;
  unanswered: number;
}

const WINNER_TITLES = [
  'Certified Menace to Society',
  'Least Employable Person Here',
  'Supreme Overlord of Bad Decisions',
  'Too Funny to Be Trusted',
  'The Reason We Can’t Have Nice Things',
  'Officially Banned From Thanksgiving',
  'Professional Group-Chat Liability',
  'Unhinged, But in a Winning Way',
]

export class ComedyClashGame implements GameInstance {
  phase: Phase = 'lobby';
  private round = 0;
  private timer = new PhaseTimer();
  private matchups: Matchup[] = [];
  private mIndex = -1;
  private playedCount = 0;
  private final: FinalState | null = null;
  private gains: Record<string, number> = {};
  private prevScores: Record<string, number> = {};
  private stats = new Map<string, Stats>();
  private results: ResultsView | null = null;
  private disposed = false;

  constructor(private room: Room) {}

  // ---------------- lifecycle ----------------
  start() {
    for (const p of this.room.players.values()) this.stats.set(p.id, { votes: 0, sweeps: 0, wins: 0, unanswered: 0 });
    this.go('intro', DURATIONS.intro, () => this.startRound(1));
  }

  dispose() {
    this.disposed = true;
    this.timer.clear();
  }

  pause() {
    this.timer.pause();
    this.room.touch();
  }

  resume() {
    this.timer.resume();
    if (!this.timer.paused) this.checkProgress(); // e.g. everyone finished while paused
    this.room.touch();
  }

  private go(phase: Phase, seconds: number | null, next?: () => void) {
    if (this.disposed) return;
    this.phase = phase;
    if (seconds !== null && next) this.timer.set(seconds, next);
    else this.timer.clear();
    this.room.touch();
  }

  hostSkip() {
    const skippable: Phase[] = ['intro', 'roundIntro', 'reveal', 'matchupResult', 'scoreboard', 'finalIntro', 'finalResult'];
    if (!this.timer.paused && skippable.includes(this.phase)) this.timer.fireNow();
  }

  // ---------------- regular rounds ----------------
  private startRound(r: number) {
    this.round = r;
    this.snapshotScores();
    this.go('roundIntro', DURATIONS.roundIntro, () => this.beginWriting());
  }

  private snapshotScores() {
    this.gains = {};
    this.prevScores = {};
    for (const p of this.room.players.values()) {
      this.prevScores[p.id] = p.score;
      this.gains[p.id] = 0;
    }
  }

  private drawPrompts(allPrompts: Prompt[], n: number): Prompt[] {
    const spicy = this.room.settings.spicy;
    const pool = deckFor(allPrompts, spicy);
    let available = pool.filter((p) => !this.room.usedPrompts.has(p.id));
    if (available.length < n) {
      // Deck exhausted for this session — recycle that pool.
      for (const p of pool) this.room.usedPrompts.delete(p.id);
      available = [...pool];
    }
    // Weighted shuffle: in spicy rooms, 18+ prompts are 3× as likely as clean ones.
    const weight = (p: Prompt) => (spicy && p.deck === 'spicy' ? 3 : 1);
    const picked = available
      .map((p) => ({ p, k: Math.pow(Math.random(), 1 / weight(p)) }))
      .sort((a, b) => b.k - a.k)
      .slice(0, n)
      .map((x) => x.p);
    picked.forEach((p) => this.room.usedPrompts.add(p.id));
    return picked;
  }

  private beginWriting() {
    const ids = shuffle([...this.room.players.keys()]);
    const prompts = this.drawPrompts(PROMPTS.regular, ids.length);
    this.matchups = pairPlayers(ids).map((authors, i) => ({
      prompt: prompts[i],
      authors,
      answers: [null, null],
      eligible: [],
      votes: new Map(),
      points: null,
      sweep: null,
      forfeit: false,
    }));
    this.mIndex = -1;
    this.playedCount = 0;
    this.go('writing', this.room.settings.writingSeconds, () => this.endWriting());
  }

  private assignmentsFor(pid: string) {
    const out: { m: Matchup; slot: 0 | 1 }[] = [];
    for (const m of this.matchups) {
      if (m.authors[0] === pid) out.push({ m, slot: 0 });
      else if (m.authors[1] === pid) out.push({ m, slot: 1 });
    }
    return out;
  }

  private writingDone(pid: string) {
    if (this.phase === 'writing') return this.assignmentsFor(pid).every(({ m, slot }) => m.answers[slot] !== null);
    if (this.phase === 'finalWriting') return !!this.final?.answers.has(pid);
    return false;
  }

  private endWriting() {
    for (const m of this.matchups)
      m.answers.forEach((a, i) => {
        if (a === null) this.stat(m.authors[i]).unanswered++;
      });
    this.matchups = shuffle(this.matchups);
    this.nextMatchup();
  }

  private nextMatchup() {
    this.mIndex++;
    while (this.mIndex < this.matchups.length) {
      const m = this.matchups[this.mIndex];
      if (m.answers[0] !== null || m.answers[1] !== null) break;
      this.mIndex++; // nobody answered: skip silently
    }
    if (this.mIndex >= this.matchups.length) {
      this.go('scoreboard', DURATIONS.scoreboard, () =>
        this.round < REGULAR_ROUNDS ? this.startRound(this.round + 1) : this.startFinal(),
      );
      return;
    }
    this.playedCount++;
    const m = this.matchups[this.mIndex];
    const forfeit = m.answers[0] === null || m.answers[1] === null;
    this.go('reveal', DURATIONS.reveal, () => (forfeit ? this.resolveMatchup() : this.openVote()));
  }

  private openVote() {
    const m = this.matchups[this.mIndex];
    m.eligible = this.room.connectedPlayers().map((p) => p.id).filter((id) => !m.authors.includes(id));
    if (m.eligible.length === 0) return this.resolveMatchup();
    this.go('vote', DURATIONS.vote, () => this.resolveMatchup());
  }

  private resolveMatchup() {
    const m = this.matchups[this.mIndex];
    const counts: [number, number] = [0, 0];
    for (const v of m.votes.values()) counts[v]++;
    const s = scoreMatchup(counts, m.eligible.length, this.round, [m.answers[0] !== null, m.answers[1] !== null]);
    m.points = s.points;
    m.sweep = s.sweep;
    m.forfeit = s.forfeit;
    m.authors.forEach((id, i) => {
      this.award(id, s.points[i]);
      const st = this.stat(id);
      st.votes += counts[i];
      if (s.sweep === i) st.sweeps++;
      if (s.points[i] > s.points[1 - i]) st.wins++;
    });
    this.go('matchupResult', DURATIONS.matchupResult, () => this.nextMatchup());
  }

  // ---------------- final round ----------------
  private startFinal() {
    this.round = FINAL_ROUND;
    this.snapshotScores();
    const [prompt] = this.drawPrompts(PROMPTS.final, 1);
    this.final = { prompt, answers: new Map(), order: [], eligible: [], votes: new Map(), points: null };
    this.go('finalIntro', DURATIONS.finalIntro, () =>
      this.go('finalWriting', this.room.settings.writingSeconds, () => this.endFinalWriting()),
    );
  }

  private endFinalWriting() {
    const f = this.final!;
    for (const id of this.room.players.keys()) if (!f.answers.has(id)) this.stat(id).unanswered++;
    f.order = shuffle([...f.answers.keys()]);
    if (f.order.length < 2) return this.resolveFinal();
    f.eligible = this.room.connectedPlayers().map((p) => p.id);
    this.go('finalVote', DURATIONS.finalVote, () => this.resolveFinal());
  }

  private resolveFinal() {
    const f = this.final!;
    const counts = new Map<string, number>(f.order.map((id) => [id, 0]));
    for (const a of f.votes.values()) counts.set(a, (counts.get(a) ?? 0) + 1);
    // Lone answer (everyone else blanked): it wins by default for half the pool.
    f.points =
      f.order.length === 1 ? new Map([[f.order[0], FINAL_POOL / 2]]) : scoreFinal(counts, f.eligible.length);
    for (const [id, pts] of f.points) {
      this.award(id, pts);
      this.stat(id).votes += counts.get(id) ?? 0;
    }
    this.go('finalResult', DURATIONS.finalResult, () => this.finish());
  }

  private finish() {
    const players = [...this.room.players.values()];
    const ranking = rank(players.map((p) => ({ id: p.id, score: p.score })));
    const winnerIds = ranking.filter((r) => r.rank === 1).map((r) => r.id);
    this.results = {
      ranking,
      winnerIds,
      winnerTitle: WINNER_TITLES[Math.floor(Math.random() * WINNER_TITLES.length)],
      awards: this.buildAwards(winnerIds),
    };
    this.go('gameOver', null);
  }

  private buildAwards(winnerIds: string[]): Award[] {
    const entries = [...this.stats.entries()].filter(([id]) => this.room.players.has(id));
    const awards: Award[] = [];
    const best = (key: keyof Stats, min = 1) => {
      const sorted = entries.filter(([, s]) => s[key] >= min).sort((a, b) => b[1][key] - a[1][key]);
      return sorted.length && (sorted.length === 1 || sorted[0][1][key] > sorted[1][1][key]) ? sorted[0][0] : null;
    };
    const sweeper = best('sweeps');
    if (sweeper) awards.push({ playerId: sweeper, title: 'The Clean Sweeper', blurb: 'Most unanimous victories' });
    const crowd = best('votes');
    if (crowd && crowd !== sweeper)
      awards.push({ playerId: crowd, title: 'The Crowd Whisperer', blurb: 'Collected the most votes overall' });
    const ghost = best('unanswered');
    if (ghost) awards.push({ playerId: ghost, title: 'The Mysterious Ghost', blurb: 'Left the most answers blank. Coward.' });
    const nonWinners = rank(entries.map(([id]) => ({ id, score: this.room.players.get(id)!.score })));
    const last = nonWinners[nonWinners.length - 1];
    if (last && !winnerIds.includes(last.id) && !awards.some((a) => a.playerId === last.id))
      awards.push({ playerId: last.id, title: 'Heart of a Champion', blurb: 'Comedy is subjective. Just not that subjective.' });
    return awards.slice(0, 3);
  }

  // ---------------- helpers ----------------
  private stat(id: string): Stats {
    let s = this.stats.get(id);
    if (!s) this.stats.set(id, (s = { votes: 0, sweeps: 0, wins: 0, unanswered: 0 }));
    return s;
  }

  private award(id: string, pts: number) {
    const p = this.room.players.get(id);
    if (!p || pts <= 0) return;
    p.score += pts;
    this.gains[id] = (this.gains[id] ?? 0) + pts;
  }

  // ---------------- player actions ----------------
  action(pid: string, a: PlayerAction): Ack {
    if (!this.room.players.has(pid)) return { ok: false, error: 'Unknown player.' };
    if (a?.type === 'submit') return this.submit(pid, a.promptId, a.text);
    if (a?.type === 'vote') return this.vote(pid, a.choice);
    return { ok: false, error: 'Unknown action.' };
  }

  private submit(pid: string, promptId: unknown, rawText: unknown): Ack {
    const text = cleanAnswer(rawText);
    if (!text) return { ok: false, error: 'Write something first!' };
    if (this.phase === 'writing') {
      const a = this.assignmentsFor(pid).find(({ m }) => m.prompt.id === promptId);
      if (!a) return { ok: false, error: 'That prompt is not yours.' };
      if (a.m.answers[a.slot] !== null) return { ok: false, error: 'Already answered.' };
      a.m.answers[a.slot] = text;
    } else if (this.phase === 'finalWriting') {
      const f = this.final!;
      if (promptId !== f.prompt.id) return { ok: false, error: 'Wrong prompt.' };
      if (f.answers.has(pid)) return { ok: false, error: 'Already answered.' };
      f.answers.set(pid, text);
    } else {
      return { ok: false, error: 'Too late — time is up!' };
    }
    this.room.touch();
    this.checkProgress();
    return { ok: true };
  }

  private vote(pid: string, choice: unknown): Ack {
    if (this.phase === 'vote') {
      const m = this.matchups[this.mIndex];
      if (m.authors.includes(pid)) return { ok: false, error: 'You cannot vote on your own matchup.' };
      if (!m.eligible.includes(pid)) return { ok: false, error: 'You are not eligible to vote on this one.' };
      if (m.votes.has(pid)) return { ok: false, error: 'You already voted.' };
      if (choice !== 'a0' && choice !== 'a1') return { ok: false, error: 'Invalid choice.' };
      m.votes.set(pid, choice === 'a0' ? 0 : 1);
    } else if (this.phase === 'finalVote') {
      const f = this.final!;
      if (!f.eligible.includes(pid)) return { ok: false, error: 'You are not eligible to vote.' };
      if (f.votes.has(pid)) return { ok: false, error: 'You already voted.' };
      const idx = typeof choice === 'string' && /^f\d+$/.test(choice) ? Number(choice.slice(1)) : -1;
      const author = f.order[idx];
      if (!author) return { ok: false, error: 'Invalid choice.' };
      if (author === pid) return { ok: false, error: 'You cannot vote for your own answer.' };
      f.votes.set(pid, author);
    } else {
      return { ok: false, error: 'Voting is closed.' };
    }
    this.room.touch();
    this.checkProgress();
    return { ok: true };
  }

  /** Advance early when everyone still connected is done. */
  private checkProgress() {
    if (this.timer.paused) return; // nothing advances while paused
    const connected = this.room.connectedPlayers().map((p) => p.id);
    if (this.phase === 'writing' || this.phase === 'finalWriting') {
      if (connected.length && connected.every((id) => this.writingDone(id))) this.timer.fireNow();
    } else if (this.phase === 'vote') {
      const m = this.matchups[this.mIndex];
      const pending = m.eligible.filter((id) => connected.includes(id) && !m.votes.has(id));
      if (pending.length === 0) this.timer.fireNow();
    } else if (this.phase === 'finalVote') {
      const f = this.final!;
      const pending = f.eligible.filter((id) => {
        if (!connected.includes(id) || f.votes.has(id)) return false;
        return f.order.some((a) => a !== id); // someone with no valid option isn't waited on
      });
      if (pending.length === 0) this.timer.fireNow();
    }
  }

  onPresenceChange() {
    if (!this.timer.paused) this.checkProgress();
    this.room.touch();
  }

  // ---------------- views ----------------
  private matchupAnswers(m: Matchup, show: boolean): AnswerView[] {
    return [0, 1].map((i) => ({
      key: `a${i}`,
      text: m.answers[i],
      authorId: show ? m.authors[i] : null,
      votes: show ? [...m.votes.values()].filter((v) => v === i).length : null,
      points: show ? (m.points?.[i] ?? 0) : null,
      sweep: show && m.sweep === i,
    }));
  }

  private finalAnswers(show: boolean): AnswerView[] {
    const f = this.final!;
    const counts = new Map<string, number>();
    for (const a of f.votes.values()) counts.set(a, (counts.get(a) ?? 0) + 1);
    return f.order.map((id, i) => ({
      key: `f${i}`,
      text: f.answers.get(id)!,
      authorId: show ? id : null,
      votes: show ? (counts.get(id) ?? 0) : null,
      points: show ? (f.points?.get(id) ?? 0) : null,
    }));
  }

  private common() {
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: REGULAR_ROUNDS,
      timer: this.timer.view(),
      paused: this.timer.paused,
      multiplier: roundMultiplier(this.round || 1),
    };
  }

  hostView(): Partial<HostView> {
    const v: Partial<HostView> = { ...this.common(), canStart: false };
    if (this.phase === 'writing' || this.phase === 'finalWriting') {
      const ids = [...this.room.players.keys()];
      v.writing = { done: ids.filter((id) => this.writingDone(id)), total: ids.length };
    }
    if (['reveal', 'vote', 'matchupResult'].includes(this.phase)) {
      const m = this.matchups[this.mIndex];
      v.matchup = {
        index: this.playedCount - 1,
        count: this.matchups.filter((x) => x.answers.some((a) => a !== null)).length,
        prompt: m.prompt.text,
        answers: this.matchupAnswers(m, this.phase === 'matchupResult'),
        voted: m.votes.size,
        eligible: m.eligible.length,
        forfeit: this.phase === 'matchupResult' ? m.forfeit : false,
        pool: ROUND_POOL * roundMultiplier(this.round),
      };
    }
    if (this.final && ['finalIntro', 'finalWriting', 'finalVote', 'finalResult'].includes(this.phase)) {
      const f = this.final;
      v.final = {
        prompt: f.prompt.text,
        answers: this.phase === 'finalIntro' || this.phase === 'finalWriting' ? [] : this.finalAnswers(this.phase === 'finalResult'),
        voted: f.votes.size,
        eligible: f.eligible.length,
        pool: FINAL_POOL,
      };
    }
    if (this.phase === 'scoreboard' || this.phase === 'finalResult' || this.phase === 'gameOver') {
      v.gains = this.gains;
      v.prevScores = this.prevScores;
    }
    if (this.results) v.results = this.results;
    return v;
  }

  playerView(pid: string): Partial<PlayerView> {
    const v: Partial<PlayerView> = { ...this.common(), canStart: false };
    if (this.phase === 'writing') {
      v.writing = {
        prompts: this.assignmentsFor(pid).map(({ m, slot }) => ({ id: m.prompt.id, text: m.prompt.text, answer: m.answers[slot] })),
      };
    }
    if (this.phase === 'finalWriting' || this.phase === 'finalIntro') {
      const f = this.final!;
      v.writing = { prompts: [{ id: f.prompt.id, text: f.prompt.text, answer: f.answers.get(pid) ?? null }] };
    }
    if (this.phase === 'vote' || this.phase === 'reveal') {
      const m = this.matchups[this.mIndex];
      const mine = m.authors.indexOf(pid);
      const voted = m.votes.get(pid);
      v.vote = {
        prompt: m.prompt.text,
        options: m.answers.map((t, i) => ({ key: `a${i}`, text: t ?? '', mine: mine === i })).filter((o) => o.text),
        canVote: this.phase === 'vote' && m.eligible.includes(pid) && voted === undefined,
        votedFor: voted === undefined ? null : `a${voted}`,
        reason: mine >= 0 ? 'author' : undefined,
      };
    }
    if (this.phase === 'finalVote') {
      const f = this.final!;
      const votedAuthor = f.votes.get(pid);
      const votedFor = votedAuthor ? `f${f.order.indexOf(votedAuthor)}` : null;
      const options = f.order.map((id, i) => ({ key: `f${i}`, text: f.answers.get(id)!, mine: id === pid }));
      const hasOption = options.some((o) => !o.mine);
      v.vote = {
        prompt: f.prompt.text,
        options: shuffleStable(options, pid),
        canVote: f.eligible.includes(pid) && votedFor === null && hasOption,
        votedFor,
        reason: hasOption ? undefined : 'noAnswers',
      };
    }
    if (['matchupResult', 'scoreboard', 'finalResult', 'gameOver'].includes(this.phase)) {
      v.lastGain = this.gains[pid] ?? 0;
    }
    if (this.results) v.results = this.results;
    return v;
  }
}

function cleanAnswer(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_ANSWER);
}

/** Deterministic per-player shuffle so a phone's option order doesn't jump between state updates. */
function shuffleStable<T>(arr: T[], seed: string): T[] {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
  return shuffle(arr, rand);
}
