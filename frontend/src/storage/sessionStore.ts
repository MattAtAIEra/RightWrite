// src/storage/sessionStore.ts
import { getDB } from "./db";
import { applyEvent } from "./charStatsStore";
import { putImage } from "./imageStore";
import { isSkippingImages } from "./skipImagesFlag";
import type { Session, PracticeEvent, SessionSummary } from "./types";

export interface RecordSessionInput {
  profileId: string;
  gradeId: string;
  gradeLabel: string;
  startLesson: number;
  endLesson: number;
  mode: "article" | "sentence";
  startedAt: number;
  finishedAt: number;
  events: PracticeEvent[];
}

function summarize(events: PracticeEvent[]): SessionSummary {
  let foundCorrect = 0;
  let foundWrong = 0;
  let missed = 0;
  let falseAlarms = 0;
  for (const e of events) {
    if (e.type === "found_wrong") {
      if (e.isCorrect) foundCorrect++;
      else foundWrong++;
    } else if (e.type === "missed") missed++;
    else if (e.type === "false_alarm") falseAlarms++;
  }
  const totalWrong = foundCorrect + foundWrong + missed;
  const denom = totalWrong + falseAlarms;
  return {
    totalWrong,
    foundCorrect,
    falseAlarms,
    missed,
    accuracy: denom > 0 ? foundCorrect / denom : 0,
  };
}

export async function recordSession(input: RecordSessionInput): Promise<Session> {
  const id = crypto.randomUUID();
  const session: Session = {
    id,
    profileId: input.profileId,
    gradeId: input.gradeId,
    gradeLabel: input.gradeLabel,
    startLesson: input.startLesson,
    endLesson: input.endLesson,
    mode: input.mode,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    events: input.events,
    summary: summarize(input.events),
    updatedAt: Date.now(),
    syncedAt: null,
  };
  const db = await getDB();
  await db.put("sessions", session);

  for (const e of input.events) {
    await applyEvent({
      profileId: input.profileId,
      gradeId: input.gradeId,
      timestamp: input.finishedAt,
      event: e,
    });
    if (e.imageData && !isSkippingImages()) {
      await putImage({
        profileId: input.profileId,
        sessionId: id,
        char: e.correctChar,
        capturedAt: input.finishedAt,
        imageData: e.imageData,
      });
    }
  }

  return session;
}

export async function listByProfile(profileId: string): Promise<Session[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("sessions", "byProfile", profileId);
  return all.sort((a, b) => b.startedAt - a.startedAt);
}

export interface SessionGroup {
  gradeId: string;
  gradeLabel: string;
  startLesson: number;
  endLesson: number;
  sessions: Session[];
}

export async function listByGradeLesson(profileId: string): Promise<SessionGroup[]> {
  const all = await listByProfile(profileId);
  const map = new Map<string, SessionGroup>();
  for (const s of all) {
    const key = `${s.gradeId}|${s.startLesson}|${s.endLesson}`;
    let group = map.get(key);
    if (!group) {
      group = {
        gradeId: s.gradeId,
        gradeLabel: s.gradeLabel,
        startLesson: s.startLesson,
        endLesson: s.endLesson,
        sessions: [],
      };
      map.set(key, group);
    }
    group.sessions.push(s);
  }
  return Array.from(map.values()).sort(
    (a, b) =>
      a.gradeId.localeCompare(b.gradeId) ||
      a.startLesson - b.startLesson,
  );
}
