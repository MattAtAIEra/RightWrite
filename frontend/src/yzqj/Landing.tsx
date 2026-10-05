import { useEffect, useState } from "react";
import { createGame, fetchMeta } from "./api";
import { hostTokenKey, navigate, normalizeCode } from "./router";
import Calligraphy from "./components/Calligraphy";

export default function Landing() {
  const [code, setCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(18);
  const [idiomCount, setIdiomCount] = useState<number | null>(null);

  useEffect(() => {
    fetchMeta()
      .then((m) => {
        setSeconds(m.question_seconds);
        setIdiomCount(m.idiom_count);
      })
      .catch(() => {});
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await createGame();
      sessionStorage.setItem(hostTokenKey(res.code), res.host_token);
      navigate(res.host_path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "建立賽局失敗");
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const c = normalizeCode(code);
    if (c.length !== 3) {
      setError("請輸入三碼的賽局代碼");
      return;
    }
    navigate(`/g/${c}`);
  };

  return (
    <div className="yz-landing">
      <header className="yz-hero">
        <div className="yz-hero-brush" aria-hidden="true">
          <BrushIllustration />
        </div>
        <Calligraphy text="一字千金" size="md" seal="千金" />
        <p className="yz-tagline">成語裡藏了一個錯字，看誰最快寫出正確的字！</p>
        <ul className="yz-rules">
          <li>📱 掃 QR Code 加入，最多 10 人</li>
          <li>✍️ 每題 {seconds} 秒，在九宮格寫出正確的字</li>
          <li>🏆 一輪 5 題，結束看正確率與排名{idiomCount != null && <>（題庫 {idiomCount} 個成語）</>}</li>
        </ul>
      </header>

      <div className="yz-role-cards">
        <section className="yz-role-card teacher">
          <div className="yz-role-icon">🧑‍🏫</div>
          <h2>我是老師</h2>
          <p>建立新賽局，投影 QR Code 讓學生加入，同步監看每個人的筆跡。</p>
          <button type="button" className="yz-btn primary" onClick={handleCreate} disabled={creating}>
            {creating ? "建立中…" : "建立賽局"}
          </button>
        </section>

        <section className="yz-role-card student">
          <div className="yz-role-icon">🧒</div>
          <h2>我是學生</h2>
          <p>掃描老師螢幕上的 QR Code，或輸入三碼代碼加入。</p>
          <form className="yz-code-form" onSubmit={handleJoin}>
            <input
              className="yz-code-input"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="ABC"
              maxLength={3}
              autoCapitalize="characters"
              autoComplete="off"
              inputMode="text"
              aria-label="賽局代碼"
            />
            <button type="submit" className="yz-btn secondary" disabled={code.length !== 3}>
              加入賽局
            </button>
          </form>
        </section>
      </div>

      {error && <div className="yz-error">{error}</div>}

      <footer className="yz-footer">
        <a href="/">← 回學習樂園</a>
      </footer>
    </div>
  );
}

function BrushIllustration() {
  return (
    <svg viewBox="0 0 160 160" width="120" height="120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="80" cy="80" r="70" fill="#ffe66d" opacity="0.35" />
      <g transform="rotate(-35 80 80)">
        <rect x="72" y="18" width="16" height="78" rx="6" fill="#4ecdc4" />
        <rect x="72" y="18" width="16" height="14" rx="6" fill="#3dbdb5" />
        <path d="M72 96 h16 l4 14 q-12 22 -24 0 z" fill="#2d3436" />
        <path d="M80 128 q3 10 -2 18" stroke="#2d3436" strokeWidth="4" strokeLinecap="round" />
      </g>
      <path d="M40 126 q20 -8 42 2 q18 8 38 -4" stroke="#e03131" strokeWidth="5" strokeLinecap="round" opacity="0.8">
        <animate attributeName="stroke-dasharray" values="0 200;200 0" dur="2.5s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}
