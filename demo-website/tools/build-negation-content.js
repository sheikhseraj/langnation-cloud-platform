"use strict";
// Reproducible transcription of the supplied specification; not a runtime dependency.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const spec = fs.readFileSync(path.join(root, 'Übung/LangNation_Kapitel_09_Negation_Homework_Specification.md'), 'utf8');
const chapter = { version: 1, key: 'kapitel-09-negation', title: 'Kapitel 09 — Negation', label: 'Kapitel 09', sections: [] };
const blocks = spec.split(/^### /m).slice(1, 8);
for (const [index, block] of blocks.entries()) {
  const section = { id: `exercise-${index + 1}`, label: `Übung ${index + 1}`, title: block.split('\n')[0].trim(),
    instruction: block.match(/\*\*Instruction:\*\* (.*)/)[1].trim(), examples: [], questions: [] };
  const type = block.match(/\*\*Type:\*\* `([^`]+)`/)[1];
  section.objective = block.match(/\*\*Objective:\*\* (.*)/)[1].trim();
  section.examples = [...block.matchAll(/^- `([^`]+)` → \*\*(.+?)\*\* — (.+)$/gm)].map(m => ({ prompt: m[1], answer: m[2], explanation: m[3] }));
  for (const line of block.split('\n').filter(l => /^\| \d+ \|/.test(l))) {
    const cols = line.replace(/\\\|/g, '␟').split('|').slice(1, -1).map(s => s.trim().replace(/␟/g, '|'));
    const [id, prompt, accepted, hint1, hint2, feedback] = cols;
    const q = { id, type, prompt, accepted: accepted.split(' / '), hints: [hint1, hint2], feedback };
    if (id === '30') q.accepted = [['keinen', 'mehr']];
    if (type === 'insert_word') {
      q.tokens = prompt.split(' (')[0].split(' '); q.word = 'nicht';
      q.positions = [q.accepted[0].toLowerCase().split(' ').indexOf('nicht')];
    }
    if (type === 'fill_blank_adaptive') q.wordBank = ['nichts', 'niemand', 'nie', 'nirgendwo'];
    if (type === 'sentence_transform_adaptive') {
      const skeletons = {31:'Ich trinke ___ Kaffee ___ Tee.',32:'Er kommt nicht heute, ___ morgen.',33:'Das ist kein Hotel, ___ ein Büro.',34:'Sie spricht ___ Französisch ___ Spanisch.'};
      q.skeleton = skeletons[id]; q.builderWords = ['weder', 'noch', 'sondern'];
    }
    section.questions.push(q);
  }
  chapter.sections.push(section);
}
const readingBlock = spec.split('### Lesetext — Kein perfekter Montag')[1].split('## Claude Code prompt')[0];
chapter.passage = readingBlock.trim().split('\n\n')[0];
chapter.passageImage = '/img/homework/kein-perfekter-montag.webp';
const words = chapter.passage.split(' ');
const groups = [];
const find = (phrase, start = 0) => {
  const parts = phrase.split(' ');
  return words.findIndex((w, i) => i >= start && parts.every((p, n) => (words[i+n] || '').replace(/[.,:;!?]$/,'') === p));
};
let cursor = 0;
for (const [label, category, parts] of [
  ['nicht (nicht alles)','nicht',['nicht']], ['keine','kein',['keine']], ['nicht (nicht pünktlich)','nicht',['nicht']],
  ['niemanden','Negativpronomen',['niemanden']], ['noch nicht','Zeit-/Verlaufs-Ausdruck',['noch nicht']],
  ['keinen … mehr','kein',['keinen','mehr']], ['weder … noch','Konnektor',['weder','noch']],
  ['nicht mehr','Zeit-/Verlaufs-Ausdruck',['nicht mehr']], ['nicht (nicht ins Fitnessstudio)','nicht',['nicht']],
  ['sondern','Konnektor',['sondern']], ['nichts','Negativpronomen',['nichts']]
]) {
  const tokens = [];
  for (const part of parts) { const at = find(part, cursor); if (at < 0) throw Error(part); for(let j=0;j<part.split(' ').length;j++) tokens.push(at+j); cursor=at+part.split(' ').length; }
  groups.push({ id: `expression-${groups.length+1}`, label, category, tokens });
}
const reading = { id:'reading', label:'Lesetext', title:'Lesetext — Kein perfekter Montag', instruction:'Lies den Text und bearbeite die Aufgaben.', questions:[], examples:[] };
const tasks = readingBlock.split(/^#### /m).slice(1);
for (const [index, block] of tasks.entries()) {
  const q = { id:`reading-${index+1}`, title:block.split('\n')[0].trim(), type:block.match(/- Type: `([^`]+)`/)[1],
    prompt:block.match(/- Instruction: (.*)/)[1], hints:[block.match(/- Hint 1: (.*)/)[1],block.match(/- Hint 2: (.*)/)[1]],
    feedback:block.match(/- Feedback: (.*)/)[1], examples:[{prompt:(block.match(/- Beispiel(?: für das Antwortformat)?: (.*)/)||[])[1]}] };
  if (index === 0) { q.tokens=words; q.groups=groups; }
  if (index === 1) {
    q.items=groups.map(({id,label,category})=>({id,label,category}));
    q.categories=['nicht','kein','Negativpronomen','Zeit-/Verlaufs-Ausdruck','Konnektor'];
    q.rules={nicht:'nicht verneint hier Satzteile oder Handlungen.',kein:'kein verneint Nomen mit unbestimmtem oder ohne Artikel.',Negativpronomen:'niemanden bezeichnet Personen, nichts bezeichnet Sachen.', 'Zeit-/Verlaufs-Ausdruck':'noch nicht und nicht mehr beschreiben einen zeitlichen Verlauf.',Konnektor:'weder … noch schließt beide Alternativen aus; sondern korrigiert eine negative Aussage.'};
  }
  if(index===2 || index===3) {
    q.accepted=block.match(/- Accepted: (.*)/)[1].split(' / ');
    q.fragments=index===2 ? ['auf seine E-Mails geantwortet','auf die E-Mails geantwortet','E-Mails','noch nicht auf seine E-Mails geantwortet'] : ['Kaffee','keinen Kaffee','keinen Kaffee mehr'];
    q.feedback='Richtig verstanden und in einem ganzen Satz geantwortet.';
  }
  if(index===4) {
    for(const m of block.matchAll(/  - (\d+)\. (.+?) → (.+)/g)) reading.questions.push({...q,id:m[1],prompt:m[2],accepted:[m[3]],group:'reading-transform'});
  } else reading.questions.push(q);
}
chapter.sections.push(reading);
fs.writeFileSync(path.join(root,'content/homework/intensive-a1-b1/09-negation.txt'), `# ${chapter.title}\n@learning\n${JSON.stringify(chapter,null,2)}\n`);
