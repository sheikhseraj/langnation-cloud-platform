/* Pure German selection helpers shared by the browser and regression tests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LangNationDictionaryText=api;})(typeof window==='undefined'?this:window,function(){
  'use strict';
  const normalize=text=>String(text||'').normalize('NFC').trim().replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu,'');
  const words=text=>normalize(text).match(/[\p{L}\p{M}\p{N}]+(?:[-’'][\p{L}\p{M}\p{N}]+)*/gu)||[];
  function sentence(text,offset){
    text=String(text||'');offset=Math.max(0,Math.min(text.length-1,offset));
    // Intl handles German punctuation/quotes; merge boundaries after common titles,
    // abbreviations and ordinals that are not standalone sentence endings.
    const parts=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('de',{granularity:'sentence'}).segment(text)].map(p=>({start:p.index,end:p.index+p.segment.length})):fallback(text);
    const spans=[];
    for(const part of parts){
      const prev=spans.at(-1),prior=prev?text.slice(prev.start,prev.end).trimEnd():'';
      if(prev&&(/(?:\b(?:Dr|Prof|Dipl|Nr|ca|z|B|d|h|u|a)|\d{1,2})\.$/u.test(prior)||(/\b(?:bzw|usw|vgl|inkl|ggf|bspw)\.$/u.test(prior)&&/^\p{Ll}/u.test(text.slice(part.start,part.end).trimStart()))))prev.end=part.end;
      else spans.push({...part});
    }
    const span=spans.find(p=>offset>=p.start&&offset<p.end)||{start:0,end:text.length};
    const raw=text.slice(span.start,span.end),left=raw.length-raw.trimStart().length;
    return {text:raw.trim(),start:span.start+left,end:span.end-(raw.length-raw.trimEnd().length)};
  }
  function fallback(text){const out=[];let start=0;for(const m of text.matchAll(/[.!?]+[»“”"')\]]*(?:\s+|$)/gu)){out.push({start,end:m.index+m[0].length});start=m.index+m[0].length;}if(start<text.length)out.push({start,end:text.length});return out;}
  return {normalize,words,sentence};
});
