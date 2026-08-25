// src/rewards/types.ts

/** 印章種類 — each maps to one automatic rule in stampEngine.ts */
export type StampType =
  | "first_session" // 首練印：第一次完成練習
  | "perfect"       // 滿分印:單次練習 100%
  | "weekly_goal"   // 週達印:本週練習次數達到家長設定的目標
  | "streak3"       // 連三印:連續三天都有練習
  | "chars100";     // 百字印:累計訂正字數每滿 100

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
  /** 每週練習次數目標(週達印門檻) */
  weeklySessionGoal: number;
  rewards: RewardConfig[];
  updatedAt: number;
  syncedAt: number | null;
}

export const DEFAULT_WEEKLY_GOAL = 3;

export const STAMP_LABELS: Record<StampType, { seal: string; name: string; describe: string }> = {
  first_session: { seal: "首練", name: "首練印", describe: "完成第一次練習" },
  perfect: { seal: "滿分", name: "滿分印", describe: "單次練習全對" },
  weekly_goal: { seal: "週達", name: "週達印", describe: "本週練習次數達標" },
  streak3: { seal: "連三", name: "連三印", describe: "連續三天都有練習" },
  chars100: { seal: "百字", name: "百字印", describe: "累計訂正滿一百字" },
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
