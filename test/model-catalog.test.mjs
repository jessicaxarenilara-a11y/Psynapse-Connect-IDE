import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeModels,filterModels} from '../model-catalog.mjs';
const now=Date.parse('2026-10-10T12:00:00-06:00');
test('OpenRouter verifica ambos precios y no confía solo en :free o el nombre',()=>{
 const rows=[{id:'a/free-name',pricing:{prompt:'0.1',completion:'0.2'}},{id:'a/model:free',pricing:{prompt:'0',completion:'0'}},{id:'b/zero',pricing:{prompt:'0',completion:'0'}},{id:'c/unknown:free'},{id:'d/missing',pricing:{prompt:'0'}},{id:'e/conflict:free',pricing:{prompt:'0',completion:'1'}},{id:'f/request',pricing:{prompt:'0',completion:'0',request:'1'}},{id:'g/null',pricing:{prompt:null,completion:''}}];
 const models=normalizeModels('openrouter',rows,{now});
 assert.deepEqual(filterModels(models,{query:'free'}).map(m=>m.id),['a/model:free','b/zero']);
 assert.deepEqual(filterModels(models,{query:'gratis'}),filterModels(models,{onlyFree:true}));
 assert.deepEqual(filterModels(models,{query:'free a'}).map(m=>m.id),['a/model:free']);
 assert.equal(models.find(m=>m.id==='a/free-name').status,'paid');assert.equal(models.find(m=>m.id==='e/conflict:free').status,'unknown');assert.equal(models.find(m=>m.id==='f/request').status,'paid');assert.equal(models.find(m=>m.id==='g/null').status,'unknown');
});
test('Groq requiere documentación vigente y plan declarado; nunca clasifica por nombre',()=>{
 const rows=[{id:'openai/gpt-oss-20b'},{id:'made-up-free'}];
 assert.equal(normalizeModels('groq',rows,{now})[1].status,'unknown');
 const free=normalizeModels('groq',rows,{now,groqPlan:'free'});assert.equal(free.find(m=>m.id==='openai/gpt-oss-20b').status,'free');assert.ok(free.find(m=>m.id==='openai/gpt-oss-20b').note.includes('sujeto a cuotas'));assert.equal(free.find(m=>m.id==='made-up-free').status,'unknown');
 assert.equal(filterModels(normalizeModels('groq',rows,{now,groqPlan:'paid'}),{onlyFree:true}).length,0);
 assert.equal(filterModels(normalizeModels('groq',rows,{now:now+86400000,groqPlan:'free'}),{onlyFree:true}).length,0);
 assert.equal(filterModels(free,{query:'gratis Groq',provider:'openrouter'}).length,0);
});
