import { useEffect, useState } from "react";
import type { LessonsResponse, PracticeMode } from "../types";
import { fetchLessons } from "../api";

interface Props {
  onStart: (start: number, end: number, mode: PracticeMode) => void;
}

export default function LessonSelector({ onStart }: Props) {
  const [data, setData] = useState<LessonsResponse | null>(null);
  const [mode, setMode] = useState<"quick" | "custom">("quick");
  const [startLesson, setStartLesson] = useState(1);
  const [endLesson, setEndLesson] = useState(7);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("sentence");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLessons()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loader">載入中...</div>;
  }

  if (!data) {
    return <div className="error">無法載入課程資料</div>;
  }

  const quickOptions = [
    { label: "📖 期中考範圍 (第1-7課)", start: data.midterm_range[0], end: data.midterm_range[1] },
    { label: "📝 期末考範圍 (第8-14課)", start: data.final_range[0], end: data.final_range[1] },
    { label: "📚 全學期 (第1-14課)", start: 1, end: data.total_lessons },
  ];

  return (
    <div className="selector-container">
      <div className="selector-header">
        <h1>✏️ 改錯字練習神器</h1>
        <p className="subtitle">
          {data.publisher} {data.grade} {data.semester}
        </p>
      </div>

      {/* Practice mode selector */}
      <div className="practice-mode-selector">
        <h3>練習模式</h3>
        <div className="practice-mode-options">
          <button
            className={`practice-mode-btn ${practiceMode === "sentence" ? "active" : ""}`}
            onClick={() => setPracticeMode("sentence")}
          >
            <span className="mode-icon">📝</span>
            <span className="mode-label">句子改錯</span>
            <span className="mode-desc">1~2句短句，找出2~3個錯字</span>
          </button>
          <button
            className={`practice-mode-btn ${practiceMode === "article" ? "active" : ""}`}
            onClick={() => setPracticeMode("article")}
          >
            <span className="mode-icon">📄</span>
            <span className="mode-label">短文改錯</span>
            <span className="mode-desc">一篇小短文，找出5~8個錯字</span>
          </button>
        </div>
      </div>

      <div className="mode-toggle">
        <button
          className={mode === "quick" ? "active" : ""}
          onClick={() => setMode("quick")}
        >
          快速選擇
        </button>
        <button
          className={mode === "custom" ? "active" : ""}
          onClick={() => setMode("custom")}
        >
          自訂範圍
        </button>
      </div>

      {mode === "quick" ? (
        <div className="quick-options">
          {quickOptions.map((opt) => (
            <button
              key={opt.label}
              className="quick-btn"
              onClick={() => onStart(opt.start, opt.end, practiceMode)}
            >
              <span className="quick-label">{opt.label}</span>
              <span className="quick-chars">
                共{" "}
                {data.lessons
                  .filter((l) => l.lesson_number >= opt.start && l.lesson_number <= opt.end)
                  .reduce((sum, l) => sum + l.character_count, 0)}{" "}
                個生字
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="custom-range">
          <div className="range-selectors">
            <label>
              從第
              <select
                value={startLesson}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setStartLesson(v);
                  if (v > endLesson) setEndLesson(v);
                }}
              >
                {data.lessons.map((l) => (
                  <option key={l.lesson_number} value={l.lesson_number}>
                    {l.lesson_number} - {l.title}
                  </option>
                ))}
              </select>
              課
            </label>
            <label>
              到第
              <select
                value={endLesson}
                onChange={(e) => setEndLesson(Number(e.target.value))}
              >
                {data.lessons
                  .filter((l) => l.lesson_number >= startLesson)
                  .map((l) => (
                    <option key={l.lesson_number} value={l.lesson_number}>
                      {l.lesson_number} - {l.title}
                    </option>
                  ))}
              </select>
              課
            </label>
          </div>

          <div className="lesson-preview">
            {data.lessons
              .filter(
                (l) =>
                  l.lesson_number >= startLesson && l.lesson_number <= endLesson
              )
              .map((l) => (
                <div key={l.lesson_number} className="lesson-card">
                  <div className="lesson-num">第{l.lesson_number}課</div>
                  <div className="lesson-title">{l.title}</div>
                  <div className="lesson-chars">
                    {l.characters.map((c) => (
                      <span key={c} className="char-badge">
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </div>

          <button
            className="start-btn"
            onClick={() => onStart(startLesson, endLesson, practiceMode)}
          >
            開始練習！
          </button>
        </div>
      )}
    </div>
  );
}
