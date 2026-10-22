// Minimal in-process DOM fixture for actual community UI code. No browser,
// automation package, external service or new runtime dependency.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
class Node {
 constructor(tag,doc){this.tagName=tag.toUpperCase();this.doc=doc;this.attrs={};this.children=[];this.parentNode=null;this.events={};this.value='';this.checked=false;this.hidden=false;this.open=false;this.disabled=false;this._text='';this.classes=new Set();this.classList={add:(...names)=>names.forEach(n=>this.classes.add(n)),remove:n=>this.classes.delete(n),contains:n=>this.classes.has(n)};}
 get textContent(){return this._text+this.children.map(c=>c.textContent).join('');}
 set textContent(value){this._text=String(value??'');this.children.forEach(c=>c.parentNode=null);this.children=[];}
 set className(value){this.classes=new Set(String(value).split(/\s+/).filter(Boolean));}
 get className(){return [...this.classes].join(' ');}
 setAttribute(k,v){this.attrs[k]=String(v);if(k==='class')this.className=v;if(['hidden','open','disabled','required'].includes(k))this[k]=true;if(k==='name')this.name=String(v);if(k==='id')this.id=String(v);if(k==='type')this.type=String(v);}
 getAttribute(k){return this.attrs[k]??null;}hasAttribute(k){return Object.hasOwn(this.attrs,k);}removeAttribute(k){delete this.attrs[k];if(['hidden','open','disabled'].includes(k))this[k]=false;}
 append(...nodes){for(let node of nodes){if(typeof node!=='object')node=this.doc.createTextNode(String(node));node.remove();node.parentNode=this;this.children.push(node);}}
 prepend(...nodes){for(const node of [...nodes].reverse()){node.remove();node.parentNode=this;this.children.unshift(node);}}
 remove(){if(this.parentNode){const list=this.parentNode.children;list.splice(list.indexOf(this),1);this.parentNode=null;}}
 replaceChildren(...nodes){this.textContent='';this.append(...nodes);}
 replaceWith(node){const parent=this.parentNode;if(!parent)return;const index=parent.children.indexOf(this);node.remove();parent.children.splice(index,1,node);this.parentNode=null;node.parentNode=parent;}
 insertBefore(node,before){node.remove();const index=this.children.indexOf(before);this.children.splice(index<0?this.children.length:index,0,node);node.parentNode=this;}
 addEventListener(event,fn){(this.events[event]??=[]).push(fn);}
 async fire(event){const obj={target:this,preventDefault(){}};if(this['on'+event])await this['on'+event](obj);for(const fn of this.events[event]||[])await fn(obj);}
 showModal(){this.open=true;}close(){this.open=false;this.fire('close');}async click(){return this.fire('click');}focus(){this.doc.activeElement=this;}scrollIntoView(){this.scrolled=true;}
 get isConnected(){return this===this.doc.body||Boolean(this.parentNode?.isConnected);}
 get elements(){return {namedItem:name=>this.querySelector('[name="'+name+'"]')};}
 reportValidity(){return this.querySelectorAll('input,select,textarea').every(n=>!n.required||(n.type==='checkbox'?n.checked:Boolean(n.value)));}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 querySelectorAll(selector){const out=[];const matches=n=>selector.split(',').some(part=>{part=part.trim();const attr=part.match(/^(\w+)?\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);if(attr)return (!attr[1]||n.tagName.toLowerCase()===attr[1])&&n.hasAttribute(attr[2])&&(attr[3]===undefined||n.getAttribute(attr[2])===attr[3]);if(part.startsWith('#'))return n.id===part.slice(1);return n.tagName.toLowerCase()===part;});function visit(parent){for(const child of parent.children){if(matches(child))out.push(child);visit(child);}}visit(this);return out;}
}
async function createPublicFixture({applications=true,reports=false,feature=true,groups,submit,joinTarget}={}){
 const doc={createElement:tag=>new Node(tag,doc),createTextNode:text=>{const n=new Node('#text',doc);n._text=String(text);return n;}};doc.body=new Node('body',doc);doc.getElementById=id=>doc.body.querySelector('#'+id);doc.querySelector=s=>doc.body.querySelector(s);
 const root=doc.createElement('section');root.dataset={lang:'en',csrf:'a'.repeat(64),countries:JSON.stringify(require('../content/countries.json'))};if(joinTarget)root.dataset.joinTarget=JSON.stringify(joinTarget);root.setAttribute('data-community-public','');doc.body.append(root);
 const content=doc.createElement('div');content.setAttribute('data-cm-content','');const notice=doc.createElement('p');notice.setAttribute('data-cm-notice','');const hero=doc.createElement('a');hero.setAttribute('data-community-join','');hero.hidden=true;const availability=doc.createElement('p');availability.setAttribute('data-community-availability','');root.append(hero,availability,notice,content);
 const config={enabled:feature,applicationsEnabled:applications,rules:'## Rules\n\n1. Be helpful.\nKeep it friendly.\n\n2. No spam.\n\n<script>alert(1)</script>\n**Admin instructions** apply.',rulesVersion:'1',privacyNotice:'## Privacy Notice\n\nWe review membership requests.\n\n- Only necessary data\n- Authorized admins',privacyVersion:'1',publicReportingEnabled:reports};
 groups??=[{id:1,name:'Neighbours in Berlin',city:'Berlin',description:'A local community.',status:'ACTIVE',acceptingApplications:true,memberCount:47,communityName:'Neighbours in Germany',imageUrl:null,rulesVersion:'1'},{id:2,name:'Neighbours in Magdeburg',city:'Magdeburg',description:'Another local group.',status:'ACTIVE',acceptingApplications:true,rulesVersion:'group-custom',customRules:'## Local rules\n\n- Keep city posts relevant.'}];
 const calls=[],source=fs.readFileSync(path.join(__dirname,'../public/js/app.js'),'utf8'),start=source.lastIndexOf('(() => {',source.indexOf("document.querySelector('[data-community-admin],[data-community-public]')")),end=source.indexOf('// The same native collapsible menus',start);
 const fetch=async(url,options={})=>{calls.push({url,options});let data,status=200;if(url==='/api/community/config')data=config;else if(url==='/api/community/groups')data=feature?groups:[];else{const response=submit?await submit(url,options):{status:201,data:{message:'Received'}};status=response.status;data=response.data;}return {ok:status<400,status,json:async()=>data};};
 vm.runInNewContext(source.slice(start,end<0?undefined:end),{document:doc,fetch,console,URL,Intl,Date,Number,Object,Error,Promise,setTimeout,clearTimeout});await new Promise(resolve=>setImmediate(resolve));
 const byText=text=>root.querySelectorAll('button,a,summary').find(n=>n.textContent===text);
 const input=(name,section='community-join')=>doc.getElementById(section)?.querySelector('[name="'+name+'"]');
 return {doc,root,hero,availability,content,config,groups,calls,byText,input};
}
module.exports={Node,createPublicFixture};
