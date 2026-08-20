import { describe, expect, it } from "vitest";
import { processImage, DEFAULT_VARIANTS } from "@/lib/media/image";

/**
 * ProcessImage tests — run via sharp against small in-memory PNG buffers.
 * Verifies: 1) WebP output, 2) three standard variants, 3) correct resizes,
 * 4) watermark compositing, 5) non-image input throws (drives the worker's
 * non-retryable classification).
 */

function makePng(width = 640, height = 480, color = "rgb(10,140,220)"): Buffer {
  // Minimal valid 1x1→NxN PNG: construct by sharp from an SVG so the tests
  // don't depend on raw PNG bytes.
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<rect width="100%" height="100%" fill="${color}"/>` +
      `</svg>`,
  );
}

describe("processImage", () => {
  it("produces WebP buffers for all three standard variants", async () => {
    const out = await processImage(makePng(1200, 900));
    expect(out.variants).toHaveLength(DEFAULT_VARIANTS.length);
    expect(out.variants.map((v) => v.label)).toEqual(["thumbnail", "medium", "large"]);
    for (const v of out.variants) {
      // WebP magic header "RIFF....WEBP"
      expect(v.buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
      expect(v.buffer.subarray(8, 12).toString("ascii")).toBe("WEBP");
      expect(v.width).toBeGreaterThan(0);
      expect(v.height).toBeGreaterThan(0);
    }
  });

  it("scales cover-fit variants to the target width", async () => {
    const out = await processImage(makePng(2000, 1000));
    const thumb = out.variants.find((v) => v.label === "thumbnail");
    expect(thumb?.width).toBe(400);
    expect(thumb?.height).toBe(300);
  });

  it("keeps large inside-fit variants proportional when source is smaller", async () => {
    const out = await processImage(makePng(300, 200));
    const large = out.variants.find((v) => v.label === "large");
    // withoutEnlargement: true → stays at source size
    expect(large?.width).toBeLessThanOrEqual(1400);
    expect(large?.width).toBe(300);
    expect(large?.height).toBe(200);
  });

  it("composites a watermark without breaking output", async () => {
    const watermark = makePng(60, 30, "rgba(255,255,255,0.9)");
    const out = await processImage(makePng(800, 600), { watermark });
    const thumb = out.variants.find((v) => v.label === "thumbnail");
    expect(thumb).toBeDefined();
    expect(thumb!.buffer.subarray(8, 12).toString("ascii")).toBe("WEBP");
  });

  it("supports custom variant specs", async () => {
    const out = await processImage(makePng(600, 600), {
      variants: [{ label: "icon", width: 128, height: 128, fit: "cover" }],
    });
    expect(out.variants).toHaveLength(1);
    expect(out.variants[0]!.label).toBe("icon");
    expect(out.variants[0]!.width).toBe(128);
    expect(out.variants[0]!.height).toBe(128);
  });

  it("throws on non-image input", async () => {
    await expect(processImage(Buffer.from("this is not an image"))).rejects.toThrow();
  });
});