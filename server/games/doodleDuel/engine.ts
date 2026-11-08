// DOODLE DUEL — every player takes one turn as the artist. The artist picks one of two
// secret words and draws it on their phone; strokes stream live to the TV. Everyone
// else races to guess on their phones. Faster = more points; the artist earns points
// for every friend who gets it.
import type { Ack, Award, PlayerAction } from '../../../shared/types.js';
import { BaseGame, cleanText, levenshtein, normalize } from '../base.js';
import { round10, shuffle } from '../comedyClash/scoring.js';
import { ALIASES, FAMILY_WORDS, SPICY_WORDS } from './words.js';

export const DOODLE = {
  intro: 10,
  choose: 12,
  draw: 75,
  reveal: 7,
  scoreboard: 9,
  guessMax: 1000,
  guessMin: 300,
  artistPerGuess: 250,
  maxStrokes: 600,
  maxPoints: 30000,
};

export const COLORS = ['#1d1a24', '#ff5a4e', '#ff9a3c', '#ffd23f', '#7ed6a7', '#3f8cff', '#b9a3f5', '#ff7eb6', '#8a5a3c', '#ffffff'];
export const WIDTHS = [4, 10, 24];

const TITLES = ['Picasso of Filth', 'Gallery-Ready Degenerate', 'Banned From Art School', 'Professional Doodler (Unpaid)'];

interface Stroke {
  c: number;
  w: number;
  p: number[]; // flat x,y pairs in 0..1000
}
interface FeedItem {
  id: number;
  pid: string;
  text: string | null; // null = hidden (correct or close)
  kind: 'wrong' | 'close' | 'correct';
}

export class DoodleDuelGame extends BaseGame {
  private order: string[] = [];
  private artist: string | null = null;
  private choices: string[] = [];
  private word = '';
  private strokes: Stroke[] = [];
  private pointCount = 0;
  private correct = new Map<string, number>(); // pid → points
  private feed: FeedItem[] = [];
  private feedId = 0;
  private lastGuess = new Map<string, number>();
  private drawStart = 0;
  private stats = { drawn: new Map<string, number>(), quick: new Map<string, number>() };

  protected skippable = ['intro', 'reveal', 'scoreboard'];

  start() {
    this.order = shuffle([...this.room.players.keys()]);
    this.totalRounds = this.order.length;
    this.snapshotScores();
    this.go('intro', DOODLE.intro, () => this.nextTurn());
  }

  private nextTurn() {
    // Skip artists who left.
    while (this.round < this.order.length) {
      const id = this.order[this.round];
      this.round++;
      if (this.room.players.get(id)?.connected) {
        this.artist = id;
        this.choices = this.drawWords(2);
        this.word = '';
        this.strokes = [];
        this.pointCount = 0;
        this.correct.clear();
        this.feed = [];
        this.lastGuess.clear();
        this.go('choose', DOODLE.choose, () => this.beginDraw(this.choices[0]));
        return;
      }
    }
    this.go('scoreboard', DOODLE.scoreboard, () => this.end());
  }

  private drawWords(n: number) {
    const pool = this.room.settings.spicy ? [...SPICY_WORDS, ...SPICY_WORDS, ...FAMILY_WORDS] : FAMILY_WORDS;
    const uniq = [...new Set(pool)];
    let fresh = uniq.filter((w) => !this.room.usedPrompts.has(`doodle-${w}`));
    if (fresh.length < n) {
      uniq.forEach((w) => this.room.usedPrompts.delete(`doodle-${w}`));
      fresh = uniq;
    }
    // Spicy rooms: weight spicy words higher.
    const weighted = fresh.map((w) => ({ w, k: Math.pow(Math.random(), 1 / (this.room.settings.spicy && SPICY_WORDS.includes(w) ? 3 : 1)) }));
    const picked = weighted.sort((a, b) => b.k - a.k).slice(0, n).map((x) => x.w);
    picked.forEach((w) => this.room.usedPrompts.add(`doodle-${w}`));
    return picked;
  }

  private hintTicker: NodeJS.Timeout | null = null;
  private lastHint = '';

