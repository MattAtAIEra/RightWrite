interface Props {
  text: string;
  /** 公布答案時：標出錯字位置與正確字 */
  reveal?: { wrongIndex: number; correctChar: string } | null;
  size?: "lg" | "md" | "sm";
  seal?: string;
}

/**
 * 用書法字型（文鼎 PL 中楷）把成語一字一格寫在宣紙色的卡片上。
 * 公布答案時，錯字會被老師的紅筆圈起來，正確字從上方彈出。
 */
export default function Calligraphy({ text, reveal = null, size = "lg", seal }: Props) {
  const chars = Array.from(text);
  return (
    <div className={`calli calli-${size}`} aria-label={text}>
      <div className="calli-paper">
        {chars.map((ch, i) => {
          const isWrong = reveal != null && reveal.wrongIndex === i;
          return (
            <div key={i} className={`calli-cell${isWrong ? " is-wrong" : ""}`} style={{ animationDelay: `${i * 0.08}s` }}>
              <span className="calli-char">{ch}</span>
              {isWrong && (
                <>
                  <svg className="calli-circle" viewBox="0 0 100 100" aria-hidden="true">
                    <path
                      d="M50 8 C 78 6, 96 26, 92 52 C 88 80, 62 96, 38 90 C 14 84, 4 60, 10 38 C 15 20, 30 10, 52 10"
                      fill="none"
                      stroke="#e03131"
                      strokeWidth="5"
                      strokeLinecap="round"
                      pathLength="100"
                    />
                  </svg>
                  <span className="calli-correct" aria-label={`正確字 ${reveal.correctChar}`}>
                    {reveal.correctChar}
                  </span>
                </>
              )}
            </div>
          );
        })}
        {seal && <span className="calli-seal" aria-hidden="true">{seal}</span>}
      </div>
    </div>
  );
}
