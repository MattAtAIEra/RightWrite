import { describe, it, expect, beforeEach } from "vitest";
import { DB_NAME, closeDB } from "../db";
import {
  putImage,
  getImage,
  listByProfile,
  purgeBefore,
  deleteByProfile,
} from "../imageStore";

beforeEach(async () => {
  closeDB();
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
});

describe("imageStore", () => {
  it("putImage + getImage roundtrip", async () => {
    const img = await putImage({
      profileId: "p1",
      sessionId: "s1",
      char: "縫",
      capturedAt: 1000,
      imageData: "data:image/png;base64,XYZ",
    });
    const got = await getImage(img.id);
    expect(got).toEqual(img);
  });

  it("listByProfile returns only that profile, newest first", async () => {
    await putImage({ profileId: "p1", sessionId: "s", char: "a", capturedAt: 10, imageData: "x" });
    await putImage({ profileId: "p2", sessionId: "s", char: "b", capturedAt: 20, imageData: "x" });
    await putImage({ profileId: "p1", sessionId: "s", char: "c", capturedAt: 30, imageData: "x" });
    const list = await listByProfile("p1");
    expect(list.map((i) => i.char)).toEqual(["c", "a"]);
  });

  it("purgeBefore deletes images older than cutoff", async () => {
    await putImage({ profileId: "p1", sessionId: "s", char: "a", capturedAt: 100, imageData: "x" });
    await putImage({ profileId: "p1", sessionId: "s", char: "b", capturedAt: 200, imageData: "x" });
    await putImage({ profileId: "p1", sessionId: "s", char: "c", capturedAt: 300, imageData: "x" });
    const deleted = await purgeBefore(250);
    expect(deleted).toBe(2);
    const remaining = await listByProfile("p1");
    expect(remaining.map((i) => i.char)).toEqual(["c"]);
  });

  it("deleteByProfile removes all profile images", async () => {
    await putImage({ profileId: "p1", sessionId: "s", char: "a", capturedAt: 1, imageData: "x" });
    await putImage({ profileId: "p2", sessionId: "s", char: "b", capturedAt: 2, imageData: "x" });
    await deleteByProfile("p1");
    expect(await listByProfile("p1")).toEqual([]);
    expect((await listByProfile("p2")).length).toBe(1);
  });
});