  private beginDraw(word: string) {
    this.word = word;
    this.drawStart = Date.now();
    this.go('draw', DOODLE.draw, () => this.reveal());
    // Re-broadcast when the hint reveals a letter.
    this.lastHint = this.hint();
    if (this.hintTicker) clearInterval(this.hintTicker);
    this.hintTicker = setInterval(() => {
      if (this.phase !== 'draw' || this.disposed) return void (this.hintTicker && clearInterval(this.hintTicker));
      const h = this.hint();
      if (h !== this.lastHint) {
        this.lastHint = h;
        this.room.touch();
      }
    }, 1000);
  }

  dispose() {
    super.dispose();
    if (this.hintTicker) clearInterval(this.hintTicker);
  }

  private reveal() {
    const n = this.correct.size;
    if (this.artist && n) {
      this.award(this.artist, DOODLE.artistPerGuess * n);
      this.stats.drawn.set(this.artist, n);
    }
    this.go('reveal', DOODLE.reveal, () => this.nextTurn());
  }

  private end() {
    const awards: Award[] = [];
    const best = BaseGame.leader(this.stats.drawn);
    if (best) awards.push({ playerId: best, title: 'Accidental Artist', blurb: 'Their drawing got the most correct guesses' });
    const quick = BaseGame.leader(this.stats.quick);
    if (quick && quick !== best) awards.push({ playerId: quick, title: 'Dirty Mind', blurb: 'Guessed first the most times' });
    const worst = [...this.order].find((id) => this.room.players.has(id) && !this.stats.drawn.get(id) && id !== best);
    if (worst) awards.push({ playerId: worst, title: 'Abstract Expressionist', blurb: 'Nobody had a clue what that was' });
    this.finish(TITLES, awards);
  }

  // ---------------- drawing ----------------
  draw(pid: string, raw: unknown) {
    if (this.phase !== 'draw' || pid !== this.artist || this.timer.paused) return;
    const d = raw as { t?: string; c?: number; w?: number; p?: unknown };
    let delta: unknown = null;
    if (d?.t === 's' || d?.t === 'm') {
      const pts = sanitizePoints(d.p);
      if (!pts.length || this.pointCount + pts.length > DOODLE.maxPoints) return;
      if (d.t === 's') {
        if (this.strokes.length >= DOODLE.maxStrokes) return;
        const c = Number.isInteger(d.c) && d.c! >= 0 && d.c! < COLORS.length ? d.c! : 0;
        const w = Number.isInteger(d.w) && d.w! >= 0 && d.w! < WIDTHS.length ? d.w! : 0;
        this.strokes.push({ c, w, p: pts });
        delta = { t: 's', c, w, p: pts };
      } else {
        const last = this.strokes[this.strokes.length - 1];
        if (!last) return;
        last.p.push(...pts);
        delta = { t: 'm', p: pts };
      }
      this.pointCount += pts.length;
    } else if (d?.t === 'u') {
      const s = this.strokes.pop();
      if (s) this.pointCount -= s.p.length;
      delta = { t: 'u' };
    } else if (d?.t === 'c') {
      this.strokes = [];
      this.pointCount = 0;
      delta = { t: 'c' };
    }
    if (delta) this.room.emitHost('draw', delta);
  }

  // ---------------- actions ----------------
  action(pid: string, a: PlayerAction): Ack {
    if (a?.type === 'choose') {
      if (this.phase !== 'choose' || pid !== this.artist) return { ok: false, error: 'Not your turn to choose.' };
      const w = this.choices[Number(a.index)];
      if (!w) return { ok: false, error: 'Invalid word.' };
      this.timer.clear();
      this.beginDraw(w);
      return { ok: true };
    }
    if (a?.type === 'guess') {
      if (this.phase !== 'draw') return { ok: false, error: 'No drawing right now.' };
      if (pid === this.artist) return { ok: false, error: 'You’re the artist. No cheating.' };
      if (this.correct.has(pid)) return { ok: false, error: 'You already got it!' };
      const now = Date.now();
      if (now - (this.lastGuess.get(pid) ?? 0) < 700) return { ok: false, error: 'Slow down!' };
      this.lastGuess.set(pid, now);
      const text = cleanText(a.text, 40);
      if (!text) return { ok: false, error: 'Type a guess.' };
      const g = normalize(text);
      const targets = [this.word, ...(ALIASES[this.word] ?? [])].map(normalize);
      const squash = (s: string) => s.replace(/ /g, '');
      if (targets.some((t) => t === g || squash(t) === squash(g) || t === g.replace(/s$/, ''))) {
        const v = this.timer.view();
        const frac = v ? Math.max(0, (v.deadline - now) / v.duration) : 0;
        const pts = round10(DOODLE.guessMin + (DOODLE.guessMax - DOODLE.guessMin) * frac);
        if (this.correct.size === 0) this.stats.quick.set(pid, (this.stats.quick.get(pid) ?? 0) + 1);
        this.correct.set(pid, pts);
        this.award(pid, pts);
        this.pushFeed(pid, null, 'correct');
        this.room.touch();
        this.checkProgress();
        return { ok: true, data: { correct: true, points: pts } };
      }
      const close = targets.some((t) => t.length >= 4 && levenshtein(t, g) <= (t.length > 7 ? 2 : 1));
      this.pushFeed(pid, close ? null : text, close ? 'close' : 'wrong');
      this.room.touch();
      return { ok: true, data: { correct: false, close } };
    }
    return { ok: false, error: 'Unknown action.' };
  }

