// src/dashboard/derive.ts
import type { Session } from "../storage/types";

export interface OverallStats {
  sessionCount: number;
  totalFoundCorrect: number;
  consecutiveDays: number;
  avgAccuracy: number;
}

export interface TrendPoint {
  startedAt: number;
  accuracy: number; // 0-100 (percent)
}

export interface LessonGroup {
  gradeId: string;
  gradeLabel: string;
  startLesson: number;
  endLesson: number;
  sessionCount: number;
  avgAccuracy: number;
  lastPracticedAt: number;
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function countConsecutiveDays(timestamps: number[]): number {
  if (timestamps.length === 0) return 0;
  const days = new Set(timestamps.map(startOfLocalDay));
  const today = startOfLocalDay(Date.now());
  if (!days.has(today)) return 0;
  let count = 0;
  let cursor = today;
  const DAY = 86400_000;
  while (days.has(cursor)) {
    count++;
    cursor -= DAY;
  }
  return count;
}

export function deriveOverallStats(sessions: Session[]): OverallStats {
  if (sessions.length === 0) {
    return { sessionCount: 0, totalFoundCorrect: 0, consecutiveDays: 0, avgAccuracy: 0 };
  }
  let totalFoundCorrect = 0;
  let accSum = 0;
  for (const s of sessions) {
    totalFoundCorrect += s.summary.foundCorrect;
    accSum += s.summary.accuracy;
  }
  return {
    sessionCount: sessions.length,
    totalFoundCorrect,
    consecutiveDays: countConsecutiveDays(sessions.map((s) => s.startedAt)),
    avgAccuracy: accSum / sessions.length,
  };
}

export function deriveTrendPoints(sessions: Session[]): TrendPoint[] {
  return [...sessions]
    .sort((a, b) => a.startedAt - b.startedAt)
    .map((s) => ({ startedAt: s.startedAt, accuracy: Math.round(s.summary.accuracy * 100) }));
}

export function deriveLessonGroups(sessions: Session[]): LessonGroup[] {
  const map = new Map<string, LessonGroup>();
  for (const s of sessions) {
    const key = `${s.gradeId}|${s.startLesson}|${s.endLesson}`;
    let g = map.get(key);
    if (!g) {
      g = {
        gradeId: s.gradeId,
        gradeLabel: s.gradeLabel,
        startLesson: s.startLesson,
        endLesson: s.endLesson,
        sessionCount: 0,
        avgAccuracy: 0,
        lastPracticedAt: 0,
      };
      map.set(key, g);
    }
    const prevTotal = g.avgAccuracy * g.sessionCount;
    g.sessionCount += 1;
    g.avgAccuracy = (prevTotal + s.summary.accuracy) / g.sessionCount;
    if (s.startedAt > g.lastPracticedAt) g.lastPracticedAt = s.startedAt;
  }
  return Array.from(map.values()).sort((a, b) => a.startLesson - b.startLesson);
}
