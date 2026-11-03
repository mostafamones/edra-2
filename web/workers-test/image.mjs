import { image2048, oriented, oracle, rejects, mismatch } from './image-fixtures.mjs';
const bytes = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

// Workers forbids compiling Wasm at runtime. Record every call, and fail on anything but instantiating a precompiled Module.
const wasmCalls = {};
const sourceKind = value => value instanceof WebAssembly.Module ? 'Module' : value instanceof ArrayBuffer || ArrayBuffer.isView(value) ? 'bytes' : value?.constructor?.name ?? typeof value;
for (const name of ['instantiate', 'compile', 'compileStreaming', 'instantiateStreaming']) {
  const original = WebAssembly[name];
  WebAssembly[name] = function (source, ...rest) {
    const call = `WebAssembly.${name}(${sourceKind(source)})`;
    wasmCalls[call] = (wasmCalls[call] ?? 0) + 1;
    if (call !== 'WebAssembly.instantiate(Module)') throw Error(`runtime Wasm compile attempted: ${call}`);
    return original.call(this, source, ...rest);
  };
}
const OriginalModule = WebAssembly.Module;
WebAssembly.Module = new Proxy(OriginalModule, { construct() { wasmCalls['new WebAssembly.Module(bytes)'] = (wasmCalls['new WebAssembly.Module(bytes)'] ?? 0) + 1; throw Error('runtime Wasm compile attempted: new WebAssembly.Module'); } });

export default { async test() {
  // The guard itself must fire, or an empty report would prove nothing.
  try { await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); throw Error('Wasm guard did not fire'); } catch (error) { if (!/runtime Wasm compile attempted/.test(error.message)) throw error; }
  delete wasmCalls['WebAssembly.compile(bytes)'];
  // Load after the guard so import-time Wasm use is recorded too.
  const { encodeAvatar } = await import('../src/modules/account/image.server.ts');
  const { decodeImage } = await import('../src/modules/account/image-codecs.server.ts');
  if (typeof ImageData !== 'function') throw Error('ImageData shim not installed');
  const start = performance.now();
  const encoded = await encodeAvatar(bytes(image2048));
  if (!encoded) throw Error('2048 encode failed');
  const decoded = await decodeImage('webp', encoded);
  if (decoded.width !== 512 || decoded.height !== 512 || decoded.data[3] !== 255) throw Error('output dimensions/alpha failed');
  const rotated = await encodeAvatar(bytes(oriented));
  if (!rotated) throw Error('EXIF encode failed');
  const pixels = await decodeImage('webp', rotated);
  const p = (x,y) => pixels.data[(y*512+x)*4];
  if (!(p(64,64) < 80 && p(448,64) > 170)) throw Error('EXIF orientation 6 failed');
  const timings = [];
  for (const fixture of oracle) {
    const began = performance.now();
    const output = await encodeAvatar(bytes(fixture.input));
    const elapsed = performance.now() - began;
    if (!output) {
      // Surface decoder failures hidden by encodeAvatar's invalid-input contract.
      if (fixture.name.includes('CMYK')) await decodeImage('jpeg', bytes(fixture.input));
      throw Error(`${fixture.name}: encoding rejected`);
    }
    const image = await decodeImage('webp', output);
    if (image.width !== 512 || image.height !== 512) throw Error(`${fixture.name}: dimensions`);
    let max = 0, sum = 0;
    for (const {x,y,rgb} of fixture.points) {
      const at=(y*512+x)*4;
      if (image.data[at+3] !== 255) throw Error(`${fixture.name}: not opaque at ${x},${y}`);
      for (let c = 0; c < 3; c++) { const delta = Math.abs(rgb[c]-image.data[at+c]); max = Math.max(max, delta); sum += delta; }
    }
    const mean = sum / (fixture.points.length * 3);
    timings.push(`${fixture.name}: ${elapsed.toFixed(0)} ms, max ${max}, mean ${mean.toFixed(2)} over ${fixture.points.length} points (bounds ${fixture.bounds.max}/${fixture.bounds.mean})`);
    if (max > fixture.bounds.max || mean > fixture.bounds.mean) throw Error(`${fixture.name}: reference pixels differ from sharp (max ${max}, mean ${mean})`);
  }
  console.log(timings.join('\n'));
  if (await encodeAvatar(bytes(mismatch))) throw Error('Mismatched animation frame accepted');
  for (const fixture of rejects) {
    const began = performance.now();
    if (await encodeAvatar(bytes(fixture.input))) throw Error(`${fixture.name} accepted`);
    console.log(`${fixture.name}: rejected in ${(performance.now() - began).toFixed(0)} ms`);
  }
  const attempts = Object.keys(wasmCalls).filter(call => call !== 'WebAssembly.instantiate(Module)');
  if (attempts.length) throw Error(`runtime Wasm compile attempted: ${attempts.join(', ')}`);
  console.log(`Wasm calls: ${JSON.stringify(wasmCalls)}`);
  console.log('CMYK (solid, non-uniform, YCCK, no-Adobe, EXIF, ICC, 2048) and animated (lossless, lossy, offset) oracle pixels: pass');
  console.log('image 2048 encode/decode and EXIF: pass; reported duration ms', performance.now() - start);
} };
