import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { detectWorkFile } = await import("./content");
const { workFileProblem, WORK_FILE_MAX_BYTES } = await import("./files");

const image = (format: "png" | "jpeg" | "webp" | "gif") =>
  sharp({ create: { width: 4, height: 4, channels: 3, background: "#fff" } }).toFormat(format).toBuffer();

describe("detectWorkFile", () => {
  it("accepts PDF and supported photos by their bytes", async () => {
    expect(await detectWorkFile(new TextEncoder().encode("%PDF-1.7\n1 0 obj\n%%EOF\n"))).toBe("application/pdf");
    expect(await detectWorkFile(await image("png"))).toBe("image/png");
    expect(await detectWorkFile(await image("jpeg"))).toBe("image/jpeg");
    expect(await detectWorkFile(await image("webp"))).toBe("image/webp");
  });
  it("rejects other formats, truncated PDFs and renamed bytes", async () => {
    expect(await detectWorkFile(await image("gif"))).toBeNull();
    expect(await detectWorkFile(new TextEncoder().encode("%PDF-1.7 truncated"))).toBeNull();
    expect(await detectWorkFile(new TextEncoder().encode("MZ\u0090\u0000 not a photo"))).toBeNull();
  });
});

describe("workFileProblem", () => {
  it("enforces the shared type and size limits", () => {
    expect(workFileProblem({ type: "application/pdf", size: WORK_FILE_MAX_BYTES })).toBeNull();
    expect(workFileProblem({ type: "application/pdf", size: WORK_FILE_MAX_BYTES + 1 })).toMatch(/8 MB/);
    expect(workFileProblem({ type: "image/heic", size: 10 })).toMatch(/JPEG/);
    expect(workFileProblem({ type: "application/x-msdownload", size: 10 })).toMatch(/PDF/);
  });
});
