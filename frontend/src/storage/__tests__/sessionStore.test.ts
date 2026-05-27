// src/storage/__tests__/sessionStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { DB_NAME, closeDB } from "../db";
import { recordSession, listByProfile, listByGradeLesson } from "../sessionStore";
import { getStat } from "../charStatsStore";
import { listByProfile as listImagesByProfile } from "../imageStore";
import type { PracticeEvent } from "../types";

beforeEach(async () => {
  closeDB();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

const baseSession = {
  profileId: "p1",
  gradeId: "4_kangxuan",
  gradeLabel: "四下 康軒版",
  startLesson: 1,
  endLesson: 3,
  mode: "article" as const,
  startedAt: 1000,
  finishedAt: 2000,
};

function ev(overrides: Partial<PracticeEvent> & { type: PracticeEvent["type"]; correctChar: string }): PracticeEvent {
  return {
    wrongChar: "錯",
    userAnswer: "?",
    isCorrect: false,
    lesson: 1,
    lessonTitle: "L1",
    word: "詞語",
    ...overrides,
  } as PracticeEvent;
}

describe("recordSession", () => {
  it("persists session, updates charStats, persists images", async () => {
    const events: PracticeEvent[] = [
      ev({ type: "found_wrong", correctChar: "縫", isCorrect: true, imageData: "data:img1" }),
      ev({ type: "found_wrong", correctChar: "駿", isCorrect: false, imageData: "data:img2" }),
      ev({ type: "missed", correctChar: "雜" }),
      ev({ type: "false_alarm", correctChar: "正", imageData: "data:img3" }),
    ];

    const session = await recordSession({ ...baseSession, events });

    // Session is stored
    const sessions = await listByProfile("p1");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe(session.id);
    expect(sessions[0].summary).toEqual({
      totalWrong: 3,                   // found_wrong*2 + missed*1
      foundCorrect: 1,
      falseAlarms: 1,
      missed: 1,
      accuracy: 1 / (3 + 1),           // 0.25
    });

    // charStats updated for all 4 chars
    expect((await getStat("p1", "4_kangxuan", "縫"))!.attempts).toBe(1);
    expect((await getStat("p1", "4_kangxuan", "駿"))!.mistakes).toBe(1);
    expect((await getStat("p1", "4_kangxuan", "雜"))!.mistakes).toBe(1);
    expect((await getStat("p1", "4_kangxuan", "正"))!.mistakes).toBe(1);

    // 3 images persisted (no image for `missed`)
    const images = await listImagesByProfile("p1");
    expect(images).toHaveLength(3);
    expect(images.map((i) => i.char).sort()).toEqual(["正", "縫", "駿"]);
  });

  it("listByGradeLesson groups sessions by (grade, startLesson)", async () => {
    await recordSession({ ...baseSession, startLesson: 1, endLesson: 3, events: [] });
    await recordSession({ ...baseSession, startLesson: 1, endLesson: 3, events: [] });
    await recordSession({ ...baseSession, startLesson: 4, endLesson: 6, events: [] });
    const groups = await listByGradeLesson("p1");
    expect(groups).toEqual([
      { gradeId: "4_kangxuan", gradeLabel: "四下 康軒版", startLesson: 1, endLesson: 3, sessions: expect.any(Array) },
      { gradeId: "4_kangxuan", gradeLabel: "四下 康軒版", startLesson: 4, endLesson: 6, sessions: expect.any(Array) },
    ]);
    expect(groups[0].sessions).toHaveLength(2);
    expect(groups[1].sessions).toHaveLength(1);
  });
});
