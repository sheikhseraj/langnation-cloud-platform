'use strict';
(()=>{for(const form of document.querySelectorAll('[data-billing-address]')){
 const choice=form.querySelector('[data-billing-recipient]'),company=form.querySelector('[data-billing-company]'),input=company.querySelector('input'),area=form.querySelector('textarea[name="address"]');
 const drafts={};drafts[choice.value]=area.value;
 function sync(){const active=choice.value==='company';company.hidden=!active;input.required=active;input.disabled=!active||choice.disabled;}
 let previous=choice.value;
 choice.addEventListener('change',()=>{drafts[previous]=area.value;area.value=drafts[choice.value]??choice.selectedOptions[0].dataset.address??'';previous=choice.value;sync();});sync();
}})();
