import { useState } from "react";
import type { AppStage, PracticeMode } from "./types";
import type { AnswerResult } from "./components/ArticlePractice";
import LessonSelector from "./components/LessonSelector";
import ArticlePractice from "./components/ArticlePractice";
import ResultView from "./components/ResultView";
import { PersonalizationProvider } from "./personalization/PersonalizationContext";

function App() {
  const [stage, setStage] = useState<AppStage>("select");
  const [lessonRange, setLessonRange] = useState<[number, number]>([1, 6]);
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("article");
  const [gradeId, setGradeId] = useState("grade4");
  const [gradeLabel, setGradeLabel] = useState("");
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [practiceKey, setPracticeKey] = useState(0);

  const handleStart = (start: number, end: number, mode: PracticeMode, grade: string, label: string) => {
    setLessonRange([start, end]);
    setPracticeMode(mode);
    setGradeId(grade);
    setGradeLabel(label);
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
    <PersonalizationProvider>
      <div className="app">
        {stage === "select" && (
          <LessonSelector onStart={handleStart} onOpenDashboard={() => setStage("dashboard")} />
        )}
        {stage === "practice" && (
          <ArticlePractice
            key={practiceKey}
            startLesson={lessonRange[0]}
            endLesson={lessonRange[1]}
            practiceMode={practiceMode}
            gradeId={gradeId}
            gradeLabel={gradeLabel}
            onFinish={handleFinish}
            onBack={handleBack}
          />
        )}
        {stage === "result" && (
          <ResultView results={results} onRetry={handleRetry} onBack={handleBack} />
        )}
        {stage === "dashboard" && (
          // Dashboard component lands in Phase 4; placeholder for now
          <div style={{ padding: 24 }}>
            <button onClick={handleBack}>← 返回</button>
            <h2>學習儀表板</h2>
            <p>儀表板將於 Phase 4 上線。</p>
          </div>
        )}
      </div>
    </PersonalizationProvider>
  );
}

export default App;
