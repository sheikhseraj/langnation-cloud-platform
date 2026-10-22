"use strict";
// Stored morphology is evidence; a shared stem or word-family membership is not.
function normalize(value) { return String(value || '').normalize('NFC').trim().replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '').toLocaleLowerCase('de').replace(/\s+/g, ' '); }
function bare(value) { return normalize(value).replace(/^(der|die|das)\s+/, ''); }
function values(value) {
  if (!value) return [];
  if (typeof value === 'string') { try { return values(JSON.parse(value)); } catch { return value.split(/\s*[;/|]\s*/).map(normalize); } }
  if (Array.isArray(value)) return value.flatMap(values);
  if (typeof value === 'object') return Object.values(value).flatMap(values);
  return [];
}
function forms(entry) {
  const verb=entry.verbForms || entry.verb_forms || entry, noun=entry.nounForms || entry.noun_forms || entry, adj=entry.adjectiveForms || entry.adj_forms || entry;
  const withoutPronoun=v=>v.replace(/^(?:ich|du|er\/sie\/es|er|sie|es|wir|ihr|sie\/sie)\s+/i,'');
  // Older records can store a perfect principal part without a partizip2 column.
  const participles=values(verb.perfekt).map(withoutPronoun).map(v=>v.match(/^(?:habe|hast|hat|haben|habt|bin|bist|ist|sind|seid)\s+([\p{L}\p{M}-]+)$/u)?.[1]).filter(Boolean);
  return [...['infinitive_de','partizip2','praesens','praeteritum','perfekt','konjunktiv2'].flatMap(k=>values(verb[k])),
    ...participles,
    ...['plural_de','singular_forms','plural_forms'].flatMap(k=>values(noun[k])),
    ...['positiv_de','komparativ_de','superlativ_de'].flatMap(k=>values(adj[k]))]
    .map(withoutPronoun);
}
function score(entry, query, context='') {
  const head=entry.headword || entry.word_de || entry.source || '', q=normalize(query), h=normalize(head);
  if (h===q) return 0;
  if (bare(head)===bare(query)) return 1;
  const stored=forms(entry);
  if (stored.some(form=>bare(form)===bare(query))) return 2;
  // A stored split form ("sehe an") must be supported by a sentence-final particle.
  const sentence=normalize(context);
  if (q && stored.some(form=>form.startsWith(q+' ') && !form.slice(q.length+1).includes(' ') &&
    new RegExp('(?:^|[^\\p{L}\\p{M}])'+escape(q)+'(?:[^\\p{L}\\p{M}].*)?\\s'+escape(form.slice(q.length+1))+'$','u').test(sentence))) return 3;
  if (h.startsWith(q)) return 4;
  if (h.includes(q) || stored.some(form=>form.includes(q))) return 5;
  return 6;
}
function escape(text) { return text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function rank(entries,query,context='') { return entries.map((entry,index)=>({entry,index,score:score(entry,query,context)})).sort((a,b)=>a.score-b.score || a.index-b.index).map(x=>x.entry); }
module.exports={normalize,forms,score,rank};
