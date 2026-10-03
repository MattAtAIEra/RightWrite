import { useEffect, useState } from "react";

const NAV_EVENT = "yzqj:navigate";

/** 用瀏覽器 history API 做的小型路由，不需要額外套件。 */
export function navigate(path: string) {
  if (window.location.pathname !== path) {
    window.history.pushState({}, "", path);
  }
  window.dispatchEvent(new Event(NAV_EVENT));
}

export function usePathname(): string {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    window.addEventListener(NAV_EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(NAV_EVENT, update);
    };
  }, []);
  return path;
}

export const hostTokenKey = (code: string) => `yzqj_host_${code.toUpperCase()}`;
export const playerKey = (code: string) => `yzqj_player_${code.toUpperCase()}`;

export function normalizeCode(raw: string): string {
  return raw.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 3);
}
