// src/dashboard/TopMistakesList.tsx
import { useEffect, useState } from "react";
import type { CharStat, HandwritingImage } from "../storage/types";
import { listByProfile as listImagesByProfile } from "../storage/imageStore";

interface Props {
  profileId: string;
  topChars: CharStat[];
}

export default function TopMistakesList({ profileId, topChars }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [images, setImages] = useState<HandwritingImage[]>([]);

  useEffect(() => {
    listImagesByProfile(profileId).then(setImages);
  }, [profileId]);

  if (topChars.length === 0) {
    return (
      <div className="top-mistakes-card">
        <h3>最常寫錯的字 Top 10</h3>
        <p className="empty-hint">還沒寫錯字，繼續加油!</p>
      </div>
    );
  }

  return (
    <div className="top-mistakes-card">
      <h3>最常寫錯的字 Top 10</h3>
      <ol className="top-mistakes-list">
        {topChars.map((s) => {
          const charImages = images.filter((i) => i.char === s.char).slice(0, 6);
          return (
            <li key={s.char} className="top-mistake-item">
              <div className="top-mistake-row">
                <span className="top-mistake-char">{s.char}</span>
                <span className="top-mistake-stats">
                  錯 {s.mistakes} / 練 {s.attempts} 次 ({Math.round(s.mistakeRate * 100)}%)
                </span>
                <span className="top-mistake-lesson">
                  第{s.lesson}課 {s.lessonTitle}
                </span>
                <button
                  className="top-mistake-toggle"
                  onClick={() => setExpanded(expanded === s.char ? null : s.char)}
                >
                  {expanded === s.char ? "收起" : "看手寫"}
                </button>
              </div>
              {expanded === s.char && (
                <div className="top-mistake-thumbnails">
                  {charImages.length === 0 ? (
                    <p className="empty-hint">沒有保留手寫圖（可能已過期）</p>
                  ) : (
                    charImages.map((img) => (
                      <img key={img.id} src={img.imageData} alt={`${s.char} 手寫`} title={new Date(img.capturedAt).toLocaleString()} />
                    ))
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
