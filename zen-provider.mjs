export const zenDocs='https://opencode.ai/docs/zen';
const base='https://opencode.ai/zen/v1';
const text=html=>html.replace(/<del\b[^>]*>[\s\S]*?<\/del>/gi,'').replace(/<[^>]+>/g,'').replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').trim();
const nameKey=name=>name.replace(/\s*\([^)]*\)\s*$/,'').trim();
function tokenPrice(s){if(/^free$/i.test(s))return 0;if(/^\$\d+(?:\.\d+)?$/.test(s))return Number(s.slice(1));return null;}
export function parseZenDocs(html,checkedAt=Date.now()){
 const tables=[...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(m=>[...m[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row=>[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell=>text(cell[1]))));
 const endpointTable=tables.find(rows=>rows[0]?.includes('Model ID')&&rows[0]?.includes('Endpoint'));
 const priceTable=tables.find(rows=>rows[0]?.includes('Input')&&rows[0]?.includes('Output'));
 if(!endpointTable)throw Error('No se pudo confirmar la tabla oficial de protocolos Zen.');
 const prices=new Map();for(const row of priceTable?.slice(1)||[]){const key=nameKey(row[0]);if(!prices.has(key))prices.set(key,[]);prices.get(key).push(row.slice(1).map(tokenPrice));}
 const metadata=Object.create(null);for(const [name,id,endpoint] of endpointTable.slice(1)){
  let protocol=null;if(endpoint===base+'/responses')protocol='responses';else if(endpoint===base+'/messages')protocol='messages';else if(endpoint===base+'/chat/completions')protocol='chat';else if(endpoint===base+'/models/'+id)protocol='gemini';else if(endpoint===base+'/systemone')protocol='systemone';
  if(!/^[a-zA-Z0-9._-]+$/.test(id)||!protocol)continue;
  const rows=prices.get(nameKey(name))||[];
  const known=rows.length>0&&rows.every(p=>p[0]!==null&&p[1]!==null);
  const status=known?(rows.every(p=>p[0]===0&&p[1]===0&&p.every(n=>n===null||n===0))?'free':'paid'):'unknown';
  metadata[id]={name,protocol,status,prices:rows,checkedAt:new Date(checkedAt).toISOString()};
 }
 return metadata;
}
let cached=null,pending=null;
export function clearZenCache(){cached=null;pending=null;}
export async function getZenMetadata({refresh=false}={}){
 if(!refresh&&cached&&Date.now()-cached.at<900000)return cached.data;
 if(pending)return pending;
 pending=(async()=>{try{const response=await fetch(zenDocs,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Documentación no disponible');const data=parseZenDocs(await response.text());cached={at:Date.now(),data};return data}catch{cached=null;return {}}finally{pending=null}})();return pending;
}
export function zenRequest({model,protocol,key,system,messages,mode}){
 const headers={'Content-Type':'application/json',Authorization:'Bearer '+key};let endpoint,body;
 if(protocol==='chat'){endpoint='/chat/completions';body={model,messages:[{role:'system',content:system},...messages],max_tokens:8192,stream:false};}
 else if(protocol==='responses'){endpoint='/responses';body={model,instructions:system,input:messages,max_output_tokens:8192,stream:false,store:false,text:{format:{type:'json_object'}}};}
 else if(protocol==='messages'){endpoint='/messages';delete headers.Authorization;headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';body={model,system,messages,max_tokens:8192,stream:false};}
 else if(protocol==='gemini'){endpoint='/models/'+encodeURIComponent(model)+':generateContent';delete headers.Authorization;headers['x-goog-api-key']=key;body={systemInstruction:{parts:[{text:system}]},contents:messages.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:8192,responseMimeType:'application/json'}};}
 else if(protocol==='systemone'){
  if(mode!=='plan')throw Object.assign(Error('Este modelo System One solo evalúa decisiones estructuradas en Plan; no genera archivos. Elige un modelo de texto para Build.'),{status:400});
  endpoint='/systemone';body={model,state:system+'\nConversación: '+JSON.stringify(messages),questions:{can_build:{type:'noul',instructions:'¿La petición tiene información suficiente para implementar una página HTML/CSS/JavaScript? Evalúa solo esta decisión; no generes archivos.'}}};
 }else throw Object.assign(Error('Protocolo de este modelo Zen no confirmado. Actualiza el catálogo o elige otro modelo.'),{status:409});
 return {url:base+endpoint,options:{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(60000)}};
}
export function zenResponse(data,protocol){
 if(data?.error)throw Object.assign(Error('Zen no pudo completar la respuesta.'),{status:502});
 let content,truncated=false;
 if(protocol==='chat'){content=data.choices?.[0]?.message?.content;truncated=data.choices?.[0]?.finish_reason==='length';}
 if(protocol==='responses'){content=data.output?.filter(i=>i.type==='message').flatMap(i=>i.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');truncated=data.status==='incomplete';if(data.status==='failed'||data.error)throw Object.assign(Error('Zen no pudo completar la respuesta.'),{status:502});}
 if(protocol==='messages'){content=data.content?.filter(c=>c.type==='text').map(c=>c.text).join('');truncated=data.stop_reason==='max_tokens';}
 if(protocol==='gemini'){content=data.candidates?.[0]?.content?.parts?.filter(p=>typeof p.text==='string'&&!p.thought).map(p=>p.text).join('');truncated=data.candidates?.[0]?.finishReason==='MAX_TOKENS';}
 if(protocol==='systemone'){if(!data||typeof data!=='object'||!Object.keys(data).length)throw Object.assign(Error('Respuesta System One inválida.'),{status:422});content=JSON.stringify({action:'explain',summary:'Decisión estructurada System One (no es un plan de código):\n'+JSON.stringify(data,null,2),files:[]});}
 if(truncated)throw Object.assign(Error('La respuesta de IA quedó incompleta. No se aplicaron cambios. Pide un cambio más pequeño.'),{status:422});
 return content;
}
