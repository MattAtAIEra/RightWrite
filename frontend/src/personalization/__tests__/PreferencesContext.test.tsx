import { describe, it, expect, beforeEach } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { render, act, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { PersonalizationProvider, usePersonalization } from "../PersonalizationContext";
import { PreferencesProvider, usePreferences } from "../PreferencesContext";
import { closeDB } from "../../storage/db";
import { PREFS_KEY } from "../../storage/prefsStore";
import { getProfile } from "../../storage/profileStore";

beforeEach(() => {
  localStorage.clear();
  closeDB();
  globalThis.indexedDB = new IDBFactory();
});

type Captured = {
  prefs: ReturnType<typeof usePreferences>;
  pers: ReturnType<typeof usePersonalization>;
};

function Spy({ onCtx }: { onCtx: (c: Captured) => void }) {
  const prefs = usePreferences();
  const pers = usePersonalization();
  useEffect(() => {
    onCtx({ prefs, pers });
  });
  return null;
}

function mount() {
  let captured: Captured | null = null;
  render(
    <PersonalizationProvider>
      <PreferencesProvider>
        <Spy onCtx={(c) => (captured = c)} />
      </PreferencesProvider>
    </PersonalizationProvider>,
  );
  return () => captured!;
}

describe("PreferencesContext", () => {
  it("starts from defaults and persists changes to the device layer", async () => {
    const get = mount();
    await waitFor(() => expect(get()).toBeTruthy());
    expect(get().prefs.prefs.term).toBe("115_1");
    expect(get().prefs.prefs.showZhuyin).toBe(false);

    act(() => get().prefs.setPrefs({ term: "114_2", showZhuyin: true }));
    await waitFor(() => expect(get().prefs.prefs.term).toBe("114_2"));
    expect(get().prefs.prefs.showZhuyin).toBe(true);
    expect(JSON.parse(localStorage.getItem(PREFS_KEY)!)).toMatchObject({ term: "114_2", showZhuyin: true });
  });

  it("rehydrates the device layer on next visit", async () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ publisher: "翰林版", gradeNum: 2, practiceMode: "article" }));
    const get = mount();
    await waitFor(() => expect(get()).toBeTruthy());
    expect(get().prefs.prefs.publisher).toBe("翰林版");
    expect(get().prefs.prefs.gradeNum).toBe(2);
    expect(get().prefs.prefs.practiceMode).toBe("article");
  });

  it("writes to the active profile when personalization is on, and each profile keeps its own prefs", async () => {
    const get = mount();
    await waitFor(() => expect(get()).toBeTruthy());

    act(() => get().pers.setEnabled(true));
    let a!: { id: string };
    let b!: { id: string };
    await act(async () => {
      a = await get().pers.createProfile("小明", "🐶");
      b = await get().pers.createProfile("小華", "🐱");
    });

    await act(async () => { await get().pers.setActiveProfile(a.id); });
    await waitFor(() => expect(get().pers.activeProfile?.id).toBe(a.id));
    act(() => get().prefs.setPrefs({ showZhuyin: true, gradeNum: 3 }));
    await waitFor(() => expect(get().prefs.prefs.gradeNum).toBe(3));
    await waitFor(async () => {
      const stored = await getProfile(a.id);
      expect(stored?.prefs).toMatchObject({ showZhuyin: true, gradeNum: 3 });
    });

    // Switch to B: B has no profile prefs → falls back to device layer (which A's writes also updated)
    await act(async () => { await get().pers.setActiveProfile(b.id); });
    await waitFor(() => expect(get().pers.activeProfile?.id).toBe(b.id));
    act(() => get().prefs.setPrefs({ gradeNum: 6, showZhuyin: false }));
    await waitFor(() => expect(get().prefs.prefs.gradeNum).toBe(6));

    // Back to A: A's own prefs win over the device layer
    await act(async () => { await get().pers.setActiveProfile(a.id); });
    await waitFor(() => expect(get().pers.activeProfile?.id).toBe(a.id));
    await waitFor(() => expect(get().prefs.prefs.gradeNum).toBe(3));
    expect(get().prefs.prefs.showZhuyin).toBe(true);

    const storedB = await getProfile(b.id);
    expect(storedB?.prefs).toMatchObject({ gradeNum: 6, showZhuyin: false });
  });

  it("ignores the profile layer when personalization is switched off", async () => {
    const get = mount();
    await waitFor(() => expect(get()).toBeTruthy());
    act(() => get().pers.setEnabled(true));
    let a!: { id: string };
    await act(async () => { a = await get().pers.createProfile("小明", "🐶"); });
    await act(async () => { await get().pers.setActiveProfile(a.id); });
    await waitFor(() => expect(get().pers.activeProfile?.id).toBe(a.id));
    act(() => get().prefs.setPrefs({ gradeNum: 1 }));
    await waitFor(() => expect(get().prefs.prefs.gradeNum).toBe(1));

    // Device layer was also written, so turning personalization off keeps the last choice
    act(() => get().pers.setEnabled(false));
    await waitFor(() => expect(get().prefs.prefs.gradeNum).toBe(1));
    act(() => get().prefs.setPrefs({ gradeNum: 5 }));
    await waitFor(() => expect(get().prefs.prefs.gradeNum).toBe(5));
    // …without touching the profile record
    const stored = await getProfile(a.id);
    expect(stored?.prefs?.gradeNum).toBe(1);
  });
});
