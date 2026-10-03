import { memo, useEffect, useRef } from "react";
import type { Stroke } from "../types";
import { drawGrid, drawStroke } from "./gridDrawing";

interface Props {
  strokes: Stroke[];
  size?: number;
}

/** 老師監看畫面上的小九宮格：把學生傳來的筆跡即時畫出來。 */
function MiniGrid({ strokes, size = 150 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    // 寬高都要檢查：<canvas> 預設是 300×150，size=150、dpr=2 時寬度剛好等於 300，
    // 只比寬度會跳過設定，height 留在 150，畫面就會被垂直拉長兩倍、下半截看不到。
    const px = Math.round(size * dpr);
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    drawGrid(ctx, size);
    for (const s of strokes) drawStroke(ctx, s.pts, size);
  }, [strokes, size]);

  return <canvas ref={canvasRef} className="mini-grid" style={{ width: size, height: size }} />;
}

export default memo(MiniGrid);
