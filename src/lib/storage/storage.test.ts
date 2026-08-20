import { beforeEach, describe, expect, it } from "vitest";
import { resetLocalStorage, storage } from "@/lib/storage/storage";

/**
 * LocalStorage (in-proc fallback) contract tests.
 * In test env S3_BUCKET is empty → the adapter is LocalStorage, so put/get/
 * head/delete round-trips are exercisable without any cloud dependency.
 */

describe("storage (local fallback)", () => {
  beforeEach(() => resetLocalStorage());

  it("round-trips put/get", async () => {
    const payload = Buffer.from("image-bytes");
    await storage.put("a/b/c.png", payload);
    const got = await storage.get("a/b/c.png");
    expect(got.equals(payload)).toBe(true);
  });

  it("reports size via head", async () => {
    await storage.put("k", Buffer.from("12345"));
    const head = await storage.head("k");
    expect(head.size).toBe(5);
  });

  it("deletes objects", async () => {
    await storage.put("tmp", Buffer.from("x"));
    await storage.delete("tmp");
    await expect(storage.get("tmp")).rejects.toThrow("not found");
  });

  it("presigns without a live network", async () => {
    const putUrl = await storage.presignPut("some/key.png", { contentType: "image/png" });
    const getUrl = await storage.presignGet("some/key.png");
    expect(putUrl).toMatch(/^local:\/\//);
    expect(getUrl).toMatch(/^local:\/\//);
  });
});