'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const G=require('../dist/core.js');
function harness(){
  let frame,state; const elements=new Map(),effects=[],gains=[],draws=[];
  const context=new Proxy({fillStyle:'',setTransform(){},createLinearGradient(){return {addColorStop(){}};},fillRect(){draws.push(this.fillStyle);}}, {get(t,k){return k in t?t[k]:(()=>{});}});
  class Element{constructor(){this.listeners={};this.style={};this.children=[];this.attrs={};this.classList={toggle(){},remove(){}};} addEventListener(t,f){this.listeners[t]=f;} setAttribute(k,v){this.attrs[k]=v;} focus(){} getBoundingClientRect(){return {width:390,height:500};} getContext(){return context;} emit(t,e={}){this.listeners[t]?.(e);}}
  function el(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);}
  el('hull').children=[new Element(),new Element(),new Element()];
  function param(){return {value:0,calls:[],setValueAtTime(v){this.value=v;this.calls.push(v);},setTargetAtTime(v){this.value=v;this.calls.push(v);},linearRampToValueAtTime(v){this.value=v;},exponentialRampToValueAtTime(v){this.value=v;},cancelScheduledValues(){}};}
  class AudioContext{constructor(){this.state='running';this.currentTime=0;this.destination={};} resume(){return Promise.resolve();} createGain(){const g={gain:param(),connect(){}};gains.push(g);return g;} createOscillator(){return {frequency:param(),connect(){},start(){},stop(){}};}}
  const env={window:{Slipshift:{...G,create(...a){state=G.create(...a);return state;},drain(){return effects.splice(0);}},AudioContext,addEventListener(){}},document:{getElementById:el,addEventListener(){}},localStorage:{getItem(){return null;},setItem(){}},matchMedia(){return {matches:false};},devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame(f){frame=f;},console};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/game.js'),'utf8'),env);
  return {el,effects,gains,draws,state:()=>state,frame(t){draws.length=0;frame(t);}};
}
test('Calm FX removes existing particle bursts immediately, including pause and re-enable',()=>{
  const h=harness();h.el('start').emit('click');h.effects.push({type:'bank',amount:12});h.frame(100);
  assert.ok(h.draws.includes('#74f5d1'),'fixture must create real rendered bank particles');
  h.el('pause').emit('click');h.el('pauseMotion').emit('change',{target:{checked:true}});h.frame(110);
  assert.ok(!h.draws.includes('#74f5d1'),'calm mode must remove existing particles');
  h.el('pauseMotion').emit('change',{target:{checked:false}});h.frame(120);
  assert.ok(!h.draws.includes('#74f5d1'),'turning FX back on must not resurrect old particles');
});
test('Sound Off mutes the shared bus, including scheduled effects, and restores it on opt-in',()=>{
  const h=harness();h.el('start').emit('click');h.effects.push({type:'bank',amount:12});h.frame(100);
  assert.ok(h.gains.length>=4,'fixture must schedule effect tones');
  const master=h.gains[0];h.el('sound').emit('click');
  assert.equal(master.gain.value,0,'mute must cover every effect, not only the engine');
  h.el('sound').emit('click');assert.equal(master.gain.value,.32);
});
