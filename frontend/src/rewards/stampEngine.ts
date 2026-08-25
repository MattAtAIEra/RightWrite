// src/rewards/stampEngine.ts
// Pure stamp-awarding rules. No IO — callers load sessions/stamps and persist
// the returned stamps, so every rule is unit-testable with plain objects.

import type { Session } from "../storage/types";
import type { Stamp, StampType } from "./types";
import { dayKey, daysAgoKey, weekKey } from "./weekKey";

export interface EvaluateInput {
  profileId: string;
  /** The just-finished session (must also be present in allSessions) */
  session: Session;
  /** Every session of this profile, any order */
  allSessions: Session[];
  existingStamps: Stamp[];
  weeklySessionGoal: number;
}

export type NewStamp = Pick<Stamp, "profileId" | "type" | "scopeKey" | "sessionId" | "earnedAt">;

function has(existing: Stamp[], fresh: NewStamp[], type: StampType, scopeKey: string): boolean {
  return (
    existing.some((s) => s.type === type && s.scopeKey === scopeKey) ||
    fresh.some((s) => s.type === type && s.scopeKey === scopeKey)
  );
}

/** 累計訂正字數:每次練習的錯字題數(找對＋找錯＋漏找) */
function charsOf(s: Session): number {
  return s.summary.totalWrong;
}

export function evaluateStamps(input: EvaluateInput): NewStamp[] {
  const { profileId, session, allSessions, existingStamps, weeklySessionGoal } = input;
  const out: NewStamp[] = [];
  const now = session.finishedAt;
  const add = (type: StampType, scopeKey: string, sessionId: string | null = session.id) => {
    if (!has(existingStamps, out, type, scopeKey)) {
      out.push({ profileId, type, scopeKey, sessionId, earnedAt: now });
    }
  };

  // 首練印
  if (allSessions.length === 1) add("first_session", "first");

  // 滿分印:全對且題目數 > 0(空練習不算)
  if (session.summary.totalWrong > 0 && session.summary.accuracy === 1) {
    add("perfect", session.id);
  }

  // 週達印:本週(session 所在週)練習次數達標
  const wk = weekKey(session.startedAt);
  const weekCount = allSessions.filter((s) => weekKey(s.startedAt) === wk).length;
  if (weeklySessionGoal > 0 && weekCount >= weeklySessionGoal) {
    add("weekly_goal", wk, null);
  }

  // 連三印:今天、昨天、前天都有練習。scopeKey 取「第三天」的日期,
  // 因此連續第 4、5 天各自再形成一組新的三連(4-3-2、5-4-3)可再蓋章。
  const days = new Set(allSessions.map((s) => dayKey(s.startedAt)));
  const today = dayKey(session.startedAt);
  if (days.has(daysAgoKey(session.startedAt, 1)) && days.has(daysAgoKey(session.startedAt, 2))) {
    add("streak3", today, null);
  }

  // 百字印:累計訂正字數每滿 100 蓋一枚(一次補齊落後的里程碑)
  const totalChars = allSessions.reduce((sum, s) => sum + charsOf(s), 0);
  for (let milestone = 100; milestone <= totalChars; milestone += 100) {
    add("chars100", String(milestone), null);
  }

  return out;
}
