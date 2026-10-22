'use strict';
(()=>{for(const picker of document.querySelectorAll('[data-invoice-address-picker]')){
 const kind=picker.querySelector('[data-address-kind]'),source=picker.querySelector('[data-address-source]'),company=picker.querySelector('[data-address-company]'),input=company.querySelector('input'),area=picker.querySelector('textarea'),hint=picker.querySelector('[data-address-hint]');
 const drafts={};const key=()=>kind.value;let previousKind=kind.value,previousSource=source.value;
 if(source.value==='manual')drafts[key()]={company:input.value,address:area.value};
 function stash(){if(previousSource==='manual')drafts[previousKind]={company:input.value,address:area.value};}
 function sync(load){
  const companyMode=kind.value==='company',saved=kind.selectedOptions[0].dataset.address||'';
  const savedOption=source.querySelector('option[value="saved"]');savedOption.disabled=!saved||(companyMode&&!picker.dataset.company);
  const requestedOption=source.querySelector('option[value="requested"]');if(requestedOption)requestedOption.disabled=kind.value!==picker.dataset.wantedRecipient;
  if(source.selectedOptions[0].disabled)source.value=saved&&!savedOption.disabled?'saved':'manual';
  company.hidden=!companyMode;input.required=companyMode;input.disabled=!companyMode;
  const manual=source.value==='manual';area.readOnly=!manual;input.readOnly=!manual;
  if(load){
   if(source.value==='requested'){area.value=picker.dataset.wantedAddress||'';input.value=companyMode?picker.dataset.wantedName||'':'';}
   else if(source.value==='saved'){area.value=saved;input.value=picker.dataset.company||'';}
   else{const v=drafts[key()];area.value=v?.address??saved;input.value=v?.company??picker.dataset.company??'';}
  }
  hint.textContent=manual?'Include street and house number, postcode, city and country. This request does not change your account settings.':'This address is filled automatically. Select “Enter or correct address” to write a different one.';
  previousKind=kind.value;previousSource=source.value;
 }
 kind.addEventListener('change',()=>{stash();sync(true);});source.addEventListener('change',()=>{stash();sync(true);});sync(false);
}})();
