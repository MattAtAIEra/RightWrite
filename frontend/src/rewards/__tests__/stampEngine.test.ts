// src/rewards/__tests__/stampEngine.test.ts
import { describe, it, expect } from "vitest";
import { evaluateStamps, type NewStamp } from "../stampEngine";
import { dayKey, weekKey } from "../weekKey";
import type { Session } from "../../storage/types";
import type { Stamp } from "../types";

const PROFILE = "p1";

let seq = 0;
function mkSession(overrides: Partial<Session> & { startedAt: number }): Session {
  seq += 1;
  const accuracy = overrides.summary?.accuracy ?? 0.5;
  const totalWrong = overrides.summary?.totalWrong ?? 6;
  return {
    id: overrides.id ?? `s${seq}`,
    profileId: PROFILE,
    gradeId: "4_kangxuan",
    gradeLabel: "四下康軒",
    startLesson: 1,
    endLesson: 6,
    mode: "article",
    finishedAt: overrides.startedAt + 5 * 60_000,
    events: [],
    updatedAt: overrides.startedAt,
    syncedAt: null,
    ...overrides,
    summary: {
      totalWrong,
      foundCorrect: Math.round(totalWrong * accuracy),
      falseAlarms: 0,
      missed: 0,
      accuracy,
      ...overrides.summary,
    },
  };
}

function toStamp(n: NewStamp): Stamp {
  return { ...n, id: crypto.randomUUID(), redeemedRewardId: null, updatedAt: n.earnedAt, syncedAt: null };
}

const T0 = new Date(2026, 7, 25, 18, 0, 0).getTime(); // 2026-08-25 (Tue) local

function run(session: Session, all: Session[], existing: Stamp[] = [], goal = 3) {
  return evaluateStamps({
    profileId: PROFILE,
    session,
    allSessions: all,
    existingStamps: existing,
    weeklySessionGoal: goal,
  });
}

describe("stampEngine", () => {
  it("first session earns 首練印", () => {
    const s = mkSession({ startedAt: T0 });
    const out = run(s, [s]);
    expect(out.some((x) => x.type === "first_session")).toBe(true);
  });

  it("non-first session does not earn 首練印", () => {
    const s1 = mkSession({ startedAt: T0 - 86_400_000 * 30 });
    const s2 = mkSession({ startedAt: T0 });
    const out = run(s2, [s1, s2]);
    expect(out.some((x) => x.type === "first_session")).toBe(false);
  });

  it("perfect session earns 滿分印, scoped per session", () => {
    const s = mkSession({ startedAt: T0, summary: { accuracy: 1, totalWrong: 5 } as Session["summary"] });
    const out = run(s, [s]);
    const perfect = out.find((x) => x.type === "perfect");
    expect(perfect?.scopeKey).toBe(s.id);
  });

  it("empty perfect session (0 chars) earns nothing for perfect", () => {
    const s = mkSession({ startedAt: T0, summary: { accuracy: 1, totalWrong: 0 } as Session["summary"] });
    expect(run(s, [s]).some((x) => x.type === "perfect")).toBe(false);
  });

  it("weekly goal met earns 週達印 once per week", () => {
    // T0 is Tuesday; Mon/Tue/Tue-evening keep all three inside the same ISO week
    const week = [0, 6, 24].map((h) => mkSession({ startedAt: T0 - h * 3_600_000 }));
    const out = run(week[0], week, [], 3);
    const wg = out.filter((x) => x.type === "weekly_goal");
    expect(wg).toHaveLength(1);
    expect(wg[0].scopeKey).toBe(weekKey(T0));
    // Re-running with the stamp persisted must not duplicate
    const again = run(week[0], week, wg.map(toStamp), 3);
    expect(again.some((x) => x.type === "weekly_goal")).toBe(false);
  });

  it("below weekly goal earns no 週達印", () => {
    const s = mkSession({ startedAt: T0 });
    expect(run(s, [s], [], 3).some((x) => x.type === "weekly_goal")).toBe(false);
  });

  it("three consecutive days earn 連三印 scoped to day 3", () => {
    const days = [2, 1, 0].map((d) => mkSession({ startedAt: T0 - d * 86_400_000 }));
    const out = run(days[2], days, [], 99);
    const streak = out.find((x) => x.type === "streak3");
    expect(streak?.scopeKey).toBe(dayKey(T0));
  });

  it("gap breaks the streak", () => {
    const a = mkSession({ startedAt: T0 - 2 * 86_400_000 });
    const b = mkSession({ startedAt: T0 }); // missed yesterday
    expect(run(b, [a, b], [], 99).some((x) => x.type === "streak3")).toBe(false);
  });

  it("chars100 catches up milestones and dedupes", () => {
    const sessions = Array.from({ length: 5 }, (_, i) =>
      mkSession({ startedAt: T0 - (5 - i) * 3_600_000, summary: { totalWrong: 50, accuracy: 0.5 } as Session["summary"] }),
    );
    // 250 chars total → milestones 100, 200
    const out = run(sessions[4], sessions, [], 99);
    const marks = out.filter((x) => x.type === "chars100").map((x) => x.scopeKey).sort();
    expect(marks).toEqual(["100", "200"]);
    const again = run(sessions[4], sessions, out.map(toStamp), 99);
    expect(again.some((x) => x.type === "chars100")).toBe(false);
  });
});

describe("weekKey", () => {
  it("formats ISO week with Monday start", () => {
    expect(weekKey(new Date(2026, 7, 25).getTime())).toBe("2026-W35"); // Tue
    expect(weekKey(new Date(2026, 7, 24).getTime())).toBe("2026-W35"); // Mon (week start)
    expect(weekKey(new Date(2026, 7, 23).getTime())).toBe("2026-W34"); // Sun (previous week)
  });

  it("dayKey is zero-padded local date", () => {
    expect(dayKey(new Date(2026, 0, 5).getTime())).toBe("2026-01-05");
  });
});
