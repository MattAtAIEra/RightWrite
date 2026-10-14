import { useCallback, useEffect, useMemo, useState } from "react";
import { addIdiom, deleteIdiom, fetchIdioms, setIdiomLevel } from "./api";
import { LEVEL_LABELS } from "./types";
import type { IdiomEntry, IdiomLevel, IdiomsResponse, PlayableLevel } from "./types";
import LevelPicker from "./components/LevelPicker";

type ListFilter = "all" | IdiomLevel | "custom";

const FILTERS: { key: ListFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "common", label: LEVEL_LABELS.common },
  { key: "advanced", label: LEVEL_LABELS.advanced },
  { key: "hidden", label: LEVEL_LABELS.hidden },
  { key: "custom", label: "自訂" },
];

const SOURCE_LABELS: Record<IdiomEntry["meaning_source"], string> = {
  moe: "教育部",
  curated: "內建",
  custom: "自訂",
};

/** 依清單重算各難度的數量（調整難度後不用重抓整份清單） */
function countLevels(idioms: IdiomEntry[]): Record<IdiomLevel, number> {
  const counts: Record<IdiomLevel, number> = { common: 0, advanced: 0, hidden: 0 };
  for (const i of idioms) counts[i.level] += 1;
  return counts;
}

/** 把成語裡第 pos 個字換成錯字，給清單顯示「題目會長什麼樣」 */
function withWrong(idiom: string, pos: number, char: string): string[] {
  return Array.from(idiom).map((c, i) => (i === pos ? char : c));
}

/**
 * 成語題庫：看目前所有成語（內建＋自訂），老師可以新增自訂成語、調整每個成語的難度。
 * 內建成語是教育部《成語典》的主條成語；自訂成語與難度調整存在伺服器的 JSON 檔。
 * 出題時依老師選的難度（一般常用／進階）抽，「不出題」的永遠不會出現。
 */
export default function IdiomsView() {
  const [data, setData] = useState<IdiomsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ListFilter>("all");

  // 新增表單
  const [idiom, setIdiom] = useState("");
  const [pos, setPos] = useState(0);
  const [wrongChar, setWrongChar] = useState("");
  const [meaning, setMeaning] = useState("");
  const [newLevel, setNewLevel] = useState<PlayableLevel>("common");
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
    return data.idioms.filter((i) => {
      if (filter === "custom" ? i.source !== "custom" : filter !== "all" && i.level !== filter) return false;
      if (!q) return true;
      return i.idiom.includes(q) || i.meaning.includes(q) || i.wrong.some((w) => w.char === q);
    });
  }, [data, query, filter]);

  const replaceEntry = (updated: IdiomEntry) =>
    setData((prev) => {
      if (!prev) return prev;
      const idioms = prev.idioms.map((i) => (i.idiom === updated.idiom ? { ...i, level: updated.level } : i));
      return { ...prev, idioms, level_counts: countLevels(idioms) };
    });

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
        level: newLevel,
      });
      setData((prev) => {
        if (!prev) return prev;
        const idioms = [...prev.idioms, created];
        return { ...prev, idioms, custom_count: prev.custom_count + 1, level_counts: countLevels(idioms) };
      });
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
      setData((prev) => {
        if (!prev) return prev;
        const idioms = prev.idioms.filter((i) => i.idiom !== entry.idiom);
        return { ...prev, idioms, custom_count: prev.custom_count - 1, level_counts: countLevels(idioms) };
      });
      setNotice(`已刪除「${entry.idiom}」。`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "刪除失敗");
    }
  };

  const handleLevel = async (entry: IdiomEntry, level: IdiomLevel) => {
    setFormError(null);
    try {
      replaceEntry(await setIdiomLevel(entry.idiom, level));
      setNotice(`「${entry.idiom}」改成${LEVEL_LABELS[level]}。`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "調整難度失敗");
    }
  };

  return (
    <div className="yz-idioms">
      <header className="yz-admin-head">
        <div>
          <h1>一字千金 · 成語題庫</h1>
          <p className="yz-hint">
            {data
              ? `目前共 ${data.idioms.length} 個成語：內建 ${data.builtin_count} 個、自訂 ${data.custom_count} 個；` +
                `一般常用 ${data.level_counts.common} 個、進階 ${data.level_counts.advanced} 個、不出題 ${data.level_counts.hidden} 個。` +
                "每一題會把其中一個字換成錯字，學生要寫出正確的那個字。"
              : "載入中…"}
          </p>
          <p className="yz-hint">
            內建成語取自教育部《成語典》的主條成語，「來源」標示「教育部」的解釋取自《成語典》的語義說明。
            難度是依國小課本用字與常見程度預先分好的，可以在清單裡直接調整。
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
          <div className="yz-idiom-level">
            <span>難度</span>
            <LevelPicker value={newLevel} onChange={setNewLevel} />
          </div>
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
          <div className="yz-idiom-filters" role="tablist" aria-label="篩選難度">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                className={`yz-idiom-filter${filter === f.key ? " active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                {data && f.key !== "all" && f.key !== "custom" ? ` ${data.level_counts[f.key]}` : ""}
              </button>
            ))}
          </div>
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
              <th>難度</th>
              <th>來源</th>
              <th aria-label="操作"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry, idx) => (
              <tr key={entry.idiom} className={`${entry.source === "custom" ? "is-custom" : ""}${entry.level === "hidden" ? " is-hidden" : ""}`}>
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
                  <select
                    className={`yz-idiom-level-select ${entry.level}`}
                    value={entry.level}
                    onChange={(e) => void handleLevel(entry, e.target.value as IdiomLevel)}
                    aria-label={`${entry.idiom} 的難度`}
                  >
                    {(Object.keys(LEVEL_LABELS) as IdiomLevel[]).map((lv) => (
                      <option key={lv} value={lv}>{LEVEL_LABELS[lv]}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <span className={`yz-idiom-badge ${entry.meaning_source}`}>{SOURCE_LABELS[entry.meaning_source]}</span>
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
