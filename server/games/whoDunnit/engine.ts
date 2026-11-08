// WHO DUNNIT? — everyone answers the same question on their phone… except one secret
// impostor, who gets a slightly different question (and doesn't know it). The TV shows
// the crew's question and everyone's answers. Argue out loud, then vote for the faker.
import type { Ack, Award, PlayerAction } from '../../../shared/types.js';
import { BaseGame, cleanText } from '../base.js';
import { shuffle } from '../comedyClash/scoring.js';
import { PAIRS, type Pair } from './questions.js';

export const WHO = {
  maxRounds: 5,
  intro: 12,
  roundIntro: 4,
  answer: 45,
  reveal: 14,
  vote: 60,
  result: 9,
  scoreboard: 7,
  correctVote: 1000,
  crewBonus: 250,
  escape: 2500,
};

const TITLES = ['Compulsive Liar (Affectionate)', 'Trust Issues Champion', 'Professional Gaslighter', 'The Real Villain All Along'];

export class WhoDunnitGame extends BaseGame {
  private impostorOrder: string[] = [];
  private impostor: string | null = null;
  private pair: Pair | null = null;
  private answers = new Map<string, string>();
  private votes = new Map<string, string>();
  private eligible: string[] = [];
  private caught = false;
  private stats = { escapes: new Map<string, number>(), detective: new Map<string, number>(), paranoid: new Map<string, number>() };

  protected skippable = ['intro', 'roundIntro', 'reveal', 'result', 'scoreboard'];

  start() {
    this.impostorOrder = shuffle([...this.room.players.keys()]);
    this.totalRounds = Math.min(WHO.maxRounds, this.impostorOrder.length);
    this.go('intro', WHO.intro, () => this.nextRound());
  }

  private nextRound() {
    if (this.round >= this.totalRounds) return this.end();
    this.round++;
    this.snapshotScores();
    // Next impostor who's still here.
    const connected = new Set(this.connectedIds());
    const idx = this.impostorOrder.findIndex((id) => connected.has(id));
    this.impostor = idx >= 0 ? this.impostorOrder.splice(idx, 1)[0] : shuffle([...connected])[0];
    this.pair = this.drawPair();
    this.answers.clear();
    this.votes.clear();
    this.caught = false;
    this.go('roundIntro', WHO.roundIntro, () => this.go('answer', WHO.answer, () => this.openReveal()));
  }

  private drawPair(): Pair {
    const pool = PAIRS.filter((p) => this.room.settings.spicy || !p.spicy);
    let fresh = pool.filter((p) => !this.room.usedPrompts.has(p.id));
    if (!fresh.length) {
      pool.forEach((p) => this.room.usedPrompts.delete(p.id));
      fresh = pool;
    }
    const weighted = fresh.map((p) => ({ p, k: Math.pow(Math.random(), 1 / (this.room.settings.spicy && p.spicy ? 2 : 1)) }));
    const pick = weighted.sort((a, b) => b.k - a.k)[0].p;
    this.room.usedPrompts.add(pick.id);
    return pick;
  }

  private openReveal() {
    this.go('reveal', WHO.reveal, () => {
      this.eligible = this.connectedIds();
      this.go('vote', WHO.vote, () => this.resolve());
    });
  }

  private resolve() {
    const tally = new Map<string, number>();
    for (const t of this.votes.values()) tally.set(t, (tally.get(t) ?? 0) + 1);
    const imp = this.impostor!;
    const impVotes = tally.get(imp) ?? 0;
    const maxOther = Math.max(0, ...[...tally.entries()].filter(([id]) => id !== imp).map(([, n]) => n));
    this.caught = impVotes > 0 && impVotes > maxOther;
    for (const [voter, target] of this.votes) {
      if (target === imp) {
        this.award(voter, WHO.correctVote);
        this.stats.detective.set(voter, (this.stats.detective.get(voter) ?? 0) + 1);
      } else this.stats.paranoid.set(voter, (this.stats.paranoid.get(voter) ?? 0) + 1);
    }
    if (this.caught) {
      for (const id of this.room.players.keys()) if (id !== imp) this.award(id, WHO.crewBonus);
    } else {
      this.award(imp, WHO.escape);
      this.stats.escapes.set(imp, (this.stats.escapes.get(imp) ?? 0) + 1);
    }
    this.go('result', WHO.result, () => this.go('scoreboard', WHO.scoreboard, () => this.nextRound()));
  }

