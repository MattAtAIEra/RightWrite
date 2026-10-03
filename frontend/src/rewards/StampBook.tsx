// src/rewards/StampBook.tsx
// 印章收集簿:小朋友看進度與印章;家長經 PIN 進入設定目標、獎品與確認兌換。

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
  return `${d.getMonth() + 1}月${d.getDate()}日`;
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
        <h2>{activeProfile.emoji} {activeProfile.name} 的印章收集簿</h2>
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
        <h3>我要換的獎品</h3>
        {reward ? (
          <>
            <p className="stampbook-reward-line">
              集滿 <b>{reward.targetStamps}</b> 個章,就可以換:<b>{reward.title}</b>
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
              <p className="stampbook-full">集滿囉!請爸爸媽媽到下面的「爸爸媽媽專區」幫你換 🎁</p>
            ) : (
              <p className="stampbook-remaining">還差 {reward.targetStamps - unredeemed} 個章,加油!</p>
            )}
          </>
        ) : (
          <p className="stampbook-remaining">還沒有獎品喔——請爸爸媽媽到下面的「爸爸媽媽專區」寫一個。你現在已經有 {unredeemed} 個章。</p>
        )}
        <p className="stampbook-week">這禮拜已經練習 {weeklyCount} 次,目標 {settings.weeklySessionGoal} 次</p>
      </section>

      {/* 我的印章 */}
      <section className="stampbook-card">
        <h3>我蓋到的章(共 {stamps.length} 個)</h3>
        {stamps.length === 0 ? (
          <p className="stampbook-remaining">做完一次練習,就會拿到第一個「新手章」!</p>
        ) : (
          <div className="stamp-grid">
            {stamps.map((s) => (
              <figure key={s.id} className="stamp-grid-item">
                <StampSeal type={s.type} size={56} spent={s.redeemedRewardId !== null} />
                <figcaption>
                  {STAMP_LABELS[s.type].name}
                  <small>{fmtDate(s.earnedAt)}蓋的{s.redeemedRewardId ? "・換過了" : ""}</small>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </section>

      {/* 兌換紀錄 */}
      {history.length > 0 && (
        <section className="stampbook-card">
          <h3>換過的獎品</h3>
          <ul className="redeem-history">
            {history.map((r) => (
              <li key={r.id}>
                <b>{r.title}</b>(用了 {r.targetStamps} 個章)——{fmtDate(r.redeemedAt!)} 換的
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 家長區 */}
      <section className="stampbook-card parent-zone">
        <h3>爸爸媽媽專區</h3>
        {gate === "closed" && (
          <button className="parent-open-btn" onClick={openParentZone}>
            🔒 {settings.pinHash ? "輸入 PIN 進入" : "第一次使用:先設一組家長 PIN"}
          </button>
        )}

        {gate === "setup" && (
          <div className="pin-form">
            <p>設定 4 位數家長 PIN(之後要進來都得輸入):</p>
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
              一個禮拜要練習幾次
              <input
                type="number" min={1} max={14} value={goalDraft}
                onChange={(e) => setGoalDraft(Math.max(1, Math.min(14, Number(e.target.value) || 1)))}
              />
            </label>
            <label className="parent-field">
              集滿要換什麼獎品
              <input
                type="text" maxLength={30} placeholder="例:去動物園玩一天"
                value={rewardTitle} onChange={(e) => setRewardTitle(e.target.value)}
              />
            </label>
            <label className="parent-field">
              要集滿幾個章
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
                  🎁 幫他換「{reward.title}」
                </button>
              )}
              <button className="pin-forget" onClick={() => setGate("closed")}>關閉家長區</button>
            </div>
            <p className="parent-hint">
              換完會用掉 {reward?.targetStamps ?? 0} 個章、重新開始集;蓋過的章都還留在「我蓋到的章」裡。
              資料只存在這台裝置的瀏覽器裡。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
