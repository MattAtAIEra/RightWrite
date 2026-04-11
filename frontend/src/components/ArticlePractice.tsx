import { useEffect, useState, useCallback } from "react";
import type { ArticleResponse, PracticeMode, WrongChar } from "../types";
import { generateArticle, recognizeHandwriting } from "../api";
import HandwritingCanvas from "./HandwritingCanvas";

interface Props {
  startLesson: number;
  endLesson: number;
  practiceMode: PracticeMode;
  gradeId: string;
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
  type: "found_wrong" | "false_alarm" | "missed";
  imageData?: string;
}

interface CharAnnotation {
  charIndex: number;
  imageData: string;
  isCorrect: boolean;
  userChar: string;
  type: "found_wrong" | "false_alarm";
  pending?: boolean;
}

const SENTENCE_NUMBERS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

export default function ArticlePractice({
  startLesson,
  endLesson,
  practiceMode,
  gradeId,
  onFinish,
  onBack,
}: Props) {
  const [article, setArticle] = useState<ArticleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCharIndex, setSelectedCharIndex] = useState<number | null>(null);
  const [annotations, setAnnotations] = useState<Map<number, CharAnnotation>>(new Map());
  const [showCanvas, setShowCanvas] = useState(false);
  const [currentClickedChar, setCurrentClickedChar] = useState<{
    index: number;
    char: string;
    wrongChar: WrongChar | null; // null = this is a correct char
  } | null>(null);
  const [showZhuyin, setShowZhuyin] = useState(false);
  const [results, setResults] = useState<AnswerResult[]>([]);

  useEffect(() => {
    setLoading(true);
    generateArticle(startLesson, endLesson, practiceMode, gradeId)
      .then(setArticle)
      .catch(() => alert("生成文章失敗，請重試"))
      .finally(() => setLoading(false));
  }, [startLesson, endLesson, practiceMode]);

  // Fire-and-forget recognition for a wrong character
  const recognizeWrongChar = useCallback(
    (imageData: string, charIndex: number, wrongChar: WrongChar) => {
      // Set pending annotation immediately
      const pendingAnnotation: CharAnnotation = {
        charIndex,
        imageData,
        isCorrect: false,
        userChar: "…",
        type: "found_wrong",
        pending: true,
      };
      setAnnotations((prev) => new Map(prev).set(charIndex, pendingAnnotation));

      recognizeHandwriting(imageData, wrongChar.correct_char)
        .then((response) => {
          const annotation: CharAnnotation = {
            charIndex,
            imageData,
            isCorrect: response.is_correct,
            userChar: response.recognized_char,
            type: "found_wrong",
          };
          setAnnotations((prev) => new Map(prev).set(charIndex, annotation));

          const result: AnswerResult = {
            wrongChar: wrongChar.wrong_char,
            correctChar: wrongChar.correct_char,
            userAnswer: response.recognized_char,
            isCorrect: response.is_correct,
            lesson: wrongChar.lesson,
            lessonTitle: wrongChar.lesson_title,
            type: "found_wrong",
            imageData,
          };
          setResults((prev) => [
            ...prev.filter(
              (r) =>
                !(
                  r.type === "found_wrong" &&
                  r.wrongChar === wrongChar.wrong_char
                )
            ),
            result,
          ]);
        })
        .catch(() => {
          // Fallback: treat as correct
          const annotation: CharAnnotation = {
            charIndex,
            imageData,
            isCorrect: true,
            userChar: wrongChar.correct_char,
            type: "found_wrong",
          };
          setAnnotations((prev) => new Map(prev).set(charIndex, annotation));
        });
    },
    []
  );

  // Fire-and-forget recognition for a correct character (false alarm check)
  const recognizeCorrectChar = useCallback(
    (imageData: string, charIndex: number, originalChar: string) => {
      // Set pending annotation
      const pendingAnnotation: CharAnnotation = {
        charIndex,
        imageData,
        isCorrect: false,
        userChar: "…",
        type: "false_alarm",
        pending: true,
      };
      setAnnotations((prev) => new Map(prev).set(charIndex, pendingAnnotation));

      recognizeHandwriting(imageData, originalChar)
        .then((response) => {
          if (response.recognized_char === originalChar) {
            // No penalty — they confirmed the character is correct
            setAnnotations((prev) => {
              const next = new Map(prev);
              next.delete(charIndex);
              return next;
            });
          } else {
            // False alarm (penalty)
            const annotation: CharAnnotation = {
              charIndex,
              imageData,
              isCorrect: false,
              userChar: response.recognized_char,
              type: "false_alarm",
            };
            setAnnotations((prev) => new Map(prev).set(charIndex, annotation));

            const result: AnswerResult = {
              wrongChar: originalChar,
              correctChar: originalChar,
              userAnswer: response.recognized_char,
              isCorrect: false,
              lesson: 0,
              lessonTitle: "",
              type: "false_alarm",
              imageData,
            };
            setResults((prev) => [...prev, result]);
          }
        })
        .catch(() => {
          // Recognition failed — remove pending, no penalty
          setAnnotations((prev) => {
            const next = new Map(prev);
            next.delete(charIndex);
            return next;
          });
        });
    },
    []
  );

  if (loading) {
    return <div className="loader">{practiceMode === "sentence" ? "正在生成練習句子..." : "正在生成練習文章..."}</div>;
  }

  if (!article) {
    return (
      <div className="error">
        無法生成文章
        <button onClick={onBack}>返回</button>
      </div>
    );
  }

  const handleCharClick = (charIndex: number, char: string) => {
    // Skip if recognition is still pending
    const existing = annotations.get(charIndex);
    if (existing?.pending) return;

    // Skip punctuation and whitespace
    if (/[\s，。、；：！？「」『』（）—…\u3000]/.test(char)) return;

    // Check if this is a wrong character
    const wrongChar = article.wrong_chars.find(
      (wc) => wc.position === charIndex
    );

    // Every character opens the handwriting canvas
    setCurrentClickedChar({ index: charIndex, char, wrongChar: wrongChar || null });
    setSelectedCharIndex(charIndex);
    setShowCanvas(true);
  };

  const handleCanvasSubmit = (imageData: string, _drawnChar: string) => {
    if (!currentClickedChar || selectedCharIndex === null) return;

    const { wrongChar } = currentClickedChar;
    const charIndex = selectedCharIndex;

    // Dismiss canvas immediately for better UX
    setShowCanvas(false);
    setCurrentClickedChar(null);
    setSelectedCharIndex(null);

    // Fire off recognition in background
    if (wrongChar) {
      recognizeWrongChar(imageData, charIndex, wrongChar);
    } else {
      recognizeCorrectChar(imageData, charIndex, currentClickedChar.char);
    }
  };

  const handleFinish = () => {
    const allResults = [...results];
    // Mark unfound wrong chars as missed
    for (const wc of article.wrong_chars) {
      const found = allResults.find(
        (r) => r.type === "found_wrong" && r.correctChar === wc.correct_char && r.wrongChar === wc.wrong_char
      );
      if (!found) {
        allResults.push({
          wrongChar: wc.wrong_char,
          correctChar: wc.correct_char,
          userAnswer: "",
          isCorrect: false,
          lesson: wc.lesson,
          lessonTitle: wc.lesson_title,
          type: "missed",
        });
      }
    }
    onFinish(allResults);
  };

  const answeredCount = [...annotations.values()].filter((a) => !a.pending).length;

  // Render zhuyin as plain text inside <rt> — let native ruby handle layout
  // (splitting tone into an absolutely positioned span got clipped on iOS)
  const renderZhuyinRt = (zy: string) => <rt className="zy-rt">{zy}</rt>;

  // Render the article text character by character
  const renderArticle = () => {
    const chars = article.display_text.split("");
    const elements: React.ReactNode[] = [];
    let sentenceIndex = 0;

    // In sentence mode, add number before first character
    if (practiceMode === "sentence") {
      elements.push(
        <span key="sn-0" className="sentence-number">
          {SENTENCE_NUMBERS[0] || `${1}.`}{" "}
        </span>
      );
    }

    for (let index = 0; index < chars.length; index++) {
      const char = chars[index];

      if (char === "\n") {
        elements.push(<br key={`br-${index}`} />);
        if (practiceMode === "sentence") {
          sentenceIndex++;
          elements.push(
            <span key={`sn-${index}`} className="sentence-number">
              {SENTENCE_NUMBERS[sentenceIndex] || `${sentenceIndex + 1}.`}{" "}
            </span>
          );
        }
        continue;
      }

      const annotation = annotations.get(index);
      const isPunctuation = /[\s，。、；：！？「」『』（）—…\u3000]/.test(char);

      let charClass = "article-char";
      if (annotation) {
        if (annotation.pending) {
          charClass += " pending-recognition";
        } else if (annotation.type === "found_wrong") {
          charClass += annotation.isCorrect ? " found-correct" : " found-wrong";
        } else if (annotation.type === "false_alarm") {
          charClass += " false-alarm";
        }
      }
      if (isPunctuation) {
        charClass += " punctuation";
      }

      const zhuyinStr = showZhuyin ? (article.zhuyin?.[index] || "") : "";
      const isChineseChar = /[\u4e00-\u9fff]/.test(char);

      elements.push(
        <span key={index} className="char-wrapper">
          {showZhuyin && isChineseChar && zhuyinStr ? (
            <ruby
              className={charClass}
              onClick={() => !isPunctuation && handleCharClick(index, char)}
            >
              {char}
              {renderZhuyinRt(zhuyinStr)}
            </ruby>
          ) : (
            <span
              className={charClass}
              onClick={() => !isPunctuation && handleCharClick(index, char)}
            >
              {char}
            </span>
          )}
          {annotation && (
            <span
              className={`annotation ${
                annotation.pending
                  ? "pending"
                  : annotation.isCorrect
                  ? "correct"
                  : "incorrect"
              }`}
            >
              {annotation.pending
                ? "⏳"
                : annotation.type === "found_wrong"
                ? annotation.isCorrect
                  ? annotation.userChar
                  : `→${annotation.userChar}`
                : `✗${annotation.userChar}`}
            </span>
          )}
        </span>
      );
    }

    return elements;
  };

  return (
    <div className="practice-container">
      <div className="practice-header">
        <button className="back-btn" onClick={onBack}>
          ← 返回
        </button>
        <div className="progress-info">
          <span>已作答 {answeredCount} 個字</span>
        </div>
        <button
          className="zhuyin-toggle-btn"
          onClick={() => setShowZhuyin((v) => !v)}
        >
          {showZhuyin ? "隱藏注音" : "顯示注音"}
        </button>
      </div>

      <div className="instruction-bar">
        {practiceMode === "sentence"
          ? "💡 點擊句子中你認為是錯字的字，手寫出正確的字！"
          : "💡 點擊文章中你認為是錯字的字，手寫出正確的字！"}
      </div>

      <div className={`article-display ${showZhuyin ? "with-zhuyin" : ""}`}>
        {renderArticle()}
      </div>

      <div className="practice-footer">
        <button className="finish-btn" onClick={handleFinish}>
          結束練習，查看結果 📊
        </button>
      </div>

      {showCanvas && currentClickedChar && (
        <HandwritingCanvas
          onSubmit={handleCanvasSubmit}
          onCancel={() => {
            setShowCanvas(false);
            setCurrentClickedChar(null);
            setSelectedCharIndex(null);
          }}
        />
      )}
    </div>
  );
}
