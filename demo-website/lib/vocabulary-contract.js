"use strict";
const catalogue=require('./vocabulary-catalogue.json');
function filters(input={}){
 const out={};if(input.q!==undefined&&input.q!==''){if(typeof input.q!=='string'||input.q.length>100){const e=Error('Invalid search');e.status=400;throw e;}out.q=input.q.trim();}
 for(const [key,values]of [['level',catalogue.levels],['theme',Object.keys(catalogue.themes)],['grammar',Object.keys(catalogue.grammar)],['type',Object.keys(catalogue.types)]])if(input[key]!==undefined&&input[key]!==''){
  if(typeof input[key]!=='string'||!values.includes(input[key])){const e=new Error('Invalid '+key);e.status=400;throw e;}out[key]=input[key];
 }
 for(const [key,fallback,max]of [['page',1,10000],['limit',20,100]]){const v=input[key]??fallback;if(!/^\d+$/.test(String(v))||Number(v)<1||Number(v)>max){const e=new Error('Invalid '+key);e.status=400;throw e;}out[key]=Number(v);}
 return out;
}
module.exports={catalogue,filters};
