import jbig2Url from "pdfjs-dist/wasm/jbig2.wasm?url";
import openJpegUrl from "pdfjs-dist/wasm/openjpeg.wasm?url";

const decoderUrls = new Map([
  ["jbig2.wasm", jbig2Url],
  ["openjpeg.wasm", openJpegUrl],
]);

// PDF.js asks for fixed filenames, but Vite fingerprints these assets for deployment.
export class PdfDecoderAssets {
  async fetch({ kind, filename }: { kind: string; filename: string }) {
    const url = kind === "wasmUrl" ? decoderUrls.get(filename) : undefined;
    if (!url) throw new Error("Unsupported PDF decoder asset");
    const response = await fetch(url);
    if (!response.ok) throw new Error("Couldn’t load PDF image decoder");
    return new Uint8Array(await response.arrayBuffer());
  }
}
