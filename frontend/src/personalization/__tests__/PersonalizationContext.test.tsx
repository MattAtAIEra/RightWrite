import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { render, act, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import {
  PersonalizationProvider,
  usePersonalization,
  PERSONALIZATION_ENABLED_KEY,
  ACTIVE_PROFILE_KEY,
} from "../PersonalizationContext";
import { closeDB } from "../../storage/db";

beforeEach(() => {
  localStorage.clear();
  closeDB();
  // Replace the factory entirely — eliminates stale pending openDB requests
  // that cause fake-indexeddb to deadlock when tests share an IDBFactory instance.
  globalThis.indexedDB = new IDBFactory();
});

function Spy({ onCtx }: { onCtx: (ctx: ReturnType<typeof usePersonalization>) => void }) {
  const ctx = usePersonalization();
  useEffect(() => { onCtx(ctx); });
  return null;
}

describe("PersonalizationContext", () => {
  it("defaults to enabled=false, activeProfile=null", async () => {
    let captured: ReturnType<typeof usePersonalization> | null = null;
    render(
      <PersonalizationProvider>
        <Spy onCtx={(c) => (captured = c)} />
      </PersonalizationProvider>,
    );
    await waitFor(() => {
      expect(captured).not.toBeNull();
    });
    expect(captured!.enabled).toBe(false);
    expect(captured!.activeProfile).toBeNull();
  });

  it("persists enabled toggle to localStorage", async () => {
    let captured: ReturnType<typeof usePersonalization> | null = null;
    render(
      <PersonalizationProvider>
        <Spy onCtx={(c) => (captured = c)} />
      </PersonalizationProvider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());
    await act(async () => { captured!.setEnabled(true); });
    expect(localStorage.getItem(PERSONALIZATION_ENABLED_KEY)).toBe("true");
  });

  it("setActiveProfile persists profile id to localStorage", async () => {
    let captured: ReturnType<typeof usePersonalization> | null = null;
    render(
      <PersonalizationProvider>
        <Spy onCtx={(c) => (captured = c)} />
      </PersonalizationProvider>,
    );
    await waitFor(() => expect(captured).not.toBeNull());
    // IDB operations use macrotasks (setImmediate in fake-indexeddb) which
    // deadlock inside act(). Call them directly and use waitFor for assertions.
    const p = await captured!.createProfile("小明", "🐶");
    await captured!.setActiveProfile(p.id);
    await waitFor(() => {
      expect(localStorage.getItem(ACTIVE_PROFILE_KEY)).toBeTruthy();
    });
  });

  it("rehydrates enabled and activeProfile from localStorage on mount", async () => {
    const { createProfile } = await import("../../storage/profileStore");
    const p = await createProfile({ name: "小明", emoji: "🐶" });
    localStorage.setItem(PERSONALIZATION_ENABLED_KEY, "true");
    localStorage.setItem(ACTIVE_PROFILE_KEY, p.id);

    let captured: ReturnType<typeof usePersonalization> | null = null;
    render(
      <PersonalizationProvider>
        <Spy onCtx={(c) => (captured = c)} />
      </PersonalizationProvider>,
    );
    await waitFor(() => {
      expect(captured?.enabled).toBe(true);
      expect(captured?.activeProfile?.id).toBe(p.id);
    });
  });
});
