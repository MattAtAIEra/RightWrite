import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import Portal from "./portal/Portal.tsx";
import YzqjApp from "./yzqj/YzqjApp.tsx";
import AdminApp from "./admin/AdminApp.tsx";

/**
 * 依照網址決定要載入哪一個應用：
 *   /               國語學習樂園（入口）
 *   /rightwrite     改錯字神器
 *   /yzqj, /g/:code 一字千金
 *   /backstage-admin  管理介面（要登入，只開放名單內的 IP）
 */
function pickApp(pathname: string): { name: string; element: React.ReactNode } {
  if (pathname === "/backstage-admin" || pathname.startsWith("/backstage-admin/")) {
    return { name: "admin", element: <AdminApp /> };
  }
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
// Portal 與一字千金各自在元件內設定 document.title；改錯字神器沒有，所以在這裡補
if (name === "rightwrite") document.title = "改錯字練習 · RightWrite";

createRoot(document.getElementById("root")!).render(<StrictMode>{element}</StrictMode>);
