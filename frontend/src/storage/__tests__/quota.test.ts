import { describe, it, expect, vi, afterEach } from "vitest";
import { ensureRoomForImage } from "../quota";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubStorage(usage: number, quota: number) {
  vi.stubGlobal("navigator", {
    ...navigator,
    storage: { estimate: async () => ({ usage, quota }) },
  });
}

describe("ensureRoomForImage", () => {
  it("returns 'ok' when usage well below warn threshold", async () => {
    stubStorage(1_000_000, 10_000_000); // 10%
    expect(await ensureRoomForImage(50_000)).toBe("ok");
  });

  it("returns 'warn' when projected usage between 80%-95%", async () => {
    stubStorage(8_000_000, 10_000_000); // 80%; +50K → 80.5%
    expect(await ensureRoomForImage(50_000)).toBe("warn");
  });

  it("returns 'block' when projected usage above 95%", async () => {
    stubStorage(9_600_000, 10_000_000); // 96%
    expect(await ensureRoomForImage(50_000)).toBe("block");
  });

  it("defaults to 'ok' when storage.estimate unavailable", async () => {
    vi.stubGlobal("navigator", { ...navigator, storage: undefined });
    expect(await ensureRoomForImage(50_000)).toBe("ok");
  });
});
