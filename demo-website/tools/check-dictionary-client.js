"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict');const client=require('../lib/dictionary-client');
test('selection preserves German characters, phrases and internal hyphens',()=>{assert.equal(client.selection(' „Straße!“ ').query,'Straße');assert.equal(client.selection('schönes Wetter').query,'schönes Wetter');assert.equal(client.selection('E-Mail').query,'E-Mail');assert.throws(()=>client.selection(''));assert.throws(()=>client.selection('x'.repeat(251)));});
test('bridge normalizes real API contract and caches repeated queries',async()=>{let calls=0;const fetcher=async()=>{calls++;return new Response(JSON.stringify({results:[{id:'vocabulary:7',headword:'Regenbogen',meanings:[{text:'rainbow'}]}]}));};const a=await client.lookup('Regenbogen','en',fetcher);await client.lookup('Regenbogen','en',fetcher);assert.equal(calls,1);assert.equal(a.results[0].id,'vocabulary:7');assert(a.results[0].fullDictionaryUrl.includes('q=Regenbogen'));});
test('no match is a successful empty result',async()=>{const r=await client.lookup('unbekannt-test','en',async()=>new Response('{"results":[]}'));assert.deepEqual(r.results,[]);});
test('upstream errors, aborts and invalid response shape fail instead of pretending no match',async()=>{await assert.rejects(client.lookup('offline-test','en',async()=>new Response('{}',{status:503})));await assert.rejects(client.lookup('abort-test','en',async()=>{throw new DOMException('Timeout','TimeoutError');}));await assert.rejects(client.lookup('invalid-test','en',async()=>new Response('{"results":[{"headword":"x"}]}')));});
test('upstream request is bounded, nonredirecting and never forwards student cookies',async()=>{await client.lookup('request-test','en',async(url,opts)=>{assert(opts.signal instanceof AbortSignal);assert.equal(opts.redirect,'error');assert(!opts.headers.Cookie);assert.equal(url.pathname,'/api/v1/dictionary/lookup');return new Response('{"results":[]}');});});
test('lookup rate limits are per authenticated student',()=>{for(let n=0;n<40;n++)assert(client.allowed(999));assert(!client.allowed(999));assert(client.allowed(1000));});

test('AI result keys are accepted and empty results are retried',async()=>{let n=0;const fetcher=async()=>new Response(JSON.stringify({results:++n===1?[]:[{id:'lookup:'+ 'a'.repeat(64),headword:'bunt',meanings:[{text:'colorful'}]}]}));await client.lookup('ai-fallback-test','en',fetcher);const value=await client.lookup('ai-fallback-test','en',fetcher);assert.equal(n,2);assert.equal(value.results[0].headword,'bunt');});

test('translation has a separate service contract and preserves sentence punctuation',async()=>{
 const source='Der Regenbogen besteht aus vielen Farben.';
 const result=await client.translate(source,async(url,opts)=>{assert.equal(url.pathname,'/api/v1/dictionary/translate');assert.equal(opts.method,'POST');assert.deepEqual(JSON.parse(opts.body),{text:source,target:'en'});assert(!opts.headers.Cookie);return new Response(JSON.stringify({translation:'The rainbow consists of many colors.'}));});
 assert.equal(result.source,source);assert.equal(result.translation,'The rainbow consists of many colors.');
 assert.throws(()=>client.translationText('x'.repeat(2001)));assert.throws(()=>client.translationText({}));
 await assert.rejects(client.translate('invalid translation',async()=>new Response('{"results":[{"meanings":[{"text":"wrong gloss"}]}]}')));
 await assert.rejects(client.translate('offline translation',async()=>new Response('{}',{status:503})));
});
test('bridge ranks stored forms and partitions its cache by sentence context',async()=>{
 let calls=0;const fixture={results:[{id:'vocabulary:1',headword:'ansehen',verbForms:{praesens:['sehe an']}},{id:'vocabulary:2',headword:'sehen',verbForms:{praesens:['sehe']}}]};
 const fetcher=async url=>{calls++;assert(url.searchParams.has('context'));return new Response(JSON.stringify(fixture));};
 for(const context of ['Ich sehe das.','Ich sehe den Film an.']){const result=await client.lookup('sehe','en',fetcher,context);assert.equal(result.results[0].headword,'sehen');}
 assert.equal(calls,2);
});
