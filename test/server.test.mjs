import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {clearZenCache} from '../zen-provider.mjs';
process.env.NODE_ENV='test';
const dir=mkdtempSync(path.join(tmpdir(),'psynapse-test-'));process.env.DATA_DIR=dir;process.env.CONNECTION_KEY_FILE=path.join(dir+'-vault','master.key');
let {server}=await import('../server.mjs');
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
async function request(route,method='GET',data,cookie,extra={}){const r=await fetch(origin+route,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...extra},body:data?JSON.stringify(data):undefined});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]}}
after(async()=>{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});rmSync(dir+'-vault',{recursive:true,force:true})});
test('cuentas, proyectos privados, validaciones y sesiones',async()=>{
 const credentials={email:'alice@example.com',password:'password-test-123'};
 const alice=await request('/api/register','POST',credentials);assert.equal(alice.status,200);assert.ok(alice.cookie);
 const bob=await request('/api/register','POST',{email:'bob@example.com',password:'password-test-456'});assert.equal(bob.status,200);
 assert.equal((await request('/api/login','POST',{...credentials,password:'wrong-password'})).status,401);
 assert.equal((await request('/api/register','POST',credentials)).status,409);
 assert.equal((await request('/api/projects')).status,401);
 const p=await request('/api/projects','POST',{name:'Privado',html:'<h1>Hola</h1>',css:'h1{color:red}',js:''},alice.cookie);assert.equal(p.status,201);
 assert.equal((await request('/api/projects','GET',undefined,bob.cookie)).data.length,0);
 assert.equal((await request('/api/projects/'+p.data.id,'PUT',{name:'Intrusión',html:'',css:'',js:''},bob.cookie)).status,404);
 assert.equal((await request('/api/projects/'+p.data.id,'DELETE',{},bob.cookie)).status,404);
 assert.equal((await request('/api/projects/'+p.data.id,'PUT',{name:'Actualizado',html:'<p>Guardado</p>',css:'',js:''},alice.cookie)).status,200);
 const stored=JSON.parse(readFileSync(path.join(dir,'store.json'),'utf8'));assert.equal(stored.projects[0].html,'<p>Guardado</p>');assert.ok(stored.users[0].hash);assert.equal(stored.users[0].password,undefined);assert.ok(!JSON.stringify(stored).includes(credentials.password));
 assert.equal((await request('/api/projects','POST',{name:'',html:'',css:'',js:''},alice.cookie)).status,400);
 assert.equal((await request('/api/projects','POST',{name:'CSRF',html:'',css:'',js:''},alice.cookie,{Origin:'https://attacker.example'})).status,403);
 assert.equal((await request('/api/keys','POST',{provider:'unknown',key:'some-secret'},alice.cookie)).status,400);
 assert.equal((await request('/api/chat','POST',{provider:'groq',messages:[]},alice.cookie)).status,400);
 const login=await request('/api/login','POST',credentials);assert.equal(login.status,200);assert.equal((await request('/api/projects','GET',undefined,login.cookie)).data[0].name,'Actualizado');
 assert.equal((await request('/api/logout','POST',{},login.cookie)).status,200);assert.equal((await request('/api/me','GET',undefined,login.cookie)).status,401);
 assert.equal((await request('/api/projects/'+p.data.id,'DELETE',{},alice.cookie)).status,200);
});
test('frontend y políticas de aislamiento',async()=>{
 const r=await fetch(origin);assert.equal(r.status,200);assert.ok(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));const html=await r.text();assert.ok(html.includes('sandbox="allow-scripts"'));assert.ok(!html.includes('allow-same-origin'));
 assert.equal((await fetch(origin+'/app.js')).status,200);assert.equal((await fetch(origin+'/data/store.json')).status,404);
});
test('OpenRouter y Groq: claves cifradas, modelos y chat con contexto',async()=>{
 const realFetch=globalThis.fetch;const calls=[];
 globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith('https://openrouter.ai/')||String(url).startsWith('https://api.groq.com/')){calls.push({url,options});return new Response(JSON.stringify(String(url).endsWith('/models')?{data:[{id:'test/model'}]}:{choices:[{message:{content:JSON.stringify({action:'explain',summary:'Respuesta de prueba',files:[]})}}]}),{status:200,headers:{'Content-Type':'application/json'}})}
 return realFetch(url,options)
 };
 try{
 const alice=await request('/api/login','POST',{email:'alice@example.com',password:'password-test-123'});
 const project=await request('/api/projects','POST',{name:'IA',html:'<p>Contexto privado</p>',css:'',js:''},alice.cookie);
 for(const provider of ['openrouter','groq']){
 assert.equal((await request('/api/keys','POST',{provider,key:'test-private-key-123'},alice.cookie)).status,200);
 assert.deepEqual((await request('/api/models?provider='+provider,'GET',undefined,alice.cookie)).data.models,['test/model']);
 const answer=await request('/api/chat','POST',{provider,model:'test/model',projectId:project.data.id,messages:[{role:'user',content:'Ayuda'}]},alice.cookie);assert.equal(answer.data.content,'Respuesta de prueba');
 const call=calls.at(-1);assert.equal(call.options.headers.Authorization,'Bearer test-private-key-123');assert.ok(JSON.parse(call.options.body).messages[0].content.includes('Contexto privado'));
 const blocked=await request('/api/chat','POST',{provider,model:'test/model',onlyFree:true,projectId:project.data.id,messages:[{role:'user',content:'Crea una página'}]},alice.cookie);assert.equal(blocked.status,409);assert.ok(blocked.data.error.includes('No se cambió'));
 }
 const preview=await request('/api/preview','POST',{html:'<h1>Aislado</h1>',css:'',js:''},alice.cookie);assert.equal(preview.status,200);
 const page=await fetch(origin+preview.data.url,{headers:{Cookie:alice.cookie}});assert.equal(page.status,200);assert.ok(page.headers.get('content-security-policy').includes('sandbox allow-scripts'));assert.ok((await page.text()).includes('<h1>Aislado</h1>'));
 assert.equal((await request(preview.data.url)).status,401);
 assert.ok(!readFileSync(path.join(dir,'store.json'),'utf8').includes('test-private-key-123'));
 await request('/api/keys','POST',{provider:'groq',key:''},alice.cookie);assert.equal((await request('/api/models?provider=groq','GET',undefined,alice.cookie)).status,400);
 }finally{globalThis.fetch=realFetch}
});
test('crear, editar, deshacer, respuestas inválidas y conflictos de concurrencia',async()=>{
 const realFetch=globalThis.fetch;let response;let duringCall;const prompts=[];
 globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith('https://api.groq.com/')){if(String(url).endsWith('/models'))return new Response(JSON.stringify({data:[{id:'test/model'}]}));prompts.push(JSON.parse(options.body));if(duringCall){const fn=duringCall;duringCall=null;await fn()}return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}]}))}return realFetch(url,options)
 };
 try{
 const alice=await request('/api/login','POST',{email:'alice@example.com',password:'password-test-123'});const bob=await request('/api/login','POST',{email:'bob@example.com',password:'password-test-456'});
 const original={name:'Flujo IA',html:'<p>Original</p>',css:'body { color: black; }',js:'const original = true;'};
 const created=await request('/api/projects','POST',original,alice.cookie);const id=created.data.id;
 await request('/api/keys','POST',{provider:'groq',key:'test-private-key-123'},alice.cookie);await request('/api/keys','POST',{provider:'groq',key:'test-bob-key-123'},bob.cookie);
 const chat=(cookie=alice.cookie)=>request('/api/chat','POST',{provider:'groq',model:'test/model',projectId:id,messages:[{role:'user',content:'Construye mi página'}]},cookie);
 response={action:'create',summary:'Página creada.',files:[{path:'index.html',content:'<h1>Hola</h1><p>Conservar</p>'},{path:'style.css',content:'body { color: red; }\np { margin: 2px; }'},{path:'script.js',content:'const count = 1;'}]};
 const build=await chat();assert.equal(build.status,200);assert.equal(build.data.changed.length,3);assert.equal(build.data.project.canUndo,true);assert.equal(build.data.project.versions,undefined);
 response={action:'edit',summary:'Color actualizado.',files:[{path:'style.css',edits:[{find:'color: red',replace:'color: blue'}]}]};
 const edit=await chat();assert.equal(edit.status,200);assert.equal(edit.data.project.css,'body { color: blue; }\np { margin: 2px; }');assert.equal(edit.data.project.html,build.data.project.html);assert.equal(edit.data.project.js,build.data.project.js);assert.ok(prompts.at(-1).messages[0].content.includes('color: red'));
 const versionCount=JSON.parse(readFileSync(path.join(dir,'store.json'),'utf8')).projects.find(p=>p.id===id).versions.length;
 response={action:'explain',summary:'El color está en CSS.',files:[]};assert.equal((await chat()).status,200);assert.equal(JSON.parse(readFileSync(path.join(dir,'store.json'),'utf8')).projects.find(p=>p.id===id).versions.length,versionCount);
 assert.equal((await request('/api/projects/'+id+'/undo','POST',{revision:edit.data.project.revision},bob.cookie)).status,404);assert.equal((await chat(bob.cookie)).status,404);
 const undo=await request('/api/projects/'+id+'/undo','POST',{revision:edit.data.project.revision},alice.cookie);assert.equal(undo.status,200);assert.equal(undo.data.project.css,build.data.project.css);
 assert.equal((await request('/api/projects/'+id+'/undo','POST',{revision:edit.data.project.revision},alice.cookie)).status,409);
 for(const files of [[{path:'../secret',content:'oops'}],[{path:'script.js',edits:[{find:'const count = 1;',replace:'const = ;'}]}],[{path:'style.css',edits:[{find:'not found',replace:'x'}]}]]){response={action:'edit',summary:'Inválido',files};assert.equal((await chat()).status,422)}
 let latest=undo.data.project;response={action:'edit',summary:'Cambio tardío',files:[{path:'style.css',edits:[{find:'color: red',replace:'color: green'}]}]};duringCall=async()=>{const saved=await request('/api/projects/'+id,'PUT',{name:latest.name,html:latest.html,css:latest.css+'\n/* Edición externa */',js:latest.js,revision:latest.revision},alice.cookie);assert.equal(saved.status,200);latest=saved.data};assert.equal((await chat()).status,409);
 const actual=(await request('/api/projects','GET',undefined,alice.cookie)).data.find(p=>p.id===id);assert.ok(actual.css.includes('Edición externa'));assert.ok(!actual.css.includes('green'));
 const disk=JSON.parse(readFileSync(path.join(dir,'store.json'),'utf8')).projects.find(p=>p.id===id);assert.equal(disk.versions[0].html,original.html);
 }finally{globalThis.fetch=realFetch}
});
test('cuota agotada no cambia a otro modelo ni escribe archivos',async()=>{
 const realFetch=globalThis.fetch;let completions=0;
 globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith('https://openrouter.ai/')){if(String(url).endsWith('/models'))return new Response(JSON.stringify({data:[{id:'test/free:free',pricing:{prompt:'0',completion:'0'}},{id:'test/paid',pricing:{prompt:'1',completion:'1'}}]}));completions++;assert.equal(JSON.parse(options.body).model,'test/free:free');return new Response(JSON.stringify({error:{message:'Quota exhausted'}}),{status:429})}return realFetch(url,options)
 };
 try{const login=await request('/api/login','POST',{email:'alice@example.com',password:'password-test-123'});await request('/api/keys','POST',{provider:'openrouter',key:'test-key-quota-123'},login.cookie);const p=await request('/api/projects','POST',{name:'Cuota',html:'<p>Sin cambios</p>',css:'',js:''},login.cookie);const answer=await request('/api/chat','POST',{provider:'openrouter',model:'test/free:free',onlyFree:true,projectId:p.data.id,messages:[{role:'user',content:'Crea una página'}]},login.cookie);assert.equal(answer.status,429);assert.ok(answer.data.error.includes('No se cambió a un modelo de pago'));assert.equal(completions,1);assert.equal((await request('/api/projects','GET',undefined,login.cookie)).data.find(x=>x.id===p.data.id).html,p.data.html)}finally{globalThis.fetch=realFetch}
});

