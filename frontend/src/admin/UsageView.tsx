import { useCallback, useEffect, useState } from "react";
import { fetchUsage, type UsageResponse } from "./api";

/** 使用次數分佈儀錶板：今天的數字、最近 30 天的長條圖、每天的表、今天用量最高的 session。 */
export default function UsageView() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  const load = useCallback(async (n: number) => {
    try {
      setData(await fetchUsage(n));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "讀取失敗");
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [load, days]);

  if (error) return <div className="yz-error">{error}</div>;
  if (!data) return <div className="yz-loader">載入中…</div>;

  const t = data.today;
  return (
    <div className="ad-usage">
      <header className="yz-admin-head">
        <div>
          <h1>使用次數分佈</h1>
          <p className="yz-hint">
            每個瀏覽器 session 一天最多：改錯字神器 {data.limits.rw} 次辨識、一字千金 {data.limits.yz} 次辨識；
            同一個 IP 一天最多開 {data.limits.sessions_per_ip} 個 session。台北時間計日。
          </p>
        </div>
        <div className="yz-admin-links">
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="天數" className="ad-select">
            <option value={7}>最近 7 天</option>
            <option value={30}>最近 30 天</option>
            <option value={90}>最近 90 天</option>
          </select>
          <button type="button" className="yz-btn ghost" onClick={() => void load(days)}>重新整理</button>
        </div>
      </header>

      <div className="ad-tiles">
        <Tile label="今天 改錯字辨識" value={t.rw_recognitions} sub={`${t.rw_sessions} 個 session`} />
        <Tile label="今天 一字千金辨識" value={t.yz_recognitions} sub={`${t.yz_sessions} 個 session`} />
        <Tile label="今天 額度擋下" value={t.quota_hits} sub="超過每日額度的請求" tone={t.quota_hits ? "warn" : ""} />
        <Tile label="今天 bot 擋下" value={t.bot_blocked + t.session_limit_blocked} sub={`UA ${t.bot_blocked}、同 IP 開太多 ${t.session_limit_blocked}`} tone={t.bot_blocked + t.session_limit_blocked ? "warn" : ""} />
        <Tile label={`${days} 天合計辨識`} value={data.totals.rw_recognitions + data.totals.yz_recognitions} sub={`改錯字 ${data.totals.rw_recognitions}、一字千金 ${data.totals.yz_recognitions}`} />
      </div>

      <section className="ad-card">
        <h2>每天的辨識次數</h2>
        <BarChart days={data.days} />
      </section>

      <section className="ad-card">
        <h2>每天的數字</h2>
        <div className="yz-table-wrap">
          <table className="yz-table ad-table">
            <thead>
              <tr>
                <th>日期</th>
                <th>改錯字辨識</th>
                <th>改錯字 session</th>
                <th>一字千金辨識</th>
                <th>一字千金 session</th>
                <th>額度擋下</th>
                <th>bot 擋下</th>
              </tr>
            </thead>
            <tbody>
              {[...data.days].reverse().map((d) => (
                <tr key={d.day} className={d.rw_recognitions + d.yz_recognitions === 0 ? "is-empty" : ""}>
                  <td className="mono">{d.day}</td>
                  <td>{d.rw_recognitions}</td>
                  <td>{d.rw_sessions}</td>
                  <td>{d.yz_recognitions}</td>
                  <td>{d.yz_sessions}</td>
                  <td>{d.quota_hits || "—"}</td>
                  <td>{d.bot_blocked + d.session_limit_blocked || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ad-card">
        <h2>今天用量最高的 session</h2>
        {t.top_sessions.length === 0 ? (
          <p className="yz-hint">今天還沒有人用。</p>
        ) : (
          <div className="yz-table-wrap">
            <table className="yz-table ad-table">
              <thead>
                <tr>
                  <th>session</th>
                  <th>IP</th>
                  <th>改錯字</th>
                  <th>一字千金</th>
                  <th>第一次使用</th>
                </tr>
              </thead>
              <tbody>
                {t.top_sessions.map((s) => (
                  <tr key={s.sid + s.first}>
                    <td className="mono">{s.sid}…</td>
                    <td className="mono">{s.ip || "—"}</td>
                    <td>{s.rw} / {data.limits.rw}</td>
                    <td>{s.yz} / {data.limits.yz}</td>
                    <td className="mono">{s.first.replace("T", " ").slice(0, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, sub, tone = "" }: { label: string; value: number; sub?: string; tone?: string }) {
  return (
    <div className={`ad-tile${tone ? ` ${tone}` : ""}`}>
      <span className="ad-tile-label">{label}</span>
      <b className="ad-tile-value">{value}</b>
      {sub && <span className="ad-tile-sub">{sub}</span>}
    </div>
  );
}

/** 手刻的 SVG 長條圖：每天兩根（改錯字、一字千金），不用圖表套件。 */
function BarChart({ days }: { days: UsageResponse["days"] }) {
  const W = 900;
  const H = 240;
  const padL = 40;
  const padB = 28;
  const padT = 12;
  const max = Math.max(1, ...days.map((d) => Math.max(d.rw_recognitions, d.yz_recognitions)));
  const innerW = W - padL - 12;
  const innerH = H - padT - padB;
  const slot = innerW / days.length;
  const bw = Math.max(2, Math.min(14, slot * 0.36));
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const ticks = [0, Math.round(max / 2), max];
  const labelEvery = days.length > 14 ? Math.ceil(days.length / 10) : 1;

  return (
    <div className="ad-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="每天的辨識次數">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} x2={W - 12} y1={y(v)} y2={y(v)} className="ad-grid" />
            <text x={padL - 6} y={y(v) + 4} textAnchor="end" className="ad-axis">{v}</text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = padL + slot * i + slot / 2;
          return (
            <g key={d.day}>
              <title>{`${d.day}：改錯字 ${d.rw_recognitions}、一字千金 ${d.yz_recognitions}`}</title>
              <rect x={cx - bw - 1} y={y(d.rw_recognitions)} width={bw} height={padT + innerH - y(d.rw_recognitions)} className="ad-bar-rw" rx="2" />
              <rect x={cx + 1} y={y(d.yz_recognitions)} width={bw} height={padT + innerH - y(d.yz_recognitions)} className="ad-bar-yz" rx="2" />
              {i % labelEvery === 0 && (
                <text x={cx} y={H - 8} textAnchor="middle" className="ad-axis">{d.day.slice(5)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="ad-legend">
        <span><i className="ad-swatch rw" />改錯字神器</span>
        <span><i className="ad-swatch yz" />一字千金</span>
      </div>
    </div>
  );
}
