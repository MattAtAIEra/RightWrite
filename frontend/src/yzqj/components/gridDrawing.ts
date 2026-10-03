/** 九宮格與筆跡的繪圖工具，學生端的 GridCanvas 與老師端的 MiniGrid 共用。 */

export const INK_COLOR = "#1f1f1f";
export const GRID_LINE = "rgba(224, 122, 95, 0.45)";
export const GRID_BORDER = "#e07a5f";
export const PAPER = "#fffdf6";

/** 畫九宮格底圖（寬高相同，單位為 CSS px） */
export function drawGrid(ctx: CanvasRenderingContext2D, size: number) {
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = GRID_LINE;
  ctx.lineWidth = Math.max(1, size / 200);
  ctx.setLineDash([size / 40, size / 60]);
  for (let i = 1; i < 3; i++) {
    const p = (size / 3) * i;
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, p);
    ctx.lineTo(size, p);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.strokeStyle = GRID_BORDER;
  ctx.lineWidth = Math.max(2, size / 90);
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
  ctx.restore();
}

/** 把一筆正規化座標的筆跡畫到 canvas 上 */
export function drawStroke(ctx: CanvasRenderingContext2D, pts: number[][], size: number) {
  if (pts.length === 0) return;
  ctx.save();
  ctx.strokeStyle = INK_COLOR;
  ctx.lineWidth = Math.max(3, size / 28);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0][0] * size, pts[0][1] * size);
  if (pts.length === 1) {
    ctx.lineTo(pts[0][0] * size + 0.1, pts[0][1] * size + 0.1);
  }
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i][0] * size, pts[i][1] * size);
  }
  ctx.stroke();
  ctx.restore();
}
