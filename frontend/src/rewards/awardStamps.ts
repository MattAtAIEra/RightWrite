// src/rewards/awardStamps.ts
// Orchestration: run after recordSession — load history, evaluate rules,
// persist any new stamps, and return what the result screen needs to show.

import type { Session } from "../storage/types";
import { listByProfile } from "../storage/sessionStore";
import { addStamps, listStamps } from "../storage/stampStore";
import { activeReward, getParentSettings } from "../storage/parentStore";
import { evaluateStamps } from "./stampEngine";
import { weekKey } from "./weekKey";
import type { StampAward } from "./types";

export async function awardStampsForSession(session: Session): Promise<StampAward> {
  const profileId = session.profileId;
  const [allSessions, existingStamps, settings] = await Promise.all([
    listByProfile(profileId),
    listStamps(profileId),
    getParentSettings(profileId),
  ]);

  const fresh = evaluateStamps({
    profileId,
    session,
    allSessions,
    existingStamps,
    weeklySessionGoal: settings.weeklySessionGoal,
  });
  const newStamps = await addStamps(fresh);

  const unredeemed =
    existingStamps.filter((s) => s.redeemedRewardId === null).length + newStamps.length;
  const wk = weekKey(session.startedAt);
  const weeklyCount = allSessions.filter((s) => weekKey(s.startedAt) === wk).length;

  return {
    newStamps,
    progress: { unredeemed, activeReward: activeReward(settings) },
    weeklyCount,
    weeklyGoal: settings.weeklySessionGoal,
  };
}
