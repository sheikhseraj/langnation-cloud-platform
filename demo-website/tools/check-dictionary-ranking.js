'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {rank,normalize,score}=require('../lib/dictionary-ranking');
const verb=(headword,praesens,praeteritum,partizip2)=>({headword,verbForms:{praesens:JSON.stringify(praesens),praeteritum:JSON.stringify(praeteritum||[]),partizip2}});
const entries=[verb('entgegensehen',['sehe entgegen','siehst entgegen','sieht entgegen']),verb('verschreiben',['verschreibe','verschreibst','verschreibt']),verb('beschreiben',['beschreibe']),verb('ansehen',['sehe an','siehst an','sieht an']),verb('übersehen',['übersehe']),verb('versehen',['versehe']),
  verb('schreiben',['ich schreibe','du schreibst','er/sie/es schreibt']),verb('sehen',['sehe','siehst','sieht'],['sah'],'gesehen'),verb('gehen',['gehe','gehst','geht'],['ging'],'gegangen'),verb('arbeiten',['arbeite','arbeitest','arbeitet']),verb('lernen',['lerne','lernst','lernt']),verb('machen',['mache','machst','macht'])];
for(const [query,expected] of Object.entries({schreibe:'schreiben',Schreibe:'schreiben','schreibe,':'schreiben',sehe:'sehen',siehst:'sehen',sieht:'sehen',gesehen:'sehen',gehe:'gehen',ging:'gehen',gegangen:'gehen',arbeite:'arbeiten',arbeitet:'arbeiten',lernst:'lernen',macht:'machen',verschreiben:'verschreiben',beschreiben:'beschreiben',ansehen:'ansehen',entgegensehen:'entgegensehen'}))test(query+' → '+expected,()=>assert.equal(rank(entries,query)[0].headword,expected));
test('sentence-supported split forms remain secondary to the stored base form',()=>{
  for(const [context,second] of [['Ich sehe den Film an.','ansehen'],['Ich sehe dem Ergebnis entgegen.','entgegensehen']]){const results=rank(entries,'sehe',context);assert.equal(results[0].headword,'sehen');assert.equal(results[1].headword,second);assert.equal(score(results[1],'sehe',context),3);}
  assert.equal(score(entries[0],'sehe'),5);
});
test('German characters are preserved and noun forms/article normalization work',()=>{
  assert.equal(normalize(' „Straße!“ '),'straße');assert.notEqual(normalize('schön'),normalize('schon'));
  assert.equal(rank([{headword:'das Haus',nounForms:{plural_de:'Häuser'}},{headword:'Haustür'}],'Häuser')[0].headword,'das Haus');
  assert.equal(score({headword:'der Regenbogen'},'Regenbogen'),1);
});
test('no ending stripping or family-only lemma promotion',()=>{
  assert.equal(score({headword:'verschreiben',lemma:'schreiben'},'schreibe'),5);
  assert.equal(score({headword:'sehen'},'siehst'),6);
});

test('older stored perfect principal parts resolve participles without stripping endings',()=>{
 assert.equal(rank([{headword:'ansehen',verbForms:{perfekt:['hat angesehen']}},{headword:'sehen',verbForms:{perfekt:['er hat gesehen']}}],'gesehen')[0].headword,'sehen');
 assert.equal(score({headword:'sehen',verbForms:{perfekt:'hat gesehen'}},'gesehen'),2);
});
