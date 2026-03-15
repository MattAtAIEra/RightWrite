import type { LessonsResponse, ArticleResponse, RecognizeResponse } from "./types";

const API_BASE = import.meta.env.VITE_API_URL || "";

export async function fetchLessons(): Promise<LessonsResponse> {
  const res = await fetch(`${API_BASE}/api/lessons`);
  if (!res.ok) throw new Error("Failed to fetch lessons");
  return res.json();
}

export async function generateArticle(
  startLesson: number,
  endLesson: number
): Promise<ArticleResponse> {
  const res = await fetch(`${API_BASE}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start_lesson: startLesson, end_lesson: endLesson }),
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
  if (!res.ok) throw new Error("Failed to recognize");
  return res.json();
}
