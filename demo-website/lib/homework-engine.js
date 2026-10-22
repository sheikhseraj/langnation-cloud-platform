"use strict";

const TYPES = new Set(['fill_blank','fill_blank_adaptive','phrase_fill','insert_word','sentence_transform_adaptive','sentence_correction','text_highlight','categorize','short_answer','sentence_transform','choice','multi_select','sentence_builder','sentence_builder_choice','word_order','sentence_connector','paired_sentence_transform','highlight_categorize']);
const questions = chapter => chapter.sections.flatMap(s => s.questions);
const normalize = value => String(value ?? '').normalize('NFC').trim().replace(/\s+/gu,' ').replace(/[.!?]+$/u,'').trim();
const same = (a,b) => normalize(a).toLocaleLowerCase('de') === normalize(b).toLocaleLowerCase('de');
const initialItem = () => ({ answer:null, attempts:0, failures:0, hintLevel:0, solutionShown:false, status:'open', completed:false, firstTryCorrect:null });
const initial = () => ({ revision:0, page:0, items:{}, review:null, checkMode:'each' });

function hasAnswer(q,answer) {
  if(q.readingQuestion)return q.type==='true_false'?typeof answer==='boolean':q.type==='multiple_choice'?(typeof answer==='string'||Array.isArray(answer)&&answer.length>0):typeof answer==='string'&&!!answer.trim();
  if(q.type==='insert_word')return Number.isInteger(answer);
  if(q.type==='multi_select')return Array.isArray(answer)&&answer.length>0;
  if(q.type==='highlight_categorize')return !!answer&&Array.isArray(answer.tokens)&&answer.tokens.length>0&&q.groups.every(g=>typeof answer.categories?.[g.id]==='string'&&answer.categories[g.id]);
  if(q.type==='paired_sentence_transform')return Array.isArray(answer)&&answer.length===q.fields.length&&answer.every(a=>typeof a==='string'&&a.trim());
  if(q.type==='text_highlight')return Array.isArray(answer)&&answer.length>0;
  if(q.type==='categorize')return !!answer&&q.items.every(i=>typeof answer[i.id]==='string'&&answer[i.id]);
  if(Array.isArray(answer))return answer.length===(q.prompt.match(/___/g)||[]).length&&answer.every(a=>typeof a==='string'&&a.trim());
  return typeof answer==='string'&&!!answer.trim();
}

function validate(c) {
  if (!c || c.version !== 1 || typeof c.key !== 'string' || !c.title || !Array.isArray(c.sections) || !c.sections.length) throw Error('Invalid learning chapter');
  const ids = new Set(['constructor','prototype','__proto__']);
  const sectionIds = new Set();
  for (const s of c.sections) {
    if (!s.id || !s.label || !s.title || !s.instruction || !Array.isArray(s.questions) || !s.questions.length) throw Error('Invalid section');
    if(sectionIds.has(s.id))throw Error('Duplicate section');
    sectionIds.add(s.id);
    for (const q of s.questions) {
      if (typeof q.id !== 'string' || !/^[a-z0-9-]+$/i.test(q.id) || ids.has(q.id) || !TYPES.has(q.type) || typeof q.prompt !== 'string') throw Error('Invalid or duplicate question');
      ids.add(q.id);
      if (!Array.isArray(q.hints) || q.hints.length !== 2 || !q.hints.every(h => typeof h === 'string' && h)) throw Error('Two hints required');
      if (!(q.examples?.length || s.examples?.length)) throw Error('Solved example required');
      if(q.type==='choice'&&(!Array.isArray(q.options)||q.options.length<2||q.options.some(o=>typeof o!=='string')||q.accepted?.some(a=>!q.options.includes(a))))throw Error('Invalid choices');
      if(q.type==='multi_select'&&(!Array.isArray(q.options)||new Set(q.options).size!==q.options.length||!q.correctChoices?.length||q.correctChoices.some(v=>!q.options.includes(v))||!Number.isInteger(q.selectCount)||q.selectCount<1||q.selectCount>q.correctChoices.length))throw Error('Invalid multiple selection');
      if(q.type==='paired_sentence_transform'&&(!q.fields?.length||q.accepted?.some(a=>!Array.isArray(a)||a.length!==q.fields.length)))throw Error('Invalid paired answers');
      if(['sentence_builder','sentence_builder_choice','word_order'].includes(q.type)&&(!q.tiles?.length||q.tiles.some(t=>typeof t!=='string'||!t)))throw Error('Invalid sentence tiles');
      if(['text_highlight','highlight_categorize'].includes(q.type)) {
        if(!q.tokens?.length || !q.groups?.length || q.groups.some(g=>!g.tokens.length || g.tokens.some(t=>!Number.isInteger(t)||t<0||t>=q.tokens.length))) throw Error('Invalid highlight groups');
        if(q.type==='highlight_categorize'&&(!q.categories?.length||q.groups.some(g=>!q.categories.includes(g.category))))throw Error('Invalid highlight categories');
      } else if(q.type==='categorize') {
        if(!q.items?.length || !q.categories?.length || q.items.some(i=>!q.categories.includes(i.category))) throw Error('Invalid categories');
      } else if(q.type==='insert_word') {
        if(!q.tokens?.length || !q.word || !q.positions?.length || q.positions.some(p=>!Number.isInteger(p)||p<0||p>q.tokens.length)) throw Error('Invalid insertion positions');
      }
      if(!['categorize','text_highlight','highlight_categorize','multi_select'].includes(q.type) && (!Array.isArray(q.accepted) || !q.accepted.length || q.accepted.some(a=>Array.isArray(a) ? !a.length || a.some(v=>typeof v!=='string'||!v) : typeof a!=='string'||!a))) throw Error('Accepted answers required');
    }
  }
  return c;
}

