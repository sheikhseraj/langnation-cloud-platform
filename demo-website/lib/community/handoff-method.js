'use strict';
const TEMPLATES=Object.freeze({
 STANDARD:'Send the approved applicant the private WhatsApp invite link. After the applicant has joined the group, record actual admission to mark the membership as Active.',
 MANUAL:'Add the approved applicant manually to the WhatsApp group. After the applicant has joined the group, record actual admission to mark the membership as Active.'
});
function handoffMethod(group={}){
 const text=String(group.instructions||'').trim();
 if(text&&text!==TEMPLATES.STANDARD&&text!==TEMPLATES.MANUAL)return 'CUSTOM';
 if(group.invite_delivery_mode==='CUSTOM')return 'CUSTOM';
 if(group.invite_delivery_mode==='STANDARD'||text===TEMPLATES.STANDARD)return 'STANDARD';
 if(text===TEMPLATES.MANUAL)return 'MANUAL';
 // Historical MANUAL meant the entire human workflow, not specifically manual addition.
 return group.invite_link_encrypted||group.has_invite_link?'STANDARD':'MANUAL';
}
function handoffInstructions(group){const mode=handoffMethod(group);return mode==='CUSTOM'?String(group.instructions||'').trim():TEMPLATES[mode];}
module.exports={TEMPLATES,handoffMethod,handoffInstructions};
