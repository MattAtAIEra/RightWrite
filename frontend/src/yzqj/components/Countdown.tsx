import { useEffect, useRef, useState } from "react";

interface Props {
  /** 截止時間（本機 Date.now() 基準的毫秒） */
  deadlineAt: number;
  totalSeconds: number;
  variant?: "ring" | "bar";
  onExpire?: () => void;
}

/** 倒數計時：老師端用圓環、學生端用進度條。最後 5 秒會變紅並跳動。 */
export default function Countdown({ deadlineAt, totalSeconds, variant = "ring", onExpire }: Props) {
  const [remaining, setRemaining] = useState(() => Math.max(0, deadlineAt - Date.now()));
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    const tick = () => {
      const left = Math.max(0, deadlineAt - Date.now());
      setRemaining(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire?.();
      }
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [deadlineAt, onExpire]);

  const seconds = Math.ceil(remaining / 1000);
  const ratio = Math.min(1, remaining / (totalSeconds * 1000));
  const urgent = seconds <= 5;

  if (variant === "bar") {
    return (
      <div className={`countdown-bar${urgent ? " is-urgent" : ""}`} role="timer" aria-live="off">
        <div className="countdown-bar-fill" style={{ width: `${ratio * 100}%` }} />
        <span className="countdown-bar-label">{seconds} 秒</span>
      </div>
    );
  }

  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <div className={`countdown-ring${urgent ? " is-urgent" : ""}`} role="timer">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="ring-track" />
        <circle
          cx="50"
          cy="50"
          r={r}
          className="ring-fill"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
        />
      </svg>
      <span className="countdown-number">{seconds}</span>
    </div>
  );
}
