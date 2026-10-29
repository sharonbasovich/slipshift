'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../dist/core.js');
function run(seconds, hz = 60, initial = {}) {
  const s = Object.assign(G.create(82), initial); G.start(s);
  for (let i = 0; i < seconds * hz; i++) G.advance(s, 1 / hz, {lane: 1, throttle: true});
  return s;
}
function control(s) {
  const nearest = s.traffic.filter(t => !t.hit && t.y > -.1 && t.y < .89).sort((a,b) => b.y-a.y)[0];
  let lane = s.lane;
  if (nearest) {
    const blocked = s.traffic.filter(t => !t.hit && Math.abs(t.y-nearest.y)<.02).map(t=>t.lane);
    if (blocked.includes(lane)) lane = [0,1,2].filter(x=>!blocked.includes(x)).sort((a,b)=>Math.abs(a-lane)-Math.abs(b-lane))[0];
  }
  return {lane, throttle: (Math.floor(s.time*120)%600)<420};
}
test('review: deterministic constant-input simulation across 30/60/120/144 Hz', () => {
  const results = [30,60,120,144].map(hz=>run(4,hz,{nextSpawn:Infinity}));
  for (const s of results.slice(1)) for(const key of ['time','speed','heat','charge','distance','rng']) assert.ok(Math.abs(s[key]-results[0][key]) < 1e-8, key);
});
test('review: release waits 180ms then banks exactly once', () => {
  const s=run(1,120,{nextSpawn:Infinity});const expected=Math.floor(s.charge);
  for(let i=0;i<21;i++)G.advance(s,G.STEP,{throttle:false});assert.equal(s.score,0);
  G.advance(s,G.STEP,{throttle:false});assert.equal(s.score,expected);assert.equal(s.banks,1);assert.equal(s.multiplier,1);
  for(let i=0;i<300;i++)G.advance(s,G.STEP,{throttle:false});assert.equal(s.score,expected);assert.equal(s.banks,1);
});
test('review: overheat loses unbanked charge without consuming hull', () => {
  const s=run(6,120,{nextSpawn:Infinity});assert.equal(s.hull,3);assert.equal(s.score,0);
  assert.ok(s.events.some(e=>e.type==='overheat'&&e.lost>0));assert.ok(s.heat>=0&&s.heat<=1);
});
test('review: one row cannot consume multiple hull points in one collision tick',()=>{
  const s=G.create();G.start(s);s.nextSpawn=Infinity;s.traffic=[{id:1,lane:1,x:.5,y:.8},{id:2,lane:1,x:.5,y:.8}];
  G.advance(s,.1,{lane:1,throttle:true});assert.equal(s.hull,2);assert.equal(s.events.filter(e=>e.type==='hit').length,1);
});
test('review: paused simulation does not bank, cool, move, or spend run time',()=>{
  const s=run(2,120,{nextSpawn:Infinity});G.pause(s);const before=JSON.stringify(s);
  for(let i=0;i<100;i++)G.advance(s,.1,{lane:2,throttle:false});assert.equal(JSON.stringify(s),before);
  G.resume(s);G.advance(s,G.STEP,{lane:1,throttle:false});assert.equal(s.mode,'running');assert.ok(s.time>2);
});
test('review: terminal run cannot advance or add repeated end events',()=>{
  const s=G.create();G.start(s);s.nextSpawn=Infinity;s.time=59.999;s.charge=532.75;
  G.advance(s,G.STEP,{throttle:false});assert.equal(s.mode,'over');assert.equal(s.score,532);
  for(let i=0;i<100;i++)G.advance(s,.1,{throttle:true});assert.equal(s.score,532);assert.equal(s.events.filter(e=>e.type==='end').length,1);
});
test('review: non-finite/negative elapsed time cannot corrupt simulation',()=>{
  const s=G.create();G.start(s);const before=JSON.stringify(s);for(const dt of [NaN,Infinity,-1,0])G.advance(s,dt,{});assert.equal(JSON.stringify(s),before);
});
test('review: generated rows have an adjacent reachable open path over 100 seeded full runs',()=>{
  for(let seed=1;seed<=100;seed++){
    const s=G.create(seed);G.start(s);let oldNext=0,previousSafe=1;
    while(s.mode==='running'){
      G.advance(s,G.STEP,control(s));
      if(s.nextId!==oldNext){assert.ok(Math.abs(s.safeLane-previousSafe)<=1,'safe lane jumped two lanes');previousSafe=s.safeLane;oldNext=s.nextId;}
      assert.ok(s.traffic.length<12);assert.ok(s.heat>=0&&s.heat<=1);assert.ok(s.x>=.22&&s.x<=.78);
    }
    assert.equal(s.time,60,`seed ${seed} ended early with hull=${s.hull}`);
    assert.equal(s.hull,3,`seed ${seed} had unavoidable collision under look-ahead lane controller`);
    assert.ok(s.score>3000,`seed ${seed} no viable score path`);
  }
});

// Minimal DOM harness exercises actual controller handlers without fabricating browser QA.
function controllerHarness() {
  const fs=require('node:fs'),vm=require('node:vm');
  const elements=new Map(),documentEvents={},windowEvents={};let currentState;
  class Element {
    constructor(){this.listeners={};this.style={};this.children=[];this.attrs={};this.classList={toggle(){},remove(){}};}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    setAttribute(k,v){this.attrs[k]=v;}
    focus(){}
    getBoundingClientRect(){return {width:390,height:500};}
    getContext(){return {setTransform(){}};}
    setPointerCapture(){}
    emit(type,e={}){for(const fn of this.listeners[type]||[])fn(e);}
  }
  function el(id){if(!elements.has(id))elements.set(id,new Element());return elements.get(id);}
  el('hull').children=[new Element(),new Element(),new Element()];
  const fakeG={...G,create(...args){currentState=G.create(...args);return currentState;}};
  const win={Slipshift:fakeG,addEventListener(k,f){windowEvents[k]=f;}};
  const env={window:win,document:{getElementById:el,addEventListener(k,f){documentEvents[k]=f;}},localStorage:{getItem(){return null;},setItem(){}},matchMedia(){return {matches:false};},devicePixelRatio:1,ResizeObserver:class{observe(){}},requestAnimationFrame(){},console};
  vm.runInNewContext(fs.readFileSync(require.resolve('../dist/game.js'),'utf8'),env);
  return {el,state:()=>currentState,key(code,repeat=false){documentEvents.keydown({code,repeat,preventDefault(){}});},keyup(code){documentEvents.keyup({code,preventDefault(){}});},windowEvents};
}
test('review: holding a pause key must not resume automatically on key-repeat',()=>{
  const h=controllerHarness();h.el('start').emit('click');assert.equal(h.state().mode,'running');
  h.key('KeyP');assert.equal(h.state().mode,'paused');
  h.key('KeyP',true);assert.equal(h.state().mode,'paused');
  h.keyup('KeyP');h.key('KeyP');assert.equal(h.state().mode,'running');
});
test('review: input controller focus loss enters pause and resume requires deliberate action',()=>{
  const h=controllerHarness();h.el('start').emit('click');h.key('Space');h.windowEvents.blur();assert.equal(h.state().mode,'paused');
  h.keyup('Space');assert.equal(h.state().mode,'paused');h.el('resume').emit('click');assert.equal(h.state().mode,'running');assert.equal(h.state().throttle,false);
});
