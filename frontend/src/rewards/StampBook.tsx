// src/rewards/StampBook.tsx
// 集章簿:小朋友看進度與印章;家長經 PIN 進入設定目標、獎品與確認兌換。

import { useCallback, useEffect, useState } from "react";
import { usePersonalization } from "../personalization/PersonalizationContext";
import { listByProfile } from "../storage/sessionStore";
import { listStamps } from "../storage/stampStore";
import {
  activeReward,
  clearPin,
  getParentSettings,
  saveParentSettings,
  setPin,
  verifyPin,
} from "../storage/parentStore";
import { redeemStamps } from "../storage/stampStore";
import StampSeal from "./StampSeal";
import { STAMP_LABELS, type ParentSettings, type Stamp } from "./types";
import { weekKey } from "./weekKey";

type GateState = "closed" | "setup" | "enter" | "open";

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function StampBook({ onBack }: { onBack: () => void }) {
  const { activeProfile, profiles, setActiveProfile } = usePersonalization();
  const [stamps, setStamps] = useState<Stamp[]>([]);
  const [settings, setSettings] = useState<ParentSettings | null>(null);
  const [weeklyCount, setWeeklyCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [gate, setGate] = useState<GateState>("closed");
  const [pinInput, setPinInput] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [forgetArmed, setForgetArmed] = useState(false);

  // Parent zone edit fields
  const [goalDraft, setGoalDraft] = useState(3);
  const [rewardTitle, setRewardTitle] = useState("");
  const [rewardTarget, setRewardTarget] = useState(10);
  const [saved, setSaved] = useState(false);

  const profileId = activeProfile?.id ?? null;

  const reload = useCallback(async () => {
    if (!profileId) return;
    const [st, se, sessions] = await Promise.all([
      listStamps(profileId),
      getParentSettings(profileId),
      listByProfile(profileId),
    ]);
    setStamps(st.slice().reverse()); // newest first
    setSettings(se);
    setGoalDraft(se.weeklySessionGoal);
    const act = activeReward(se);
    setRewardTitle(act?.title ?? "");
    setRewardTarget(act?.targetStamps ?? 10);
    const wk = weekKey(Date.now());
    setWeeklyCount(sessions.filter((s) => weekKey(s.startedAt) === wk).length);
    setLoading(false);
  }, [profileId]);

  useEffect(() => {
    // Reset view state when the profile changes (same pattern as Dashboard)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setGate("closed");
    setPinInput("");
    setPinConfirm("");
    setPinError(null);
    setForgetArmed(false);
    reload();
  }, [reload]);

  if (!activeProfile || !settings) {
    return (
      <div className="stampbook-container">
        <button className="back-btn" onClick={onBack}>← 返回</button>
        {loading ? <div className="loader">載入中…</div> : <p>請先選一位小朋友。</p>}
      </div>
    );
  }

  const unredeemedStamps = stamps.filter((s) => s.redeemedRewardId === null);
  const unredeemed = unredeemedStamps.length;
  const reward = activeReward(settings);
  const redeemable = reward !== null && unredeemed >= reward.targetStamps;
  const history = settings.rewards.filter((r) => r.redeemedAt !== null);

  const openParentZone = () => {
    setPinError(null);
    setPinInput("");
    setPinConfirm("");
    setGate(settings.pinHash ? "enter" : "setup");
  };

  const handleSetupPin = async () => {
    if (!/^\d{4}$/.test(pinInput)) { setPinError("PIN 需為 4 位數字"); return; }
    if (pinInput !== pinConfirm) { setPinError("兩次輸入不一致"); return; }
    await setPin(activeProfile.id, pinInput);
    await reload();
    setGate("open");
  };

  const handleEnterPin = async () => {
    if (await verifyPin(activeProfile.id, pinInput)) {
      setGate("open");
      setPinError(null);
    } else {
      setPinError("PIN 不正確");
    }
  };

  const handleForgetPin = async () => {
    if (!forgetArmed) { setForgetArmed(true); return; }
    await clearPin(activeProfile.id);
    setForgetArmed(false);
    await reload();
    setGate("setup");
  };

  const handleSaveParent = async () => {
    const next: ParentSettings = { ...settings, weeklySessionGoal: goalDraft };
    const title = rewardTitle.trim();
    const act = activeReward(next);
    if (title) {
      if (act) {
        act.title = title;
        act.targetStamps = rewardTarget;
      } else {
        next.rewards = [
          ...next.rewards,
          {
            id: crypto.randomUUID(),
            title,
            targetStamps: rewardTarget,
            createdAt: Date.now(),
            redeemedAt: null,
          },
        ];
      }
    }
    await saveParentSettings(next);
    await reload();
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  const handleRedeem = async () => {
    if (!reward) return;
    await redeemStamps(activeProfile.id, reward.id, reward.targetStamps);
    const next: ParentSettings = {
      ...settings,
      rewards: settings.rewards.map((r) =>
        r.id === reward.id ? { ...r, redeemedAt: Date.now() } : r,
      ),
    };
    await saveParentSettings(next);
    await reload();
  };

  return (
    <div className="stampbook-container">
      <div className="dashboard-header">
        <button className="back-btn" onClick={onBack}>← 返回</button>
        <h2>{activeProfile.emoji} {activeProfile.name} 的集章簿</h2>
        {profiles.length > 1 && (
          <select
            value={activeProfile.id}
            onChange={(e) => setActiveProfile(e.target.value)}
            className="profile-switcher"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* 集點卡 */}
      <section className="stampbook-card">
        <h3>集點卡</h3>
        {reward ? (
          <>
            <p className="stampbook-reward-line">
              集滿 <b>{reward.targetStamps}</b> 枚兌換:<b>{reward.title}</b>
            </p>
            <div className="punch-grid">
              {Array.from({ length: reward.targetStamps }, (_, i) => (
                <span key={i} className={`punch-slot${i < unredeemed ? " filled" : ""}`}>
                  {i < unredeemed ? (
                    <StampSeal type={unredeemedStamps[i].type} size={44} />
                  ) : (
                    <span className="punch-empty">{i + 1}</span>
                  )}
                </span>
              ))}
            </div>
            {redeemable ? (
              <p className="stampbook-full">集滿囉!請家長按下方「家長設定」確認兌換 🎁</p>
            ) : (
              <p className="stampbook-remaining">還差 {reward.targetStamps - unredeemed} 枚,加油!</p>
            )}
          </>
        ) : (
          <p className="stampbook-remaining">還沒有設定獎品——請家長到下方「家長設定」填寫。目前已集 {unredeemed} 枚。</p>
        )}
        <p className="stampbook-week">本週已練習 {weeklyCount} / {settings.weeklySessionGoal} 次</p>
      </section>

      {/* 我的印章 */}
      <section className="stampbook-card">
        <h3>我的印章({stamps.length})</h3>
        {stamps.length === 0 ? (
          <p className="stampbook-remaining">完成練習就會得到第一枚「首練印」!</p>
        ) : (
          <div className="stamp-grid">
            {stamps.map((s) => (
              <figure key={s.id} className="stamp-grid-item">
                <StampSeal type={s.type} size={56} spent={s.redeemedRewardId !== null} />
                <figcaption>
                  {STAMP_LABELS[s.type].name}
                  <small>{fmtDate(s.earnedAt)}{s.redeemedRewardId ? "・已兌換" : ""}</small>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      {/* 兌換紀錄 */}
      {history.length > 0 && (
        <section className="stampbook-card">
          <h3>兌換紀錄</h3>
          <ul className="redeem-history">
            {history.map((r) => (
              <li key={r.id}>
                <b>{r.title}</b>({r.targetStamps} 枚)——{fmtDate(r.redeemedAt!)} 兌換
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 家長區 */}
      <section className="stampbook-card parent-zone">
        <h3>家長設定</h3>
        {gate === "closed" && (
          <button className="parent-open-btn" onClick={openParentZone}>
            🔒 {settings.pinHash ? "輸入 PIN 進入" : "首次使用:設定家長 PIN"}
          </button>
        )}

        {gate === "setup" && (
          <div className="pin-form">
            <p>設定 4 位數家長 PIN(之後進入家長設定都需要輸入):</p>
            <input
              type="password" inputMode="numeric" maxLength={4} placeholder="PIN"
              value={pinInput} onChange={(e) => setPinInput(e.target.value)}
            />
            <input
              type="password" inputMode="numeric" maxLength={4} placeholder="再輸入一次"
              value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value)}
            />
            {pinError && <p className="pin-error">{pinError}</p>}
            <button className="parent-open-btn" onClick={handleSetupPin}>設定並進入</button>
          </div>
        )}

        {gate === "enter" && (
          <div className="pin-form">
            <input
              type="password" inputMode="numeric" maxLength={4} placeholder="輸入 4 位數 PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleEnterPin(); }}
            />
            {pinError && <p className="pin-error">{pinError}</p>}
            <div className="pin-actions">
              <button className="parent-open-btn" onClick={handleEnterPin}>進入</button>
              <button className="pin-forget" onClick={handleForgetPin}>
                {forgetArmed ? "確定重設?(獎品設定會保留)" : "忘記 PIN?"}
              </button>
            </div>
          </div>
        )}

        {gate === "open" && (
          <div className="parent-panel">
            <label className="parent-field">
              每週練習目標(次)
              <input
                type="number" min={1} max={14} value={goalDraft}
                onChange={(e) => setGoalDraft(Math.max(1, Math.min(14, Number(e.target.value) || 1)))}
              />
            </label>
            <label className="parent-field">
              獎品內容
              <input
                type="text" maxLength={30} placeholder="例:去動物園玩一天"
                value={rewardTitle} onChange={(e) => setRewardTitle(e.target.value)}
              />
            </label>
            <label className="parent-field">
              需要集滿(枚)
              <input
                type="number" min={1} max={60} value={rewardTarget}
                onChange={(e) => setRewardTarget(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              />
            </label>
            <div className="parent-actions">
              <button className="parent-open-btn" onClick={handleSaveParent}>
                {saved ? "已儲存 ✓" : "儲存設定"}
              </button>
              {reward && (
                <button
                  className="redeem-btn"
                  disabled={!redeemable}
                  onClick={handleRedeem}
                  title={redeemable ? undefined : "集滿後才能兌換"}
                >
                  🎁 確認兌換「{reward.title}」
                </button>
              )}
              <button className="pin-forget" onClick={() => setGate("closed")}>關閉家長區</button>
            </div>
            <p className="parent-hint">
              兌換後會消耗 {reward?.targetStamps ?? 0} 枚印章重新開始集點;印章紀錄保留在「我的印章」。
              資料只存在這台裝置的瀏覽器裡。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
