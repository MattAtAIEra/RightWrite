// src/dashboard/Dashboard.tsx
import { useEffect, useState } from "react";
import { usePersonalization } from "../personalization/PersonalizationContext";
import { listByProfile as listSessions } from "../storage/sessionStore";
import { listTopMistakes } from "../storage/charStatsStore";
import { deriveOverallStats, deriveTrendPoints, deriveLessonGroups, type OverallStats, type TrendPoint, type LessonGroup } from "./derive";
import type { CharStat } from "../storage/types";
import StatsCards from "./StatsCards";
import MistakeTrendChart from "./MistakeTrendChart";
import LessonProgressGrid from "./LessonProgressGrid";
import TopMistakesList from "./TopMistakesList";

export default function Dashboard({ onBack }: { onBack: () => void }) {
  const { activeProfile, profiles, setActiveProfile } = usePersonalization();
  const [stats, setStats] = useState<OverallStats | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [topChars, setTopChars] = useState<CharStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeProfile) return;
    setLoading(true);
    (async () => {
      const [sessions, top] = await Promise.all([
        listSessions(activeProfile.id),
        listTopMistakes(activeProfile.id, 10),
      ]);
      setStats(deriveOverallStats(sessions));
      setTrend(deriveTrendPoints(sessions));
      setGroups(deriveLessonGroups(sessions));
      setTopChars(top);
      setLoading(false);
    })();
  }, [activeProfile]);

  if (!activeProfile) {
    return (
      <div className="dashboard-container">
        <button className="back-btn" onClick={onBack}>← 返回</button>
        <p>請先選一位小朋友。</p>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <button className="back-btn" onClick={onBack}>← 返回</button>
        <h2>
          {activeProfile.emoji} {activeProfile.name} 的學習紀錄
        </h2>
        {profiles.length > 1 && (
          <select
            value={activeProfile.id}
            onChange={(e) => setActiveProfile(e.target.value)}
            className="profile-switcher"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.emoji} {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading || !stats ? (
        <div className="loader">載入中…</div>
      ) : (
        <>
          <StatsCards stats={stats} />
          <MistakeTrendChart points={trend} />
          <LessonProgressGrid groups={groups} />
          <TopMistakesList profileId={activeProfile.id} topChars={topChars} />
        </>
      )}
    </div>
  );
}
