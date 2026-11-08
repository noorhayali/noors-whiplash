import { describe, expect, it } from 'vitest';
import { pairPlayers, rank, scoreFinal, scoreMatchup } from '../server/games/comedyClash/scoring';
import { PROMPTS, CATEGORY_NAMES, deckFor } from '../server/games/comedyClash/prompts';

describe('scoreMatchup', () => {
  it('splits the pool by vote share and scales with the round', () => {
    expect(scoreMatchup([3, 1], 4, 1, [true, true]).points).toEqual([750, 250]);
    expect(scoreMatchup([3, 1], 4, 2, [true, true]).points).toEqual([1500, 500]);
    expect(scoreMatchup([3, 1], 4, 3, [true, true]).points).toEqual([2250, 750]);
  });

  it('is fair across player counts: 100% of the room is worth the same', () => {
    const small = scoreMatchup([1, 0], 1, 1, [true, true]).points[0]; // 3 players → 1 voter, no sweep bonus
    const big = scoreMatchup([8, 0], 8, 1, [true, true]).points[0] - 250; // 10 players, minus sweep bonus
    expect(small).toBe(1000);
    expect(big).toBe(1000);
  });

  it('awards a sweep bonus only with 2+ voters and a unanimous result', () => {
    expect(scoreMatchup([4, 0], 4, 2, [true, true])).toMatchObject({ sweep: 0, points: [2500, 0] });
    expect(scoreMatchup([1, 0], 1, 1, [true, true]).sweep).toBeNull();
    expect(scoreMatchup([3, 0], 4, 1, [true, true]).sweep).toBeNull(); // someone abstained
  });

  it('handles ties', () => {
    expect(scoreMatchup([2, 2], 4, 1, [true, true]).points).toEqual([500, 500]);
    expect(scoreMatchup([0, 0], 4, 1, [true, true]).points).toEqual([0, 0]);
  });

  it('handles missing answers (forfeit) and nobody answering', () => {
    expect(scoreMatchup([0, 0], 3, 2, [true, false])).toMatchObject({ forfeit: true, points: [1000, 0] });
    expect(scoreMatchup([0, 0], 3, 2, [false, true])).toMatchObject({ forfeit: true, points: [0, 1000] });
    expect(scoreMatchup([0, 0], 3, 2, [false, false]).points).toEqual([0, 0]);
  });

  it('does not divide by zero when nobody can vote', () => {
    expect(scoreMatchup([0, 0], 0, 1, [true, true]).points).toEqual([0, 0]);
  });
});

describe('scoreFinal', () => {
  it('splits the final pool by vote share', () => {
    const out = scoreFinal(new Map([['a', 2], ['b', 1], ['c', 1]]), 4);
    expect(Object.fromEntries(out)).toEqual({ a: 2500, b: 1250, c: 1250 });
  });
});

describe('rank', () => {
  it('uses competition ranking for ties', () => {
    const r = rank([{ id: 'a', score: 10 }, { id: 'b', score: 30 }, { id: 'c', score: 30 }]);
    expect(r.map((x) => [x.id, x.rank])).toEqual([['b', 1], ['c', 1], ['a', 3]]);
  });
});

describe('pairPlayers', () => {
  for (let n = 3; n <= 10; n++) {
    it(`gives every player exactly 2 prompts with 2 different opponents (n=${n})`, () => {
      const ids = Array.from({ length: n }, (_, i) => `p${i}`);
      const pairs = pairPlayers(ids);
      expect(pairs).toHaveLength(n);
      for (const id of ids) {
        const mine = pairs.filter((p) => p.includes(id));
        expect(mine).toHaveLength(2);
        const opps = mine.map((p) => p.find((x) => x !== id));
        expect(new Set(opps).size).toBe(2);
      }
      for (const [a, b] of pairs) expect(a).not.toBe(b);
    });
  }
});

describe('prompt database', () => {
  it('has 150+ unique regular prompts across 7 categories, plus final prompts', () => {
    expect(PROMPTS.regular.length).toBeGreaterThanOrEqual(150);
    expect(CATEGORY_NAMES.length).toBeGreaterThanOrEqual(7);
    expect(new Set(PROMPTS.regular.map((p) => p.id)).size).toBe(PROMPTS.regular.length);
    expect(new Set(PROMPTS.regular.map((p) => p.text.toLowerCase())).size).toBe(PROMPTS.regular.length);
    expect(PROMPTS.final.length).toBeGreaterThanOrEqual(10);
  });

  it('has a family deck big enough for replays and keeps spicy prompts out of it', () => {
    const fam = deckFor(PROMPTS.regular, false);
    expect(fam.length).toBeGreaterThanOrEqual(50);
    expect(fam.every((p) => p.deck === 'family')).toBe(true);
    expect(deckFor(PROMPTS.final, false).length).toBeGreaterThanOrEqual(8);
    expect(PROMPTS.regular.filter((p) => p.deck === 'spicy').length).toBeGreaterThanOrEqual(100);
  });
});