  private pushFeed(pid: string, text: string | null, kind: FeedItem['kind']) {
    this.feed.push({ id: ++this.feedId, pid, text, kind });
    if (this.feed.length > 14) this.feed.shift();
  }

  protected checkProgress() {
    if (this.timer.paused) return;
    if (this.phase === 'draw') {
      const guessers = this.connectedIds().filter((id) => id !== this.artist);
      if (guessers.length && guessers.every((id) => this.correct.has(id))) this.advance();
      if (this.artist && !this.room.players.get(this.artist)?.connected && this.strokes.length === 0) this.advance();
    }
  }

  /** Word shown as blanks, with letters revealed at 50% and 75% of the time. */
  private hint() {
    if (!this.word) return '';
    const v = this.timer.view();
    const frac = v ? 1 - Math.max(0, (v.deadline - Date.now()) / v.duration) : 0;
    const letters = [...this.word].map((ch, i) => ({ ch, i })).filter((x) => /[a-z]/i.test(x.ch));
    const reveal = new Set<number>();
    if (frac >= 0.5 && letters.length > 3) reveal.add(letters[0].i);
    if (frac >= 0.75 && letters.length > 5) reveal.add(letters[Math.floor(letters.length / 2)].i);
    return [...this.word].map((ch, i) => (/[a-z]/i.test(ch) ? (reveal.has(i) ? ch : '_') : ch)).join('');
  }

  // ---------------- views ----------------
  protected hostData() {
    return {
      artist: this.artist,
      wordLength: this.word.length,
      hint: this.phase === 'draw' ? this.hint() : '',
      word: this.phase === 'reveal' ? this.word : null,
      strokes: this.phase === 'draw' || this.phase === 'reveal' ? this.strokes : [],
      colors: COLORS,
      widths: WIDTHS,
      correct: [...this.correct.entries()].map(([id, pts]) => ({ id, pts })),
      artistPoints: this.phase === 'reveal' ? this.correct.size * DOODLE.artistPerGuess : null,
      feed: this.feed,
      order: this.order,
    };
  }

  protected playerData(pid: string) {
    const isArtist = pid === this.artist;
    return {
      artist: this.artist,
      isArtist,
      choices: isArtist && this.phase === 'choose' ? this.choices : [],
      word: (isArtist && this.phase === 'draw') || this.phase === 'reveal' ? this.word : null,
      hint: this.phase === 'draw' && !isArtist ? this.hint() : '',
      gotIt: this.correct.has(pid),
      myPoints: this.correct.get(pid) ?? 0,
      correctCount: this.correct.size,
      colors: COLORS,
      widths: WIDTHS,
      strokes: isArtist && this.phase === 'draw' ? this.strokes : undefined, // for artist reconnect
    };
  }
}

function sanitizePoints(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length > 400) return [];
  const out: number[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const x = Math.round(Number(raw[i]));
    const y = Math.round(Number(raw[i + 1]));
    if (Number.isFinite(x) && Number.isFinite(y)) out.push(Math.max(0, Math.min(1000, x)), Math.max(0, Math.min(1000, y)));
  }
  return out;
}
