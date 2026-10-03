// src/dashboard/StatsCards.tsx
import type { OverallStats } from "./derive";

export default function StatsCards({ stats }: { stats: OverallStats }) {
  return (
    <div className="stats-cards">
      <div className="stats-card">
        <div className="stats-number">{stats.sessionCount}</div>
        <div className="stats-label">練習次數</div>
      </div>
      <div className="stats-card">
        <div className="stats-number">{stats.totalFoundCorrect}</div>
        <div className="stats-label">寫對字數</div>
      </div>
      <div className="stats-card">
        <div className="stats-number">{stats.consecutiveDays}</div>
        <div className="stats-label">連續天數</div>
      </div>
      <div className="stats-card">
        <div className="stats-number">{Math.round(stats.avgAccuracy * 100)}%</div>
        <div className="stats-label">平均正確率</div>
      </div>
    </div>
  );
}
