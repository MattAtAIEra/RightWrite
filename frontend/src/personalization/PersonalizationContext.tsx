// src/personalization/PersonalizationContext.tsx
import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { Profile } from "../storage/types";
import {
  createProfile as storageCreateProfile,
  listProfiles as storageListProfiles,
  deleteProfile as storageDeleteProfile,
  getProfile as storageGetProfile,
  touchProfile,
} from "../storage/profileStore";

export const PERSONALIZATION_ENABLED_KEY = "rightwrite:personalization:enabled";
export const ACTIVE_PROFILE_KEY = "rightwrite:personalization:activeProfile";

interface PersonalizationContextValue {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  activeProfile: Profile | null;
  setActiveProfile: (id: string | null) => Promise<void>;
  profiles: Profile[];
  refreshProfiles: () => Promise<void>;
  createProfile: (name: string, emoji: string) => Promise<Profile>;
  deleteProfile: (id: string) => Promise<void>;
}

const Ctx = createContext<PersonalizationContextValue | null>(null);

export function PersonalizationProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [activeProfile, setActiveProfileState] = useState<Profile | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const refreshProfiles = useCallback(async () => {
    setProfiles(await storageListProfiles());
  }, []);

  // Initial rehydrate
  useEffect(() => {
    let alive = true;
    const enabledStored = localStorage.getItem(PERSONALIZATION_ENABLED_KEY) === "true";
    setEnabledState(enabledStored);
    (async () => {
      const all = await storageListProfiles();
      if (!alive) return;
      setProfiles(all);
      const activeId = localStorage.getItem(ACTIVE_PROFILE_KEY);
      if (activeId) {
        const p = await storageGetProfile(activeId);
        if (!alive) return;
        if (p) setActiveProfileState(p);
      }
    })();
    return () => { alive = false; };
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    localStorage.setItem(PERSONALIZATION_ENABLED_KEY, String(v));
  }, []);

  const setActiveProfile = useCallback(async (id: string | null) => {
    if (id === null) {
      setActiveProfileState(null);
      localStorage.removeItem(ACTIVE_PROFILE_KEY);
      return;
    }
    const p = await storageGetProfile(id);
    if (!p) return;
    await touchProfile(id);
    setActiveProfileState(p);
    localStorage.setItem(ACTIVE_PROFILE_KEY, id);
  }, []);

  const createProfile = useCallback(async (name: string, emoji: string) => {
    const p = await storageCreateProfile({ name, emoji });
    await refreshProfiles();
    return p;
  }, [refreshProfiles]);

  const deleteProfile = useCallback(async (id: string) => {
    await storageDeleteProfile(id);
    await refreshProfiles();
    if (activeProfile?.id === id) {
      setActiveProfileState(null);
      localStorage.removeItem(ACTIVE_PROFILE_KEY);
    }
  }, [activeProfile, refreshProfiles]);

  return (
    <Ctx.Provider
      value={{ enabled, setEnabled, activeProfile, setActiveProfile, profiles, refreshProfiles, createProfile, deleteProfile }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function usePersonalization(): PersonalizationContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePersonalization must be used inside PersonalizationProvider");
  return ctx;
}
