/* Learner-facing grammar only; never print raw metadata or invent missing forms. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LangNationDictionaryPresentation=api;})(typeof window==='undefined'?this:window,function(){
  'use strict';
  function text(value){return typeof value==='string'&&!/^(?:null|undefined|[-–—])$/i.test(value.trim())?value.trim():'';}
  function principal(value){
    if(typeof value==='string'&&/^[\[{]/.test(value.trim())){try{return principal(JSON.parse(value));}catch{return '';}}
    // Stored conjugation arrays use ich, du, er/sie/es, wir, ihr, sie/Sie.
    if(Array.isArray(value))return text(value[2]).replace(/^(?:er\/sie\/es|er|sie|es)\s+/i,'');
    return text(value).replace(/^(?:er\/sie\/es|er|sie|es)\s+/i,'');
  }
  function grammar(entry){
    const type=text(entry.partOfSpeech).toLocaleLowerCase('en'),parts=[];
    const add=(label,value)=>{if(value)parts.push(label+': '+value);};
    if(type==='noun')add('Plural',text(entry.plural)||text(entry.nounForms?.plural_de));
    if(type==='verb'){
      add('Präteritum',principal(entry.praeteritum)||principal(entry.verbForms?.praeteritum));
      add('Perfekt',principal(entry.perfekt)||principal(entry.verbForms?.perfekt));
    }
    if(type==='adjective'||type==='adverb'){
      add('Komparativ',text(entry.adjectiveForms?.komparativ_de));
      add('Superlativ',text(entry.adjectiveForms?.superlativ_de));
    }
    return parts.join(' · ');
  }
  return {grammar,principal};
});
