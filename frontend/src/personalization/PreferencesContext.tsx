/* eslint-disable react-refresh/only-export-components */
// src/personalization/PreferencesContext.tsx
//
// Remembers what the user picked last time (學期 / 出版社 / 年級 / 練習模式 /
// 顯示注音) so they don't have to re-select on every visit.
//
// Two layers:
//   - device layer  → localStorage (always written)
//   - profile layer → Profile.prefs in IndexedDB (written when a profile is
//                     active; wins over the device layer when present)
import { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { Preferences } from "../storage/types";
import { loadDevicePrefs, saveDevicePrefs, resolvePrefs, sanitizePrefs } from "../storage/prefsStore";
import { getProfile, updateProfile } from "../storage/profileStore";
import { usePersonalization } from "./PersonalizationContext";

interface PreferencesContextValue {
  prefs: Preferences;
  setPrefs: (patch: Partial<Preferences>) => void;
}

const Ctx = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { enabled, activeProfile } = usePersonalization();
  const [devicePrefs, setDevicePrefs] = useState<Partial<Preferences>>(() => loadDevicePrefs());
  const [profilePrefs, setProfilePrefs] = useState<Partial<Preferences>>({});

  const profileId = enabled ? activeProfile?.id ?? null : null;

  // Re-hydrate the profile layer whenever the active profile changes. Read
  // fresh from IndexedDB: the activeProfile object in context is a snapshot
  // taken at selection time and does not see our later updateProfile writes.
  useEffect(() => {
    if (!profileId) {
      setProfilePrefs({});
      return;
    }
    let alive = true;
    setProfilePrefs(sanitizePrefs(activeProfile?.prefs));
    getProfile(profileId)
      .then((p) => {
        if (alive && p) setProfilePrefs(sanitizePrefs(p.prefs));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const prefs = useMemo(
    () => resolvePrefs(devicePrefs, profileId ? profilePrefs : null),
    [devicePrefs, profilePrefs, profileId],
  );

  const setPrefs = useCallback(
    (patch: Partial<Preferences>) => {
      const clean = sanitizePrefs(patch);
      if (Object.keys(clean).length === 0) return;
      setDevicePrefs(saveDevicePrefs(clean));
      if (profileId) {
        setProfilePrefs((prev) => {
          const next = { ...prev, ...clean };
          updateProfile(profileId, { prefs: next }).catch((err) =>
            console.warn("Failed to persist profile prefs", err),
          );
          return next;
        });
      }
    },
    [profileId],
  );

  return <Ctx.Provider value={{ prefs, setPrefs }}>{children}</Ctx.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider");
  return ctx;
}
