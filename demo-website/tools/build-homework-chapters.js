"use strict";
// Transcribe the supplied Markdown specifications. Runtime uses only the generated .txt files.
const fs=require('node:fs');
const path=require('node:path');
const engine=require('../lib/homework-engine');
const root=path.join(__dirname,'..');
const sources=path.join(root,'Übung');
const slugs={8:'pronomen',10:'praepositionen',11:'feste-praepositionen',12:'zeitformen',13:'konjunktionen-und-konnektoren'};
const expected={8:58,10:71,11:51,12:48,13:39};
const variants=s=>s.split(' / ').map(a=>a.includes('|')?a.split('|').map(v=>v.trim()):a.trim());
const value=(block,name)=>{const m=block.match(new RegExp('^\\s*- '+name+': (.+)$','m'));if(!m)throw Error(`Missing ${name}`);return m[1].trim();};
const example=(prompt,answer,explanation)=>({prompt,answer,explanation});
const tileWords=answers=>[...new Set(answers.flat().flatMap(a=>a.match(/[\p{L}\p{N}…]+(?:-[\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu)))].sort((a,b)=>a.localeCompare(b,'de'));
function choice(q,wrong){q.type='choice';q.options=[...new Set([...q.accepted,...wrong])].sort((a,b)=>a.localeCompare(b,'de'));}
function multi(q,correct,count,wrong=[]){q.type='multi_select';q.correctChoices=correct;q.selectCount=count;q.options=[...correct,...wrong].sort((a,b)=>a.localeCompare(b,'de'));delete q.accepted;}
function highlight(c,q,labels,categories){
  q.type=categories?'highlight_categorize':'text_highlight';q.tokens=c.passage.split(/\s+/);q.groups=[];delete q.accepted;
  const clean=s=>s.replace(/^[„“"«»]+|[.,;:!?„“"«»]+$/gu,'');
  const usedStarts=new Set();
  for(const [n,label] of labels.entries()){
    const tokens=[];let cursor=0;
    for(const part of label.split(' ... ')){
      const words=part.split(' ');
      const index=q.tokens.findIndex((w,i)=>i>=cursor&&(!tokens.length?!usedStarts.has(i):true)&&words.every((word,j)=>clean(q.tokens[i+j]||'')===clean(word)));
      if(index<0)throw Error(`${c.key}: cannot locate ${label} / ${part}`);
      for(let j=0;j<words.length;j++)tokens.push(index+j);
      cursor=index+words.length;
    }
    usedStarts.add(tokens[0]);q.groups.push({id:`group-${n+1}`,label,tokens,...(categories?{category:categories[n]}:{})});
  }
  if(categories)q.categories=[...new Set(categories)];
}
function categorize(q){q.type='categorize';q.items=q.accepted.map((a,i)=>{const split=a.indexOf('=');return {id:`item-${i+1}`,label:a.slice(0,split),category:a.slice(split+1)};});q.categories=[...new Set(q.items.map(i=>i.category))];delete q.accepted;}
function build(number){
  const nn=String(number).padStart(2,'0');
  const file=fs.readdirSync(sources).find(n=>n.startsWith(`LangNation_Kapitel_${nn}_`)&&n.endsWith('_Homework_Specification.md'));
  if(!file)throw Error(`Missing chapter ${nn} specification`);
  const source=fs.readFileSync(path.join(sources,file),'utf8').split('## Claude Code / Codex prompt')[0];
  const title=source.match(/^## (Kapitel .+)$/m)[1];
  const c={version:1,key:`kapitel-${nn}-${slugs[number]}`,title,label:`Kapitel ${nn}`,sections:[]};
  const exercises=source.split('## Exercises\n')[1].split('## Lesetext')[0];
  for(const [index,block] of exercises.split(/^### /m).slice(1).entries()){
    const s={id:`exercise-${index+1}`,label:`Übung ${index+1}`,title:block.split('\n')[0],instruction:value(block,'Instruction'),objective:value(block,'Objective'),examples:[],questions:[]};
    s.examples=[...block.matchAll(/^  - `([^`]+)` → \*\*(.+?)\*\* — (.+)$/gm)].map(m=>example(m[1],m[2],m[3]));
    const type=value(block,'Type').replace(/`/g,'');
    for(const row of block.split('\n').filter(l=>/^\| \d+ \|/.test(l))){
      const cols=row.replace(/\\\|/g,'\u0001').split('|').slice(1,-1).map(v=>v.trim().replace(/\u0001/g,'|'));
      if(cols.length!==6)throw Error(`Invalid table row: ${row}`);
      const [id,prompt,accepted,h1,h2,feedback]=cols;
      const q={id,title:`Aufgabe ${id}`,type,prompt,accepted:variants(accepted),hints:[h1,h2],feedback};
      if(type==='linked_blanks')q.type='phrase_fill';
      if(type==='paired_sentence_transform')q.fields=['Mit weil','Mit deshalb'];
      // A fill task without a printed gap still needs an editable response field.
      if(type==='fill_blank'&&!prompt.includes('___'))q.type='short_answer';
      if(['sentence_builder','sentence_builder_choice','word_order'].includes(q.type))q.tiles=tileWords(q.accepted);
      if(type==='choice')q.options=['Präsens','Präsens mit Zukunftsbedeutung','Perfekt','Präteritum','Plusquamperfekt','Futur I'];
      s.questions.push(q);
    }
    c.sections.push(s);
  }
  const reading=source.split('## Lesetext\n')[1].split(/^## /m)[0];
  c.passage=reading.split('\n').slice(1).join('\n').trim().split('\n\n')[0];
  const readingTitle=reading.split('\n')[0].replace(/^### /,'');
  const tail=source.slice(source.indexOf('## Lesetext\n'));
  for(const [id,label,title,block] of [['reading','Lesetext',readingTitle,reading],['test',number===8||number===13?'Mini-Test':'Test',tail.match(/^## ((?:Mini-)?Test.*)$/m)[1],tail.split(/^## (?:Mini-)?Test.*\n/m)[1]]]){
    const s={id,label,title,instruction:id==='reading'?'Lies den Text und bearbeite die Aufgaben.':'Bearbeite die Aufgaben. Bei Bedarf stehen dir zwei Hinweise zur Verfügung.',examples:[],questions:[]};
    for(const match of block.matchAll(/^- \*\*([RT]\d+[ab]?) — (.+?)\*\*\n([\s\S]*?)(?=^- \*\*|^## |$(?![\s\S]))/gm)){
      const [,task,prompt,body]=match,accepted=variants(value(body,'Accepted'));
      s.questions.push({id:task.toLowerCase(),title:`Aufgabe ${task}`,type:prompt.includes('___')?'fill_blank':'short_answer',prompt,accepted,hints:[value(body,'Hint 1'),value(body,'Hint 2')],feedback:value(body,'Feedback')});
    }
    // Reading and tests use a solved example from the same chapter, excluded from totals.
    s.examples=[c.sections[0].examples[0]];
    c.sections.push(s);
  }
  const q=id=>engine.questions(c).find(q=>q.id===id);
  if(number===8){
    for(let id=29;id<=34;id++)q(String(id)).wordBank=['man','jemand','niemand','etwas','nichts','alle','einige','manche'];
    for(let id=35;id<=38;id++){q(String(id)).type='sentence_builder';q(String(id)).tiles=tileWords(q(String(id)).accepted);}
    for(const id of ['r1','r2','r3'])highlight(c,q(id),q(id).accepted);
    choice(q('t13'),['mein Buch = Personalpronomen; meins = Possessivartikel vor einem Nomen.','Beide Formen müssen immer direkt vor einem Nomen stehen.']);
  }
  if(number===10){
    highlight(c,q('r1'),q('r1').accepted);categorize(q('r2'));categorize(q('r3'));
    multi(q('r4'),q('r4').accepted,2,['mit','durch','wegen']);
    choice(q('r5'),['Weil jede Bewegung immer Dativ verlangt.','Weil in immer mit Dativ steht.']);
    q('t15').type='phrase_fill';
  }
  if(number===11){
    // Correct the supplied example's article: sprechen über + Akkusativ.
    c.sections[0].examples[1].prompt='Wir sprechen ___ das Projekt.';
    for(let id=20;id<=30;id++){q(String(id)).type='sentence_builder';q(String(id)).tiles=tileWords(q(String(id)).accepted);}
    highlight(c,q('r1'),q('r1').accepted.filter(a=>a!=='spricht ... über'));
    const speaks=q('r1').groups.find(g=>g.label==='spricht ... mit').tokens[0];
    const over=q('r1').tokens.indexOf('über',speaks);
    q('r1').groups.splice(4,0,{id:'group-speaks-over',label:'spricht ... über',tokens:[speaks,over]});
    q('t10').type='sentence_builder';q('t10').tiles=tileWords(q('t10').accepted);
  }
  if(number===12){
    const pairs=q('r1').accepted.map(a=>a.split('='));highlight(c,q('r1'),pairs.map(p=>p[0]),pairs.map(p=>p[1]));
    choice(q('r3'),['Weil die Vorbereitung erst morgen stattfinden wird.','Weil die Vorbereitung genau jetzt stattfindet.']);
    q('t7').context='Vergleiche: „Morgen fahre ich nach Berlin.“ und „Morgen werde ich nach Berlin fahren.“';
    choice(q('t7'),['Nur Futur I ist für zukünftige Ereignisse korrekt.','Präsens kann nie etwas Zukünftiges ausdrücken.']);
  }
  if(number===13){
    highlight(c,q('r1'),q('r1').accepted);multi(q('r2'),q('r2').accepted,3,['aber','danach','sondern']);
    choice(q('t10'),['denn + Verb am Ende; weil + Hauptsatzwortstellung.','denn und weil verlangen immer dieselbe Wortstellung.']);
  }
  // Examples for interactions not represented by the section's grammar example.
  for(const task of engine.questions(c)){
    if(task.type==='text_highlight'){
      const examples=number===8?{r1:['Er hilft mir.','Er · mir'],r2:['Mein Stift ist neu.','Mein'],r3:['Jemand wartet.','Jemand']}:number===11?{r1:['Paul wartet heute auf den Zug.','wartet … auf']}:number===13?{r1:['Ich lese, weil ich Zeit habe.','weil']}:{r1:['Ich fahre mit dem Bus.','mit dem Bus']};
      task.examples=[example(...examples[task.id],'Klicke jedes gesuchte Wort an. Bei getrennten Teilen bleiben die Wörter dazwischen frei.')];
    }
    if(task.type==='highlight_categorize')task.examples=[example('Ich habe gestern gelernt.','habe … gelernt → Perfekt','Markiere habe und gelernt und wähle die Zeitform.')];
    if(task.type==='categorize')task.examples=[example('bei der Schule / am Dienstag','Dativpräposition / temporal','Grammatiktyp und Bedeutung werden getrennt bestimmt.')];
    if(task.type==='choice')task.examples=[example('Welche Zeitform hat „Ich lerne“?','Präsens','Wähle eine passende Erklärung bzw. Kategorie.')];
    if(task.type==='multi_select')task.examples=[example('Wähle zwei Verschmelzungen: beim, ohne, vom.','beim · vom','Wähle unterschiedliche Formen; die Reihenfolge ist egal.')];
  }
  engine.validate(c);
  if(engine.questions(c).length!==expected[number])throw Error(`${nn}: expected ${expected[number]}, found ${engine.questions(c).length}`);
  return {filename:`${nn}-${slugs[number]}.txt`,chapter:c,source:file};
}
if(require.main===module)for(const number of Object.keys(slugs).map(Number)){
  const {filename,chapter}=build(number);
  fs.writeFileSync(path.join(root,'content/homework/intensive-a1-b1',filename),`# ${chapter.title}\n@learning\n${JSON.stringify(chapter,null,2)}\n`);
  console.log(`${filename}: ${engine.questions(chapter).length} tasks`);
}
module.exports={build};
