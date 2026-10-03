import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import Portal from "./portal/Portal.tsx";
import YzqjApp from "./yzqj/YzqjApp.tsx";

/**
 * 依照網址決定要載入哪一個應用：
 *   /               國語學習樂園（入口）
 *   /rightwrite     改錯字神器
 *   /yzqj, /g/:code 一字千金
 */
function pickApp(pathname: string): { name: string; element: React.ReactNode } {
  if (pathname.startsWith("/yzqj") || pathname.startsWith("/g/")) {
    return { name: "yzqj", element: <YzqjApp /> };
  }
  if (pathname.startsWith("/rightwrite")) {
    return { name: "rightwrite", element: <App /> };
  }
  return { name: "portal", element: <Portal /> };
}

const { name, element } = pickApp(window.location.pathname);
document.body.dataset.app = name;

createRoot(document.getElementById("root")!).render(<StrictMode>{element}</StrictMode>);
