import {projectFiles,zipFiles,zipName} from './project-export.mjs';
import {contextInfo,readUsage,totals} from './usage.mjs';
import http from 'node:http';
import {readFileSync,mkdirSync,existsSync} from 'node:fs';
import {randomBytes,randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {systemPrompt,planPrompt,validateResponse,fingerprint} from './ai-changes.mjs';
import {normalizeModels} from './model-catalog.mjs';
import {googleBase,googlePrices,fetchModelRows,googleRequest,googleResponse} from './cloud-providers.mjs';
import {openVault} from './connection-vault.mjs';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const root=path.dirname(fileURLToPath(import.meta.url));
const dir=process.env.DATA_DIR||path.join(root,'data'); mkdirSync(dir,{recursive:true});
let db={projects:[],usage:[]};
const vault=openVault({root,dataDir:dir,hasConnections:true});

const userConnections=session=>session.connections||{};
const connectedProviders=session=>Object.keys(userConnections(session));
const connectionKey=(session,provider)=>{const record=userConnections(session)[provider];return record?vault.decrypt(record.secret,session.userId,provider):null};
const connectionInfo=session=>Object.entries(userConnections(session)).map(([provider,r])=>({provider,status:'connected',masked:'••••••••'+r.last4,plan:r.plan||'unknown',updatedAt:r.updatedAt}));
function rejectSecrets(value,session){const text=JSON.stringify(value);if(connectedProviders(session).some(p=>text.includes(connectionKey(session,p))))fail(422,'La solicitud o respuesta contiene una clave guardada. No se guardó en el proyecto.');}

async function storeConnection(session,provider,record){
  if(session.catalogCache)delete session.catalogCache[provider];
  const connections={...session.connections};
  if(record)connections[provider]=record;else delete connections[provider];
  session.connections=connections;
  await pool.query('UPDATE app_users SET connections = $1 WHERE id = $2', [JSON.stringify(connections), session.userId]);
}

const publicProject=p=>{const {versions,...fields}=p;return {...fields,canUndo:!!versions?.length}};
function commitProject(p,next){const replacement={...p,...next};db.projects=db.projects.map(x=>x===p?replacement:x);return replacement}
function checkpoint(p){return {name:p.name,html:p.html,css:p.css,js:p.js,savedAt:new Date().toISOString()}}
const sessions=new Map(), attempts=new Map();
const providers={openrouter:'https://openrouter.ai/api/v1',groq:'https://api.groq.com/openai/v1',google:googleBase};
async function catalogFromRows(provider,rows,plan){return normalizeModels(provider,rows,{groqPlan:plan||'unknown',accountPlan:plan||'unknown',googleMetadata:provider==='google'?await googlePrices():{}})}
async function getCatalog(session,provider,refresh=true){const cached=session.catalogCache?.[provider];if(!refresh&&cached&&Date.now()-cached.at<15000)return cached.models;const data=await fetchModelRows(provider,connectionKey(session,provider),providers[provider]);if(!data.ok)fail(data.status===401||data.status===403?400:502,'No se pudo consultar el catálogo de '+provider+'. Revisa la conexión y sus permisos.');const models=await catalogFromRows(provider,data.rows,userConnections(session)[provider]?.plan);session.catalogCache||={};session.catalogCache[provider]={at:Date.now(),models};return models}
function providerFailure(r){fail(r.status===429?429:502,r.status===429?'Se agotó una cuota o límite del proveedor. Espera e inténtalo de nuevo. No se cambió a un modelo de pago.':r.status===402?'El proveedor requiere saldo o habilitación de la cuenta. No se cambió a un modelo de pago.':r.status===401||r.status===403?'El proveedor rechazó la clave o los permisos de este modelo. Prueba o reemplaza la conexión.':`El proveedor rechazó la solicitud (${r.status}). Revisa modelo, saldo, formato y límites.`)}
function fail(status,message){throw Object.assign(new Error(message),{status})}
function cleanProject(b){if(typeof b.name!=='string'||!b.name.trim()||b.name.length>80)fail(400,'Nombre requerido (máximo 80 caracteres).'); const out={name:b.name.trim()};for(const k of ['html','css','js']){if(typeof b[k]!=='string'||b[k].length>200000)fail(400,'Código inválido o demasiado largo.');out[k]=b[k]}return out}
async function body(req){let chunks=[],size=0;for await(const c of req){size+=c.length;if(size>1000000)fail(413,'Solicitud demasiado grande.');chunks.push(c)}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}')}catch{fail(400,'JSON inválido.')}}
export const server=http.createServer(async(req,res)=>{
 let session;
 const json=(status,value)=>{let encoded=JSON.stringify(value);try{if(session)for(const p of connectedProviders(session)){const secret=connectionKey(session,p);encoded=encoded.split(JSON.stringify(secret).slice(1,-1)).join('[CLAVE OCULTA]')}}catch{status=500;encoded=JSON.stringify({error:'No se pudo descifrar la conexión guardada. Revisa la clave maestra del servidor.'})}res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(encoded)};
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
 try{
 const url=new URL(req.url,'http://localhost');
 if(['/assets/logo.png','/assets/background.mp4'].includes(url.pathname)){const video=url.pathname.endsWith('.mp4'),data=readFileSync(path.join(root,'public',url.pathname.slice(1)));res.setHeader('Content-Type',video?'video/mp4':'image/png');res.setHeader('Accept-Ranges','bytes');if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);const start=match?Number(match[1]):-1,end=match&&match[2]?Number(match[2]):data.length-1;if(start<0||end<start||end>=data.length){res.writeHead(416,{'Content-Range':'bytes */'+data.length});res.end();return}res.writeHead(206,{'Content-Range':'bytes '+start+'-'+end+'/'+data.length,'Content-Length':end-start+1});res.end(data.subarray(start,end+1));return}res.setHeader('Content-Length',data.length);res.end(data);return}
 if(!url.pathname.startsWith('/api/')){const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/manifest.json':'manifest.json','/sw.js':'sw.js','/icon.svg':'icon.svg','/icon-192.png':'icon-192.png','/icon-512.png':'icon-512.png','/.well-known/assetlinks.json':'.well-known/assetlinks.json','/model-catalog.mjs':'../model-catalog.mjs'};const asset=assets[url.pathname];if(!asset)fail(404,'No encontrado.');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; frame-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");const ctype=/\.(m?js)$/.test(asset)?'text/javascript; charset=utf-8':asset.endsWith('.css')?'text/css; charset=utf-8':asset==='manifest.json'?'application/manifest+json; charset=utf-8':asset.endsWith('.json')?'application/json; charset=utf-8':asset.endsWith('.svg')?'image/svg+xml':asset.endsWith('.png')?'image/png':'text/html; charset=utf-8';res.setHeader('Content-Type',ctype);res.end(readFileSync(path.join(root,'public',asset)));return}
 if(!['GET','HEAD'].includes(req.method)){const origin=req.headers.origin;if(origin&&origin!==`http://${req.headers.host}`&&origin!==`https://${req.headers.host}`)fail(403,'Origen no permitido.');if(!req.headers['content-type']?.startsWith('application/json'))fail(415,'Se requiere JSON.')}
 const token=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('session='))?.slice(8);
 session=sessions.get(token);if(session&&session.expires<Date.now()){sessions.delete(token);session=null}
 if(session){const {rows}=await pool.query('SELECT connections FROM app_users WHERE id = $1',[session.userId]);if(rows[0])session.connections=rows[0].connections}
 if(['/api/register','/api/login'].includes(url.pathname)&&req.method==='POST'){
 const b=await body(req), email=String(b.email||'').trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||typeof b.password!=='string'||b.password.length<10||b.password.length>128)fail(400,'Usa un correo válido y una contraseña de 10 a 128 caracteres.');
 const ip=req.socket.remoteAddress;let a=attempts.get(ip);if(!a||a.until<Date.now()){a={count:0,until:Date.now()+600000};attempts.set(ip,a)}if(++a.count>30)fail(429,'Demasiados intentos. Espera diez minutos.');
 let user;
 if(url.pathname==='/api/register'){const {rows}=await pool.query('SELECT id FROM app_users WHERE email = $1',[email]);if(rows.length)fail(409,'El correo ya está registrado.');const salt=randomBytes(16).toString('hex');const id=randomUUID();const hash=scryptSync(b.password,salt,64).toString('hex');await pool.query('INSERT INTO app_users (id, email, salt, hash, connections) VALUES ($1, $2, $3, $4, $5)',[id,email,salt,hash,JSON.stringify({})]);user={id,email,connections:{}}}
 else {const {rows}=await pool.query('SELECT * FROM app_users WHERE email = $1',[email]);user=rows[0];if(!user)fail(401,'Correo o contraseña incorrectos.');const hash=scryptSync(b.password,user.salt||'dummy',64);if(!timingSafeEqual(hash,Buffer.from(user.hash,'hex')))fail(401,'Correo o contraseña incorrectos.')}
 if(token)sessions.delete(token);const key=randomBytes(32).toString('hex');sessions.set(key,{userId:user.id,email:user.email,connections:user.connections||{},expires:Date.now()+86400000});res.setHeader('Set-Cookie',`session=${key}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${process.env.COOKIE_SECURE==='true'?'; Secure':''}`);json(200,{email:user.email,connected:Object.keys(user.connections||{}),connections:Object.entries(user.connections||{}).map(([provider,r])=>({provider,status:'connected',masked:'••••••••'+r.last4,plan:r.plan||'unknown',updatedAt:r.updatedAt}))});return
 }
 if(!session)fail(401,'Inicia sesión para continuar.');
 if(url.pathname==='/api/preview'&&req.method==='POST'){const b=await body(req);const p=cleanProject({...b,name:'Preview'});const id=randomBytes(24).toString('hex');session.preview={id,p};json(200,{url:'/api/preview/'+id});return}
 if(url.pathname.startsWith('/api/preview/')&&req.method==='GET'){if(session.preview?.id!==url.pathname.split('/').pop())fail(404,'Vista previa no encontrada.');const p=session.preview.p;res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; sandbox allow-scripts");res.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+p.css.replace(/<\/style/gi,'<\\/style')+'</style></head><body>'+p.html+'<script>'+p.js.replace(/<\/script/gi,'<\\/script')+'</script></body></html>');return}
 if(url.pathname==='/api/me'){json(200,{email:session.email,connected:connectedProviders(session),connections:connectionInfo(session)});return}
 if(url.pathname==='/api/logout'&&req.method==='POST'){sessions.delete(token);res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');json(200,{ok:true});return}
 if(url.pathname==='/api/projects'){
 if(req.method==='GET'){json(200,db.projects.filter(p=>p.userId===session.userId).map(publicProject));return}
 if(req.method==='POST'){const b=await body(req);rejectSecrets(b,session);const p={...cleanProject(b),id:randomUUID(),userId:session.userId,updatedAt:new Date().toISOString()};db.projects.push(p);json(201,p);return}
 }
 if(url.pathname.startsWith('/api/projects/')){
 const parts=url.pathname.split('/');const p=db.projects.find(p=>p.id===parts[3]&&p.userId===session.userId);if(!p)fail(404,'Proyecto no encontrado.');
 if(parts.length===5&&parts[4]==='export'&&req.method==='GET'){if(Number(url.searchParams.get('revision'))!==(p.revision||0))fail(409,'El proyecto cambió. Guarda y vuelve a descargar.');const files=projectFiles(p);for(const f of files)rejectSecrets(f.data.toString('utf8'),session);const zip=zipFiles(files),name=zipName(p.name);res.setHeader('Content-Type','application/zip');res.setHeader('Content-Disposition',"attachment; filename=project.zip; filename*=UTF-8''"+encodeURIComponent(name));res.setHeader('Content-Length',zip.length);res.end(zip);return}
 if(parts.length===5&&parts[4]==='undo'&&req.method==='POST'){const b=await body(req);if(b.revision!==(p.revision||0))fail(409,'El proyecto cambió. Recarga antes de deshacer.');if(!p.versions?.length)fail(409,'No hay una versión anterior.');const old=p.versions.at(-1);const restored=commitProject(p,{name:old.name,html:old.html,css:old.css,js:old.js,versions:p.versions.slice(0,-1),revision:(p.revision||0)+1,updatedAt:new Date().toISOString()});json(200,{project:publicProject(restored),content:'Restaurada la versión anterior de index.html, style.css y script.js.'});return}
 if(parts.length!==4)fail(404,'No encontrado.');
 if(req.method==='PUT'){const b=await body(req);rejectSecrets(b,session);if(b.revision!==undefined&&b.revision!==(p.revision||0))fail(409,'El proyecto cambió en otra sesión. Recarga antes de guardar.');const updated=commitProject(p,{...cleanProject(b),revision:(p.revision||0)+1,versions:[...(p.versions||[]),checkpoint(p)].slice(-20),updatedAt:new Date().toISOString()});json(200,publicProject(updated));return}
 if(req.method==='DELETE'){db.projects=db.projects.filter(x=>x!==p);json(200,{ok:true});return}}
 if(url.pathname==='/api/connections'&&req.method==='GET'){json(200,{connections:connectionInfo(session)});return}
 if(url.pathname==='/api/connections/test'&&req.method==='POST'){
 const b=await body(req);if(!providers[b.provider]||!connectionKey(session,b.provider))fail(400,'Conecta primero el proveedor.');await getCatalog(session,b.provider);
 json(200,{ok:true,connections:connectionInfo(session)});return}
 if((url.pathname==='/api/keys'||url.pathname==='/api/connections')&&req.method==='POST'){
 const b=await body(req);if(!providers[b.provider])fail(400,'Proveedor inválido.');
 if(b.key===''){await storeConnection(session,b.provider,null);json(200,{ok:true,connections:connectionInfo(session)});return}
 if(typeof b.key!=='string'||b.key.length>512||b.key.length<10||/[\r\n]/.test(b.key))fail(400,'Clave inválida.');
 const data=await fetchModelRows(b.provider,b.key,providers[b.provider]);if(!data.ok)fail(400,'No se pudo validar la clave. La conexión anterior se conserva.');if(!Array.isArray(data.rows))fail(502,'Catálogo inválido.');
 const plan=['groq','google'].includes(b.provider)&&['free','paid'].includes(b.plan)?b.plan:'unknown';
 const catalog=await catalogFromRows(b.provider,data.rows,plan);
 await storeConnection(session,b.provider,{secret:vault.encrypt(b.key,session.userId,b.provider),last4:b.key.slice(-4),plan,updatedAt:new Date().toISOString()});
 json(200,{models:catalog.map(m=>m.id),catalog,connections:connectionInfo(session)});return}
 if(url.pathname==='/api/models'){const provider=url.searchParams.get('provider');if(!providers[provider]||!connectionKey(session,provider))fail(400,'Conecta primero tu clave.');const catalog=await getCatalog(session,provider);json(200,{models:catalog.map(m=>m.id),catalog});return}
 if(url.pathname==='/api/catalog'){const results=await Promise.all(connectedProviders(session).map(async provider=>{try{return {catalog:await getCatalog(session,provider)}}catch(e){return {catalog:[],error:e.message}}}));json(200,{catalog:results.flatMap(r=>r.catalog),errors:results.filter(r=>r.error).map(r=>r.error)});return}
 if(url.pathname==='/api/usage'&&req.method==='GET'){const p=db.projects.find(p=>p.id===url.searchParams.get('projectId')&&p.userId===session.userId);if(!p)fail(404,'Proyecto no encontrado.');const rows=(db.usage||[]).filter(r=>r.userId===session.userId&&r.projectId===p.id);const conversation=rows.filter(r=>r.conversationId===url.searchParams.get('conversationId'));json(200,{project:totals(rows),conversation:totals(conversation),last:conversation.at(-1)||null});return}
 if(url.pathname==='/api/context'&&req.method==='POST'){const b=await body(req);const p=db.projects.find(p=>p.id===b.projectId&&p.userId===session.userId);if(!p)fail(404,'Proyecto no encontrado.');if(!providers[b.provider]||!Array.isArray(b.messages)||b.messages.length>30||b.messages.some(m=>!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>20000))fail(400,'Contexto inválido.');const model=(await getCatalog(session,b.provider,false)).find(m=>m.id===b.model);const files=b.files&&['html','css','js'].every(k=>typeof b.files[k]==='string'&&b.files[k].length<=200000)?b.files:p;const system=(b.mode==='plan'?planPrompt:systemPrompt)+'\nProyecto actual:\n'+JSON.stringify({html:files.html,css:files.css,js:files.js});json(200,{context:contextInfo(system,b.messages,model),model});return}
 if(url.pathname==='/api/chat'&&req.method==='POST'){
 const b=await body(req);if(!providers[b.provider]||!connectionKey(session,b.provider))fail(400,'Conecta tu clave en Configuración.');if(typeof b.model!=='string'||b.model.length>150||!Array.isArray(b.messages)||b.messages.length>30||b.messages.some(m=>!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>20000))fail(400,'Conversación inválida.');
 rejectSecrets(b,session);
 if(b.mode!==undefined&&!['plan','build'].includes(b.mode))fail(400,'Modo de chat inválido.');const mode=b.mode||'build';
 const p=db.projects.find(p=>p.id===b.projectId&&p.userId===session.userId);if(!p)fail(404,'Guarda o selecciona un proyecto.');if(!b.messages.length||b.messages.at(-1).role!=='user')fail(400,'Se requiere una pregunta del usuario.');if(session.busy)fail(429,'Espera a que termine la respuesta anterior.');session.busy=true;const base=fingerprint(p);
 try{
 let attempts=[{provider:b.provider,model:b.model}], invalidProviders=new Set(), fallbackPopulated=false;
 let responseData=null, usedModel=null, usedProvider=null, requestUsage=null, lastError=null, fallback=false;
 for(let i=0;i<5;i++){
   if(i>=attempts.length){
     if(!fallbackPopulated){
       for(const prov of connectedProviders(session)){
         if(invalidProviders.has(prov))continue;
         const cat=await getCatalog(session,prov,true).catch(()=>[]);
         for(const m of cat){
           if(b.onlyFree&&m.status!=='free')continue;
           if(prov===b.provider&&m.id===b.model)continue;
           attempts.push({provider:prov,model:m.id});
         }
       }
       fallbackPopulated=true;
     }
     if(i>=attempts.length)break;
   }
   const attempt=attempts[i];
   if(invalidProviders.has(attempt.provider))continue;
   let selected;try{selected=(await getCatalog(session,attempt.provider,true)).find(m=>m.id===attempt.model)}catch(e){if(i===0)throw e;lastError=e;continue;}
   if(!selected){if(i===0)fail(409,'El modelo ya no aparece en el catálogo. Elige otro modelo.');continue;}
   if(b.onlyFree===true&&selected.status!=='free'){if(i===0)fail(409,'Solo gratuitos está activo: este modelo no tiene gratuidad confirmada. No se cambió a un modelo de pago.');continue;}
   try{
     const system=(mode==='plan'?planPrompt:systemPrompt)+'\nProyecto actual:\n'+JSON.stringify({html:p.html,css:p.css,js:p.js});
     const context=contextInfo(system,b.messages,selected);
     const request=attempt.provider==='google'?googleRequest({model:attempt.model,key:connectionKey(session,attempt.provider),system,messages:b.messages,mode}):{url:providers[attempt.provider]+'/chat/completions',options:{method:'POST',headers:{Authorization:`Bearer ${connectionKey(session,attempt.provider)}`,'Content-Type':'application/json'},body:JSON.stringify({model:attempt.model,messages:[{role:'system',content:system},...b.messages],response_format:{type:'json_object'},max_tokens:8192}),signal:AbortSignal.timeout(60000)}};
     const requestBody=JSON.parse(request.options.body);if(attempt.provider==='google')requestBody.generationConfig.maxOutputTokens=context.reserve;else requestBody.max_tokens=context.reserve;request.options.body=JSON.stringify(requestBody);
     const r=await fetch(request.url,request.options);const d=await r.json().catch(()=>({}));
     if(true){const entry={id:randomUUID(),userId:session.userId,projectId:p.id,conversationId:typeof b.conversationId==='string'?b.conversationId.slice(0,80):'legacy',provider:attempt.provider,model:attempt.model,mode,at:new Date().toISOString(),httpStatus:r.status,...readUsage(attempt.provider,d,r.headers,selected,context)};if(!r.ok&&!d.usage&&!d.usageMetadata){entry.input=0;entry.output=0;entry.inputEstimated=true;entry.outputEstimated=true;entry.cost=selected.status==='free'?0:null;entry.costKind=selected.status==='free'?'free':'unavailable';}db.usage=[...(db.usage||[]),entry];requestUsage=entry;}
     if(!r.ok){
       if(r.status===401||r.status===403){invalidProviders.add(attempt.provider);throw Error('Clave inválida o revocada.');}
       if(r.status===429)throw Object.assign(Error('Cuota agotada o límite de solicitudes.'),{status:429});
       if(r.status===402)throw Error('El proveedor requiere saldo.');
       throw Error(`El proveedor rechazó la solicitud (${r.status}).`);
     }
     if(d.choices?.[0]?.finish_reason==='length')throw Error('Respuesta incompleta (length). Pide un cambio más pequeño.');
     responseData=d;usedModel=attempt.model;usedProvider=attempt.provider;if(i>0)fallback=true;break;
   }catch(e){lastError=e;}
 }
 if(!responseData)fail(lastError?.status||502,`Todos los intentos fallaron. Último error: ${lastError?.message||'Desconocido'}${b.onlyFree===true?' No se cambió a un modelo de pago.':''}`);
 rejectSecrets(responseData,session);
 const result=validateResponse(usedProvider==='google'?googleResponse(responseData):responseData.choices?.[0]?.message?.content,p);
 let contentPre=result.content;if(fallback)contentPre=contentPre.slice(0,1200)+`\n\n*(Respaldo: respondió ${usedModel})*`;
 if(mode==='plan'&&result.action!=='explain')fail(422,'El modo Plan no permite escribir archivos. No se aplicaron cambios.');
 if(!result.changed.length){json(200,{usage:requestUsage,content:contentPre,changed:[],action:result.action,fallback});return}
 const live=db.projects.find(x=>x.id===p.id&&x.userId===session.userId);if(!live||fingerprint(live)!==base)fail(409,'El proyecto cambió mientras la IA respondía. No se aplicaron cambios. Vuelve a enviar tu solicitud.');if(!sessions.has(token)||session.expires<Date.now())fail(401,'Tu sesión terminó. No se aplicaron cambios.');
 const updated=commitProject(live,{...result.next,revision:(live.revision||0)+1,versions:[...(live.versions||[]),checkpoint(live)].slice(-20),updatedAt:new Date().toISOString()});
 const summary=result.changed.map(f=>`${f.operation==='created'?'Creado':'Modificado'}: ${f.path}`).join('\n');json(200,{usage:requestUsage,content:contentPre+'\n\n'+summary+'\nGuardado. Puedes deshacer los cambios.',action:result.action,changed:result.changed,project:publicProject(updated),fallback});return
 }finally{session.busy=false}}
 fail(404,'No encontrado.');
 }catch(e){json(e.status||500,{error:e.status?e.message:e.name==='TimeoutError'?'El proveedor tardó demasiado. Inténtalo de nuevo.':'No se pudo completar la solicitud.'})}
});
if (process.env.NODE_ENV !== 'test') {
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = '0.0.0.0';
  server.listen(PORT, HOST, () => {
    console.log(`Psynapse Connect activo en http://${HOST}:${PORT}`);
  });
}
