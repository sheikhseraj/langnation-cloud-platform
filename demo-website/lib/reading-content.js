"use strict";
const fs = require('fs');
const path = require('path');
const LEVELS = ['A1','A2','B1','B2','C1','C2'];
const TYPES = ['multiple_choice','true_false','fill_blank','short_answer'];
const id = v => typeof v === 'string' && /^[a-z0-9][a-z0-9-]*$/i.test(v) && !['constructor','prototype','__proto__'].includes(v);
const text = v => typeof v === 'string' && !!v.trim();
function validate(data) {
  if (!data || data.templateVersion !== '1.0' || !id(data.meta?.lessonId) || !id(data.meta?.slug) || !text(data.meta?.title) || !LEVELS.includes(data.meta.cefrLevel) || !['draft','published'].includes(data.meta.status)) throw Error('Invalid reading lesson metadata');
  const blocks = data.reading?.contentBlocks;
  if (!Array.isArray(blocks) || !blocks.length) throw Error('Reading blocks required');
  const blockIds = new Set();
  for (const b of blocks) {
    if (!id(b.id) || blockIds.has(b.id) || !['paragraph','heading'].includes(b.type) || !text(b.text)) throw Error('Invalid or duplicate reading block');
    blockIds.add(b.id);
  }
  const image = data.presentation?.coverImage;
  const threshold = data.exerciseSettings?.revealSupportAfterAttempts;
  if (threshold != null && (!Number.isInteger(threshold) || threshold < 1 || threshold > 20)) throw Error('Support reveal attempts must be an integer from 1 to 20');
  if (image && (typeof image !== 'string' || !/^\/img\/[a-z0-9/_\-.]+$/i.test(image) || image.includes('..'))) throw Error('Image must be a local /img/ asset');
  if (!Array.isArray(data.exercises) || !data.exercises.length) throw Error('Exercises required');
  const ids = new Set(), positions = new Set();
  for (const q of data.exercises) {
    if (!id(q.id) || ids.has(q.id) || !Number.isInteger(q.position) || q.position < 1 || positions.has(q.position) || !text(q.prompt) || !TYPES.includes(q.type)) throw Error('Invalid or duplicate exercise');
    ids.add(q.id); positions.add(q.position);
    if (q.required != null && typeof q.required !== 'boolean') throw Error('Required must be Boolean');
    if (!text(q.feedback?.correct) || !text(q.feedback?.incorrect)) throw Error('Correct and incorrect feedback required');
    if (!Array.isArray(q.hints) || q.hints.some(h => !text(h))) throw Error('Invalid hints');
    const key = q.answerKey;
    if (q.type === 'multiple_choice') {
      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.some(o => !id(o.id) || !text(o.text)) || new Set(q.options.map(o => o.id)).size !== q.options.length) throw Error('At least two unique options required');
      if (!Array.isArray(key?.correctOptionIds) || !key.correctOptionIds.length || new Set(key.correctOptionIds).size !== key.correctOptionIds.length || key.correctOptionIds.some(k => !q.options.some(o => o.id === k))) throw Error('Invalid correct option IDs');
    } else if (q.type === 'true_false') {
      if (typeof key?.correct !== 'boolean') throw Error('Boolean answer required');
    } else {
      if (!Array.isArray(key?.acceptedAnswers) || !key.acceptedAnswers.length || key.acceptedAnswers.some(a => !text(a))) throw Error('Approved accepted answers required');
      if (key.matchMode && key.matchMode !== 'normalized_exact') throw Error('Only deterministic exact matching is supported');
      for (const [k,v] of Object.entries(key.normalization || {})) if (!['trimWhitespace','caseSensitive','normalizeUnicode','ignoreFinalPunctuation'].includes(k) || typeof v !== 'boolean') throw Error('Invalid answer normalization');
    }
    if (q.support) {
      const b = blocks.find(b => b.id === q.support.blockId);
      if (!b || !text(q.support.anchorText) || !b.text.includes(q.support.anchorText)) throw Error('Support must reference exact text in a reading block');
    }
  }
  if (!data.exercises.some(q => q.required !== false)) throw Error('At least one required exercise is needed');
  return data;
}
function chapter(data) {
  validate(data);
  return { version:1, module:'reading', key:data.meta.lessonId, title:data.meta.title, label:'Lesen',
    contentVersion:data.contentVersion || 1, meta:data.meta, presentation:data.presentation || {}, reading:data.reading,
    exerciseSettings:data.exerciseSettings || {}, completion:data.completion || {},
    sections:[{id:'reading',label:'Aufgaben',title:'Hast du den Text verstanden?',instruction:data.presentation?.instructions || '',
      questions:data.exercises.slice().sort((a,b)=>a.position-b.position).map(q=>({...q, readingQuestion:true,
        multiSelect:q.type==='multiple_choice' && q.answerKey.correctOptionIds.length>1}))}] };
}
function library() {
  const dir=path.join(__dirname,'../content/reading');
  if(!fs.existsSync(dir))return [];
  return fs.readdirSync(dir).filter(n=>n.endsWith('.json')).map(name=>{
    const data=validate(JSON.parse(fs.readFileSync(path.join(dir,name),'utf8')));
    return {id:'reading/'+data.meta.lessonId,contentKey:data.meta.lessonId,module:'reading',title:data.meta.title,
      level:data.meta.cefrLevel,book:'reading-'+data.meta.cefrLevel,bookTitle:'Lesen '+data.meta.cefrLevel,
      questions:data.exercises.length,source:'@reading\n'+JSON.stringify(data,null,2)};
  });
}
function normalize(value, rules={}) {
  let s=String(value);
  if(rules.normalizeUnicode !== false)s=s.normalize('NFC');
  if(rules.trimWhitespace !== false)s=s.trim().replace(/\s+/gu,' ');
  if(rules.ignoreFinalPunctuation)s=s.replace(/[.!?]+$/u,'').trimEnd();
  if(rules.caseSensitive === false)s=s.toLocaleLowerCase('de');
  return s;
}
function evaluate(q, answer) {
  const key=q.answerKey; let correct=false;
  if(q.type==='multiple_choice') {
    const a=Array.isArray(answer)?answer:[answer];
    correct=a.length===key.correctOptionIds.length && new Set(a).size===a.length && a.every(v=>key.correctOptionIds.includes(v));
  } else if(q.type==='true_false')correct=typeof answer==='boolean' && answer===key.correct;
  else correct=typeof answer==='string' && key.acceptedAnswers.some(a=>normalize(a,key.normalization)===normalize(answer,key.normalization));
  return {correct,feedback:correct?q.feedback.correct:q.feedback.incorrect,explanation:correct?q.feedback.explanation:undefined};
}
module.exports={validate,chapter,library,normalize,evaluate,LEVELS};
