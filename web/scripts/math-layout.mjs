// Run after npm run build. Uses built CSS and native Edge; never starts a server.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(path.join(root, "package.json"));
const out = path.join(os.tmpdir(), "edra-math-layout");
await mkdir(out, { recursive: true });
await require("esbuild").build({
  stdin: { contents: `export { mathExamples } from './src/lib/math.fixtures'; export { QuestionTextField } from './src/modules/question-bank/text-field'; export { MathText } from './src/components/shared/math-text'; export { renderMath, splitMath, normalizeMathSource } from './src/lib/math'; export { renderToStaticMarkup } from 'react-dom/server'; export { createElement } from 'react';`, resolveDir: root, loader: "tsx" },
  bundle: true, platform: "node", format: "cjs", outfile: path.join(out, "renderer.cjs"),
});
const { mathExamples, QuestionTextField, renderToStaticMarkup, createElement } = require(path.join(out, "renderer.cjs"));
const assets = path.join(root, "dist/client/_build/assets");
const css = (await Promise.all((await readdir(assets)).filter(name => name.endsWith(".css")).map(name => readFile(path.join(assets, name), "utf8")))).join("\n");
const cases = mathExamples.flatMap(example => [false, true].map(display => ({ ...example, display })));
const cards = cases.map((example, index) => `<article data-case="${index}">${renderToStaticMarkup(createElement(QuestionTextField, {
  id: `math-${index}`, label: example.name, multiline: true,
  value: `${Math.floor(index / 2) % 2 ? "أوجد قيمة" : "Calculate"} ${example.display ? `\\[${example.source}\\]` : `\\(${example.source}\\)`}`, onChange() {},
}))}</article>`).join("");
const html = `<!doctype html><html><meta charset="utf-8"><style>${css}</style><style>body{padding:16px;font-family:'Segoe UI',sans-serif}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,400px),1fr));gap:16px}article{min-width:0;padding:12px;border:1px solid var(--border);border-radius:12px}</style><main>${cards}</main></html>`;
await writeFile(path.join(out, "gallery.html"), html);
const { chromium } = require("@playwright/test");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const results = [];
try {
  const page = await browser.newPage();
  await page.setContent(html);
  for (const theme of ["light", "dark"]) for (const width of [320, 360, 740, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(theme => document.documentElement.classList.toggle("dark", theme === "dark"), theme);
    const metrics = await page.evaluate(() => {
      const errors = [];
      const scrolling = [];
      for (const card of document.querySelectorAll("article")) {
        const name = card.querySelector("label").textContent;
        const math = card.querySelector("math");
        const surface = card.querySelector('div[role="group"][aria-labelledby]');
        if (!math) { errors.push(`${name}: missing MathML`); continue; }
        if (card.querySelector("textarea,input")) errors.push(`${name}: source visible by default`);
        const box = surface.getBoundingClientRect(), equation = math.getBoundingClientRect();
        if (equation.top < box.top || equation.bottom > box.bottom) errors.push(`${name}: vertically clipped`);
        if ([...card.querySelectorAll("bdi")].some(el => ["auto", "scroll"].includes(getComputedStyle(el).overflowY))) errors.push(`${name}: equation scroll container`);
        if (surface.scrollHeight > surface.clientHeight) errors.push(`${name}: vertical surface overflow`);
        if (surface.scrollWidth > surface.clientWidth) {
          scrolling.push(name);
          const original = surface.scrollLeft;
          surface.scrollLeft = surface.scrollWidth; const right = surface.scrollLeft;
          surface.scrollLeft = -surface.scrollWidth; const left = surface.scrollLeft;
          surface.scrollLeft = original;
          if (Math.abs(right - left) < surface.scrollWidth - surface.clientWidth - 1) errors.push(`${name}: unreachable horizontal overflow`);
        }
      }
      return { cards: document.querySelectorAll("article").length, errors, scrolling, pageOverflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.equal(metrics.cards, cases.length);
    assert.deepEqual(metrics.errors, [], `${theme} ${width}px`);
    assert.equal(metrics.pageOverflow, false, `${theme} ${width}px page overflow`);
    if (width <= 360) assert.ok(metrics.scrolling.includes("long equation requiring horizontal scrolling"), JSON.stringify(metrics));
    results.push({ theme, width, ...metrics });
    if (width === 1440) {
      await page.addStyleTag({ content: "article:nth-child(n+28){display:none}" });
      await page.screenshot({ path: path.join(out, `gallery-${theme}.png`), fullPage: true });
      await page.evaluate(() => document.querySelector("style:last-of-type").remove());
      await page.addStyleTag({ content: "article:nth-child(-n+54){display:none}" });
      await page.screenshot({ path: path.join(out, `gallery-advanced-${theme}.png`), fullPage: true });
      await page.evaluate(() => document.querySelector("style:last-of-type").remove());
    }
  }
} finally { await browser.close(); }
await writeFile(path.join(out, "results.json"), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ examples: mathExamples.length, layouts: results.length, out, results }, null, 2));
