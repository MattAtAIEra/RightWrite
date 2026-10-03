import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchGameInfo, joinGame, socketUrl } from "./api";
import { navigate, playerKey } from "./router";
import { useGameSocket } from "./useGameSocket";
import type { GameInfo, ServerMessage, Snapshot } from "./types";
import Calligraphy from "./components/Calligraphy";
import Countdown from "./components/Countdown";
import GridCanvas, { type GridCanvasHandle } from "./components/GridCanvas";
import Leaderboard from "./components/Leaderboard";

interface Props {
  code: string;
}

interface StoredPlayer {
  player_id: string;
  nickname: string;
}

function loadStored(code: string): StoredPlayer | null {
  try {
    const raw = sessionStorage.getItem(playerKey(code));
    return raw ? (JSON.parse(raw) as StoredPlayer) : null;
  } catch {
    return null;
  }
}

export default function PlayerView({ code }: Props) {
  const [info, setInfo] = useState<GameInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [me, setMe] = useState<StoredPlayer | null>(() => loadStored(code));
  const [nickname, setNickname] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    fetchGameInfo(code)
      .then(setInfo)
      .catch((e) => setInfoError(e instanceof Error ? e.message : "找不到這個賽局"));
  }, [code]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoining(true);
    setJoinError(null);
    try {
      const res = await joinGame(code, nickname.trim());
      const stored = { player_id: res.player_id, nickname: res.nickname };
      sessionStorage.setItem(playerKey(code), JSON.stringify(stored));
      setMe(stored);
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "加入失敗");
    } finally {
      setJoining(false);
    }
  };

  if (infoError) {
    return (
      <div className="yz-center-card">
        <h2>😢 {infoError}</h2>
        <p>請確認代碼是否正確，或請老師重新建立賽局。</p>
        <button type="button" className="yz-btn primary" onClick={() => navigate("/yzqj")}>回首頁</button>
      </div>
    );
  }

  if (!me) {
    if (!info) return <div className="yz-loader">載入中…</div>;
    return (
      <div className="yz-join">
        <Calligraphy text="一字千金" size="sm" />
        <div className="yz-join-card">
          <div className="yz-join-code">
            賽局代碼 <b>{code}</b>
          </div>
          {info.can_join ? (
            <form onSubmit={handleJoin}>
              <label htmlFor="nickname">你的暱稱</label>
              <input
                id="nickname"
                className="yz-nick-input"
                value={nickname}
                onChange={(e) => setNickname(e.target.value.slice(0, 10))}
                placeholder="例如：小明"
                maxLength={10}
                autoComplete="off"
                autoFocus
              />
              <button type="submit" className="yz-btn primary big" disabled={joining || nickname.trim().length === 0}>
                {joining ? "加入中…" : "加入賽局 ✋"}
              </button>
              {joinError && <div className="yz-error">{joinError}</div>}
              <p className="yz-hint">目前 {info.player_count} / {info.max_players} 人</p>
            </form>
          ) : (
            <div className="yz-error">
              {info.player_count >= info.max_players ? "人數已滿（最多 10 人）" : "比賽已經開始，等下一輪再加入吧！"}
            </div>
          )}
        </div>
      </div>
    );
  }

  return <PlayerGame code={code} me={me} onLeave={() => { sessionStorage.removeItem(playerKey(code)); setMe(null); }} />;
}

// ---------------------------------------------------------------------------

interface GameProps {
  code: string;
  me: StoredPlayer;
  onLeave: () => void;
}

