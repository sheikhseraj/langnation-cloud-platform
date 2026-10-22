// Screenshot QA uses preview-reading.js's explicit grammar fixtures, not live provider data.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--disable-gpu']});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900},serviceWorkers:'block'}),errors=[];
  const output=process.env.READING_SCREENSHOTS||path.resolve('tools/_work/grammar-screenshots');fs.mkdirSync(output,{recursive:true});
  page.on('pageerror',e=>errors.push(e.message));await page.request.post('http://127.0.0.1:3047/qa/reset');await page.goto('http://127.0.0.1:3047/portal/lesen/1');
  async function select(word){
   await page.evaluate(word=>{document.activeElement?.blur();const walker=document.createTreeWalker(document.querySelector('#reading-passage'),NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const i=n.textContent.indexOf(word);if(i>=0){const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+word.length);getSelection().removeAllRanges();getSelection().addRange(r);break;}}},word);
   await page.keyboard.press('Alt+d');await page.waitForSelector('#dictionary-result > .dictionary-entry');
  }
  async function shot(name){await page.waitForTimeout(200);const box=await page.locator('#dictionary-panel').boundingBox();assert(box.width<=Math.max(320,page.viewportSize().width-24));assert(box.x>=0&&box.x+box.width<=page.viewportSize().width);assert(box.y>=0&&box.y+box.height<=page.viewportSize().height);await page.screenshot({path:path.join(output,name+'.png')});}
  for(const [word,type,head,expected,name] of [['Farben','noun','die Farbe','Plural: die Farben','grammar-01-noun'],['machen','verb','machen','Präteritum: machte · Perfekt: hat gemacht','grammar-02-verb'],['schön','adjective','schön','Komparativ: schöner · Superlativ: am schönsten','grammar-03-adjective']]){
   await select(word);const entry=page.locator('#dictionary-result > .dictionary-entry');assert.equal(await page.locator('#dictionary-query').innerText(),word);assert.equal(await entry.locator('h3').innerText(),head);assert.equal(await entry.locator('.dictionary-badge').innerText(),type);assert.equal(await entry.locator('.dictionary-grammar').innerText(),expected);assert.equal(await entry.locator('.dictionary-example').count(),1);assert(!/auxiliary:|partizip2:|plural_en:|base_en:|synonyms:/.test(await entry.innerText()));assert.equal(await page.getByRole('button',{name:'Copy',exact:true}).count(),0);await shot(name);await page.locator('#dictionary-close').click();assert(await page.locator('#reading-toolbar').isHidden());
  }
  await select('machen');await page.locator('[data-dict-action=save]').click();await page.waitForFunction(()=>document.querySelector('[data-dict-action=save]').textContent==='Saved ✓');
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','dark'));await shot('grammar-04-dark');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));await shot('grammar-05-mobile');
  await page.keyboard.press('Escape');assert(await page.locator('#reading-toolbar').isHidden());assert.equal(await page.evaluate(()=>getSelection().toString()),'');assert.deepEqual(errors,[]);
  console.log('PASS: noun/verb/adjective structure and actual form shapes, source/type badges, no metadata/Copy, Save, close, dark/mobile and compact bounds.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
