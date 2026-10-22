/* Reusable learning controls; all evaluation and status decisions belong to the server. */
/* global document, window, fetch */
"use strict";
(() => {
  const data=document.getElementById('learning-data'); if(!data)return;
  const boot=JSON.parse(data.textContent);
  let chapter=boot.chapter,state=boot.state,chain=Promise.resolve(),timer;
  const root=document.querySelector('[data-learning-root]');
  const sheet=root.querySelector('[data-learning-sheet]'),nav=root.querySelector('[data-learning-nav]');
  const saved=root.querySelector('[data-learning-save]');
  const overview=root.querySelector('[data-learning-overview]');
  const drafts=new Map();
  const readers=new Map();
  const mode=()=>state.checkMode||'each';
  const instructions={
    fill_blank:'Schreibe das fehlende Wort in die Lücke.',
    fill_blank_adaptive:'Schreibe das passende Wort in die Lücke. Wenn du Hilfe brauchst, klicke auf „Hinweis“.',
    phrase_fill:'Schreibe den passenden Ausdruck in die Lücke. Bei zwei Lücken musst du beide ausfüllen.',
    insert_word:q=>`Klicke auf ein +, um „${q.word}“ an dieser Stelle einzusetzen. Mit einem anderen + kannst du die Position ändern.`,
    sentence_transform_adaptive:'Verbinde die beiden Sätze zu einem Satz und schreibe ihn in das Antwortfeld.',
    sentence_correction:'Im Antwortfeld steht der falsche Satz. Ändere die falsche Stelle direkt im Feld.',
    text_highlight:'Klicke die gesuchten Wörter im Text an. Klicke noch einmal, um eine Markierung zu entfernen. Markiere bei mehrteiligen Ausdrücken alle Teile.',
    categorize:'Wähle neben jedem Ausdruck die passende Kategorie aus der Liste.',
    short_answer:'Schreibe die gesuchte Antwort in das Antwortfeld. Beachte das Beispiel.',
    choice:'Wähle genau eine Antwort. Klicke danach auf „Prüfen“.',
    multi_select:q=>`Wähle ${q.selectCount} unterschiedliche Antworten. Klicke danach auf „Prüfen“.`,
    sentence_builder:'Klicke die Bausteine in der richtigen Reihenfolge an. Du kannst den Satz auch direkt im Feld bearbeiten. Prüfe erst den fertigen Satz.',
    sentence_builder_choice:'Baue eine passende Satzvariante mit den Bausteinen oder tippe sie selbst. Präsens und Futur I sind hier möglich.',
    word_order:'Klicke die Wörter in der richtigen Reihenfolge an oder ziehe Bausteine in die Antwort. Bearbeite bei Bedarf das Satzfeld und prüfe den fertigen Satz.',
    sentence_connector:'Verbinde die Aussagen mit einem passenden Konnektor. Schreibe den vollständigen Satz.',
    paired_sentence_transform:'Schreibe in jedes Feld einen vollständigen Satz. Beide Varianten werden zusammen geprüft.',
    highlight_categorize:'Markiere alle Teile der Verbformen im Text. Wähle dann für jede Verbgruppe die Zeitform. Beides wird zusammen geprüft.',
    sentence_transform:'Schreibe den ganzen Satz mit dem vorgegebenen Ausdruck neu.'
  };
  const labels={green:'🟢 richtig',yellow:'🟡 mit Hinweis',red:'🔴 verbessern',open:'⚪ offen'};
  const all=()=>chapter.sections.flatMap(s=>s.questions);
  const item=q=>state.review?.items[q.id]||(state.review?.queue.includes(q.id)?{}:state.items[q.id])||{};
  function el(tag,text,cls) {const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;}
  function button(text,fn,cls='btn btn-sm btn-ghost') {const b=el('button',text,cls);b.type='button';b.addEventListener('click',fn);return b;}
  function enqueue(command,renderAfter=true) {
    chain=chain.then(async()=>{
      saved.textContent='Wird gespeichert …';
      const focus=renderAfter?document.activeElement?.dataset?.learningFocus:null;
      if(renderAfter){sheet.inert=true;nav.inert=true;overview.inert=true;}
      try {
        const response=await fetch(`/portal/homework/${boot.exercise}/check`,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({...command,attempt:boot.attempt,revision:state.revision})});
        if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Bitte melde dich erneut an. Deine Eingabe bleibt hier stehen.');
        const result=await response.json();if(!response.ok)throw Error(result.error||'Speichern fehlgeschlagen.');
        state=result.state;chapter=result.chapter;saved.textContent='Gespeichert';
        if(command.action==='check' && state.items[command.question]?.result)saved.textContent+=' · '+state.items[command.question].result.feedback;
        if(command.action==='check-section')saved.textContent='Übung geprüft. Nicht ausgefüllte Aufgaben bleiben offen.';
        if(command.action==='restart-section')saved.textContent='Übung neu gestartet. Du kannst wieder von vorne beginnen.';
        if(renderAfter)render();
        return true;
      }catch(error){saved.textContent=error.message+' Bitte erneut versuchen.';saved.setAttribute('role','alert');return false;}
      finally{sheet.inert=false;nav.inert=false;overview.inert=false;if(focus){const target=[...root.querySelectorAll('[data-learning-focus]')].find(n=>n.dataset.learningFocus===focus);target?.focus({preventScroll:true});}}
    });
    return chain;
  }
  async function flush(){clearTimeout(timer);for(const [question,answer] of [...drafts]){drafts.delete(question);if(!await enqueue({action:'draft',question,answer},false)){drafts.set(question,answer);return false;}}return true;}
  async function act(command){if(await flush())return enqueue(command);return false;}
  function draft(q,answer){drafts.set(q.id,answer);saved.textContent='Noch nicht gespeichert';clearTimeout(timer);timer=setTimeout(flush,600);}
  window.addEventListener('beforeunload',event=>{if(drafts.size||saved.textContent==='Wird gespeichert …'){event.preventDefault();event.returnValue='';}});
  function examples(parent,list){if(!list?.length)return;const box=el('aside',undefined,'learning-example');box.append(el('strong','Beispiel'));for(const e of list){const p=el('p',e.prompt);if(e.answer)p.append(el('strong',' → '+e.answer));if(e.explanation)p.append(el('span',' — '+e.explanation));box.append(p);}parent.append(box);}
  function input(label,value,onInput){const wrap=el('label',undefined,'learning-input');wrap.append(el('span',label,'sr-only'));const field=el('input');field.type='text';field.value=value||'';field.autocomplete='off';field.spellcheck=false;field.addEventListener('input',()=>onInput(field.value));wrap.append(field);return {wrap,field};}
  function answerControl(q,i,parent){
    let answer=drafts.has(q.id)?drafts.get(q.id):i.answer;
    const set=value=>{answer=value;draft(q,value);parent.dataset.edited='true';};
    if(['choice','multi_select'].includes(q.type)){
      const box=el('fieldset',undefined,'learning-choices');box.append(el('legend',q.type==='choice'?'Eine Antwort auswählen':`${q.selectCount} Antworten auswählen`));
      for(const [n,option] of q.options.entries()){
        const label=el('label'),control=el('input');control.type=q.type==='choice'?'radio':'checkbox';control.name='choice-'+q.id;control.value=option;
        control.checked=q.type==='choice'?answer===option:Array.isArray(answer)&&answer.includes(option);
        control.addEventListener('change',()=>{if(q.type==='choice')set(option);else {const selected=new Set(Array.isArray(answer)?answer:[]);control.checked?selected.add(option):selected.delete(option);set([...selected]);}});
        label.append(control,document.createTextNode(option));box.append(label);
      }parent.append(box);
    }else if(q.type==='paired_sentence_transform'){
      const values=Array.isArray(answer)?answer.slice():[];
      q.fields.forEach((label,n)=>{const control=input(label,values[n],value=>{values[n]=value;set(values.slice());});control.wrap.firstChild.classList.remove('sr-only');control.wrap.classList.add('learning-sentence');parent.append(control.wrap);});
    }else if(q.type==='insert_word'){
      const line=el('div',undefined,'learning-tokens');
      const slots=[];
      for(let n=0;n<=q.tokens.length;n++){
        const b=button(answer===n?q.word:'＋',()=>{set(n);slots.forEach((slot,j)=>{slot.textContent=j===n?q.word:'＋';slot.setAttribute('aria-pressed',String(j===n));});},'learning-slot');
        b.setAttribute('aria-label',`${q.word} an Position ${n+1} einsetzen`);b.setAttribute('aria-pressed',String(answer===n));slots.push(b);line.append(b);if(n<q.tokens.length)line.append(el('span',q.tokens[n]));
      }parent.append(line);
      if(i.result?.correct){const words=q.tokens.slice();words.splice(answer,0,answer===0?q.word[0].toUpperCase()+q.word.slice(1):q.word);parent.append(el('p',words.join(' ')));}
    }else if(['text_highlight','highlight_categorize'].includes(q.type)){
      const combined=q.type==='highlight_categorize';
      const selected=new Set(combined?(answer?.tokens||[]):Array.isArray(answer)?answer:[]),line=el('p',undefined,'learning-reading');
      const details=i.result?.details;
      const correct=new Set((details?.groups||[]).filter(g=>g.complete).flatMap(g=>g.selected));
      const incomplete=new Set((details?.groups||[]).filter(g=>!g.complete).flatMap(g=>g.selected));
      const wrong=new Set(details?.extra||[]);
      const revealed=new Set((q.solution||[]).flatMap(g=>g.tokens));
      const legend=el('p','Klicke auf Wörter, um sie zu markieren.','learning-reading-legend');
      const paint=(b,n,checked)=>{
        b.classList.remove('is-correct','is-incorrect','is-missing');
        b.setAttribute('aria-pressed',String(selected.has(n)));
        let note='';
        if(checked && selected.has(n) && (correct.has(n)||revealed.has(n))) {b.classList.add('is-correct');note='richtig markiert';}
        else if(checked && selected.has(n) && (wrong.has(n)||incomplete.has(n))) {b.classList.add('is-incorrect');note=incomplete.has(n)?'Ausdruck noch unvollständig':'falsch markiert';}
        else if(checked && !selected.has(n) && revealed.has(n)) {b.classList.add('is-missing');note='fehlt in deiner Markierung';}
        b.title=note;b.setAttribute('aria-label',q.tokens[n]+(note?' — '+note:''));
      };
      q.tokens.forEach((word,n)=>{const b=button(word,()=>{selected.has(n)?selected.delete(n):selected.add(n);const tokens=[...selected].sort((a,b)=>a-b);set(combined?{tokens,categories:answer?.categories||{}}:tokens);[...line.querySelectorAll('button')].forEach((wordButton,index)=>paint(wordButton,index,false));legend.textContent='Markierung geändert – bitte erneut prüfen.';},'learning-word');paint(b,n,!!details||q.solution!==undefined);line.append(b,document.createTextNode(' '));});
      if(details||q.solution!==undefined)legend.textContent='✓ Grün: richtig markiert · ✕ Rot: falsch oder unvollständig'+(q.solution!==undefined?' · Rot gestrichelt: fehlt noch':'');
      parent.append(line,legend);
      if(i.result?.details){const count=i.result.details.groups.filter(g=>g.complete).length;parent.append(el('p',`${count} von ${i.result.details.groups.length} Ausdrücken vollständig markiert. Mehrteilige Ausdrücke zählen zusammen.`));}
      if(combined)q.items.forEach(entry=>{
        const label=el('label',undefined,'learning-category'),select=el('select');label.append(el('span',entry.label));select.append(new Option('Zeitform wählen',''));q.categories.forEach(c=>select.append(new Option(c,c)));select.value=answer?.categories?.[entry.id]||'';
        select.addEventListener('change',()=>set({tokens:[...selected],categories:{...answer?.categories,[entry.id]:select.value}}));label.append(select);
        const result=details?.items.find(r=>r.id===entry.id);if(result)label.append(el('span',result.correct?'✓':'Noch einmal prüfen'));parent.append(label);
      });
    }else if(q.type==='categorize'){
      answer=answer&&typeof answer==='object'&&!Array.isArray(answer)?{...answer}:{};
      q.items.forEach(entry=>{const label=el('label',undefined,'learning-category');label.append(el('span',entry.label));const select=el('select');select.append(new Option('Kategorie wählen',''));q.categories.forEach(c=>select.append(new Option(c,c)));select.value=answer[entry.id]||'';select.addEventListener('change',()=>set({...answer,[entry.id]:select.value}));label.append(select);const result=i.result?.details?.items.find(r=>r.id===entry.id);if(result)label.append(el('span',result.correct?'✓':'Noch einmal prüfen'));parent.append(label);});
      if(i.result?.details?.rules)for(const [category,rule] of Object.entries(i.result.details.rules))parent.append(el('p',category+': '+rule,'learning-rule'));
    }else if(['fill_blank','fill_blank_adaptive','phrase_fill'].includes(q.type)){
      const parts=q.prompt.split('___'),values=Array.isArray(answer)?answer.slice():[answer||''];
      const line=el('div',undefined,'learning-blanks');parts.forEach((part,n)=>{line.append(document.createTextNode(part));if(n<parts.length-1){const control=input(`Lücke ${n+1}`,values[n],value=>{values[n]=value;set(parts.length>2?values.slice():value);});control.field.size=12;line.append(control.wrap);}});parent.append(line);
      if(q.wordBank)parent.append(el('p','Wortbank: '+q.wordBank.join(' · ')+' — Achte auf den Kasus.','learning-example'));
    }else{
      if(answer==null&&q.type==='sentence_correction')answer=q.prompt;
      const control=input('Deine Antwort',answer,value=>set(value));control.wrap.classList.add('learning-sentence');parent.append(control.wrap);
      if(q.tiles?.length){
        const bank=el('div',undefined,'learning-builder');bank.setAttribute('role','group');bank.setAttribute('aria-label','Satzbausteine');
        const append=word=>{const value=((typeof answer==='string'?answer:'')+' '+word).trim().replace(/\s+([,.!?;:])/g,'$1');control.field.value=value;set(value);};
        q.tiles.forEach(word=>{const b=button(word,()=>append(word),'learning-slot');b.draggable=true;b.addEventListener('dragstart',event=>event.dataTransfer.setData('text/plain',word));bank.append(b);});
        control.field.addEventListener('dragover',event=>event.preventDefault());control.field.addEventListener('drop',event=>{event.preventDefault();const word=event.dataTransfer.getData('text/plain');if(q.tiles.includes(word))append(word);});
        bank.append(button('Letzten Baustein entfernen',()=>{const value=String(answer||'').trim().replace(/\s*\S+$/u,'');control.field.value=value;set(value);}),button('Satz leeren',()=>{control.field.value='';set('');}));parent.append(bank);
      }
      if(q.skeleton)parent.append(el('p','Satzgerüst: '+q.skeleton,'learning-example'));
      if(q.builderWords){
        const builder=el('div',undefined,'learning-builder'),parts=q.skeleton.split('___'),values=[];
        builder.append(el('p','Geführter Satzbau: Wähle die Verbindungen.'));
        parts.forEach((part,n)=>{builder.append(document.createTextNode(part));if(n<parts.length-1){const select=el('select');select.setAttribute('aria-label',`Verbindung ${n+1}`);select.append(new Option('…',''));q.builderWords.forEach(w=>select.append(new Option(w,w)));select.addEventListener('change',()=>{values[n]=select.value;const built=parts.map((p,j)=>p+(j<parts.length-1?(values[j]||'___'):'')).join('');control.field.value=built;set(built);});builder.append(select);}});parent.append(builder);
      }
      if(q.type==='sentence_correction'&&i.result?.correct){
        const diff=el('p','Korrigiert: ');const old=q.prompt.split(' ');String(answer).split(' ').forEach((word,n)=>{diff.append(el(old[n]===word?'span':'mark',word+' '));});parent.append(diff);
      }
    }
    return ()=>answer;
  }
  function question(q,parent){
    const i=item(q),card=el('article',undefined,'learning-question');card.dataset.status=i.status||'open';card.id='learning-'+q.id;
    if(drafts.has(q.id))card.dataset.edited='true';
    card.append(el('h3',q.title||'Aufgabe '+q.id),el('span',labels[i.status||'open'],'learning-status'));
    if(q.context)card.append(el('p',q.context));
    if(!['fill_blank','fill_blank_adaptive','phrase_fill'].includes(q.type))card.append(el('p',q.prompt));
    const instruction=typeof instructions[q.type]==='function'?instructions[q.type](q):instructions[q.type];
    const help=el('div',undefined,'learning-how');help.append(el('strong','So geht’s'),el('p',instruction||'Bearbeite die Aufgabe im Antwortfeld.'));
    help.append(el('p',mode()==='end'?'Bearbeite zuerst die Aufgaben. Klicke danach unten auf „Übung prüfen“.':['text_highlight','highlight_categorize','categorize','choice','multi_select','sentence_builder','sentence_builder_choice','word_order'].includes(q.type)?'Wenn du fertig bist, klicke auf „Prüfen“.':'Deine Antwort wird geprüft, wenn du das Feld verlässt. Du kannst auch auf „Prüfen“ klicken.'));
    if(q.type==='insert_word'&&mode()==='each')help.lastChild.textContent='Nach dem Einsetzen wird deine Antwort automatisch geprüft.';
    card.append(help);
    examples(card,q.examples);
    const read=answerControl(q,i,card),actions=el('div',undefined,'learning-actions');
    readers.set(q.id,read);
    if(mode()==='each')actions.append(button(i.attempts?'Erneut prüfen':'Prüfen',()=>act({action:'check',question:q.id,answer:read()}),'btn btn-sm'));
    if((i.hintLevel||0)<2)actions.append(button(i.hintLevel?'Noch ein Hinweis':'Hinweis',()=>act({action:'hint',question:q.id})));
    if(!i.solutionShown&&((i.failures||0)>=2||(i.hintLevel||0)>=2))actions.append(button('Lösung zeigen',()=>act({action:'reveal',question:q.id})));
    card.append(actions);
    (q.hints||[]).forEach((hint,n)=>card.append(el('p',`Hinweis ${n+1}: ${hint}`,'learning-hint')));
    if(q.solution!==undefined){const solution=Array.isArray(q.solution)?q.solution.map(v=>typeof v==='object'?v.label+(v.category?' → '+v.category:''):v).join(' · '):q.solution;card.append(el('p','Lösung: '+solution,'learning-example'),el('p','Gib die richtige Antwort jetzt selbst ein. Diese Aufgabe bleibt bis zur Wiederholung rot.'));}
    if(i.result){const feedback=el('p',i.result.feedback,'learning-feedback');feedback.setAttribute('role','status');if(i.result.partial)feedback.classList.add('learning-partial');if(i.result.orthography)feedback.append(el('span',' Achte noch auf die Groß- und Kleinschreibung.'));card.append(feedback);}
    const complete=value=>{
      if(q.type==='insert_word')return Number.isInteger(value);
      if(Array.isArray(value))return value.length===(q.fields?.length??q.prompt.split('___').length-1)&&value.every(v=>typeof v==='string'&&v.trim());
      return typeof value==='string'&&!!value.trim();
    };
    const autoCheck=()=>{
      if(mode()!=='each'||!card.isConnected||!complete(read())||card.dataset.edited!=='true')return;
      card.dataset.edited='false';
      void act({action:'check',question:q.id,answer:read()});
    };
    if(!['text_highlight','highlight_categorize','categorize','choice','multi_select','sentence_builder','sentence_builder_choice','word_order'].includes(q.type)) {
      card.addEventListener('focusout',event=>{
        if(!event.target.matches('input')||event.relatedTarget?.closest('button')||card.contains(event.relatedTarget))return;
        // Wait for the new focus target before refreshing feedback.
        setTimeout(autoCheck,0);
      });
      card.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('input')&&mode()==='each'){event.preventDefault();autoCheck();}});
      if(q.type==='insert_word')card.querySelector('.learning-tokens').addEventListener('click',()=>setTimeout(autoCheck,0));
    }
    card.querySelectorAll('input,select,button').forEach((control,index)=>control.dataset.learningFocus=q.id+'-'+index);
    parent.append(card);
  }
  function summary(qs){const out={green:0,yellow:0,red:0,open:0,completed:0};qs.forEach(q=>{const i=state.items[q.id]||{};out[i.status||'open']++;if(i.attempts&&(!i.solutionShown||i.completed))out.completed++;});return out;}
  function render(){
    const section=chapter.sections[state.page]||chapter.sections[0];sheet.replaceChildren();nav.replaceChildren();overview.replaceChildren();readers.clear();
    root.querySelector('[data-learning-position]').textContent=`Übung ${state.page+1} von ${chapter.sections.length}`;
    nav.append(el('p',chapter.label,'hw-aside-head'));
    chapter.sections.forEach((s,n)=>{const count=summary(s.questions),symbol=count.red?'!':count.completed===s.questions.length?'✓':n===state.page?'●':'○';const b=button(symbol+' '+s.label,()=>act({action:'page',page:n}),'hw-aside-one learning-nav-button');b.title=s.title;b.setAttribute('aria-label',s.title);if(n===state.page)b.setAttribute('aria-current','step');nav.append(b);});
    const counts=summary(all());for(const color of ['green','yellow','red','open'])overview.append(el('span',`${labels[color]}: ${counts[color]}`));
    overview.append(el('span',`${counts.completed} / ${all().length} bearbeitet`,'learning-overview-total'));
    if(state.review){sheet.append(el('p',`Fehler wiederholen · ${state.review.queue.length} Aufgaben übrig`,'learning-example'));sheet.append(button('Wiederholung verlassen',()=>act({action:'pause-review'})));}
    else if(counts.red||counts.yellow)overview.append(button('Fehler wiederholen',()=>act({action:'review'})));
    sheet.append(el('h2',section.title,'learning-section-title'),el('p',section.instruction));
    const toolbar=el('div',undefined,'learning-toolbar');
    const modeBox=el('div',undefined,'hw-mode');modeBox.append(el('span','Prüfen','hw-mode-label'));
    const options=el('div',undefined,'hw-mode-opts');options.setAttribute('role','group');options.setAttribute('aria-label','Wann geprüft wird');
    for(const [value,label] of [['each','nach jeder Antwort'],['end','am Ende']]){const b=button(label,()=>act({action:'mode',mode:value}),'hw-mode-btn'+(mode()===value?' is-on':''));b.setAttribute('aria-pressed',String(mode()===value));b.dataset.learningFocus='mode-'+value;options.append(b);}modeBox.append(options);toolbar.append(modeBox);
    const restartPanel=el('div',undefined,'learning-restart-confirm');restartPanel.hidden=true;
    restartPanel.append(el('p',`${section.label} neu starten? Die Antworten und Hinweise dieser Übung werden zurückgesetzt. Deine anderen Übungen bleiben erhalten.`));
    restartPanel.append(button('Jetzt neu starten',()=>act({action:'restart-section',section:section.id}),'btn btn-sm'),button('Abbrechen',()=>{restartPanel.hidden=true;}));
    toolbar.append(button('Übung neu starten',()=>{restartPanel.hidden=!restartPanel.hidden;}));sheet.append(toolbar,restartPanel);
    const qs=state.review?section.questions.filter(q=>state.review.queue.includes(q.id)):section.questions;
    if(section.id==='reading'&&chapter.passage){const passage=el('div',undefined,'learning-passage');if(chapter.passageImage){const img=el('img');img.src=chapter.passageImage;img.alt='Illustration zum Lesetext';passage.append(img);}passage.append(el('p',chapter.passage));sheet.append(passage);}
    examples(sheet,section.examples);qs.forEach(q=>question(q,sheet));
    if(mode()==='end'&&qs.length)sheet.append(button('Übung prüfen',()=>{
      const answers=Object.fromEntries(qs.map(q=>[q.id,readers.get(q.id)?.()??null]));
      void act({action:'check-section',section:section.id,answers});
    },'btn learning-check-section'));
    if(state.review&&!qs.length){sheet.append(el('p','Hier gibt es nichts zu wiederholen.'));const next=chapter.sections.findIndex(s=>s.questions.some(q=>state.review.queue.includes(q.id)));if(next>=0)sheet.append(button('Weiter zur Wiederholung',()=>act({action:'page',page:next})));}
    const count=summary(section.questions);
    if(!state.review&&count.completed===section.questions.length){
      const box=el('div',undefined,'learning-complete');box.append(el('p',count.red?`👍 Übung abgeschlossen. ${count.red} Aufgaben warten noch auf Wiederholung.`:count.yellow?'🎉 Sehr gut! Übung geschafft.':'🌟 Ausgezeichnet! Alle Aufgaben richtig – ohne Hinweis.'));
      if(count.red||count.yellow)box.append(button('Aufgaben wiederholen',()=>act({action:'review'})));sheet.append(box);
    }
    const pager=el('div',undefined,'learning-actions');if(state.page>0)pager.append(button('Zurück',()=>act({action:'page',page:state.page-1})));if(state.page<chapter.sections.length-1)pager.append(button('Weiter',()=>act({action:'page',page:state.page+1}),'btn btn-sm'));sheet.append(pager);
    if(counts.completed===all().length){const box=el('div',undefined,'learning-complete');box.append(el('h2',`🏆 ${chapter.label} abgeschlossen! ${chapter.title.split(' — ')[1]||''} geschafft.`));for(const color of ['green','yellow','red','open'])box.append(el('p',`${labels[color]}: ${counts[color]}`));if(counts.red||counts.yellow)box.append(button('Fehler wiederholen',()=>act({action:'review'})));else box.append(el('p','Kapitel gemeistert'));const link=el('a','Weiter','btn btn-sm');link.href=boot.next;box.append(link);sheet.append(box);}
  }
  render();
})();
