import { useEffect, useState, useRef, useCallback } from "react";
import type { AnswerResult } from "./ArticlePractice";
import { recognizeHandwriting } from "../api";

interface Props {
  results: AnswerResult[];
  onRetry: () => void;
  onBack: () => void;
}

/** Inline practice canvas for 訂正 — write the correct char, then validate via recognition API */
function CorrectionCanvas({ correctChar, onClose }: { correctChar: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<null | { correct: boolean; recognized: string }>(null);

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    // Draw grid
    ctx.strokeStyle = "#e0e0e0";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, rect.height / 2);
    ctx.lineTo(rect.width, rect.height / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(rect.width / 2, 0);
    ctx.lineTo(rect.width / 2, rect.height);
    ctx.stroke();
    ctx.setLineDash([]);
  }, []);

  useEffect(() => { initCanvas(); }, [initCanvas]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const pos = getPos(e);
    if (!pos) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    setHasDrawn(true);
    setVerifyResult(null);
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
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(false);
  };

  const handleClear = () => {
    initCanvas();
    setHasDrawn(false);
    setVerifyResult(null);
  };

  const handleVerify = async () => {
    const canvas = canvasRef.current;
    if (!canvas || verifying) return;
    setVerifying(true);
    try {
      const imageData = canvas.toDataURL("image/png");
      const res = await recognizeHandwriting(imageData, correctChar);
      setVerifyResult({ correct: res.is_correct, recognized: res.recognized_char });
    } catch (err) {
      setVerifyResult({ correct: false, recognized: "?" });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="correction-canvas-wrapper">
      <div className="correction-header">
        <span className="correction-target">請寫：<strong>{correctChar}</strong></span>
        <button className="correction-close" onClick={onClose}>關閉</button>
      </div>
      <p className="correction-tip">✏️ 請用工整的筆順來書寫，不要潦草，影響判斷</p>
      <canvas
        ref={canvasRef}
        className="correction-canvas"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
      <div className="correction-actions">
        <button className="correction-clear" onClick={handleClear}>清除重寫</button>
        <button
          className="correction-verify"
          onClick={handleVerify}
          disabled={!hasDrawn || verifying}
        >
          {verifying ? "判斷中…" : "驗證 ✓"}
        </button>
      </div>
      {verifyResult && (
        <div className={`correction-feedback ${verifyResult.correct ? "ok" : "no"}`}>
          {verifyResult.correct
            ? "🎉 太棒了，寫對了！"
            : "再試一次！記得工整書寫喔～"}
        </div>
      )}
    </div>
  );
}

function ConfettiCelebration() {
  const [particles] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 1.5 + Math.random() * 1.5,
      size: 6 + Math.random() * 8,
      color: ["#ff6b6b", "#4ecdc4", "#ffe66d", "#ffa94d", "#51cf66", "#ff8e8e"][
        Math.floor(Math.random() * 6)
      ],
      drift: -30 + Math.random() * 60,
      rotation: Math.random() * 360,
    }))
  );

  return (
    <div className="confetti-container" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            left: `${p.x}%`,
            width: `${p.size}px`,
            height: `${p.size * 0.6}px`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            ["--drift" as string]: `${p.drift}px`,
            ["--rotation" as string]: `${p.rotation}deg`,
          }}
        />
      ))}
    </div>
  );
}

function CelebrationStars({ accuracy }: { accuracy: number }) {
  if (accuracy < 60) return null;
  return (
    <svg
      viewBox="0 0 300 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: "240px", margin: "0 auto 4px", display: "block", overflow: "visible" }}
    >
      <g opacity="0.8">
        <path d="M40 30l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#ffe66d">
          <animateTransform attributeName="transform" type="rotate" values="0 40 35;360 40 35" dur="6s" repeatCount="indefinite" />
        </path>
        <path d="M150 15l4 8 8 1-6 6 1 8-7-4-7 4 1-8-6-6 8-1z" fill="#ff6b6b">
          <animateTransform attributeName="transform" type="rotate" values="0 150 22;-360 150 22" dur="8s" repeatCount="indefinite" />
        </path>
        <path d="M260 28l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#4ecdc4">
          <animateTransform attributeName="transform" type="rotate" values="0 260 33;360 260 33" dur="7s" repeatCount="indefinite" />
        </path>
        <circle cx="90" cy="25" r="4" fill="#ffa94d" opacity="0.6">
          <animate attributeName="r" values="4;6;4" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx="210" cy="20" r="3" fill="#ff6b6b" opacity="0.6">
          <animate attributeName="r" values="3;5;3" dur="2.5s" repeatCount="indefinite" />
        </circle>
      </g>
    </svg>
  );
}

