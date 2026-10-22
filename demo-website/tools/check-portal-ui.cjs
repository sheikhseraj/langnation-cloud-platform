// Run against preview-reading.js. Routes/templates are real; data/services are QA fixtures.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-gpu']});
 const output=process.env.READING_SCREENSHOTS||path.resolve('tools/_work/portal-ui');fs.mkdirSync(output,{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:1000},serviceWorkers:'block',hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const shot=async name=>{await page.waitForTimeout(200);await page.screenshot({path:path.join(output,name+'.png')});};
  await page.request.post('http://127.0.0.1:3047/qa/reset');
  await page.goto('http://127.0.0.1:3047/portal/lesen');
  const links=await page.locator('.sp-nav a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));
  assert.deepEqual(links,['/portal/me','/portal/courses','/portal/schedule','/portal/attendance','/portal/certificates','/portal/homework','/portal/lesen','/portal/vocabulary','/portal/einbuergerungstest','/portal/payments','/portal/profile','/portal/settings']);
  for(const [group,file] of [['courses','portal-01-courses'],['material','portal-02-material'],['settings','portal-03-settings']]){
   for(const key of ['courses','material','settings']){const item=page.locator('[data-portal-group='+key+']');if(await item.evaluate(n=>n.open))await item.locator('summary').click();}
   const target=page.locator('[data-portal-group='+group+']');await target.locator('summary').focus();await page.keyboard.press('Enter');assert(await target.evaluate(n=>n.open));await shot(file);
  }
  await page.reload();assert(await page.locator('[data-portal-group=settings]').evaluate(n=>n.open));assert(await page.locator('[data-portal-group=material]').evaluate(n=>n.open));
  assert.equal(await page.locator('.sp-nav [aria-current=page]').getAttribute('href'),'/portal/lesen');
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await shot('portal-dark-sidebar');await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));
  await page.setViewportSize({width:390,height:844});await shot('portal-08-mobile-sidebar');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:1366,height:1000});
  await page.goto('http://127.0.0.1:3047/portal/lesen/1');
  await page.evaluate(()=>{window.spoken=[];speechSynthesis.speak=u=>window.spoken.push(u.text);});
  async function select(text='Regenbogen'){
   await page.locator('#reading-passage').scrollIntoViewIfNeeded();
   await page.evaluate(text=>{document.activeElement?.blur();const walker=document.createTreeWalker(document.querySelector('#reading-passage'),NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const i=n.textContent.indexOf(text);if(i>=0){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+text.length);getSelection().removeAllRanges();getSelection().addRange(r);break;}}},text);
   await page.keyboard.press('Alt+w');
  }
  const action=name=>page.locator('[data-dict-action='+name+']');
  async function closed(){await page.waitForFunction(()=>!document.querySelector('#dictionary-panel').open&&document.querySelector('#reading-toolbar').hidden&&getSelection().isCollapsed);assert.equal(await page.locator('#reading-toolbar [aria-pressed=true]').count(),0);await page.waitForTimeout(100);assert(await page.locator('#reading-toolbar').isHidden());}
  await select();assert.deepEqual(await page.locator('#reading-toolbar button').allTextContents(),['▤ Meaning','文 Translate','♫ Listen','☆ Save']);await shot('portal-04-toolbar');
  await action('meaning').click();await page.waitForSelector('.dictionary-entry');
  assert.equal(await page.locator('#dictionary-result > .dictionary-entry .dictionary-example').count(),1);assert.equal(await page.getByRole('button',{name:'Copy',exact:true}).count(),0);
  assert(!/Synonyme:|auxiliary:|base_en:|plural_en:/.test(await page.locator('#dictionary-result').innerText()));await shot('portal-05-dictionary');
  await action('listen').click();assert.equal(await action('listen').getAttribute('aria-pressed'),'true');assert.equal(await page.evaluate(()=>spoken.at(-1)),'Regenbogen');await page.waitForFunction(()=>document.querySelector('[data-dict-action=listen]').getAttribute('aria-pressed')==='false');
  await action('save').click();await page.waitForFunction(()=>document.querySelector('[data-dict-action=save]').textContent==='Saved ✓');assert.equal(await action('save').getAttribute('aria-pressed'),'true');await shot('portal-06-saved');
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await shot('portal-07-dark');
  await page.locator('#dictionary-close').click();await closed();
  for(const width of [1366,390]){
   await page.setViewportSize({width,height:width===390?844:1000});
   for(const mode of ['meaning','translate'])for(const close of ['x','outside','escape']){
    await select();await action(mode).click();await page.waitForSelector(mode==='meaning'?'.dictionary-entry':'.translation-target');
    if(mode==='translate')assert.equal(await page.locator('.translation-source').innerText(),'Der Regenbogen besteht aus vielen Farben.');
    if(close==='x'){if(width===390)await page.locator('#dictionary-close').tap();else await page.locator('#dictionary-close').click();}
    else if(close==='escape')await page.keyboard.press('Escape');
    else {const box=await page.locator('.reading-workspace-title h1').boundingBox();if(width===390)await page.touchscreen.tap(box.x+10,box.y+10);else await page.mouse.click(box.x+10,box.y+10);}
    await closed();
   }
   await shot('portal-closed-'+width);
  }
  // A normal click after dismissal must still select a new word.
  await page.setViewportSize({width:1366,height:1000});await page.locator('#reading-passage').scrollIntoViewIfNeeded();
  const point=await page.evaluate(()=>{const walker=document.createTreeWalker(document.querySelector('#reading-passage'),NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const i=n.textContent.indexOf('Regenbogen');if(i>=0){const r=document.createRange();r.setStart(n,i+2);r.setEnd(n,i+3);const b=r.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};}}});
  await page.mouse.click(point.x,point.y);assert(await page.locator('#reading-toolbar').isVisible());assert.equal(await page.evaluate(()=>getSelection().toString()),'Regenbogen');await page.keyboard.press('Escape');await closed();
  await page.setViewportSize({width:1366,height:1000});await select('aus vielen Farben');await action('translate').click();await page.waitForSelector('.translation-target');assert.equal(await page.locator('.translation-source').innerText(),'aus vielen Farben');await page.keyboard.press('Escape');await closed();
  assert.deepEqual(errors,[]);console.log('PASS: all portal links/groups, keyboard/storage, compact dictionary, Save/Listen feedback, both popup close matrices on desktop/mobile, phrase translation, dark mode.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
