// src/dashboard/MistakeTrendChart.tsx
import { useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
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

export default function MistakeTrendChart({ points }: { points: TrendPoint[] }) {
  const [window, setWindow] = useState<Window>("recent7");
  const filtered = filterPoints(points, window);

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
      {filtered.length === 0 ? (
        <p className="empty-hint">還沒有資料，再多練幾次就會看到趨勢圖!</p>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={filtered} margin={{ top: 12, right: 12, bottom: 12, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="startedAt" tickFormatter={formatDate} fontSize={12} />
            <YAxis domain={[0, 100]} fontSize={12} unit="%" />
            <Tooltip
              labelFormatter={(ts) => new Date(ts as number).toLocaleString()}
              formatter={(val) => [`${val}%`, "正確率"]}
            />
            <Line type="monotone" dataKey="accuracy" stroke="#ff6b6b" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