export default function ResultView({ results, onRetry, onBack }: Props) {
  const [showConfetti, setShowConfetti] = useState(false);
  const [correctionTarget, setCorrectionTarget] = useState<string | null>(null);

  const wrongCharResults = results.filter((r) => r.type === "found_wrong" || r.type === "missed");
  const falseAlarms = results.filter((r) => r.type === "false_alarm");

  const correctCount = wrongCharResults.filter((r) => r.isCorrect).length;
  const totalWrong = wrongCharResults.length;
  const denominator = totalWrong + falseAlarms.length;
  const accuracy = denominator > 0 ? Math.round((correctCount / denominator) * 100) : 0;

  useEffect(() => {
    if (accuracy === 100) {
      setShowConfetti(true);
      const timer = setTimeout(() => setShowConfetti(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [accuracy]);

  const getEmoji = (acc: number) => {
    if (acc === 100) return "🏆";
    if (acc >= 80) return "🌟";
    if (acc >= 60) return "👍";
    if (acc >= 40) return "💪";
    return "📖";
  };

  const getMessage = (acc: number) => {
    if (acc === 100) return "太厲害了！全部答對！";
    if (acc >= 80) return "表現很棒！繼續加油！";
    if (acc >= 60) return "不錯喔！再練習會更好！";
    if (acc >= 40) return "加油！多練習幾次就會進步！";
    return "沒關係！我們再練習一次吧！";
  };

  const getStatusLabel = (r: AnswerResult) => {
    if (r.type === "missed") return "✗ 未找到";
    if (r.isCorrect) return "✓ 答對";
    return "✗ 答錯";
  };

  const circleColor = accuracy >= 60 ? "#51cf66" : "#ffa94d";

  return (
    <div className="result-container">
      {showConfetti && <ConfettiCelebration />}

      <div className="result-header">
        <CelebrationStars accuracy={accuracy} />
        <div className={`result-emoji ${accuracy === 100 ? "perfect-bounce" : ""}`}>
          {getEmoji(accuracy)}
        </div>
        {accuracy === 100 && (
          <div className="perfect-banner">恭喜全對</div>
        )}
        <h2>{getMessage(accuracy)}</h2>
      </div>

      <div className="accuracy-display">
        <div className="accuracy-circle">
          <svg viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#dfe6e9" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="45" fill="none"
              stroke={circleColor} strokeWidth="8"
              strokeDasharray={`${accuracy * 2.83} ${283 - accuracy * 2.83}`}
              strokeDashoffset="70.75" strokeLinecap="round"
              transform="rotate(-90 50 50)"
            />
          </svg>
          <div className="accuracy-text">
            <span className="accuracy-number">{accuracy}</span>
            <span className="accuracy-percent">%</span>
          </div>
        </div>
        <div className="accuracy-detail">
          找對 {correctCount} / {totalWrong} 個錯字
          {falseAlarms.length > 0 && (
            <span className="false-alarm-count">，誤判 {falseAlarms.length} 個</span>
          )}
        </div>
      </div>

      <div className="result-details">
        <h3>錯字訂正</h3>
        <div className="result-list">
          {wrongCharResults.map((r, i) => (
            <div
              key={`w-${i}`}
              className={`result-item ${r.isCorrect ? "correct" : "incorrect"}`}
            >
              <div className="result-chars">
                <span className="wrong-display">
                  {r.wrongChar}
                  <small>（錯字）</small>
                </span>
                <span className="arrow">→</span>
                {r.type === "found_wrong" && r.imageData ? (
                  <>
                    <span className="user-handwriting">
                      <img src={r.imageData} alt="手寫" className="handwriting-img" />
                      <small>（你寫的）</small>
                    </span>
                    {!r.isCorrect && (
                      <>
                        <span className="arrow">→</span>
                        <span className="correct-display">
                          {r.correctChar}
                          <small>（正確）</small>
                        </span>
                      </>
                    )}
                  </>
                ) : (
                  <span className="correct-display">
                    {r.correctChar}
                    <small>（正確）</small>
                  </span>
                )}
              </div>
              <div className="result-meta">
                <span className="lesson-tag">
                  第{r.lesson}課 {r.lessonTitle}
                </span>
                <span className={`status-tag ${r.isCorrect ? "pass" : "fail"}`}>
                  {getStatusLabel(r)}
                </span>
                {!r.isCorrect && r.type !== "missed" && (
                  <button
                    className="correction-btn"
                    onClick={() => setCorrectionTarget(
                      correctionTarget === `${i}` ? null : `${i}`
                    )}
                  >
                    {correctionTarget === `${i}` ? "收起" : "訂正"}
                  </button>
                )}
              </div>
              {correctionTarget === `${i}` && (
                <CorrectionCanvas
                  correctChar={r.correctChar}
                  onClose={() => setCorrectionTarget(null)}
                />
              )}
            </div>
          ))}
        </div>

        {falseAlarms.length > 0 && (
          <>
            <h3 className="false-alarm-title">誤判紀錄（把對的字改錯）</h3>
            <div className="result-list">
              {falseAlarms.map((r, i) => (
                <div key={`fa-${i}`} className="result-item incorrect false-alarm-item">
                  <div className="result-chars">
                    <span className="correct-display">
                      {r.correctChar}
                      <small>（原本正確）</small>
                    </span>
                    <span className="arrow">→</span>
                    {r.imageData ? (
                      <span className="user-handwriting">
                        <img src={r.imageData} alt="手寫" className="handwriting-img" />
                        <small>（誤改為）</small>
                      </span>
                    ) : (
                      <span className="wrong-display">
                        {r.userAnswer}
                        <small>（誤改為）</small>
                      </span>
                    )}
                  </div>
                  <div className="result-meta">
                    <span className={`status-tag fail`}>✗ 誤判扣分</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="result-actions">
        <button className="retry-btn" onClick={onRetry}>
          再練習一次
        </button>
        <button className="home-btn" onClick={onBack}>
          回到首頁
        </button>
      </div>
    </div>
  );
}
