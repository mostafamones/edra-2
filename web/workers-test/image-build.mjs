import { build } from 'esbuild';
import sharp from 'sharp';
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { manyScanCmyk } from './image-scans.mjs';

// Fixtures, the Worker bundle and the workerd config all live in this temp dir; nothing is written to the repo.
const dir = await mkdtemp(join(tmpdir(), 'edra-image-'));
// Fixture-specific RGB bounds are documented in src/modules/account/README.md, Profile picture.
const TIGHT = { max: 4, mean: 1.5 }, NON_UNIFORM = { max: 48, mean: 5 };
const ANIMATED_OFFSET = { max: 96, mean: 2 }, ANIMATED_LOSSY = { max: 12, mean: 2 };
const ICC = 'node_modules/pdfjs-dist/iccs/CGATS001Compat-v2-micro.icc';
try {
  // Gradients plus feathered blocks: non-uniform, but without hard edges that only measure the resampler.
  function art(width) {
    const data = Buffer.alloc(width * width * 3), feather = Math.max(4, width * 0.05);
    const blocks = [[[0.1, 0.1, 0.3, 0.35], [220, 30, 40]], [[0.6, 0.15, 0.85, 0.4], [20, 180, 60]], [[0.2, 0.6, 0.5, 0.9], [15, 15, 20]], [[0.65, 0.65, 0.95, 0.95], [250, 220, 20]]];
    for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
      const rgb = [(x / width) * 255, (y / width) * 255, ((x + y) / (2 * width)) * 255];
      for (const [[x0, y0, x1, y1], color] of blocks) {
        const weight = Math.min(1, Math.max(0, Math.min(x - x0 * width, x1 * width - x, y - y0 * width, y1 * width - y) / feather));
        for (let c = 0; c < 3; c++) rgb[c] += (color[c] - rgb[c]) * weight;
      }
      data.set(rgb, (y * width + x) * 3);
    }
    return data;
  }
  const nonUniformCmyk = size => sharp(art(size), { raw: { width: size, height: size, channels: 3 } }).toColourspace('cmyk').jpeg().toBuffer();
  const segment = (marker, payload) => Buffer.concat([Buffer.from([0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 255]), payload]);
  const insertAfterSoi = (jpeg, ...segments) => Buffer.concat([jpeg.subarray(0, 2), ...segments, jpeg.subarray(2)]);
  const exif = orientation => segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), Buffer.from([0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, orientation, 0, 0, 0, 0, 0, 0, 0])]));
  // sharp's withIccProfile() on RGB data writes a 3-component JPEG, so a CMYK profile has to be inserted as APP2.
  const icc = async () => segment(0xe2, Buffer.concat([Buffer.from('ICC_PROFILE\0', 'latin1'), Buffer.from([1, 1]), await readFile(ICC)]));
  const adobe = jpeg => jpeg.indexOf('Adobe');
  const withTransform = (jpeg, transform) => { const copy = Buffer.from(jpeg); copy[adobe(jpeg) + 11] = transform; return copy; };
  const withoutAdobe = jpeg => { const from = adobe(jpeg) - 4; return Buffer.concat([jpeg.subarray(0, from), jpeg.subarray(from + 2 + jpeg.readUInt16BE(from + 2))]); };
  const sofAt = jpeg => { for (let at = 2; ; at += 2 + jpeg.readUInt16BE(at + 2)) if (jpeg[at + 1] >= 0xc0 && jpeg[at + 1] <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(jpeg[at + 1])) return at; };

  const pixels = Buffer.alloc(128*128*3);
  for(let y=0;y<128;y++) for(let x=0;x<128;x++) { const i=(y*128+x)*3; pixels[i]= y<64?255:0; pixels[i+1]=0; pixels[i+2]=0; }
  const oriented = await sharp(pixels, {raw:{width:128,height:128,channels:3}}).jpeg({quality:100}).withMetadata({orientation:6}).toBuffer();
  const big = await sharp({create:{width:2048,height:2048,channels:3,background:'#3366ff'}}).png().toBuffer();
  const oracle = [], rejects = [];
  const points = [[16,16], [160,160], [224,224], [448,448]];
  const grid = Array.from({ length: 256 }, (_, i) => [16 + 32 * (i % 16), 16 + 32 * Math.floor(i / 16)]);
  async function fixture(name, input, bounds, at = points) {
    const encoded = await sharp(input, { animated: false, failOn: 'error', limitInputPixels: 2048*2048 }).rotate().flatten({ background: '#fff' }).resize(512,512).webp({ quality: 82 }).toBuffer();
    const reference = await sharp(encoded).ensureAlpha().raw().toBuffer();
    oracle.push({ name, bounds, input: input.toString('base64'), points: at.map(([x,y]) => ({ x, y, rgb: [...reference.subarray((y*512+x)*4, (y*512+x)*4+3)] })) });
  }
  await fixture('CMYK 10001 real scans 2048', manyScanCmyk(), TIGHT);
  for (const size of [128,2048]) await fixture(`CMYK ${size}`, await sharp({ create: { width:size,height:size,channels:3,background:'#3377cc' } }).toColourspace('cmyk').jpeg().toBuffer(), TIGHT);
  const profile = await icc();
  for (const color of ['#ff0000','#00ff00','#0000ff','#000000','#ffffff']) {
   const cmyk = await sharp({create:{width:128,height:128,channels:3,background:color}}).toColourspace('cmyk').jpeg().toBuffer();
   await fixture(`CMYK ${color}`, cmyk, TIGHT);
   await fixture(`CMYK embedded ${color}`, insertAfterSoi(cmyk, profile), TIGHT);
  }
  for (const colorProfile of ['srgb', 'p3']) for (const format of ['jpeg', 'png', 'webp']) {
    const input = await sharp({ create: { width:512,height:512,channels:3,background:'#c03070' } }).withIccProfile(colorProfile).toFormat(format).toBuffer();
    if (!(await sharp(input).metadata()).icc) throw Error('ICC fixture lost its profile');
    await fixture(`RGB ${format} ${colorProfile}`, input, TIGHT);
  }
  for (const colorProfile of ['srgb', 'p3']) {
    const input = await sharp({ create: { width:512,height:512,channels:3,background:'#c03070' } }).withIccProfile(colorProfile).toColourspace('rgb16').png().toBuffer();
    if (input[24] !== 16) throw Error('16-bit ICC fixture lost its bit depth');
    await fixture(`PNG 16-bit ${colorProfile}`, input, TIGHT);
  }
  const metadataMarkers = Buffer.from(new Array(120).fill([0xff, 0xda]).flat());
  const metadataBase = await nonUniformCmyk(128);
  await fixture('CMYK post-scan COM with marker-shaped metadata', Buffer.concat([metadataBase.subarray(0, metadataBase.length - 2), segment(0xfe, metadataMarkers), metadataBase.subarray(metadataBase.length - 2)]), NON_UNIFORM, grid);
  // Non-uniform CMYK: Adobe CMYK, YCCK, no Adobe marker, EXIF orientation, EXIF plus embedded profile, and the 2048 upload ceiling.
  const base = await nonUniformCmyk(256);
  await fixture('non-uniform CMYK 256', base, NON_UNIFORM, grid);
  await fixture('non-uniform CMYK 256 YCCK', withTransform(base, 2), NON_UNIFORM, grid);
  await fixture('non-uniform CMYK 256 no Adobe', withoutAdobe(base), NON_UNIFORM, grid);
  await fixture('non-uniform CMYK 256 EXIF orientation 6', insertAfterSoi(base, exif(6)), NON_UNIFORM, grid);
  await fixture('non-uniform CMYK 256 EXIF orientation 3 + ICC', insertAfterSoi(base, exif(3), profile), NON_UNIFORM, grid);
  const cmyk2048 = await nonUniformCmyk(2048);
  if (cmyk2048.length > 900 * 1024) throw new Error(`non-uniform CMYK 2048 fixture is ${cmyk2048.length} bytes, over the upload limit`);
  await fixture('non-uniform CMYK 2048', cmyk2048, NON_UNIFORM, grid);
  const rgb2048 = await sharp(art(2048), { raw: { width: 2048, height: 2048, channels: 3 } }).jpeg().toBuffer();
  const png16 = await sharp({ create: { width:2048,height:2048,channels:4,background:{r:190,g:40,b:100,alpha:0.5} } }).withIccProfile('p3').toColourspace('rgb16').png().toBuffer();
  const strip = Buffer.alloc(128*256*4);
  for (let y=0;y<256;y++) for (let x=0;x<128;x++) { const at=(y*128+x)*4; strip[at]=y<128?255:0; strip[at+2]=y<128?0:255; strip[at+3]=y<128?128:255; }
  // Enlarge the canvas and offset the first frame; the ANIM background is deliberately non-white.
  const offsetFrame = animated => {
    const offset = Buffer.from(animated);
    offset.writeUIntLE(255,24,3); offset.writeUIntLE(255,27,3);
    offset.set([30,80,220,255],offset.indexOf('ANIM')+8);
    offset.writeUIntLE(16,offset.indexOf('ANMF')+8,3); offset.writeUIntLE(24,offset.indexOf('ANMF')+11,3);
    return offset;
  };
  const animated = await sharp(strip, { raw: { width:128,height:256,channels:4,pageHeight:128 } }).webp({ lossless:true,delay:[100,100] }).toBuffer();
  await fixture('animated first frame', animated, TIGHT);
  await fixture('animated offset first frame', offsetFrame(animated), ANIMATED_OFFSET);
  const lossy = await sharp(strip, { raw: { width:128,height:256,channels:4,pageHeight:128 } }).webp({ lossless:false,delay:[100,100] }).toBuffer();
  await fixture('animated lossy first frame', lossy, ANIMATED_LOSSY);
  await fixture('animated lossy offset first frame', offsetFrame(lossy), ANIMATED_OFFSET);
  const mismatch = Buffer.from(animated); mismatch.writeUIntLE(126,mismatch.indexOf('ANMF')+14,3);

  // Hostile CMYK must stay rejected inside workerd: a visible 128x128 frame hiding a 65535-wide one behind a short DQT length.
  const small = await sharp({ create: { width:128,height:128,channels:3,background:'#3377cc' } }).toColourspace('cmyk').jpeg().toBuffer();
  const sof = sofAt(small), frame = small.subarray(sof, sof + 2 + small.readUInt16BE(sof + 2));
  const hidden = Buffer.from(frame); hidden.writeUInt16BE(65535, 7);
  const trick = Buffer.concat([Buffer.from([0xff, 0xdb, 0, 3, 0]), frame, segment(0xfe, Buffer.alloc(64 - frame.length - 2, 0x20)), hidden]);
  rejects.push({ name: 'CMYK hidden 65535-wide SOF', input: Buffer.concat([small.subarray(0, sof), trick, small.subarray(sof + frame.length)]).toString('base64') });
  rejects.push({ name: 'CMYK truncated', input: small.subarray(0, Math.floor(small.length * 0.6)).toString('base64') });
  const manyScans = manyScanCmyk();
  rejects.push({ name: 'CMYK malformed DQT after 10001 scans', input: Buffer.concat([manyScans.subarray(0, -2), Buffer.from([255,219,0,3,0]), manyScans.subarray(-2)]).toString('base64') });
  rejects.push({ name: 'CMYK oversized second frame after 10001 scans', input: Buffer.concat([manyScans.subarray(0, -2), hidden, manyScans.subarray(-2)]).toString('base64') });

  await writeFile(join(dir, 'image-fixtures.mjs'), `export const image2048=${JSON.stringify(big.toString('base64'))};\nexport const oriented=${JSON.stringify(oriented.toString('base64'))};\nexport const oracle=${JSON.stringify(oracle)};\nexport const rejects=${JSON.stringify(rejects)};\nexport const mismatch=${JSON.stringify(mismatch.toString('base64'))};\nexport const cmyk2048=${JSON.stringify(cmyk2048.toString('base64'))};\nexport const rgb2048=${JSON.stringify(rgb2048.toString('base64'))};\n`);

  async function bundle(entry, outfile) {
    const modules = [];
    const result = await build({entryPoints:[entry],outfile,bundle:true,metafile:true,platform:'browser',format:'esm',conditions:['workerd','worker','browser'],plugins:[{name:'wasm',setup(b){
     b.onResolve({filter:/^\.\/image-fixtures\.mjs$/},()=>({path:join(dir,'image-fixtures.mjs')}));
     b.onResolve({filter:/^(?:module|node:module)$/},()=>({path:'node:module',external:true}));
     b.onResolve({filter:/\.icm\?url&inline$/},args=>({path:resolve(args.resolveDir,args.path.replace(/\?url&inline$/, '')),namespace:'profile'}));
     b.onLoad({filter:/.*/,namespace:'profile'},async args=>({contents:await readFile(args.path),loader:'dataurl'}));
     b.onResolve({filter:/@tanstack\/react-start\/server-only/},()=>({path:'marker',namespace:'marker'})); b.onLoad({filter:/.*/,namespace:'marker'},()=>({contents:''}));
     b.onResolve({filter:/\.wasm\?module$/},args=>{const full=resolve(args.path.startsWith('.') ? args.resolveDir : 'node_modules',args.path.replace(/\?module$/, ''));const name=`wasm${modules.length}.wasm`;modules.push({name,full});return {path:`./${name}`,external:true};});
    }}]});
    const out = outfile.slice(0, outfile.lastIndexOf('/'));
    for (const m of modules) await copyFile(m.full, join(out, m.name));
    const wasm=modules.map(m=>`(name = ${JSON.stringify(m.name)}, wasm = embed ${JSON.stringify(m.name)})`).join(',');
    await writeFile(join(out, 'config.capnp'), `using Workerd = import "/workerd/workerd.capnp";\nconst config :Workerd.Config = (services = [(name = "test", worker = (compatibilityDate = "2026-10-30", modules = [(name = "test.mjs", esModule = embed "test.mjs"),${wasm}]))]);`);
    return { ...result, source: await readFile(outfile, 'utf8'), config: join(out, 'config.capnp') };
  }

  const main = await bundle('workers-test/image.mjs', join(dir, 'test.mjs'));

  // Prepare only: never uploads, deploys or reads Cloudflare credentials.
  if (process.env.EDRA_IMAGE_PROBE_DIR) {
    const probeDir = resolve(process.env.EDRA_IMAGE_PROBE_DIR);
    // An exclusive directory prevents overwriting another task's artifacts.
    await mkdir(probeDir);
    const inputs = { rgb2048, cmyk2048, png16, manyScans };
    const source = `import { encodeAvatar } from '${resolve('src/modules/account/image.server.ts')}';
const inputs = ${JSON.stringify(Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, value.toString('base64')])))};
let active = false;
export default { async fetch(request, env) {
  if (!env.PROBE_TOKEN || request.headers.get('Authorization') !== 'Bearer ' + env.PROBE_TOKEN) return new Response(null, {status:403});
  const name = new URL(request.url).pathname.slice(1);
  if (request.method !== 'POST' || !Object.hasOwn(inputs, name)) return new Response(null, {status:404});
  if (active) return new Response(null, {status:429});
  active = true;
  try {
    const input = Uint8Array.from(atob(inputs[name]), c => c.charCodeAt(0));
    const start = performance.now(), output = await encodeAvatar(input);
    const result = {name, accepted:!!output, inputBytes:input.length, outputBytes:output?.length, elapsedMs:performance.now()-start};
    console.log(JSON.stringify(result));
    return Response.json(result, {status:output?200:422});
  } finally { active = false; }
} };`;
    const entry = join(dir, 'probe-entry.mjs');
    await writeFile(entry, source);
    await bundle(entry, join(probeDir, 'test.mjs'));
    await rm(join(probeDir, 'config.capnp'));
    await writeFile(join(probeDir, 'wrangler.json'), JSON.stringify({ name:'edra-avatar-resource-probe', main:'test.mjs', compatibility_date:'2026-10-30', compatibility_flags:['nodejs_compat'], no_bundle:true, rules:[{type:'CompiledWasm',globs:['**/*.wasm'],fallthrough:true}], observability:{enabled:true}, limits:{cpu_ms:30000} }, null, 2));
    console.log('Prepared resource probe (not deployed):', probeDir);
  }

  // The bundle must not contain sharp, and no code path that compiles Wasm from bytes may be allowed to run.
  const sharpInputs = Object.keys(main.metafile.inputs).filter(path => /node_modules\/(?:sharp|@img)\//.test(path));
  const sharpReferences = main.source.split('\n').flatMap((text, index) => /["'`]sharp["'`]|@img\/sharp|sharp-libvips|sharp-linux|sharp-wasm/.test(text) ? [`${index + 1}: ${text.trim().slice(0, 120)}`] : []);
  if (sharpInputs.length || sharpReferences.length) throw new Error(`sharp reached the runtime bundle:\n${[...sharpInputs, ...sharpReferences].join('\n')}`);
  const compileSites = main.source.split('\n').flatMap((text, index) => /WebAssembly\.(?:compile|compileStreaming|instantiateStreaming)\b|new WebAssembly\.Module\(/.test(text) ? [`${index + 1}: ${text.trim().slice(0, 120)}`] : []);
  const bytesInstantiate = main.source.split('\n').filter(text => /WebAssembly\.instantiate\((?!module,|wasmModule)/.test(text)).length;
  console.log(`bundle scan: no sharp input or specifier; ${compileSites.length} bytes/streaming compile fallback sites and ${bytesInstantiate} instantiate-from-bytes sites exist as library fallbacks; the workerd run below fails on any that executes`);
  console.log(`bundle packages: ${[...new Set(Object.keys(main.metafile.inputs).map(path => path.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean))].join(', ')}`);

  const run = (config, command = ['node_modules/.bin/workerd', 'test', config]) => {
    const start = Date.now(); const result = spawnSync(command[0], command.slice(1), { stdio: command[0] === '/usr/bin/time' ? ['inherit', 'inherit', 'pipe'] : 'inherit', encoding: 'utf8' });
    return { ...result, wall: Date.now() - start };
  };
  const result = run(main.config);
  console.log('workerd wall time ms:', result.wall);
  process.exitCode = result.status ?? 1;

  // EDRA_IMAGE_MEMORY=1: peak RSS and CPU of workerd with one non-uniform CMYK 2048 encode versus an idle worker that loaded the same code.
  if (process.env.EDRA_IMAGE_MEMORY && process.exitCode === 0) {
    const shared = `import { encodeAvatar } from '${resolve('src/modules/account/image.server.ts')}';\nimport { cmyk2048, rgb2048 } from './image-fixtures.mjs';\nconst manyScans = ${JSON.stringify(manyScans.toString('base64'))};\nconst png16 = ${JSON.stringify(png16.toString('base64'))};\nglobalThis.keep = encodeAvatar;\n`;
    const encode = fixture => `${shared}export default { async test() { const bytes = Uint8Array.from(atob(${fixture}), c => c.charCodeAt(0)); const start = performance.now(); const out = await encodeAvatar(bytes); if (!out) throw Error('rejected'); console.log('encode ms', performance.now() - start, 'output bytes', out.length); } };\n`;
    const entries = {
      idle: `${shared}export default { async test() { console.log('idle', typeof encodeAvatar, cmyk2048.length); } };\n`,
      'encode RGB 2048 JPEG': encode('rgb2048'),
      'encode CMYK 2048': encode('cmyk2048'),
      'encode 16-bit P3 PNG 2048': encode('png16'),
      'encode CMYK 10001 scans': encode('manyScans'),
    };
    const stats = {};
    for (const [name, source] of Object.entries(entries)) {
      const sub = join(dir, name.replace(/\W+/g, '-')); await mkdir(sub);
      await writeFile(join(sub, 'entry.mjs'), source);
      const built = await bundle(join(sub, 'entry.mjs'), join(sub, 'test.mjs'));
      stats[name] = [];
      for (let i = 0; i < 3; i++) {
        const timed = run(built.config, ['/usr/bin/time', '-v', 'node_modules/.bin/workerd', 'test', built.config]);
        if (timed.status !== 0) throw new Error(`${name} run failed:\n${timed.stderr}`);
        const field = label => Number(timed.stderr.match(new RegExp(`${label}[^\\n]*?([\\d.]+)\\s*$`, 'm'))?.[1]);
        stats[name].push({ rssMiB: field('Maximum resident set size \\(kbytes\\)') / 1024, cpuSeconds: field('User time \\(seconds\\)') + field('System time \\(seconds\\)'), wallMs: timed.wall });
      }
    }
    for (const [name, runs] of Object.entries(stats)) console.log(`memory ${name}: ${runs.map(r => `RSS ${r.rssMiB.toFixed(1)} MiB, CPU ${r.cpuSeconds.toFixed(2)} s, wall ${r.wallMs} ms`).join(' | ')}`);
  }
} finally { await rm(dir, { recursive: true, force: true }); }
