'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const ui=require('../public/js/chat-position');
function surface({saved=null,storageFails=false,width=390,height=844}={}) {
 class Events {
  constructor(){this.listeners=new Map();}
  addEventListener(name,fn){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(fn);}
  fire(name,over={}){const event={button:0,detail:1,pointerId:1,clientX:300,clientY:790,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...over};for(const fn of this.listeners.get(name)||[]){fn(event);if(event.stopped)break;}return event;}
 }
 const classes=new Set(),widget={style:{setProperty(name,value){this[name]=value;}},classList:{contains:name=>classes.has(name),add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n)),toggle(name,on){if(on)classes.add(name);else classes.delete(name);}},contains:el=>!!el?.inside};
 const launcher=new Events(),panel={hidden:true},doc=new Events(),win=new Events();
 const storage=new Map(saved?[['ln.ai.launcher-position.v1',JSON.stringify(saved)]]:[]),frames=new Map();let raf=0,minimised=0;
 Object.assign(win,{innerWidth:width,innerHeight:height,visualViewport:Object.assign(new Events(),{width,height,offsetLeft:0,offsetTop:0}),getComputedStyle:()=>({getPropertyValue:()=> '0px'}),localStorage:{getItem:key=>{if(storageFails)throw Error('Unavailable');return storage.get(key)||null;},setItem:(key,value)=>{if(storageFails)throw Error('Unavailable');storage.set(key,value);}},requestAnimationFrame:fn=>{frames.set(++raf,fn);return raf;}});
 doc.activeElement=null;
 launcher.inside=true;launcher.setPointerCapture=()=>{};launcher.hasPointerCapture=()=>true;launcher.releasePointerCapture=()=>{};
 launcher.getBoundingClientRect=()=>{
  const w=classes.has('is-compact')?52:132,h=54;
  const left=parseFloat(widget.style.left)||width-w-10,top=parseFloat(widget.style.top)||height-h-10;
  return {left,top,right:left+w,bottom:top+h,width:w,height:h};
 };
 panel.getBoundingClientRect=()=>({width:Math.min(350,win.visualViewport.width-20),height:Math.min(410,win.visualViewport.height-20)});
 const position=ui.create({widget,launcher,panel,win,doc,minimise:keep=>{assert.equal(keep,true);panel.hidden=true;minimised++;}});
 return {widget,launcher,panel,win,doc,classes,storage,position,minimised:()=>minimised,flush(){const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn());}};
}
const field=(rect,type='text')=>({tagName:'INPUT',type,getBoundingClientRect:()=>rect});

