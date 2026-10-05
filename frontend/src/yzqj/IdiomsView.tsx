import { useCallback, useEffect, useMemo, useState } from "react";
import { addIdiom, deleteIdiom, fetchIdioms } from "./api";
import type { IdiomEntry, IdiomsResponse } from "./types";

/** 把成語裡第 pos 個字換成錯字，給清單顯示「題目會長什麼樣」 */
function withWrong(idiom: string, pos: number, char: string): string[] {
  return Array.from(idiom).map((c, i) => (i === pos ? char : c));
}

/**
 * 成語題庫：看目前所有會出的成語（內建＋自訂），老師可以新增自訂成語。
 * 自訂成語存在伺服器的 JSON 檔，出題時和內建的一起抽。
 */
export default function IdiomsView() {
  const [data, setData] = useState<IdiomsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  // 新增表單
  const [idiom, setIdiom] = useState("");
  const [pos, setPos] = useState(0);
  const [wrongChar, setWrongChar] = useState("");
  const [meaning, setMeaning] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await fetchIdioms());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "讀取失敗");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const chars = Array.from(idiom);
  const canSubmit = chars.length === 4 && Array.from(wrongChar).length === 1 && !saving;

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim();
    if (!q) return data.idioms;
    return data.idioms.filter(
      (i) => i.idiom.includes(q) || i.meaning.includes(q) || i.wrong.some((w) => w.char === q)
    );
  }, [data, query]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setFormError(null);
    setNotice(null);
    try {
      const created = await addIdiom({
        idiom: idiom.trim(),
        wrong: [{ pos, char: wrongChar.trim() }],
        meaning: meaning.trim(),
      });
      setData((prev) => (prev ? { ...prev, idioms: [...prev.idioms, created], custom_count: prev.custom_count + 1 } : prev));
      setNotice(`已新增「${created.idiom}」，下一場就會出現在題目裡。`);
      setIdiom("");
      setWrongChar("");
      setMeaning("");
      setPos(0);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "新增失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: IdiomEntry) => {
    if (!confirm(`要刪除自訂成語「${entry.idiom}」嗎？`)) return;
    try {
      await deleteIdiom(entry.idiom);
      setData((prev) =>
        prev ? { ...prev, idioms: prev.idioms.filter((i) => i.idiom !== entry.idiom), custom_count: prev.custom_count - 1 } : prev
      );
      setNotice(`已刪除「${entry.idiom}」。`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "刪除失敗");
    }
  };

  return (
    <div className="yz-idioms">
      <header className="yz-admin-head">
        <div>
          <h1>一字千金 · 成語題庫</h1>
          <p className="yz-hint">
            {data
              ? `目前共 ${data.idioms.length} 個成語：內建 ${data.builtin_count} 個、自訂 ${data.custom_count} 個。每一題會把其中一個字換成錯字，學生要寫出正確的那個字。`
              : "載入中…"}
          </p>
        </div>
      </header>

      <section className="yz-idiom-form-card">
        <h2>新增自訂成語</h2>
        <form className="yz-idiom-form" onSubmit={handleAdd}>
          <label>
            成語（四個字）
            <input
              value={idiom}
              onChange={(e) => setIdiom(e.target.value.replace(/\s/g, "").slice(0, 4))}
              placeholder="例如：守望相助"
              maxLength={4}
              autoComplete="off"
            />
          </label>
          <div className="yz-idiom-pos">
            <span>要換掉哪一個字？</span>
            <div className="yz-idiom-pos-options" role="radiogroup" aria-label="錯字位置">
              {[0, 1, 2, 3].map((i) => (
                <label key={i} className={`yz-idiom-pos-option${pos === i ? " active" : ""}`}>
                  <input type="radio" name="pos" value={i} checked={pos === i} onChange={() => setPos(i)} />
                  <b>{chars[i] ?? "＿"}</b>
                  <small>第 {i + 1} 字</small>
                </label>
              ))}
            </div>
          </div>
          <label>
            錯字（寫錯時常用的那個字）
            <input
              value={wrongChar}
              onChange={(e) => setWrongChar(e.target.value.replace(/\s/g, "").slice(0, 1))}
              placeholder={chars[pos] ? `會被寫成…（正確是「${chars[pos]}」）` : "例如：住"}
              maxLength={1}
              autoComplete="off"
            />
          </label>
          <label>
            解釋（公布答案時顯示，可留空）
            <input value={meaning} onChange={(e) => setMeaning(e.target.value.slice(0, 60))} placeholder="例如：鄰居互相照顧、幫忙。" />
          </label>
          {chars.length === 4 && Array.from(wrongChar).length === 1 && (
            <div className="yz-idiom-preview">
              題目會顯示：
              {withWrong(idiom, pos, wrongChar).map((c, i) => (
                <span key={i} className={i === pos ? "wrong" : ""}>{c}</span>
              ))}
              <span className="yz-idiom-preview-answer">→ 正確字「{chars[pos]}」</span>
            </div>
          )}
          <div className="yz-idiom-form-actions">
            <button type="submit" className="yz-btn primary" disabled={!canSubmit}>
              {saving ? "儲存中…" : "加入題庫"}
            </button>
          </div>
          {formError && <div className="yz-error">{formError}</div>}
          {notice && <div className="yz-notice">{notice}</div>}
        </form>
      </section>

      <section className="yz-idiom-list">
        <div className="yz-idiom-toolbar">
          <input
            className="yz-idiom-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋成語、錯字或解釋…"
            aria-label="搜尋"
          />
          <span className="yz-hint">{data ? `顯示 ${filtered.length} / ${data.idioms.length} 個` : ""}</span>
        </div>
        {error && <div className="yz-error">{error}</div>}
        <table className="yz-idiom-table">
          <thead>
            <tr>
              <th>#</th>
              <th>成語</th>
              <th>題目會長這樣</th>
              <th>解釋</th>
              <th>來源</th>
              <th aria-label="操作"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry, idx) => (
              <tr key={entry.idiom} className={entry.source === "custom" ? "is-custom" : ""}>
                <td className="num">{idx + 1}</td>
                <td className="idiom">{entry.idiom}</td>
                <td className="variants">
                  {entry.wrong.map((w) => (
                    <span key={`${w.pos}-${w.char}`} className="yz-idiom-variant">
                      {withWrong(entry.idiom, w.pos, w.char).map((c, i) => (
                        <span key={i} className={i === w.pos ? "wrong" : ""}>{c}</span>
                      ))}
                      <small>→ {entry.idiom[w.pos]}</small>
                    </span>
                  ))}
                </td>
                <td className="meaning">{entry.meaning || "—"}</td>
                <td>
                  <span className={`yz-idiom-badge ${entry.source}`}>{entry.source === "custom" ? "自訂" : "內建"}</span>
                </td>
                <td className="actions">
                  {entry.source === "custom" && (
                    <button type="button" className="yz-link-btn" onClick={() => handleDelete(entry)}>刪除</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
