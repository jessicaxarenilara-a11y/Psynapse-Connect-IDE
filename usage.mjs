// Only numeric, explicitly allowed metadata is persisted. Never store prompts or headers.
const num=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
export const estimate=text=>Math.ceil([...String(text)].length/3);
export function contextInfo(system,messages,model){const input=estimate(system)+estimate(JSON.stringify(messages))+messages.length*4;const reserve=Math.min(8192,model?.outputLimit||8192);return {input,estimated:true,reserve,limit:model?.contextLimit||null,inputLimit:model?.inputLimit||null,available:model?.contextLimit?Math.max(0,model.contextLimit-input-reserve):model?.inputLimit?Math.max(0,model.inputLimit-input):null};}
export function readUsage(provider,data,headers,model,context){
 const u=provider==='google'?data.usageMetadata||{}:data.usage||{};
 const reportedInput=num(provider==='google'?u.promptTokenCount:u.prompt_tokens),reportedOutput=num(provider==='google'?u.candidatesTokenCount:u.completion_tokens);
 const reasoning=num(provider==='google'?u.thoughtsTokenCount:u.completion_tokens_details?.reasoning_tokens)||0;
 const input=reportedInput??context.input,output=reportedOutput===null?estimate(JSON.stringify(provider==='google'?data.candidates||[]:data.choices||[])):reportedOutput+(provider==='google'?reasoning:0);
 const costReported=provider==='openrouter'?num(u.cost):null;
 const free=model?.status==='free'&&!(costReported>0);
 const priceKnown=num(model?.inputPrice)!==null&&num(model?.outputPrice)!==null;
 const cost=costReported??(free?0:priceKnown?input*model.inputPrice+output*model.outputPrice:null);
 const quotas={};for(const type of ['requests','tokens']){const raw=headers.get('x-ratelimit-remaining-'+type);if(raw!==null&&raw.trim()!==''&&Number.isFinite(Number(raw))&&Number(raw)>=0){quotas[type]={remaining:Number(raw)};const reset=headers.get('x-ratelimit-reset-'+type);if(reset&&/^[0-9.smhd :T+Z-]+$/.test(reset))quotas[type].reset=reset;}}
 return {input,output,reasoning,inputEstimated:reportedInput===null,outputEstimated:reportedOutput===null,cost,costKind:costReported!==null?'reported':free?'free':cost===null?'unavailable':'estimated',free,quotas};
}
export function totals(rows){return {requests:rows.length,input:rows.reduce((n,r)=>n+r.input,0),output:rows.reduce((n,r)=>n+r.output,0),estimated:rows.some(r=>r.inputEstimated||r.outputEstimated),cost:rows.reduce((n,r)=>n+(r.cost||0),0),costIncomplete:rows.some(r=>r.cost===null),costEstimated:rows.some(r=>r.costKind==='estimated'),free:rows.length>0&&rows.every(r=>r.free)};}
