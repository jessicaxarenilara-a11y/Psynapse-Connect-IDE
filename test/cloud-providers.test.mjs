import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseGooglePricing,googleRequest,googleResponse} from '../cloud-providers.mjs';
import {normalizeModels,filterModels} from '../model-catalog.mjs';
export const pricingFixture='<h2>Gemini 2.5 Flash</h2><code>gemini-2.5-flash</code><table><tr><th></th><th>Free Tier</th><th>Paid Tier</th></tr><tr><td>Input price</td><td>Free of charge</td><td>$0.30</td></tr><tr><td>Output price (including thinking tokens)</td><td>Free of charge</td><td>$2.50</td></tr></table>';
test('Google comprueba tabla y nivel declarado; Cerebras no confunde créditos con modelos FREE',()=>{
 const metadata=parseGooglePricing(pricingFixture),rows=[{id:'gemini-2.5-flash'},{id:'invented-free'}];assert.equal(metadata['gemini-2.5-flash'].freeEligible,true);
 assert.equal(filterModels(normalizeModels('google',rows,{googleMetadata:metadata}),{query:'gratis'}).length,0);assert.equal(filterModels(normalizeModels('google',rows,{googleMetadata:metadata,accountPlan:'free'}),{query:'free'}).length,1);assert.equal(filterModels(normalizeModels('google',rows,{googleMetadata:metadata,accountPlan:'paid'}),{query:'free'}).length,0);assert.equal(normalizeModels('google',rows,{googleMetadata:metadata,accountPlan:'paid'}).find(m=>m.id==='gemini-2.5-flash').status,'paid');assert.equal(filterModels(normalizeModels('cerebras',[{id:'llama-free'}]),{query:'gratis'}).length,0);
 const request=googleRequest({model:'gemini-2.5-flash',key:'fake-secret',system:'JSON',messages:[{role:'user',content:'hola'}]});assert.equal(request.url,'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');assert.equal(request.options.headers['x-goog-api-key'],'fake-secret');assert.ok(!request.url.includes('fake-secret'));assert.equal(googleResponse({candidates:[{content:{parts:[{text:'{}'}]}}]}),'{}');assert.throws(()=>googleResponse({candidates:[{finishReason:'MAX_TOKENS'}]}));
 assert.equal(filterModels(normalizeModels('google',rows,{googleMetadata:metadata,accountPlan:'free',now:Date.now()+900001}),{onlyFree:true}).length,0);
});
