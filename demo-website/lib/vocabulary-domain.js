"use strict";
function transition(current={},action,now=new Date()){
 // Reading a word is activity, not an assessment of knowledge.
 if(action==='studied')return {learning_status:current.learning_status&&current.learning_status!=='new'?current.learning_status:'learning',first_seen_at:current.first_seen_at||now,last_seen_at:now,next_review_at:current.next_review_at||new Date(now.getTime()+86400000)};
 if(!['again','difficult','known'].includes(action)){const e=new Error('Invalid learning action');e.status=400;throw e;}
 const good=action==='known',mastery=Math.max(0,Math.min(100,Number(current.mastery||0)+(good?20:action==='again'?-20:-10)));
 return {learning_status:good?(mastery>=80?'learned':'learning'):'review',mastery,
 correct_count:Number(current.correct_count||0)+(good?1:0),incorrect_count:Number(current.incorrect_count||0)+(good?0:1),
 difficult:action==='difficult'?1:good&&mastery>=80?0:Number(current.difficult||0),first_seen_at:current.first_seen_at||now,last_seen_at:now,last_review_at:current.first_seen_at?now:null,
 next_review_at:new Date(now.getTime()+(good?(mastery>=80?7:1)*86400000:action==='again'?120000:600000))};
}
function reviewPriority(a,b){return Number(b.difficult)-Number(a.difficult)||Number(a.mastery)-Number(b.mastery)||Number(b.incorrect_count)-Number(a.incorrect_count)||new Date(a.next_review_at)-new Date(b.next_review_at);}
function quizTypes(entry){const types=[];if(entry.meanings?.some(m=>m.text))types.push('de-en','en-de','meaning');if(entry.article)types.push('article');if(entry.plural)types.push('plural');if(entry.governmentPattern)types.push('pattern');if(entry.audioUrl)types.push('listening');return types;}

function quizQuestions(entry){const questions=[];for(const type of quizTypes(entry)){if(type==='meaning')continue;let answer,prompt=entry.displayHeadword||entry.headword;
 if(type==='pattern'){const matches=[...new Set(String(entry.governmentPattern).toLocaleLowerCase('de').match(/(?<![\p{L}\p{N}])(?:an|auf|aus|bei|durch|für|gegen|in|mit|nach|ohne|über|um|unter|von|vor|zu|zwischen)(?![\p{L}\p{N}])/gu)||[])];if(matches.length!==1)continue;answer=matches[0];prompt=String(entry.governmentPattern).replace(new RegExp('(?<![\\p{L}\\p{N}])'+answer+'(?![\\p{L}\\p{N}])','iu'),'___');}
 else if(type==='listening'){try{if(new URL(entry.audioUrl).protocol!=='https:')continue;}catch{continue;}answer=entry.headword;prompt='Welches Wort hörst du?';}
 else{const answers={article:entry.article,plural:entry.plural,'de-en':entry.meanings?.[0]?.text,'en-de':entry.headword};answer=answers[type];if(type==='en-de')prompt=entry.meanings[0].text;if(type==='article')prompt=entry.headword.replace(/^(der|die|das)\s+/i,'');}
 if(answer)questions.push({dictionaryEntryId:entry.id,type,prompt,acceptedAnswers:[answer],...(type==='en-de'?{articleOptional:entry.wordTypeId==='W01'||['noun','nomen'].includes(String(entry.partOfSpeech||'').trim().toLowerCase())}:{}),...(type==='listening'?{audioUrl:entry.audioUrl}:{})});}return questions;}

module.exports={transition,reviewPriority,quizTypes,quizQuestions};
