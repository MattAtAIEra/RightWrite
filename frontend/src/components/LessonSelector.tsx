import { useEffect, useState } from "react";
import type { LessonsResponse, PracticeMode, GradeOption } from "../types";
import { fetchLessons, fetchGrades } from "../api";
import { usePersonalization } from "../personalization/PersonalizationContext";
import ProfilePicker from "../personalization/ProfilePicker";
import { purgeOlderThanFourMonths } from "../storage/imageStore";
import { isSkippingImages, setSkippingImages } from "../storage/skipImagesFlag";

interface Props {
  onStart: (start: number, end: number, mode: PracticeMode, grade: string, gradeLabel: string) => void;
  onOpenDashboard: () => void;
}

/** Scholarly emblem: a brushed ensō ink ring with a cinnabar 「正」 seal
    stamped over it — the calligraphic counterpart to "correcting characters". */
function ScholarMark() {
  return (
    <svg
      viewBox="0 0 200 108"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "176px", margin: "0 auto 12px", display: "block", overflow: "visible" }}
      aria-hidden="true"
    >
      {/* faint ink-wash halo behind the ring */}
      <circle cx="74" cy="56" r="44" fill="#2a241d" opacity="0.03" />
      {/* the ensō — an open brushed ring */}
      <circle
        cx="74"
        cy="56"
        r="40"
        fill="none"
        stroke="#2a241d"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray="201 52"
        transform="rotate(-42 74 56)"
        opacity="0.9"
      />
      {/* the brush tail at the ring's opening */}
      <path
        d="M101 24 q9 -6 17 -3"
        stroke="#2a241d"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />
      {/* cinnabar seal, stamped over the lower-right of the ring (白文) */}
      <g transform="translate(108 52) rotate(-5)">
        <rect x="0" y="0" width="46" height="46" rx="8" fill="#b23a2e" />
        <rect x="4.5" y="4.5" width="37" height="37" rx="5" fill="none" stroke="#f4eada" strokeWidth="1.5" opacity="0.85" />
        <text
          x="23"
          y="25"
          fontSize="27"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#f4eada"
          fontFamily="'LXGW WenKai TC', serif"
          fontWeight="700"
        >
          正
        </text>
      </g>
    </svg>
  );
}

const PUBLISHERS = ["康軒版", "南一版", "翰林版"];
const GRADE_LABELS = ["一年級", "二年級", "三年級", "四年級", "五年級", "六年級"];

export default function LessonSelector({ onStart, onOpenDashboard }: Props) {
  const personalization = usePersonalization();
  const [showSettings, setShowSettings] = useState(false);
  const [skipImages, setSkipImagesState] = useState<boolean>(() => isSkippingImages());
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

  const startDisabled = personalization.enabled && !personalization.activeProfile;

  return (
    <div className="selector-container">
      {/* NEW: settings bar */}
      <div className="settings-bar">
        <h1 className="app-title">RightWrite 改錯字練習</h1>
        <div className="settings-bar-right">
          {personalization.enabled && personalization.activeProfile && (
            <button className="dashboard-btn" onClick={onOpenDashboard}>
              📊 報表
            </button>
          )}
          <button className="settings-btn" onClick={() => setShowSettings((v) => !v)} aria-label="設定">
            ⚙️
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="settings-dropdown">
          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={personalization.enabled}
              onChange={(e) => personalization.setEnabled(e.target.checked)}
            />
            <span>個人化記錄</span>
          </label>
          <p className="settings-hint">
            開啟後可以追蹤每位小朋友的學習狀況、看到報表、自動複習錯字。
          </p>
          {personalization.enabled && (
            <>
              <button
                className="settings-action"
                onClick={async () => {
                  const deleted = await purgeOlderThanFourMonths();
                  alert(`已刪除 ${deleted} 張 4 個月前的手寫圖`);
                }}
              >
                🗑️ 清理 4 個月前資料
              </button>
              <button
                className="settings-action"
                onClick={() => {
                  const next = !skipImages;
                  setSkippingImages(next);
                  setSkipImagesState(next);
                  alert(next ? "停止儲存新的手寫圖（既有資料保留）" : "重新開始儲存手寫圖");
                }}
              >
                {skipImages ? "✅ 開始儲存手寫圖" : "🚫 不再儲存手寫圖"}
              </button>
            </>
          )}
        </div>
      )}

      {personalization.enabled && (
        <ProfilePicker />
      )}

      {personalization.enabled && !personalization.activeProfile && (
        <div className="profile-required-banner">
          👆 請先選擇或新增一位小朋友再開始練習
        </div>
      )}

      <div className="selector-header">
        <ScholarMark />
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
              disabled={startDisabled}
              onClick={() => {
                const selectedGradeLabel = grades.find((g) => g.id === selectedGrade)?.label ?? selectedGrade;
                onStart(opt.start, opt.end, practiceMode, selectedGrade, selectedGradeLabel);
              }}
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
            onClick={() => {
              const selectedGradeLabel = grades.find((g) => g.id === selectedGrade)?.label ?? selectedGrade;
              onStart(startLesson, endLesson, practiceMode, selectedGrade, selectedGradeLabel);
            }}
            disabled={startDisabled}
          >
            開始練習！
          </button>
        </div>
      )}

      </div>{/* end selector-content */}
    </div>
  );
}
