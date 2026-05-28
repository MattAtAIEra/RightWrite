// src/dashboard/MistakeTrendChart.tsx
import { useState } from "react";
import type { TrendPoint } from "./derive";

type Window = "recent7" | "recent30days" | "all";

const DAY = 86400_000;

function filterPoints(points: TrendPoint[], window: Window): TrendPoint[] {
  if (window === "all") return points;
  if (window === "recent7") return points.slice(-7);
  const cutoff = Date.now() - 30 * DAY;
  return points.filter((p) => p.startedAt >= cutoff);
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// Geometry for the hand-rolled SVG chart (viewBox units; scales via width:100%).
const W = 600;
const H = 220;
const PAD_L = 40;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 28;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;
const Y_TICKS = [0, 25, 50, 75, 100];

function xFor(i: number, n: number): number {
  if (n <= 1) return PAD_L + PLOT_W / 2;
  return PAD_L + (i / (n - 1)) * PLOT_W;
}

function yFor(accuracy: number): number {
  return PAD_T + (1 - accuracy / 100) * PLOT_H;
}

export default function MistakeTrendChart({ points }: { points: TrendPoint[] }) {
  const [window, setWindow] = useState<Window>("recent7");
  const filtered = filterPoints(points, window);
  const n = filtered.length;

  // Thin x-axis labels so they don't overlap when there are many points.
  const labelStep = n <= 8 ? 1 : Math.ceil(n / 6);
  const showValueLabels = n > 0 && n <= 8;

  const linePoints = filtered
    .map((p, i) => `${xFor(i, n).toFixed(1)},${yFor(p.accuracy).toFixed(1)}`)
    .join(" ");

  return (
    <div className="trend-chart-card">
      <div className="trend-chart-header">
        <h3>正確率趨勢</h3>
        <select value={window} onChange={(e) => setWindow(e.target.value as Window)}>
          <option value="recent7">近 7 次</option>
          <option value="recent30days">近 30 天</option>
          <option value="all">全部</option>
        </select>
      </div>
      {n === 0 ? (
        <p className="empty-hint">還沒有資料，再多練幾次就會看到趨勢圖!</p>
      ) : (
        <svg
          className="trend-chart-svg"
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label="正確率趨勢折線圖"
        >
          {/* horizontal grid + y labels */}
          {Y_TICKS.map((v) => {
            const y = yFor(v);
            return (
              <g key={v}>
                <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#eee" strokeWidth={1} />
                <text x={PAD_L - 6} y={y + 4} textAnchor="end" fontSize={12} fill="#888">
                  {v}%
                </text>
              </g>
            );
          })}

          {/* the trend line (omit for a single point — a lone dot reads fine) */}
          {n > 1 && (
            <polyline
              points={linePoints}
              fill="none"
              stroke="#ff6b6b"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* dots, x labels, optional value labels */}
          {filtered.map((p, i) => {
            const cx = xFor(i, n);
            const cy = yFor(p.accuracy);
            return (
              <g key={p.startedAt}>
                <circle cx={cx} cy={cy} r={4} fill="#ff6b6b" />
                {showValueLabels && (
                  <text x={cx} y={cy - 10} textAnchor="middle" fontSize={11} fill="#ff6b6b">
                    {p.accuracy}%
                  </text>
                )}
                {i % labelStep === 0 && (
                  <text x={cx} y={H - 8} textAnchor="middle" fontSize={12} fill="#888">
                    {formatDate(p.startedAt)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
