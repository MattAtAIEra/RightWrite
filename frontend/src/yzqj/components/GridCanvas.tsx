import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from "react";
import { drawGrid, drawStroke } from "./gridDrawing";

export interface GridCanvasHandle {
  /** 匯出目前畫面（PNG data URL） */
  getImage(): string;
  /** 是否有畫過筆跡 */
  hasInk(): boolean;
  /** 清空畫面 */
  clear(): void;
}

interface Props {
  disabled?: boolean;
  /** 筆跡實況：座標已正規化成 0..1 */
  onStroke?: (sid: number, pts: number[][], end: boolean) => void;
  onClear?: () => void;
  onInkChange?: (hasInk: boolean) => void;
}

/**
 * 學生書寫用的九宮格。支援觸控、滑鼠、觸控筆（pointer events）。
 * 畫的同時把點以 40ms 為一批送出去，老師端就能即時看到筆跡。
 */
const GridCanvas = forwardRef<GridCanvasHandle, Props>(function GridCanvas(
  { disabled = false, onStroke, onClear, onInkChange },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef(300);
  const drawingRef = useRef(false);
  const strokeIdRef = useRef(0);
  const pendingRef = useRef<number[][]>([]);
  const lastPtRef = useRef<number[] | null>(null);
  const flushTimerRef = useRef<number | null>(null);
  const inkRef = useRef(false);
  const strokesRef = useRef<number[][][]>([]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const size = sizeRef.current;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);
    drawGrid(ctx, size);
    for (const pts of strokesRef.current) drawStroke(ctx, pts, size);
  }, []);

  // 依容器大小設定 canvas 解析度（高 DPI 螢幕才不會模糊）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const size = Math.round(rect.width);
      if (size <= 0) return;
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = size;
      canvas.width = size * dpr;
      canvas.height = size * dpr;
      redraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [redraw]);

  const flush = useCallback(
    (end: boolean) => {
      if (flushTimerRef.current) {
        window.clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      if (pendingRef.current.length === 0 && !end) return;
      const pts = pendingRef.current;
      pendingRef.current = [];
      onStroke?.(strokeIdRef.current, pts, end);
    },
    [onStroke]
  );

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = window.setTimeout(() => {
      flushTimerRef.current = null;
      flush(false);
    }, 40);
  }, [flush]);

  const toPoint = (e: React.PointerEvent): number[] | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return [Math.min(1, Math.max(0, +x.toFixed(4))), Math.min(1, Math.max(0, +y.toFixed(4)))];
  };

  const handleDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    const pt = toPoint(e);
    if (!pt) return;
    try {
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* 某些觸控瀏覽器不支援 capture，照常畫 */
    }
    drawingRef.current = true;
    strokeIdRef.current += 1;
    strokesRef.current.push([pt]);
    lastPtRef.current = pt;
    pendingRef.current = [pt];
    if (!inkRef.current) {
      inkRef.current = true;
      onInkChange?.(true);
    }
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) drawStroke(ctx, [pt], sizeRef.current);
    scheduleFlush();
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!drawingRef.current || disabled) return;
    e.preventDefault();
    const pt = toPoint(e);
    if (!pt) return;
    const last = lastPtRef.current;
    if (last && Math.abs(last[0] - pt[0]) < 0.002 && Math.abs(last[1] - pt[1]) < 0.002) return;
    const current = strokesRef.current[strokesRef.current.length - 1];
    current.push(pt);
    pendingRef.current.push(pt);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && last) drawStroke(ctx, [last, pt], sizeRef.current);
    lastPtRef.current = pt;
    scheduleFlush();
  };

  const handleUp = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    drawingRef.current = false;
    lastPtRef.current = null;
    flush(true);
  };

  const clear = useCallback(() => {
    strokesRef.current = [];
    pendingRef.current = [];
    drawingRef.current = false;
    if (inkRef.current) {
      inkRef.current = false;
      onInkChange?.(false);
    }
    redraw();
    onClear?.();
  }, [redraw, onClear, onInkChange]);

  useImperativeHandle(
    ref,
    () => ({
      getImage: () => {
        const canvas = canvasRef.current;
        if (!canvas) return "";
        // 送去辨識的圖不要有紅色格線：另外畫一張乾淨的
        const size = sizeRef.current;
        const off = document.createElement("canvas");
        off.width = size;
        off.height = size;
        const ctx = off.getContext("2d");
        if (!ctx) return canvas.toDataURL("image/png");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, size, size);
        for (const pts of strokesRef.current) drawStroke(ctx, pts, size);
        return off.toDataURL("image/png");
      },
      hasInk: () => inkRef.current,
      clear,
    }),
    [clear]
  );

  return (
    <canvas
      ref={canvasRef}
      className={`grid-canvas${disabled ? " is-disabled" : ""}`}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onPointerLeave={handleUp}
      onLostPointerCapture={handleUp}
      aria-label="九宮格書寫區"
    />
  );
});

export default GridCanvas;
