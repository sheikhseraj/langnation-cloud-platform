/* Shared word/selection dictionary for Lesen and Homework pages. */
'use strict';
window.LangNationReadingPopover = function({boot,chapter,post,onSaved}) {
  const passage=document.body,toolbar=document.getElementById('reading-toolbar'),panel=document.getElementById('dictionary-panel'),resultBox=document.getElementById('dictionary-result');
  if(boot.preview||!toolbar||toolbar.dataset.initialized)return;
  toolbar.dataset.initialized='true';
  const excluded='input,textarea,select,option,[contenteditable]:not([contenteditable="false"]),script,style,#reading-toolbar,#dictionary-panel';
  const element=node=>node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement;
  const eligible=node=>!!node&&passage.contains(node)&&!element(node)?.closest(excluded);
  const cache=new Map(),savedKeys=new Set(boot.savedKeys||[]);let selected='',selectionRect=null,selectionRange=null,request=null,requestNumber=0,returnFocus=null,lastResult=null;
  const textTools=window.LangNationDictionaryText;
  let translationRange=null,listenTimer=null,savedSelection=false,suppressClick=false;
  const saveControl=toolbar.querySelector('[data-dict-action=save]');
  function toolLabel(control,text,name){control.replaceChildren();if(window.LangNationStudyIcons){const icon=document.createElement('span');icon.innerHTML=window.LangNationStudyIcons.icon(name);control.append(icon);}control.append(document.createTextNode(text));}
  function resetTools(){clearTimeout(listenTimer);activate(null);savedSelection=false;toolLabel(saveControl,'Save','star');}
  function markSaved(){savedSelection=true;toolLabel(saveControl,'Saved','check');saveControl.setAttribute('aria-pressed','true');}
  function dismiss({clearSelection=true,restoreFocus=true}={}){
    request?.abort();requestNumber++;translationRange=null;toolbar.hidden=true;resetTools();
    if(clearSelection&&eligible(window.getSelection()?.anchorNode))window.getSelection().removeAllRanges();
    selected='';selectionRange=null;selectionRect=null;lastResult=null;
    if(panel.open)panel.close();
    if(restoreFocus){const target=returnFocus&&!toolbar.contains(returnFocus)&&!panel.contains(returnFocus)?returnFocus:document.getElementById('reading-passage')||document.getElementById('portal-content');if(target){if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');target.focus({preventScroll:true});}}
    returnFocus=null;
  }
  function restoreSelection(){
    if(!translationRange)return;translationRange=null;
    if(selectionRange?.startContainer?.isConnected){const s=window.getSelection();s.removeAllRanges();s.addRange(selectionRange.cloneRange());}
  }
  function sentenceSelection(){
    if(!selectionRange)return {text:selected,range:null};
    const start=element(selectionRange.startContainer);
    const block=start?.closest('p,li,h1,h2,h3,h4,blockquote,[data-reading-block],.homework-prompt')||start;
    if(!block||!block.contains(selectionRange.endContainer))return {text:selected,range:selectionRange.cloneRange()};
    const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT,{acceptNode:n=>eligible(n)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT});
    const nodes=[];let text='',n,offset=null;
    while((n=walker.nextNode())){if(n===selectionRange.startContainer)offset=text.length+selectionRange.startOffset;nodes.push({node:n,start:text.length,end:text.length+n.length});text+=n.textContent;}
    if(offset===null)return {text:selected,range:selectionRange.cloneRange()};
    const found=textTools.sentence(text,offset),first=nodes.find(n=>n.end>found.start),last=nodes.find(n=>n.end>=found.end);
    if(!first||!last)return {text:selected,range:selectionRange.cloneRange()};
    const range=document.createRange();range.setStart(first.node,found.start-first.start);range.setEnd(last.node,found.end-last.start);
    return {text:found.text,range};
  }
  function activate(action){for(const b of toolbar.querySelectorAll('[data-dict-action]')){b.setAttribute('aria-pressed',String(b.dataset.dictAction===action));}}
  async function translateSelection(){
    if(!selected)return;restoreSelection();request?.abort();request=new AbortController();const number=++requestNumber;
    const source=textTools.words(selected).length===1?sentenceSelection():{text:selected,range:selectionRange?.cloneRange()};
    translationRange=source.range;
    if(translationRange){const s=window.getSelection();s.removeAllRanges();s.addRange(translationRange.cloneRange());}
    activate('translate');if(savedSelection)markSaved();document.getElementById('dictionary-title').textContent='Translate';document.getElementById('dictionary-query').textContent='';
    resultBox.replaceChildren(el('p','Übersetzung wird geladen …','dictionary-loading'));openPanel();
    try{
      const response=await fetch('/portal/dictionary/translate',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':boot.csrf,Accept:'application/json'},body:JSON.stringify({text:source.text}),signal:request.signal});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Übersetzung ist gerade nicht verfügbar.');
      if(number!==requestNumber)return;
      resultBox.replaceChildren(el('h3','DE','translation-label'),el('p',source.text,'translation-source'),el('h3','EN','translation-label'),el('p',result.translation,'translation-target'));
      const actions=el('div',undefined,'dictionary-actions');if(window.speechSynthesis)actions.append(button('Listen',()=>speak(source.text)));
      resultBox.append(actions);
    }catch(e){if(e.name==='AbortError'||number!==requestNumber)return;resultBox.replaceChildren(el('p',e.message),button('Erneut versuchen',translateSelection));}
  }
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(text,action)=>{const n=el('button',undefined,'btn btn-sm btn-ghost');toolLabel(n,text,text==='Listen'?'speaker':text==='Save'?'star':'refresh');n.type='button';n.addEventListener('click',action);return n;};
  function normalize(text){return text.normalize('NFC').trim().replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu,'');}
  function capture(){if(translationRange)return false;const s=window.getSelection();if(!s||s.isCollapsed||!eligible(s.anchorNode)||!eligible(s.focusNode)||element(document.activeElement)?.closest(excluded))return false;const text=s.toString().trim();if(!text||[...text].length>Math.min(250,chapter?.reading?.dictionaryInteraction?.maxSelectionCharacters||250))return false;const range=s.getRangeAt(0).cloneRange();if(selected!==text){dismiss({clearSelection:false,restoreFocus:false});}selected=text;selectionRange=range;selectionRect=selectionRange.getBoundingClientRect();lastResult=null;showToolbar();return true;}
  function showToolbar(){if(translationRange||selectionRange)selectionRect=(translationRange||selectionRange).getBoundingClientRect();toolbar.hidden=false;const r=selectionRect||passage.getBoundingClientRect();toolbar.style.left=Math.max(8,Math.min(innerWidth-toolbar.offsetWidth-8,(r.left+r.right-toolbar.offsetWidth)/2))+'px';toolbar.style.top=Math.max(8,Math.min(innerHeight-toolbar.offsetHeight-8,r.top>toolbar.offsetHeight+12?r.top-toolbar.offsetHeight-8:(r.bottom||r.top)+8))+'px';const listen=toolbar.querySelector('[data-dict-action=listen]');listen.disabled=!window.speechSynthesis;}
  let selecting=false;
  passage.addEventListener('pointerdown',e=>{selecting=eligible(e.target);});
  document.addEventListener('pointerup',()=>{if(selecting){selecting=false;setTimeout(()=>{if(suppressClick){if(window.getSelection()?.toString().trim()){suppressClick=false;capture();}}else capture();},0);}});
  document.addEventListener('selectionchange',()=>{const s=window.getSelection();if(!panel.open&&(!s||s.isCollapsed))toolbar.hidden=true;});
  passage.addEventListener('click',e=>{
    if(suppressClick){suppressClick=false;return;}
    if(!eligible(e.target)||e.target.closest('button,a,label,summary,[role="button"]'))return;
    if(window.getSelection()?.toString().trim()&&capture())return;
    const term=e.target.closest('[data-dictionary-term]');
    if(term&&term.dataset.dictionaryTerm&&[...term.dataset.dictionaryTerm].length<=250){dismiss({clearSelection:false,restoreFocus:false});selected=term.dataset.dictionaryTerm;const marked=document.createRange();marked.selectNodeContents(term);window.getSelection().removeAllRanges();window.getSelection().addRange(marked);selectionRange=marked.cloneRange();selectionRect=marked.getBoundingClientRect();showToolbar();return;}
    const pos=document.caretPositionFromPoint?.(e.clientX,e.clientY);const range=!pos&&document.caretRangeFromPoint?.(e.clientX,e.clientY);
    const node=pos?.offsetNode||range?.startContainer,offset=pos?.offset??range?.startOffset;
    if(!node||node.nodeType!==Node.TEXT_NODE||!eligible(node))return;
    for(const m of node.textContent.matchAll(/[\p{L}\p{M}]+(?:[-’'][\p{L}\p{M}]+)*/gu))if(offset>=m.index&&offset<=m.index+m[0].length){dismiss({clearSelection:false,restoreFocus:false});selected=m[0];const marked=document.createRange();marked.setStart(node,m.index);marked.setEnd(node,m.index+m[0].length);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(marked);selectionRange=marked.cloneRange();selectionRect=marked.getBoundingClientRect();lastResult=null;showToolbar();break;}
  });
  document.addEventListener('keydown',e=>{if(e.altKey&&e.key.toLowerCase()==='w'){e.preventDefault();if(capture()||selected){showToolbar();toolbar.querySelector('button').focus();}}if(e.altKey&&e.key.toLowerCase()==='d'){e.preventDefault();if(capture()||selected)lookup('meaning');}if(e.key==='Escape'&&(panel.open||!toolbar.hidden)){e.preventDefault();dismiss();}});
  document.addEventListener('pointerdown',e=>{suppressClick=false;if(!toolbar.contains(e.target)&&!panel.contains(e.target)&&(panel.open||!toolbar.hidden)){suppressClick=true;dismiss({restoreFocus:false});}});
  toolbar.addEventListener('pointerdown',e=>e.preventDefault());
  toolbar.addEventListener('keydown',e=>{const keys=[...toolbar.querySelectorAll('button:not(:disabled)')];const i=keys.indexOf(document.activeElement);if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();keys[e.key==='Home'?0:e.key==='End'?keys.length-1:(i+(e.key==='ArrowRight'?1:-1)+keys.length)%keys.length]?.focus();}});
  toolbar.addEventListener('click',e=>{const control=e.target.closest('[data-dict-action]');const action=control?.dataset.dictAction;if(action==='listen'){clearTimeout(listenTimer);control.setAttribute('aria-pressed','true');speak(selected);listenTimer=setTimeout(()=>control.setAttribute('aria-pressed','false'),1000);}else if(action==='translate')translateSelection();else if(action)lookup(action);});
  if(!window.speechSynthesis)toolbar.querySelector('[data-dict-action=listen]').disabled=true;
  function speak(text){if(!window.speechSynthesis)return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='de-DE';u.rate=.8;window.speechSynthesis.speak(u);}
  function positionPanel(){
    if(innerWidth<=640){panel.style.left='';panel.style.top='';panel.dataset.side='mobile';return;}
    if(translationRange||selectionRange)selectionRect=(translationRange||selectionRange).getBoundingClientRect();
    const r=selectionRect||passage.getBoundingClientRect(),w=panel.offsetWidth,h=panel.offsetHeight,gap=16,margin=12;
    const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
    let side,x,y;
    if(r.right+gap+w<=innerWidth-margin){side='right';x=r.right+gap;y=clamp(r.top-4,margin,innerHeight-h-margin);}
    else if(r.left-gap-w>=margin){side='left';x=r.left-gap-w;y=clamp(r.top-4,margin,innerHeight-h-margin);}
    else {side=r.bottom+gap+h<=innerHeight-margin?'bottom':'top';x=clamp((r.left+r.right-w)/2,margin,innerWidth-w-margin);y=clamp(side==='bottom'?r.bottom+gap:r.top-gap-h,margin,innerHeight-h-margin);}
    panel.dataset.side=side;panel.style.left=x+'px';panel.style.top=y+'px';
    panel.style.setProperty('--pointer-y',clamp((r.top+r.bottom)/2-y,18,h-18)+'px');
    panel.style.setProperty('--pointer-x',clamp((r.left+r.right)/2-x,18,w-18)+'px');
  }
  function openPanel(){if(!panel.open){returnFocus=document.activeElement;panel.show();}showToolbar();positionPanel();}
  new ResizeObserver(()=>{if(panel.open)positionPanel();}).observe(resultBox);
  document.getElementById('dictionary-close').addEventListener('click',()=>dismiss());
  panel.addEventListener('click',e=>{if(e.target===panel){const r=panel.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismiss();}});
  panel.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
  function deepLink(){const a=el('a','Open full Dictionary');if(window.LangNationStudyIcons){const icon=el('span');icon.innerHTML=window.LangNationStudyIcons.icon('external');a.append(icon);}a.href='https://langnation.de/?q='+encodeURIComponent(normalize(selected));a.target='_blank';a.rel='noopener noreferrer';return a;}
  async function lookup(action){
    if(!selected)return;restoreSelection();request?.abort();request=new AbortController();const number=++requestNumber;activate('meaning');if(action==='save')saveControl.setAttribute('aria-pressed','true');if(savedSelection)markSaved();const query=normalize(selected);const context=sentenceSelection().text.slice(0,1000);const cacheKey=JSON.stringify([query,context]);document.getElementById('dictionary-query').textContent=query;document.getElementById('dictionary-title').textContent=action==='translate'?'Translate':'Dictionary';openPanel();resultBox.replaceChildren(el('p','Wörterbuch wird geladen … Neue Wörter können etwas länger dauern.','dictionary-loading'));lastResult=null;
    try{let result=cache.get(cacheKey);if(!result){const r=await fetch('/portal/dictionary/lookup?'+new URLSearchParams({q:query,target:'en',context}),{headers:{Accept:'application/json'},signal:request.signal});if(!r.ok)throw Error('Das Wörterbuch ist gerade nicht erreichbar. Du kannst weiterlernen.');result=await r.json();if(result.results.length){if(cache.size>=100)cache.delete(cache.keys().next().value);cache.set(cacheKey,result);}}
      if(number!==requestNumber)return;lastResult=result;resultBox.replaceChildren();
      const ranked=result.results;
      if(!ranked.length){saveControl.setAttribute('aria-pressed','false');resultBox.append(el('p','Kein exakter Eintrag gefunden.'));}
      const alternatives=el('details',undefined,'dictionary-alternatives');alternatives.append(el('summary','Other meanings ('+(ranked.length-1)+')'));
      const saveButtons=[];
      ranked.forEach((entry,index)=>{
        const card=el('section',undefined,'dictionary-entry');
        const heading=el('div',undefined,'dictionary-word');heading.append(el('h3',entry.displayHeadword||entry.headword));
        if(typeof entry.partOfSpeech==='string'&&entry.partOfSpeech.trim())heading.append(el('span',entry.partOfSpeech,'dictionary-badge'));
        card.append(heading);
        (entry.meanings||[]).forEach(m=>card.append(el('p',m.text,'dictionary-meaning')));
        const grammar=window.LangNationDictionaryPresentation.grammar(entry);
        if(grammar)card.append(el('p',grammar,'dictionary-meta dictionary-grammar'));
        const actions=el('div',undefined,'dictionary-actions');
        if(window.speechSynthesis){const listen=button('Listen',()=>speak(entry.headword));listen.title='Synthetische Aussprache';actions.append(listen);}
        const save=button('Save',async()=>{save.disabled=true;try{const value=await post('/portal/vocabulary',{exerciseId:boot.exercise||null,module:boot.module||'reading',entryId:entry.id,selection:query,context:selectionRange?.commonAncestorContainer?.textContent?.trim().slice(0,1000)||selected});savedKeys.add(entry.id);if(entry.lookupKey)savedKeys.add(entry.lookupKey);toolLabel(save,'Saved','check');if(number===requestNumber)markSaved();onSaved?.(value.count,entry.id);}catch(e){if(number===requestNumber&&!savedSelection)saveControl.setAttribute('aria-pressed','false');save.disabled=false;toolLabel(save,'Erneut speichern','refresh');card.append(el('p',e.message));}});
        if(savedKeys.has(entry.id)||savedKeys.has(entry.lookupKey)){save.textContent='Saved ✓';save.disabled=true;if(index===0)markSaved();}
        if(boot.preview){save.disabled=true;save.title='Speichern ist in der Vorschau deaktiviert.';}
        saveButtons.push(save);
        actions.append(save);
        if(entry.examples?.length){const sample=entry.examples[0];const pair=el('div',undefined,'dictionary-example');if(typeof sample==='string')pair.append(el('p',sample));else{if(sample.source)pair.append(el('p',sample.source));if(sample.translation||sample.target)pair.append(el('p',sample.translation||sample.target,'muted'));}card.append(pair);}
        card.append(actions);(index?alternatives:resultBox).append(card);
      });if(ranked.length>1)resultBox.append(alternatives);resultBox.append(deepLink());if(action==='save'&&!boot.preview&&!saveButtons[0]?.disabled)saveButtons[0]?.click();
    }catch(e){if(e.name==='AbortError'||number!==requestNumber)return;if(!savedSelection)saveControl.setAttribute('aria-pressed','false');resultBox.replaceChildren(el('p',e.message),button('Erneut versuchen',()=>lookup(action)),deepLink());}
  }
  window.addEventListener('resize',()=>{if(!toolbar.hidden)showToolbar();if(panel.open)positionPanel();});window.addEventListener('scroll',()=>{if(!toolbar.hidden)showToolbar();if(panel.open)positionPanel();},{passive:true});
};
