// src/storage/types.ts

export interface Profile {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
  lastActiveAt: number;
  updatedAt: number;
  syncedAt: number | null;
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