test('conexiones cifradas sobreviven logout y reinicio; probar, reemplazar, eliminar e aislamiento',async()=>{
 const realFetch=globalThis.fetch;const aliceCredentials={email:'alice@example.com',password:'password-test-123'},bobCredentials={email:'bob@example.com',password:'password-test-456'};
 const secrets={openrouter:'persistent-alice-openrouter-secret-9876',groq:'persistent-alice-groq-secret-6543'};let seen=[],reject=false,echo=false;
 globalThis.fetch=async(url,options)=>{if(String(url).startsWith('https://openrouter.ai/')||String(url).startsWith('https://api.groq.com/')){seen.push(options.headers.Authorization);if(reject)return new Response('{}',{status:401});return new Response(JSON.stringify(String(url).endsWith('/models')?{data:[{id:'test/model'}]}:{choices:[{message:{content:JSON.stringify({action:'explain',summary:echo?secrets.openrouter:'Hola',files:[]})}}]}))}return realFetch(url,options)};
 try{
 let alice=await request('/api/login','POST',aliceCredentials);const bob=await request('/api/login','POST',bobCredentials);
 for(const provider of Object.keys(secrets)){const saved=await request('/api/connections','POST',{provider,key:secrets[provider],plan:'free'},alice.cookie);assert.equal(saved.status,200);assert.ok(!JSON.stringify(saved.data).includes(secrets[provider]));assert.ok(saved.data.connections.find(c=>c.provider===provider).masked.endsWith(secrets[provider].slice(-4)))}
 const disk=readFileSync(path.join(dir,'store.json'),'utf8');for(const key of Object.values(secrets))assert.ok(!disk.includes(key));assert.ok(JSON.parse(disk).users.find(u=>u.email===aliceCredentials.email).connections.openrouter.secret.ciphertext);assert.ok(!disk.includes(readFileSync(process.env.CONNECTION_KEY_FILE).toString('base64')));
 await request('/api/connections','POST',{provider:'groq',key:''},bob.cookie);assert.equal((await request('/api/connections/test','POST',{provider:'groq'},bob.cookie)).status,400);assert.ok(!(await request('/api/me','GET',undefined,bob.cookie)).data.connected.includes('groq'));assert.equal((await request('/api/connections/test','POST',{provider:'groq'},alice.cookie)).status,200);assert.equal(seen.at(-1),'Bearer '+secrets.groq);
 reject=true;assert.equal((await request('/api/connections','POST',{provider:'groq',key:'invalid-replacement-123'},alice.cookie)).status,400);reject=false;await request('/api/connections/test','POST',{provider:'groq'},alice.cookie);assert.equal(seen.at(-1),'Bearer '+secrets.groq);
 assert.equal((await request('/api/logout','POST',{},alice.cookie)).status,200);assert.equal((await request('/api/me','GET',undefined,alice.cookie)).status,401);alice=await request('/api/login','POST',aliceCredentials);assert.deepEqual(alice.data.connected.sort(),['groq','openrouter']);await request('/api/connections/test','POST',{provider:'groq'},alice.cookie);assert.equal(seen.at(-1),'Bearer '+secrets.groq);
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));({server}=await import('../server.mjs?restart='+Date.now()));await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));assert.equal((await request('/api/me','GET',undefined,alice.cookie)).status,401);alice=await request('/api/login','POST',aliceCredentials);assert.deepEqual(alice.data.connected.sort(),['groq','openrouter']);for(const provider of Object.keys(secrets)){await request('/api/connections/test','POST',{provider},alice.cookie);assert.equal(seen.at(-1),'Bearer '+secrets[provider])}
 const p=await request('/api/projects','POST',{name:'No secretos',html:'<p>Seguro</p>',css:'',js:''},alice.cookie);echo=true;const answer=await request('/api/chat','POST',{provider:'openrouter',model:'test/model',projectId:p.data.id,messages:[{role:'user',content:'Explica'}]},alice.cookie);assert.equal(answer.status,422);assert.ok(!JSON.stringify(answer.data).includes(secrets.openrouter));assert.equal((await request('/api/projects','POST',{name:'Secreto',html:secrets.openrouter,css:'',js:''},alice.cookie)).status,422);
 const replacement='new-alice-groq-secret-1111';await request('/api/connections','POST',{provider:'groq',key:replacement},alice.cookie);await request('/api/connections/test','POST',{provider:'groq'},alice.cookie);assert.equal(seen.at(-1),'Bearer '+replacement);await request('/api/connections','POST',{provider:'groq',key:''},alice.cookie);assert.equal((await request('/api/connections/test','POST',{provider:'groq'},alice.cookie)).status,400);assert.ok(!JSON.parse(readFileSync(path.join(dir,'store.json'),'utf8')).users.find(u=>u.email===aliceCredentials.email).connections.groq);
 }finally{globalThis.fetch=realFetch}
});

