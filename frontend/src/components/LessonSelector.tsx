import { useEffect, useState } from "react";
import type { LessonsResponse, PracticeMode, GradeOption } from "../types";
import { fetchLessons, fetchGrades } from "../api";

interface Props {
  onStart: (start: number, end: number, mode: PracticeMode, gradeId: string) => void;
}

function HappyKidsIllustration() {
  return (
    <svg
      viewBox="0 0 320 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "260px", margin: "0 auto 8px", display: "block" }}
    >
      {/* Stars */}
      <g opacity="0.7">
        <path d="M30 20l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#ffe66d" />
        <path d="M280 15l2 5 5 1-4 3 1 5-4-2-5 2 1-5-3-3 5-1z" fill="#ffe66d" />
        <path d="M160 8l2 4 4 0-3 3 1 4-4-2-4 2 1-4-3-3 4 0z" fill="#ff6b6b" />
      </g>
      {/* Kid 1 - reading book */}
      <g transform="translate(60, 25)">
        <circle cx="20" cy="18" r="16" fill="#ffd8a8" />
        <circle cx="14" cy="15" r="2.5" fill="#2d3436" />
        <circle cx="26" cy="15" r="2.5" fill="#2d3436" />
        <path d="M15 23 Q20 28 25 23" stroke="#ff6b6b" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M6 4 Q20-6 34 4" fill="#2d3436" />
        <rect x="6" y="40" width="28" height="24" rx="3" fill="#4ecdc4" />
        <rect x="2" y="60" width="36" height="10" rx="2" fill="#ffe66d" stroke="#ffd93d" strokeWidth="1" />
        <line x1="10" y1="63" x2="30" y2="63" stroke="#ffd93d" strokeWidth="1" />
        <line x1="10" y1="66" x2="25" y2="66" stroke="#ffd93d" strokeWidth="1" />
      </g>
      {/* Kid 2 - writing with pencil */}
      <g transform="translate(145, 25)">
        <circle cx="20" cy="18" r="16" fill="#ffd8a8" />
        <circle cx="14" cy="15" r="2.5" fill="#2d3436" />
        <circle cx="26" cy="15" r="2.5" fill="#2d3436" />
        <path d="M16 24 Q20 27 24 24" stroke="#ff6b6b" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M8 2 Q12-4 16 2 Q20-4 24 2 Q28-4 32 2" fill="#2d3436" />
        <rect x="6" y="40" width="28" height="24" rx="3" fill="#ff6b6b" />
        <line x1="38" y1="50" x2="52" y2="66" stroke="#ffa94d" strokeWidth="3" strokeLinecap="round" />
        <polygon points="52,66 55,68 53,70" fill="#2d3436" />
      </g>
      {/* Kid 3 - waving */}
      <g transform="translate(230, 25)">
        <circle cx="20" cy="18" r="16" fill="#ffd8a8" />
        <circle cx="14" cy="14" r="2.5" fill="#2d3436" />
        <circle cx="26" cy="14" r="2.5" fill="#2d3436" />
        <path d="M14 24 Q20 29 26 24" stroke="#ff6b6b" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M4 6 Q20-8 36 6" fill="#2d3436" />
        <rect x="6" y="40" width="28" height="24" rx="3" fill="#ffe66d" />
        <line x1="36" y1="42" x2="44" y2="28" stroke="#ffd8a8" strokeWidth="4" strokeLinecap="round" />
        <circle cx="45" cy="26" r="4" fill="#ffd8a8" />
      </g>
      {/* Hearts */}
      <g opacity="0.6">
        <path d="M110 45 Q110 38 116 38 Q122 38 122 45 Q122 52 110 60 Q98 52 98 45 Q98 38 104 38 Q110 38 110 45z" fill="#ff6b6b" transform="scale(0.5) translate(140, 10)" />
      </g>
    </svg>
  );
}

const PUBLISHERS = ["康軒版", "南一版", "翰林版"];
const GRADE_LABELS = ["一年級", "二年級", "三年級", "四年級", "五年級", "六年級"];

