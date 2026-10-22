// Uses preview-reading.js: real UI/routes with explicitly simulated upstream services.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-gpu']});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900},serviceWorkers:'block'}),errors=[],requests=[];
  const output=process.env.READING_SCREENSHOTS||path.resolve('tools/_work/dictionary-screenshots');fs.mkdirSync(output,{recursive:true});
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',req=>{if(req.url().includes('/portal/dictionary/')||req.url().endsWith('/portal/vocabulary'))requests.push({url:req.url(),body:req.postDataJSON()});});
  await page.request.post('http://127.0.0.1:3047/qa/reset');
  await page.goto('http://127.0.0.1:3047/portal/lesen/1');
  await page.evaluate(()=>{window.spoken=[];speechSynthesis.speak=u=>window.spoken.push(u.text);});
  async function select(text){
   await page.locator('#reading-passage').scrollIntoViewIfNeeded();
   await page.evaluate(text=>{document.activeElement?.blur();const walker=document.createTreeWalker(document.querySelector('#reading-passage'),NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const i=n.textContent.indexOf(text);if(i>=0){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+text.length);getSelection().removeAllRanges();getSelection().addRange(r);break;}}},text);
   await page.keyboard.press('Alt+w');
  }
  const action=name=>page.locator('[data-dict-action='+name+']').click();
  async function screenshot(name){await page.waitForTimeout(200);const b=await page.locator('#dictionary-panel').boundingBox();assert(b.x>=0&&b.x+b.width<=page.viewportSize().width);assert(b.y>=0&&b.y+b.height<=page.viewportSize().height);await page.screenshot({path:path.join(output,name+'.png')});}
  await select('Regenbogen');await action('meaning');await page.waitForSelector('.dictionary-entry');
  assert.equal(await page.locator('#dictionary-result > .dictionary-entry h3').innerText(),'der Regenbogen');
  assert.equal(new URL(requests.at(-1).url).searchParams.get('q'),'Regenbogen');await screenshot('01-word-meaning');
  await action('translate');await page.waitForSelector('.translation-target');
  const sentence='Der Regenbogen besteht aus vielen Farben.';
  assert.equal(await page.locator('.translation-source').innerText(),sentence);assert.equal(await page.evaluate(()=>getSelection().toString()),sentence);
  assert.equal(await page.locator('.translation-target').innerText(),'The rainbow consists of many colors.');
  await action('listen');assert.equal(await page.evaluate(()=>window.spoken.at(-1)),'Regenbogen');
  await page.locator('#dictionary-result').getByRole('button',{name:'Listen',exact:true}).click();assert.equal(await page.evaluate(()=>window.spoken.at(-1)),sentence);
  await screenshot('02-sentence-translate');
  await page.locator('#dictionary-close').click();await page.waitForFunction(()=>getSelection().isCollapsed&&document.querySelector('#reading-toolbar').hidden);
  await select('aus vielen Farben');await action('translate');await page.waitForSelector('.translation-target');
  assert.equal(await page.locator('.translation-source').innerText(),'aus vielen Farben');assert.equal(await page.locator('.translation-target').innerText(),'from many colors');await screenshot('03-phrase-translate');
  await page.locator('#dictionary-close').click();await page.waitForFunction(()=>!document.querySelector('#dictionary-panel').open);
  await select('Gemüse');await action('translate');await page.waitForSelector('.translation-target');assert.equal(await page.locator('.translation-source').innerText(),'Obst und Gemüse ist oft sehr farbig.');
  await action('save');await page.getByRole('button',{name:'Saved ✓',exact:true}).first().waitFor();assert.equal(requests.findLast(r=>r.url.endsWith('/portal/vocabulary')).body.selection,'Gemüse');
  await action('translate');await page.waitForSelector('.translation-target');await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await screenshot('04-dark-translate');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));await screenshot('05-mobile-translate');
  assert.equal(await page.locator('dialog[open]').count(),1);assert.deepEqual(errors,[]);
  console.log('Dictionary UI: word/phrase/sentence, DE/EN, highlighting/restore, Listen/Save, dark/mobile passed. Screenshots: '+output);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});


