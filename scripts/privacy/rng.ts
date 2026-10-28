import { randomInt } from "node:crypto";

export type Random = () => number;

// mulberry32: small, fast and reproducible; only used for simulations and test shuffles
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Releases shuffle with the OS generator, so the published row order cannot be replayed
// randomInt allows a range of at most 2^48 - 1
export const cryptoRandom: Random = () => randomInt(0, 2 ** 47) / 2 ** 47;

export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Picks an index with probability proportional to its weight */
export function pickWeighted(weights: readonly number[], random: Random): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0)
      return i;
  }
  return weights.length - 1;
}

/** Picks a key of a { value: weight } table */
export function pickFrom<K extends string | number>(table: Partial<Record<K, number>>, random: Random): K {
  const entries = Object.entries(table) as [string, number][];
  const index = pickWeighted(entries.map(([, w]) => w), random);
  const key = entries[index][0];
  return (Number.isNaN(Number(key)) ? key : Number(key)) as K;
}

export function chance(p: number, random: Random): boolean {
  return random() < p;
}
