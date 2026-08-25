// src/rewards/RewardStrip.tsx
// 首頁的集章進度條:本週練習進度 ＋ 獎品集章進度,點擊開集章簿。

import { useEffect, useState } from "react";
import { usePersonalization } from "../personalization/PersonalizationContext";
import { listByProfile } from "../storage/sessionStore";
import { listStamps } from "../storage/stampStore";
import { activeReward, getParentSettings } from "../storage/parentStore";
import { weekKey } from "./weekKey";
import type { RewardConfig } from "./types";

interface StripData {
  weeklyCount: number;
  weeklyGoal: number;
  unredeemed: number;
  reward: RewardConfig | null;
}

export default function RewardStrip({ onOpen }: { onOpen: () => void }) {
  const { enabled, activeProfile } = usePersonalization();
  const [data, setData] = useState<StripData | null>(null);

  useEffect(() => {
    if (!enabled || !activeProfile) {
      // Clear immediately when personalization turns off (same pattern as Dashboard)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setData(null);
      return;
    }
    let alive = true;
    (async () => {
      const [sessions, stamps, settings] = await Promise.all([
        listByProfile(activeProfile.id),
        listStamps(activeProfile.id),
        getParentSettings(activeProfile.id),
      ]);
      if (!alive) return;
      const wk = weekKey(Date.now());
      setData({
        weeklyCount: sessions.filter((s) => weekKey(s.startedAt) === wk).length,
        weeklyGoal: settings.weeklySessionGoal,
        unredeemed: stamps.filter((s) => s.redeemedRewardId === null).length,
        reward: activeReward(settings),
      });
    })();
    return () => { alive = false; };
  }, [enabled, activeProfile]);

  if (!enabled || !activeProfile || !data) return null;

  const weekPct = data.weeklyGoal > 0 ? Math.min(100, (data.weeklyCount / data.weeklyGoal) * 100) : 0;
  const rewardPct = data.reward
    ? Math.min(100, (data.unredeemed / data.reward.targetStamps) * 100)
    : 0;

  return (
    <button className="reward-strip" onClick={onOpen} aria-label="打開集章簿">
      <span className="reward-strip-seal" aria-hidden="true">章</span>
      <span className="reward-strip-body">
        <span className="reward-strip-line">
          本週練習 {data.weeklyCount}/{data.weeklyGoal} 次
          <span className="reward-strip-bar"><i style={{ width: `${weekPct}%` }} /></span>
        </span>
        {data.reward ? (
          <span className="reward-strip-line">
            {data.unredeemed >= data.reward.targetStamps
              ? `集滿囉！可以兌換「${data.reward.title}」`
              : `集章 ${data.unredeemed}/${data.reward.targetStamps} 枚換「${data.reward.title}」`}
            <span className="reward-strip-bar reward"><i style={{ width: `${rewardPct}%` }} /></span>
          </span>
        ) : (
          <span className="reward-strip-line faint">已集 {data.unredeemed} 枚印章・點我看集章簿</span>
        )}
      </span>
      <span className="reward-strip-arrow" aria-hidden="true">›</span>
    </button>
  );
}
