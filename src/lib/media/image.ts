import sharp from "sharp";

/**
 * Image transformation pipeline used by the media-processing worker.
 *
 * Converts uploads to WebP and produces a set of resized variants:
 *   thumbnail  — 400px (cover crop)   -> card/thumb contexts
 *   medium     — 900px (cover crop)   -> gallery lightbox
 *   large      — 1400px (inside fit)  -> full detail view
 *
 * The full-resolution original is retained as the master copy.
 */

export interface VariantSpec {
  label: string;
  width: number;
  height: number;
  fit: "cover" | "inside";
}

export const DEFAULT_VARIANTS: VariantSpec[] = [
  { label: "thumbnail", width: 400, height: 300, fit: "cover" },
  { label: "medium", width: 900, height: 675, fit: "cover" },
  { label: "large", width: 1400, height: 1000, fit: "inside" },
];

export interface ProcessedImage {
  variants: Array<{ label: string; buffer: Buffer; width: number; height: number }>;
  width: number;
  height: number;
}

/**
 * Process an image buffer: normalize to WebP, generate the variant set, and
 * optionally composite a watermark (bottom-right, alpha 0.5, 120px wide logo).
 * Throws when `input` is not a readable image — workers surface that as a
 * non-retryable failure.
 */
export async function processImage(
  input: Buffer,
  options?: {
    variants?: VariantSpec[];
    watermark?: Buffer;
  },
): Promise<ProcessedImage> {
  const variants = options?.variants ?? DEFAULT_VARIANTS;

  const base = sharp(input, { failOn: "error" });
  const meta = await base.metadata();

  const results: ProcessedImage["variants"] = [];
  for (const spec of variants) {
    let pipeline = base.clone().rotate();
    if (spec.fit === "cover") {
      pipeline = pipeline.resize(spec.width, spec.height, { fit: "cover", position: "centre" });
    } else {
      pipeline = pipeline.resize(spec.width, spec.height, { fit: "inside", withoutEnlargement: true });
    }

    let final = pipeline.webp({ quality: 82, effort: 4 });
    if (options?.watermark) {
      const wm = await sharp(options.watermark).resize({ width: 120 }).png().toBuffer();
      final = final.composite([
        {
          input: wm,
          gravity: "southeast",
          blend: "over",
        },
      ]);
    }

    const out = await final.toBuffer({ resolveWithObject: true });
    results.push({ label: spec.label, buffer: out.data, width: out.info.width, height: out.info.height });
  }

  return {
    variants: results,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}