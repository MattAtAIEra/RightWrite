import { useEffect } from "react";
import "./portal.css";

import rightwriteBanner from "./banners/rightwrite-1672.webp";
import rightwriteBannerSmall from "./banners/rightwrite-836.webp";
import yzqjBanner from "./banners/yzqj-1672.webp";
import yzqjBannerSmall from "./banners/yzqj-836.webp";

/**
 * 入口橫幅：插畫裡已經畫好標題、說明、標籤與「進入」按鈕，整張圖就是一個連結。
 * 圖由 scripts/build_portal_banners.py 從 doc/ 的原圖裁出；desc 在窄螢幕顯示在圖下方
 * （圖裡的說明字縮到看不清楚），寬螢幕只留給螢幕閱讀器。
 */
interface AppBanner {
  href: string;
  title: string;
  subtitle: string;
  desc: string;
  tone: "coral" | "teal";
  src: string;
  srcSmall: string;
}

const APPS: AppBanner[] = [
  {
    href: "/rightwrite",
    title: "改錯字神器",
    subtitle: "單人練習",
    desc: "依照課本進度生成文章，把藏在句子裡的錯字找出來，再用手寫改正。",
    tone: "coral",
    src: rightwriteBanner,
    srcSmall: rightwriteBannerSmall,
  },
  {
    href: "/yzqj",
    title: "一字千金",
    subtitle: "多人競賽",
    desc: "掃 QR Code 加入賽局，書法成語裡藏著一個錯字，20 秒內寫出正確的字，比正確率與速度！",
    tone: "teal",
    src: yzqjBanner,
    srcSmall: yzqjBannerSmall,
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

      <main className="portal-banners">
        {APPS.map((app, i) => (
          <a key={app.href} href={app.href} className={`portal-banner tone-${app.tone}`} style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
            <img
              src={app.src}
              srcSet={`${app.srcSmall} 836w, ${app.src} 1672w`}
              sizes="(max-width: 1040px) calc(100vw - 32px), 1008px"
              width={1672}
              height={459}
              alt={`${app.title}（${app.subtitle}）`}
              decoding="async"
            />
            <p className="portal-banner-caption">{app.desc}</p>
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
