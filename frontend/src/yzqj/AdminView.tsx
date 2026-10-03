import { useCallback, useEffect, useState } from "react";
import { fetchAdminGames, fetchAdminStatus } from "./api";
import type { AdminGame, AdminGamesResponse } from "./types";
import { formatSeconds } from "./format";

const TOKEN_KEY = "yzqj_admin_token";

function fmtTime(ts: number | null): string {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("zh-TW", { hour12: false });
}

const STATUS_LABEL: Record<string, string> = {
  lobby: "等待開始",
  question: "進行中",
  reveal: "進行中",
  finished: "已結束",
};

export default function AdminView() {
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? "");
  const [data, setData] = useState<AdminGamesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminStatus()
      .then((s) => setAuthRequired(s.auth_required))
      .catch(() => setAuthRequired(false));
  }, []);

  const load = useCallback(async (tok: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminGames(tok);
      setData(res);
      sessionStorage.setItem(TOKEN_KEY, tok);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "讀取失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authRequired === null) return;
    if (!authRequired || token) void load(token);
  }, [authRequired, load]); // eslint-disable-line react-hooks/exhaustive-deps

  if (authRequired === null) return <div className="yz-loader">載入中…</div>;

  return (
    <div className="yz-admin">
      <header className="yz-admin-head">
        <div>
          <h1>一字千金 · 成績後台</h1>
          <p className="yz-hint">每一場賽局的參加者、IP、答題結果與排名。</p>
        </div>
        <a href="/yzqj" className="yz-btn ghost">回一字千金</a>
      </header>

      {authRequired && (
        <form
          className="yz-admin-auth"
          onSubmit={(e) => {
            e.preventDefault();
            void load(token);
          }}
        >
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="後台密碼"
            aria-label="後台密碼"
          />
          <button type="submit" className="yz-btn primary" disabled={loading}>
            {loading ? "讀取中…" : "查詢"}
          </button>
        </form>
      )}

      {error && <div className="yz-error">{error}</div>}

      {data && (
        <>
          <div className="yz-admin-stats">
            <div><b>{data.stats.games}</b><span>場賽局</span></div>
            <div><b>{data.stats.finished_games}</b><span>場已結束</span></div>
            <div><b>{data.stats.players}</b><span>人次參加</span></div>
            <div><b>{data.live_games}</b><span>場在記憶體中</span></div>
            <button type="button" className="yz-btn ghost" onClick={() => void load(token)} disabled={loading}>重新整理</button>
          </div>

          {data.games.length === 0 && <p className="yz-hint">還沒有任何賽局紀錄。</p>}

          <div className="yz-admin-list">
            {data.games.map((g) => (
              <GameRow key={g.code} game={g} open={open === g.code} onToggle={() => setOpen(open === g.code ? null : g.code)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function GameRow({ game, open, onToggle }: { game: AdminGame; open: boolean; onToggle: () => void }) {
  const rounds = Array.from(new Set(game.players.map((p) => p.round))).sort((a, b) => a - b);
  return (
    <div className={`yz-admin-game${open ? " is-open" : ""}`}>
      <button type="button" className="yz-admin-game-head" onClick={onToggle}>
        <span className="yz-admin-code">{game.code}</span>
        <span className={`yz-admin-status s-${game.status}`}>{STATUS_LABEL[game.status] ?? game.status}{game.live ? "" : " · 已回收"}</span>
        <span>{fmtTime(game.created_at)}</span>
        <span>{game.players.length} 人次</span>
        <span>老師 IP：{game.host_ip || "—"}</span>
        <span className="yz-admin-caret">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="yz-admin-game-body">
          {rounds.map((round) => {
            const players = game.players.filter((p) => p.round === round);
            return (
              <div key={round} className="yz-admin-round">
                <h4>第 {round} 輪</h4>
                <div className="yz-table-wrap">
                  <table className="yz-table">
                    <thead>
                      <tr>
                        <th>排名</th>
                        <th>暱稱</th>
                        <th>IP</th>
                        <th>加入時間</th>
                        <th>答對</th>
                        <th>正確率</th>
                        <th>總用時</th>
                        <th>各題結果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((p) => (
                        <tr key={p.id}>
                          <td>{p.rank ?? "—"}</td>
                          <td>{p.nickname}</td>
                          <td className="mono">{p.ip || "—"}</td>
                          <td>{fmtTime(p.joined_at)}</td>
                          <td>{p.correct_count} / {p.total_questions}</td>
                          <td>{p.total_questions ? `${p.accuracy}%` : "—"}</td>
                          <td>{p.total_questions ? formatSeconds(p.total_ms) : "—"}</td>
                          <td className="yz-answer-cells">
                            {p.answers.map((a) => (
                              <span
                                key={a.index}
                                className={a.is_correct ? "ok" : "ng"}
                                title={`${a.display} → ${a.idiom}；辨識為「${a.recognized || "（空白）"}」；${a.engine === "vision" ? "Vision 辨識" : a.engine === "fallback" ? "備援模式" : "未作答"}`}
                              >
                                {a.correct_char}
                                {a.is_correct ? "✓" : "✗"}
                              </span>
                            ))}
                            {p.answers.length === 0 && <span className="yz-hint">尚無作答</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {game.questions.length > 0 && (
            <div className="yz-admin-questions">
              <h4>最後一輪的題目</h4>
              <ul>
                {game.questions.map((q, i) => (
                  <li key={i}>
                    <b>{q.display}</b> → {q.idiom}（錯字「{q.wrong_char}」應為「{q.correct_char}」）
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
