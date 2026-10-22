'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createPublicFixture}=require('./community-ui-dom-fixture');
test('hero/group CTAs obey global availability and reports stay hidden when disabled',async()=>{
 for(const options of [{applications:false},{feature:false},{groups:[{id:1,name:'Closed group',city:'Berlin',acceptingApplications:false}]}]){const f=await createPublicFixture(options);assert.equal(f.hero.hidden,true);assert.equal(f.availability.textContent,'Applications are currently closed.');assert.equal(f.doc.getElementById('community-join'),null);assert.equal(f.doc.getElementById('community-report'),null);assert.ok(!f.byText('Report a concern'));}
});
test('compact dynamic group metadata, collapsed form, hero opening and exact group preselection',async()=>{
 const f=await createPublicFixture();assert.equal(f.hero.hidden,false);assert.equal(f.doc.getElementById('community-join').hidden,true);assert.match(f.content.textContent,/47 members/);assert.match(f.content.textContent,/Part of: Neighbours in Germany/);
 const buttons=f.root.querySelectorAll('button').filter(n=>n.textContent==='Request to Join');await buttons[1].click();assert.equal(f.input('groupId').value,'2');assert.match(f.doc.getElementById('community-join').textContent,/Applying for: Neighbours in Magdeburg/);assert.equal(f.doc.activeElement,f.input('fullName'));assert.equal(f.doc.getElementById('community-join').hidden,false);
 await f.hero.click();assert.equal(f.input('groupId').value,'');
});
test('configured rules/privacy render headings/lists safely and can be expanded before submission',async()=>{
 const f=await createPublicFixture(),rules=f.doc.getElementById('community-rules'),privacy=f.doc.getElementById('community-privacy');assert.equal(rules.querySelector('div.cm-policy-body')?.hidden??rules.querySelectorAll('div').find(n=>n.classList.contains('cm-policy-body')).hidden,true);assert.ok(rules.querySelector('ol'));assert.ok(privacy.querySelector('ul'));assert.ok(rules.querySelector('strong'));assert.ok(!f.root.querySelector('script'));assert.doesNotMatch(privacy.textContent,/## Privacy Notice|\n- Only/);
 const link=f.doc.getElementById('community-join').querySelectorAll('a').find(n=>n.textContent==='privacy notice');await link.click();const popup=f.doc.body.querySelector('dialog');assert.ok(popup);assert.match(popup.textContent,/We review membership requests/);assert.equal(f.input('privacyAccepted').checked,false);const pane=popup.querySelector('div.terms-scroll')||popup.querySelectorAll('div').find(n=>n.classList.contains('terms-scroll'));pane.scrollTop=100;pane.clientHeight=100;pane.scrollHeight=200;await pane.fire('scroll');await popup.querySelectorAll('button').find(n=>n.textContent==='I accept').click();assert.equal(f.input('privacyAccepted').checked,true);
});
test('submission uses the selected group/consent version and replaces form with neutral receipt',async()=>{
 const f=await createPublicFixture();const buttons=f.root.querySelectorAll('button').filter(n=>n.textContent==='Request to Join');await buttons[1].click();for(const [name,value]of Object.entries({fullName:'Example Applicant',phone:'+4917612345678',city:'Magdeburg',reason:'I want to meet neighbours and share helpful advice.'}))f.input(name).value=value;f.input('rulesAccepted').checked=true;f.input('privacyAccepted').checked=true;
 await f.doc.getElementById('community-join').querySelector('form').fire('submit');const call=f.calls.find(c=>c.options.method==='POST'),body=JSON.parse(call.options.body);assert.equal(body.groupId,2);assert.equal(body.rulesVersion,'group-custom');assert.equal(call.options.headers['X-CSRF-Token'],'a'.repeat(64));assert.match(f.doc.getElementById('community-join').textContent,/Request received/);assert.match(f.doc.getElementById('community-join').textContent,/Neighbours in Magdeburg/);assert.match(f.doc.getElementById('community-join').textContent,/does not automatically add you/);assert.doesNotMatch(f.content.textContent,/chat\.whatsapp\.com|risk_score|blocked_member/);
 await buttons[0].click();assert.equal(f.input('groupId').value,'1');assert.equal(f.input('fullName').value,'');
});
test('report CTA opens the compact form only when enabled and preserves private report API fields',async()=>{
 const f=await createPublicFixture({reports:true});assert.equal(f.doc.getElementById('community-report').hidden,true);await f.byText('Report a concern').click();assert.equal(f.doc.getElementById('community-report').hidden,false);
 f.input('groupId','community-report').value='1';f.input('category','community-report').value='SPAM';f.input('description','community-report').value='Repeated spam messages were shared in the community.';f.input('privacyAccepted','community-report').checked=true;await f.doc.getElementById('community-report').querySelector('form').fire('submit');const call=f.calls.find(c=>c.url==='/api/community/reports');assert.ok(call);assert.equal(JSON.parse(call.options.body).privacyVersion,'1');assert.match(f.doc.getElementById('community-report').textContent,/Report received/);
});
test('presentation has scoped desktop/mobile grids and protects hidden CTAs/forms',()=>{
 const css=fs.readFileSync(path.join(__dirname,'../public/css/site.css'),'utf8');assert.match(css,/\.cm-public \.cm-public-fields\{grid-template-columns:1fr 1fr/);assert.match(css,/@media\(max-width:680px\)/);assert.match(css,/\.cm-public \.cm-public-fields\{grid-template-columns:1fr\}/);assert.match(css,/\.cm-public \[hidden\]\{display:none!important/);
});

test('stale consent refresh preserves typed draft and clears acknowledgements',async()=>{
 let f;f=await createPublicFixture({submit:async()=>{f.config.rulesVersion='2';f.config.privacyVersion='2';f.groups[0].rulesVersion='2';return {status:409,data:{error:'Rules changed'}};}});
 await f.root.querySelectorAll('button').find(n=>n.textContent==='Request to Join').click();
 for(const [name,value]of Object.entries({fullName:'Example Applicant',phone:'+4917612345678',city:'Berlin',reason:'I want to meet neighbours and share local advice.'}))f.input(name).value=value;
 f.input('rulesAccepted').checked=true;f.input('privacyAccepted').checked=true;await f.doc.getElementById('community-join').querySelector('form').fire('submit');
 assert.equal(f.input('fullName').value,'Example Applicant');assert.equal(f.input('groupId').value,'1');assert.equal(f.input('rulesAccepted').checked,false);assert.equal(f.input('privacyAccepted').checked,false);assert.equal(f.doc.getElementById('community-join').hidden,false);
});

test('country selector combines local numbers and preserves explicit international numbers',async()=>{
 for(const [country,phone,expected]of [['IN','9876543210','+919876543210'],['DE','017612345678','+4917612345678'],['IN','+4917612345678','+4917612345678'],['DE','00919876543210','+919876543210']]){
  const f=await createPublicFixture();await f.hero.click();f.input('groupId').value='1';f.input('phoneCountry').value=country;
  for(const [name,value]of Object.entries({fullName:'Example Applicant',phone,city:'Berlin',reason:'I would like to meet and support local neighbours.'}))f.input(name).value=value;
  f.input('rulesAccepted').checked=true;f.input('privacyAccepted').checked=true;await f.doc.getElementById('community-join').querySelector('form').fire('submit');
  assert.equal(JSON.parse(f.calls.find(c=>c.options.method==='POST').options.body).phone,expected);
 }
});

test('public policy cards precede groups and open read-only popups without recording acceptance',async()=>{
 const f=await createPublicFixture(),rules=f.doc.getElementById('community-rules');const policyRow=rules.parentNode,list=f.content.children.find(n=>n.classList.contains('cm-public-groups'));assert.ok(f.content.children.indexOf(policyRow)<f.content.children.indexOf(list));await rules.querySelector('button').click();const popup=f.doc.body.querySelector('dialog');assert.ok(popup);assert.ok(!popup.querySelectorAll('button').find(n=>n.textContent==='I accept'));assert.equal(f.input('rulesAccepted').checked,false);assert.ok(!f.calls.some(c=>c.options.method==='POST'));
});

test('slug target automatically opens the existing exact-group form, while closed targets stay hidden',async()=>{
 const target={id:2,slug:'magdeburg',name:'Neighbours in Magdeburg'},groups=[{id:1,slug:'berlin',name:'Berlin',city:'Berlin',acceptingApplications:true},{id:2,slug:'magdeburg',name:target.name,city:'Magdeburg',acceptingApplications:true,rulesVersion:'1'}];
 const f=await createPublicFixture({groups,joinTarget:target});assert.equal(f.doc.getElementById('community-join').hidden,false);assert.equal(f.input('groupId').value,'2');assert.match(f.doc.getElementById('community-join').textContent,/Applying for: Neighbours in Magdeburg/);assert.equal(f.doc.activeElement,f.input('fullName'));
 for(const options of [{applications:false},{groups:groups.map(g=>({...g,acceptingApplications:g.id===1}))}]){const closed=await createPublicFixture({groups,joinTarget:target,...options});assert.equal(closed.doc.getElementById('community-join')?.hidden??true,true);assert.match(closed.availability.textContent,/Applications for Neighbours in Magdeburg are currently closed/);}
});
