import { useEffect, useState } from "react";
import type { AnswerResult } from "./ArticlePractice";

interface Props {
  results: AnswerResult[];
  onRetry: () => void;
  onBack: () => void;
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

  const wrongCharResults = results.filter((r) => r.type === "found_wrong" || r.type === "missed");
  const falseAlarms = results.filter((r) => r.type === "false_alarm");

  const correctCount = wrongCharResults.filter((r) => r.isCorrect).length;
  const totalWrong = wrongCharResults.length;
  const denominator = totalWrong + falseAlarms.length;
  const accuracy = denominator > 0 ? Math.round((correctCount / denominator) * 100) : 0;

  // Trigger confetti on perfect score
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
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="#dfe6e9"
              strokeWidth="8"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={circleColor}
              strokeWidth="8"
              strokeDasharray={`${accuracy * 2.83} ${283 - accuracy * 2.83}`}
              strokeDashoffset="70.75"
              strokeLinecap="round"
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
                {r.type === "found_wrong" && r.userAnswer && (
                  <>
                    <span className={`user-answer-display ${r.isCorrect ? "correct" : "incorrect"}`}>
                      {r.userAnswer}
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
                )}
                {(r.type === "missed" || !r.userAnswer) && (
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
              </div>
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
                    <span className="wrong-display">
                      {r.userAnswer}
                      <small>（誤改為）</small>
                    </span>
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
