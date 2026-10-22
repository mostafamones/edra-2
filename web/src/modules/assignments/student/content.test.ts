import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { detectWorkFile } = await import("./content");
const { sameWorkFileType, workFileMime, workFileProblem, WORK_FILE_MAX_BYTES } = await import("./files");

const image = (format: "png" | "jpeg" | "webp" | "gif") =>
  sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).toFormat(format).toBuffer();

/** A minimal ISO-BMFF file: ftyp(major, minor 0, compatible brands) then the given boxes. */
function heif(major: string, compatible: string[], boxes: string[] = ["meta"]) {
  const chunks: Buffer[] = [];
  const ftyp = Buffer.alloc(16 + compatible.length * 4);
  ftyp.writeUInt32BE(ftyp.length, 0); ftyp.write("ftyp", 4, "latin1"); ftyp.write(major, 8, "latin1");
  compatible.forEach((brand, index) => ftyp.write(brand, 16 + index * 4, "latin1"));
  chunks.push(ftyp);
  for (const type of boxes) { const b = Buffer.alloc(16); b.writeUInt32BE(16, 0); b.write(type, 4, "latin1"); chunks.push(b); }
  return new Uint8Array(Buffer.concat(chunks));
}

describe("detectWorkFile", () => {
  it("accepts PDF and supported photos by their bytes", async () => {
    expect(await detectWorkFile(new TextEncoder().encode("%PDF-1.7\n1 0 obj\n%%EOF\n"))).toBe("application/pdf");
    expect(await detectWorkFile(await image("png"))).toBe("image/png");
    expect(await detectWorkFile(await image("jpeg"))).toBe("image/jpeg");
    expect(await detectWorkFile(await image("webp"))).toBe("image/webp");
  });
  it("accepts HEIC containers and rejects AVIF or malformed ones", async () => {
    expect(await detectWorkFile(heif("heic", ["mif1", "heic"]))).toBe("image/heic");
    expect(await detectWorkFile(heif("mif1", ["heic"], ["free", "meta"]))).toBe("image/heic");
    expect(await detectWorkFile(heif("avif", ["mif1", "avif"]))).toBeNull();
    expect(await detectWorkFile(heif("heic", ["heic"], ["free"]))).toBeNull();
    expect(await detectWorkFile(heif("heic", ["heic"]).subarray(0, 30))).toBeNull();
  });
  it("rejects other formats, truncated PDFs and renamed bytes", async () => {
    expect(await detectWorkFile(await image("gif"))).toBeNull();
    expect(await detectWorkFile(new TextEncoder().encode("%PDF-1.7 truncated"))).toBeNull();
    expect(await detectWorkFile(new TextEncoder().encode("MZ\u0090\u0000 not a photo"))).toBeNull();
  });
});

describe("work file types", () => {
  it("enforces the shared type and size limits", () => {
    expect(workFileProblem({ type: "application/pdf", name: "a.pdf", size: WORK_FILE_MAX_BYTES })).toBeNull();
    expect(workFileProblem({ type: "application/pdf", name: "a.pdf", size: WORK_FILE_MAX_BYTES + 1 })).toMatch(/8 MB/);
    expect(workFileProblem({ type: "application/x-msdownload", name: "a.exe", size: 10 })).toMatch(/PDF/);
  });
  it("types untyped HEIC/HEIF photos by extension only", () => {
    expect(workFileMime({ type: "image/heic", name: "IMG.HEIC" })).toBe("image/heic");
    expect(workFileMime({ type: "", name: "IMG_0001.HEIC" })).toBe("image/heic");
    expect(workFileMime({ type: "", name: "photo.heif" })).toBe("image/heif");
    expect(workFileMime({ type: "text/plain", name: "fake.heic" })).toBeNull();
    expect(sameWorkFileType("image/heic", "image/heif")).toBe(true);
    expect(sameWorkFileType("image/heic", "image/jpeg")).toBe(false);
  });
});
