"use strict";
const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('path');
const source=process.env.DICTIONARY_SOURCE_DIR||path.resolve(__dirname,'../../../LangNation Dictionary/Web/langnation-dictionary-v25');
const dict=require(path.join(source,'vocabulary-learning')),client=require('../lib/vocabulary-client');
test('classification contract is identical across applications',()=>assert.deepEqual(dict.catalogue,require('../lib/vocabulary-contract').catalogue));
test('Dictionary serialization passes the website canonical-ID contract',async()=>{const entry=dict.entry({id:42,word_de:'helfen',word_en:'to help',pos:'verb',primary_level:'A1',learning_enabled:1,theme_codes:'T03',grammar_codes:'G06'});const fetched=await require('../lib/vocabulary-upstream').get('vocabulary:42',async()=>({ok:true,text:async()=>JSON.stringify(entry)}));assert.equal(fetched.id,'vocabulary:42');assert.deepEqual(fetched.grammarIds,['G06']);});
