// src/storage/types.ts

/** User-facing practice preferences remembered between visits.
    Stored per device (localStorage) and, when personalization is on,
    per profile (IndexedDB) so each child keeps their own setup. */
export interface Preferences {
  /** 學年度_學期, e.g. "115_1" (115上學期) or "114_2" (114下學期) */
  term: string;
  publisher: string;
  gradeNum: number;
  practiceMode: "sentence" | "article";
  showZhuyin: boolean;
}

export interface Profile {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
  lastActiveAt: number;
  updatedAt: number;
  syncedAt: number | null;
  /** Optional: absent on profiles created before preferences existed */
  prefs?: Partial<Preferences>;
}

export interface PracticeEvent {
  type: "found_wrong" | "false_alarm" | "missed";
  wrongChar: string;
  correctChar: string;
  userAnswer: string;
  isCorrect: boolean;
  lesson: number;
  lessonTitle: string;
  word: string;
  imageData?: string;
}

export interface SessionSummary {
  totalWrong: number;
  foundCorrect: number;
  falseAlarms: number;
  missed: number;
  accuracy: number;
}

export interface Session {
  id: string;
  profileId: string;
  gradeId: string;
  gradeLabel: string;
  startLesson: number;
  endLesson: number;
  mode: "article" | "sentence";
  startedAt: number;
  finishedAt: number;
  events: PracticeEvent[];
  summary: SessionSummary;
  updatedAt: number;
  syncedAt: number | null;
}

export interface CharStat {
  profileId: string;
  gradeId: string;
  char: string;
  lesson: number;
  lessonTitle: string;
  word: string;
  attempts: number;
  mistakes: number;
  lastSeenAt: number;
  lastMistakeAt: number | null;
  recentSuccessStreak: number;
  mistakeRate: number;
  updatedAt: number;
  syncedAt: number | null;
}

export interface HandwritingImage {
  id: string;
  profileId: string;
  sessionId: string;
  char: string;
  capturedAt: number;
  imageData: string;
}

export const AVAILABLE_EMOJIS = ["🐶", "🐱", "🐰", "🐻", "🦊", "🐼", "🐨", "🐯"] as const;
