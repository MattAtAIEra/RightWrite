import { useRef, useState, useEffect, useCallback } from "react";

interface Props {
  expectedChar: string;
  onSubmit: (imageData: string, drawnChar: string) => void;
  onCancel: () => void;
}

export default function HandwritingCanvas({
  expectedChar,
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size for high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    // Fill white background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);

    // Draw grid lines (like 九宮格)
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);

    // Horizontal center
    ctx.beginPath();
    ctx.moveTo(0, rect.height / 2);
    ctx.lineTo(rect.width, rect.height / 2);
    ctx.stroke();

    // Vertical center
    ctx.beginPath();
    ctx.moveTo(rect.width / 2, 0);
    ctx.lineTo(rect.width / 2, rect.height);
    ctx.stroke();

    // Diagonals
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(rect.width, rect.height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(rect.width, 0);
    ctx.lineTo(0, rect.height);
    ctx.stroke();

    ctx.setLineDash([]);
  }, []);

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

    ctx.strokeStyle = "#333333";
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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width * dpr, rect.height * dpr);

    // Redraw grid
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(0, rect.height / 2);
    ctx.lineTo(rect.width, rect.height / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rect.width / 2, 0);
    ctx.lineTo(rect.width / 2, rect.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(rect.width, rect.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rect.width, 0);
    ctx.lineTo(0, rect.height);
    ctx.stroke();
    ctx.setLineDash([]);

    setHasDrawn(false);
  };

  const handleSubmit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const imageData = canvas.toDataURL("image/png");
    onSubmit(imageData, expectedChar);
  };

  return (
    <div className="canvas-overlay" onClick={onCancel}>
      <div className="canvas-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="canvas-header">
          <span>請寫出正確的字</span>
          <span className="expected-hint">（提示：找出正確的字來替換）</span>
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
