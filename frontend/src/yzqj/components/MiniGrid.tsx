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
    if (canvas.width !== size * dpr) {
      canvas.width = size * dpr;
      canvas.height = size * dpr;
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
