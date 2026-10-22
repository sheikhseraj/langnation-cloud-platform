// Run with preview-reading.js on QA_PORT. Requires Playwright (or PLAYWRIGHT_MODULE).
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:chromium.executablePath(),args:["--disable-gpu"]});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:1000},serviceWorkers:'block'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const base=process.env.QA_URL||'http://127.0.0.1:3047';
  await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
  await page.request.post(base+'/qa/reset');
  const output=process.env.READING_SCREENSHOTS||path.resolve('tmp/reading-qa');fs.mkdirSync(output,{recursive:true});
  await page.goto(base+'/portal/lesen');assert.equal(await page.locator('.sp-side').count(),1,'Library retains portal sidebar');await page.locator('.reading-lesson-card .btn').first().click();await page.waitForSelector('#question-q1');assert.equal(await page.locator('.reading-workspace-side').count(),1);assert.equal(await page.locator('.sp-side').count(),0,'Reader uses dedicated learning workspace');
  await page.waitForFunction(()=>document.querySelectorAll('.reading-question').length===1&&document.querySelectorAll('input[type=radio]').length===4);
  assert.equal(await page.locator('.reading-question').count(),1);
  await page.locator('#q1-1').check();await page.getByRole('button',{name:'Nächste Aufgabe',exact:true}).click();await page.waitForSelector('#question-q2');await page.reload();await page.waitForSelector('#question-q2');await page.getByRole('button',{name:'Vorherige Aufgabe',exact:true}).click();await page.waitForSelector('#question-q1');assert(await page.locator('#q1-1').isChecked(),'draft answer survives navigation and reload');
  await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(250);await page.screenshot({path:path.join(output,'lesen-desktop.png'),fullPage:true});
  await page.locator('#reading-questions').screenshot({path:path.join(output,'lesen-single-question.png')});
  await page.locator('#q1-1').check();await page.locator('#question-q1').getByRole('button',{name:'Antwort prüfen',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#reading-save').textContent==='Gespeichert');
  assert.match(await page.locator('#question-q1').innerText(),/Noch nicht richtig/);assert.equal(await page.locator('#reading-completion h2').count(),0);
  await page.locator('#question-q1').getByRole('button',{name:'Hinweis',exact:true}).click();await page.waitForSelector('#question-q1 .reading-hint');
  await page.locator('#q1-0').check();await page.locator('#question-q1').getByRole('button',{name:'Noch einmal prüfen',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#question-q1').textContent.includes('✓ Richtig!'));
  await page.reload();await page.waitForSelector('#question-q1');assert.match(await page.locator('#question-q1').innerText(),/✓ Richtig!/);
  for(const [q,index]of [[2,2],[3,2],[4,3],[5,0]]){await page.getByRole('button',{name:'Nächste Aufgabe',exact:true}).click();await page.waitForSelector('#question-q'+q);assert.equal(await page.locator('.reading-question').count(),1);await page.locator('#q'+q+'-'+index).check();await page.locator('#question-q'+q).getByRole('button',{name:'Antwort prüfen',exact:true}).click();await page.waitForFunction(q=>document.querySelector('#question-q'+q).textContent.includes('✓ Richtig!'),q);}
  assert.match(await page.locator('#reading-completion').innerText(),/Lesen abgeschlossen/i);
  async function selectWord(word){await page.locator('#reading-passage').scrollIntoViewIfNeeded();await page.evaluate(word=>{const walker=document.createTreeWalker(document.querySelector('#reading-passage'),NodeFilter.SHOW_TEXT);let n;while(n=walker.nextNode()){const index=n.textContent.indexOf(word);if(index>=0){const r=document.createRange();r.setStart(n,index);r.setEnd(n,index+word.length);const s=getSelection();s.removeAllRanges();s.addRange(r);break;}}},word);await page.keyboard.press('Alt+d');await page.waitForFunction(()=>document.querySelector('#dictionary-panel').open);await page.waitForTimeout(180);}
  for(const width of [1920,1366]){
    await page.setViewportSize({width,height:width===1920?1080:768});await page.evaluate(()=>scrollTo(0,0));
    const before=await page.locator('#reading-passage').boundingBox();assert(before.width<=1120,'Constrained lesson');
    assert.equal(await page.locator('#reading-passage').evaluate(n=>getComputedStyle(n).fontSize),'18px');
    await page.screenshot({path:path.join(output,'compact-'+width+'-desktop.png')});
    await selectWord('Regenbogen');await page.waitForSelector('#dictionary-result h3');
    const box=await page.locator('#dictionary-panel').boundingBox();assert.equal(box.width,320);assert(await page.locator('#reading-toolbar').isVisible());assert.equal(await page.locator('#dictionary-panel').evaluate(n=>n.matches(':modal')),false);assert(['right','left','top','bottom'].includes(await page.locator('#dictionary-panel').getAttribute('data-side')));assert(box.height<=420);assert(box.x>=12&&box.x+box.width<=width-12);
    assert.equal((await page.locator('#reading-passage').boundingBox()).width,before.width,'Popup does not resize lesson');
    assert.equal(await page.locator('.dictionary-alternatives').getAttribute('open'),null);
    await page.screenshot({path:path.join(output,'compact-'+width+'-dictionary.png')});await page.keyboard.press('Escape');await selectWord('Regenbogen');await page.keyboard.press('Alt+w');
    const toolbar=await page.locator('#reading-toolbar').boundingBox();assert(toolbar.width<=340&&toolbar.height<=40,'Mini toolbar');
    await page.screenshot({path:path.join(output,'compact-'+width+'-toolbar.png')});await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:1366,height:1000});
  await selectWord('Regenbogen');await page.waitForSelector('#dictionary-result h3');await page.keyboard.press('Escape');await selectWord('Regenbogen');await page.keyboard.press('Alt+w');await page.locator('[data-dict-action=save]').click();await page.waitForSelector('button:has-text("Saved ✓")');await page.keyboard.press('Escape');assert.equal(await page.locator('#dictionary-panel').evaluate(n=>n.open),false);
  await selectWord('Regenbogen');await page.waitForSelector('#dictionary-result > .dictionary-entry');assert.equal(await page.locator('#dictionary-result > .dictionary-entry h3').innerText(),'der Regenbogen');assert.equal(await page.locator('.dictionary-alternatives').getAttribute('open'),null);assert(await page.locator('#dictionary-result > .dictionary-entry').getByRole('button',{name:'Saved ✓',exact:true}).isDisabled());await page.keyboard.press('Escape');
  await selectWord('Regenbogen');await page.locator('[data-dict-action=translate]').click();await page.waitForSelector('.translation-target');assert.equal(await page.locator('.dictionary-entry').count(),0);await page.keyboard.press('Escape');
  await selectWord('vielen');await page.waitForFunction(()=>document.querySelector('#dictionary-result').textContent.includes('Kein exakter'));await page.keyboard.press('Escape');
  await selectWord('Nacht');await page.waitForFunction(()=>document.querySelector('#dictionary-result').textContent.includes('nicht erreichbar'));await page.keyboard.press('Escape');assert.match(await page.locator('#reading-completion').innerText(),/Lesen abgeschlossen/i);
  for(const width of [768,390]){
    await page.setViewportSize({width,height:844});await page.goto(base+'/portal/lesen/1');await page.waitForSelector('#question-q5');
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No overflow at '+width);
    await selectWord('Regenbogen');await page.waitForSelector('#dictionary-result h3');
    const box=await page.locator('#dictionary-panel').boundingBox();assert(box.x>=0&&box.x+box.width<=width+1);if(width===390)assert(box.x>=10&&box.y+box.height<=834,'Mobile card retains viewport margins');
    await page.screenshot({path:path.join(output,'lesen-'+width+'-dictionary.png')});await page.keyboard.press('Escape');
  }
  await page.goto(base+'/portal/vocabulary');assert.match(await page.locator('#vocabulary-list').innerText(),/Regenbogen/);
  await page.locator('[data-remove-word]').click();await page.waitForFunction(()=>document.querySelector('#vocabulary-status').textContent.includes('removed'));
  await page.setViewportSize({width:1366,height:1000});await page.goto(base+'/portal/lesen/1');await page.waitForSelector('.reading-question');
  await page.locator('[data-theme-toggle]').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.reload();await page.waitForSelector('.reading-question');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  async function darkContrast(selector){const ratio=await page.locator(selector).first().evaluate(n=>{const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number);const l=c=>{const v=c.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return .2126*v[0]+.7152*v[1]+.0722*v[2];};const style=getComputedStyle(n),a=l(rgb(style.color)),b=l(rgb(style.backgroundColor));return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);});assert(ratio>=4.5,'Readable dark contrast for '+selector);}
  await darkContrast('#reading-passage');await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(output,'lesen-dark-desktop.png'),fullPage:true});
  await selectWord('Regenbogen');await page.waitForSelector('#dictionary-result h3');await darkContrast('#dictionary-panel');await page.screenshot({path:path.join(output,'lesen-dark-dictionary.png')});await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await selectWord('Regenbogen');await page.waitForSelector('#dictionary-result h3');await darkContrast('#dictionary-panel');await page.screenshot({path:path.join(output,'lesen-dark-mobile.png')});await page.keyboard.press('Escape');
  await page.locator('[data-theme-toggle]').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
  const systemPage=await browser.newPage({colorScheme:'dark'});await systemPage.goto(base+'/portal/lesen/1');assert.equal(await systemPage.locator('html').getAttribute('data-theme'),null);assert.equal(await systemPage.locator('#reading-passage').evaluate(n=>getComputedStyle(n).backgroundColor),'rgb(14, 28, 56)');await systemPage.close();
  await page.setViewportSize({width:1366,height:1000});await page.goto(base+'/qa/admin/give');assert.equal(await page.locator('form[data-give]').getAttribute('action'),'/rootadmin/lesen/give');assert.equal(await page.locator('[name=_csrf]').count(),1);await page.screenshot({path:path.join(output,'lesen-admin.png'),fullPage:true});
  await page.goto(base+'/qa/admin/editor');assert.equal(await page.locator('#exercise-edit [name=_csrf]').count(),1);assert.equal(await page.locator('[name=available_from]').getAttribute('form'),'exercise-edit');
  assert.deepEqual(errors,[]);console.log('PASS: all 5 questions, wrong/hint/retry, refresh, completion, dictionary success/no-match/outage, save/remove, desktop/tablet/mobile bounds, Escape, shared administrator forms.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
