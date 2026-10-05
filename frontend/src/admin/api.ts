const API_BASE = import.meta.env.VITE_API_URL || "";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.detail === "string") return body.detail;
  } catch {
    /* ignore */
  }
  return fallback;
}

export interface AdminMe {
  email: string;
}

export async function fetchMe(): Promise<AdminMe | null> {
  const res = await fetch(`${API_BASE}/api/admin/me`);
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(await readError(res, "無法確認登入狀態"));
  return res.json();
}

export async function login(email: string, password: string): Promise<AdminMe> {
  const res = await fetch(`${API_BASE}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(await readError(res, "登入失敗"));
  return res.json();
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/admin/logout`, { method: "POST" });
}

// ----- 使用量 -----

export interface UsageDay {
  day: string;
  rw_recognitions: number;
  yz_recognitions: number;
  rw_sessions: number;
  yz_sessions: number;
  quota_hits: number;
  bot_blocked: number;
  session_limit_blocked: number;
}

export interface UsageTopSession {
  sid: string;
  ip: string;
  rw: number;
  yz: number;
  first: string;
}

export interface UsageResponse {
  days: UsageDay[];
  today: UsageDay & { top_sessions: UsageTopSession[] };
  limits: { rw: number; yz: number; sessions_per_ip: number };
  totals: { rw_recognitions: number; yz_recognitions: number; quota_hits: number; bot_blocked: number };
}

export async function fetchUsage(days = 30): Promise<UsageResponse> {
  const res = await fetch(`${API_BASE}/api/admin/usage?days=${days}`);
  if (res.status === 401) throw new Error("請先登入");
  if (!res.ok) throw new Error(await readError(res, "讀取使用量失敗"));
  return res.json();
}

// ----- 生字庫 -----

export interface VocabCharacter {
  char: string;
  similar_wrong: string[];
  examples: string[];
}

export interface VocabLesson {
  lesson_number: number;
  title: string;
  characters: VocabCharacter[];
}

export interface VocabResponse {
  grade_id: string;
  grade: { label: string; grade: string; publisher: string; semester: string; term_label?: string };
  lessons: VocabLesson[];
}

export async function fetchVocab(gradeId: string): Promise<VocabResponse> {
  const res = await fetch(`${API_BASE}/api/admin/vocab?grade_id=${encodeURIComponent(gradeId)}`);
  if (res.status === 401) throw new Error("請先登入");
  if (!res.ok) throw new Error(await readError(res, "讀取生字庫失敗"));
  return res.json();
}