function evaluate(q, answer) {
  if(q.readingQuestion)return require('./reading-content').evaluate(q,answer);
  let correct=false, orthography=false, details=null;
  if(q.type==='insert_word') correct=Number.isInteger(answer) && q.positions.includes(answer);
  else if(q.type==='multi_select')correct=Array.isArray(answer)&&answer.length===q.selectCount&&new Set(answer).size===answer.length&&answer.every(a=>q.correctChoices.includes(a));
  else if(q.type==='highlight_categorize') {
    const marked=evaluate({...q,type:'text_highlight'},answer?.tokens);
    const items=q.groups.map(g=>({id:g.id,correct:answer?.categories?.[g.id]===g.category}));
    correct=marked.correct&&items.every(i=>i.correct)&&Object.keys(answer?.categories||{}).length===items.length;
    details={...marked.details,items};
  }
  else if(q.type==='text_highlight') {
    const selected=new Set(Array.isArray(answer)?answer:[]);
    const target=new Set(q.groups.flatMap(g=>g.tokens));
    correct=selected.size===target.size && [...selected].every(t=>target.has(t));
    details={groups:q.groups.map(g=>({id:g.id,complete:g.tokens.every(t=>selected.has(t)),selected:g.tokens.filter(t=>selected.has(t))})), extra:[...selected].filter(t=>!target.has(t))};
  } else if(q.type==='categorize') {
    correct=!!answer && typeof answer==='object' && !Array.isArray(answer) && Object.keys(answer).length===q.items.length && q.items.every(i=>answer[i.id]===i.category);
    details={items:q.items.map(i=>({id:i.id,correct:answer?.[i.id]===i.category})),rules:q.rules};
  } else {
    const candidate=q.accepted.find(a=>Array.isArray(a) ? Array.isArray(answer)&&a.length===answer.length&&a.every((v,i)=>same(v,answer[i])) : typeof answer==='string'&&same(a,answer));
    correct=candidate!==undefined;
    const expected=typeof candidate==='string' && q.prompt.startsWith('___') ? candidate[0].toLocaleUpperCase('de')+candidate.slice(1) : candidate;
    orthography=correct && JSON.stringify(Array.isArray(expected)?expected.map(normalize):normalize(expected))!==JSON.stringify(Array.isArray(answer)?answer.map(normalize):normalize(answer));
  }
  const partial=!correct && q.type==='short_answer' && typeof answer==='string' && (q.fragments||[]).some(f=>same(f,answer));
  return {correct,partial,orthography,details,feedback:correct?q.feedback:partial?'Richtig verstanden – bitte antworte noch in einem ganzen Satz.':'Noch nicht richtig. Überprüfe deine Antwort und versuche es noch einmal.'};
}

function solution(q) {
  if(q.readingQuestion)return q.type==='multiple_choice'?q.options.filter(o=>q.answerKey.correctOptionIds.includes(o.id)).map(o=>o.text).join(' · '):q.type==='true_false'?(q.answerKey.correct?'Richtig':'Falsch'):q.answerKey.acceptedAnswers[0];
  if(q.type==='text_highlight') return q.groups.map(g=>({label:g.label,tokens:g.tokens}));
  if(q.type==='highlight_categorize')return q.groups.map(g=>({label:g.label,tokens:g.tokens,category:g.category}));
  if(q.type==='multi_select')return q.correctChoices.slice(0,q.selectCount).join(' · ');
  if(q.type==='categorize') return q.items.map(i=>({label:i.label,category:i.category}));
  return q.accepted[0];
}

