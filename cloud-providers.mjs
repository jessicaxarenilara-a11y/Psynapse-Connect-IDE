import {zenRequest,zenResponse} from './zen-provider.mjs';
export const googleBase='https://generativelanguage.googleapis.com/v1beta';
export const googlePricing='https://ai.google.dev/gemini-api/docs/pricing';
const plain=s=>s.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
export function parseGooglePricing(html){
 const result=Object.create(null);
 for(const section of html.split(/<h2\b/i).slice(1)){
 const id=section.match(/<code\b[^>]*>\s*(gemini-[\w.-]+)\s*<\/code>/i)?.[1];if(!id)continue;
 const table=section.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1];if(!table)continue;
 const rows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(r=>[...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>plain(c[1])));
 if(!rows[0]?.some(c=>/Free Tier/i.test(c)))continue;
 const input=rows.find(r=>/^Input price/i.test(r[0])),output=rows.find(r=>/^Output price/i.test(r[0]));
 const tokenPrice=text=>{const t=String(text||'');const values=[...t.matchAll(/\$(\d+(?:\.\d+)?)/g)];return values.length===1&&!/audio|image|video|batch|[<>≤≥]/i.test(t)?Number(values[0][1])/1e6:null};
 if(input&&output)result[id]={inputPrice:tokenPrice(input[2]),outputPrice:tokenPrice(output[2]),freeEligible:/^Free of charge$/i.test(input[1])&&/^Free of charge$/i.test(output[1]),paid:[input[2],output[2]].some(s=>[...String(s).matchAll(/\$(\d+(?:\.\d+)?)/g)].some(m=>Number(m[1])>0)),checkedAt:new Date().toISOString()};
 }return result;
}
export async function googlePrices(){try{const r=await fetch(googlePricing+'?hl=en',{signal:AbortSignal.timeout(15000)});if(!r.ok)return {};return parseGooglePricing(await r.text())}catch{return {}}}
export async function fetchModelRows(provider,key,base){
 const headers=provider==='google'?{'x-goog-api-key':key}:{Authorization:'Bearer '+key};let next=base+'/models',rows=[],pages=0;
 while(next){if(++pages>20)throw Object.assign(Error('Catálogo demasiado grande. No se aplicaron cambios.'),{status:502});const r=await fetch(next,{headers,signal:AbortSignal.timeout(20000)});if(!r.ok)return {ok:false,status:r.status};const d=await r.json();
 if(provider!=='google')return {ok:true,rows:d.data};
 if(!Array.isArray(d.models))throw Object.assign(Error('Catálogo Google inválido.'),{status:502});rows.push(...d.models.filter(m=>m.supportedGenerationMethods?.includes('generateContent')).map(m=>({id:m.name?.replace(/^models\//,''),name:m.displayName,owned_by:'Google',inputLimit:m.inputTokenLimit,outputLimit:m.outputTokenLimit})));
 next=d.nextPageToken?base+'/models?pageToken='+encodeURIComponent(d.nextPageToken):null;
 }return {ok:true,rows};
}
export function googleRequest(args){const request=zenRequest({...args,protocol:'gemini'});request.url=request.url.replace('https://opencode.ai/zen/v1',googleBase);return request;}
export const googleResponse=d=>zenResponse(d,'gemini');
