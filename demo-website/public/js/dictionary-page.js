'use strict';
(() => {
  // Lesen initializes the same component with its saved-word counter callback.
  if(document.getElementById('reading-data'))return;
  const data=document.getElementById('dictionary-data');if(!data)return;
  const boot=JSON.parse(data.textContent);
  async function post(url,body){
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json','X-CSRF-Token':boot.csrf},body:JSON.stringify(body)});
    if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Bitte melde dich erneut an.');
    const value=await response.json();if(!response.ok)throw Error(value.error||'Speichern fehlgeschlagen.');return value;
  }
  window.LangNationReadingPopover({boot,post,onSaved:(count,entryId)=>document.dispatchEvent(new CustomEvent('langnation:vocabulary-saved',{detail:{count,entryId}}))});
})();
