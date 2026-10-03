// src/personalization/weights.ts
import type { CharStat } from "../storage/types";

export function buildWeightedChars(stats: CharStat[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const s of stats) {
    if (s.attempts === 0) continue;
    if (s.mistakeRate === 0 && s.recentSuccessStreak >= 2) continue;
    const boost = 1 + s.mistakeRate * 3;
    const decay = Math.pow(0.5, s.recentSuccessStreak);
    result[s.char] = Math.max(1, boost * decay);
  }
  return result;
}
