"use strict";
const {env}=require('./env');
const {rank}=require('./dictionary-ranking');
const cache=new Map(),hits=new Map();
function selection(value) {
  if(typeof value!=='string')throw Error('Select German text first.');
  const raw=value.normalize('NFC').trim();
  if(!raw || [...raw].length>250)throw Error('Select between 1 and 250 characters.');
  return {raw,query:raw.replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu,''),phrase:/\s/u.test(raw)};
}
function allowed(student) {
  const now=Date.now(),recent=(hits.get(student)||[]).filter(t=>t>now-60000);
  if(recent.length>=40)return false;recent.push(now);hits.set(student,recent);
  if(hits.size>2000)for(const [k,v]of hits)if(v.at(-1)<now-60000)hits.delete(k);
  return true;
}
async function lookup(value,target='en',fetcher=fetch,context='') {
  if(typeof context!=='string'||context.length>1000)throw Error('Invalid selection context.');
  const {query}=selection(value);if(!query)throw Error('Select a word.');
  if(target!=='en')throw Error('Only English is currently supported.');
  const base=new URL(env('DICTIONARY_BASE_URL','https://langnation.de'));
  if(base.protocol!=='https:' && !['localhost','127.0.0.1'].includes(base.hostname))throw Error('Dictionary must use HTTPS.');
  const key=JSON.stringify([target,query,context]);const prior=cache.get(key);if(prior&&prior.until>Date.now())return prior.value;
  const url=new URL('/api/v1/dictionary/lookup',base);url.search=new URLSearchParams({q:query,target,context});
  const response=await fetcher(url,{headers:{Accept:'application/json',...(env('DICTIONARY_SERVICE_KEY')?{'x-dictionary-key':env('DICTIONARY_SERVICE_KEY')}:{})},signal:AbortSignal.timeout(Math.min(90000,Math.max(30000,Number(env('DICTIONARY_TIMEOUT_MS',60000))||60000))),redirect:'error'});
  if(!response.ok)throw Error('Dictionary temporarily unavailable.');
  const raw=await response.text();if(raw.length>200000)throw Error('Dictionary response too large.');
  const valueOut=JSON.parse(raw);
  if(!Array.isArray(valueOut.results)||valueOut.results.length>40)throw Error('Invalid Dictionary response.');
  const valueSafe={query,matchType:valueOut.matchType,translationAvailable:!!valueOut.translationAvailable,results:valueOut.results.map(r=>{
    if(typeof r.id!=='string'||!/^(vocabulary:[0-9]+|lookup:[a-f0-9]{64})$/.test(r.id)||typeof r.headword!=='string')throw Error('Invalid Dictionary entry.');
    return {...r,audioUrl:null,fullDictionaryUrl:new URL('/?q='+encodeURIComponent(r.headword),base).href};
  }),translation:typeof valueOut.translation==='string'?valueOut.translation.slice(0,4000):null};
  valueSafe.results=rank(valueSafe.results,query,context);
  if(cache.size>=500)cache.delete(cache.keys().next().value);
  if(valueSafe.results.length)cache.set(key,{value:valueSafe,until:Date.now()+Math.max(60,Math.min(86400,Number(env('DICTIONARY_CACHE_SECONDS',3600))||3600))*1000});return valueSafe;
}
function translationText(value) {
  if(typeof value!=='string'||!value.trim()||[...value].length>2000)throw Error('Select a sentence or phrase of up to 2000 characters.');
  return value.normalize('NFC').trim();
}
async function translate(value,fetcher=fetch) {
  const text=translationText(value),key='translate:'+text,prior=cache.get(key);
  if(prior&&prior.until>Date.now())return prior.value;
  const base=new URL(env('DICTIONARY_BASE_URL','https://langnation.de'));
  if(base.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(base.hostname))throw Error('Dictionary must use HTTPS.');
  const response=await fetcher(new URL('/api/v1/dictionary/translate',base),{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json',...(env('DICTIONARY_SERVICE_KEY')?{'x-dictionary-key':env('DICTIONARY_SERVICE_KEY')}:{})},body:JSON.stringify({text,target:'en'}),signal:AbortSignal.timeout(Math.min(90000,Math.max(30000,Number(env('DICTIONARY_TIMEOUT_MS',60000))||60000))),redirect:'error'});
  if(!response.ok)throw Error('Translation temporarily unavailable.');
  const raw=await response.text();if(raw.length>20000)throw Error('Translation response too large.');
  const result=JSON.parse(raw);if(typeof result.translation!=='string'||!result.translation.trim()||result.translation.length>8000)throw Error('Invalid translation response.');
  const safe={source:text,translation:result.translation};
  if(cache.size>=500)cache.delete(cache.keys().next().value);
  cache.set(key,{value:safe,until:Date.now()+3600000});return safe;
}
module.exports={lookup,translate,translationText,selection,allowed};