function tally(c, state) {
  const out={green:0,yellow:0,red:0,open:0,total:questions(c).length,completed:0};
  if(c.module==='reading') {
    out.requiredTotal=0;out.requiredCompleted=0;out.firstTry=0;
    for(const q of questions(c)){const i=state.items[q.id]||initialItem();out[i.status]++;if(i.completed)out.completed++;if(q.required!==false){out.requiredTotal++;if(i.completed)out.requiredCompleted++;}if((state.analytics?.[q.id]||i).firstTryCorrect)out.firstTry++;}
    out.done=out.requiredCompleted===out.requiredTotal;return out;
  }
  for(const q of questions(c)) { const i=state.items[q.id]||initialItem(); out[i.status]++; if(i.attempts && (!i.solutionShown||i.completed))out.completed++; }
  return out;
}

// Pure state machine. The service locks the attempt, checks revisions, then persists it.
function transition(c, previous, command) {
  let state=structuredClone(previous||initial());
  const all=questions(c);
  const {action,question,answer}=command;
  if(action==='reading-position' && c.module==='reading') {
    if(!Number.isInteger(command.position)||command.position<0||command.position>=all.length)throw Error('Invalid question position');
    state.readingQuestion=command.position;
  } else if(action==='mode') {
    if(!['each','end'].includes(command.mode))throw Error('Invalid checking mode');
    state.checkMode=command.mode;
  } else if(action==='restart-section') {
    if(c.module==='reading')state.readingQuestion=0;
    const section=c.sections.find(s=>s.id===command.section);
    if(!section)throw Error('Unknown section');
    state.analytics ||= {};
    state.restarts ||= {};
    const lastItems={};
    for(const q of section.questions) {
      const old=state.items[q.id];
      if(old) {
        lastItems[q.id]=structuredClone(old);
        if(old.firstTryCorrect!==null && old.firstTryCorrect!==undefined)state.analytics[q.id] ||= {firstTryCorrect:old.firstTryCorrect,firstAnswer:old.firstAnswer};
      }
      state.items[q.id]=initialItem();
    }
    state.restarts[section.id]={count:(state.restarts[section.id]?.count||0)+1,lastItems};
    state.review=null;
    state.page=c.sections.indexOf(section);
  } else if(action==='check-section') {
    const section=c.sections.find(s=>s.id===command.section);
    if(!section || !command.answers || typeof command.answers!=='object' || Array.isArray(command.answers))throw Error('Invalid section answers');
    const allowed=section.questions.filter(q=>!state.review||state.review.queue.includes(q.id));
    if(Object.keys(command.answers).some(id=>!allowed.some(q=>q.id===id)))throw Error('Question not in section');
    const revision=state.revision;
    for(const q of allowed)if(hasAnswer(q,command.answers[q.id]))state=transition(c,state,{action:'check',question:q.id,answer:command.answers[q.id]});
    state.revision=revision;
  } else if(action==='page') {
    if(!Number.isInteger(command.page)||command.page<0||command.page>=c.sections.length) throw Error('Invalid page');
    state.page=command.page;
  } else if(action==='review') {
    if(!state.review) {
      const queue=all.filter(q=>{
        const i=state.items[q.id];
        return i && ['red','yellow'].includes(i.status) && (!i.solutionShown||i.completed);
      }).map(q=>q.id);
      if(!queue.length && all.some(q=>state.items[q.id]?.solutionShown&&!state.items[q.id]?.completed))throw Error('Gib die gezeigte Lösung zuerst einmal selbst richtig ein.');
      state.review=queue.length?{queue,items:{}}:null;
      if(queue.length) state.page=c.sections.findIndex(s=>s.questions.some(q=>q.id===queue[0]));
    }
  } else if(action==='pause-review') { state.review=null;
  } else {
    const q=all.find(q=>q.id===question);
    if(!q)throw Error('Unknown question');
    if(state.review && !state.review.queue.includes(question))throw Error('Question not in review');
    const original=state.items[question]||initialItem();
    const item=state.review ? (state.review.items[question] ||= initialItem()) : (state.items[question] ||= initialItem());
    if(action==='draft') { if(JSON.stringify(item.answer)!==JSON.stringify(answer))item.result=null; item.answer=answer; }
    else if(action==='hint') item.hintLevel=Math.min(q.readingQuestion?q.hints.length:2,item.hintLevel+1);
    else if(action==='support' && q.readingQuestion) {
      if(!q.support || item.failures<(c.exerciseSettings.revealSupportAfterAttempts??2))throw Error('Try again before showing the supporting text');
      item.supportShown=true;
    }
    else if(action==='reveal') {
      if(q.readingQuestion && item.failures<(c.exerciseSettings.revealSupportAfterAttempts??2))throw Error('Try again before revealing the answer');
      if(!q.readingQuestion && item.failures<2 && item.hintLevel<2)throw Error('Try twice or request both hints first');
      item.solutionShown=true; item.completed=false; item.status='red';
    } else if(action==='check') {
      if(answer===null || answer===undefined || answer==='' || (Array.isArray(answer)&&!answer.length))throw Error('Bitte gib zuerst eine Antwort ein.');
      // Automatically displayed scaffolds are assistance too, even without a hint click.
      if(q.type==='fill_blank_adaptive' && item.failures>=1)item.hintLevel=Math.max(1,item.hintLevel);
      if(q.type==='sentence_transform_adaptive' && item.failures>=2)item.hintLevel=2;
      const result=evaluate(q,answer);
      item.answer=answer; item.attempts++; if(!result.correct)item.failures++;
      if(item.firstTryCorrect===null){item.firstTryCorrect=result.correct && !item.hintLevel && !item.solutionShown;item.firstAnswer=structuredClone(answer);}
      state.analytics ||= {};
      state.analytics[q.id] ||= original.firstTryCorrect!==null ? {firstTryCorrect:original.firstTryCorrect,firstAnswer:original.firstAnswer} : {firstTryCorrect:item.firstTryCorrect,firstAnswer:item.firstAnswer};
      item.completed=result.correct;
      item.status=item.solutionShown?'red':result.correct?(item.hintLevel?'yellow':'green'):'red';
      item.result=result;
      if(q.readingQuestion){state.history ||= [];state.history.push({question:q.id,answer:structuredClone(answer),correct:result.correct,hintLevel:item.hintLevel,revealed:item.solutionShown,supportShown:!!item.supportShown,at:new Date().toISOString()});}
    } else throw Error('Unknown action');
    if(action==='hint' && item.completed && item.status==='green')item.status='yellow';
    if(state.review) {
      // Historical analytics remain cumulative; review effort is separate and resumable.
      state.items[question]={...original,...item,attempts:original.attempts+(action==='check'?1:0),
        status:item.attempts?item.status:original.status,completed:item.attempts?item.completed:original.completed,
        firstTryCorrect:original.firstTryCorrect,firstAnswer:original.firstAnswer, previouslyRevealed:original.previouslyRevealed||original.solutionShown};
      if(item.solutionShown) {state.items[question].status='red';state.items[question].completed=item.completed;}
      if(item.completed)state.review.queue=state.review.queue.filter(id=>id!==question);
      if(!state.review.queue.length)state.review=null;
    }
  }
  state.revision++;
  return state;
}

