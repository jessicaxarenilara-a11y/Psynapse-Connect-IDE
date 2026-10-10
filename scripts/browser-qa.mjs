// Isolated UI verification server. Never used by npm start.
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
process.env.NODE_ENV='test';
process.env.DATA_DIR=mkdtempSync(path.join(tmpdir(),'psynapse-browser-'));
const realFetch=globalThis.fetch;
const live=await realFetch('https://openrouter.ai/api/v1/models').then(r=>r.json());
globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith('https://openrouter.ai/api/v1/')){
 if(String(url).endsWith('/models'))return new Response(JSON.stringify(live));
 const input=JSON.parse(options.body),allText=JSON.stringify(input),prompt=input.messages?.at(-1)?.content||input.input?.at(-1)?.content||input.contents?.at(-1)?.parts?.[0]?.text||'';
 const change=allText.includes('modo PLAN')?{action:'explain',summary:'Prueba simulada: plan para crear una página con contador, estilos y JavaScript. No se escribieron archivos.',files:[]}:prompt.includes('CSS')?{action:'edit',summary:'Prueba simulada: CSS actualizado.',files:[{path:'style.css',edits:[{find:'color: green',replace:'color: blue'}]}]}:{action:'create',summary:'Prueba simulada: página creada.',files:[{path:'index.html',content:'<h1>Página de prueba</h1><button id="counter">Clics: 0</button>'},{path:'style.css',content:'body { color: green; font-family: system-ui; }'},{path:'script.js',content:'let n=0; document.querySelector("#counter").onclick=function(){this.textContent="Clics: "+(++n)};'}]};
 const content=JSON.stringify(change);let result={choices:[{finish_reason:'stop',message:{content}}]};if(String(url).endsWith('/responses'))result={status:'completed',output:[{type:'message',content:[{type:'output_text',text:content}]}]};if(String(url).endsWith('/messages'))result={stop_reason:'end_turn',content:[{type:'text',text:content}]};if(String(url).endsWith(':generateContent'))result={candidates:[{finishReason:'STOP',content:{parts:[{text:content}]}}]};if(String(url).endsWith('/systemone'))result={can_build:{value:true,probability:0.9}};
 return new Response(JSON.stringify(result));
 }return realFetch(url,options);
};
process.env.CONNECTION_KEY_FILE=process.env.DATA_DIR+'-master.key';
const {server}=await import('../server.mjs');
server.listen(3002,'127.0.0.1',()=>console.log('QA SIMULADA: http://localhost:3002 · Catálogo OpenRouter real, generación simulada, datos temporales.'));
process.on('SIGINT',()=>server.close(()=>{rmSync(process.env.DATA_DIR,{recursive:true,force:true});rmSync(process.env.CONNECTION_KEY_FILE,{force:true});process.exit()}));
