declare module "*.wasm?module" {
  const module: WebAssembly.Module;
  export default module;
}

declare module "*.icm?url&inline" {
  const url: string;
  export default url;
}

declare module "pdfjs-dist/image_decoders/pdf.image_decoders.mjs" {
  export class JpegImage {
    constructor(options: Record<string, never>);
    width: number;
    height: number;
    numComponents: number;
    parse(data: Uint8Array, options?: { dnlScanLines: number }): void;
    getData(options: { width: number; height: number }): Uint8ClampedArray;
  }
}
