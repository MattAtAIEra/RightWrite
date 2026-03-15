import { useState } from "react";
import type { AppStage } from "./types";
import type { AnswerResult } from "./components/ArticlePractice";
import LessonSelector from "./components/LessonSelector";
import ArticlePractice from "./components/ArticlePractice";
import ResultView from "./components/ResultView";

function App() {
  const [stage, setStage] = useState<AppStage>("select");
  const [lessonRange, setLessonRange] = useState<[number, number]>([1, 7]);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [practiceKey, setPracticeKey] = useState(0);

  const handleStart = (start: number, end: number) => {
    setLessonRange([start, end]);
    setPracticeKey((k) => k + 1);
    setStage("practice");
  };

  const handleFinish = (answerResults: AnswerResult[]) => {
    setResults(answerResults);
    setStage("result");
  };

  const handleRetry = () => {
    setPracticeKey((k) => k + 1);
    setStage("practice");
  };

  const handleBack = () => {
    setStage("select");
    setResults([]);
  };

  return (
    <div className="app">
      {stage === "select" && <LessonSelector onStart={handleStart} />}
      {stage === "practice" && (
        <ArticlePractice
          key={practiceKey}
          startLesson={lessonRange[0]}
          endLesson={lessonRange[1]}
          onFinish={handleFinish}
          onBack={handleBack}
        />
      )}
      {stage === "result" && (
        <ResultView
          results={results}
          onRetry={handleRetry}
          onBack={handleBack}
        />
      )}
    </div>
  );
}

export default App;
