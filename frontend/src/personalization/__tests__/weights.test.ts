// src/personalization/__tests__/weights.test.ts
import { describe, it, expect } from "vitest";
import { buildWeightedChars } from "../weights";
import type { CharStat } from "../../storage/types";

function stat(overrides: Partial<CharStat> & { char: string }): CharStat {
  const defaults: CharStat = {
    profileId: "p",
    gradeId: "g",
    char: "",
    lesson: 1,
    lessonTitle: "L1",
    word: "x",
    attempts: 0,
    mistakes: 0,
    lastSeenAt: 0,
    lastMistakeAt: null,
    recentSuccessStreak: 0,
    mistakeRate: 0,
    updatedAt: 0,
    syncedAt: null,
  };
  return { ...defaults, ...overrides };
}

describe("buildWeightedChars", () => {
  it("excludes never-practiced (attempts=0) chars", () => {
    const result = buildWeightedChars([stat({ char: "a", attempts: 0 })]);
    expect(result).toEqual({});
  });

  it("excludes practiced + perfect + streak >= 2", () => {
    const result = buildWeightedChars([
      stat({ char: "a", attempts: 3, mistakes: 0, mistakeRate: 0, recentSuccessStreak: 2 }),
    ]);
    expect(result).toEqual({});
  });

  it("includes chars with mistakes", () => {
    const result = buildWeightedChars([
      stat({ char: "a", attempts: 2, mistakes: 1, mistakeRate: 0.5, recentSuccessStreak: 0 }),
    ]);
    expect(result["a"]).toBeCloseTo(2.5, 5);  // 1 + 0.5*3 = 2.5; decay 0.5^0 = 1
  });

  it("decays weight by recentSuccessStreak", () => {
    const result = buildWeightedChars([
      stat({ char: "a", attempts: 4, mistakes: 2, mistakeRate: 0.5, recentSuccessStreak: 2 }),
    ]);
    // boost = 1 + 0.5*3 = 2.5; decay = 0.5^2 = 0.25; product = 0.625 → floored to 1
    expect(result["a"]).toBe(1);
  });

  it("all wrong with streak 0 gets weight 4", () => {
    const result = buildWeightedChars([
      stat({ char: "a", attempts: 3, mistakes: 3, mistakeRate: 1, recentSuccessStreak: 0 }),
    ]);
    expect(result["a"]).toBeCloseTo(4, 5);
  });

  it("never returns below 1", () => {
    const result = buildWeightedChars([
      stat({ char: "a", attempts: 10, mistakes: 1, mistakeRate: 0.1, recentSuccessStreak: 5 }),
    ]);
    // boost 1.3, decay 0.03125, product 0.040625 → floored to 1
    expect(result["a"]).toBe(1);
  });
});
