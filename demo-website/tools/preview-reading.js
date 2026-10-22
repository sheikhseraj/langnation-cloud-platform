// Local QA only: real templates, routes and engine; explicitly simulated persistence/Dictionary.
"use strict";
const express=require('express'),cookies=require('cookie-parser'),path=require('path');
const db=require('../lib/db'),engine=require('../lib/homework-engine'),reading=require('../lib/reading-content');
const exercises=require('../lib/exercises'),vocabulary=require('../lib/student-vocabulary'),dictionary=require('../lib/dictionary-client');
const chapter=reading.chapter(require('../content/reading/a1-die-farben.json'));
let state=engine.initial(),saved=[];const token='a'.repeat(64);
const person={id:7,name:'Lesen QA Student',email:'qa@example.test',student_ref:'QA7',batches:[1]};
db.hasColumn=()=>true;db.isEnabled=()=>true;
db.query=async(sql,binds)=>{
  if(sql.startsWith('UPDATE exercise_attempts SET learning_state'))state=JSON.parse(binds[0]);
  if(sql.includes('SELECT student_id, intake_id'))return [{student_id:7,intake_id:1}];
  if(sql.includes('COUNT(*) AS n')&&sql.includes('GROUP BY intake_id'))return [{intake_id:1,n:1}];
  return [];
};
db.queryOne=async(sql)=>{
  if(sql.includes('FROM exercise_attempts'))return {id:3,attempt:1,learning_state:JSON.stringify(state)};
  if(sql.includes('COUNT(*) AS n'))return {n:0};
  if(sql.includes('FROM exercises'))return {id:1,module:'reading',intake_id:1,title:chapter.title,source:reading.library()[0].source,published:1,learning_config:chapter};
  return null;
};
db.transaction=async fn=>fn(db);
exercises.forStudent=async(id,user)=>Number(id)===1&&user===7?{id:1,title:chapter.title,learning:chapter,level:'A1',is_required:1}:null;
exercises.forStudentList=async()=>{const c=engine.tally(chapter,state);return [{id:1,title:chapter.title,level:'A1',batch_code:'QA-A1',course_title:'QA course',is_required:1,total:c.requiredTotal,completed:c.requiredCompleted,mark:c.done?'done':c.completed?'part':''}];};
exercises.people=async()=>[person];exercises.given=async()=>new Map();
require('../lib/intakes').list=async()=>[{id:1,code:'QA-A1',course_title:'QA course'}];
vocabulary.list=async()=>saved;
vocabulary.save=async(user,entry,source)=>{if(!saved.some(w=>w.dictionary_key===entry.id))saved.push({id:saved.length+1,headword:entry.headword,meaning:entry.meanings[0].text,dictionary_key:entry.id,source_exercise_id:source.exerciseId,source_selection:source.selection});};
vocabulary.remove=async(user,id)=>{saved=saved.filter(w=>w.id!==Number(id));};
const rank=require('../lib/dictionary-ranking').rank;
dictionary.translate=async text=>({source:text,translation:({'Der Regenbogen besteht aus vielen Farben.':'The rainbow consists of many colors.','Obst und Gemüse ist oft sehr farbig.':'Fruit and vegetables are often very colorful.','aus vielen Farben':'from many colors'})[text]||'QA fixture translation'});
const grammarFixtures={
 Farben:{headword:'Farbe',displayHeadword:'die Farbe',partOfSpeech:'noun',plural:'die Farben',meanings:[{text:'color'}],examples:[{source:'Welche Farbe magst du am liebsten?',translation:'What color do you like best?'}],nounForms:{article:'die',plural_en:'colors'}},
 machen:{headword:'machen',partOfSpeech:'verb',meanings:[{text:'to do'}],verbForms:{praeteritum:'["machte","machtest","machte","machten"]',perfekt:['habe gemacht','hast gemacht','hat gemacht'],auxiliary:'haben',partizip2:'gemacht',base_en:'do'},examples:[{source:'Was machst du?',translation:'What are you doing?'}]},
 schön:{headword:'schön',partOfSpeech:'adjective',meanings:[{text:'beautiful'}],adjectiveForms:{komparativ_de:'schöner',superlativ_de:'am schönsten',positive_en:'beautiful'},examples:[{source:'Das ist ein schönes Bild.',translation:'That is a beautiful picture.'}]}
};
dictionary.lookup=async(q)=>{if(grammarFixtures[q])return {results:[{id:'vocabulary:'+({Farben:31,machen:32,schön:33}[q]),...grammarFixtures[q]},{id:'vocabulary:34',headword:q,partOfSpeech:'phrase',meanings:[{text:'QA related expression'}]}]};if(q==='Nacht')throw Error('QA outage');return {results:q==='vielen'?[]:rank([{id:'vocabulary:10',headword:'anderes Wort',meanings:[{text:'another word'}]},{id:'vocabulary:9',headword:q,displayHeadword:q==='Regenbogen'?'der Regenbogen':q,partOfSpeech:'noun',plural:q==='Regenbogen'?'die Regenbogen':null,meanings:[{text:q==='Regenbogen'?'rainbow':'QA fixture meaning'}],examples:[{source:'Der Regenbogen hat viele Farben.',translation:'The rainbow has many colors.'}]}],q)};};
const app=express();app.set('view engine','ejs');app.set('views',path.resolve('views'));app.use(express.json(),express.urlencoded({extended:true}),cookies());app.use(express.static(path.resolve('public')));
const site=require('../lib/site');
app.use((req,res,next)=>{req.cookies.ln_csrf=token;res.locals.site=site;res.locals.dbState={enabled:true,checked:[],missing:[],probed:true};res.cookie('ln_csrf',token,{httpOnly:true,path:'/'});next();});
const common={site,student:person,avatarUrl:'',initials:'QA',hue:200,notice:null,error:null};
const router=express.Router();require('../routes/reading').register(router,{requireStudent:(req,res,next)=>{req.student=person;next();},fullStudent:async()=>person,shell:(me,nav)=>({...common,nav}),view:(res,name,vars)=>res.render('pages/portal/'+name,{...common,...vars})});app.use('/portal',router);
app.get('/qa/admin/give',(req,res)=>res.render('rootadmin/give',{hwBase:'/rootadmin/lesen',hwLabel:'Lesen',readingAdmin:true,csrfToken:token,site,levels:reading.LEVELS,books:exercises.books('reading'),batches:[{id:1,code:'QA-A1',course_title:'QA course'}],people:[{...person,has:'',hasAny:0}],chapters:reading.library().map(c=>({...c,outs:'',out:0})),due:'',done:null,problem:null}));
app.get('/qa/admin/editor',(req,res)=>res.render('rootadmin/exercise',{hwBase:'/rootadmin/lesen',hwLabel:'Lesen',readingAdmin:true,csrfToken:token,site,ex:{id:0,title:chapter.title,source:reading.library()[0].source},library:reading.library(),picked:null,audience:'all',willGet:[person],batches:[],people:[person],unlocked:[],hasUnlock:true,questionCount:5,problems:[],done:null,problem:null}));
app.post('/qa/reset',(req,res)=>{state=engine.initial();saved=[];res.json({reset:true});});
app.use((error,req,res,next)=>{console.error(error);res.status(500).send(error.message);});
app.listen(Number(process.env.QA_PORT||3047),'127.0.0.1',()=>console.log('QA fixture at http://127.0.0.1:3047/portal/lesen/1 (simulated database and dictionary)'));
