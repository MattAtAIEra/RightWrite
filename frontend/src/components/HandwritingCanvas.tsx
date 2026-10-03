import { useRef, useState, useEffect, useCallback } from "react";

interface Props {
  onSubmit: (imageData: string, drawnChar: string) => void;
  onCancel: () => void;
}

/** Fill the white ground and draw the 米字格 guide lines, in CSS-pixel space.
    Single source of truth so initial paint and 「清除重寫」 stay identical. */
function paintBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(178, 58, 46, 0.22)";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);

  // Horizontal + vertical centre, then the two diagonals.
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w, h);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(0, h);
  ctx.stroke();

  ctx.setLineDash([]);
}

export default function HandwritingCanvas({
  onSubmit,
  onCancel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  }, []);

  // Size the backing store and paint the guide grid. Uses clientWidth/Height
  // (the layout size) rather than getBoundingClientRect(): the dialog plays a
  // popIn scale() animation on mount, and getBoundingClientRect() reports the
  // mid-animation *scaled* size, which left the backing store too small and
  // made the grid + strokes jump on 「清除重寫」. The layout size is unaffected
  // by transforms, so it's already final even during the animation.
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // idempotent: reset + scale to CSS px
    paintBackground(ctx, w, h);
  }, []);

  useEffect(() => {
    setupCanvas();
  }, [setupCanvas]);

  const getPos = (
    e: React.MouseEvent | React.TouchEvent
  ): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();

    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getPos(e);
    if (!pos) return;
    const ctx = getCtx();
    if (!ctx) return;

    setIsDrawing(true);
    setHasDrawn(true);

    ctx.strokeStyle = "#2a241d";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;
    const pos = getPos(e);
    if (!pos) return;
    const ctx = getCtx();
    if (!ctx) return;

    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    // Re-run the exact same setup as mount — re-measures the (now settled)
    // size, resets the transform, and repaints the grid — so clearing can
    // never drift from the initial layout.
    setupCanvas();
    setHasDrawn(false);
  };

  const handleSubmit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const imageData = canvas.toDataURL("image/png");
    onSubmit(imageData, "");
  };

  return (
    <div className="canvas-overlay" onClick={onCancel}>
      <div className="canvas-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="canvas-header">
          <span>請寫出你認為正確的字</span>
        </div>

        <canvas
          ref={canvasRef}
          className="writing-canvas"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />

        <div className="canvas-actions">
          <button className="btn-clear" onClick={clearCanvas}>
            清除重寫
          </button>
          <button className="btn-cancel" onClick={onCancel}>
            取消
          </button>
          <button
            className="btn-submit"
            onClick={handleSubmit}
            disabled={!hasDrawn}
          >
            確定 ✓
          </button>
        </div>
      </div>
    </div>
  );
}
