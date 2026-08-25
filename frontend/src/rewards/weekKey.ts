// src/rewards/weekKey.ts
// ISO-week helpers in the device's local timezone (practice happens on the
// family iPad, so "本週" should follow the wall clock, Monday-start).

/** "YYYY-MM-DD" in local time */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** ISO week key like "2026-W35" (local time, Monday-start) */
export function weekKey(ts: number): string {
  const d = new Date(ts);
  // Shift to the Thursday of this week — ISO weeks belong to the year of
  // their Thursday.
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (target.getDay() + 6) % 7; // Mon=0 … Sun=6
  target.setDate(target.getDate() - dow + 3);
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  const firstDow = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstDow + 3);
  const week =
    1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${target.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** ts for N days before the given ts, same wall-clock day boundary semantics */
export function daysAgoKey(ts: number, n: number): string {
  const d = new Date(ts);
  d.setDate(d.getDate() - n);
  return dayKey(d.getTime());
}
