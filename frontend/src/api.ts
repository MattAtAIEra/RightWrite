import type { LessonsResponse, ArticleResponse, RecognizeResponse, GradesResponse } from "./types";

const API_BASE = import.meta.env.VITE_API_URL || "";

/** 今日免費額度用完（HTTP 429）或被判定為自動化程式（403）時丟出，訊息直接給畫面顯示 */
export class QuotaError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "QuotaError";
    this.status = status;
  }
}

async function readDetail(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.detail === "string") return body.detail;
  } catch {
    /* ignore */
  }
  return fallback;
}

export async function fetchGrades(): Promise<GradesResponse> {
  const res = await fetch(`${API_BASE}/api/grades`);
  if (!res.ok) throw new Error("Failed to fetch grades");
  return res.json();
}

export async function fetchLessons(gradeId: string = "grade4"): Promise<LessonsResponse> {
  const res = await fetch(`${API_BASE}/api/lessons?grade_id=${gradeId}`);
  if (!res.ok) throw new Error("Failed to fetch lessons");
  return res.json();
}

export async function generateArticle(
  startLesson: number,
  endLesson: number,
  mode: string = "article",
  gradeId: string = "grade4",
  weightedChars?: Record<string, number>,
  /** 最近幾次出過的題目,讓後端避開,同一課連做兩次才不會拿到同一批題目 */
  recent?: { rounds: string[][]; variants: string[] },
): Promise<ArticleResponse> {
  const body: Record<string, unknown> = {
    start_lesson: startLesson,
    end_lesson: endLesson,
    mode,
    grade_id: gradeId,
  };
  if (weightedChars && Object.keys(weightedChars).length > 0) {
    body.weighted_chars = weightedChars;
  }
  if (recent && recent.rounds.length > 0) {
    body.recent_rounds = recent.rounds;
    body.recent_variants = recent.variants;
  }
  const res = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to generate article");
  return res.json();
}

export async function recognizeHandwriting(
  imageData: string,
  expectedChar: string
): Promise<RecognizeResponse> {
  const res = await fetch(`${API_BASE}/api/recognize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_data: imageData, expected_char: expectedChar }),
  });
  if (res.status === 429 || res.status === 403) {
    throw new QuotaError(await readDetail(res, "今日使用已經達到免費額度的上限"), res.status);
  }
  if (!res.ok) throw new Error("Failed to recognize");
  return res.json();
}
