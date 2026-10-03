// src/storage/prefsStore.ts
// Device-level preferences (localStorage). Profile-level preferences live on
// the Profile record (see profileStore.updateProfile) and override these.
import type { Preferences } from "./types";

export const PREFS_KEY = "rightwrite:prefs";

export const DEFAULT_TERM = "115_1";

export const DEFAULT_PREFS: Preferences = {
  term: DEFAULT_TERM,
  publisher: "康軒版",
  gradeNum: 4,
  practiceMode: "sentence",
  showZhuyin: false,
};

const VALID_MODES = new Set(["sentence", "article"]);

/** Keep only well-typed fields so a corrupted/old blob can't poison state. */
export function sanitizePrefs(raw: unknown): Partial<Preferences> {
  if (!raw || typeof raw !== "object") return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<Preferences> = {};
  if (typeof r.term === "string" && /^\d{3}_[12]$/.test(r.term)) out.term = r.term;
  if (typeof r.publisher === "string" && r.publisher) out.publisher = r.publisher;
  if (typeof r.gradeNum === "number" && r.gradeNum >= 1 && r.gradeNum <= 6) out.gradeNum = r.gradeNum;
  if (typeof r.practiceMode === "string" && VALID_MODES.has(r.practiceMode)) {
    out.practiceMode = r.practiceMode as Preferences["practiceMode"];
  }
  if (typeof r.showZhuyin === "boolean") out.showZhuyin = r.showZhuyin;
  return out;
}

export function loadDevicePrefs(): Partial<Preferences> {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    return sanitizePrefs(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function saveDevicePrefs(patch: Partial<Preferences>): Partial<Preferences> {
  const next = { ...loadDevicePrefs(), ...sanitizePrefs(patch) };
  localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  return next;
}

/** Resolve effective prefs: defaults ← device ← profile (most specific wins). */
export function resolvePrefs(
  device: Partial<Preferences>,
  profile?: Partial<Preferences> | null,
): Preferences {
  return { ...DEFAULT_PREFS, ...sanitizePrefs(device), ...sanitizePrefs(profile ?? {}) };
}