test('Google: catálogo paginado, chat, claves cifradas, gratuidad y persistencia',async()=>{
 const realFetch=globalThis.fetch;let result={action:'explain',summary:'Plan de prueba',files:[]},calls=[],status=200,pricingUnavailable=false,freeRemoved=false;
 const prices='<h2>Gemini 2.5 Flash</h2><code>gemini-2.5-flash</code><table><tr><th></th><th>Free Tier</th><th>Paid Tier</th></tr><tr><td>Input price</td><td>Free of charge</td><td>$0.30</td></tr><tr><td>Output price</td><td>Free of charge</td><td>$2.50</td></tr></table>';
 globalThis.fetch=async(url,options)=>{
 const u=String(url);if(u.startsWith('https://ai.google.dev/gemini-api/docs/pricing'))return new Response(pricingUnavailable?'unavailable':freeRemoved?prices.replaceAll('Free of charge','Not available'):prices,{status:pricingUnavailable?503:200});
 if(u.startsWith('https://generativelanguage.googleapis.com/v1beta')||u.startsWith('https://api.cerebras.ai/v1')){
  calls.push({url:u,options});if(status!==200)return new Response('{}',{status});
  if(u.includes('/models')&&!u.endsWith(':generateContent'))return new Response(JSON.stringify(u.includes('googleapis')?(u.includes('pageToken')?{models:[{name:'models/gemini-unknown',displayName:'Otro',supportedGenerationMethods:['generateContent']}]}:{models:[{name:'models/gemini-2.5-flash',displayName:'Gemini Flash',supportedGenerationMethods:['generateContent']},{name:'models/embedding',supportedGenerationMethods:['embedContent']}],nextPageToken:'second-page'}):{data:[{id:'gpt-oss-120b'}]}));
  return new Response(JSON.stringify(u.endsWith(':generateContent')?{candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(result)}]}}]}:{choices:[{message:{content:JSON.stringify(result)},finish_reason:'stop'}]}));
 }return realFetch(url,options)};
 try{
 const credentials={email:'cloud-qa@example.com',password:'cloud-test-password'};let login=await request('/api/register','POST',credentials);const keys={google:'fake-google-key-1122'};
 for(const provider of Object.keys(keys)){const saved=await request('/api/connections','POST',{provider,key:keys[provider],plan:'free'},login.cookie);assert.equal(saved.status,200);assert.equal(saved.data.catalog.length,provider==='google'?2:1);assert.ok(!JSON.stringify(saved.data).includes(keys[provider]));assert.ok(!readFileSync(path.join(dir,'store.json'),'utf8').includes(keys[provider]));}
 assert.ok(calls.some(c=>c.url.includes('pageToken=second-page')));const googleCall=calls.find(c=>c.url.includes('googleapis'));assert.equal(googleCall.options.headers['x-goog-api-key'],keys.google);assert.ok(!googleCall.url.includes(keys.google));
 const p=await request('/api/projects','POST',{name:'Cloud',html:'<p>Antes</p>',css:'',js:''},login.cookie);
 const chat=(provider,mode='plan',onlyFree=false)=>request('/api/chat','POST',{provider,model:provider==='google'?'gemini-2.5-flash':'gpt-oss-120b',mode,onlyFree,projectId:p.data.id,messages:[{role:'user',content:'Crea una página'}]},login.cookie);
 for(const provider of Object.keys(keys)){assert.equal((await request('/api/connections/test','POST',{provider},login.cookie)).status,200);assert.equal((await chat(provider)).status,200);}
 assert.equal((await chat('google','plan',true)).status,200);assert.equal((await chat('cerebras','build',true)).status,400);
 for(const unavailable of [false,true]){pricingUnavailable=unavailable;freeRemoved=!unavailable;const before=calls.filter(c=>c.url.endsWith(':generateContent')||c.url.endsWith('/chat/completions')).length;const blocked=await chat('google','build',true);assert.equal(blocked.status,409);assert.equal(calls.filter(c=>c.url.endsWith(':generateContent')||c.url.endsWith('/chat/completions')).length,before);}pricingUnavailable=false;freeRemoved=false;
 result={action:'create',summary:'Página cloud',files:[{path:'index.html',content:'<h1>Cloud</h1>'},{path:'style.css',content:'body { color: green; }'},{path:'script.js',content:''}]};assert.equal((await chat('google','plan',true)).status,422);for(const provider of Object.keys(keys)){result.files[0].content='<h1>'+provider+'</h1>';const build=await chat(provider,'build');assert.equal(build.status,200);assert.equal(build.data.project.canUndo,true);}
 result={action:'explain',summary:'Plan',files:[]};status=429;assert.equal((await chat('google')).status,502);status=200;
 await request('/api/logout','POST',{},login.cookie);login=await request('/api/login','POST',credentials);assert.deepEqual(login.data.connected.sort(),['google']);const port=server.address().port;await new Promise(resolve=>server.close(resolve));({server}=await import('../server.mjs?cloudRestart='+Date.now()));await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));login=await request('/api/login','POST',credentials);assert.deepEqual(login.data.connected.sort(),['google']);
 const other=await request('/api/login','POST',{email:'bob@example.com',password:'password-test-456'});for(const provider of Object.keys(keys)){assert.equal((await request('/api/connections/test','POST',{provider},other.cookie)).status,400);assert.equal((await request('/api/connections/test','POST',{provider},login.cookie)).status,200);await request('/api/connections','POST',{provider,key:'replacement-cloud-key-5566',plan:'free'},login.cookie);await request('/api/connections','POST',{provider,key:''},login.cookie);assert.equal((await request('/api/connections/test','POST',{provider},login.cookie)).status,400);}
 }finally{globalThis.fetch=realFetch}
});

