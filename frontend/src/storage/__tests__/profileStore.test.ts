// src/storage/__tests__/profileStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { DB_NAME, closeDB } from "../db";
import {
  createProfile,
  listProfiles,
  getProfile,
  updateProfile,
  deleteProfile,
  touchProfile,
} from "../profileStore";

beforeEach(async () => {
  closeDB();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe("profileStore", () => {
  it("createProfile assigns uuid and timestamps", async () => {
    const p = await createProfile({ name: "小明", emoji: "🐶" });
    expect(p.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(p.name).toBe("小明");
    expect(p.emoji).toBe("🐶");
    expect(p.createdAt).toBeGreaterThan(0);
    expect(p.lastActiveAt).toBe(p.createdAt);
    expect(p.syncedAt).toBeNull();
  });

  it("listProfiles returns insertion order by createdAt", async () => {
    const a = await createProfile({ name: "A", emoji: "🐶" });
    await new Promise((r) => setTimeout(r, 5));
    const b = await createProfile({ name: "B", emoji: "🐱" });
    const list = await listProfiles();
    expect(list.map((p) => p.id)).toEqual([a.id, b.id]);
  });

  it("updateProfile bumps updatedAt and clears syncedAt", async () => {
    const p = await createProfile({ name: "X", emoji: "🐶" });
    await new Promise((r) => setTimeout(r, 5));
    const updated = await updateProfile(p.id, { name: "Y" });
    expect(updated.name).toBe("Y");
    expect(updated.updatedAt).toBeGreaterThan(p.updatedAt);
    expect(updated.syncedAt).toBeNull();
  });

  it("touchProfile updates lastActiveAt", async () => {
    const p = await createProfile({ name: "X", emoji: "🐶" });
    await new Promise((r) => setTimeout(r, 5));
    await touchProfile(p.id);
    const after = await getProfile(p.id);
    expect(after!.lastActiveAt).toBeGreaterThan(p.lastActiveAt);
  });

  it("deleteProfile removes it", async () => {
    const p = await createProfile({ name: "X", emoji: "🐶" });
    await deleteProfile(p.id);
    expect(await getProfile(p.id)).toBeUndefined();
  });
});
