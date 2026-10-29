/* SLIPSHIFT — original deterministic simulation. MIT. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Slipshift = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STEP = 1 / 120, DURATION = 60, PLAYER_Y = .82, LANES = [.22, .5, .78];
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function create(seed = 20261029) {
    return {seed: seed >>> 0 || 1, rng: seed >>> 0 || 1, mode: 'ready', time: 0,
      accumulator: 0, lane: 1, x: .5, speed: .24, heat: 0, score: 0,
      charge: 0, multiplier: 1, hull: 3, traffic: [], nextSpawn: 2.1,
      safeLane: 1, invulnerable: 0, cutout: 0, releaseTime: 0,
      bankedThisRelease: true, throttle: false, distance: 0, passes: 0,
      banks: 0, maxMultiplier: 1, maxSpeed: 0, events: [], nextId: 1};
  }
  function random(s) {
    let x = s.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    s.rng = x >>> 0; return s.rng / 4294967296;
  }
  function emit(s, type, extra = {}) { s.events.push({type, ...extra}); }
  function start(s) { if (s.mode === 'ready') {s.mode = 'running'; emit(s, 'start');} }
  function pause(s) { if (s.mode === 'running') {s.mode = 'paused'; s.throttle = false; s.accumulator = 0;} }
  function resume(s) { if (s.mode === 'paused') {s.mode = 'running'; s.throttle = false; s.accumulator = 0;} }
  function bank(s, final = false) {
    const amount = Math.floor(s.charge);
    if (amount > 0) { s.score += amount; s.banks++; emit(s, 'bank', {amount, final}); }
    s.charge = 0; s.multiplier = 1; s.bankedThisRelease = true;
  }
  function spawn(s) {
    // A guaranteed open lane; adjacent gaps prevent impossible full-width jumps.
    const change = Math.floor(random(s) * 3) - 1;
    s.safeLane = clamp(s.safeLane + change, 0, 2);
    let blocked = [0, 1, 2].filter(l => l !== s.safeLane);
    if (random(s) > .28 + .32 * s.time / DURATION) blocked.splice(Math.floor(random(s) * 2), 1);
    for (const lane of blocked) s.traffic.push({id: s.nextId++, lane, x: LANES[lane], y: -.14, passed: false, hit: false, style: Math.floor(random(s) * 3)});
    s.nextSpawn += 1.00 - .18 * s.time / DURATION + random(s) * .18;
  }
  function collide(s, item) {
    item.hit = true; s.hull--; s.charge = 0; s.multiplier = 1;
    s.speed = .2; s.heat = Math.max(0, s.heat - .28); s.invulnerable = 1.45;
    emit(s, 'hit', {hull: s.hull});
    if (!s.hull) {s.mode = 'over'; s.throttle = false; emit(s, 'end', {reason: 'hull'});}
  }
  function tick(s, input) {
    const dt = STEP;
    s.time = Math.min(DURATION, s.time + dt);
    if (DURATION - s.time < 1e-9) s.time = DURATION;
    s.lane = clamp(Math.round(Number.isFinite(input.lane) ? input.lane : s.lane), 0, 2);
    const oldX = s.x;
    s.x += clamp(LANES[s.lane] - s.x, -1.65 * dt, 1.65 * dt);
    s.invulnerable = Math.max(0, s.invulnerable - dt);
    s.cutout = Math.max(0, s.cutout - dt);
    const throttle = !!input.throttle && s.cutout === 0;
    s.throttle = throttle;
    if (throttle) {
      s.releaseTime = 0; s.bankedThisRelease = false;
      s.speed = Math.min(1, s.speed + .40 * dt);
      s.heat = Math.min(1, s.heat + (.12 + .105 * s.speed) * dt);
      s.charge += (24 + 100 * s.speed * s.speed) * s.multiplier * dt;
      if (s.heat >= 1) {
        const lost = Math.floor(s.charge);
        s.charge = 0; s.multiplier = 1; s.cutout = 1.5; s.speed = .22;
        s.throttle = false; emit(s, 'overheat', {lost});
      }
    } else {
      s.speed = Math.max(.24, s.speed - .55 * dt);
      s.heat = Math.max(0, s.heat - (s.cutout ? .32 : .45) * dt);
      s.releaseTime += dt;
      if (s.releaseTime >= .18 && !s.bankedThisRelease && !s.cutout) bank(s);
    }
    s.maxSpeed = Math.max(s.maxSpeed, s.speed);
    const travel = (.23 + .59 * s.speed) * dt;
    s.distance += travel;
    if (s.time >= s.nextSpawn) spawn(s);
    for (const item of s.traffic) {
      const oldY = item.y;
      item.y += travel;
      // Swept longitudinal check remains safe if speed tuning changes later.
      if (!item.hit && !s.invulnerable && oldY < PLAYER_Y + .055 && item.y > PLAYER_Y - .055) {
        const at = clamp((PLAYER_Y - oldY) / Math.max(travel, .000001), 0, 1);
        const playerX = oldX + (s.x - oldX) * at;
        if (Math.abs(playerX - item.x) < .105) collide(s, item);
      }
      if (!item.passed && item.y > PLAYER_Y + .08) {
        item.passed = true;
        const gap = Math.abs(s.x - item.x);
        if (!item.hit && s.mode === 'running' && s.throttle && s.speed > .62 && gap >= .105 && gap < .34) {
          s.multiplier = Math.min(8, s.multiplier + 1); s.passes++;
          s.maxMultiplier = Math.max(s.maxMultiplier, s.multiplier);
          s.charge += 35 * s.multiplier;
          emit(s, 'pass', {multiplier: s.multiplier});
        }
      }
    }
    s.traffic = s.traffic.filter(item => item.y < 1.22);
    if (s.mode === 'running' && s.time >= DURATION) {
      bank(s, true); s.mode = 'over'; s.throttle = false; emit(s, 'end', {reason: 'finish'});
    }
  }
  function advance(s, seconds, input = {}) {
    if (s.mode !== 'running' || !Number.isFinite(seconds) || seconds <= 0) return;
    // The caller pauses on focus loss; clamp unusual stalls, never simulate a surprise death.
    s.accumulator += Math.min(seconds, .1);
    while (s.accumulator + 1e-10 >= STEP && s.mode === 'running') {
      s.accumulator -= STEP; tick(s, input);
    }
    if (s.mode !== 'running') s.accumulator = 0;
  }
  function drain(s) { return s.events.splice(0); }
  return {create, start, pause, resume, advance, drain, bank, clamp, STEP, DURATION, PLAYER_Y, LANES};
});
