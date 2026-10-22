"use strict";
// Learning requests use only Website-owned data. Upstream reads belong to explicit sync.
const db=require('./db'),store=require('./vocabulary-catalogue-store'),file=require('./vocabulary-catalogue-file'),{canonical}=require('./vocabulary-catalogue-bundle');
function absent(e){return e?.catalogueEmpty||((e?.code==='ER_NO_SUCH_TABLE'||Number(e?.errno)===1146)&&/\bvocabulary_catalogue_(state|revisions|entries|themes|grammar|types)\b/.test(String(e.sqlMessage||e.message||'')));}
async function read(method,arg){if(!db.isEnabled())return file[method](arg);try{return await store[method](arg);}catch(e){if(!absent(e))throw e;return file[method](arg);}}
module.exports={canonical,list:input=>read('list',input),get:async id=>{const e=await read('get',id);if(!e)throw Object.assign(Error('Vocabulary entry not found'),{status:404});return e;},facets:input=>read('facets',input)};
