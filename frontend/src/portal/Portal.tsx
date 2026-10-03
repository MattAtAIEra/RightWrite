import { useEffect } from "react";
import "./portal.css";

interface AppCard {
  href: string;
  title: string;
  subtitle: string;
  desc: string;
  tags: string[];
  tone: "coral" | "teal";
  icon: React.ReactNode;
}

const APPS: AppCard[] = [
  {
    href: "/rightwrite",
    title: "改錯字神器",
    subtitle: "單人練習",
    desc: "依照課本進度生成文章，把藏在句子裡的錯字找出來，再用手寫改正。",
    tags: ["康軒 · 翰林", "課文生字", "手寫辨識"],
    tone: "coral",
    icon: <PencilIcon />,
  },
  {
    href: "/yzqj",
    title: "一字千金",
    subtitle: "多人競賽",
    desc: "掃 QR Code 加入賽局，書法成語裡藏著一個錯字，20 秒內寫出正確的字，比正確率與速度！",
    tags: ["最多 10 人", "即時筆跡轉播", "成語"],
    tone: "teal",
    icon: <BrushIcon />,
  },
];

const FLOATING = ["字", "詞", "語", "文", "書", "學", "讀", "寫"];

export default function Portal() {
  useEffect(() => {
    document.title = "國語學習樂園";
  }, []);

  return (
    <div className="portal">
      <div className="portal-float" aria-hidden="true">
        {FLOATING.map((ch, i) => (
          <span key={ch} style={{ left: `${8 + i * 12}%`, animationDelay: `${i * 0.9}s`, animationDuration: `${9 + (i % 3) * 2}s` }}>
            {ch}
          </span>
        ))}
      </div>

      <header className="portal-hero">
        <BookIllustration />
        <h1>國語學習樂園</h1>
        <p className="portal-tagline">把國語課變成一場好玩的冒險：找錯字、寫好字、比一比。</p>
      </header>

      <main className="portal-grid">
        {APPS.map((app, i) => (
          <a key={app.href} href={app.href} className={`portal-card tone-${app.tone}`} style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
            <div className="portal-card-icon">{app.icon}</div>
            <div className="portal-card-body">
              <span className="portal-card-sub">{app.subtitle}</span>
              <h2>{app.title}</h2>
              <p>{app.desc}</p>
              <ul className="portal-tags">
                {app.tags.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <span className="portal-card-go" aria-hidden="true">進入 →</span>
          </a>
        ))}
      </main>

      <footer className="portal-foot">
        <span>適合國小中年級 · 支援平板手寫</span>
      </footer>
    </div>
  );
}

function BookIllustration() {
  return (
    <svg className="portal-book" viewBox="0 0 220 150" width="220" height="150" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="110" cy="138" rx="90" ry="8" fill="#2d3436" opacity="0.08" />
      <path d="M20 40 Q65 25 110 42 L110 125 Q65 108 20 123 Z" fill="#fff" stroke="#ff6b6b" strokeWidth="4" strokeLinejoin="round" />
      <path d="M200 40 Q155 25 110 42 L110 125 Q155 108 200 123 Z" fill="#fff" stroke="#4ecdc4" strokeWidth="4" strokeLinejoin="round" />
      <g stroke="#dfe6e9" strokeWidth="3" strokeLinecap="round">
        <path d="M38 60 q30 -8 60 2" /><path d="M38 78 q30 -8 60 2" /><path d="M38 96 q30 -8 44 0" />
        <path d="M122 62 q30 -10 60 -2" /><path d="M122 80 q30 -10 60 -2" /><path d="M122 98 q30 -10 44 -4" />
      </g>
      <text x="150" y="98" fontFamily="'ZCOOL KuaiLe', 'LXGW WenKai TC'" fontSize="30" fill="#ff6b6b" transform="rotate(-6 150 98)">字</text>
      <g className="portal-star" transform="translate(28 18)">
        <path d="M10 0 l3 7 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1z" fill="#ffe66d" />
      </g>
      <g className="portal-star slow" transform="translate(180 10)">
        <path d="M10 0 l3 7 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1z" fill="#ffa94d" />
      </g>
      <circle cx="110" cy="30" r="5" fill="#4ecdc4" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" fill="none" aria-hidden="true">
      <g transform="rotate(-40 32 32)">
        <rect x="24" y="6" width="16" height="36" rx="3" fill="#ffe66d" stroke="#2d3436" strokeWidth="2.5" />
        <rect x="24" y="6" width="16" height="8" rx="3" fill="#ff6b6b" stroke="#2d3436" strokeWidth="2.5" />
        <path d="M24 42 h16 l-8 14 z" fill="#ffd8a8" stroke="#2d3436" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M29 51 h6 l-3 5 z" fill="#2d3436" />
      </g>
      <path d="M8 54 q10 -6 20 0" stroke="#ff6b6b" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function BrushIcon() {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" fill="none" aria-hidden="true">
      <g transform="rotate(35 32 32)">
        <rect x="27" y="4" width="10" height="30" rx="4" fill="#4ecdc4" stroke="#2d3436" strokeWidth="2.5" />
        <path d="M26 34 h12 l3 8 q-9 14 -18 0 z" fill="#2d3436" />
        <path d="M32 52 q2 5 -1 9" stroke="#2d3436" strokeWidth="3" strokeLinecap="round" />
      </g>
      <rect x="6" y="40" width="18" height="18" rx="3" fill="#fff" stroke="#e03131" strokeWidth="2" />
      <text x="9" y="55" fontFamily="'AR PL UKai TW', 'LXGW WenKai TC'" fontSize="14" fill="#e03131">金</text>
    </svg>
  );
}
