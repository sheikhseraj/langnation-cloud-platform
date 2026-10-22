'use strict';
(() => {
 const widgets=[];
 for(const select of document.querySelectorAll('#v-filters select[name="theme"],#v-filters select[name="grammar"]')){
  const label=select.closest('label').querySelector('span').textContent,root=document.createElement('div');root.className='v-select-search';select.after(root);
  const button=document.createElement('button');button.type='button';button.className='v-select-trigger';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-expanded','false');root.append(button);
  const popup=document.createElement('div');popup.className='v-select-popup';popup.hidden=true;popup.setAttribute('role','dialog');popup.setAttribute('aria-label',label+' auswählen');root.append(popup);
  const search=document.createElement('input');search.type='search';search.placeholder=label+' suchen…';search.setAttribute('aria-label',label+' suchen');search.setAttribute('role','combobox');search.setAttribute('aria-autocomplete','list');search.setAttribute('aria-expanded','false');popup.append(search);
  const list=document.createElement('div');list.className='v-select-list';list.id='v-options-'+select.name;list.setAttribute('role','listbox');list.setAttribute('aria-label',label);popup.append(list);search.setAttribute('aria-controls',list.id);
  const empty=document.createElement('p');empty.textContent='Keine passenden Optionen.';empty.className='v-help';empty.hidden=true;popup.append(empty);
  let visible=[],active=0;
  function caption(){button.textContent=select.selectedOptions[0]?.textContent||'';button.setAttribute('aria-label',label+': '+button.textContent);}
  function highlight(){[...list.children].forEach((item,i)=>item.dataset.active=String(i===active));const item=list.children[active];if(item){search.setAttribute('aria-activedescendant',item.id);item.scrollIntoView({block:'nearest'});}else search.removeAttribute('aria-activedescendant');}
  function choose(option){select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));close(true);}
  function render(){const q=search.value.trim().toLocaleLowerCase('de');visible=[...select.options].filter(o=>o.textContent.toLocaleLowerCase('de').includes(q));list.replaceChildren();for(const [i,option]of visible.entries()){const b=document.createElement('button');b.type='button';b.id=list.id+'-'+i;b.setAttribute('role','option');b.setAttribute('aria-selected',String(option.selected));b.textContent=option.textContent;b.addEventListener('click',()=>choose(option));list.append(b);}active=Math.max(0,visible.findIndex(o=>o.selected));empty.hidden=visible.length>0;highlight();}
  function open(){popup.hidden=false;button.setAttribute('aria-expanded','true');search.setAttribute('aria-expanded','true');search.value='';render();search.focus();}
  function close(focus=false){popup.hidden=true;button.setAttribute('aria-expanded','false');search.setAttribute('aria-expanded','false');search.removeAttribute('aria-activedescendant');if(focus)button.focus();}
  button.addEventListener('click',()=>popup.hidden?open():close(true));button.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open();}});
  search.addEventListener('input',render);root.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);}if(!popup.hidden&&e.target===search&&['ArrowDown','ArrowUp','Home','End','Enter'].includes(e.key)){e.preventDefault();if(e.key==='Enter'){if(visible[active])choose(visible[active]);return;}active=e.key==='Home'?0:e.key==='End'?visible.length-1:Math.max(0,Math.min(visible.length-1,active+(e.key==='ArrowDown'?1:-1)));highlight();}});
  document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))close();});root.addEventListener('focusout',e=>{if(!root.contains(e.relatedTarget))close();});select.addEventListener('change',caption);select.form.addEventListener('reset',()=>queueMicrotask(()=>{caption();close();}));
  select.hidden=true;caption();widgets.push({refresh(){caption();if(!popup.hidden)render();}});
 }
 window.LangNationVocabularySelect={refresh(){widgets.forEach(w=>w.refresh());}};
})();
