import type {
  AdminGame,
  AdminGamesResponse,
  CreateGameResponse,
  GameInfo,
  IdiomEntry,
  IdiomsResponse,
  JoinResponse,
  YzqjMeta,
} from "./types";

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

export async function createGame(): Promise<CreateGameResponse> {
  const res = await fetch(`${API_BASE}/api/yzqj/games`, { method: "POST" });
  if (!res.ok) throw new Error(await readError(res, "建立賽局失敗"));
  return res.json();
}

export async function fetchGameInfo(code: string): Promise<GameInfo> {
  const res = await fetch(`${API_BASE}/api/yzqj/games/${encodeURIComponent(code)}`);
  if (!res.ok) throw new Error(await readError(res, "找不到這個賽局"));
  return res.json();
}

export async function joinGame(code: string, nickname: string): Promise<JoinResponse> {
  const res = await fetch(`${API_BASE}/api/yzqj/games/${encodeURIComponent(code)}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
  if (!res.ok) throw new Error(await readError(res, "加入失敗"));
  return res.json();
}

export function socketUrl(code: string, params: Record<string, string>): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const query = new URLSearchParams(params).toString();
  return `${proto}://${window.location.host}/ws/yzqj/${encodeURIComponent(code)}?${query}`;
}

// ----- 後台 -----

export async function fetchAdminStatus(): Promise<{ auth_required: boolean }> {
  const res = await fetch(`${API_BASE}/api/yzqj/admin/status`);
  if (!res.ok) throw new Error("無法連到後台");
  return res.json();
}

export async function fetchAdminGames(token: string): Promise<AdminGamesResponse> {
  const res = await fetch(`${API_BASE}/api/yzqj/admin/games?limit=200`, {
    headers: token ? { "X-Admin-Token": token } : {},
  });
  if (res.status === 401) throw new Error("後台密碼錯誤");
  if (!res.ok) throw new Error(await readError(res, "讀取失敗"));
  return res.json();
}

export async function fetchAdminGame(token: string, code: string): Promise<AdminGame> {
  const res = await fetch(`${API_BASE}/api/yzqj/admin/games/${encodeURIComponent(code)}`, {
    headers: token ? { "X-Admin-Token": token } : {},
  });
  if (!res.ok) throw new Error(await readError(res, "讀取失敗"));
  return res.json();
}

// ----- 一般資訊 -----

export async function fetchMeta(): Promise<YzqjMeta> {
  const res = await fetch(`${API_BASE}/api/yzqj/meta`);
  if (!res.ok) throw new Error("無法讀取設定");
  return res.json();
}

// ----- 成語題庫 -----

export async function fetchIdioms(): Promise<IdiomsResponse> {
  const res = await fetch(`${API_BASE}/api/yzqj/idioms`);
  if (!res.ok) throw new Error(await readError(res, "讀取成語題庫失敗"));
  return res.json();
}

export async function addIdiom(
  token: string,
  body: { idiom: string; wrong: { pos: number; char: string }[]; meaning: string }
): Promise<IdiomEntry> {
  const res = await fetch(`${API_BASE}/api/yzqj/idioms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "X-Admin-Token": token } : {}) },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new Error("後台密碼錯誤");
  if (!res.ok) throw new Error(await readError(res, "新增失敗"));
  return res.json();
}

export async function deleteIdiom(token: string, idiom: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/yzqj/idioms/${encodeURIComponent(idiom)}`, {
    method: "DELETE",
    headers: token ? { "X-Admin-Token": token } : {},
  });
  if (res.status === 401) throw new Error("後台密碼錯誤");
  if (!res.ok && res.status !== 204) throw new Error(await readError(res, "刪除失敗"));
}
