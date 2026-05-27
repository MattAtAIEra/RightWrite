// src/storage/__tests__/charStatsStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { DB_NAME, closeDB } from "../db";
import {
  applyEvent,
  listByProfile,
  listTopMistakes,
  getStat,
} from "../charStatsStore";
import type { PracticeEvent } from "../types";

const PROFILE = "p1";
const GRADE = "4_kangxuan";

function ev(overrides: Partial<PracticeEvent> & { type: PracticeEvent["type"]; correctChar: string }): PracticeEvent {
  return {
    wrongChar: "錯",
    userAnswer: "?",
    isCorrect: overrides.type === "found_wrong" ? true : false,
    lesson: 1,
    lessonTitle: "L1",
    word: "詞語",
    ...overrides,
  } as PracticeEvent;
}

beforeEach(async () => {
  closeDB();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe("charStatsStore.applyEvent", () => {
  it("found_wrong + isCorrect=true → attempts+1, streak+1, mistakes unchanged", async () => {
    await applyEvent({
      profileId: PROFILE,
      gradeId: GRADE,
      timestamp: 1000,
      event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: true }),
    });
    const s = await getStat(PROFILE, GRADE, "縫");
    expect(s).toMatchObject({
      attempts: 1,
      mistakes: 0,
      recentSuccessStreak: 1,
      lastMistakeAt: null,
      mistakeRate: 0,
    });
  });

  it("found_wrong + isCorrect=false → attempts+1, mistakes+1, streak=0", async () => {
    await applyEvent({
      profileId: PROFILE,
      gradeId: GRADE,
      timestamp: 1000,
      event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: false }),
    });
    const s = await getStat(PROFILE, GRADE, "縫");
    expect(s).toMatchObject({
      attempts: 1,
      mistakes: 1,
      recentSuccessStreak: 0,
      lastMistakeAt: 1000,
      mistakeRate: 1,
    });
  });

  it("missed → attempts+1, mistakes+1, streak=0", async () => {
    await applyEvent({
      profileId: PROFILE,
      gradeId: GRADE,
      timestamp: 1000,
      event: ev({ type: "missed", correctChar: "縫" }),
    });
    const s = await getStat(PROFILE, GRADE, "縫");
    expect(s).toMatchObject({ attempts: 1, mistakes: 1, recentSuccessStreak: 0 });
  });

  it("false_alarm locks to correctChar, attempts+1, mistakes+1, streak=0", async () => {
    await applyEvent({
      profileId: PROFILE,
      gradeId: GRADE,
      timestamp: 1000,
      event: ev({ type: "false_alarm", correctChar: "正" }),
    });
    const s = await getStat(PROFILE, GRADE, "正");
    expect(s).toMatchObject({ attempts: 1, mistakes: 1, recentSuccessStreak: 0 });
  });

  it("streak resets after a mistake, climbs again after successes", async () => {
    const e = (correct: boolean) =>
      applyEvent({
        profileId: PROFILE,
        gradeId: GRADE,
        timestamp: Date.now(),
        event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: correct }),
      });
    await e(true);
    await e(true);
    await e(false);
    await e(true);
    const s = await getStat(PROFILE, GRADE, "縫");
    expect(s).toMatchObject({ attempts: 4, mistakes: 1, recentSuccessStreak: 1 });
  });

  it("overwrites lesson/lessonTitle/word with latest values", async () => {
    await applyEvent({
      profileId: PROFILE, gradeId: GRADE, timestamp: 1,
      event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: true, lesson: 1, lessonTitle: "L1", word: "縫補" }),
    });
    await applyEvent({
      profileId: PROFILE, gradeId: GRADE, timestamp: 2,
      event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: true, lesson: 5, lessonTitle: "L5", word: "裁縫" }),
    });
    const s = await getStat(PROFILE, GRADE, "縫");
    expect(s).toMatchObject({ lesson: 5, lessonTitle: "L5", word: "裁縫" });
  });
});

describe("charStatsStore queries", () => {
  it("listByProfile returns only that profile", async () => {
    await applyEvent({ profileId: "p1", gradeId: GRADE, timestamp: 1,
      event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: false }) });
    await applyEvent({ profileId: "p2", gradeId: GRADE, timestamp: 1,
      event: ev({ type: "found_wrong", correctChar: "駿", isCorrect: false }) });
    const list = await listByProfile("p1");
    expect(list.map((s) => s.char)).toEqual(["縫"]);
  });

  it("listTopMistakes returns mistakeRate DESC limited to N", async () => {
    // 縫 1/2 = 0.5
    await applyEvent({ profileId: PROFILE, gradeId: GRADE, timestamp: 1,
      event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: true }) });
    await applyEvent({ profileId: PROFILE, gradeId: GRADE, timestamp: 2,
      event: ev({ type: "found_wrong", correctChar: "縫", isCorrect: false }) });
    // 駿 1/1 = 1.0
    await applyEvent({ profileId: PROFILE, gradeId: GRADE, timestamp: 3,
      event: ev({ type: "missed", correctChar: "駿" }) });
    // 雜 0/1 = 0
    await applyEvent({ profileId: PROFILE, gradeId: GRADE, timestamp: 4,
      event: ev({ type: "found_wrong", correctChar: "雜", isCorrect: true }) });

    const top = await listTopMistakes(PROFILE, 10);
    expect(top.map((s) => s.char)).toEqual(["駿", "縫", "雜"]);
  });
});