test('proveedores retirados no se pueden conectar ni utilizar',async()=>{const login=await request('/api/login','POST',{email:'alice@example.com',password:'password-test-123'});for(const provider of ['zen','cerebras']){assert.equal((await request('/api/connections','POST',{provider,key:'retired-test-key-123'},login.cookie)).status,400);assert.equal((await request('/api/connections/test','POST',{provider},login.cookie)).status,400);assert.equal((await request('/api/models?provider='+provider,'GET',undefined,login.cookie)).status,400)}const app=await fetch(origin+'/app.js').then(r=>r.text());assert.ok(!app.includes('OpenCode Zen'));assert.ok(!app.includes('Cerebras Cloud'));});

test('consumo por usuario/proyecto: tres proveedores, Plan/Build, errores, reintento y reinicio',async()=>{
 const realFetch=globalThis.fetch;let invalid=false;
 globalThis.fetch=async(url,options)=>{const u=String(url);if(u.startsWith('https://ai.google.dev/'))return new Response('<h2>Gemini</h2><code>gemini-usage</code><table><tr><th></th><th>Free Tier</th><th>Paid Tier</th></tr><tr><td>Input price</td><td>Free of charge</td><td>$1</td></tr><tr><td>Output price</td><td>Free of charge</td><td>$2</td></tr></table>');if(u.startsWith('https://openrouter.ai/')||u.startsWith('https://api.groq.com/')||u.startsWith('https://generativelanguage.googleapis.com/')){if(u.endsWith('/models'))return new Response(JSON.stringify(u.includes('googleapis')?{models:[{name:'models/gemini-usage',supportedGenerationMethods:['generateContent'],inputTokenLimit:10000,outputTokenLimit:500}]}:{data:[{id:'usage-model',context_length:16000,pricing:{prompt:'0.000001',completion:'0.000002'}}]}));const content=invalid?'not json':JSON.stringify({action:'explain',summary:'Uso',files:[]});const data=u.includes('googleapis')?{usageMetadata:{promptTokenCount:100,candidatesTokenCount:20,thoughtsTokenCount:5},candidates:[{finishReason:'STOP',content:{parts:[{text:content}]}}]}:{usage:{prompt_tokens:100,completion_tokens:20,...(u.includes('openrouter')?{cost:0.001}:{})},choices:[{message:{content},finish_reason:'stop'}]};return new Response(JSON.stringify(data),{headers:{'x-ratelimit-remaining-tokens':'900','x-ratelimit-reset-tokens':'1m'}})}return realFetch(url,options)};
 try{const credentials={email:'usage@example.com',password:'usage-test-password'};let login=await request('/api/register','POST',credentials);const p=(await request('/api/projects','POST',{name:'Uso',html:'hola',css:'',js:''},login.cookie)).data;
 for(const provider of ['openrouter','groq','google']){await request('/api/connections','POST',{provider,key:'simulated-usage-secret-1234',plan:'free'},login.cookie);const model=provider==='google'?'gemini-usage':'usage-model';for(const mode of ['plan','build']){const r=await request('/api/chat','POST',{provider,model,mode,projectId:p.id,conversationId:'conversation-test',messages:[{role:'user',content:'Explica'}]},login.cookie);assert.equal(r.status,200);}}
 const route='/api/usage?projectId='+p.id+'&conversationId=conversation-test';let usage=(await request(route,'GET',undefined,login.cookie)).data;assert.equal(usage.conversation.requests,6);assert.equal(usage.conversation.input,600);assert.equal(usage.conversation.output,130);assert.equal(usage.last.costKind,'free');assert.equal(usage.last.quotas.tokens.remaining,900);
 const context=await request('/api/context','POST',{provider:'google',model:'gemini-usage',projectId:p.id,messages:[],mode:'plan'},login.cookie);assert.equal(context.data.context.inputLimit,10000);assert.equal(context.data.context.reserve,500);
 invalid=true;assert.equal((await request('/api/chat','POST',{provider:'openrouter',model:'usage-model',projectId:p.id,conversationId:'conversation-test',messages:[{role:'user',content:'Explica'}]},login.cookie)).status,422);invalid=false;
 await request('/api/chat','POST',{provider:'openrouter',model:'usage-model',projectId:p.id,conversationId:'conversation-test',messages:[{role:'user',content:'Reintento'}]},login.cookie);usage=(await request(route,'GET',undefined,login.cookie)).data;assert.equal(usage.project.requests,8);assert.equal(usage.conversation.requests,8);
 const other=await request('/api/login','POST',{email:'bob@example.com',password:'password-test-456'});assert.equal((await request(route,'GET',undefined,other.cookie)).status,404);
 const stored=JSON.parse(readFileSync(path.join(dir,'store.json'),'utf8'));assert.ok(stored.usage.every(r=>!('messages' in r)&&!('headers' in r)));assert.ok(!JSON.stringify(stored.usage).includes('simulated-usage-secret'));
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));({server}=await import('../server.mjs?usageRestart='+Date.now()));await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));login=await request('/api/login','POST',credentials);assert.equal((await request(route,'GET',undefined,login.cookie)).data.project.requests,8);
 }finally{globalThis.fetch=realFetch}
});

