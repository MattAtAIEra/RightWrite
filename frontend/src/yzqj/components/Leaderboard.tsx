import type { LeaderboardEntry } from "../types";
import { formatSeconds } from "../format";

interface Props {
  entries: LeaderboardEntry[];
  highlightId?: string;
  compact?: boolean;
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** 名次榜：前三名有獎牌與頒獎台動畫，其餘列表呈現。 */
export default function Leaderboard({ entries, highlightId, compact = false }: Props) {
  const top = entries.filter((e) => e.rank <= 3).slice(0, 3);
  const rest = entries.filter((e) => !top.includes(e));
  // 頒獎台順序：第 2 名、第 1 名、第 3 名
  const podium = [top[1], top[0], top[2]].filter(Boolean) as LeaderboardEntry[];

  return (
    <div className={`leaderboard${compact ? " is-compact" : ""}`}>
      {!compact && podium.length > 0 && (
        <div className="podium">
          {podium.map((e) => (
            <div
              key={e.player_id}
              className={`podium-slot rank-${e.rank}${e.player_id === highlightId ? " is-me" : ""}`}
            >
              <div className="podium-medal">{MEDALS[e.rank - 1] ?? "🏅"}</div>
              <div className="podium-name">{e.nickname}</div>
              <div className="podium-score">
                {e.correct_count} / {e.total_questions} 題
              </div>
              <div className="podium-block">
                <span>{e.accuracy}%</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <ol className="board-list">
        {(compact ? entries : rest).map((e, i) => (
          <li
            key={e.player_id}
            className={`board-row${e.player_id === highlightId ? " is-me" : ""}`}
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <span className="board-rank">{e.rank <= 3 ? MEDALS[e.rank - 1] : e.rank}</span>
            <span className="board-name">{e.nickname}</span>
            <span className="board-score">
              {e.correct_count} / {e.total_questions}
            </span>
            <span className="board-acc">{e.accuracy}%</span>
            <span className="board-time">{formatSeconds(e.total_ms)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
