// Rebuild with Zig 0.15.2: node build.mjs /absolute/path/to/zig
// Compilation happens here at development time, never in the application.
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const zig = process.argv[2];
if (!zig || execFileSync(zig, ['version'], { encoding: 'utf8' }).trim() !== '0.15.2') throw Error('Pass a Zig 0.15.2 executable');
const dir = await mkdtemp(join(tmpdir(), 'edra-lcms-'));
try {
  const response = await fetch('https://codeload.github.com/mm2/Little-CMS/tar.gz/refs/tags/lcms2.19.1');
  if (!response.ok) throw Error(`LittleCMS download: ${response.status}`);
  const archive = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(archive).digest('hex') !== '267705e278e2f7c2fb886c259dadcbaeb2be52748bcbc71c79f08aacacb7a709') throw Error('Review changed LittleCMS source archive');
  await writeFile(join(dir, 'source.tar.gz'), archive);
  execFileSync('tar', ['-xzf', 'source.tar.gz'], { cwd: dir });
  const source = join(dir, 'Little-CMS-lcms2.19.1');
  const files = (await readdir(join(source, 'src'))).filter(name => name.endsWith('.c')).sort().map(name => `src/${name}`);
  const exports = ['malloc', 'free', 'cmsOpenProfileFromMem', 'cmsCloseProfile', 'cmsCreateTransform', 'cmsDoTransform', 'cmsDeleteTransform', 'cmsGetColorSpace', 'cmsGetEncodedCMMversion', 'cmsIsIntentSupported', 'cmsGetHeaderRenderingIntent'];
  execFileSync(zig, ['cc', '-target', 'wasm32-wasi', '-mexec-model=reactor', '-O3', '-DCMS_NO_PTHREADS', '-I', 'include', ...files,
    ...exports.map(name => `-Wl,--export=${name}`), '-Wl,-z,stack-size=262144', '-Wl,--max-memory=33554432', '-Wl,--strip-all', '-o', 'lcms.wasm'], { cwd: source, stdio: 'inherit' });
  const bytes = await readFile(join(source, 'lcms.wasm'));
  const module = new WebAssembly.Module(bytes);
  const imports = WebAssembly.Module.imports(module);
  if (imports.some(item => item.module !== 'wasi_snapshot_preview1' || item.kind !== 'function')) throw Error('Review changed LittleCMS imports');
  const path = fileURLToPath(new URL('lcms.wasm', import.meta.url));
  await writeFile(path, bytes);
  console.log(JSON.stringify({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), imports }, null, 2));
} finally { await rm(dir, { recursive: true, force: true }); }
