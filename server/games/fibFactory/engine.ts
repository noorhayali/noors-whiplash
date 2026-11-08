// FIB FACTORY — a weird true fact with a blank appears. Everyone writes a convincing
// fake answer. Then everyone sees the truth mixed with all the lies and tries to pick
// the real one. Points for finding the truth, and for every friend your lie fools.
import type { Ack, Award, Highlight, PlayerAction } from '../../../shared/types.js';
import { BaseGame, cleanText, normalize } from '../base.js';
import { shuffle } from '../comedyClash/scoring.js';
import { FACTS, type Fact } from './facts.js';

export const FIB = {
  questions: 5,
  intro: 10,
  question: 5,
  lie: 60,
  pick: 40,
  revealPerOption: 2.6,
  revealTail: 5,
  scoreboard: 8,
  truthPoints: 1000,
  foolPoints: 500,
};

const TITLES = [
  'Professional Liar',
  'Untrustworthy Since Birth',
  'Certified Fake News',
  'Pathological, But Make It Fun',
  'Would Lie to a Priest',
];

interface Option {
  key: string;
  text: string;
  authors: string[]; // empty = the truth
  pickers: string[];
}

export class FibFactoryGame extends BaseGame {
  private fact: Fact | null = null;
  private lies = new Map<string, string>();
  private options: Option[] = [];
  private picks = new Map<string, string>();
  private eligible: string[] = [];
  private bestLie: { authors: string[]; text: string; q: string; n: number } | null = null;
  private stats = { fooled: new Map<string, number>(), gullible: new Map<string, number>(), truth: new Map<string, number>() };

  totalRounds = FIB.questions;
  protected skippable = ['intro', 'question', 'reveal', 'scoreboard'];

  start() {
    this.go('intro', FIB.intro, () => this.nextQuestion());
  }

  private nextQuestion() {
    if (this.round >= FIB.questions) return this.end();
    this.round++;
    this.multiplier = this.round >= FIB.questions ? 3 : this.round >= 3 ? 2 : 1;
    this.snapshotScores();
    this.fact = this.drawFact();
    this.lies.clear();
    this.picks.clear();
    this.options = [];
    this.go('question', FIB.question, () => this.go('lie', this.room.settings.writingSeconds, () => this.openPick()));
  }

  private drawFact(): Fact {
    const pool = FACTS.filter((f) => this.room.settings.spicy || !f.spicy);
    let fresh = pool.filter((f) => !this.room.usedPrompts.has(f.id));
    if (!fresh.length) {
      pool.forEach((f) => this.room.usedPrompts.delete(f.id));
      fresh = pool;
    }
    const f = shuffle(fresh)[0];
    this.room.usedPrompts.add(f.id);
    return f;
  }

  private isTruth(text: string) {
    const n = normalize(text);
    const f = this.fact!;
    return [f.a, ...(f.alt ?? [])].some((t) => normalize(t) === n);
  }

  private openPick() {
    // Merge identical lies so they appear once (both liars share the credit).
    const byText = new Map<string, Option>();
    for (const [pid, text] of this.lies) {
      const k = normalize(text);
      const existing = byText.get(k);
      if (existing) existing.authors.push(pid);
      else byText.set(k, { key: '', text, authors: [pid], pickers: [] });
    }
    const all = [...byText.values(), { key: '', text: this.fact!.a, authors: [], pickers: [] }];
    this.options = shuffle(all).map((o, i) => ({ ...o, key: `o${i}` }));
    this.eligible = this.connectedIds().filter((id) => this.validOptions(id).length > 0);
    if (!this.eligible.length) return this.openReveal();
    this.go('pick', FIB.pick, () => this.openReveal());
  }

  private validOptions(pid: string) {
    return this.options.filter((o) => !o.authors.includes(pid));
  }

  private openReveal() {
    const m = this.multiplier;
    for (const [pid, key] of this.picks) {
      const o = this.options.find((x) => x.key === key)!;
      o.pickers.push(pid);
      if (!o.authors.length) {
        this.award(pid, FIB.truthPoints * m);
        inc(this.stats.truth, pid);
      } else {
        inc(this.stats.gullible, pid);
        for (const a of o.authors) {
          this.award(a, FIB.foolPoints * m);
          inc(this.stats.fooled, a);
        }
      }
    }
    for (const o of this.options)
      if (o.authors.length && o.pickers.length > (this.bestLie?.n ?? 0)) this.bestLie = { authors: o.authors, text: o.text, q: this.fact!.q, n: o.pickers.length };
    // Reveal lies that fooled people first, the truth last. Unpicked lies are skipped.
    const shown = this.options.filter((o) => o.authors.length && o.pickers.length).sort((a, b) => a.pickers.length - b.pickers.length);
    const truth = this.options.find((o) => !o.authors.length)!;
    this.revealOrder = [...shown.map((o) => o.key), truth.key];
    const secs = this.revealOrder.length * FIB.revealPerOption + FIB.revealTail;
    this.go('reveal', secs, () => this.go('scoreboard', FIB.scoreboard, () => this.nextQuestion()));
  }
  private revealOrder: string[] = [];

