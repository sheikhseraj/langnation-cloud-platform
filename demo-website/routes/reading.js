"use strict";
const db=require('../lib/db'),exercises=require('../lib/exercises'),progress=require('../lib/homework-progress'),engine=require('../lib/homework-engine');
const dictionary=require('../lib/dictionary-client'),vocabulary=require('../lib/student-vocabulary'),csrf=require('../lib/csrf');
function register(router,{requireStudent,fullStudent,shell,view}) {
  router.use((req,res,next)=>{if(req.method==='GET'&&/^\/(?:homework|lesen)(?:\/|$)/.test(req.path))res.locals.dictionaryCsrf=csrf.token(req,res);next();});
  const guard=[requireStudent,(req,res,next)=>{if(!require('../lib/reading-schema').ready())return res.status(503).send('Lesen needs database migration 37.');if(req.method!=='GET'&&!csrf.valid(req))return res.status(403).json({error:'Please reload the page before saving.'});next();}];
  const run=fn=>async(req,res,next)=>{try{await fn(req,res,next);}catch(e){next(e);}};
  const accessible=(req)=>exercises.forStudent(req.params.id,req.student.id,req.student.email,'reading');
  router.get('/lesen',...guard,run(async(req,res)=>{
    const me=await fullStudent(req);const all=await exercises.forStudentList(me.id,me.email,'reading');
    view(res,'lesen',{...shell(me,'lesen'),items:exercises.within(all,exercises.scope(req.query)),all,filters:exercises.scope(req.query)});
  }));
  router.get('/lesen/:id',...guard,run(async(req,res,next)=>{
    const ex=await accessible(req);if(!ex?.learning)return res.status(404).send('Lesson unavailable.');
    const attempt=await progress.ensureAttempt(ex,req.student.id);
    await db.query('UPDATE exercise_attempts SET last_opened_at = UTC_TIMESTAMP() WHERE id = ? AND student_id = ?',[attempt.id,req.student.id]);
    const state=await progress.read(attempt.id,req.student.id,ex.id);
    const all=await exercises.forStudentList(req.student.id,req.student.email,'reading');
    const scoped=all.filter(item=>item.level===ex.level&&(!req.query.course||item.batch_code===req.query.course));
    const index=scoped.findIndex(e=>Number(e.id)===Number(ex.id));
    const saved=await vocabulary.list(req.student.id);
    view(res,'reading',{...shell(await fullStudent(req),'lesen'),ex:{id:ex.id,title:ex.title,level:ex.level,due_on:ex.due_on,is_required:ex.is_required},chapter:engine.publicChapter(ex.learning,state),state,attempt:attempt.id,
      siblings:all.filter(item=>!req.query.course||item.batch_code===req.query.course),csrf:csrf.token(req,res),course:typeof req.query.course==='string'?req.query.course:'',savedKeys:saved.map(w=>w.dictionary_key),previousLesson:index>0?scoped[index-1].id:null,lessonPosition:index+1,lessonTotal:scoped.length,nextLesson:scoped[index+1]?.id||null,savedCount:saved.filter(w=>Number(w.source_exercise_id)===Number(ex.id)).length});
  }));
  router.post('/lesen/:id/check',...guard,run(async(req,res)=>{
    const ex=await accessible(req);if(!ex?.learning)return res.status(404).json({error:'Lesson unavailable.'});
    const result=await progress.update(ex,req.student.id,req.body||{});res.status(result.code||200).json(result);
  }));
  router.get('/dictionary/lookup',...guard,run(async(req,res)=>{
    if(!dictionary.allowed(req.student.id))return res.status(429).json({error:'Please wait before looking up another word.'});
    try{dictionary.selection(req.query.q);}catch(e){return res.status(400).json({error:e.message});}
    if(req.query.context!==undefined&&(typeof req.query.context!=='string'||req.query.context.length>1000))return res.status(400).json({error:'Invalid selection context.'});
    try{res.json(await dictionary.lookup(req.query.q,req.query.target||'en',undefined,req.query.context||''));}catch(e){res.status(503).json({error:'Das WÃ¶rterbuch ist gerade nicht erreichbar. Du kannst weiterlernen.'});}
  }));
  router.post('/dictionary/translate',...guard,run(async(req,res)=>{
    if(!dictionary.allowed(req.student.id))return res.status(429).json({error:'Please wait before translating again.'});
    let text;try{text=dictionary.translationText(req.body?.text);}catch(e){return res.status(400).json({error:e.message});}
    try{res.json(await dictionary.translate(text));}catch(e){res.status(503).json({error:'Übersetzung ist gerade nicht verfügbar. Bitte versuche es erneut.'});}
  }));
  router.get('/vocabulary',...guard,run(async(req,res)=>view(res,'vocabulary',{...shell(await fullStudent(req),'vocabulary'),words:await vocabulary.list(req.student.id),csrf:csrf.token(req,res)})));
  router.post('/vocabulary',...guard,run(async(req,res)=>{
    if(typeof req.body?.entryId!=='string'||!/^(vocabulary:[0-9]+|lookup:[a-f0-9]{64})$/.test(req.body.entryId))return res.status(400).json({error:'Invalid Dictionary entry.'});
    const b=req.body||{};
    if(b.module!==undefined&&!['reading','homework','vocabulary'].includes(b.module))return res.status(400).json({error:'Invalid learning module.'});
    if(b.module==='vocabulary'&&b.exerciseId!=null)return res.status(400).json({error:'Invalid vocabulary source.'});
    const ex=b.exerciseId==null?null:await exercises.forStudent(b.exerciseId,req.student.id,req.student.email,b.module||'reading');
    if(b.exerciseId!=null&&!ex)return res.status(404).json({error:'Lesson unavailable.'});
    let chosen;try{chosen=dictionary.selection(b.selection);}catch(e){return res.status(400).json({error:e.message});}
    const block=ex?.learning?.reading?.contentBlocks.find(p=>p.text.normalize('NFC').includes(chosen.raw));
    // Vocabulary can originate from questions, examples, feedback or page headings.
    // Context is bounded student annotation, never used for grading or authorization.
    if(b.context!==undefined&&(typeof b.context!=='string'||b.context.length>1000))return res.status(400).json({error:'Invalid selection context.'});
    const context=block?.text||b.context||chosen.raw;
    if(!dictionary.allowed(req.student.id))return res.status(429).json({error:'Please wait and try again.'});
    let result;try{result=await dictionary.lookup(chosen.query);}catch(e){return res.status(503).json({error:'Dictionary unavailable. Please try saving again.'});}
    const entry=result.results.find(e=>e.id===b.entryId||e.lookupKey===b.entryId);if(!entry)return res.status(400).json({error:'Dictionary entry not found.'});
    await vocabulary.save(req.student.id,entry,{exerciseId:ex?.id||null,selection:chosen.raw,context,module:b.module||'reading'});
    const words=await vocabulary.list(req.student.id);res.json({saved:true,count:words.filter(w=>Number(w.source_exercise_id)===Number(ex?.id||0)).length});
  }));
  router.delete('/vocabulary/:id',...guard,run(async(req,res)=>{await vocabulary.remove(req.student.id,req.params.id);res.json({removed:true});}));
}
module.exports={register};