function PlayerGame({ code, me, onLeave }: GameProps) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [deadlineAt, setDeadlineAt] = useState(0);
  const [hasInk, setHasInk] = useState(false);
  const [localSubmitted, setLocalSubmitted] = useState<number | null>(null); // 已送出的題號
  const canvasRef = useRef<GridCanvasHandle>(null);
  const questionIndexRef = useRef<number>(-1);

  const url = useMemo(() => socketUrl(code, { role: "player", player_id: me.player_id }), [code, me.player_id]);

  const sendRef = useRef<(m: object) => boolean>(() => false);

  const submit = useCallback(() => {
    const idx = questionIndexRef.current;
    if (idx < 0) return;
    setLocalSubmitted((prev) => {
      if (prev === idx) return prev;
      const image = canvasRef.current?.getImage() ?? "";
      const ink = canvasRef.current?.hasInk() ?? false;
      sendRef.current({ type: "submit", image_data: image, has_ink: ink });
      return idx;
    });
  }, []);

  const onMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case "snapshot": {
          setSnap(msg);
          if (msg.status === "question" && msg.question) {
            const next = Date.now() + msg.question.remaining_ms;
            setDeadlineAt((prev) => (Math.abs(prev - next) > 500 ? next : prev));
            if (questionIndexRef.current !== msg.question.index) {
              questionIndexRef.current = msg.question.index;
              setLocalSubmitted(null);
              setHasInk(false);
              canvasRef.current?.clear();
            }
          }
          if (msg.status === "lobby" || msg.status === "finished") {
            questionIndexRef.current = -1;
          }
          break;
        }
        case "time_up":
          submit();
          break;
        default:
          break;
      }
    },
    [submit]
  );

  const { send, connected, fatal } = useGameSocket(url, onMessage);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const handleStroke = useCallback(
    (sid: number, pts: number[][], end: boolean) => {
      send({ type: "stroke", sid, pts, end });
    },
    [send]
  );
  const handleClear = useCallback(() => {
    send({ type: "clear" });
  }, [send]);

  if (fatal) {
    return (
      <div className="yz-center-card">
        <h2>無法連線：{fatal}</h2>
        <button type="button" className="yz-btn primary" onClick={onLeave}>重新加入</button>
      </div>
    );
  }

  if (!snap) return <div className="yz-loader">連線中…</div>;

  const myPublic = snap.players.find((p) => p.id === me.player_id);
  const submitted = (myPublic?.submitted ?? false) || (snap.question != null && localSubmitted === snap.question.index);
  const myResult = snap.question ? snap.results[me.player_id] : undefined;
  const myBoard = snap.leaderboard.find((b) => b.player_id === me.player_id);

  return (
    <div className="yz-player">
      <header className="yz-player-bar">
        <span className="yz-brand-mark small">一字千金</span>
        <span className="yz-player-me">
          <span className={`yz-dot${connected ? " on" : ""}`} />
          {me.nickname}
          {snap.you && <> · {snap.you.correct_count} 分</>}
        </span>
      </header>

      {snap.status === "lobby" && (
        <section className="yz-wait">
          <div className="yz-wait-emoji">🙌</div>
          <h2>已加入！等待老師開始</h2>
          <p className="yz-hint">目前 {snap.players.length} / {snap.max_players} 人</p>
          <ul className="yz-player-chips center">
            {snap.players.map((p) => (
              <li key={p.id} className={`yz-chip${p.id === me.player_id ? " is-me" : ""}`}>{p.nickname}</li>
            ))}
          </ul>
          <div className="yz-wait-tip">
            <b>怎麼玩？</b> 螢幕會出現一個藏著錯字的成語，請在九宮格裡寫出<b>正確的那個字</b>，每題 {snap.question_seconds} 秒。
          </div>
        </section>
      )}

      {snap.status === "question" && snap.question && (
        <section className="yz-play">
          <div className="yz-play-head">
            <span className="yz-q-index">第 {snap.question.index + 1} / {snap.question.total} 題</span>
            <Countdown deadlineAt={deadlineAt} totalSeconds={snap.question_seconds} variant="bar" onExpire={submit} />
          </div>
          <Calligraphy text={snap.question.display} size="md" />
          <p className="yz-play-prompt">找出錯字，寫出<b>正確的字</b> 👇</p>
          <div className={`yz-grid-wrap${submitted ? " is-locked" : ""}`}>
            <GridCanvas
              ref={canvasRef}
              disabled={submitted}
              onStroke={handleStroke}
              onClear={handleClear}
              onInkChange={setHasInk}
            />
            {submitted && (
              <div className="yz-grid-lock">
                <span>已送出 ✓</span>
                <small>等其他同學寫完…</small>
              </div>
            )}
          </div>
          <div className="yz-play-actions">
            <button type="button" className="yz-btn ghost" onClick={() => canvasRef.current?.clear()} disabled={submitted || !hasInk}>
              清除重寫
            </button>
            <button type="button" className="yz-btn primary" onClick={submit} disabled={submitted || !hasInk}>
              送出 ✓
            </button>
          </div>
        </section>
      )}

      {snap.status === "reveal" && snap.question && (
        <section className="yz-reveal">
          <div className={`yz-result-banner ${myResult?.is_correct ? "good" : "bad"}`}>
            {myResult?.is_correct ? (
              <>🎉 答對了！</>
            ) : myResult?.submitted ? (
              <>😅 答錯了{myResult.recognized ? `，你寫的是「${myResult.recognized}」` : ""}</>
            ) : (
              <>⏰ 這題沒有送出</>
            )}
          </div>
          <Calligraphy
            text={snap.question.display}
            size="md"
            reveal={
              snap.question.wrong_index != null && snap.question.correct_char
                ? { wrongIndex: snap.question.wrong_index, correctChar: snap.question.correct_char }
                : null
            }
          />
          <div className="yz-meaning">
            <b>{snap.question.idiom}</b>：{snap.question.meaning}
          </div>
          <p className="yz-hint">下一題馬上開始…</p>
        </section>
      )}

      {snap.status === "finished" && (
        <section className="yz-final">
          <div className="yz-my-result">
            <div className="yz-my-rank">第 {myBoard?.rank ?? "-"} 名</div>
            <div className="yz-my-acc">
              正確率 <b>{myBoard?.accuracy ?? 0}%</b>
              <small>（{myBoard?.correct_count ?? 0} / {myBoard?.total_questions ?? snap.total_questions} 題）</small>
            </div>
            <div className="yz-my-msg">{praise(myBoard?.accuracy ?? 0)}</div>
          </div>
          <Leaderboard entries={snap.leaderboard} highlightId={me.player_id} compact />
          {snap.you && snap.you.answers.length > 0 && (
            <div className="yz-answers">
              <h3>這一輪的題目</h3>
              <ul>
                {snap.you.answers.map((a) => (
                  <li key={a.index} className={a.is_correct ? "ok" : "ng"}>
                    <span className="yz-ans-mark">{a.is_correct ? "✓" : "✗"}</span>
                    <span className="yz-ans-idiom">
                      {Array.from(a.display).map((ch, i) => (
                        <span key={i} className={ch === a.wrong_char && a.idiom[i] !== ch ? "wrong" : ""}>{ch}</span>
                      ))}
                    </span>
                    <span className="yz-ans-correct">正確：{a.correct_char}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="yz-hint">老師按「再來一輪」後會自動開始新的一輪。</p>
        </section>
      )}
    </div>
  );
}

function praise(acc: number): string {
  if (acc === 100) return "太厲害了！全部答對！🏆";
  if (acc >= 80) return "表現很棒！繼續加油！🌟";
  if (acc >= 60) return "不錯喔！再練習會更好！👍";
  if (acc >= 40) return "加油！多練習幾次就會進步！💪";
  return "沒關係！下一輪再努力！📖";
}
