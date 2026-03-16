import type { AnswerResult } from "./ArticlePractice";

interface Props {
  results: AnswerResult[];
  onRetry: () => void;
  onBack: () => void;
}

export default function ResultView({ results, onRetry, onBack }: Props) {
  // Separate by type
  const wrongCharResults = results.filter((r) => r.type === "found_wrong" || r.type === "missed");
  const falseAlarms = results.filter((r) => r.type === "false_alarm");

  // Scoring: 正確率 = 正確找到錯字數 / (總錯字數 + 誤判數)
  const correctCount = wrongCharResults.filter((r) => r.isCorrect).length;
  const totalWrong = wrongCharResults.length;
  const denominator = totalWrong + falseAlarms.length;
  const accuracy = denominator > 0 ? Math.round((correctCount / denominator) * 100) : 0;

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

  return (
    <div className="result-container">
      <div className="result-header">
        <div className="result-emoji">{getEmoji(accuracy)}</div>
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
              stroke="#e0e0e0"
              strokeWidth="8"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke={accuracy >= 60 ? "#4caf50" : "#ff9800"}
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
                <span className="correct-display">
                  {r.correctChar}
                  <small>（正確）</small>
                </span>
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
