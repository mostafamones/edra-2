// Opt-in live Gemini regression; run math-layout.mjs first, then node --env-file=.env.local scripts/math-scan.mjs.
import {createRequire} from 'node:module';import {writeFile} from 'node:fs/promises';import {pathToFileURL,fileURLToPath} from 'node:url';import os from 'node:os';import path from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));const require=createRequire(`${root}/package.json`);const out=path.join(os.tmpdir(),'edra-math-layout');
const {mathExamples,MathText,renderToStaticMarkup,createElement,renderMath,splitMath,normalizeMathSource}=require(`${out}/renderer.cjs`);
const indices=[0,1,2,4,5,6,9,11,12,22,25,26];const cases=indices.map(index=>mathExamples[index]);
const rows=cases.map((example,index)=>`<section><strong>${index+1}.</strong>${renderToStaticMarkup(createElement(MathText,{value:`\\(${example.source}\\)`}))}</section>`).join('');
const html=`<!doctype html><html><meta charset="utf-8"><style>body{background:white;color:black;margin:40px;font:28px 'Segoe UI'}h1{font-size:28px;text-align:center}main{display:grid;grid-template-columns:1fr 1fr;gap:16px}section{display:flex;gap:24px;align-items:center;min-height:155px;border-bottom:1px solid #ccc}bdi{display:inline-block;direction:ltr;unicode-bidi:isolate}math{math-style:normal;font-size:30px}strong{font:22px 'Segoe UI'}</style><h1>بسط المقادير الآتية:</h1><main>${rows}</main></html>`;
const {chromium}=require('@playwright/test');const browser=await chromium.launch({channel:'msedge',headless:true});let jpeg;
try{const page=await browser.newPage({viewport:{width:1400,height:1220}});await page.setContent(html);jpeg=await page.screenshot({type:'jpeg',quality:95,fullPage:true,path:`${out}/scan-source.jpg`});}finally{await browser.close()}
await require('esbuild').build({entryPoints:[`${root}/src/modules/question-bank/gemini.ts`],bundle:true,platform:'node',format:'esm',outfile:`${out}/scan-gemini.mjs`});
const {inspectQuestionPages}=await import(pathToFileURL(`${out}/scan-gemini.mjs`));let calls=0;
const fetcher=async(url,options)=>{calls++;if(process.env.MATH_SCAN_MODEL&&JSON.parse(options.body).systemInstruction.parts[0].text.startsWith('Transcribe'))url=String(url).replace(/models\/[^:]+/,`models/${process.env.MATH_SCAN_MODEL}`);const response=await fetch(url,options);console.log(JSON.stringify({call:calls,status:response.status,model:String(url).split('/models/')[1].split(':')[0]}));if(response.ok)await writeFile(`${out}/scan-call${calls}.json`,await response.clone().text());return response};
let transcription;const result=await inspectQuestionPages([{number:1,image:jpeg.toString('base64'),scan:true}],process.env.GEMINI_API_KEY,fetcher,[],false,value=>{transcription=value});
await writeFile(`${out}/scan-result.json`,JSON.stringify({cases,result,transcription},null,2));
const checkBrowser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await checkBrowser.newPage();const comparisons=[];for(const [index,example]of cases.entries()){
 const question=result.pages[0].questions.find(q=>q.number?.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660))===String(index+1));
 const source=question?splitMath(normalizeMathSource(question.prompt)).filter(s=>s.kind==='math').map(s=>s.value).join(''):'';
 const expectedHtml=renderMath(example.source);let actualHtml='';try{if(source)actualHtml=renderMath(source)}catch{}
 const signatures=await page.evaluate(([expected,actual])=>{
 const normalize=value=>value.replace(/\s/g,'').replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0)).replace(/−/g,'-');
 function walk(el){if(el.nodeType===3)return normalize(el.textContent);if(el.nodeType!==1||el.localName==='annotation')return '';const children=[...el.childNodes].map(walk);return ['mfrac','msqrt','mroot','msup','msub','msubsup'].includes(el.localName)?`${el.localName}(${children.join('|')})`:children.join('')}
 return [expected,actual].map(html=>{const doc=new DOMParser().parseFromString(html,'text/html');return walk(doc.querySelector('math')??doc.body)})
 },[expectedHtml,actualHtml]);
 comparisons.push({number:index+1,name:example.name,match:signatures[0]===signatures[1],expected:example.source,actual:source,signatures,check:question?.check});
 }
 await writeFile(`${out}/scan-comparisons.json`,JSON.stringify(comparisons,null,2));if(comparisons.some(c=>!c.match))process.exitCode=1;console.log(JSON.stringify({count:result.pages[0].questions.length,calls,matches:comparisons.filter(c=>c.match).length,total:cases.length,mismatches:comparisons.filter(c=>!c.match)},null,2));
}finally{await checkBrowser.close()}