  private end() {
    const awards: Award[] = [];
    const sly = BaseGame.leader(this.stats.escapes);
    if (sly) awards.push({ playerId: sly, title: 'Master of Disguise', blurb: 'Got away with it the most' });
    const det = BaseGame.leader(this.stats.detective);
    if (det && det !== sly) awards.push({ playerId: det, title: 'Human Polygraph', blurb: 'Caught the impostor most often' });
    const par = BaseGame.leader(this.stats.paranoid);
    if (par) awards.push({ playerId: par, title: 'Trusts No One', blurb: 'Accused the most innocent people' });
    this.finish(TITLES, awards);
  }

  // ---------------- actions ----------------
  action(pid: string, a: PlayerAction): Ack {
    if (a?.type === 'answer') {
      if (this.phase !== 'answer') return { ok: false, error: 'Too late!' };
      if (this.answers.has(pid)) return { ok: false, error: 'Already answered.' };
      const text = cleanText(a.text, 40);
      if (!text) return { ok: false, error: 'Type an answer.' };
      this.answers.set(pid, text);
    } else if (a?.type === 'accuse') {
      if (this.phase !== 'vote') return { ok: false, error: 'Voting is closed.' };
      if (!this.eligible.includes(pid)) return { ok: false, error: 'You can’t vote this round.' };
      if (this.votes.has(pid)) return { ok: false, error: 'You already voted.' };
      const target = String(a.target ?? '');
      if (target === pid) return { ok: false, error: 'You can’t accuse yourself.' };
      if (!this.room.players.has(target)) return { ok: false, error: 'Unknown player.' };
      this.votes.set(pid, target);
    } else return { ok: false, error: 'Unknown action.' };
    this.room.touch();
    this.checkProgress();
    return { ok: true };
  }

  protected checkProgress() {
    if (this.timer.paused) return;
    const c = this.connectedIds();
    if (this.phase === 'answer' && c.length && c.every((id) => this.answers.has(id))) this.advance();
    if (this.phase === 'vote' && this.eligible.filter((id) => c.includes(id)).every((id) => this.votes.has(id))) this.advance();
  }

  // ---------------- views ----------------
  private tally() {
    const t: Record<string, number> = {};
    for (const v of this.votes.values()) t[v] = (t[v] ?? 0) + 1;
    return t;
  }

  protected hostData() {
    const answersVisible = ['reveal', 'vote', 'result'].includes(this.phase);
    const done = this.phase === 'result' || this.phase === 'scoreboard';
    return {
      crewQuestion: answersVisible || done ? this.pair?.crew : null,
      answered: [...this.answers.keys()],
      answers: answersVisible ? Object.fromEntries(this.answers) : null,
      voted: this.votes.size,
      eligible: this.eligible.length,
      impostor: done ? this.impostor : null,
      impQuestion: done ? this.pair?.imp : null,
      tally: done ? this.tally() : null,
      caught: done ? this.caught : null,
    };
  }

  protected playerData(pid: string) {
    const isImp = pid === this.impostor;
    const done = this.phase === 'result' || this.phase === 'scoreboard';
    return {
      // During answering, each phone sees only its own question.
      question: this.phase === 'answer' ? (isImp ? this.pair?.imp : this.pair?.crew) : null,
      myAnswer: this.answers.get(pid) ?? null,
      // Once answers are on the TV, the impostor learns their secret so they can bluff.
      secret: ['reveal', 'vote'].includes(this.phase) ? (isImp ? 'impostor' : 'crew') : null,
      crewQuestion: ['reveal', 'vote'].includes(this.phase) ? this.pair?.crew : null,
      canVote: this.phase === 'vote' && this.eligible.includes(pid) && !this.votes.has(pid),
      myVote: this.votes.get(pid) ?? null,
      impostor: done ? this.impostor : null,
      caught: done ? this.caught : null,
      wasImpostor: done ? isImp : null,
    };
  }
}