test('descarga ZIP última versión, escritorio/Android e aislamiento',async()=>{
 const login=await request('/api/login','POST',{email:'alice@example.com',password:'password-test-123'});const p=(await request('/api/projects','POST',{name:'Página descargada',html:'Antes',css:'',js:''},login.cookie)).data;const saved=(await request('/api/projects/'+p.id,'PUT',{name:p.name,html:'Última versión',css:'body{color:blue}',js:'console.log(123)',revision:p.revision||0},login.cookie)).data;
 const url=origin+'/api/projects/'+p.id+'/export?revision='+saved.revision;
 for(const agent of ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)','Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36']){const r=await fetch(url,{headers:{Cookie:login.cookie,'User-Agent':agent}});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/zip');assert.ok(r.headers.get('content-disposition').includes(encodeURIComponent(p.name)+'.zip'));const zip=Buffer.from(await r.arrayBuffer());assert.ok(zip.includes(Buffer.from('Última versión')));assert.ok(zip.includes(Buffer.from('body{color:blue}')));assert.ok(zip.includes(Buffer.from('console.log(123)')));assert.ok(!zip.includes(Buffer.from('userId')));assert.equal(zip.readUInt32LE(zip.length-22),0x06054b50);}
 const other=await request('/api/login','POST',{email:'bob@example.com',password:'password-test-456'});assert.equal((await fetch(url,{headers:{Cookie:other.cookie}})).status,404);assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url.replace('revision='+saved.revision,'revision=0'),{headers:{Cookie:login.cookie}})).status,409);
});

