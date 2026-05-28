// src/dashboard/__tests__/derive.test.ts
import { describe, it, expect } from "vitest";
import {
  deriveOverallStats,
  deriveTrendPoints,
  deriveLessonGroups,
  countConsecutiveDays,
} from "../derive";
import type { Session } from "../../storage/types";

function session(o: Partial<Session> & { id: string; startedAt: number }): Session {
  return {
    profileId: "p",
    gradeId: "g",
    gradeLabel: "GLabel",
    startLesson: 1,
    endLesson: 3,
    mode: "article",
    finishedAt: o.startedAt + 1000,
    events: [],
    summary: { totalWrong: 5, foundCorrect: 4, falseAlarms: 1, missed: 0, accuracy: 0.66 },
    updatedAt: o.startedAt,
    syncedAt: null,
    ...o,
  };
}

describe("deriveOverallStats", () => {
  it("returns zeros for empty list", () => {
    expect(deriveOverallStats([])).toEqual({
      sessionCount: 0,
      totalFoundCorrect: 0,
      consecutiveDays: 0,
      avgAccuracy: 0,
    });
  });

  it("sums foundCorrect and averages accuracy", () => {
    const s = [
      session({ id: "1", startedAt: 1000, summary: { totalWrong: 5, foundCorrect: 4, falseAlarms: 0, missed: 1, accuracy: 0.8 } }),
      session({ id: "2", startedAt: 2000, summary: { totalWrong: 5, foundCorrect: 3, falseAlarms: 0, missed: 2, accuracy: 0.6 } }),
    ];
    const r = deriveOverallStats(s);
    expect(r.sessionCount).toBe(2);
    expect(r.totalFoundCorrect).toBe(7);
    expect(r.avgAccuracy).toBeCloseTo(0.7, 5);
  });
});

describe("countConsecutiveDays", () => {
  it("returns 0 for empty", () => {
    expect(countConsecutiveDays([])).toBe(0);
  });

  it("returns 1 when most recent is today", () => {
    const now = Date.now();
    expect(countConsecutiveDays([now])).toBe(1);
  });

  it("returns N for N consecutive days ending today", () => {
    const day = 86400_000;
    const now = Date.now();
    const ts = [now, now - day, now - 2 * day];
    expect(countConsecutiveDays(ts)).toBe(3);
  });

  it("breaks streak on gap", () => {
    const day = 86400_000;
    const now = Date.now();
    const ts = [now, now - day, now - 3 * day]; // gap of 2 days
    expect(countConsecutiveDays(ts)).toBe(2);
  });
});

describe("deriveTrendPoints", () => {
  it("returns one point per session in startedAt order", () => {
    const s = [
      session({ id: "2", startedAt: 2000, summary: { totalWrong: 5, foundCorrect: 3, falseAlarms: 0, missed: 2, accuracy: 0.6 } }),
      session({ id: "1", startedAt: 1000, summary: { totalWrong: 5, foundCorrect: 5, falseAlarms: 0, missed: 0, accuracy: 1.0 } }),
    ];
    const points = deriveTrendPoints(s);
    expect(points).toEqual([
      { startedAt: 1000, accuracy: 100 },
      { startedAt: 2000, accuracy: 60 },
    ]);
  });
});

describe("deriveLessonGroups", () => {
  it("groups sessions by gradeId/startLesson/endLesson", () => {
    const s = [
      session({ id: "1", startedAt: 1000, startLesson: 1, endLesson: 3, summary: { totalWrong: 5, foundCorrect: 4, falseAlarms: 0, missed: 1, accuracy: 0.8 } }),
      session({ id: "2", startedAt: 2000, startLesson: 1, endLesson: 3, summary: { totalWrong: 5, foundCorrect: 5, falseAlarms: 0, missed: 0, accuracy: 1.0 } }),
      session({ id: "3", startedAt: 3000, startLesson: 4, endLesson: 6, summary: { totalWrong: 5, foundCorrect: 3, falseAlarms: 0, missed: 2, accuracy: 0.6 } }),
    ];
    const groups = deriveLessonGroups(s);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      gradeId: "g",
      gradeLabel: "GLabel",
      startLesson: 1,
      endLesson: 3,
      sessionCount: 2,
      avgAccuracy: 0.9,
    });
    expect(groups[1].sessionCount).toBe(1);
  });
});
