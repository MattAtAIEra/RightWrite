// src/storage/charStatsStore.ts
import { getDB } from "./db";
import type { CharStat, PracticeEvent } from "./types";

export interface ApplyEventInput {
  profileId: string;
  gradeId: string;
  timestamp: number;
  event: PracticeEvent;
}

export async function applyEvent(input: ApplyEventInput): Promise<CharStat> {
  const { profileId, gradeId, timestamp, event } = input;
  const char = event.correctChar;
  const isSuccess = event.type === "found_wrong" && event.isCorrect;

  const db = await getDB();
  const tx = db.transaction("charStats", "readwrite");
  const existing = await tx.store.get([profileId, gradeId, char]);

  const base: CharStat = existing ?? {
    profileId,
    gradeId,
    char,
    lesson: event.lesson || 0,
    lessonTitle: event.lessonTitle || "",
    word: event.word || "",
    attempts: 0,
    mistakes: 0,
    lastSeenAt: timestamp,
    lastMistakeAt: null,
    recentSuccessStreak: 0,
    mistakeRate: 0,
    updatedAt: timestamp,
    syncedAt: null,
  };

  const attempts = base.attempts + 1;
  const mistakes = base.mistakes + (isSuccess ? 0 : 1);
  const recentSuccessStreak = isSuccess ? base.recentSuccessStreak + 1 : 0;
  const lastMistakeAt = isSuccess ? base.lastMistakeAt : timestamp;

  const hasFreshMeta = event.word !== "" && event.lesson > 0;

  const next: CharStat = {
    ...base,
    lesson: hasFreshMeta ? event.lesson : base.lesson,
    lessonTitle: hasFreshMeta ? event.lessonTitle : base.lessonTitle,
    word: hasFreshMeta ? event.word : base.word,
    attempts,
    mistakes,
    lastSeenAt: timestamp,
    lastMistakeAt,
    recentSuccessStreak,
    mistakeRate: mistakes / attempts,
    updatedAt: timestamp,
    syncedAt: null,
  };

  await tx.store.put(next);
  await tx.done;
  return next;
}

export async function getStat(
  profileId: string,
  gradeId: string,
  char: string,
): Promise<CharStat | undefined> {
  const db = await getDB();
  return db.get("charStats", [profileId, gradeId, char]);
}

export async function listByProfile(profileId: string): Promise<CharStat[]> {
  const db = await getDB();
  return db.getAllFromIndex("charStats", "byProfile", profileId);
}

export async function listTopMistakes(profileId: string, n: number): Promise<CharStat[]> {
  const all = await listByProfile(profileId);
  return all
    .filter((s) => s.mistakes > 0)
    .sort((a, b) => b.mistakeRate - a.mistakeRate || b.mistakes - a.mistakes)
    .slice(0, n);
}
