import { useEffect, useState } from "react";
import type { ArticleResponse, WrongChar } from "../types";
import { generateArticle, recognizeHandwriting } from "../api";
import HandwritingCanvas from "./HandwritingCanvas";

interface Props {
  startLesson: number;
  endLesson: number;
  onFinish: (results: AnswerResult[]) => void;
  onBack: () => void;
}

export interface AnswerResult {
  wrongChar: string;
  correctChar: string;
  userAnswer: string;
  isCorrect: boolean;
  lesson: number;
  lessonTitle: string;
}

interface CharAnnotation {
  charIndex: number;
  imageData: string;
  isCorrect: boolean;
  userChar: string;
}

export default function ArticlePractice({
  startLesson,
  endLesson,
  onFinish,
  onBack,
}: Props) {
  const [article, setArticle] = useState<ArticleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCharIndex, setSelectedCharIndex] = useState<number | null>(null);
  const [annotations, setAnnotations] = useState<Map<number, CharAnnotation>>(new Map());
  const [foundWrong, setFoundWrong] = useState<Set<number>>(new Set());
  const [showCanvas, setShowCanvas] = useState(false);
  const [currentWrongChar, setCurrentWrongChar] = useState<WrongChar | null>(null);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [clickedNormal, setClickedNormal] = useState<Set<number>>(new Set());

  useEffect(() => {
    setLoading(true);
    generateArticle(startLesson, endLesson)
      .then(setArticle)
      .catch(() => alert("生成文章失敗，請重試"))
      .finally(() => setLoading(false));
  }, [startLesson, endLesson]);

  if (loading) {
    return <div className="loader">正在生成練習文章...</div>;
  }

  if (!article) {
    return (
      <div className="error">
        無法生成文章
        <button onClick={onBack}>返回</button>
      </div>
    );
  }

  const handleCharClick = (charIndex: number, _char: string) => {
    // Check if this character is one of the wrong characters
    const wrongChar = article.wrong_chars.find(
      (wc) => wc.position === charIndex
    );

    if (wrongChar) {
      // Found a wrong character!
      setCurrentWrongChar(wrongChar);
      setSelectedCharIndex(charIndex);
      setShowCanvas(true);
      setFoundWrong((prev) => new Set(prev).add(charIndex));
    } else {
      // Not a wrong character - show brief feedback
      setClickedNormal((prev) => new Set(prev).add(charIndex));
      setTimeout(() => {
        setClickedNormal((prev) => {
          const next = new Set(prev);
          next.delete(charIndex);
          return next;
        });
      }, 600);
    }
  };

  const handleCanvasSubmit = async (imageData: string, _drawnChar: string) => {
    if (!currentWrongChar || selectedCharIndex === null) return;

    try {
      const response = await recognizeHandwriting(
        imageData,
        currentWrongChar.correct_char
      );

      const annotation: CharAnnotation = {
        charIndex: selectedCharIndex,
        imageData,
        isCorrect: response.is_correct,
        userChar: response.recognized_char,
      };

      setAnnotations((prev) => {
        const next = new Map(prev);
        next.set(selectedCharIndex, annotation);
        return next;
      });

      const result: AnswerResult = {
        wrongChar: currentWrongChar.wrong_char,
        correctChar: currentWrongChar.correct_char,
        userAnswer: response.recognized_char,
        isCorrect: response.is_correct,
        lesson: currentWrongChar.lesson,
        lessonTitle: currentWrongChar.lesson_title,
      };
      setResults((prev) => [...prev.filter((r) => r.wrongChar !== currentWrongChar.wrong_char), result]);
    } catch {
      // Fallback if recognition fails
      const annotation: CharAnnotation = {
        charIndex: selectedCharIndex,
        imageData,
        isCorrect: true,
        userChar: currentWrongChar.correct_char,
      };
      setAnnotations((prev) => {
        const next = new Map(prev);
        next.set(selectedCharIndex, annotation);
        return next;
      });
    }

    setShowCanvas(false);
    setCurrentWrongChar(null);
    setSelectedCharIndex(null);
  };

  const handleFinish = () => {
    // For any wrong chars not yet found, mark them as missed
    const allResults = [...results];
    for (const wc of article.wrong_chars) {
      if (!allResults.find((r) => r.wrongChar === wc.wrong_char)) {
        allResults.push({
          wrongChar: wc.wrong_char,
          correctChar: wc.correct_char,
          userAnswer: "",
          isCorrect: false,
          lesson: wc.lesson,
          lessonTitle: wc.lesson_title,
        });
      }
    }
    onFinish(allResults);
  };

  const allFound = foundWrong.size >= article.total_wrong;

  // Render the article text character by character
  const renderArticle = () => {
    const chars = article.display_text.split("");
    return chars.map((char, index) => {
      const isWrong = article.wrong_chars.some((wc) => wc.position === index);
      const annotation = annotations.get(index);
      const isFound = foundWrong.has(index);
      const isNormalClicked = clickedNormal.has(index);

      // Skip whitespace rendering
      if (char === "\n") {
        return <br key={index} />;
      }

      return (
        <span key={index} className="char-wrapper">
          <span
            className={`article-char ${
              isFound
                ? annotation?.isCorrect
                  ? "found-correct"
                  : "found-wrong"
                : ""
            } ${isNormalClicked ? "normal-flash" : ""} ${
              isWrong && !isFound ? "clickable" : ""
            }`}
            onClick={() => handleCharClick(index, char)}
          >
            {char}
          </span>
          {annotation && (
            <span
              className={`annotation ${
                annotation.isCorrect ? "correct" : "incorrect"
              }`}
            >
              {annotation.isCorrect ? annotation.userChar : `→${currentWrongChar?.correct_char || annotation.userChar}`}
            </span>
          )}
        </span>
      );
    });
  };

  return (
    <div className="practice-container">
      <div className="practice-header">
        <button className="back-btn" onClick={onBack}>
          ← 返回
        </button>
        <div className="progress-info">
          <span>
            找到 {foundWrong.size} / {article.total_wrong} 個錯字
          </span>
        </div>
      </div>

      <div className="instruction-bar">
        💡 請點擊文章中你認為是錯字的字，然後手寫正確的字！
      </div>

      <div className="article-display">{renderArticle()}</div>

      <div className="practice-footer">
        {allFound ? (
          <button className="finish-btn" onClick={handleFinish}>
            查看結果 📊
          </button>
        ) : (
          <div className="hint-text">
            還有 {article.total_wrong - foundWrong.size} 個錯字等你找出來！
          </div>
        )}
        <button className="give-up-btn" onClick={handleFinish}>
          結束練習
        </button>
      </div>

      {showCanvas && currentWrongChar && (
        <HandwritingCanvas
          expectedChar={currentWrongChar.correct_char}
          onSubmit={handleCanvasSubmit}
          onCancel={() => {
            setShowCanvas(false);
            setCurrentWrongChar(null);
            setSelectedCharIndex(null);
          }}
        />
      )}
    </div>
  );
}
