// src/rewards/types.ts

/** 印章種類 — each maps to one automatic rule in stampEngine.ts */
export type StampType =
  | "first_session" // 新手章：第一次完成練習
  | "perfect"       // 滿分章:單次練習 100%
  | "weekly_goal"   // 本週達標章:本週練習次數達到家長設定的目標
  | "streak3"       // 連三天章:連續三天都有練習
  | "chars100";     // 一百字章:累計訂正字數每滿 100

export interface Stamp {
  id: string;
  profileId: string;
  type: StampType;
  /** Dedupe scope: sessionId (perfect), weekKey (weekly_goal), day key
      (streak3), milestone count (chars100), "first" (first_session). */
  scopeKey: string;
  sessionId: string | null;
  earnedAt: number;
  /** Set when consumed by a reward redemption; null = still on the card */
  redeemedRewardId: string | null;
  updatedAt: number;
  syncedAt: number | null;
}

export interface RewardConfig {
  id: string;
  /** 家長填寫的獎品內容,e.g. "去動物園玩一天" */
  title: string;
  /** 集滿幾枚印章可兌換 */
  targetStamps: number;
  createdAt: number;
  redeemedAt: number | null;
}

export interface ParentSettings {
  profileId: string;
  /** SHA-256(pin + profileId) hex;null = 尚未設定 PIN */
  pinHash: string | null;
  /** 每週練習次數目標(本週達標章門檻) */
  weeklySessionGoal: number;
  rewards: RewardConfig[];
  updatedAt: number;
  syncedAt: number | null;
}

export const DEFAULT_WEEKLY_GOAL = 3;

export const STAMP_LABELS: Record<StampType, { seal: string; name: string; describe: string }> = {
  first_session: { seal: "新手", name: "新手章", describe: "做完第一次練習" },
  perfect: { seal: "滿分", name: "滿分章", describe: "這一次全部答對" },
  weekly_goal: { seal: "達標", name: "本週達標章", describe: "這禮拜練習次數到了" },
  streak3: { seal: "連三", name: "連三天章", describe: "連續三天都有練習" },
  chars100: { seal: "百字", name: "一百字章", describe: "訂正的字加起來滿一百個" },
};

/** 未兌換印章數 + 進行中的獎品,for progress UI */
export interface RewardProgress {
  unredeemed: number;
  activeReward: RewardConfig | null;
}

export interface StampAward {
  newStamps: Stamp[];
  progress: RewardProgress;
  weeklyCount: number;
  weeklyGoal: number;
}
