// Groq's models API does not expose account plan or token prices.
// Eligibility below was verified against the official Free Plan Limits table.
const groqFreeIds=new Set(['openai/gpt-oss-120b','openai/gpt-oss-20b','openai/gpt-oss-safeguard-20b','qwen/qwen3.8-27b']);
const groqCheckedAt='2026-10-10T00:00:00-06:00';
function price(value){if((typeof value!=='string'&&typeof value!=='number')||String(value).trim()==='')return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null}
export function normalizeModels(provider,rows,{groqPlan='unknown',accountPlan='unknown',googleMetadata={},now=Date.now(),zenMetadata={}}={}){
 if(!Array.isArray(rows))throw Error('Catálogo inválido.');
 return rows.filter(m=>typeof m.id==='string').map(m=>{
 const input=price(provider==='google'?googleMetadata[m.id]?.inputPrice:m.pricing?.prompt),output=price(provider==='google'?googleMetadata[m.id]?.outputPrice:m.pricing?.completion);
 const known=input!==null&&output!==null;
 const extraCharge=Object.entries(m.pricing||{}).some(([key,value])=>!['prompt','completion'].includes(key)&&price(value)>0);
 const freeVariant=m.id.endsWith(':free');
 let status='unknown',freeEligible=false,note='No se pudieron confirmar los precios.',source=null;
 if(provider==='openrouter'){
 status=known?(input===0&&output===0&&!extraCharge?'free':'paid'):'unknown';
 if(freeVariant&&status==='paid'){status='unknown';note='La variante :free contradice los precios publicados. No se considera gratuita.'}
 else note=known?`Entrada: ${input*1e6} USD / millón · Salida: ${output*1e6} USD / millón${extraCharge?' · Hay cargos adicionales':''}${freeVariant?' · Variante :free':''}`:freeVariant?'Variante :free; precios de entrada y salida no confirmados.':note;
 source='https://openrouter.ai/api/v1/models';
 }else if(provider==='google'){
 const info=googleMetadata[m.id];const fresh=info&&Date.parse(info.checkedAt)<=now&&now-Date.parse(info.checkedAt)<900000;freeEligible=!!(fresh&&info.freeEligible);source='https://ai.google.dev/gemini-api/docs/pricing';
 status=freeEligible&&accountPlan==='free'?'free':fresh&&info.paid&&accountPlan==='paid'?'paid':'unknown';
 note=freeEligible?'Disponible en nivel gratuito, sujeto a cuotas por proyecto.':'Precio y nivel gratuito no confirmados para este modelo.';
 note+=accountPlan==='free'?' · Nivel declarado por el usuario; facturación y cuota restante no verificadas.':accountPlan==='paid'?' · Proyecto declarado con facturación de pago; no se presupone gratuidad.':' · Declara el nivel de tu proyecto en Conectar IA para habilitar el filtro gratuito.';
 }else if(provider==='cerebras'){
 source='https://inference-docs.cerebras.ai/support/rate-limits';note='Precio no confirmado por el catálogo. Cerebras ofrece créditos de prueba temporales; no un nivel gratuito permanente. Revisa saldo, vencimiento y límites de tu cuenta.';
 }else if(provider==='zen'){
 const info=zenMetadata[m.id];const fresh=info&&Date.parse(info.checkedAt)<=now&&now-Date.parse(info.checkedAt)<900000;
 status=fresh?info.status:'unknown';source='https://opencode.ai/docs/zen';
 note=status==='free'?'Gratuito según la tabla oficial vigente; oferta limitada, sujeta a disponibilidad y límites de cuenta.':status==='paid'?'De pago según la tabla oficial; revisa créditos, facturación y límites en Zen.':'Precio no confirmado; no se presupone gratuidad por el nombre.';
 note+=info?.protocol?' · Protocolo: '+info.protocol:' · Protocolo no confirmado.';
 if(info?.protocol==='systemone')note+=' · Solo decisiones estructuradas en Plan; no genera archivos.';
 }else{
 const fresh=now>=Date.parse(groqCheckedAt)&&now-Date.parse(groqCheckedAt)<86400000;
 freeEligible=fresh&&groqFreeIds.has(m.id);
 source='https://console.groq.com/docs/rate-limits';
 note=freeEligible?'Disponible en plan gratuito, sujeto a cuotas':'Precio y disponibilidad gratuita no confirmados para este modelo.';
 if(freeEligible&&groqPlan==='free'){status='free';note+=' · Plan declarado por el usuario; cuota restante no confirmada.'}
 else if(freeEligible){note+=groqPlan==='paid'?' · Tu cuenta está marcada como plan de pago.':' · Plan de tu cuenta no confirmado.'}
 }
 return {id:m.id,name:provider==='zen'?(zenMetadata[m.id]?.name||m.id):typeof m.name==='string'?m.name:m.id,provider,modelProvider:provider==='openrouter'?m.id.split('/')[0]:(m.owned_by||m.id.split('/')[0]),status,label:status==='free'?'FREE':status==='paid'?'DE PAGO':provider==='zen'?'Precio no confirmado':'PRECIO NO CONFIRMADO',inputPrice:input,outputPrice:output,contextLimit:price(m.context_length??m.context_window),inputLimit:price(m.inputLimit),outputLimit:price(m.outputLimit??m.top_provider?.max_completion_tokens??m.max_completion_tokens),freeVariant,freeEligible,note,source,protocol:provider==='zen'?zenMetadata[m.id]?.protocol:null,checkedAt:provider==='groq'?groqCheckedAt:provider==='zen'?(zenMetadata[m.id]?.checkedAt||null):new Date(now).toISOString()};
 }).sort((a,b)=>a.id.localeCompare(b.id));
}
export function filterModels(models,{query='',provider='all',price='all',onlyFree=false}={}){
 const tokens=query.toLowerCase().trim().split(/\s+/).filter(Boolean);const freeWords=tokens.includes('free')||tokens.includes('gratis');const words=tokens.filter(t=>!['free','gratis'].includes(t));
 return models.filter(m=>(provider==='all'||m.provider===provider)&&(!(onlyFree||freeWords)||m.status==='free')&&(price==='all'||m.status===price)&&words.every(t=>`${m.id} ${m.name} ${m.provider} ${m.modelProvider} ${m.label}`.toLowerCase().includes(t)));
}
