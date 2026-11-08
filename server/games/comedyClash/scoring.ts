// Pure scoring rules — no I/O, fully unit-tested.
//
// Fairness across player counts: points are based on the SHARE of eligible voters
// who picked your answer, not the raw vote count. With 3 players a matchup has 1
// voter; with 10 players it has 8. Winning 100% of the room is worth the same
// either way.

export const ROUND_POOL = 1000; // × round multiplier (1, 2, 3)
export const SWEEP_BONUS = 250; // × round multiplier, for taking every eligible vote (needs ≥2 voters)
export const FORFEIT_SHARE = 0.5; // opponent didn't answer → half the pool
export const FINAL_POOL = 5000;

export const round10 = (n: number) => Math.round(n / 10) * 10;

export function roundMultiplier(round: number): number {
  return round >= 4 ? 5 : Math.max(1, round);
}

export interface MatchupScore {
  points: [number, number];
  sweep: 0 | 1 | null;
  forfeit: boolean;
}

export function scoreMatchup(
  votes: [number, number],
  eligible: number,
  round: number,
  present: [boolean, boolean],
): MatchupScore {
  const mult = roundMultiplier(round);
  const pool = ROUND_POOL * mult;
  if (!present[0] && !present[1]) return { points: [0, 0], sweep: null, forfeit: false };
  if (present[0] !== present[1]) {
    const pts = round10(pool * FORFEIT_SHARE);
    return { points: present[0] ? [pts, 0] : [0, pts], sweep: null, forfeit: true };
  }
  const E = Math.max(eligible, 1);
  const points: [number, number] = [round10((pool * votes[0]) / E), round10((pool * votes[1]) / E)];
  let sweep: 0 | 1 | null = null;
  if (eligible >= 2) {
    if (votes[0] === eligible && votes[1] === 0) sweep = 0;
    if (votes[1] === eligible && votes[0] === 0) sweep = 1;
  }
  if (sweep !== null) points[sweep] += SWEEP_BONUS * mult;
  return { points, sweep, forfeit: false };
}

/** Final round: everybody answered the same prompt. votes = authorId → vote count. */
export function scoreFinal(votes: Map<string, number>, eligible: number): Map<string, number> {
  const E = Math.max(eligible, 1);
  const out = new Map<string, number>();
  for (const [id, v] of votes) out.set(id, round10((FINAL_POOL * v) / E));
  return out;
}

/** Standard competition ranking: 1,1,3 */
export function rank(scores: { id: string; score: number }[]) {
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  return sorted.map((s) => ({ ...s, rank: sorted.findIndex((x) => x.score === s.score) + 1 }));
}

/**
 * Regular-round pairing. Players are arranged in a circle (shuffled order);
 * prompt i is answered by player i and player i+1. Every player answers exactly
 * two prompts and faces two different opponents (when N ≥ 3).
 */
export function pairPlayers(ids: string[]): [string, string][] {
  const n = ids.length;
  return ids.map((id, i) => [id, ids[(i + 1) % n]] as [string, string]);
}

export function shuffle<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