function publicChapter(c,state) {
  if(c.module==='reading')return {...c,sections:c.sections.map(s=>({...s,questions:s.questions.map(q=>{
    const i=state.items[q.id]||initialItem();
    return {id:q.id,type:q.type,prompt:q.prompt,position:q.position,required:q.required!==false,readingQuestion:true,
      options:q.options,multiSelect:q.multiSelect,hints:q.hints.slice(0,i.hintLevel),hintCount:q.hints.length,
      support:i.supportShown?q.support:undefined,hasSupport:!!q.support,solution:i.solutionShown?solution(q):undefined};
  })}))};
  return {...c,sections:c.sections.map(s=>({...s,questions:s.questions.map(q=>{
    const {accepted,positions,hints,groups,items,rules,fragments,feedback,skeleton,builderWords,wordBank,correctChoices,...safe}=q;
    const i=state.review?.items[q.id]||(state.review?.queue.includes(q.id)?initialItem():state.items[q.id])||initialItem();
    return {...safe,items:(q.type==='highlight_categorize'?groups:items)?.map(({id,label})=>({id,label})),
      hints:hints.slice(0,i.hintLevel),
      skeleton:i.hintLevel>=2||i.failures>=2?skeleton:undefined,
      builderWords:i.failures>=2?builderWords:undefined,
      wordBank:i.failures||i.hintLevel>=2?wordBank:undefined,
      solution:i.solutionShown?solution(q):undefined};
  })}))};
}
module.exports={TYPES,questions,normalize,validate,evaluate,initial,initialItem,transition,tally,publicChapter,solution,hasAnswer};
