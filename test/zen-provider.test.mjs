import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseZenDocs,zenRequest,zenResponse} from '../zen-provider.mjs';
import {normalizeModels,filterModels} from '../model-catalog.mjs';
const html=readFileSync(new URL('./fixtures/zen-docs.html',import.meta.url),'utf8');
test('Zen obtiene protocolo por tabla oficial y gratuidad por precio vigente, no por nombre',()=>{
 const now=Date.now(),meta=parseZenDocs(html,now);assert.equal(meta['gpt-6-sol'].protocol,'responses');assert.equal(meta['claude-sonnet-5'].protocol,'messages');assert.equal(meta['gemini-3.8-flash'].protocol,'gemini');assert.equal(meta['jev-1.13-free'].protocol,'systemone');
 const rows=[...Object.keys(meta).map(id=>({id})),{id:'invented-free'}];const models=normalizeModels('zen',rows,{zenMetadata:meta,now});assert.deepEqual(filterModels(models,{query:'gratis'}).map(m=>m.id),['big-pickle','jev-1.13-free']);assert.equal(models.find(m=>m.id==='invented-free').status,'unknown');assert.equal(filterModels(normalizeModels('zen',rows,{zenMetadata:meta,now:now+900000}),{onlyFree:true}).length,0);assert.equal(filterModels(normalizeModels('zen',rows),{query:'free'}).length,0);assert.throws(()=>parseZenDocs('<html>sin tablas</html>'));
});
test('Zen serializa cada protocolo y lee solo texto, rechazando truncamiento',()=>{
 const messages=[{role:'user',content:'Hola'},{role:'assistant',content:'Respuesta'}],common={model:'model',key:'fake-key',system:'JSON',messages,mode:'plan'};
 for(const protocol of ['chat','responses','messages','gemini','systemone']){const request=zenRequest({...common,protocol});const body=JSON.parse(request.options.body);if(protocol!=='gemini')assert.equal(body.model,common.model);else assert.ok(request.url.includes('/models/'+common.model+':generateContent'));assert.ok(!request.url.includes(common.key));assert.ok(!request.options.body.includes(common.key));if(protocol==='chat')assert.equal(body.messages[0].role,'system');if(protocol==='responses'){assert.equal(body.instructions,'JSON');assert.deepEqual(body.input,messages);assert.equal(body.store,false)}if(protocol==='messages'){assert.equal(body.system,'JSON');assert.equal(request.options.headers['anthropic-version'],'2023-06-01')}if(protocol==='gemini'){assert.ok(request.url.endsWith(':generateContent'));assert.equal(body.contents[1].role,'model');assert.equal(body.generationConfig.responseMimeType,'application/json')}if(protocol==='systemone')assert.equal(body.questions.can_build.type,'noul');}
 assert.equal(zenResponse({output:[{type:'reasoning'},{type:'message',content:[{type:'output_text',text:'json'}]}]},'responses'),'json');assert.equal(zenResponse({content:[{type:'thinking',thinking:'oculto'},{type:'text',text:'json'}]},'messages'),'json');assert.equal(zenResponse({candidates:[{content:{parts:[{thought:true,text:'oculto'},{text:'json'}]}}]},'gemini'),'json');
 for(const [protocol,data] of [['chat',{choices:[{finish_reason:'length'}]}],['responses',{status:'incomplete'}],['messages',{stop_reason:'max_tokens'}],['gemini',{candidates:[{finishReason:'MAX_TOKENS'}]}]])assert.throws(()=>zenResponse(data,protocol),/incompleta/);
 assert.throws(()=>zenRequest({...common,protocol:null}),/no confirmado/);assert.throws(()=>zenRequest({...common,protocol:'systemone',mode:'build'}),/no genera archivos/);
});
