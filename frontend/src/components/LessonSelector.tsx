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

/** Brand mark: the character 正 ("correct") circled and ticked in red pen —
    the exact gesture a teacher makes when a student fixes a wrong character. */
function ScholarMark() {
  return (
    <svg
      viewBox="8 10 166 116"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "176px", margin: "0 auto 12px", display: "block", overflow: "visible" }}
      aria-hidden="true"
    >
      {/* the character being marked correct */}
      <text
        x="70"
        y="71"
        fontSize="62"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--ink)"
        fontFamily="'LXGW WenKai TC', serif"
        fontWeight="700"
      >
        正
      </text>
      {/* red-pen circle — hand-drawn, with a natural overshoot where the stroke closes */}
      <path
        d="M 52.5 111.4 C 50.7 110.7 44.9 109.0 41.5 107.2 C 38.1 105.3 34.9 102.9 32.1 100.3 C 29.3 97.7 26.9 94.6 24.8 91.5 C 22.7 88.4 20.8 85.1 19.4 81.6 C 18.0 78.1 16.8 74.4 16.5 70.7 C 16.2 67.0 16.4 63.1 17.4 59.5 C 18.4 55.9 20.3 52.4 22.4 49.3 C 24.4 46.2 27.3 43.4 29.9 40.8 C 32.6 38.2 35.4 35.9 38.3 33.6 C 41.2 31.3 44.1 28.9 47.4 26.9 C 50.7 24.9 54.2 22.8 58.1 21.5 C 61.9 20.3 66.2 19.4 70.3 19.4 C 74.4 19.3 78.7 20.0 82.6 21.1 C 86.5 22.2 90.3 23.9 93.8 25.8 C 97.3 27.6 100.6 29.8 103.6 32.2 C 106.6 34.6 109.5 37.3 111.8 40.2 C 114.1 43.2 116.1 46.5 117.5 49.8 C 118.9 53.2 119.6 56.8 120.0 60.4 C 120.5 63.9 120.4 67.5 120.2 71.0 C 120.0 74.5 119.7 78.1 118.9 81.6 C 118.2 85.2 117.4 88.9 115.7 92.4 C 114.1 95.8 112.0 99.3 109.2 102.1 C 106.5 104.9 102.9 107.3 99.2 109.0 C 95.6 110.7 91.3 111.7 87.3 112.4 C 83.4 113.2 79.3 113.3 75.3 113.4 C 71.4 113.5 67.5 113.4 63.6 113.1 C 59.7 112.7 55.8 112.3 52.0 111.2 C 48.2 110.2 42.8 107.6 41.0 106.9"
        stroke="var(--cinnabar)"
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      {/* red-pen tick beside it */}
      <path
        d="M 134 66 l 12 16 l 30 -42"
        stroke="var(--cinnabar)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
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
