// src/dashboard/LessonProgressGrid.tsx
import type { LessonGroup } from "./derive";

function starRating(accuracy: number): string {
  const filled = Math.round(accuracy * 5);
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

export default function LessonProgressGrid({ groups }: { groups: LessonGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="lesson-progress-card">
        <h3>已做課文</h3>
        <p className="empty-hint">完成第一次練習後，這裡會出現你做過的課文。</p>
      </div>
    );
  }
  return (
    <div className="lesson-progress-card">
      <h3>已做課文</h3>
      <div className="lesson-progress-grid">
        {groups.map((g) => (
          <div className="lesson-card" key={`${g.gradeId}-${g.startLesson}-${g.endLesson}`}>
            <div className="lesson-card-title">
              {g.gradeLabel} 第{g.startLesson}–{g.endLesson}課
            </div>
            <div className="lesson-card-stars">{starRating(g.avgAccuracy)}</div>
            <div className="lesson-card-meta">
              練 {g.sessionCount} 次 · 正確率 {Math.round(g.avgAccuracy * 100)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
