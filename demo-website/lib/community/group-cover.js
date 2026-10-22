'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../../public/img/community/covers');
const fallback='/img/community/covers/default.webp';
function coverImageUrl(group,exists=fs.existsSync){
 const city=String(group.city||'').trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
 const slug=String(group.slug||'');
 for(const candidate of [/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)?'groups/'+slug:null,city?'cities/'+city:null].filter(Boolean))for(const extension of ['webp','jpg','jpeg','png'])if(exists(path.join(root,candidate+'.'+extension)))return '/img/community/covers/'+candidate+'.'+extension;
 return fallback;
}
module.exports={coverImageUrl};
