/* Original canvas art, UI, and procedural audio for SLIPSHIFT. MIT. */
(() => {
  'use strict';
  const G = window.Slipshift, $ = id => document.getElementById(id);
  const canvas = $('canvas'), ctx = canvas.getContext('2d');
  const storage = {get(k, fallback) {try {const v = localStorage.getItem(k); return v === null ? fallback : v;} catch {return fallback;}}, set(k,v) {try {localStorage.setItem(k,v);} catch {}}};
  let state = G.create(), width = 390, height = 500, last = 0, hudAt = 0, visualTime = 0;
  let input = {lane: 1, throttle: false}, pointer = null, keys = new Set();
  let best = Number(storage.get('slipshift-best-v1', '0')) || 0;
  let calm = storage.get('slipshift-calm-v1', matchMedia('(prefers-reduced-motion: reduce)').matches ? '1' : '0') === '1';
  let soundEnabled = storage.get('slipshift-sound-v1', '1') === '1';
  let toastUntil = 0, shake = 0, particles = [], endReason = '', runNumber = 0;
  const audio = {context: null, master: null, motor: null, motorGain: null,
    init() {
      if (!soundEnabled) return;
      try {
        if (!this.context) {
          const A = window.AudioContext || window.webkitAudioContext;
          if (!A) return;
          this.context = new A(); this.master = this.context.createGain(); this.master.gain.value = .32; this.master.connect(this.context.destination);
          this.motor = this.context.createOscillator(); this.motor.type = 'triangle';
          this.motorGain = this.context.createGain(); this.motorGain.gain.value = 0;
          this.motor.connect(this.motorGain); this.motorGain.connect(this.master); this.motor.start();
        }
        this.context.resume().catch(() => {});
      } catch { /* Silent play remains fully supported. */ }
    },
    tone(freq, length = .12, type = 'sine', volume = .18, delay = 0) {
      const a = this.context;
      if (!soundEnabled || !a || a.state !== 'running') return;
      const now = a.currentTime + delay, o = a.createOscillator(), gain = a.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, now); o.frequency.exponentialRampToValueAtTime(freq * .75, now + length);
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(volume, now + .008); gain.gain.exponentialRampToValueAtTime(.001, now + length);
      o.connect(gain); gain.connect(this.master); o.start(now); o.stop(now + length + .02);
    },
    update() {
      if (!this.context || !this.motor) return;
      const now = this.context.currentTime;
      this.motor.frequency.setTargetAtTime(44 + state.speed * 95, now, .08);
      this.motorGain.gain.setTargetAtTime(soundEnabled && state.mode === 'running' ? (state.throttle ? .045 : .018) : 0, now, .05);
    },
    silence() {if(this.motorGain) this.motorGain.gain.setTargetAtTime(0, this.context.currentTime, .01);}
  };
  function setSound() {
    $('sound').setAttribute('aria-pressed', String(soundEnabled));
    $('sound').setAttribute('aria-label', soundEnabled ? 'Turn sound off' : 'Turn sound on');
    $('soundState').textContent = soundEnabled ? 'ON' : 'OFF';
    storage.set('slipshift-sound-v1', soundEnabled ? '1' : '0');
    if (soundEnabled) audio.init(); else audio.silence();
    // All effect oscillators share this bus, including tones already scheduled.
    if (audio.master) audio.master.gain.setValueAtTime(soundEnabled ? .32 : 0, audio.context.currentTime);
  }
  function setCalm(value) {calm = value; if (calm) {particles = []; shake = 0;} $('motion').checked = value; $('pauseMotion').checked = value; $('game').classList.toggle('calm', value); storage.set('slipshift-calm-v1', value ? '1' : '0');}
  function announce(text) {$('announcer').textContent = text;}
  function showPanel(name) {
    $('game').classList.toggle('playing', name === null);
    for (const id of ['intro','paused','results']) $(id).hidden = name !== id;
    const active = name === null;
    for (const id of ['pause','throttle','left','right']) $(id).disabled = !active;
  }
  function clearInput() {input.throttle = false; keys.clear(); pointer = null; $('throttle').classList.remove('pressed');}
  function startRun() {
    clearInput(); state = G.create(20261029 + (runNumber++ * 7919)); input.lane = 1;
    particles = []; shake = 0; toastUntil = 0; endReason = ''; last = 0; hudAt = 0;
    G.start(state); showPanel(null); audio.init(); canvas.focus({preventScroll:true});
    announce('Run started. Hold Space or the accelerator to speed up. Release to bank.');
    flash('HOLD TO GO. RELEASE TO BANK.', false, 2.8); updateHUD();
  }
  function pauseRun(reason = 'Paused') {
    if(state.mode !== 'running') return;
    clearInput(); G.pause(state); audio.silence(); showPanel('paused');
    announce(reason + '. Your run is paused.'); $('resume').focus({preventScroll:true});
  }
  function resumeRun() {
    if(state.mode !== 'paused') return;
    clearInput(); G.resume(state); last = 0; showPanel(null); audio.init(); canvas.focus({preventScroll:true});
    announce('Resumed. Hold to accelerate when ready.');
  }
  function endRun(reason) {
    clearInput(); endReason = reason; audio.silence(); showPanel('results');
    const record = state.score > best; if(record) {best = state.score; storage.set('slipshift-best-v1', String(best));}
    $('resultKicker').textContent = reason === 'finish' ? '60 SECONDS. YOU MADE THEM COUNT.' : reason === 'quit' ? 'RUN ENDED' : 'HULL LOST. BANKED POINTS KEPT.';
    $('resultTitle').innerHTML = reason === 'finish' ? 'NERVE<br><em>OF STEEL.</em>' : 'FAST.<br><em>NOT LUCKY.</em>';
    $('resultScore').textContent = state.score.toLocaleString();
    $('record').textContent = record ? 'NEW PERSONAL BEST!' : 'PERSONAL BEST  ' + best.toLocaleString();
    $('resultPasses').textContent = state.passes; $('resultCombo').textContent = '×' + state.maxMultiplier;
    $('resultSpeed').textContent = Math.round(60 + state.maxSpeed * 240);
    $('resultTip').textContent = reason === 'hull' ? 'Look ahead for the open lane. Release before a tight gap: slower is safer, and banked points stay yours.' : state.passes < 4 ? 'Next run: pass beside traffic above 210 km/h to build your multiplier. Release before the heat bar fills.' : 'The trick isn’t staying fast. It’s knowing exactly when to let go.';
    $('best').textContent = best.toLocaleString();
    announce(`Run ended. ${state.score} banked points. ${record ? 'New personal best.' : ''}`);
    $('restart').focus({preventScroll:true}); updateHUD();
    if(reason === 'finish') {audio.tone(523,.18,'sine',.2);audio.tone(659,.18,'sine',.2,.12);audio.tone(784,.3,'sine',.2,.24);}
  }
  function flash(text, bad = false, duration = 1.1) {$('toast').textContent = text; $('toast').className = 'toast visible' + (bad ? ' bad' : ''); toastUntil = visualTime + duration;}
  function burst(x,y,color,n) {if(calm)return;for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=30+Math.random()*130;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.3+Math.random()*.4,max:.7,color});}}
  function events() {
    for(const e of G.drain(state)) {
      if(e.type === 'bank') {flash('BANKED +' + e.amount); audio.tone(660,.12,'sine',.17);audio.tone(990,.17,'sine',.14,.08);burst(width*.5,height*.81,'#74f5d1',16);}
      if(e.type === 'pass') {flash('CLOSE PASS  ×' + e.multiplier);audio.tone(400+e.multiplier*90,.13,'sine',.13);burst(project(state.x,G.PLAYER_Y),height*G.PLAYER_Y,'#f6d88d',8);}
      if(e.type === 'hit') {flash('HULL HIT · STREAK LOST',true,1.5);audio.tone(90,.3,'sawtooth',.18);shake=calm?0:8;burst(project(state.x,G.PLAYER_Y),height*G.PLAYER_Y,'#ff7a54',28);announce(`Collision. ${e.hull} hull remaining. Unbanked points lost.`);}
      if(e.type === 'overheat') {flash('OVERHEAT · STREAK LOST',true,1.8);audio.tone(140,.4,'triangle',.25);announce('Engine overheated. Unbanked points lost. Release to cool.');}
      if(e.type === 'end') endRun(e.reason);
    }
  }
  function updateHUD() {
    $('score').textContent = state.score.toLocaleString();
    const left = Math.max(0,G.DURATION-state.time).toFixed(1).split('.'); $('time').innerHTML=left[0]+'<span>.'+left[1]+'</span>';
    $('hull').setAttribute('aria-label',state.hull+' hull remaining');
    [...$('hull').children].forEach((el,i)=>el.classList.toggle('lost',i>=state.hull));
    const heat=Math.round(state.heat*100); $('heatValue').textContent=heat+'%'; $('heatFill').style.width=heat+'%';
    $('heatMeter').setAttribute('aria-valuenow',String(heat)); $('heatMeter').classList.toggle('hot',heat>=78);
    $('heatLabel').textContent=state.cutout?'ENGINE CUTOUT — COOLING':heat>=78?'REDLINE — RELEASE TO SAVE IT':'ENGINE HEAT';
    $('charge').textContent=Math.floor(state.charge).toLocaleString(); $('multiplier').textContent='×'+state.multiplier;
    $('speed').innerHTML=Math.round(60+state.speed*240)+' <small>KM/H</small>';
    $('sector').textContent=state.time<20?'SECTOR 01 / NIGHTFALL':state.time<40?'SECTOR 02 / NEON TIDE':'SECTOR 03 / LAST LIGHT';
    $('throttle').classList.toggle('pressed',state.mode==='running'&&state.throttle);
    $('throttleLabel').textContent=state.cutout?'COOLING DOWN':state.throttle?'PUSHING YOUR LUCK':'HOLD TO ACCELERATE';
    $('throttleSub').textContent=state.throttle?'RELEASE TO BANK +'+Math.floor(state.charge):'RELEASE = BANK + COOL';
    $('hint').textContent=state.cutout?'BREATHE. THE ENGINE WILL RECOVER.':state.heat>.78?'LET GO BEFORE THE ENGINE CUTS':state.time<9?'DRAG HORIZONTALLY TO STEER':state.throttle?'CLOSE PASSES BUILD YOUR MULTIPLIER':'POINTS SAFE. READY FOR ANOTHER PUSH?';
  }
  function project(x,y){return width*.5+(x-.5)*width*(.53+.48*y);}
  function polygon(points,fill,stroke,line=1){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}}
  function line(x1,y1,x2,y2,color,w=1){ctx.strokeStyle=color;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  function ship(x,y,scale,enemy,style=0){
    ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
    const color=enemy?'#ff8560':'#8bffe1',dark=enemy?'#4a282b':'#174c4b';
    if(!enemy&&!calm){const flame=state.throttle?22+Math.sin(visualTime*40)*6:9;polygon([[-6,20],[0,20+flame],[6,20]],state.cutout?'#ff7a54':'#74f5d188');}
    ctx.shadowBlur=calm?0:enemy?9:17;ctx.shadowColor=enemy?'#ff704833':'#63ffcd77';
    if(enemy){polygon([[-15,-21],[15,-21],[19,16],[9,23],[-9,23],[-19,16]],'#202534',color,1.5);polygon([[-9,-14],[9,-14],[11,4],[-11,4]],dark);line(-10,9,10,9,color,3);line(-14,-18,-14,-8,color,2);line(14,-18,14,-8,color,2);if(style===1)line(0,-14,0,3,'#c98264',2);}
    else {polygon([[0,-27],[12,-10],[15,18],[8,23],[-8,23],[-15,18],[-12,-10]],'#10413e',color,1.6);polygon([[0,-19],[6,-7],[5,8],[-5,8],[-6,-7]],'#d4fff0');polygon([[-12,0],[-23,21],[-12,17]],dark,color);polygon([[12,0],[23,21],[12,17]],dark,color);line(-7,17,7,17,'#f6d88d',2);}
    ctx.restore();
  }
  function render(dt){
    ctx.save(); ctx.clearRect(0,0,width,height);
    if(shake&&!calm){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake=Math.max(0,shake-dt*35);}
    const bg=ctx.createLinearGradient(0,0,0,height);bg.addColorStop(0,'#101c2a');bg.addColorStop(.5,'#0a1824');bg.addColorStop(1,'#0d202b');ctx.fillStyle=bg;ctx.fillRect(-10,-10,width+20,height+20);
    // Original procedural canal architecture, no raster or third-party art.
    for(let side=0;side<2;side++)for(let i=0;i<9;i++){
      const y=((i/9+(state.distance*.13)%1)%1)*height, depth=y/height, w=8+depth*17;
      const x=side?project(1.04,depth):project(-.04,depth)-w;
      ctx.fillStyle=i%2?'#162c38':'#102632';ctx.fillRect(x,y,w,12+depth*34);
      ctx.fillStyle=i%3===0?'#67c6bd55':'#668da332';ctx.fillRect(x+2,y+3,w-4,2);
    }
    polygon([[project(.04,0),0],[project(.96,0),0],[project(.96,1),height],[project(.04,1),height]],'#0b1622');
    for(const edge of [.04,.96]){line(project(edge,0),0,project(edge,1),height,'#38555f',2);line(project(edge+(edge<.5?-.015:.015),0),0,project(edge+(edge<.5?-.015:.015),1),height,'#76e5ce22',4);}
    for(const lane of [.36,.64]){line(project(lane,0),0,project(lane,1),height,'#1c303d');
      for(let i=0;i<12;i++){const y=((i/12+(state.distance*.23)%1)%1),end=Math.min(1,y+.026);line(project(lane,y),y*height,project(lane,end),end*height,'#66838a55',1.5);}}
    for(let i=0;i<9;i++){const y=((i/9+(state.distance*.18)%1)%1);line(project(.04,y),y*height,project(.96,y),y*height,'#33506519');}
    // Lane-selection guide is quiet and always visible, including calm mode.
    const px=project(state.x,G.PLAYER_Y),py=height*G.PLAYER_Y;
    const guide=ctx.createLinearGradient(0,py-100,0,py+40);guide.addColorStop(0,'#74f5d100');guide.addColorStop(1,'#74f5d119');
    polygon([[project(state.x-.09,.58),height*.58],[project(state.x+.09,.58),height*.58],[px+width*.065,py+35],[px-width*.065,py+35]],guide);
    for(const item of state.traffic){const y=item.y;if(y<-.06)continue;ctx.globalAlpha=item.hit?.28:1;ship(project(item.x,y),y*height,(.52+.48*y)*width/390,true,item.style);ctx.globalAlpha=1;}
    if(!state.invulnerable||calm||Math.floor(visualTime*12)%2===0)ship(px,py,width/390,false);
    if(state.invulnerable){ctx.strokeStyle='#74f5d177';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(px,py,31*width/390,38*width/390,0,0,Math.PI*2);ctx.stroke();}
    if(!calm&&state.throttle&&state.speed>.6){ctx.globalAlpha=(state.speed-.6)*.5;for(let i=0;i<13;i++){const y=((i*.173+visualTime*(.5+state.speed))%1)*height;const x=i%2?width-9-(i%3)*5:9+(i%3)*5;line(x,y,x,y+16+state.speed*20,'#a0f8e0',1);}ctx.globalAlpha=1;}
    for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,2,4);}particles=particles.filter(p=>p.life>0);ctx.globalAlpha=1;
    if(state.heat>.78&&state.mode==='running'){const glow=ctx.createLinearGradient(0,0,width,0);glow.addColorStop(0,'#ff684b28');glow.addColorStop(.13,'#ff684b00');glow.addColorStop(.87,'#ff684b00');glow.addColorStop(1,'#ff684b28');ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);}
    const fade=ctx.createLinearGradient(0,0,0,70);fade.addColorStop(0,'#08111ae8');fade.addColorStop(1,'#08111a00');ctx.fillStyle=fade;ctx.fillRect(0,0,width,70);
    ctx.restore();
  }
  function frame(now){const dt=last?Math.min((now-last)/1000,.1):0;last=now;visualTime+=dt;
    if(state.mode==='running'){G.advance(state,dt,input);events();}
    if(now-hudAt>70){updateHUD();audio.update();hudAt=now;}
    if(visualTime>toastUntil)$('toast').classList.remove('visible');
    render(state.mode==='paused'?0:dt);requestAnimationFrame(frame);
  }
  function resize(){const r=canvas.getBoundingClientRect();width=r.width;height=r.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);}
  canvas.tabIndex=0;
  for(const el of [$('track'),$('throttle')]){
    el.addEventListener('pointerdown',e=>{if(state.mode!=='running'||pointer!==null||e.button!==0||e.target.closest('.overlay'))return;e.preventDefault();pointer={id:e.pointerId,x:e.clientX,lane:input.lane,el};input.throttle=true;el.setPointerCapture(e.pointerId);audio.init();canvas.focus({preventScroll:true});});
    el.addEventListener('pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const dx=e.clientX-pointer.x;input.lane=G.clamp(pointer.lane+Math.round(dx/(width*.24)),0,2);});
    el.addEventListener('pointerup',e=>{if(!pointer||pointer.id!==e.pointerId)return;pointer=null;input.throttle=keys.has('Space')||keys.has('ArrowUp');});
    el.addEventListener('pointercancel',()=>{if(pointer)pauseRun('Touch interrupted');});
    el.addEventListener('lostpointercapture',()=>{if(pointer)pauseRun('Touch interrupted');});
  }
  $('left').addEventListener('click',()=>{input.lane=Math.max(0,input.lane-1);});
  $('right').addEventListener('click',()=>{input.lane=Math.min(2,input.lane+1);});
  document.addEventListener('keydown',e=>{
    if(e.code==='Escape'||e.code==='KeyP'){if(e.repeat)return;if(state.mode==='running'){e.preventDefault();pauseRun();}else if(state.mode==='paused'){e.preventDefault();resumeRun();}return;}
    if(state.mode!=='running')return;
    if(e.code==='Space' && e.target && /^(BUTTON|INPUT)$/.test(e.target.tagName) && e.target.id!=='throttle')return;
    if(['ArrowLeft','ArrowRight','ArrowUp','Space','KeyA','KeyD'].includes(e.code))e.preventDefault();
    if(!e.repeat){if(e.code==='ArrowLeft'||e.code==='KeyA')input.lane=Math.max(0,input.lane-1);if(e.code==='ArrowRight'||e.code==='KeyD')input.lane=Math.min(2,input.lane+1);}
    if(e.code==='Space'||e.code==='ArrowUp'){keys.add(e.code);input.throttle=true;audio.init();}
  });
  document.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space'||e.code==='ArrowUp'){input.throttle=pointer!==null||keys.has('Space')||keys.has('ArrowUp');if(state.mode==='running' && !(e.code==='Space' && e.target && /^(BUTTON|INPUT)$/.test(e.target.tagName) && e.target.id!=='throttle'))e.preventDefault();}});
  window.addEventListener('blur',()=>pauseRun('Window lost focus'));
  window.addEventListener('orientationchange',()=>pauseRun('Screen rotated'));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseRun('Tab hidden');});
  $('start').addEventListener('click',startRun);$('restart').addEventListener('click',startRun);
  $('pause').addEventListener('click',()=>pauseRun());$('resume').addEventListener('click',resumeRun);
  $('quit').addEventListener('click',()=>{state.mode='over';state.charge=0;endRun('quit');});
  $('menu').addEventListener('click',()=>{state=G.create();clearInput();showPanel('intro');$('start').focus({preventScroll:true});updateHUD();});
  $('sound').addEventListener('click',()=>{soundEnabled=!soundEnabled;setSound();});
  $('motion').addEventListener('change',e=>setCalm(e.target.checked));$('pauseMotion').addEventListener('change',e=>setCalm(e.target.checked));
  new ResizeObserver(resize).observe($('track'));window.addEventListener('resize',resize);
  $('best').textContent=best.toLocaleString();setCalm(calm);
  // Do not instantiate AudioContext until an actual user gesture.
  $('sound').setAttribute('aria-pressed',String(soundEnabled));$('sound').setAttribute('aria-label',soundEnabled?'Turn sound off':'Turn sound on');$('soundState').textContent=soundEnabled?'ON':'OFF';
  resize();showPanel('intro');updateHUD();requestAnimationFrame(frame);
})();