test('drag bounds and viewport offsets retain the entire launcher on screen',()=>{
 const area=ui.viewport({visualViewport:{width:320,height:330,offsetLeft:12,offsetTop:180}});
 assert.deepEqual(ui.clamp({x:-900,y:2000},{width:132,height:54},area),{x:22,y:446});
 assert.deepEqual(ui.clamp({x:999,y:-5},{width:132,height:54},area),{x:190,y:190});
});
test('field avoidance moves to the nearest free location, or hides for a full-screen editor',()=>{
 const area={left:0,top:0,right:390,bottom:844},size={width:52,height:54},spot={x:250,y:770};
 const rect={left:200,right:390,top:750,bottom:810};const next=ui.avoidField(spot,size,rect,area);
 assert(next);assert(!ui.overlaps(next,size,rect));
 assert.equal(ui.avoidField(spot,size,{left:0,right:390,top:0,bottom:844},area),null);
});
test('text fields outside the widget qualify; buttons and the chat composer do not',()=>{
 const widget={contains:e=>!!e.inside};assert(ui.isPageField(field({}),widget));
 for(const type of ['checkbox','radio','file','range','button','hidden'])assert.equal(ui.isPageField(field({},type),widget),false);
 assert.equal(ui.isPageField({...field({}),inside:true},widget),false);
 assert(ui.isPageField({isContentEditable:true},widget));assert(ui.isPageField({tagName:'TEXTAREA'},widget));
});
test('dragging uses a transform, persists only the position and suppresses the release click',()=>{
 const f=surface();let opened=0;f.launcher.addEventListener('click',()=>opened++);
 const left=f.widget.style.left,top=f.widget.style.top;
 f.launcher.fire('pointerdown');f.launcher.fire('pointermove',{clientX:120,clientY:450});
 assert.match(f.widget.style.transform,/translate3d/);assert.equal(f.widget.style.left,left);assert.equal(f.widget.style.top,top);
 f.launcher.fire('pointerup');assert.equal(f.widget.style.transform,'');assert.notEqual(f.widget.style.left,left);assert.notEqual(f.widget.style.top,top);
 const saved=JSON.parse(f.storage.get('ln.ai.launcher-position.v1'));assert.deepEqual(Object.keys(saved).sort(),['x','y']);
 const click=f.launcher.fire('click');assert(click.prevented);assert.equal(opened,0);f.launcher.fire('click',{detail:0});assert.equal(opened,1);
});
test('a tap opens normally, and a second finger cannot hijack the drag',()=>{
 const f=surface();f.launcher.fire('pointerdown');f.launcher.fire('pointermove',{clientX:298,clientY:790});f.launcher.fire('pointerup');assert.equal(f.launcher.fire('click').prevented,undefined);
 f.launcher.fire('pointerdown');f.launcher.fire('pointermove',{pointerId:2,clientX:50,clientY:50});assert.equal(f.widget.style.transform,'');f.launcher.fire('pointercancel');assert(!f.classes.has('is-armed'));
});
test('focusing a page input minimises without stealing focus and avoids the field',()=>{
 const f=surface({saved:{x:250,y:770}});f.panel.hidden=false;const input=field({left:200,right:390,top:740,bottom:825});f.doc.activeElement=input;f.doc.fire('focusin',{target:input});
 assert.equal(f.minimised(),1);assert.equal(f.doc.activeElement,input);assert(f.classes.has('is-compact'));assert(!ui.overlaps({x:parseFloat(f.widget.style.left),y:parseFloat(f.widget.style.top)},f.launcher.getBoundingClientRect(),input.getBoundingClientRect()));
 f.doc.activeElement=null;f.doc.fire('focusout');f.flush();assert(!f.classes.has('is-compact'));assert.equal(parseFloat(f.widget.style.top),770);
});
test('page scrolling reevaluates collision and a full-screen field temporarily hides Lina',()=>{
 const f=surface();const input=field({left:0,right:390,top:0,bottom:844});f.doc.activeElement=input;f.doc.fire('focusin',{target:input});assert(f.classes.has('is-field-covered'));
 input.getBoundingClientRect=()=>({left:0,right:390,top:100,bottom:150});f.doc.fire('scroll');f.flush();assert(!f.classes.has('is-field-covered'));
});
test('panel fits above a reduced visual viewport and opening ignores a parked top-left launcher',()=>{
 const f=surface({saved:{x:10,y:10}});f.panel.hidden=false;Object.assign(f.win.visualViewport,{height:300,offsetTop:170});f.win.visualViewport.fire('resize');f.flush();
 const top=parseFloat(f.widget.style.top);assert(top>=180);assert(top+f.panel.getBoundingClientRect().height<=460);assert.notEqual(parseFloat(f.widget.style.left),10);
 f.panel.hidden=true;f.position.sync();assert.equal(parseFloat(f.widget.style.left),10);assert(parseFloat(f.widget.style.top)>=180);
});
test('stored positions clamp after rotation and unavailable storage cannot disable chat',()=>{
 const f=surface({saved:{x:1900,y:950},width:320,height:500});assert(parseFloat(f.widget.style.left)+132<=310);assert(parseFloat(f.widget.style.top)+54<=490);
 assert.doesNotThrow(()=>surface({storageFails:true}));
});

test('keyboard movement is bounded and remembered without requiring a pointer',()=>{
 const f=surface(),before=parseFloat(f.widget.style.top);
 const key=f.launcher.fire('keydown',{altKey:true,key:'ArrowUp'});assert(key.prevented);assert.equal(parseFloat(f.widget.style.top),before-10);
 assert(f.storage.has('ln.ai.launcher-position.v1'));
});
