/* One Lesen renderer for every lesson and CEFR level. Answers are checked only by the server. */
"use strict";
(() => {
  const list=document.getElementById('vocabulary-list');
  if(list)list.addEventListener('click',async event=>{const b=event.target.closest('[data-remove-word]');if(!b)return;b.disabled=true;try{const r=await fetch('/portal/vocabulary/'+b.dataset.removeWord,{method:'DELETE',headers:{'X-CSRF-Token':list.dataset.csrf,Accept:'application/json'}});if(!r.ok)throw Error('Could not remove word. Please reload and try again.');b.closest('article').remove();document.getElementById('vocabulary-status').textContent='Word removed.';}catch(e){document.getElementById('vocabulary-status').textContent=e.message;b.disabled=false;}});
  const data=document.getElementById('reading-data');if(!data)return;
  const boot=JSON.parse(data.textContent);let chapter=boot.chapter,state=boot.state,savedCount=boot.savedCount||0;
  const questions=document.getElementById('reading-questions'),status=document.getElementById('reading-save'),completion=document.getElementById('reading-completion');
  const outline=document.getElementById('reading-sidebar-list'),outlineBar=document.getElementById('reading-sidebar-bar'),outlineFill=document.getElementById('reading-sidebar-fill'),outlineCount=document.getElementById('reading-sidebar-count');
  outline?.addEventListener('click',event=>{const link=event.target.closest('[data-reading-question-index]');if(!link)return;event.preventDefault();goToQuestion(Number(link.dataset.readingQuestionIndex));});
  const drafts=new Map();let chain=Promise.resolve(),pending=0;
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(text,action)=>{const n=el('button',undefined,'btn btn-sm btn-ghost'),name=text==='←'||text==='Zurück'?'left':text.includes('→')?'right':/prüfen$/.test(text)?'checkCircle':text==='Hinweis'?'bulb':text==='Lösung zeigen'?'eye':text==='Im Text anzeigen'?'book':text==='Noch einmal üben'?'refresh':null;n.type='button';if(name&&window.LangNationStudyIcons){const icon=el('span',undefined,'reading-action-icon');icon.innerHTML=window.LangNationStudyIcons.icon(name);n.append(icon);n.setAttribute('aria-label',text);n.append(document.createTextNode(text.replace(/^[←→]$|\s*→$/g,'')));}else n.textContent=text;n.addEventListener('click',action);return n;};
  const all=()=>chapter.sections.flatMap(s=>s.questions);
  async function post(url,body){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','X-CSRF-Token':boot.csrf},body:JSON.stringify(body)});if(!r.headers.get('content-type')?.includes('application/json'))throw Error('Bitte melde dich erneut an. Deine Eingaben bleiben hier stehen.');const value=await r.json();if(!r.ok)throw Error(value.error||'Speichern fehlgeschlagen.');return value;}
  function act(command){
    pending++;status.textContent='Wird gespeichert …';
    chain=chain.then(async()=>{
      try{
        const result=await post(boot.checkUrl||('/portal/lesen/'+boot.exercise+'/check'),{...command,attempt:boot.attempt,revision:state.revision,...(boot.preview?{state}: {})});
        state=result.state;chapter=result.chapter;
        if(['check','draft'].includes(command.action) && JSON.stringify(drafts.get(command.question))===JSON.stringify(command.answer))drafts.delete(command.question);
        if(command.action==='restart-section'){drafts.clear();state.readingQuestion=0;}
        status.textContent=boot.preview?'Vorschau · nicht gespeichert':'Gespeichert';render();
        if(command.action==='support')showSupport(all().find(q=>q.id===command.question)?.support);
        if(command.question)document.getElementById('question-'+command.question)?.querySelector('button')?.focus({preventScroll:true});
        return true;
      }catch(e){status.textContent=e.message+' Bitte erneut versuchen.';status.setAttribute('role','alert');return false;}
      finally{pending--;}
    });return chain;
  }
  window.addEventListener('beforeunload',e=>{if(pending||drafts.size){e.preventDefault();e.returnValue='';}});
  function showSupport(s){if(!s)return;document.querySelectorAll('.reading-support').forEach(n=>n.classList.remove('reading-support'));const p=document.getElementById('block-'+s.blockId);if(p){p.classList.add('reading-support');p.tabIndex=-1;p.scrollIntoView({behavior:'smooth',block:'center'});p.focus({preventScroll:true});}}
  let navigating=false;
  async function goToQuestion(position){
    if(navigating||position<0||position>=all().length)return;navigating=true;
    try{for(const [question,answer]of [...drafts])if(!await act({action:'draft',question,answer}))return;
      if(await act({action:'reading-position',position})){document.getElementById('reading-question-heading')?.focus({preventScroll:true});questions.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'});}
    }finally{navigating=false;}
  }
  function render(){
    const focus=document.activeElement?.id;
    const progress=document.getElementById('reading-progress');questions.replaceChildren();completion.replaceChildren();
    const required=all().filter(q=>q.required!==false),done=required.filter(q=>state.items[q.id]?.completed).length;
    progress.replaceChildren(el('p',`${done} / ${required.length} Aufgaben abgeschlossen`));const bar=el('progress');bar.max=required.length;bar.value=done;bar.setAttribute('aria-label','Lesefortschritt');progress.append(bar);
    const active=Math.max(0,Math.min(all().length-1,state.readingQuestion||0));
    if(outline){outline.replaceChildren();outlineBar?.setAttribute('aria-valuemax',String(required.length));outlineBar?.setAttribute('aria-valuenow',String(done));if(outlineFill)outlineFill.style.width=(required.length?Math.round(done/required.length*100):0)+'%';if(outlineCount)outlineCount.textContent=done+' / '+required.length+' Aufgaben beantwortet';all().forEach((q,index)=>{const item=state.items[q.id]||{},link=el('a',undefined,'hw-aside-one hw-jump'+(index===active?' is-here':'')+(item.status==='green'?' is-right':item.status==='red'?' is-wrong':''));link.href='#reading-questions';link.dataset.readingQuestionIndex=String(index);if(index===active)link.setAttribute('aria-current','step');const number=el('span',String(index+1),'hw-jump-n');link.append(number,document.createTextNode(' '+q.prompt));outline.append(el('li',undefined));outline.lastElementChild.append(link);});}
    const heading=el('div',undefined,'reading-question-header');const title=el('h2','Textverständnis');title.id='reading-question-heading';title.tabIndex=-1;heading.append(title);
    const pager=el('nav',undefined,'reading-question-pager');pager.setAttribute('aria-label','Aufgaben-Navigation');
    const prev=button('←',()=>goToQuestion(active-1));prev.disabled=active===0;prev.setAttribute('aria-label','Vorherige Aufgabe');
    const next=button('→',()=>goToQuestion(active+1));next.disabled=active===all().length-1;next.setAttribute('aria-label','Nächste Aufgabe');
    const position=el('span',(active+1)+' / '+all().length);position.setAttribute('aria-live','polite');pager.append(prev,position,next);heading.append(pager);questions.append(heading,progress,status);
    all().forEach((q,index)=>{
      if(index!==active)return;
      const item=state.items[q.id]||{},card=el('article',undefined,'sp-card reading-question');card.id='question-'+q.id;
      card.append(el('h3',`Aufgabe ${index+1}${q.required===false?' · optional':''}`),el('p',q.prompt));
      let answer=drafts.has(q.id)?drafts.get(q.id):item.answer;
      const change=value=>{answer=value;drafts.set(q.id,value);status.textContent='Antwort noch nicht geprüft';};
      if(q.type==='multiple_choice'||q.type==='true_false'){
        const options=q.type==='true_false'?[{id:true,text:'Richtig'},{id:false,text:'Falsch'}]:q.options;
        const group=el('fieldset');const legend=el('legend',q.multiSelect?'Wähle alle richtigen Antworten.':'Wähle eine Antwort.');group.append(legend);
        options.forEach((o,n)=>{const label=el('label');const input=el('input');input.type=q.multiSelect?'checkbox':'radio';input.name=q.id;input.id=q.id+'-'+n;input.checked=q.multiSelect?Array.isArray(answer)&&answer.includes(o.id):answer===o.id;
          input.addEventListener('change',()=>{if(q.multiSelect){const next=new Set(Array.isArray(answer)?answer:[]);input.checked?next.add(o.id):next.delete(o.id);change([...next]);}else change(o.id);});label.append(input,el('span',o.text));group.append(label);});card.append(group);
      }else{const label=el('label','Deine Antwort');label.htmlFor=q.id+'-answer';const input=el('input');input.type='text';input.id=label.htmlFor;input.value=typeof answer==='string'?answer:'';input.autocomplete='off';input.addEventListener('input',()=>change(input.value));input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();act({action:'check',question:q.id,answer:input.value});}});card.append(label,input);}
      const actions=el('div',undefined,'reading-actions');actions.append(button(item.attempts?'Noch einmal prüfen':'Antwort prüfen',()=>{
        if(answer===null||answer===undefined||answer===''||Array.isArray(answer)&&!answer.length){status.textContent='Bitte gib zuerst eine Antwort ein.';return;}
        act({action:'check',question:q.id,answer});
      }));
      if(chapter.exerciseSettings.allowHint!==false && (item.hintLevel||0)<q.hintCount)actions.append(button('Hinweis',()=>act({action:'hint',question:q.id})));
      if((item.failures||0)>=(chapter.exerciseSettings.revealSupportAfterAttempts??2)){
        if(q.hasSupport)actions.append(button('Im Text anzeigen',()=>act({action:'support',question:q.id})));
        if(!item.solutionShown)actions.append(button('Lösung zeigen',()=>act({action:'reveal',question:q.id})));
      }
      card.append(actions);
      q.hints.forEach(h=>card.append(el('p',h,'reading-hint')));
      if(q.solution!==undefined)card.append(el('p','Lösung: '+q.solution,'reading-hint'),el('p','Gib die richtige Antwort selbst ein, um diese Aufgabe abzuschließen.'));
      if(item.result){const feedback=el('p',(item.result.correct?'✓ ':'✕ ')+item.result.feedback,'reading-feedback');feedback.setAttribute('role','status');card.append(feedback);if(item.result.explanation)card.append(el('p',item.result.explanation));}
      if(item.attempts)card.append(el('p',`${item.attempts} Versuch(e)${item.hintLevel?' · mit Hinweis':''}${item.solutionShown?' · Lösung angesehen':''}${item.supportShown?' · Textstelle angesehen':''}`,'muted'));
      const footer=el('div',undefined,'reading-question-footer');
      if(active>0)footer.append(button('Zurück',()=>goToQuestion(active-1)));
      if(active<all().length-1)footer.append(button(item.completed?'Weiter →':'Nächste Aufgabe →',()=>goToQuestion(active+1)));
      card.append(footer);questions.append(card);
    });
    if(done===required.length){const box=el('div',undefined,'sp-card');box.append(el('h2',chapter.completion.successTitle||'Lesen abgeschlossen ✓'));box.append(el('p',`${done}/${required.length} Aufgaben abgeschlossen`));const earned=all().filter(q=>['green','yellow'].includes(state.items[q.id]?.status)).length;box.append(el('p','Score: '+Math.round(100*earned/all().length)+'% · nach bestehender Homework-Wertung'));
      if(chapter.completion.showFirstTryCount!==false)box.append(el('p',all().filter(q=>(state.analytics?.[q.id]||state.items[q.id])?.firstTryCorrect).length+' beim ersten Versuch'));
      if(chapter.completion.showSavedVocabularyCount!==false)box.append(el('p',savedCount+' Wörter gespeichert'));
      if(chapter.completion.showRetryLesson!==false)box.append(button('Noch einmal üben',()=>{if(window.confirm('Alle Antworten dieser Leseübung zurücksetzen? Frühere Ergebnisse bleiben erhalten.'))act({action:'restart-section',section:chapter.sections[0].id});}));
      if(boot.nextLesson&&chapter.completion.showNextLesson!==false){const a=el('a','Nächstes Lesen','btn btn-sm');a.href='/portal/lesen/'+boot.nextLesson;box.append(a);}completion.append(box);}
    if(focus)document.getElementById(focus)?.focus({preventScroll:true});
  }
  window.LangNationReadingPopover({boot,chapter,post,onSaved:count=>{savedCount=count;render();}});
  render();
})();