  private end() {
    const awards: Award[] = [];
    const liar = BaseGame.leader(this.stats.fooled);
    if (liar) awards.push({ playerId: liar, title: 'Master Manipulator', blurb: 'Fooled the most friends' });
    const sniffer = BaseGame.leader(this.stats.truth);
    if (sniffer && sniffer !== liar) awards.push({ playerId: sniffer, title: 'Human Lie Detector', blurb: 'Found the truth most often' });
    const sucker = BaseGame.leader(this.stats.gullible);
    if (sucker) awards.push({ playerId: sucker, title: 'Will Believe Anything', blurb: 'Fell for the most lies' });
    const hl: Highlight[] = [];
    if (this.bestLie) hl.push({ title: 'Lie of the night', value: `fooled ${this.bestLie.n} ${this.bestLie.n === 1 ? 'person' : 'people'}`, playerId: this.bestLie.authors[0], quote: { prompt: this.bestLie.q.replace('___', '_____'), text: this.bestLie.text } });
    const cnt = (m: Map<string, number>) => { const id = BaseGame.leader(m); return id ? { id, n: m.get(id)! } : null; };
    const l = cnt(this.stats.fooled);
    if (l) hl.push({ title: 'Master manipulator', value: `fooled friends ${l.n} times`, playerId: l.id });
    const t = cnt(this.stats.truth);
    if (t) hl.push({ title: 'Human lie detector', value: `found the truth ${t.n} times`, playerId: t.id });
    const g = cnt(this.stats.gullible);
    if (g) hl.push({ title: 'Will believe anything', value: `fell for ${g.n} lies`, playerId: g.id });
    this.finish(TITLES, awards, hl);
  }

  // ---------------- actions ----------------
  action(pid: string, a: PlayerAction): Ack {
    if (a?.type === 'lie') {
      if (this.phase !== 'lie') return { ok: false, error: 'Too late!' };
      if (this.lies.has(pid)) return { ok: false, error: 'You already lied. Once is enough.' };
      const text = cleanText(a.text, 50);
      if (!text) return { ok: false, error: 'Write a fake answer first.' };
      if (this.isTruth(text)) return { ok: false, error: 'That’s actually the real answer! Make up a lie.' };
      this.lies.set(pid, text);
    } else if (a?.type === 'pick') {
      if (this.phase !== 'pick') return { ok: false, error: 'Picking is closed.' };
      if (!this.eligible.includes(pid)) return { ok: false, error: 'You can’t pick this round.' };
      if (this.picks.has(pid)) return { ok: false, error: 'You already picked.' };
      const o = this.options.find((x) => x.key === a.choice);
      if (!o) return { ok: false, error: 'Invalid choice.' };
      if (o.authors.includes(pid)) return { ok: false, error: 'You can’t pick your own lie.' };
      this.picks.set(pid, o.key);
    } else return { ok: false, error: 'Unknown action.' };
    this.room.touch();
    this.checkProgress();
    return { ok: true };
  }

  protected checkProgress() {
    if (this.timer.paused) return;
    const c = this.connectedIds();
    if (this.phase === 'lie' && c.length && c.every((id) => this.lies.has(id))) this.advance();
    if (this.phase === 'pick' && this.eligible.filter((id) => c.includes(id)).every((id) => this.picks.has(id))) this.advance();
  }

  // ---------------- views ----------------
  protected hostData() {
    const f = this.fact;
    const base = { question: f?.q ?? '' };
    if (this.phase === 'lie') return { ...base, done: [...this.lies.keys()] };
    if (this.phase === 'pick') return { ...base, options: this.options.map((o) => ({ key: o.key, text: o.text })), picked: this.picks.size, eligible: this.eligible.length };
    if (this.phase === 'reveal')
      return {
        ...base,
        truth: f!.a,
        order: this.revealOrder,
        options: this.options.map((o) => ({ key: o.key, text: o.text, authors: o.authors, pickers: o.pickers, truth: !o.authors.length })),
        perOption: FIB.revealPerOption,
      };
    return base;
  }

  protected playerData(pid: string) {
    const f = this.fact;
    if (this.phase === 'lie') return { question: f!.q, myLie: this.lies.get(pid) ?? null };
    if (this.phase === 'pick')
      return {
        question: f!.q,
        options: this.options.map((o) => ({ key: o.key, text: o.text, mine: o.authors.includes(pid) })),
        myPick: this.picks.get(pid) ?? null,
        canPick: this.eligible.includes(pid) && !this.picks.has(pid),
      };
    if (this.phase === 'reveal') {
      const picked = this.options.find((o) => o.pickers.includes(pid));
      const mine = this.options.find((o) => o.authors.includes(pid));
      return { truth: f!.a, result: !picked ? 'none' : picked.authors.length ? 'fooled' : 'truth', fooledCount: mine?.pickers.length ?? 0, gain: this.gains[pid] ?? 0 };
    }
    return { question: f?.q ?? '' };
  }
}

function inc(m: Map<string, number>, k: string) {
  m.set(k, (m.get(k) ?? 0) + 1);
}