export default function LessonSelector({ onStart }: Props) {
  const [grades, setGrades] = useState<GradeOption[]>([]);
  const [selectedPublisher, setSelectedPublisher] = useState("康軒版");
  const [selectedGradeNum, setSelectedGradeNum] = useState(4);
  const [data, setData] = useState<LessonsResponse | null>(null);
  const [mode, setMode] = useState<"quick" | "custom">("quick");
  const [startLesson, setStartLesson] = useState(1);
  const [endLesson, setEndLesson] = useState(6);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("sentence");
  const [loading, setLoading] = useState(true);

  // Derive grade_id from publisher + grade selection
  const selectedGrade =
    grades.find(
      (g) => g.publisher === selectedPublisher && g.grade === GRADE_LABELS[selectedGradeNum - 1]
    )?.id || "";

  // Fetch available grades on mount
  useEffect(() => {
    fetchGrades()
      .then((res) => setGrades(res.grades))
      .catch(() => {});
  }, []);

  // Fetch lessons when derived grade_id changes (background, no full-page reload)
  const [lessonsLoading, setLessonsLoading] = useState(false);
  useEffect(() => {
    if (!selectedGrade) return;
    setLessonsLoading(true);
    fetchLessons(selectedGrade)
      .then((res) => {
        // Sort lessons by lesson_number
        res.lessons.sort((a, b) => a.lesson_number - b.lesson_number);
        setData(res);
        setStartLesson(1);
        setEndLesson(res.midterm_range[1]);
        setLoading(false);
      })
      .finally(() => setLessonsLoading(false));
  }, [selectedGrade]);

  if (loading && !data) {
    return <div className="loader">載入中...</div>;
  }

  const sortedLessons = data?.lessons ?? [];

  const quickOptions = !data ? [] : [
    {
      label: `📖 期中考範圍 (第${data.midterm_range[0]}-${data.midterm_range[1]}課)`,
      start: data.midterm_range[0],
      end: data.midterm_range[1],
    },
    {
      label: `📝 期末考範圍 (第${data.final_range[0]}-${data.final_range[1]}課)`,
      start: data.final_range[0],
      end: data.final_range[1],
    },
    {
      label: `📚 全學期 (第1-${data.total_lessons}課)`,
      start: 1,
      end: data.total_lessons,
    },
  ];

  return (
    <div className="selector-container">
      <div className="selector-header">
        <HappyKidsIllustration />
        <h1>改錯字練習神器</h1>
        <p className="subtitle">
          {data ? `${data.publisher} ${data.grade} ${data.semester}` : ""}
        </p>
      </div>

      {/* Publisher selector */}
      {grades.length > 1 && (
        <div className="grade-selector">
          <h3>出版社</h3>
          <div className="grade-options">
            {PUBLISHERS.map((pub) => (
              <button
                key={pub}
                className={`grade-btn ${selectedPublisher === pub ? "active" : ""}`}
                onClick={() => setSelectedPublisher(pub)}
              >
                {pub.replace("版", "")}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grade selector */}
      {grades.length > 1 && (
        <div className="grade-selector">
          <h3>年級</h3>
          <div className="grade-options">
            {GRADE_LABELS.map((label, i) => (
              <button
                key={label}
                className={`grade-btn ${selectedGradeNum === i + 1 ? "active" : ""}`}
                onClick={() => setSelectedGradeNum(i + 1)}
              >
                {label.replace("年級", "")}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content below: dims while loading new lessons */}
      <div className={`selector-content ${lessonsLoading ? "loading-dim" : ""}`}>

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
            <span className="mode-desc">多句短句，找出5~7個錯字</span>
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
              onClick={() => onStart(opt.start, opt.end, practiceMode, selectedGrade)}
            >
              <span className="quick-label">{opt.label}</span>
              <span className="quick-chars">
                共{" "}
                {sortedLessons
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
                {sortedLessons.map((l) => (
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
                {sortedLessons
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
            {sortedLessons
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
            onClick={() => onStart(startLesson, endLesson, practiceMode, selectedGrade)}
          >
            開始練習！
          </button>
        </div>
      )}

      </div>{/* end selector-content */}
    </div>
  );
}