test('respaldo 429 a Gemini gratuito: Build, consumo de cada intento y sin modelos de pago',async()=>{
 const realFetch=globalThis.fetch;let inference=[];
 globalThis.fetch=async(url,options)=>{const u=String(url);if(u.startsWith('https://ai.google.dev/'))return new Response('<h2>Gemini</h2><code>gemini-fallback</code><table><tr><th></th><th>Free Tier</th><th>Paid Tier</th></tr><tr><td>Input price</td><td>Free of charge</td><td>$1</td></tr><tr><td>Output price</td><td>Free of charge</td><td>$2</td></tr></table>');if(u.startsWith('https://openrouter.ai/')||u.startsWith('https://generativelanguage.googleapis.com/')){if(u.endsWith('/models'))return new Response(JSON.stringify(u.includes('googleapis')?{models:[{name:'models/gemini-fallback',supportedGenerationMethods:['generateContent']}]}:{data:[{id:'fallback-free:free',pricing:{prompt:'0',completion:'0'}},{id:'fallback-paid',pricing:{prompt:'1',completion:'1'}}]}));const body=JSON.parse(options.body);inference.push(body.model||'gemini-fallback');if(!u.includes('googleapis'))return new Response(JSON.stringify({usage:{prompt_tokens:10,completion_tokens:0,cost:0}}),{status:429});const content=JSON.stringify({action:'create',summary:'Página de respaldo',files:[{path:'index.html',content:'<h1>Respaldo</h1>'},{path:'style.css',content:'h1{color:blue}'},{path:'script.js',content:''}]});return new Response(JSON.stringify({usageMetadata:{promptTokenCount:20,candidatesTokenCount:30},candidates:[{finishReason:'STOP',content:{parts:[{text:content}]}}]}));}return realFetch(url,options)};
 try{const login=await request('/api/register','POST',{email:'fallback-qa@example.com',password:'fallback-test-password'});for(const provider of ['openrouter','google'])assert.equal((await request('/api/connections','POST',{provider,key:'simulated-fallback-key-1234',plan:'free'},login.cookie)).status,200);const p=(await request('/api/projects','POST',{name:'Fallback',html:'Antes',css:'',js:''},login.cookie)).data;const input={provider:'openrouter',model:'fallback-free:free',onlyFree:true,mode:'build',projectId:p.id,conversationId:'fallback-test',messages:[{role:'user',content:'Crea una página'}]};const answer=await request('/api/chat','POST',input,login.cookie);assert.equal(answer.status,200);assert.equal(answer.data.fallback,true);assert.ok(answer.data.content.includes('Respaldo: respondió gemini-fallback'));assert.equal(answer.data.project.html,'<h1>Respaldo</h1>');assert.equal(answer.data.project.canUndo,true);assert.deepEqual(inference,['fallback-free:free','gemini-fallback']);const usage=(await request('/api/usage?projectId='+p.id+'&conversationId=fallback-test','GET',undefined,login.cookie)).data;assert.equal(usage.conversation.requests,2);assert.equal(usage.conversation.input,30);assert.equal(usage.conversation.output,30);
 await request('/api/connections','POST',{provider:'google',key:''},login.cookie);inference=[];const fail=await request('/api/chat','POST',input,login.cookie);assert.equal(fail.status,429);assert.deepEqual(inference,['fallback-free:free']);assert.ok(fail.data.error.includes('No se cambió a un modelo de pago'));assert.equal((await request('/api/projects','GET',undefined,login.cookie)).data.find(x=>x.id===p.id).html,'<h1>Respaldo</h1>');
 }finally{globalThis.fetch=realFetch}
});
