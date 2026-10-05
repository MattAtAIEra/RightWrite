import { useEffect, useMemo, useState } from "react";
import { fetchGrades } from "../api";
import type { GradeOption } from "../types";
import { fetchVocab, type VocabResponse } from "./api";

/** 生字庫：挑一套課本，看每一課的生字、常見錯字與例詞。 */
export default function VocabView() {
  const [grades, setGrades] = useState<GradeOption[]>([]);
  const [gradeId, setGradeId] = useState("4_kangxuan");
  const [data, setData] = useState<VocabResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [openChar, setOpenChar] = useState<string | null>(null);

  useEffect(() => {
    fetchGrades()
      .then((g) => setGrades(g.grades))
      .catch(() => setGrades([]));
  }, []);

  useEffect(() => {
    setData(null);
    fetchVocab(gradeId)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "讀取失敗"));
  }, [gradeId]);

  const groupedGrades = useMemo(() => {
    const byTerm = new Map<string, GradeOption[]>();
    for (const g of grades) {
      const key = g.term_label ?? "";
      byTerm.set(key, [...(byTerm.get(key) ?? []), g]);
    }
    return [...byTerm.entries()];
  }, [grades]);

  const q = query.trim();
  const lessons = useMemo(() => {
    if (!data) return [];
    if (!q) return data.lessons;
    return data.lessons
      .map((l) => ({ ...l, characters: l.characters.filter((c) => c.char === q || c.similar_wrong.includes(q) || c.examples.some((e) => e.includes(q))) }))
      .filter((l) => l.characters.length > 0);
  }, [data, q]);

  const totalChars = data ? data.lessons.reduce((n, l) => n + l.characters.length, 0) : 0;

  return (
    <div className="ad-vocab">
      <header className="yz-admin-head">
        <div>
          <h1>生字庫</h1>
          <p className="yz-hint">
            {data ? `${data.grade.label}：${data.lessons.length} 課、${totalChars} 個生字。點一個字看它的常見錯字與例詞。` : "載入中…"}
          </p>
        </div>
        <div className="yz-admin-links">
          <select value={gradeId} onChange={(e) => setGradeId(e.target.value)} aria-label="課本" className="ad-select">
            {groupedGrades.map(([term, list]) => (
              <optgroup key={term} label={term || "其他"}>
                {list.map((g) => (
                  <option key={g.id} value={g.id}>{g.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <input
            className="yz-idiom-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋一個字或例詞…"
            aria-label="搜尋"
          />
        </div>
      </header>

      {error && <div className="yz-error">{error}</div>}

      {data && (
        <div className="ad-lessons">
          {lessons.map((l) => (
            <section key={l.lesson_number} className="ad-card ad-lesson">
              <h2>
                第 {l.lesson_number} 課 <span className="ad-lesson-title">{l.title}</span>
                <small>{l.characters.length} 字</small>
              </h2>
              <div className="ad-chars">
                {l.characters.map((c) => {
                  const key = `${l.lesson_number}-${c.char}`;
                  const open = openChar === key;
                  return (
                    <div key={key} className={`ad-char${open ? " open" : ""}`}>
                      <button type="button" className="ad-char-btn" onClick={() => setOpenChar(open ? null : key)}>
                        {c.char}
                      </button>
                      {open && (
                        <div className="ad-char-detail">
                          <div>
                            <span className="ad-char-k">常見錯字</span>
                            {c.similar_wrong.length ? c.similar_wrong.map((w) => <span key={w} className="ad-wrong">{w}</span>) : <span className="yz-hint">無</span>}
                          </div>
                          <div>
                            <span className="ad-char-k">例詞</span>
                            {c.examples.length ? c.examples.join("、") : <span className="yz-hint">無</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {lessons.length === 0 && <p className="yz-hint">沒有符合「{q}」的字。</p>}
        </div>
      )}
    </div>
  );
}
