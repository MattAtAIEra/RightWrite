import { describe, it, expect, beforeEach } from "vitest";
import { loadRecentQuestions, pushRound } from "../recentQuestionsStore";

const key = { profileId: "p1", gradeId: "grade4", startLesson: 4, endLesson: 4 };

const entry = (word: string, correct: string, wrong: string) => ({
  word,
  correct_char: correct,
  wrong_char: wrong,
});

describe("recentQuestionsStore", () => {
  beforeEach(() => localStorage.clear());

  it("returns empty state before anything is recorded", () => {
    expect(loadRecentQuestions(key)).toEqual({ rounds: [], variants: [] });
  });

  it("stacks the newest round in front", () => {
    pushRound(key, [entry("環境", "境", "竟")]);
    pushRound(key, [entry("潔白", "潔", "節")]);
    expect(loadRecentQuestions(key).rounds).toEqual([["潔白"], ["環境"]]);
  });

  it("keeps only the last three rounds so the pool is never fully excluded", () => {
    for (const w of ["一", "二", "三", "四"]) pushRound(key, [entry(w, w, w)]);
    expect(loadRecentQuestions(key).rounds).toEqual([["四"], ["三"], ["二"]]);
  });

  it("dedupes words within a round and variants across rounds", () => {
    pushRound(key, [entry("環境", "境", "竟"), entry("環境", "環", "幻")]);
    pushRound(key, [entry("環境", "境", "竟")]);
    const recent = loadRecentQuestions(key);
    expect(recent.rounds[1]).toEqual(["環境"]);
    expect(recent.variants).toEqual(["環境|境|竟", "環境|環|幻"]);
  });

  it("keeps each lesson range and profile apart", () => {
    pushRound(key, [entry("環境", "境", "竟")]);
    expect(loadRecentQuestions({ ...key, endLesson: 6 }).rounds).toEqual([]);
    expect(loadRecentQuestions({ ...key, profileId: "p2" }).rounds).toEqual([]);
    expect(loadRecentQuestions({ ...key, profileId: null }).rounds).toEqual([]);
  });

  it("survives corrupted storage", () => {
    localStorage.setItem("rw:recent:p1:grade4:4-4", "{ not json");
    expect(loadRecentQuestions(key)).toEqual({ rounds: [], variants: [] });
  });
});
