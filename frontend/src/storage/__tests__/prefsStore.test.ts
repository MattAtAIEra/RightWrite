// src/storage/__tests__/prefsStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  PREFS_KEY,
  DEFAULT_PREFS,
  loadDevicePrefs,
  saveDevicePrefs,
  resolvePrefs,
  sanitizePrefs,
} from "../prefsStore";

beforeEach(() => {
  localStorage.clear();
});

describe("prefsStore", () => {
  it("defaults to 115上學期 / 康軒版 / 四年級 / 句子改錯 / 注音關閉", () => {
    expect(DEFAULT_PREFS.term).toBe("115_1");
    expect(DEFAULT_PREFS.publisher).toBe("康軒版");
    expect(DEFAULT_PREFS.gradeNum).toBe(4);
    expect(DEFAULT_PREFS.practiceMode).toBe("sentence");
    expect(DEFAULT_PREFS.showZhuyin).toBe(false);
  });

  it("loadDevicePrefs returns {} when nothing stored or blob is corrupt", () => {
    expect(loadDevicePrefs()).toEqual({});
    localStorage.setItem(PREFS_KEY, "{not json");
    expect(loadDevicePrefs()).toEqual({});
  });

  it("saveDevicePrefs merges patches and round-trips through localStorage", () => {
    saveDevicePrefs({ term: "114_2" });
    saveDevicePrefs({ showZhuyin: true });
    expect(loadDevicePrefs()).toEqual({ term: "114_2", showZhuyin: true });
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!)).toEqual({ term: "114_2", showZhuyin: true });
  });

  it("sanitizePrefs drops unknown keys and ill-typed values", () => {
    expect(
      sanitizePrefs({
        term: "bogus",
        publisher: 3,
        gradeNum: 9,
        practiceMode: "essay",
        showZhuyin: "yes",
        extra: 1,
      }),
    ).toEqual({});
    expect(sanitizePrefs({ term: "115_1", gradeNum: 2, practiceMode: "article", showZhuyin: true }))
      .toEqual({ term: "115_1", gradeNum: 2, practiceMode: "article", showZhuyin: true });
  });

  it("resolvePrefs layers defaults ← device ← profile", () => {
    const resolved = resolvePrefs({ term: "114_2", gradeNum: 2 }, { gradeNum: 5, showZhuyin: true });
    expect(resolved).toEqual({
      ...DEFAULT_PREFS,
      term: "114_2",
      gradeNum: 5,
      showZhuyin: true,
    });
    // no profile layer → device wins
    expect(resolvePrefs({ term: "114_2" }, null).term).toBe("114_2");
    // nothing stored → defaults
    expect(resolvePrefs({}, null)).toEqual(DEFAULT_PREFS);
  });
});
