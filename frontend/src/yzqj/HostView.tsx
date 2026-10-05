import { useCallback, useMemo, useState } from "react";
import { socketUrl } from "./api";
import { hostTokenKey, navigate } from "./router";
import { useGameSocket } from "./useGameSocket";
import type { ServerMessage, Snapshot, Stroke } from "./types";
import Calligraphy from "./components/Calligraphy";
import Countdown from "./components/Countdown";
import MiniGrid from "./components/MiniGrid";
import QrCard from "./components/QrCard";
import Leaderboard from "./components/Leaderboard";
import { formatSeconds } from "./format";

interface Props {
  code: string;
}

const AVATARS = ["🐱", "🐶", "🐰", "🦊", "🐼", "🐨", "🐸", "🦁", "🐧", "🦄"];

export default function HostView({ code }: Props) {
  const token = sessionStorage.getItem(hostTokenKey(code));
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [strokes, setStrokes] = useState<Record<string, Stroke[]>>({});
  const [deadlineAt, setDeadlineAt] = useState<number>(0);
  const [notice, setNotice] = useState<string | null>(null);

  const onMessage = useCallback((msg: ServerMessage) => {
    switch (msg.type) {
      case "snapshot": {
        setSnap(msg);
        if (msg.status === "question" && msg.question) {
          const next = Date.now() + msg.question.remaining_ms;
          // 同一題只在偏差超過 0.5 秒時才校正，避免倒數跳動
          setDeadlineAt((prev) => (Math.abs(prev - next) > 500 ? next : prev));
        }
        break;
      }
      case "question_start":
        setStrokes({});
        break;
      case "stroke": {
        setStrokes((prev) => {
          const list = prev[msg.player_id] ? [...prev[msg.player_id]] : [];
          const last = list[list.length - 1];
          if (last && last.sid === msg.sid) {
            list[list.length - 1] = { sid: msg.sid, pts: [...last.pts, ...msg.pts] };
          } else if (msg.pts.length > 0) {
            list.push({ sid: msg.sid, pts: msg.pts });
          }
          return { ...prev, [msg.player_id]: list };
        });
        break;
      }
      case "clear":
        setStrokes((prev) => ({ ...prev, [msg.player_id]: [] }));
        break;
      case "error":
        setNotice(msg.message);
        window.setTimeout(() => setNotice(null), 3000);
        break;
      default:
        break;
    }
  }, []);

  const url = useMemo(
    () => (token ? socketUrl(code, { role: "host", token }) : null),
    [code, token]
  );
  const { send, connected, fatal } = useGameSocket(url, onMessage);

  const joinUrl = `${window.location.origin}/g/${code}`;

  if (!token) {
    return (
      <div className="yz-center-card">
        <h2>找不到這個賽局的老師密鑰</h2>
        <p>老師畫面只能在建立賽局的那個瀏覽器開啟。請回到首頁重新建立一場。</p>
        <button type="button" className="yz-btn primary" onClick={() => navigate("/yzqj")}>回首頁</button>
      </div>
    );
  }

  if (fatal) {
    return (
      <div className="yz-center-card">
        <h2>無法連線：{fatal}</h2>
        <p>這場賽局可能已經結束或伺服器已重啟。</p>
        <button type="button" className="yz-btn primary" onClick={() => navigate("/yzqj")}>回首頁</button>
      </div>
    );
  }

  if (!snap) {
    return <div className="yz-loader">連線中…</div>;
  }

  const emptySlots = Math.max(0, snap.max_players - snap.players.length);

  return (
    <div className="yz-host">
      <header className="yz-host-bar">
        <div className="yz-brand" onClick={() => navigate("/yzqj")} role="link" tabIndex={0}>
          <span className="yz-brand-mark">一字千金</span>
        </div>
        <div className="yz-host-status">
          <span className={`yz-dot${connected ? " on" : ""}`} />
          {connected ? "已連線" : "重新連線中…"} · 代碼 <b>{code}</b> · {snap.players.length}/{snap.max_players} 人
          {snap.round > 0 && <> · 第 {snap.round} 輪</>}
        </div>
      </header>

      {notice && <div className="yz-toast">{notice}</div>}

      {snap.status === "lobby" && (
        <section className="yz-lobby">
          <div className="yz-lobby-left">
            <h2>掃描 QR Code 加入</h2>
            <QrCard url={joinUrl} code={code} />
            <p className="yz-hint">或到 <b>{window.location.host}/yzqj</b> 輸入代碼 <b>{code}</b></p>
          </div>
          <div className="yz-lobby-right">
            <h2>已加入 {snap.players.length} 人</h2>
            <ul className="yz-player-chips">
              {snap.players.map((p, i) => (
                <li key={p.id} className={`yz-chip${p.connected ? "" : " offline"}`} style={{ animationDelay: `${i * 0.05}s` }}>
                  <span className="yz-chip-avatar">{AVATARS[i % AVATARS.length]}</span>
                  {p.nickname}
                </li>
              ))}
              {Array.from({ length: emptySlots }).map((_, i) => (
                <li key={`empty-${i}`} className="yz-chip empty">等待加入…</li>
              ))}
            </ul>
            <button
              type="button"
              className="yz-btn primary big"
              disabled={snap.players.length === 0}
              onClick={() => send({ type: "start" })}
            >
              開始比賽 🚀
            </button>
            <p className="yz-hint">一輪 5 題，每題 {snap.question_seconds} 秒。</p>
          </div>
        </section>
      )}

      {(snap.status === "question" || snap.status === "reveal") && snap.question && (
        <section className="yz-stage">
          <div className="yz-stage-top">
            <div className="yz-q-index">
              第 <b>{snap.question.index + 1}</b> / {snap.question.total} 題
            </div>
            <Calligraphy
              text={snap.question.display}
              reveal={
                snap.status === "reveal" && snap.question.wrong_index != null && snap.question.correct_char
                  ? { wrongIndex: snap.question.wrong_index, correctChar: snap.question.correct_char }
                  : null
              }
            />
            <div className="yz-stage-side">
              {snap.status === "question" ? (
                <Countdown deadlineAt={deadlineAt} totalSeconds={snap.question_seconds} />
              ) : (
                <div className="yz-reveal-badge">公布答案</div>
              )}
              {snap.status === "question" && (
                <>
                  <div className="yz-teacher-answer">
                    正確答案：<b>{snap.question.correct_char}</b>（{snap.question.idiom}）
                  </div>
                  <button type="button" className="yz-btn ghost" onClick={() => send({ type: "skip" })}>
                    跳到下一題 ⏭
                  </button>
                </>
              )}
              {snap.status === "reveal" && snap.question.meaning && (
                <div className="yz-meaning">
                  <b>{snap.question.idiom}</b>：{snap.question.meaning}
                </div>
              )}
            </div>
          </div>

          <div className="yz-monitor">
            {snap.players.map((p, i) => {
              const result = snap.status === "reveal" ? snap.results[p.id] : undefined;
              const stateClass = result
                ? result.is_correct ? " correct" : " incorrect"
                : p.submitted ? " submitted" : "";
              return (
                <div key={p.id} className={`yz-monitor-card${stateClass}${p.connected ? "" : " offline"}`} style={{ animationDelay: `${i * 0.04}s` }}>
                  <div className="yz-monitor-head">
                    <span className="yz-chip-avatar">{AVATARS[i % AVATARS.length]}</span>
                    <span className="yz-monitor-name">{p.nickname}</span>
                    <span className="yz-monitor-score">{p.correct_count} 分</span>
                  </div>
                  <MiniGrid strokes={strokes[p.id] ?? []} size={150} />
                  <div className="yz-monitor-foot">
                    {result ? (
                      result.is_correct ? (
                        <span>✓ 答對 · {formatSeconds(result.answer_ms)}</span>
                      ) : result.quota_exceeded ? (
                        <span title={result.detail}>✗ 免費額度用完</span>
                      ) : result.timed_out ? (
                        <span title={result.detail}>✗ 辨識逾時</span>
                      ) : result.submitted ? (
                        <span title={result.detail}>✗ 答錯{result.recognized ? `（寫成「${result.recognized}」）` : ""}</span>
                      ) : (
                        <span>✗ 沒有作答</span>
                      )
                    ) : p.submitted ? (
                      <span>已送出 ✓</span>
                    ) : p.connected ? (
                      <span className="writing">書寫中<i>.</i><i>.</i><i>.</i></span>
                    ) : (
                      <span>離線</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {snap.status === "finished" && (
        <section className="yz-final">
          <h2 className="yz-final-title">🎉 比賽結束！</h2>
          <Leaderboard entries={snap.leaderboard} />
          <div className="yz-final-actions">
            <button type="button" className="yz-btn primary big" onClick={() => send({ type: "start" })}>
              再來一輪 🔁
            </button>
            <button type="button" className="yz-btn ghost" onClick={() => navigate("/yzqj")}>
              結束，回首頁
            </button>
          </div>
          <p className="yz-hint">再來一輪會換 5 個新成語，學生不用重新加入；新同學也可以趁現在掃碼加入。</p>
          <QrCard url={joinUrl} code={code} />
        </section>
      )}
    </div>
  );
}
