(() => {
"use strict";
// basezoom-20261121: phones (<=700 px) keep the same room arrangement, tightened to 396x316 with square pixels,
// so the room renders ~1.2x bigger on a phone; both side boards stay fully visible. Desktop keeps the 480x300 room untouched.
const MOB = window.innerWidth <= 700;
const W = MOB ? 396 : 480, H = MOB ? 360 : 300;   // basezoom2: rows spread out on phones (more floor between them)
const $ = id => document.getElementById(id);
const AG = {
  hunter:  {name:"HUNTER",  role:"01 · FIND",  shape:"square", col:"#ff4b55", x:156, y:152, desk:0},
  scanner: {name:"SCANNER", role:"02 · SCAN",  shape:"round",  col:"#3d8bff", x:272, y:152, desk:1},
  coach:   {name:"COACH",   role:"03 · GRADE", shape:"round",  col:"#f1f3f5", x:390, y:152, desk:2, phones:true},
  vortex:  {name:"VORTEX",  role:"04 · BRAIN", shape:"tri",    col:"#ff4fa8", x:176, y:224, desk:3},
  midas:   {name:"MIDAS",   role:"05 · TRADE", shape:"hex",    col:"#ffb52e", x:312, y:224, desk:4},
};
const ORDER = ["hunter","scanner","coach","vortex","midas"];
const DESKS = MOB ? [[146,112],[248,112],[348,112],[168,202],[296,202]] : [[156,104],[272,104],[390,104],[176,176],[312,176]];
if (MOB) { const p = {hunter:[146,160], scanner:[248,160], coach:[348,160], vortex:[168,250], midas:[296,250]}; Object.keys(p).forEach(k => { AG[k].x = p[k][0]; AG[k].y = p[k][1]; }); }   // back 3 + front 2, coach now has a real desk
const ACC = {hunter:"#ff4b55", scanner:"#3d8bff", coach:"#d5dbe3", vortex:"#ff4fa8", midas:"#ffb52e"};
const DESK_KEY = ["hunter","scanner","coach","vortex","midas"];
let pnlFx = null, D = null, seenIds = null, seenOpen = null, sound = localStorage.getItem("pulse_snd") === "1", tick = 0;
let rocketPhase = 0, rackHotUntil = 0, lastSignals = null;
const ROCKET_PAD = MOB ? {x: 378, y: 322} : {x: 413, y: 228}, ROCKET_FLY = 48, ROCKET_WAIT = 54;


const ML = {   // phone room layout (base arrangement, tightened)
  neon: 182, clock: 274, coins: 328, coinStep: 12, scr: [128, 206], book: [338, 30, 54, 54], plantR: [386, 92],
  rig: [3, 150], aquarium: [10, 270], espresso: [108, 290], lounge: [-32, 50], rack: [-78, 56], arcade: [310, 296], fridge: [334, 298]
};
// ---------- formatting ----------
const eur = (v, sign) => { if (v == null) return "–"; const s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g," ");
  return (sign ? (v > 0 ? "+" : v < 0 ? "−" : "") : (v < 0 ? "−" : "")) + "€" + s; };
let fmtHM, fmtDay;
try { fmtHM = new Intl.DateTimeFormat("fr-FR", {timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23"});
  fmtDay = new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit"}); } catch (e) { fmtHM = fmtDay = null; }
const hhmm = t => { const d = new Date(t*1000); if (fmtHM) return fmtHM.format(d);
  return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0"); };
const dayP = t => { const d = new Date(t*1000); return fmtDay ? fmtDay.format(d) : d.toDateString(); };
const ago = t => { const s = Date.now()/1000 - t; if (s < 60) return "now"; if (s < 3600) return Math.floor(s/60)+"m ago"; if (s < 86400) return Math.floor(s/3600)+"h ago"; return Math.floor(s/86400)+"d ago"; };

// ---------- pixel sprites ----------
function blobMask(shape, s) {
  const m = [];
  for (let y = 0; y < s; y++) { m.push([]); for (let x = 0; x < s; x++) {
    const cx = x - (s-1)/2, cy = y - (s-1)/2; let on = false;
    if (shape === "round") on = cx*cx + cy*cy <= (s/2-0.4)**2;
    else if (shape === "square") on = Math.abs(cx) <= s/2-1 && Math.abs(cy) <= s/2-1.5 && !(Math.abs(cx) > s/2-2.2 && Math.abs(cy) > s/2-2.7);
    else if (shape === "tri") { const t = (y+0.5)/s; on = y >= 1 && Math.abs(cx) <= t*(s/2) && y < s-1; }
    else if (shape === "hex") { const a = Math.abs(cx), b = Math.abs(cy); on = b <= s/2-1 && a <= s/2-0.6 && a*0.55 + b <= s/2-0.2; }
    m[y].push(on);
  }}
  return m;
}
function shade(hex, f) { const n = parseInt(hex.slice(1),16); let r=n>>16,g=(n>>8)&255,b=n&255;
  r=Math.max(0,Math.min(255,Math.round(r*f))); g=Math.max(0,Math.min(255,Math.round(g*f))); b=Math.max(0,Math.min(255,Math.round(b*f)));
  return "rgb("+r+","+g+","+b+")"; }
function drawBlob(ctx, a, ox, oy, s, frame, opts) {
  opts = opts || {};
  const m = blobMask(a.shape, s), dark = shade(a.col, 0.62), lite = shade(a.col, 1.25);
  ctx.fillStyle = "rgba(0,0,0,.45)"; ctx.fillRect(ox+2, oy+s, s-4, 2);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) if (m[y][x]) {
    const below = y+1 >= s || !m[y+1][x], above = y === 0 || !m[y-1][x];
    ctx.fillStyle = below ? dark : (above && x < s/2) ? lite : a.col; ctx.fillRect(ox+x, oy+y, 1, 1);
  }
  if (opts.walk != null) { ctx.fillStyle = dark; ctx.fillRect(ox+4, oy+s-(opts.walk ? 1 : 2), 3, 2); ctx.fillRect(ox+s-7, oy+s-(opts.walk ? 2 : 1), 3, 2); }
  const blink = opts.blink;
  const lk = opts.look || 0, ey = oy + Math.round(s*0.42) + (a.shape === "tri" ? 2 : 0) - (opts.up ? 1 : 0), ex1 = ox + Math.round(s*0.32) + lk, ex2 = ox + Math.round(s*0.6) + lk;
  ctx.fillStyle = a.col === "#f1f3f5" ? "#14171c" : "#101318";
  if (blink) { ctx.fillRect(ex1, ey+1, 2, 1); ctx.fillRect(ex2, ey+1, 2, 1); }
  else { ctx.fillRect(ex1, ey, 2, 3); ctx.fillRect(ex2, ey, 2, 3); ctx.fillStyle="rgba(255,255,255,.8)"; ctx.fillRect(ex1, ey, 1, 1); ctx.fillRect(ex2, ey, 1, 1); }
  if (a.phones) { ctx.fillStyle = "#22262d"; ctx.fillRect(ox+2, oy-1, s-4, 1); ctx.fillRect(ox+1, oy, 1, 2);
    ctx.fillRect(ox+s-2, oy, 1, 2); ctx.fillRect(ox-1, oy+4, 3, 5); ctx.fillRect(ox+s-2, oy+4, 3, 5); ctx.fillStyle="#3fe0a0"; ctx.fillRect(ox-1, oy+6, 1, 1); }
  if (opts.hands) { const f = frame % 4; ctx.fillStyle = a.col;
    ctx.fillRect(ox-2, oy+s-5 - (f < 2 ? 1 : 0), 2, 2); ctx.fillRect(ox+s, oy+s-5 - (f >= 2 ? 1 : 0), 2, 2); }
}
function iconCanvas(key, px) {
  const c = document.createElement("canvas"); c.width = c.height = 18; c.className = "ico";
  const x = c.getContext("2d"); drawBlob(x, AG[key], 2, 2, 14, 0, {}); if (px) c.style.width = c.style.height = px + "px"; return c;
}

// ---------- room ----------
const room = $("room"), vg = room.getContext("2d");
const off = document.createElement("canvas"); off.width = W; off.height = H;
const g = off.getContext("2d"); g.imageSmoothingEnabled = false;
// the scene is drawn at 480x300 and upscaled to the real screen size (device pixels, nearest neighbour = crisp pixel art)
// the scene shows the whole room on every screen size
let VX = 0, VW = W;
let SY = 1;   // phones: the room is drawn a little taller than wide (non-square pixels), so everything looks bigger without cropping the scene
function fitRoom() { const dpr = window.devicePixelRatio || 1, cw = room.clientWidth || W, phone = window.innerWidth <= 700;
  VX = (phone && !MOB) ? 4 : 0; VW = (phone && !MOB) ? W - 8 : W; SY = (phone && !MOB) ? 1.12 : 1;
  const pw = Math.max(VW, Math.min(VW*8, Math.round(cw*dpr))), ph = Math.round(pw*H/VW*SY);
  if (room.width !== pw || room.height !== ph) { room.width = pw; room.height = ph; } }
function blit() { vg.imageSmoothingEnabled = false; vg.drawImage(off, VX, 0, VW, H, 0, 0, room.width, room.height); }
let gt = g;
const R = (x,y,w,h,c) => { gt.fillStyle = c; gt.fillRect(x|0,y|0,w|0,h|0); };
let rnd = 7; const rand = () => (rnd = (rnd*16807) % 2147483647) / 2147483647;
const miniC = DESKS.map((_, i) => { let p = 9 + i % 3; return Array.from({length: 8}, () => { const o = p, c = Math.max(3, Math.min(14, o + (Math.random() - .5)*6)); p = c;
  return {o, c, h: Math.min(16, Math.max(o, c) + Math.random()*2), l: Math.max(1, Math.min(o, c) - Math.random()*2)}; }); });
const monSeries = DESKS.map((_, i) => Array.from({length: 34}, (_, k) => 9 + Math.sin(k/3+i)*3));

// ---------- living characters: each one works at the desk and regularly gets up ----------
const ST = {}; ORDER.forEach(k => { ST[k] = {x: AG[k].x, y: AG[k].y, q: [], wait: 0, act: null, look: 0, up: 0, walking: false, next: 0, cel: 0, excl: 0}; });
const rr = (lo, hi) => lo + Math.random()*(hi - lo);
const midasBusy = () => !!(D && D.open && D.open.length);
const TRIPS = MOB ? {
  midas:  () => [{x:350,y:250},{x:350,y:166},{x:298,y:164,w:34,act:"talk",look:-1}],
  hunter: () => [{x:108,y:166},{x:86,y:190,w:48,act:"dig",look:-1}],
  vortex: () => [{x:228,y:246,w:44,act:"think",look:1,up:1}],
  coach:  () => [{x:298,y:160},{x:228,y:160},{x:228,y:246,w:22,act:"check",look:-1},{x:120,y:224,w:22,act:"check",look:1}],
} : {
  midas:  () => [{x:380,y:224},{x:380,y:158},{x:300,y:156,w:34,act:"talk",look:-1}],
  hunter: () => [{x:118,y:158},{x:110,y:200,w:48,act:"dig",look:-1}],
  vortex: () => [{x:240,y:220,w:44,act:"think",look:1,up:1}],
  coach:  () => [{x:330,y:152},{x:240,y:152},{x:240,y:220,w:22,act:"check",look:-1},{x:130,y:200,w:22,act:"check",look:1}],
};
const FIRST = {midas: 25, coach: 10, hunter: 50, vortex: 90, scanner: 25};
function nextGap(k) { if (k === "midas") return midasBusy() ? rr(12, 40) : rr(45, 110);   // busier while a position is open (frames at 18/s)
  if (k === "coach") return rr(4, 18); if (k === "hunter") return rr(50, 130); if (k === "scanner") return rr(14, 40); return rr(80, 190); }
const LOUNGE_SIT = MOB ? {x: 206, y: 314} : {x: 238, y: 264};
let loungeBusy = false, loungeCool = 500;   // ~18 fps: first visit after ~28s, then every 1–2 min
function loungeGap() { return rr(18 * 60, 18 * 120); }
function canLounge(k) {
  if (k === "midas" && midasBusy()) return false;
  const s = ST[k]; return !(s.q.length || s.wait > 0);
}
function loungePath(k) {
  const sit = {x: LOUNGE_SIT.x, y: LOUNGE_SIT.y, w: rr(80, 130), act: "sit", look: 0};
  if (MOB) return mSide(k).concat([sit]);
  if (k === "vortex") return [{x: 210, y: 230}, sit];
  if (k === "midas") return [{x: 270, y: 230}, sit];
  if (k === "hunter") return [{x: 118, y: 158}, {x: 118, y: 230}, {x: 200, y: 250}, sit];
  if (k === "scanner") return [{x: 240, y: 152}, {x: 240, y: 230}, sit];
  return [{x: 330, y: 152}, {x: 240, y: 152}, {x: 240, y: 230}, sit];  // coach
}
let officeCool = 90, hi5At = null, hi5Cool = 0;
function nowAct(a) { return ORDER.some(k => ST[k].act === a && ST[k].wait > 0); }
function officeAway() {
  return ORDER.filter(k => {
    const s = ST[k];
    if (s.q.length) return true;
    return s.wait > 0 && s.act && s.act !== "scan" && s.act !== "stretch";
  }).length;
}
function canOffice(k) {
  if (k === "midas" && midasBusy()) return false;
  const s = ST[k]; return !(s.q.length || s.wait > 0);
}
function mSide(k) {   // phone room: way from each desk down to the aisle behind the lounge (y 276)
  if (k === "vortex") return [{x: 196, y: 276}];
  if (k === "midas") return [{x: 250, y: 276}];
  if (k === "hunter") return [{x: 108, y: 166}, {x: 108, y: 276}];
  if (k === "scanner") return [{x: 228, y: 160}, {x: 228, y: 276}];
  return [{x: 298, y: 160}, {x: 228, y: 160}, {x: 228, y: 276}];
}
function sidePath(k, dest) {
  if (MOB) return mSide(k).concat([{x: dest.x, y: dest.y}]);
  const x = dest.x, y = dest.y;
  if (k === "vortex") return [{x: 210, y: 230}, {x, y}];
  if (k === "midas") return [{x: 270, y: 230}, {x, y}];
  if (k === "hunter") return [{x: 118, y: 158}, {x: 118, y: 230}, {x, y}];
  if (k === "scanner") return [{x: 240, y: 152}, {x: 240, y: 230}, {x, y}];
  return [{x: 330, y: 152}, {x: 240, y: 152}, {x: 240, y: 230}, {x, y}];
}
function officePath(k, act) {
  if (MOB && act !== "sit" && act !== "nap") {
    const via = {x: 292, y: 282};
    if (act === "coffee") { const last = {x: 98, y: 318, w: rr(50, 80), act, look: 1}; return mSide(k).concat([last]); }
    if (act === "arcade") { const last = {x: 300, y: 320, w: rr(70, 110), act, look: 1}; return mSide(k).concat([via, last]); }
    if (act === "fridge") { const last = {x: 324, y: 322, w: rr(40, 70), act, look: 1}; return mSide(k).concat([via, last]); }
    if (act === "feed") { const last = {x: 66, y: 330, w: rr(50, 80), act, look: -1}; return mSide(k).concat([last]); }
    const last = Math.random() < 0.5 ? {x: 144, y: 312, w: rr(40, 70), act: "water", look: 0} : {x: 286, y: 312, w: rr(40, 70), act: "water", look: 0};
    return mSide(k).concat([last]);
  }
  if (act === "sit" || act === "nap") return loungePath(k).map((p, i, a) => i === a.length - 1 ? Object.assign({}, p, {act, w: act === "nap" ? rr(90, 140) : p.w}) : p);
  if (act === "coffee") { const last = {x: 96, y: 252, w: rr(50, 80), act: "coffee", look: 1}; return sidePath(k, last).slice(0, -1).concat([last]); }
  if (act === "arcade") { const last = {x: 414, y: 268, w: rr(70, 110), act: "arcade", look: 1}; return sidePath(k, last).slice(0, -1).concat([{x: 400, y: 250}, last]); }
  if (act === "fridge") { const last = {x: 440, y: 270, w: rr(40, 70), act: "fridge", look: 1}; return sidePath(k, last).slice(0, -1).concat([{x: 400, y: 250}, last]); }
  if (act === "feed") { const last = {x: 70, y: 268, w: rr(50, 80), act: "feed", look: -1}; return sidePath(k, last).slice(0, -1).concat([last]); }
  const left = Math.random() < 0.5;
  const last = left ? {x: 176, y: 262, w: rr(40, 70), act: "water", look: 0} : {x: 318, y: 262, w: rr(40, 70), act: "water", look: 0};
  return sidePath(k, last).slice(0, -1).concat([last]);
}
function startOffice(k, f) {
  const s = ST[k]; if (s.q.length || s.wait > 0 || officeAway() >= 2 || tick < officeCool) return false;
  const h = parisHour();
  // stretch stays at the desk, so Midas can do it even with an open position; he never walks away then
  if (h >= 17 && h < 22 && Math.random() < 0.22) {
    s.act = "stretch"; s.wait = rr(36, 55); s.up = 1; s.look = 0; s.next = f + s.wait + nextGap(k);
    officeCool = tick + rr(18 * 6, 18 * 14); return true;
  }
  if (!canOffice(k)) return false;
  let bag = ["coffee", "arcade", "fridge", "feed", "water", "nap", "sit"];
  if (h >= 7 && h < 9) bag = bag.concat(["coffee", "coffee", "coffee"]);
  if (h >= 17 && h < 22) bag = bag.concat(["nap", "nap"]);
  const act = bag[(Math.random() * bag.length) | 0];
  if ((act === "nap" || act === "sit") && (loungeBusy || tick < loungeCool)) return false;
  if (act !== "water" && act !== "sit" && act !== "nap" && nowAct(act)) return false;
  if ((act === "sit" || act === "nap") && ORDER.some(j => ST[j].act === "sit" || ST[j].act === "nap")) return false;
  const out = officePath(k, act);
  const back = out.slice(0, -1).reverse().map(p => ({x: p.x, y: p.y})); back.push({x: AG[k].x, y: AG[k].y, end: 1});
  s.q = out.concat(back);
  if (act === "nap" || act === "sit") loungeBusy = true;
  officeCool = tick + rr(18 * 8, 18 * 18);
  return true;
}
function checkHighFives(f) {
  if (hi5Cool > f) return;
  for (let i = 0; i < ORDER.length; i++) for (let j = i + 1; j < ORDER.length; j++) {
    const a = ST[ORDER[i]], b = ST[ORDER[j]];
    if (!a.walking || !b.walking) continue;
    if (Math.hypot(a.x - b.x, a.y - b.y) < 16) {
      hi5At = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, until: f + 16};
      hi5Cool = f + 18 * 18; return;
    }
  }
}
function startLounge(k) { const s = ST[k]; if (s.q.length || s.wait > 0) return false;
  if (!canLounge(k) || loungeBusy || tick < loungeCool) return false;
  const out = loungePath(k);
  const back = out.slice(0, -1).reverse().map(p => ({x: p.x, y: p.y})); back.push({x: AG[k].x, y: AG[k].y, end: 1});
  s.q = out.concat(back); loungeBusy = true; return true;
}
function startTrip(k) { const s = ST[k]; if (s.q.length || s.wait > 0) return;
  const out = TRIPS[k]();
  const back = out.slice(0, -1).reverse().map(p => ({x: p.x, y: p.y})); back.push({x: AG[k].x, y: AG[k].y, end: 1}); s.q = out.concat(back); }
function onAct(k, act) {
  if (act === "talk") { ST.scanner.excl = tick + 36; say("midas", "checking signals"); }
  if (act === "dig") say("hunter", "searching…");
  if (act === "think") say("vortex", "thinking…");
  if (act === "check") say("coach", "on my rounds");
}
function stepChar(k, f) {
  const s = ST[k];
  if (s.wait > 0) { s.wait--; s.walking = false; if (s.wait === 0) {
    if (s.act === "sit" || s.act === "nap") { loungeBusy = false; loungeCool = f + loungeGap(); }
    if (s.act === "coffee") s.cup = f + 200;
    s.act = null; s.look = 0; s.up = 0;
  } return; }
  if (s.q.length) { const p = s.q[0], dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy), sp = 3.3;
    if (d <= sp) { s.x = p.x; s.y = p.y; s.q.shift(); s.walking = false;
      if (p.w) { s.wait = p.w; s.act = p.act || null; s.look = p.look || 0; s.up = p.up || 0; if (p.act) onAct(k, p.act); }
      if (p.end) { s.look = 0; s.next = f + nextGap(k); } }
    else { s.x += dx/d*sp; s.y += dy/d*sp; s.walking = true; if (Math.abs(dx) > 0.5) s.look = dx > 0 ? 1 : -1; }
    return; }
  s.walking = false;
  if (!s.next) s.next = f + (FIRST[k] || 60);
  else if (f >= s.next) {
    if (startOffice(k, f)) { s.next = f + 700; return; }
    if (startLounge(k)) { s.next = f + 600; return; }
    if (k === "scanner") { s.act = "scan"; s.wait = 44; s.next = f + 44 + nextGap(k); }
    else { startTrip(k); s.next = f + 600; }
  }
}

function plant(x, y, big) { const s = big ? 1.4 : 1;
  R(x-5*s, y, 10*s, 8*s, "#1d232c"); R(x-4*s, y+8*s, 8*s, 2*s, "#151a21");
  const leaves = [[-7,-4],[-5,-9],[-1,-12],[3,-10],[6,-5],[-3,-6],[1,-7],[4,-1],[-6,0]];
  leaves.forEach(([lx,ly],i) => { R(x+lx*s, y+ly*s, 4*s, 3*s, i%2 ? "#2f6b3a" : "#3f8a48"); R(x+lx*s+1, y+ly*s, 1*s+1, 1, "#5fb066"); });
}
function banner(x, y) { R(x, y-2, 18, 2, "#2b3340"); R(x+1, y, 16, 40, "#121821"); R(x+1, y, 1, 40, "#222b38"); R(x+16, y, 1, 40, "#222b38");
  for (let i = 0; i < 8; i++) R(x+1+i, y+40+i, 16-2*i, 1, "#121821");
  logoGlyph(x+5, y+16, "#e7ebef"); }
function logoGlyph(x, y, c) { // pulse line glyph
  const pts = [[0,4],[2,4],[3,1],[4,7],[5,0],[6,6],[7,4],[9,4]]; g.fillStyle = c;
  for (let i = 0; i < pts.length-1; i++) { const [x0,y0] = pts[i], [x1,y1] = pts[i+1]; const n = Math.max(Math.abs(x1-x0), Math.abs(y1-y0));
    for (let k = 0; k <= n; k++) g.fillRect(x + Math.round(x0 + (x1-x0)*k/n), y + Math.round(y0 + (y1-y0)*k/n), 1, 1); } }

function ovalW(rx, ry, dy) { const t = dy / ry; if (t < -1 || t > 1) return 0; return Math.round(rx * Math.sqrt(Math.max(0, 1 - t * t))); }
function midasPath(o) {
  const end = (o && o.x) != null ? +o.x : 1;
  if (o && o.path && o.path.length > 1) {
    const p = o.path.map(v => +v).filter(v => isFinite(v));
    if (p.length > 1) return p;
  }
  return [end, end];   // live fallback: flat line at the current multiple, never a fake path
}
function pixLine(x0, y0, x1, y1, c) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let k = 0; k <= n; k++) R(Math.round(x0 + (x1 - x0) * k / n), Math.round(y0 + (y1 - y0) * k / n), 1, 1, c); }
function monHunter(sx, sy, sw, sh, f) {
  for (let i = 0; i < 6; i++) {
    const y = sy + 2 + i * 4, on = i === ((f >> 3) % 6);
    R(sx + 2, y, 2, 2, on ? "#ff4b55" : "#6a3038");
    R(sx + 6, y, 10 + ((i * 5) % 14), 2, on ? "#8a3a44" : "#3a2028");
  }
  const cx = sx + sw - 9, cy = sy + sh - 9, rad = 6, ang = (f % 24) / 24 * 6.28;
  for (let k = 0; k < 10; k++) { const a = k * 0.63; R(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, 1, 1, "#5a3038"); }
  R(cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad, 2, 2, "#ff4b55");
  R(cx, cy, 2, 2, "#ff4b55");
}
function monScanner(sx, sy, sw, sh, f, i) {
  const s = monSeries[i] || monSeries[0];
  for (let k = 0; k < 18; k++) {
    const h = Math.round(Math.max(2, Math.min(sh - 6, (s[k % s.length] - 2) * 1.4)));
    R(sx + 3 + k * 4, sy + sh - 3 - h, 3, h, k % 5 === 3 ? "#ff5468" : (k === ((f >> 2) % 18) ? "#7ec8ff" : "#2fcf8f"));
  }
  const pr = 3 + (f % 10);
  for (let q = 0; q <= 6; q++) { const a = -3.14 + q * 0.5; R(sx + sw - 10 + Math.cos(a) * pr, sy + 5 + Math.sin(a) * pr * 0.6, 1, 1, pr > 9 ? "#1b3b73" : "#3d8bff"); }
}
function monCoach(sx, sy, sw, sh, f) {
  const st = (D && D.agents && D.agents.coach && D.agents.coach.stars) || [];
  const rows = st.length ? st.slice(0, 5) : [1, 0.8, 0.6, 0.45, 0.3].map((v, i) => ({pnl: v * 8, n: 5 - i}));
  const mp = Math.max(1, ...rows.map(q => Math.abs(q.pnl || q)));
  rows.forEach((q, i) => {
    const y = sy + 3 + i * 4, w = 8 + Math.round(Math.min(1, Math.abs(q.pnl || q) / mp) * (sw - 16));
    R(sx + 2, y, 2, 2, i === 0 ? "#ffd98a" : "#d5dbe3");
    R(sx + 6, y, w, 2, "#2fcf8f");
    if (i === ((f >> 4) % rows.length)) R(sx + 6 + w - 1, y, 1, 2, "#e8edf2");
  });
}
function monVortex(sx, sy, sw, sh, f) {
  const e = (D && D.equity) || [];
  const vals = e.length > 3 ? e.slice(-20).map(p => p.bal) : monSeries[3].map((v, i) => 20 + v + i * 0.2);
  const lo = Math.min(...vals), hi = Math.max(...vals), sp = (hi - lo) || 1;
  const X = i => sx + 2 + Math.round(i * (sw - 5) / (vals.length - 1));
  const Y = v => sy + 3 + Math.round((hi - v) / sp * (sh - 7));
  for (let i = 0; i < vals.length - 1; i++) pixLine(X(i), Y(vals[i]), X(i + 1), Y(vals[i + 1]), "#ff4fa8");
  R(X(vals.length - 1) - 1, Y(vals[vals.length - 1]) - 1, 3, 3, "#ff8ac8");
}
function monMidasScreen(sx, sy, sw, sh, f) {
  const o = midasBusy() ? (D.open && D.open[0]) : null;
  if (o) {
    const p = midasPath(o), last = p[p.length - 1], up = last >= 1, col = up ? "#3fe0a0" : "#ff5468";
    let lo = Math.min(1, ...p), hi = Math.max(1, ...p); const padv = (hi - lo) || 0.2; lo -= padv * 0.12; hi += padv * 0.18;
    const Yv = v => Math.round(sy + 6 + (sh - 8) - (v - lo) / (hi - lo) * (sh - 8));
    const ye = Yv(1); for (let x = sx; x < sx + sw; x += 3) R(x, ye, 2, 1, "#2a3441");
    const X = i => sx + Math.round(i * (sw - 1) / (p.length - 1));
    for (let i = 0; i < p.length - 1; i++) pixLine(X(i), Yv(p[i]), X(i + 1), Yv(p[i + 1]), col);
    R(X(p.length - 1) - 1, Yv(last) - 1, 3, 3, col);
    const lab = "x" + last.toFixed(2); let lw = 0; for (const ch of lab) lw += (ch === "." ? 2 : 4);
    pixText(lab, sx + sw - lw + 1, sy, col);
  } else {
    const s = monSeries[4] || monSeries[3];
    for (let k = 1; k < s.length; k++) {
      const x0 = sx + Math.round((k - 1) * (sw - 1) / (s.length - 1)), x1 = sx + Math.round(k * (sw - 1) / (s.length - 1));
      const y0 = sy + 4 + Math.round((15 - s[k - 1]) / 15 * (sh - 8)), y1 = sy + 4 + Math.round((15 - s[k]) / 15 * (sh - 8));
      pixLine(x0, y0, x1, y1, "#1a3a2e");
    }
  }
}
function deskAccessories(key, cx, ty, acc, f) {
  if (key === "midas") {
    const lx = cx - 50, ly = ty;
    R(lx - 1, ly - 16, 7, 3, "#3a4452"); R(lx, ly - 15, 5, 1, acc);
    R(lx + 2, ly - 13, 2, 12, "#2a323e"); R(lx, ly, 6, 2, "#2b3340"); R(lx + 1, ly - 14, 1, 1, "#ffd98a");
    const ux = cx - 40, uy = ty - 3;
    R(ux, uy, 6, 1, "#e8edf2"); R(ux, uy + 1, 6, 5, "#2a323e"); R(ux + 1, uy + 1, 4, 3, "#1a0f0a");
    R(ux + 6, uy + 2, 2, 3, "#2a323e"); R(ux + 1, uy + 5, 4, 1, "#1b222b");
    const st = (f >> 2) % 3;
    R(ux + 1, uy - 2 - (st % 2), 1, 2, "#9aa3ad"); R(ux + 3, uy - 3 - (st === 2 ? 1 : 0), 1, 3, "#c9d1da");
    if (st) R(ux + 5, uy - 2, 1, 2, "#9aa3ad");
    const kx = cx + 28, ky = ty - 1;
    R(kx + 1, ky + 4, 6, 2, "#c4921c"); R(kx, ky + 3, 8, 2, acc); R(kx + 1, ky + 3, 6, 1, "#ffe08a");
    R(kx + 1, ky + 2, 6, 2, "#c4921c"); R(kx, ky + 1, 8, 2, acc); R(kx + 1, ky + 1, 6, 1, "#ffe08a");
    R(kx + 2, ky, 6, 2, "#c4921c"); R(kx + 1, ky - 1, 8, 2, acc); R(kx + 2, ky - 1, 6, 1, "#ffe08a");
    const bx = cx + 42, by = ty - 3;
    R(bx, by, 1, 2, acc); R(bx + 6, by, 1, 2, acc);
    R(bx + 1, by + 1, 5, 3, acc); R(bx + 2, by + 2, 1, 1, "#161c25"); R(bx + 4, by + 2, 1, 1, "#161c25");
    R(bx + 1, by + 4, 2, 2, "#c4921c"); R(bx + 4, by + 4, 2, 2, "#c4921c");
  } else if (key === "hunter") {
    const gx = cx - 36, gy = ty - 8;
    R(gx + 1, gy, 5, 1, acc); R(gx, gy + 1, 1, 5, acc); R(gx + 6, gy + 1, 1, 5, acc); R(gx + 1, gy + 6, 5, 1, acc);
    R(gx + 2, gy + 2, 3, 3, "rgba(180,80,90,.4)"); R(gx + 6, gy + 7, 2, 2, acc); R(gx + 7, gy + 8, 2, 1, acc);
    const nx = cx + 30, ny = ty - 1;
    R(nx, ny, 8, 6, acc); R(nx + 1, ny + 1, 6, 4, "#1a1012"); R(nx + 2, ny + 2, 4, 1, "#6a3038"); R(nx + 2, ny + 4, 3, 1, "#6a3038");
  } else if (key === "scanner") {
    const dx = cx - 38, dy = ty - 10;
    for (let k = 0; k < 10; k++) { const a = -2.8 + k * 0.35; R(dx + 3 + Math.cos(a) * 7, dy + 3 + Math.sin(a) * 4, 1, 1, acc); }
    R(dx + 2, dy + 8, 5, 2, "#2a323e"); R(dx + 3, dy + 2, 2, 7, "#3d8bff"); R(dx + 3, dy + 2, 2, 1, acc);
    const bx = cx + 28, by = ty;
    for (let i = 0; i < 5; i++) R(bx + i * 3, by, 2, 2, ((f >> 2) + i) % 3 ? acc : "#102347");
    R(bx, by + 2, 14, 1, "#1b222b");
  } else if (key === "coach") {
    const cx2 = cx - 36, cy = ty - 6;
    R(cx2, cy, 8, 10, "#c9d1da"); R(cx2 + 1, cy + 1, 6, 8, "#e8edf2"); R(cx2 + 2, cy + 2, 4, 1, "#6c7684"); R(cx2 + 2, cy + 4, 4, 1, "#6c7684"); R(cx2 + 2, cy + 6, 3, 1, "#6c7684");
    const sx = cx + 30, sy = ty - 3;
    R(sx + 2, sy, 5, 1, acc); R(sx + 3, sy + 1, 3, 1, acc); R(sx + 2, sy + 2, 5, 1, acc); R(sx + 1, sy + 3, 7, 4, "#c9d1da"); R(sx + 3, sy + 4, 3, 2, acc);
  } else if (key === "vortex") {
    const ox = cx - 38, oy = ty - 6;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (dx * dx + dy * dy <= 16) R(ox + 4 + dx, oy + 4 + dy, 1, 1, dx * dx + dy * dy > 9 ? acc : "#2a1020");
    R(ox + 4, oy + 4, 2, 2, "#ff8ac8");
    const tx = cx + 30, ty2 = ty - 2;
    R(tx, ty2, 6, 1, "#c9d1da"); R(tx, ty2 + 1, 6, 4, "#3a2040"); R(tx + 1, ty2 + 1, 4, 3, "#1a1018"); R(tx + 6, ty2 + 2, 1, 2, "#3a2040");
  }
}
function deskPremium(cx, top, f, key, i) {
  const acc = ACC[key], midas = key === "midas";
  const mw = midas ? 86 : 76, mh = midas ? 30 : 28, mx = cx - (mw >> 1), my = top - 4, rx = midas ? 54 : 47;
  R(mx, my, mw, mh, "#2a323e"); R(mx, my, mw, 1, acc); R(mx, my + mh - 1, mw, 1, "#1b222b");
  R(mx + 1, my + 1, mw - 2, mh - 2, "#05080d");
  const sx = mx + 3, sy = my + 3, sw = mw - 6, sh = mh - 6;
  if (key === "midas") monMidasScreen(sx, sy, sw, sh, f);
  else if (key === "hunter") monHunter(sx, sy, sw, sh, f);
  else if (key === "scanner") monScanner(sx, sy, sw, sh, f, i);
  else if (key === "coach") monCoach(sx, sy, sw, sh, f);
  else monVortex(sx, sy, sw, sh, f);
  if ((f * 5 + i * 11) % 29 < 2) R(mx + 1, my + 1, mw - 2, mh - 2, "rgba(255,255,255,.06)");
  const sl = (f + i * 7) % (mh + 8); if (sl > 0 && sl < mh - 1) R(mx + 1, my + 1 + sl, mw - 2, 1, "rgba(255,255,255,.05)");
  if (midas && midasBusy() && (f >> 2) % 2 === 0) { R(mx - 1, my - 1, mw + 2, 1, acc); R(mx - 1, my + mh, mw + 2, 1, acc); R(mx - 1, my, 1, mh, acc); R(mx + mw, my, 1, mh, acc); }
  const mb = my + mh;
  R(cx - 1, mb, 2, 5, "#2a323e"); R(cx - 2, mb, 4, 1, "#3a4452");
  const ty = top + 31, th = 5, fy0 = ty + th, fy1 = fy0 + 10;
  const DK = MOB ? {top: "#575c80", hi: "#a3a7d6", skirt: "#2a2d46", leg: "#2c3148", pad: "#6a6f96", padIn: "#2a2e44", ch: "#2a3042", chIn: "#1f2333"}
                 : {top: "#2b3340", hi: "#3a4452", skirt: "#161c25", leg: "#11161d", pad: "#3a4452", padIn: "#161c25", ch: "#1b212a", chIn: "#141920"};
  if (MOB) {   // soft drop shadow on the rug
    for (let y = -5; y <= 5; y++) { const w = ovalW(rx + 4, 5, y); if (w > 0) R(cx - w, fy1 + 7 + y, w * 2 + 1, 1, "rgba(0,0,0,.32)"); }
  }
  for (let y = fy0; y <= fy1; y++) {
    const t = (y - fy0) / (fy1 - fy0);
    let w = rx;
    if (t > 0.5) { const u = (t - 0.5) / 0.5; w = Math.max(16, Math.round(rx * Math.sqrt(Math.max(0, 1 - u * u)))); }
    R(cx - w, y, w * 2 + 1, 1, DK.skirt);
    if (MOB && y === fy1) R(cx - w + 2, y, w * 2 - 3, 1, acc + "99");   // faint glow along the skirt's lower edge
  }
  for (let y = ty; y < ty + th; y++) { const w = ovalW(rx, th / 2, y - (ty + (th - 1) / 2)); if (w > 0) R(cx - w, y, w * 2 + 1, 1, DK.top); }
  { const w = ovalW(rx, th / 2, -th / 2); if (w > 0) R(cx - w, ty, w * 2 + 1, 1, DK.hi); }
  { const w = ovalW(rx, th / 2, (th - 1) / 2); if (w > 0) { R(cx - w, fy0 - 1, w * 2 + 1, 1, DK.hi); R(cx - w + 2, fy0, w * 2 - 3, 1, acc); if (MOB) R(cx - w + 3, fy0 + 1, w * 2 - 5, 1, acc + "88"); } }
  const legX = rx - 12;
  R(cx - legX, fy1 + 1, 5, 11, DK.leg); R(cx + legX - 4, fy1 + 1, 5, 11, DK.leg);
  if (MOB) { R(cx - legX, fy1 + 2, 1, 10, "#41476a"); R(cx + legX - 4, fy1 + 2, 1, 10, "#41476a"); }
  R(cx - legX, fy1 + 1, 5, 1, acc); R(cx + legX - 4, fy1 + 1, 5, 1, acc);
  R(cx - 14, ty + 2, 28, 2, DK.pad); R(cx - 12, ty + 3, 24, 1, DK.padIn);
  deskAccessories(key, cx, ty, acc, f);
  R(cx - 17, top + 36, 4, 14, DK.ch); R(cx + 13, top + 36, 4, 14, DK.ch);
  R(cx - 17, top + 36, 4, 1, acc); R(cx + 13, top + 36, 4, 1, acc);
  R(cx - 16, top + 37, 2, 12, DK.chIn); R(cx + 14, top + 37, 2, 12, DK.chIn);
  R(cx - 20, top + 42, 6, 3, DK.ch); R(cx + 14, top + 42, 6, 3, DK.ch);
  R(cx - 20, top + 42, 6, 1, acc); R(cx + 14, top + 42, 6, 1, acc);
  R(cx - 13, top + 49, 26, 5, DK.ch); R(cx - 13, top + 49, 26, 1, "#252c36");
  R(cx - 2, top + 54, 4, 5, DK.chIn);
  R(cx - 12, top + 59, 24, 2, DK.chIn); R(cx - 1, top + 57, 2, 4, DK.chIn);
  R(cx - 1, top + 59, 2, 1, acc);
}
function deskAt(i, cx, top, f) { deskPremium(cx, top, f, DESK_KEY[i] || "hunter", i); }
let floorC = null;
function floorLayer() {   // the floor (5000 little rects) never changes: drawn once, then copied
  if (!floorC) { floorC = document.createElement("canvas"); floorC.width = W; floorC.height = H; const keep = gt; gt = floorC.getContext("2d");
    const FH = H - 101, FC = W >> 1, FS = 18 + 28*FH/199;
    R(0,101,W,FH,"#100c1e");
    for (let k = 0; k < 14; k++) { const y = 101 + Math.round(Math.pow(k/13,1.5)*FH); R(0,y,W,1,"#1c1840"); }
    for (let k = -12; k <= 12; k++) { const x0 = FC + k*18, x1 = FC + k*FS;
      for (let y = 101; y < H; y += 1) { const t = (y-101)/FH; R(Math.round(x0 + (x1-x0)*t), y, 1, 1, k%2 ? "#252060" : "#1a1860"); } }
    gt = keep; }
  g.drawImage(floorC, 0, 0);
}
const mobileView = () => window.innerWidth <= 700;
const DIG = {"0":"111101101101111","1":"010110010010111","2":"111001111100111","3":"111001111001111","4":"101101111001001","5":"111100111001111","6":"111100111101111","7":"111001001001001","8":"111101111101111","9":"111101111001111"};
function pixText(str, x, y, c) { let cx = x; for (const ch of str) { if (ch === ":") { R(cx, y+1, 1, 1, c); R(cx, y+3, 1, 1, c); cx += 2; continue; }
  if (ch === ".") { R(cx, y+4, 1, 1, c); cx += 2; continue; }
  if (ch === "x" || ch === "X") { R(cx, y, 1, 1, c); R(cx+2, y, 1, 1, c); R(cx+1, y+1, 1, 1, c); R(cx, y+2, 1, 1, c); R(cx+2, y+2, 1, 1, c); R(cx, y+4, 1, 1, c); R(cx+2, y+4, 1, 1, c); R(cx+1, y+3, 1, 1, c); cx += 4; continue; }
  const m = DIG[ch]; if (!m) continue; for (let i = 0; i < 15; i++) if (m[i] === "1") R(cx + i%3, y + (i/3|0), 1, 1, c); cx += 4; } }
function drawWallExtras() {   // phones only: token coins (clock, neon and the order book are already drawn in the room)
  const pal = ["#ffb52e","#3fe0a0","#3d8bff","#ff4fa8","#a98bff","#ff6b4a"], tk = (D && D.tokens) || [];
  tk.slice(0, 6).forEach((q, i) => { const cx = MOB ? ML.coins + i*ML.coinStep : 392 + i*15, cy = 12; for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) { const r2 = dx*dx + dy*dy; if (r2 <= 36) R(cx+dx, cy+dy, 1, 1, r2 > 20 ? "#e9edf1" : pal[i % 6]); } });
}
// left wall board: a framed candlestick board running the whole length of the wall, in perspective (taller at the room edge, shorter towards the back wall)
const LB = {x0: 2, x1: 36, tl: 24, bl: 128, tr: 36, br: 114};
function lbTop(x) { return LB.tl + (LB.tr - LB.tl)*(x - LB.x0)/(LB.x1 - LB.x0); }
function lbBot(x) { return LB.bl + (LB.br - LB.bl)*(x - LB.x0)/(LB.x1 - LB.x0); }
function leftBoard(f) {
  for (let x = LB.x0; x <= LB.x1; x++) { const t = Math.round(lbTop(x)), b = Math.round(lbBot(x)); R(x, t, 1, b - t + 1, "#05080d"); R(x, t, 1, 1, "#4a596e"); R(x, b, 1, 1, "#2a3441"); }
  for (let y = Math.round(lbTop(LB.x0)); y <= Math.round(lbBot(LB.x0)); y++) R(LB.x0, y, 1, 1, "#3a475a");
  for (let y = Math.round(lbTop(LB.x1)); y <= Math.round(lbBot(LB.x1)); y++) R(LB.x1, y, 1, 1, "#2a3441");
  let cs = (D && D.equity && D.equity.length > 2) ? candlesFrom(D.equity, 7).slice(-7) : [];
  if (!cs.length) cs = Array.from({length: 7}, (_, k) => { const o = 10 + ((k*5) % 6), c = o + (((k*7) % 5) - 2); return {o, c, h: Math.max(o, c) + 2, l: Math.min(o, c) - 2}; });
  const lo = Math.min(...cs.map(c => c.l)), hi = Math.max(...cs.map(c => c.h)), sp = (hi - lo) || 1;
  cs.forEach((c, k) => { const cx = 6 + k*4, last = k === cs.length - 1, up = c.c >= c.o, col = up ? "#2fcf8f" : "#ff5468", dim = up ? "#1f8a62" : "#a83242";
    for (let x = cx; x < cx + 3; x++) { const top = lbTop(x) + 6, bot = lbBot(x) - 16, Yv = v => Math.round(bot - (v - lo)/sp*(bot - top));
      if (x === cx + 1) R(x, Yv(c.h), 1, Yv(c.l) - Yv(c.h) + 1, dim);
      const t = Yv(Math.max(c.o, c.c)) - ((last && (f >> 3) % 2) ? 1 : 0), b = Yv(Math.min(c.o, c.c)); R(x, t, 1, Math.max(1, b - t + 1), col); } });
  for (let k = 0; k < 12; k++) { const x = 6 + (k % 4)*7, y = Math.round(lbBot(x)) - 12 + (k >> 2)*3; R(x, y, 5, 2, ((k + (f >> 5)) % 3) ? "#7a1f2b" : "#1f6b4c"); }
}

function drawLounge(f) {
  const cx = 240, cy = 274;
  // electric-blue round rug with a vivid glowing edge
  const glow = ((f >> 3) % 2) ? "#00b4ff" : "#1e90ff";
  for (let y = -20; y <= 20; y++) {
    const w = ovalW(64, 20, y); if (w > 1) R(cx - w, cy + y, w * 2 + 1, 1, "#082c66");
  }
  for (let y = -16; y <= 16; y++) {
    const w = ovalW(54, 16, y); if (w > 1) R(cx - w, cy + y, w * 2 + 1, 1, "#0d4aa0");
  }
  for (let y = -10; y <= 10; y++) {
    const w = ovalW(36, 10, y); if (w > 1) R(cx - w, cy + y, w * 2 + 1, 1, "#1560c0");
  }
  for (let y = -20; y <= 20; y++) {
    const w = ovalW(64, 20, y), wi = ovalW(61, 18, y);
    if (w > 1) { R(cx - w, cy + y, Math.max(1, w - Math.max(0, wi) + 1), 1, glow); R(cx + Math.max(0, wi) - 1, cy + y, Math.max(1, w - Math.max(0, wi) + 1), 1, glow); }
  }
  // oval / wraparound sofa: elliptical C around the table, with a raised backrest
  const sx = 240, sy = 262;
  const colSeat = (y) => y < sy - 4 ? "#1c1a66" : (y < sy + 4 ? "#18165c" : "#12123e");
  // raised curved backrest (sits behind the character, clear of the front desks)
  for (let y = -24; y <= -8; y++) {
    const w = ovalW(50, 20, y);
    if (w > 8) R(sx - w, sy + y, w * 2 + 1, 1, y < -20 ? "#3a3888" : (y < -14 ? "#282670" : "#1a1860"));
  }
  { const w = ovalW(50, 20, -24); if (w > 0) R(sx - w, sy - 24, w * 2 + 1, 1, "#5a58b0"); }
  // front face of the backrest (gives it thickness)
  for (let y = -10; y <= -7; y++) {
    const w = ovalW(48, 18, y);
    if (w > 8) R(sx - w, sy + y, w * 2 + 1, 1, "#14144a");
  }
  // piping on the backrest lip
  { const w = ovalW(46, 16, -8); if (w > 8) R(sx - w, sy - 8, w * 2 + 1, 1, "#00b4ff"); }
  // two back cushions
  for (let y = 0; y <= 5; y++) {
    const w = ovalW(15, 5, y - 2);
    if (w > 3) {
      R(sx - 22 - w + 15, sy - 16 + y, w * 2, 1, y === 0 ? "#4a48a0" : "#2e2c78");
      R(sx + 7 + 15 - w, sy - 16 + y, w * 2, 1, y === 0 ? "#4a48a0" : "#2e2c78");
    }
  }
  // seat: solid under the sitter, then sides wrapping forward around the table
  for (let y = -8; y <= 14; y++) {
    const wo = ovalW(56, 18, y), wi = ovalW(34, 11, y);
    const yy = sy + y, c = colSeat(yy);
    if (wo < 4) continue;
    if (y <= 6) R(sx - wo, yy, wo * 2 + 1, 1, c);                  // filled seat
    else if (wi > 2) {
      const bw = Math.max(7, wo - wi + 1);
      R(sx - wo, yy, bw, 1, c); R(sx + wo - bw + 1, yy, bw, 1, c);  // arms
    }
  }
  // slim piping on the inner arms only (not a full neon ring)
  for (let y = 6; y <= 11; y++) {
    const wi = ovalW(34, 11, y); if (wi > 3) { R(sx - wi, sy + y, 2, 1, "#00b4ff"); R(sx + wi - 1, sy + y, 2, 1, "#00b4ff"); }
  }
  // rounded arm caps at the front ends of the C
  for (let y = 0; y <= 8; y++) {
    const w = ovalW(8, 6, y - 4);
    if (w > 1) {
      R(sx - 42 - w, sy + 8 + y, w * 2 + 1, 1, y < 2 ? "#2e2c78" : "#1a1860");
      R(sx + 42 - w, sy + 8 + y, w * 2 + 1, 1, y < 2 ? "#2e2c78" : "#1a1860");
    }
  }
  R(sx - 46, sy + 10, 6, 1, "#00b4ff"); R(sx + 40, sy + 10, 6, 1, "#00b4ff");
  // round coffee table, slate top, two readable mugs with steam
  const tx = 240, ty = 281;
  for (let y = 1; y <= 5; y++) { const w = ovalW(20, 6, y - 1); if (w > 2) R(tx - w, ty + 2 + y, w * 2 + 1, 1, "#12161e"); }
  for (let y = -3; y <= 3; y++) { const w = ovalW(20, 6, y); if (w > 2) R(tx - w, ty + y, w * 2 + 1, 1, "#2a3340"); }
  { const w = ovalW(20, 6, -3); if (w > 0) R(tx - w, ty - 3, w * 2 + 1, 1, "#4a5568"); }
  { const w = ovalW(16, 4, 0); if (w > 2) R(tx - w, ty, w * 2 + 1, 1, "#222a36"); }
  // mug left (coffee), mug right (lighter)
  R(228, ty - 7, 6, 1, "#d5dde6"); R(228, ty - 6, 6, 4, "#c8a070"); R(229, ty - 6, 4, 3, "#3a2010"); R(234, ty - 4, 2, 2, "#c8a070");
  R(247, ty - 7, 6, 1, "#e8edf2"); R(247, ty - 6, 6, 4, "#6a8ccc"); R(248, ty - 6, 4, 3, "#1a2040"); R(253, ty - 4, 2, 2, "#6a8ccc");
  if ((f >> 2) % 2 === 0) { R(230, ty - 10, 1, 2, "#c9d1da"); R(232, ty - 11, 1, 2, "#c9d1da"); R(249, ty - 10, 1, 2, "#c9d1da"); R(251, ty - 11, 1, 2, "#c9d1da"); }
  // floor lamp, clearly left of the plant, warm shade
  const lx = MOB ? 322 : 154, ly = 270;
  R(lx, ly - 32, 11, 2, "#3a4452"); R(lx - 1, ly - 30, 13, 5, "#4a5568"); R(lx + 1, ly - 29, 9, 3, "#ffd98a"); R(lx + 2, ly - 28, 7, 2, "#ffe9b0");
  R(lx + 5, ly - 25, 2, 24, "#2a323e"); R(lx + 2, ly - 1, 8, 2, "#1a2030"); R(lx + 3, ly, 6, 1, "#0e1420");
  if ((f >> 2) % 2 === 0) { R(lx + 1, ly - 24, 9, 1, "rgba(255,217,138,.4)"); R(lx + 2, ly - 23, 7, 1, "rgba(255,217,138,.2)"); }
  // tall plant in a sleek metallic pot, left of the sofa
  const px = 186, py = 270;
  R(px - 5, py, 11, 8, "#1a2038"); R(px - 4, py, 9, 1, "#4a5a80"); R(px - 4, py + 7, 9, 1, "#0e1424"); R(px - 3, py + 1, 7, 5, "#151c30");
  R(px - 1, py - 24, 2, 24, "#2f6b3a");
  [[-9,-16],[-11,-9],[-5,-22],[4,-20],[7,-13],[-7,-7],[6,-6],[0,-18],[8,-18],[-10,-13]].forEach(([dx, dy], i) => {
    R(px + dx, py + dy, 7, 4, i % 2 ? "#3f8a48" : "#2f6b3a"); R(px + dx + 1, py + dy, 2, 1, "#5fb066");
  });
  // monstera-like plant in a matching pot, right
  const mx = MOB ? 302 : 306, my = 268;
  R(mx - 6, my, 13, 8, "#1a2038"); R(mx - 5, my, 11, 1, "#4a5a80"); R(mx - 5, my + 7, 11, 1, "#0e1424"); R(mx - 4, my + 1, 9, 5, "#151c30");
  R(mx, my - 20, 2, 20, "#2f6b3a");
  [[-11,-9,9,6],[-9,-16,8,6],[3,-18,9,6],[7,-10,8,5],[-4,-13,7,5],[4,-6,7,4],[-12,-4,7,4],[8,-15,6,5]].forEach(([dx, dy, w, h], i) => {
    R(mx + dx, my + dy, w, h, i % 2 ? "#3f8a48" : "#2a7a3e");
    R(mx + dx + 2, my + dy + 1, 1, Math.max(1, h - 1), "#1a4022");
    R(mx + dx + 1, my + dy, 2, 1, "#5fb066");
  });
}


// ---------- floor extras (neon, window, rocket, espresso, arcade, fridge) ----------
const GLYPH5 = {
  P: ["11110","10001","10001","11110","10000","10000","10000"],
  U: ["10001","10001","10001","10001","10001","10001","01110"],
  L: ["10000","10000","10000","10000","10000","10000","11111"],
  S: ["01111","10000","10000","01110","00001","00001","11110"],
  E: ["11111","10000","10000","11110","10000","10000","11111"]
};
function parisHour() {
  if (typeof window !== "undefined" && window.__pulseHour != null) return window.__pulseHour;
  try { return +new Intl.DateTimeFormat("en-GB", {timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23"}).format(new Date()); }
  catch (e) { return new Date().getHours(); }
}
function skyMode() {
  if (typeof window !== "undefined" && window.__pulseSky) return window.__pulseSky;
  const h = parisHour();
  if (h >= 20 || h < 7) return "night";
  if (h < 9) return "dawn";
  if (h >= 17) return "dusk";
  return "day";
}
function drawGlyph5(ch, x, y, sc, col) {
  const g5 = GLYPH5[ch]; if (!g5) return;
  for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) if (g5[j][i] === "1") R(x + i * sc, y + j * sc, sc, sc, col);
}
function drawNeonPulse(x, y, f) {
  const word = "PULSE", sc = 2, gap = 3;
  const cols = ["#ff4fa8", "#3d8bff", "#ff4fa8", "#3d8bff", "#ff4fa8"];
  const glow = ["#6a2150", "#163a7a", "#6a2150", "#163a7a", "#6a2150"];
  const lite = ["#ffb0d8", "#9cc8ff", "#ffb0d8", "#9cc8ff", "#ffb0d8"];
  const flick = ((f >> 3) % 11) === 0;
  let cx = x;
  for (let i = 0; i < word.length; i++) {
    const on = !flick || i !== (f >> 4) % 5;
    const c = on ? cols[i] : glow[i], gcol = glow[i], hi = on ? lite[i] : c;
    // halo
    drawGlyph5(word[i], cx - 1, y, sc, gcol); drawGlyph5(word[i], cx + 1, y, sc, gcol);
    drawGlyph5(word[i], cx, y - 1, sc, gcol); drawGlyph5(word[i], cx, y + 1, sc, gcol);
    drawGlyph5(word[i], cx, y, sc, c);
    if (on && ((f + i) >> 2) % 5 !== 0) drawGlyph5(word[i], cx, y, sc, hi);
    cx += 5 * sc + gap;
  }
  // thin tube under the sign
  R(x - 2, y + 16, cx - x + 2, 1, ((f >> 4) % 2) ? "#7a6cff" : "#3d8bff");
  R(x - 3, y - 2, 2, 20, "#2a2460"); R(cx + 1, y - 2, 2, 20, "#2a2460");
}
function drawCityWindow(x, y, w, h, f) {
  const mode = skyMode();
  const sky = mode === "night" ? ["#0a1020", "#12183a", "#1a1450"]
    : mode === "dawn" ? ["#4a2a48", "#c07060", "#e8b080"]
    : mode === "dusk" ? ["#1a1440", "#6a3060", "#e87840"]
    : ["#5aa0e8", "#7ec4f0", "#c8e8ff"];
  // frame + recess
  R(x - 3, y - 3, w + 6, h + 8, "#2a2460");
  R(x - 2, y - 2, w + 4, h + 6, "#4a3a88");
  R(x - 1, y - 1, w + 2, h + 3, "#1a1630");
  // sky gradient
  for (let i = 0; i < h; i++) {
    const t = i / (h - 1);
    const stop = t < 0.45 ? 0 : t < 0.75 ? 1 : 2;
    const t2 = stop === 0 ? t / 0.45 : stop === 1 ? (t - 0.45) / 0.3 : (t - 0.75) / 0.25;
    const a = sky[stop], b = sky[Math.min(2, stop + 1)];
    const parse = c => [parseInt(c.slice(1,3),16), parseInt(c.slice(3,5),16), parseInt(c.slice(5,7),16)];
    const A = parse(a), B = parse(b);
    const mix = k => Math.round(A[k] + (B[k] - A[k]) * Math.min(1, t2));
    R(x, y + i, w, 1, "rgb("+mix(0)+","+mix(1)+","+mix(2)+")");
  }
  // sun / moon (small discs)
  const disc = (cx, cy, r, c) => { for (let dy = -r; dy <= r; dy++) { const ww = Math.round(Math.sqrt(Math.max(0, r*r - dy*dy))); if (ww) R(cx - ww, cy + dy, ww * 2 + 1, 1, c); } };
  if (mode === "day") { disc(x + w - 12, y + 12, 5, "#ffe58a"); disc(x + w - 12, y + 12, 3, "#fff4c0"); }
  if (mode === "dawn" || mode === "dusk") { disc(x + w - 14, y + 20, 5, "#ffb060"); disc(x + w - 13, y + 19, 3, "#ffd090"); }
  if (mode === "night") {
    disc(x + w - 13, y + 12, 4, "#e8eef8"); disc(x + w - 12, y + 11, 2, "#ffffff");
    for (let k = 0; k < 10; k++) { const sx = x + 4 + ((k * 13 + 5) % (w - 8)), sy = y + 3 + ((k * 7) % 16);
      if (((f >> 4) + k) % 5 !== 0) R(sx, sy, 1, 1, k % 3 ? "#d0d8f0" : "#8aa0d0"); }
  }
  // skyline (silhouettes), deterministic
  const blds = [[0,38,12],[10,28,10],[18,44,14],[30,22,8],[36,34,11],[46,18,8]];
  blds.forEach(([bx, bh, bw], n) => {
    const by = y + h - bh, col = mode === "day" ? (n % 2 ? "#3a5070" : "#2a4060") : (n % 2 ? "#12101c" : "#0c0a16");
    R(x + bx, by, bw, bh, col);
    R(x + bx, by, bw, 1, mode === "day" ? "#4a6080" : "#1a1630");
    // windows
    for (let wy = by + 3; wy < y + h - 3; wy += 5) for (let wx = x + bx + 2; wx < x + bx + bw - 2; wx += 3) {
      const lit = mode === "day" ? false : ((wx * 13 + wy * 7 + n) % (mode === "night" ? 3 : 5) === 0);
      R(wx, wy, 2, 2, lit ? (((f + wx + wy) >> 5) % 9 === 0 ? "#8a6a30" : "#ffd98a") : (mode === "day" ? "#8ab0d0" : "#1a1828"));
    }
  });
  // mullions
  R(x + (w >> 1) - 1, y, 2, h, "rgba(42,36,96,.7)");
  R(x, y + Math.round(h * 0.42), w, 2, "rgba(42,36,96,.7)");
  R(x, y, w, 1, "rgba(200,210,255,.25)"); R(x, y, 1, h, "rgba(200,210,255,.2)");
  // sill
  R(x - 4, y + h + 3, w + 8, 3, "#2a2460"); R(x - 3, y + h + 3, w + 6, 1, "#7a6cff");
}

function drawFish(x, y, dir, col) {
  const s = dir < 0 ? -1 : 1, body = s > 0 ? x : x - 4;
  R(body, y, 5, 3, col); R(body + 1, y - 1, 3, 1, col);
  const tx = s > 0 ? body - 2 : body + 5;
  R(tx, y, 2, 1, col); R(tx + (s > 0 ? 0 : 1), y + 1, 1, 1, col); R(tx, y + 2, 2, 1, col);
  const ex = s > 0 ? body + 3 : body + 1;
  R(ex, y, 1, 1, "#ffffff"); R(ex, y + 1, 1, 1, "#101318");
}
function drawAquarium(ax, ay, f) {
  const w = 80, th = 46, stand = 8;
  // sleek stand + a soft teal floor glow
  R(ax + 4, ay + th + stand, w - 8, 2, "rgba(0,180,255,.18)");
  R(ax + 8, ay + th, w - 16, stand, "#151c2c"); R(ax + 10, ay + th, w - 20, 1, "#3a4a70");
  R(ax + 12, ay + th + stand - 2, w - 24, 2, "#0e1420");
  // metal frame + inner glow
  R(ax, ay, w, th, "#2a3348"); R(ax + 1, ay + 1, w - 2, th - 2, ((f >> 3) % 2) ? "#00b4ff" : "#1e90ff");
  R(ax + 2, ay + 2, w - 4, th - 4, "#072c48");
  // water, darker toward the sand
  for (let i = 0; i < th - 8; i++) {
    const t = i / (th - 9);
    const r = Math.round(8 + t * 6), g = Math.round(70 - t * 20), b = Math.round(110 - t * 20);
    R(ax + 3, ay + 3 + i, w - 6, 1, "rgb("+r+","+g+","+b+")");
  }
  // sand + pebbles
  R(ax + 3, ay + th - 8, w - 6, 5, "#c8b07a"); R(ax + 3, ay + th - 8, w - 6, 1, "#d8c894");
  const pebs = [[6,2,"#8a7060"],[14,1,"#b89070"],[22,2,"#6a6058"],[30,1,"#c4a070"],[40,2,"#7a6860"],[52,1,"#d0b090"],[62,2,"#8a7868"],[70,1,"#b89878"]];
  pebs.forEach(([px, py, c]) => R(ax + px, ay + th - 6 + py, 3, 2, c));
  // seaweed, slight sway
  const sway = (k, mid) => mid + Math.round(Math.sin((f / 10) + k * 1.3) * 1);
  [[8,13,0],[24,16,1],[52,11,2],[70,15,3]].forEach(([bx, ht, k]) => {
    for (let i = 0; i < ht; i++) {
      const xx = ax + sway(k, bx) + Math.round(Math.sin((f / 8) + k + i / 3) * (i > 6 ? 1 : 0));
      R(xx, ay + th - 8 - i, 2, 1, i % 3 ? "#1f8a4a" : "#2f6b3a");
    }
  });
  // rising bubbles
  for (let k = 0; k < 7; k++) {
    const bx = ax + 8 + (k * 11 + 3) % (w - 16);
    const by = ay + th - 10 - ((f * (1 + k % 3) + k * 9) % (th - 16));
    R(bx, by, k % 2 ? 2 : 1, k % 2 ? 2 : 1, "rgba(200,230,255,.7)");
  }
  // colourful fish, ping-pong at different speeds so they stay spread out
  const fish = [
    {c: "#ff8a2a", lane: 7,  spd: 1.1, ph: 78},
    {c: "#ffd93a", lane: 14, spd: 0.7, ph: 106},
    {c: "#ff4fa8", lane: 20, spd: 1.3, ph: 94},
    {c: "#3d8bff", lane: 10, spd: 0.9, ph: 6},
    {c: "#7cff4a", lane: 16, spd: 0.6, ph: 30}
  ];
  const span = w - 22;
  fish.forEach(fi => {
    const cyc = span * 2;
    let m = (f * fi.spd + fi.ph) % cyc; if (m < 0) m += cyc;
    const going = m < span, off = going ? m : cyc - m;
    const fy = ay + 6 + (nowAct("feed") ? Math.max(4, fi.lane - 10) : fi.lane);
    drawFish(ax + 10 + Math.round(off), fy, going ? 1 : -1, fi.c);
  });
  // glass highlights + slim lid lamp
  R(ax + 3, ay + 3, 2, th - 10, "rgba(200,230,255,.18)"); R(ax + 3, ay + 3, w - 8, 1, "rgba(200,230,255,.22)");
  R(ax + 8, ay - 3, w - 16, 3, "#2a3348"); R(ax + 20, ay - 2, w - 40, 1, "#7ec8ff");
}
function drawOrderBook(x, y, w, h, f) {
  R(x, y, w, h, "#2a2460"); R(x + 1, y + 1, w - 2, h - 2, "#0c0818");
  R(x + 2, y + 2, w - 4, 7, "#14102a");
  // tiny header pips (asks / bids), no lettering on the wall
  R(x + 4, y + 4, 4, 3, "#ff5468"); R(x + w - 8, y + 4, 4, 3, "#2fcf8f");
  const mid = y + 8 + Math.floor((h - 14) / 2);
  R(x + 2, mid, w - 4, 1, "#4a3a88");
  R(x + (w >> 1) - 3, mid - 1, 6, 3, "#ffb52e"); // last price
  const rows = 5, maxW = w - 10;
  for (let i = 0; i < rows; i++) {
    const pulse = 0.55 + 0.45 * Math.sin(f / 7 + i * 1.35);
    const far = 0.35 + i * 0.12;
    const bw = Math.max(6, Math.round(maxW * far * pulse));
    const yy = mid - 5 - i * 5;
    if (yy > y + 8) R(x + w - 3 - bw, yy, bw, 3, i === 0 && (f % 10) < 3 ? "#ff8a9a" : "#ff5468");
  }
  for (let i = 0; i < rows; i++) {
    const pulse = 0.55 + 0.45 * Math.sin(f / 6 + i * 1.7 + 2);
    const far = 0.4 + i * 0.11;
    const bw = Math.max(6, Math.round(maxW * far * pulse));
    const yy = mid + 3 + i * 5;
    if (yy + 3 < y + h - 2) R(x + 3, yy, bw, 3, i === 0 && (f % 8) < 3 ? "#9dffd6" : "#2fcf8f");
  }
}
function drawWallClock(x, y, f) {
  R(x, y, 44, 18, "#2a2460"); R(x + 1, y + 1, 42, 16, "#080614"); R(x, y, 44, 1, "#7a6cff");
  const t = hhmm(Date.now() / 1000);
  pixText(t, x + 13, y + 6, (f >> 4) % 2 ? "#3fe0a0" : "#2fcf8f");
}

function drawEspresso(x, y, f) {

  // compact chrome machine, drip + filling cup + steam
  R(x, y + 22, 26, 3, "#141920"); // feet / tray shadow
  R(x + 1, y + 4, 22, 18, "#2a323e"); R(x + 1, y + 4, 22, 1, "#8a96a8"); R(x + 2, y + 5, 20, 16, "#1a2029");
  R(x + 3, y, 18, 5, "#3a4452"); R(x + 3, y, 18, 1, "#c9d1da"); R(x + 8, y - 3, 8, 3, "#2a323e"); R(x + 9, y - 2, 6, 1, "#1a2029"); // hopper
  // group head + portafilter
  R(x + 8, y + 9, 8, 3, "#8a96a8"); R(x + 10, y + 12, 4, 3, "#6a7688"); R(x + 6, y + 14, 8, 2, "#8a96a8"); R(x + 4, y + 13, 3, 3, "#3a4452");
  // drip tray
  R(x + 3, y + 20, 18, 3, "#2a323e"); R(x + 4, y + 20, 16, 1, "#4a5568");
  // cup
  const fill = nowAct("coffee") ? Math.min(5, 2 + ((f >> 2) % 4)) : Math.min(5, ((f % 90) < 70) ? Math.floor(((f % 90) / 70) * 6) : 5);
  R(x + 9, y + 16, 8, 6, "#e8edf2"); R(x + 17, y + 18, 3, 3, "#e8edf2"); // handle
  R(x + 10, y + 17, 6, 4, "#d5dde6");
  if (fill > 0) R(x + 10, y + 21 - fill, 6, fill, "#3a2010");
  // drip
  if ((f % 90) < 70 && (f % 4) < 2) R(x + 12, y + 15, 1, 2, "#c8a070");
  // steam when the cup is at least half full
  if (fill >= 3 && (f >> 2) % 2 === 0) { R(x + 11, y + 12, 1, 2, "#c9d1da"); R(x + 13, y + 10, 1, 2, "#c9d1da"); R(x + 15, y + 12, 1, 2, "#c9d1da"); }
  // tiny status light
  R(x + 19, y + 6, 2, 2, (f >> 3) % 2 ? "#3fe0a0" : "#1f8a62");
}
function drawArcade(x, y, f) {
  R(x, y + 46, 20, 4, "#141920");
  R(x + 1, y + 10, 18, 36, "#1a1030"); R(x + 1, y + 10, 18, 1, "#7a6cff"); R(x + 1, y + 45, 18, 1, "#120c22");
  // marquee
  R(x, y, 20, 11, "#2a1860"); R(x, y, 20, 1, "#ff4fa8"); R(x + 2, y + 3, 16, 6, "#0c0818");
  const play = nowAct("arcade"), blink = play ? (f % 2) : (f >> 2) % 2;
  R(x + 4, y + 4, 3, 2, blink ? "#ff4fa8" : "#3d8bff"); R(x + 8, y + 5, 4, 2, blink ? "#3d8bff" : "#ffb52e"); R(x + 13, y + 4, 3, 2, blink ? "#3fe0a0" : "#ff4fa8");
  // screen
  R(x + 3, y + 14, 14, 16, "#05080d");
  const sc = (play ? f : (f >> 2)) % 6;
  R(x + 5, y + 20, 10, 2, sc < 3 ? "#3d8bff" : "#1a3a7a");
  R(x + 7, y + 16 + (sc % 3) * 3, 2, 2, "#ffb52e");
  R(x + 10, y + 24, 4, 1, "#3fe0a0");
  // controls
  R(x + 4, y + 32, 5, 3, "#2a2460"); R(x + 5, y + 32, 3, 2, "#ff4b55");
  R(x + 12, y + 32, 4, 4, "#3d8bff"); R(x + 13, y + 33, 2, 2, "#9cc8ff");
  R(x + 3, y + 38, 14, 2, "#141020");
}
function drawFridge(x, y, f) {
  R(x, y + 38, 22, 3, "#141920");
  R(x, y, 20, 38, "#1a2030"); R(x, y, 20, 1, "#4a5568"); R(x + 1, y + 1, 18, 36, "#0c1018");
  // glowing interior
  const glow = (f >> 3) % 2 ? "#1e90ff" : "#00b4ff";
  R(x + 3, y + 4, 14, 28, "#082448"); R(x + 3, y + 4, 14, 1, glow);
  R(x + 3, y + 4, 1, 28, glow); R(x + 16, y + 4, 1, 28, glow);
  // shelves + cans
  R(x + 4, y + 12, 12, 1, "#163a70"); R(x + 4, y + 22, 12, 1, "#163a70");
  const cans = [["#ff4b55",5,7],["#3fe0a0",10,7],["#ffb52e",5,15],["#3d8bff",10,15],["#ff4fa8",5,25],["#d5dde6",10,25]];
  cans.forEach(([c, cx, cy]) => { R(x + cx, y + cy, 4, 5, c); R(x + cx, y + cy, 4, 1, "#e8edf2"); R(x + cx + 1, y + cy + 1, 2, 2, "rgba(255,255,255,.35)"); });
  // door handle + blue edge light (door swings open when someone grabs a can)
  if (nowAct("fridge")) {
    R(x + 20, y + 2, 8, 34, "#1a2030"); R(x + 21, y + 3, 6, 32, "#0c1018");
    R(x + 26, y + 14, 2, 10, "#8a96a8");
    R(x - 6, y + 30, 18, 8, "rgba(0,180,255,.22)"); R(x - 4, y + 28, 12, 4, "rgba(30,144,255,.28)");
    R(x, y + 2, 1, 34, glow);
  } else {
    R(x + 18, y + 14, 2, 10, "#8a96a8");
    R(x, y + 2, 1, 34, glow);
  }
}
function rocketPos() {
  if (rocketPhase <= 0) return {x: ROCKET_PAD.x, y: ROCKET_PAD.y};
  if (rocketPhase > ROCKET_FLY) return {x: ROCKET_PAD.x, y: -80};
  const t = rocketPhase / ROCKET_FLY, e = t * t;
  // drift right as it rises so it passes the aisle, not through Coach's desk
  return {x: ROCKET_PAD.x + Math.round(t * 50), y: ROCKET_PAD.y - Math.round(e * (ROCKET_PAD.y + 24))};
}
function rocketY() { return rocketPos().y; }
function drawRocket(f) {
  const pad = ROCKET_PAD, px0 = pad.x, py = pad.y;
  // launch pad always stays
  R(px0 - 14, py + 2, 28, 8, "#161c25"); R(px0 - 14, py + 2, 28, 1, "#4a3a88");
  R(px0 - 16, py + 8, 32, 3, "#0e1218"); R(px0 - 10, py + 1, 20, 1, "#7a6cff");
  R(px0 - 6, py, 12, 2, "#2a2460");
  if (rocketPhase > ROCKET_FLY) return; // hidden between landing and respawn
  const {x: px, y} = rocketPos();
  const flying = rocketPhase > 0;
  // body
  R(px - 3, y - 22, 7, 22, "#e8edf2"); R(px - 2, y - 22, 5, 1, "#ffffff"); R(px - 3, y - 22, 1, 22, "#c9d1da");
  R(px - 1, y - 28, 3, 6, "#ff4b55"); R(px, y - 30, 1, 3, "#ff4b55"); // nose
  R(px - 2, y - 16, 5, 3, "#3d8bff"); R(px - 1, y - 15, 3, 1, "#9cc8ff"); // window
  R(px - 6, y - 6, 4, 7, "#d5dde6"); R(px + 3, y - 6, 4, 7, "#d5dde6"); // fins
  R(px - 6, y - 2, 4, 2, "#ff4b55"); R(px + 3, y - 2, 4, 2, "#ff4b55");
  R(px - 2, y, 5, 2, "#8a96a8");
  if (flying) {
    const fl = (f % 3);
    R(px - 2, y + 2, 5, 5 + fl, fl ? "#ffb52e" : "#ff7a2a");
    R(px - 1, y + 3, 3, 6 + fl, "#ffe9b0");
    R(px, y + 4, 1, 5 + fl, "#ffffff");
    // smoke
    for (let k = 0; k < 5; k++) {
      const sy = y + 10 + k * 5 + ((f + k) % 3), sx = px - 4 + ((f + k * 3) % 7);
      R(sx, sy, 3 + (k % 2), 2, k % 2 ? "rgba(180,190,210,.45)" : "rgba(90,100,130,.4)");
    }
  } else if ((f % 6) < 3) {
    R(px - 2, py + 1, 5, 1, "#7a6cff"); // idle pad light
  }
}

// rig4-20261121 (phones): a real 3D mining rig standing on the floor along the left wall, under the candlestick board.
// Long axis runs along the wall (near end bottom-left, far end towards the back), we see its room-side face (GPUs), its top and its near end.
const RIG = {p0: [4, 208], A: [44, -40], B: [20, 6], h: 46};
let rigStatic = null, rigTex = null;
function rigPolyCols(pts, fn) {   // rasterise a convex polygon column by column (crisp pixels)
  const xs = pts.map(p => p[0]), x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs));
  for (let x = x0; x <= x1; x++) { let lo = 1e9, hi = -1e9; const xc = x + 0.5;
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length];
      if ((xc - a[0]) * (xc - b[0]) <= 0 && a[0] !== b[0]) { const y = a[1] + (b[1] - a[1]) * (xc - a[0]) / (b[0] - a[0]); lo = Math.min(lo, y); hi = Math.max(hi, y); } }
    if (hi >= lo) fn(x, Math.round(lo), Math.round(hi)); } }
function rigFaceTex(f) {   // the room-side face, flat: 44x46, three GPUs with two fans each, LED strip, hash bars
  const w = 44, h = 46; if (!rigTex) { rigTex = document.createElement("canvas"); rigTex.width = w; rigTex.height = h; }
  const keep = gt; gt = rigTex.getContext("2d"); gt.clearRect(0, 0, w, h);
  R(0, 0, w, h, "#2b3340"); R(1, 1, w - 2, h - 2, "#070a10"); R(0, 0, w, 1, "#5a6678");
  for (let i = 0; i < 7; i++) R(3 + i * 6, 2, 3, 1, ((f >> 2) + i) % 7 ? (i % 2 ? "#3d8bff" : "#3fe0a0") : "#14202c");
  for (let c = 0; c < 3; c++) { const cx = 2 + c * 14, cy = 5, hot = ((f >> 3) + c) % 9 === 0;
    R(cx, cy, 12, 31, "#1b222b"); R(cx, cy, 12, 1, c % 2 ? "#a98bff" : "#38d6c9"); R(cx + 11, cy, 1, 31, "#0b0e13");
    for (let k = 0; k < 2; k++) { const fx = cx + 6, fy = cy + 8 + k * 14;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const r2 = dx * dx + dy * dy;
        if (r2 <= 25 && r2 > 16) R(fx + dx, fy + dy, 1, 1, "#2a323e"); else if (r2 <= 16) R(fx + dx, fy + dy, 1, 1, "#0c1117"); }
      const a0 = f * 0.9 + c * 0.7 + k * 1.3;
      for (let bl = 0; bl < 3; bl++) { const an = a0 + bl * 2.094; for (let r = 1; r <= 3; r++) R(fx + Math.round(Math.cos(an) * r), fy + Math.round(Math.sin(an) * r), 1, 1, r === 3 ? "#6c7684" : "#9aa4af"); }
      R(fx, fy, 1, 1, hot ? "#ffb52e" : "#3fe0a0"); }
    R(cx + 2, cy + 29, 2, 1, ((f >> 1) + c * 3) % 5 < 2 ? "#3fe0a0" : "#0f3a2a"); R(cx + 8, cy + 29, 2, 1, hot ? "#ff5468" : "#1f6b4c"); }
  R(1, 38, w - 2, 1, "#3a4452");
  for (let k = 0; k < 5; k++) { const bw = 1 + Math.round((0.5 + 0.5 * Math.sin(f / 4 + k * 1.7)) * 6); R(3 + k * 8, 40 + (k % 2) * 2, bw, 2, k % 2 ? "#3d8bff" : "#3fe0a0"); }
  gt = keep; return rigTex; }
function drawRig3D(f) {
  const {p0, A, B, h} = RIG, P = (a, b, u) => [p0[0] + A[0] * a + B[0] * b, p0[1] + A[1] * a + B[1] * b - u];
  // floor shadow + glow along the room side
  rigPolyCols([P(0,0,0), P(1,0,0), [P(1,1,0)[0] + 4, P(1,1,0)[1] + 3], [P(0,1,0)[0] + 4, P(0,1,0)[1] + 3]], (x, lo, hi) => R(x, lo, 1, hi - lo + 1, "rgba(0,0,0,.45)"));
  const gl = ((f >> 3) % 2) ? "rgba(63,224,160,.28)" : "rgba(61,139,255,.26)";
  for (let x = Math.round(P(0,1,0)[0]); x <= Math.round(P(1,1,0)[0]) + 2; x++) { const t = (x - P(0,1,0)[0]) / A[0], y = Math.round(P(0,1,0)[1] + A[1] * Math.min(1, t)); R(x + 2, y + 2, 1, 2, gl); }
  // top (static colours + vents), near end face, then the animated room-side face
  rigPolyCols([P(0,0,h), P(1,0,h), P(1,1,h), P(0,1,h)], (x, lo, hi) => { R(x, lo, 1, hi - lo + 1, "#2b3340"); if (x % 3 === 0) R(x, lo + 1, 1, Math.max(1, hi - lo - 1), "#202832"); R(x, lo, 1, 1, "#5a6678"); });
  rigPolyCols([P(0,0,0), P(0,1,0), P(0,1,h), P(0,0,h)], (x, lo, hi) => { R(x, lo, 1, hi - lo + 1, "#141a22"); R(x, lo, 1, 1, "#4a5568"); });
  { const e0 = P(0,0,0), e1 = P(0,1,0);   // near end: a few status LEDs + vent slots
    for (let k = 0; k < 4; k++) { const t = 0.25 + k * 0.17, x = Math.round(e0[0] + (e1[0] - e0[0]) * t), y = Math.round(e0[1] + (e1[1] - e0[1]) * t) - h + 8;
      R(x, y, 1, 1, ((f >> 2) + k) % 4 ? "#3fe0a0" : "#0f3a2a"); for (let j = 0; j < 4; j++) R(x, y + 8 + j * 6, 1, 3, "#0b0e13"); } }
  const tex = rigFaceTex(f), s0 = P(0,1,0);
  for (let i = 0; i <= A[0]; i++) { const x = Math.round(s0[0] + i), yb = s0[1] + A[1] * i / A[0];
    g.drawImage(tex, Math.min(43, i), 0, 1, 46, x, Math.round(yb - h), 1, h); }
  { const a = P(0,1,h), b = P(1,1,h); pixLine(Math.round(a[0]), Math.round(a[1]), Math.round(b[0]), Math.round(b[1]), "#7a8698"); }   // lit top edge
  { const a = P(0,1,0), b = P(0,1,h); R(Math.round(a[0]), Math.round(b[1]), 1, h, "#5a6678"); }                                       // front corner
  { const a = P(0,0,0); R(Math.round(a[0]) + 1, Math.round(a[1]), 3, 2, "#141920"); const c = P(0,1,0); R(Math.round(c[0]) - 1, Math.round(c[1]), 3, 2, "#141920"); const d = P(1,1,0); R(Math.round(d[0]) - 2, Math.round(d[1]), 3, 2, "#141920"); }   // feet
}
// quantum5-20261121 (phones): a quantum-core pillar beside Vortex's desk, glowing rings climbing the column, hologram on top
function drawQuantum(cx, by, f) {   // cx = centre x, by = floor y
  const pk = "#ff4fa8", cy2 = "#38d6c9";
  R(cx - 12, by - 1, 24, 3, "rgba(0,0,0,.45)");                                                   // shadow
  for (let i = -13; i <= 13; i++) { const a = 0.18 * (1 - Math.abs(i) / 14); R(cx + i, by + 2, 1, 1, "rgba(255,79,168," + a.toFixed(2) + ")"); }
  R(cx - 11, by - 7, 22, 7, "#161c25"); R(cx - 11, by - 7, 22, 1, "#4a5568"); R(cx - 10, by - 2, 20, 1, ((f >> 3) % 2) ? pk : "#a83a78");   // plinth
  R(cx - 9, by - 5, 2, 2, ((f >> 2) % 3) ? "#3fe0a0" : "#0f3a2a"); R(cx + 7, by - 5, 2, 2, ((f >> 2) % 4) ? cy2 : "#0d3a38");
  const top = by - 44;
  const glow = 0.5 + 0.5 * Math.sin(f / 5);
  for (let y = top - 2; y < by - 6; y++) { R(cx - 11, y, 22, 1, "rgba(255,79,168," + (0.05 + 0.05 * glow).toFixed(3) + ")"); }   // aura around the column
  R(cx - 7, top, 14, 37, "#0c0a18"); R(cx - 7, top, 1, 37, "#5a4a9a"); R(cx + 6, top, 1, 37, "#3a3060"); R(cx - 5, top + 1, 1, 35, "rgba(200,190,255,.18)");   // glass column
  R(cx - 2, top + 2, 4, 35, "rgba(255,79,168," + (0.35 + 0.35 * glow).toFixed(2) + ")"); R(cx - 1, top + 2, 2, 35, "rgba(255,220,240," + (0.25 + 0.4 * glow).toFixed(2) + ")");   // glowing core
  for (let y = top + 2; y < by - 8; y++) { const k = (y + f) % 10; if (k < 2) R(cx - 2, y, 4, 1, "rgba(255,79,168,.55)"); }   // energy flowing up the core
  R(cx - 1, top + 2, 2, 35, "rgba(255,140,200,.35)");
  for (let r = 0; r < 3; r++) {                                                                  // three rings climbing the column
    const ph = ((f * 0.9 + r * 12) % 36), ry = Math.round(by - 9 - ph), w = 11, br = 1 - ph / 36;
    if (ry < top + 1) continue;
    const c = r === 1 ? cy2 : pk;
    for (let dx = -w; dx <= w; dx++) { const dy = Math.round(Math.sqrt(Math.max(0, 1 - (dx * dx) / (w * w))) * 2);
      R(cx + dx, ry + dy, 1, 1, c); if (Math.abs(dx) < 7) continue; R(cx + dx, ry - dy, 1, 1, "rgba(255,255,255," + (0.25 + 0.5 * br).toFixed(2) + ")"); }
  }
  R(cx - 8, top - 3, 16, 3, "#2a2460"); R(cx - 8, top - 3, 16, 1, "#7a6cff"); R(cx - 3, top - 4, 6, 1, ((f >> 2) % 2) ? "#ffb0d8" : pk);   // emitter
  for (let y = 1; y <= 14; y++) { const w = 1 + Math.round(y * 0.75); R(cx - w, top - 4 - y, w * 2, 1, "rgba(255,79,168," + (0.07 + 0.014 * (14 - y)).toFixed(3) + ")"); }   // light cone
  const a = f * 0.11, hc = top - 15 + Math.round(Math.sin(f / 9)), V = [[0, -8, 0], [0, 8, 0], [8, 0, 0], [-8, 0, 0], [0, 0, 8], [0, 0, -8]];   // rotating holographic octahedron
  const P = V.map(([x, y, z]) => { const xr = x * Math.cos(a) - z * Math.sin(a), zr = x * Math.sin(a) + z * Math.cos(a); return [Math.round(cx + xr), Math.round(hc + y + zr * 0.25)]; });
  [[0,2],[0,3],[0,4],[0,5],[1,2],[1,3],[1,4],[1,5],[2,4],[4,3],[3,5],[5,2]].forEach(([i, j], n) => pixLine(P[i][0], P[i][1], P[j][0], P[j][1], n % 3 ? "#ff8ac8" : "#9cf5ec"));
  for (let k = 0; k < 5; k++) { const an = f * 0.07 + k * 1.26; R(Math.round(cx + Math.cos(an) * 12), Math.round(hc + Math.sin(an) * 4), 1, 1, k % 2 ? "#9cf5ec" : "#ffd0e8"); }   // orbiting motes
  if ((f >> 1) % 7 === 0) R(cx - 9, hc + ((f >> 1) % 13) - 6, 18, 1, "rgba(255,255,255,.35)");   // scan flicker
}
function drawRug(y0, y1, l0, r0, l1, r1, pal) {   // perspective rug: top edge l0..r0 at y0, front edge l1..r1 at y1
  const [base, border, line, dot] = pal, n = y1 - y0;
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / n, l = Math.round(l0 + (l1 - l0)*t), r = Math.round(r0 + (r1 - r0)*t), d = y - y0, e = y1 - y;
    if (d < 2 || e < 2) { R(l, y, r - l + 1, 1, border); continue; }
    R(l, y, r - l + 1, 1, base); R(l, y, 2, 1, border); R(r - 1, y, 2, 1, border);
    if (d === 4 || e === 4) R(l + 5, y, r - l - 9, 1, line);
    else if (d > 4 && e > 4) { R(l + 5, y, 1, 1, line); R(r - 5, y, 1, 1, line);
      const cy = (y0 + y1) >> 1, k = Math.abs(y - cy), step = 18;   // repeating diamond motif
      for (let x = l + 12 + k; x < r - 12; x += step) R(x, y, 1, 1, dot);
      for (let x = l + 12 + step - k; x < r - 12; x += step) if (k > 0) R(x, y, 1, 1, dot); }
  }
  for (let x = l1 + 3; x < r1 - 2; x += 3) R(x, y1 + 1, 1, 2, "#4c3c8a");   // fringe on the front edge
  R(l1 + 2, y1 + 3, r1 - l1 - 3, 1, "rgba(0,0,0,.35)");
}
function drawRugs(f) {
  drawRug(142, 182, 112, 384, 104, 390, ["#130f30", "#272060", "#3e3484", "#211c50"]);   // back row (hunter, scanner, coach)
  drawRug(232, 272, 128, 350, 120, 356, ["#150f34", "#30215f", "#4a358a", "#251b56"]);   // front row (vortex, midas)
}
function drawRoom() {

  const f = tick;
  miniC.forEach((mc, i) => { if (f % 44 === (i*7) % 44) { const p = mc[mc.length-1].c, c = Math.max(3, Math.min(14, p + (Math.random() - .5)*6));
    mc.shift(); mc.push({o: p, c, h: Math.min(16, Math.max(p, c) + Math.random()*2), l: Math.max(1, Math.min(p, c) - Math.random()*2)}); } });
  monSeries.forEach((s, i) => { if (f % 5 === i % 5) { s.shift(); s.push(Math.max(3, Math.min(15, s[s.length-1] + (Math.random()-.5)*6))); } });
  R(0,0,W,H,"#0a0914");
  // back wall: deep indigo/violet, slightly lighter toward the top
  for (let y = 0; y < 100; y++) R(0, y, W, 1, y < 40 ? "#1c1440" : (y < 80 ? "#181032" : "#140e28"));
  for (let x = 40; x < W; x += 24) R(x,0,1,100,"#241845");
  R(0,98,W,3,"#3a2a6a");
  R(0,97,W,1,"#6a4cff");   // neon lip where the wall meets the floor
  floorLayer();
  // left wall
  { const wb = 128;
  for (let y = 0; y < wb + 47; y++) { const w = y < 22 ? Math.round(y*38/22) : y < wb ? 38 : Math.round(38 - (y-wb)*38/47); R(0,y,Math.max(0,w),1,"#15102a"); } }
  leftBoard(tick);
  // logo plaque (the big neon above the screen now spells PULSE)
  R(44,24,26,26,"#1a1430"); R(45,25,24,24,"#120c22"); logoGlyph(52,33,"#eef1f4"); logoGlyph(53,33,"#eef1f4");
  // left bay window with a Paris day/dusk/night skyline
  drawCityWindow(74, 18, 50, 74, f);
  plant(86, 94); if (!MOB) plant(462,92);
  // big neon PULSE mounted above the main screen, clock to its right with a comfortable gap
  drawNeonPulse(MOB ? ML.neon : 206, 2, f);
  drawWallClock(MOB ? ML.clock : 288, 3, f);
  // wider central candle screen (uses the space freed by moving the clock up)
  { const sx = MOB ? ML.scr[0] : 126, sw = MOB ? ML.scr[1] : 290;
  R(sx,20,sw,76,"#3d3a62"); R(sx+2,22,sw-4,72,"#080614"); R(sx,20,sw,1,"#7a6cff");
  R(sx+4,38,sw-8,1,"#1a1630");
  for (let gy = 48; gy < 92; gy += 12) R(sx+6,gy,sw-14,1,"#14102a");
  drawEquityOnScreen(sx+6, 42, sw-16, 48); }
  // live order book on the right (asks red / bids green)
  if (MOB) drawOrderBook(...ML.book, f); else drawOrderBook(422, 36, 54, 56, f);
  if (mobileView()) drawWallExtras();
  if (MOB) {   // top-right: slim neon heartbeat strip under the order book + a small plant in front
    const ny = 90, x0 = 340, x1 = 376, ph = (f >> 1) % 48;
    R(x0 - 1, ny - 5, x1 - x0 + 3, 11, "#120c26"); R(x0 - 1, ny - 5, x1 - x0 + 3, 1, "#2a2460");
    const ekg = [0,0,0,0,0,0,0,0,-1,1,-4,3,0,0,-1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,-1,1,-4,3,0,0,-1,0,0];
    for (let i = 0; i < x1 - x0; i++) { const yy = ny + (ekg[i] || 0), d = (i - ph + 48) % 48, hot = d < 6;
      R(x0 + i, yy, 1, 1, hot ? "#9dffd6" : "#2fae84"); if (hot) R(x0 + i, yy + 1, 1, 1, "rgba(63,224,160,.35)"); }
    plant(...ML.plantR);
  }
  // desks (head desk removed: coach now sits at a real desk in the back row)
  if (MOB) { drawRugs(f); drawRig3D(f); drawQuantum(86, 256, f); }
  DESKS.forEach(([cx,top],i) => deskAt(i, cx, top, f));
  // left console, as in the reference: a low cabinet with four little pets on top, a plant + bottles, and a safe with the logo
  if (!MOB) {   // phones: the pets cabinet is replaced by the mining rig
  R(38,194,58,2,"rgba(0,0,0,.35)");
  R(38,148,58,4,"#2b3340"); R(38,148,58,1,"#3a4452"); R(40,152,54,36,"#10151c"); R(40,152,54,1,"#252e3a"); R(59,153,1,35,"#1d242e"); R(40,187,54,1,"#0b0e13");
  [["#3f8a48",42],["#ffb52e",52],["#9aa3ad",62],["#2a2f38",72]].forEach(([c, x]) => { R(x,142,2,2,c); R(x+5,142,2,2,c); R(x,144,7,5,c); R(x+2,146,1,1,"#101318"); R(x+4,146,1,1,"#101318"); });
  R(46,174,6,6,"#1d232c"); R(46,168,2,6,"#3f8a48"); R(49,165,2,9,"#2f6b3a"); R(51,169,2,5,"#3f8a48");
  R(43,182,2,5,"#2b3340"); R(47,181,2,6,"#3a4452"); R(51,182,2,5,"#2b3340");
  R(62,158,28,26,"#1b222b"); R(63,159,26,24,"#0c1117"); logoGlyph(71,169,"#c9d1da"); logoGlyph(72,169,"#c9d1da"); R(83,168,2,7,"#3a4452");
  R(42,188,3,4,"#0b0e13"); R(89,188,3,4,"#0b0e13");
  }
  // aquarium in the empty floor between the cabinet, the espresso and the lounge
  if (MOB) drawAquarium(...ML.aquarium, f); else drawAquarium(14, 210, f);
  // espresso machine, just left of the lounge
  if (MOB) drawEspresso(...ML.espresso, f); else drawEspresso(108, 228, f);
  // classy lounge (oval sofa, electric-blue rug, table, lamp, plants)
  if (MOB) { g.save(); g.translate(...ML.lounge); drawLounge(f); g.restore(); } else drawLounge(f);
  // server rack (LEDs blink faster and brighter for ~5 s on a new scanner signal)
  const rackHot = f < rackHotUntil;
  if (MOB) { g.save(); g.translate(...ML.rack); }
  R(446,176,28,56,"#10151c"); R(446,176,28,1,"#273141");
  for (let k = 0; k < 8; k++) {
    R(449,180+k*6,22,4,"#161c25");
    const aOn = rackHot ? ((f + k) % 2 === 0) : ((f + k) % 5 !== 0);
    const bOn = rackHot ? ((f + k * 2) % 2 === 1) : ((f + k * 2) % 7 !== 0);
    R(451,181+k*6,1,1, aOn ? (rackHot ? "#9dffd6" : "#3fe0a0") : "#0f3a2a");
    R(454,181+k*6,1,1, bOn ? (rackHot ? "#9cc8ff" : "#3d8bff") : "#102347");
  }
  if (rackHot) R(446,176,28,1, (f % 2) ? "#3fe0a0" : "#273141");
  if (MOB) g.restore();
  // arcade + drinks fridge (replace the old whale radar)
  if (MOB) { drawArcade(...ML.arcade, f); drawFridge(...ML.fridge, f); }
  else { drawArcade(424, 246, f); drawFridge(450, 248, f); }
  // rocket on the launch pad (flies on a real close at x1.5+)
  drawRocket(f);
  // characters (walk, work, react), drawn back to front
  checkHighFives(f);
  ORDER.slice().sort((p, q) => ST[p].y - ST[q].y).forEach(k => {
    stepChar(k, f);
    const a = AG[k], s = ST[k], sz = 24, busy = k === "midas" && midasBusy();
    let x = Math.round(s.x), y = Math.round(s.y), bob;
    if (s.walking) bob = (f % 4 < 2) ? 0 : -2;
    else if (s.act === "sit" || s.act === "nap") bob = 4;
    else if (s.act === "arcade" && s.wait < 16) bob = -4;   // little jump on a win
    else if (s.act === "stretch") bob = -2;
    else if (s.cel > f) bob = -Math.round(Math.abs(Math.sin(f/1.6))*5);
    else if (s.act === "dig") { bob = (f % 2) ? 1 : 0; x += (f % 4 < 2) ? 1 : -1; }
    else bob = (f + a.x) % 6 < 3 ? 0 : 1;
    let look = s.look, up = s.up || 0;
    if (k === "scanner") { if (f < (s.excl || 0)) look = 1; else if (s.act === "scan") look = [-1,0,1,0][(f>>2)%4]; }
    const blink = (f + a.x) % 47 === 0;
    const busyHands = s.act && s.act !== "scan";
    const hands = k !== "coach" && !s.walking && !busyHands;
    drawBlob(g, a, x - sz/2, y - sz + bob, sz, busy ? f*2 : f + (a.x>>3), {hands, blink, walk: s.walking ? (f>>1)%2 : null, look, up});
    // little props that tell what they are doing
    const top = y - sz + bob;
    if (s.act === "dig") { magnifier(x + 11, top + 2 + ((f>>1)%2), "#d9dee5"); for (let j = 0; j < 3; j++) R(x - 16 + (f*3 + j*5) % 11, y - 8 - (f + j*4) % 9, 1, 1, j % 2 ? "#ffb52e" : "#9aa3ad"); }
    if (s.act === "think") { for (let j = 0; j < 3; j++) if (((f>>2) % 4) > j) R(x - 5 + j*5, top - 8, 2, 2, "#e8edf2"); R(x + 7, top - 12, 1, 1, "#ff4fa8"); }
    if (s.act === "check") { R(x + 9, top + 8, 5, 7, "#c9d1da"); R(x + 10, top + 9, 3, 1, "#2a323e"); R(x + 10, top + 11, 3, 1, "#2a323e");
      [[0,2],[1,3],[2,2],[3,1],[4,0]].forEach(([px, py]) => R(x - 2 + px, top - 7 + py, 1, 1, "#3fe0a0")); }
    if (s.act === "talk") { R(x - 1, top - 9, 2, 1, "#ffb52e"); R(x - 2, top - 8, 4, 1, "#ffb52e"); R(x - 1, top - 7, 2, 3, "#ffb52e"); R(x - 3, top - 6, 1, 1, "#ffb52e"); R(x + 2, top - 5, 1, 1, "#ffb52e"); }
    if (k === "scanner" && f < (s.excl || 0)) { R(x - 1, top - 12, 2, 5, "#ffb52e"); R(x - 1, top - 5, 2, 2, "#ffb52e"); }
    if (k === "scanner" && s.act === "scan") { const rad = 4 + (f % 14); for (let q = 0; q <= 8; q++) { const ang = Math.PI + q*Math.PI/8; R(x + Math.cos(ang)*rad, top - 3 + Math.sin(ang)*rad*0.7, 1, 1, rad > 12 ? "#1b3b73" : "#3d8bff"); } }
    if (s.act === "nap") {   // pixel Z shapes, not a text label
      for (let i = 0; i < 3; i++) {
        if (((f >> 2) + i) % 5 === 0) continue;
        const zx = x + 7 + i * 4, zy = top - 6 - i * 5 - ((f >> 2) % 2);
        R(zx, zy, 3, 1, "#e8edf2"); R(zx + 2, zy + 1, 1, 1, "#e8edf2"); R(zx + 1, zy + 2, 1, 1, "#e8edf2"); R(zx, zy + 3, 3, 1, "#e8edf2");
      }
    }
    if (s.act === "water") {
      R(x + 8, top + 6, 5, 3, "#8a96a8"); R(x + 13, top + 7, 3, 1, "#8a96a8"); R(x + 9, top + 5, 2, 1, "#6a7688");
      if ((f % 4) < 2) { R(x + 16, top + 9, 1, 2, "#3d8bff"); R(x + 15, top + 12, 1, 2, "#3d8bff"); }
    }
    if (s.act === "feed" && (f % 4) < 2) { for (let j = 0; j < 3; j++) R(x - 8 + j * 3, y - 10 - (f + j) % 5, 1, 1, "#ffd98a"); }
    if (s.cup > f && s.act !== "coffee") {
      R(x + 9, top + 10, 4, 1, "#e8edf2"); R(x + 9, top + 11, 4, 4, "#c8a070"); R(x + 10, top + 11, 2, 3, "#3a2010");
    }
    if (s.act === "stretch") { R(x - 4, top + 2, 2, 6, a.col); R(x + 26, top + 2, 2, 6, a.col); }
    if (s.cel > f) for (let j = 0; j < 5; j++) R(x - 12 + (j*7 + f*3) % 24, top - 4 - (f*2 + j*5) % 14, 1, 1, j % 2 ? "#ffb52e" : "#3fe0a0");
    a.sx = x; a.sy = y - sz;
  });
  if (hi5At && f < hi5At.until) {   // high-five spark when two walkers cross
    const sx = Math.round(hi5At.x), sy = Math.round(hi5At.y - 10);
    const c = (f % 2) ? "#ffd98a" : "#ffffff";
    R(sx, sy, 2, 2, c); R(sx - 3, sy, 2, 1, c); R(sx + 3, sy, 2, 1, c); R(sx, sy - 3, 1, 2, c); R(sx, sy + 3, 1, 2, c);
  }
  blit();
}
function magnifier(x, y, c) { R(x, y, 5, 1, c); R(x, y+4, 5, 1, c); R(x, y+1, 1, 3, c); R(x+4, y+1, 1, 3, c); R(x+1, y+1, 3, 3, "rgba(120,190,255,.25)"); R(x+5, y+5, 1, 1, c); R(x+6, y+6, 1, 1, c); }

// back-wall screen: pixel-art candlesticks built from the real balance history (one candle per trade, or per group of trades when there are many)
function candlesFrom(e, maxC) {
  const n = e.length - 1; if (n < 1) return [];
  const k = Math.max(1, Math.ceil(n / maxC)), out = [];
  for (let a = 1; a <= n; a += k) { const b = Math.min(n, a + k - 1), o = e[a-1].bal, c = e[b].bal;
    let hi = Math.max(o, c), lo = Math.min(o, c);
    for (let j = a; j <= b; j++) { hi = Math.max(hi, e[j].bal); lo = Math.min(lo, e[j].bal); }
    if (a === b) { const w = Math.abs(c - o) * (0.25 + 0.2*((a*7) % 5)/4); hi += w * (a % 2 ? 1 : 0.6); lo -= w * (a % 2 ? 0.6 : 1); }   // single trade: short decorative wicks
    out.push({o, c, h: hi, l: lo}); }
  return out;
}
function drawEquityOnScreen(x, y, w, h) {
  if (!D || !D.equity || D.equity.length < 2) return;
  const e = D.equity, maxC = Math.min(Math.floor(w / 4), Math.max(24, Math.min(72, Math.floor(w / 5))));
  const cs = candlesFrom(e, maxC); if (!cs.length) return;
  const lo = Math.min(e[0].bal, ...cs.map(c => c.l)), hi = Math.max(e[0].bal, ...cs.map(c => c.h)), sp = (hi - lo) || 1;
  const pitch = Math.max(4, Math.min(8, Math.floor(w / cs.length))), bw = Math.max(3, (pitch - 3) | 1);
  const Y = v => y + h - 1 - Math.round((v - lo)/sp*(h - 3));
  for (let i = 0; i < w; i += 4) R(x + i, Y(e[0].bal), 2, 1, "#1d2a3a");            // dashed line = starting balance
  cs.forEach((c, i) => { const up = c.c >= c.o, last = i === cs.length - 1, cx = x + 1 + i*pitch, mid = cx + (bw >> 1);
    const col = up ? "#3fe0a0" : "#ff5468", dim = up ? "#1f8a62" : "#a83242", lite = up ? "#9dffd6" : "#ffb0ba";
    let top = Y(Math.max(c.o, c.c)), bot = Y(Math.min(c.o, c.c)); if (last) { const br = (tick >> 2) % 2 ? 1 : 0; top -= br; }   // newest candle breathes
    R(mid, Y(c.h), 1, Y(c.l) - Y(c.h) + 1, dim);
    R(cx, top, bw, Math.max(1, bot - top + 1), col); R(cx, top, bw, 1, lite); R(cx, top, 1, Math.max(1, bot - top + 1), lite);
    if (last) { for (let q = 0; q < w - (cx - x) - bw - 2; q++) if ((q + (tick >> 1)) % 6 < 3) R(cx + bw + 1 + q, Y(c.c), 1, 1, dim); } });   // live price line
}

// ---------- overlays on stage ----------
const stage = $("stage"), sprites = $("sprites");
const tags = {}, bubs = {};
// labels-20261118: no name labels and no chatter bubbles on the characters (the cards below name everyone); only Midas' position bubble remains
const pct = (x, y, el) => { el.style.left = ((x-VX)/VW*100) + "%"; el.style.top = (y/H*100) + "%"; };
// labels-20261118: no text on the characters at all (no name labels, no bubbles, no position bubble); an open position only makes Midas walk more and his screen glow
function placeTags() {}
let foldW = 0;
function foldFit(force) {   // phones: the network block takes the spare height so the Balance history starts just below the first screen
  if (!MOB) return; const ag = $("agents"), ch = document.querySelector(".chart"); if (!ag || !ch) return;
  if (!force && window.innerWidth === foldW) return; foldW = window.innerWidth;
  ag.style.removeProperty("--net-h");
  const base = ag.getBoundingClientRect().height, top = ch.getBoundingClientRect().top + window.scrollY, need = window.innerHeight + 6 - top;
  if (need > 0) ag.style.setProperty("--net-h", Math.round(base + Math.min(180, need)) + "px");
  netGeom(); }
function resizeStage() { if ((window.innerWidth <= 700) !== MOB) { location.reload(); return; } fitRoom(); foldFit(); netGeom(); stage.style.fontSize = (stage.clientWidth / VW * 4.2) + "px"; }
window.addEventListener("resize", resizeStage);

function say() {}   // labels-20261118: disabled
let sayIdx = 0;
function lines(k) {
  if (!D) return [];
  const A = D.agents, L = [];
  if (k === "hunter") { L.push(A.hunter.found + " wallets found"); if (A.hunter.last && A.hunter.last[0]) L.push("last find: " + A.hunter.last[0]);
    if (A.hunter.candidates) L.push(A.hunter.candidates + " co-buyers checked"); }
  if (k === "scanner") { L.push(A.scanner.signals_today + " signals today"); L.push("watching " + A.scanner.wallets + " wallets");
    if (A.scanner.opened_today != null) L.push(A.scanner.opened_today + " trades opened today"); }
  if (k === "coach") { const st = A.coach.stars || []; if (st.length) L.push("★ " + st.slice(0,3).map(s => s.name).join(" · "));
    L.push(st.length + " stars today"); if (D.today.wr != null) L.push("today " + D.today.wr.toFixed(1) + "% win rate"); }
  if (k === "vortex") { L.push("balance " + eur(D.balance)); L.push("7d " + eur(D.pnl_7d, true)); L.push("day " + D.day_n + " · " + D.trades + " trades"); }
  if (k === "midas") { const c = D.closed_recent; const l = c && c[c.length-1];
    if (l) L.push(l.sym + " " + (l.pnl >= 0 ? "+" : "−") + "€" + Math.abs(l.pnl).toFixed(2));
    if (D.open && D.open.length) L.push(D.open.length + " position" + (D.open.length > 1 ? "s" : "") + " open");
    else L.push("waiting for a signal"); }
  return L;
}

function pop(text, k) { const a = AG[k || "midas"]; const p = document.createElement("div"); p.className = "pop"; p.textContent = text;
  pct(a.sx + (Math.random()*16-8), a.sy - 14, p); sprites.appendChild(p); setTimeout(() => p.remove(), 2700); }
function chaChing() { if (!sound) return; try {
  const ac = chaChing.ac || (chaChing.ac = new (window.AudioContext || window.webkitAudioContext)()); const t = ac.currentTime;
  [[1318,0],[1760,0.09],[2637,0.18]].forEach(([fq, d]) => { const o = ac.createOscillator(), gn = ac.createGain(); o.type = "triangle"; o.frequency.value = fq;
    gn.gain.setValueAtTime(0.0001, t+d); gn.gain.exponentialRampToValueAtTime(0.18, t+d+0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t+d+0.35);
    o.connect(gn).connect(ac.destination); o.start(t+d); o.stop(t+d+0.4); }); } catch (e) {} }
const sndBtn = $("snd");
function sndUI() { sndBtn.textContent = sound ? "♪ ON" : "♪ OFF"; sndBtn.classList.toggle("on", sound); }
sndBtn.onclick = () => { sound = !sound; localStorage.setItem("pulse_snd", sound ? "1" : "0"); sndUI(); if (sound) chaChing(); };
sndUI();

// ---------- render data ----------
function render() {
  const d = D;
  $("mDay").textContent = d.day_n; $("mTrades").textContent = d.trades; $("mWallets").textContent = d.agents.scanner.wallets;
  $("mStars").textContent = (d.agents.coach.counts || {}).star || 0;
  updAge();
  const ab = $("alertBar"); ab.classList.toggle("hidden", !d.alert.on); if (d.alert.on) ab.textContent = "⚠ DAILY WIN RATE UNDER " + d.alert.min + "% · " + d.alert.streak + " DAYS IN A ROW";
  $("mOnline").textContent = d.online ? "ONLINE" : "OFFLINE"; $("mDot").classList.toggle("off", !d.online);
  $("cBal").textContent = eur(d.balance); $("cBalSub").textContent = "INITIAL " + eur(d.initial) + (d.at_risk > 0 ? "  ·  AT RISK +" + eur(d.at_risk).replace(/^\+/, "") + " (not counted)" : "");
  const pe = $("cPnl"); if (!pnlFx) pe.textContent = eur(d.pnl_total, true); pe.className = "big " + (d.pnl_total >= 0 ? "g" : "r");
  $("cPnlSub").textContent = MOB ? "TODAY " + eur(d.pnl_today, true) : "TODAY " + eur(d.pnl_today, true) + " · 7D " + eur(d.pnl_7d, true);
  const t = d.today; $("cToday").textContent = t.wr == null ? "–" : t.wr.toFixed(1) + "%";
  $("cTodaySub").textContent = d.alert.on ? "⚠ < " + d.alert.min + "% · " + d.alert.streak + " DAYS IN A ROW" : (t.w + "W / " + t.l + "L");
  $("cardToday").classList.toggle("alert", d.alert.on); $("mAlert").classList.toggle("hidden", !d.alert.on);
  if (d.alert.on) $("mAlert").textContent = "⚠ WIN RATE < " + d.alert.min + "% · " + d.alert.streak + "D";
  $("cDays").innerHTML = d.days.map(x => { const cls = x.wr == null ? "none" : x.wr < d.alert.min ? "lo" : x.wr < d.alert.ok ? "mid" : "";
    const h = x.wr == null ? 2 : Math.max(2, Math.round(x.wr/100*12)); return '<i class="' + cls + '" style="height:' + h + 'px" title="' + x.d + ' · ' + (x.wr == null ? "–" : x.wr + "%") + ' · ' + x.n + ' trades"></i>'; }).join("");
  // BEST TRADE: biggest counted gain among Midas trades (risky / uncounted trades never qualify)
  const bt = (d.closed_recent || []).filter(c => !c.risky && c.pnl > 0).reduce((m, c) => (!m || c.pnl > m.pnl) ? c : m, null);
  $("cBest").textContent = bt ? eur(bt.pnl, true) : "—"; $("cBest").className = "big" + (bt ? " g" : "");
  $("cBestSub").textContent = bt ? String(bt.sym).slice(0, 12) + " · x" + (+bt.mult).toFixed(2) : ((d.closed_recent || []).length ? "NO WINNING TRADE YET" : "NO TRADES YET");
  $("resolved").textContent = d.trades + " RESOLVED";
  $("floorMeta").textContent = (d.tokens[0] ? "$" + d.tokens[0].sym + " · " : "") + "5 ACTIVE TRADERS · " + d.trades + " TRADES CLOSED";
  const tk = "BOTS P&L " + eur(d.pnl_total, true) + "  ·  BALANCE " + eur(d.balance) + "  ·  WIN RATE " + (d.winrate||0).toFixed(1) + "%  ·  TODAY " + eur(d.pnl_today, true) +
    "  ·  STARS " + ((d.agents.coach.counts||{}).star||0) + "  ·  WALLETS " + d.agents.scanner.wallets + "  ·  DAY " + d.day_n + " OF THE HUNT  ·  ";
  if ($("tick").dataset.v !== tk) { $("tick").textContent = tk + tk; $("tick").dataset.v = tk; }
  $("scrH").innerHTML = '<span>PULSE<b>' + eur(d.balance) + '</b></span><span>P&amp;L<b>' + eur(d.pnl_total, true) + '</b></span><span>TODAY<b>' + eur(d.pnl_today, true) +
    '</b></span><span>7D<b>' + eur(d.pnl_7d, true) + '</b></span><span>WIN<b>' + (d.winrate||0).toFixed(1) + '%</b></span>';
  $("scrF").textContent = "BOTS P&L " + eur(d.pnl_total, true) + " · TRADES " + d.trades + " · WIN RATE " + (d.winrate||0).toFixed(1) + "%";
  const palette = ["#ffb52e","#3fe0a0","#3d8bff","#ff4fa8","#a98bff","#ff6b4a"];
  $("coins").innerHTML = d.tokens.map((x, i) => '<div class="coin" title="' + x.sym + '" style="background:' + palette[i % 6] + '">' + x.sym.slice(0, 3) + '</div>').join("");
  const st = d.agents.coach.stars || [];
  if ($("board")) $("board").innerHTML = '<div class="h">★ STARS · ' + st.length + '</div>' + st.slice(0, 5).map(s => '<div>' + s.name.slice(0, 8) + ' <span class="s">+' + s.pnl.toFixed(1) + '</span></div>').join("");
  const best = (d.closed_recent || []).filter(c => d.now - c.t < 86400).reduce((m, c) => c.mult > (m ? m.mult : 0) ? c : m, null);
  $("topRun").textContent = best ? "TOP RUNNER · " + best.sym + " x" + best.mult.toFixed(2) : "TOP RUNNER";
  // activity log
  const rows = d.activity.map(a => { const cls = a.kind === "NEW" ? "pb" : a.kind === "SELL" ? (a.amt >= 0 ? "gb" : "rb") : "gb";
    const am = a.amt == null ? "" : a.kind === "BUY" ? eur(-a.amt) : eur(a.amt, true); const amc = a.kind === "SELL" ? (a.amt >= 0 ? "g" : "r-c") : "g";
    return '<div class="row ' + cls + '" title="' + ago(a.t) + '"><span class="tm">' + hhmm(a.t) + '</span><span class="ic" data-k="' + a.agent + '"></span><span class="nm">' +
      AG[a.agent].name + '</span><span class="bd ' + a.kind + '">' + a.kind + '</span><span class="am ' + amc + '">' + am + '</span><span class="ds">' + esc(a.txt) + '</span></div>'; }).join("");
  $("logRows").innerHTML = rows;
  $("logRows").querySelectorAll(".ic").forEach(el => el.appendChild(iconCanvas(el.dataset.k)));
  drawEq(); renderAgents();
}
function updAge() { if (!D || !D.now) return; const el = $("mUpd"); const s = Math.max(0, Date.now()/1000 - D.now);
  const ago = s < 90 ? "just now" : s < 3600 ? Math.round(s/60) + " min ago" : Math.round(s/3600) + " h ago";
  el.textContent = "LAST UPDATE " + (dayP(D.now) !== dayP(Date.now()/1000) ? dayP(D.now).slice(5) + " " : "") + hhmm(D.now) + " · Paris · " + ago; el.classList.toggle("stale", s > 1800); }
setInterval(updAge, 30000);
function clockTick() { const c = $("clock"); if (c) c.textContent = hhmm(Date.now()/1000); }
clockTick(); setInterval(clockTick, 5000);
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function agentRun(k) { const d = D, now = d.now, A = d.agents;
  if (k === "hunter") return !!A.hunter.alive;
  if (k === "scanner") return A.scanner.last_t && now - A.scanner.last_t < 900;
  if (k === "coach") return A.coach.t && now - A.coach.t < 3600;
  if (k === "vortex") return d.online;
  if (k === "midas") { const c = d.closed_recent, l = c && c[c.length-1]; return (d.open && d.open.length > 0) || (l && now - l.t < 900); } }
let infoKey = null;
// ---------- phones: the five agents as a live network, Vortex in the middle, colored wires with data packets both ways ----------
let netFx = null, netIcons = [], netEnergy = 0, netDr = [], netC = null, netW = [], netX = [], netLast = 0, netCore = null, netStars = [], netRip = [], netPk = [], netSpk = [], netArc = [], netNextBurst = 0, netNextArc = 0, netNextX = 0;
function netInit(box) {
  box.classList.add("net"); netC = document.createElement("canvas"); netC.className = "wires"; box.insertBefore(netC, box.firstChild);
  netFx = document.createElement("canvas"); netFx.className = "fx"; box.appendChild(netFx);
  let sd = 11; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  netStars = Array.from({length: 90}, (_, i) => ({x: rnd(), y: rnd(), l: i % 3, ph: rnd() * 6.28, sp: 0.6 + rnd() * 1.4, c: rnd() < 0.3 ? "#a98bff" : (rnd() < 0.5 ? "#7ec8ff" : "#e8edf2")}));
  requestAnimationFrame(netFrame);
}
function hexA(c) { const n = parseInt(c.slice(1), 16); return a => "rgba(" + (n >> 16) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")"; }
function bez(p0, p1, p2, p3, n) { const out = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0], u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1]]); } return out; }
function withNormals(pts) { return pts.map((p, i) => { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [p[0], p[1], -dy / l, dx / l]; }); }
function netGeom() {
  if (!netC) return; const box = $("agents"), dpr = window.devicePixelRatio || 1, bw = box.clientWidth, bh = box.clientHeight;
  netC.width = Math.round(bw * dpr); netC.height = Math.round(bh * dpr);
  const br = box.getBoundingClientRect(), bl = box.clientLeft, bt = box.clientTop;
  const r = k => { const e = box.querySelector('.ag[data-k="' + k + '"]'); if (!e) return null; const q = e.getBoundingClientRect(); return {x: q.left - br.left - bl, y: q.top - br.top - bt, w: q.width, h: q.height}; };
  const v = r("vortex"); if (!v) { netW = []; return; }
  if (netFx) { netFx.width = netC.width; netFx.height = netC.height; }
  netIcons = ["hunter", "scanner", "coach", "midas"].map(k => { const e = box.querySelector('.ag[data-k="' + k + '"] canvas'); if (!e) return null; const q = e.getBoundingClientRect();
    return {k, x: q.left - br.left - bl + q.width / 2, y: q.top - br.top - bt + q.height / 2, col: ACC[k] === "#d5dbe3" ? "#e8edf2" : ACC[k], ca: hexA(ACC[k] === "#d5dbe3" ? "#e8edf2" : ACC[k])}; }).filter(Boolean);
  const cx = v.x + v.w / 2, cy = v.y + v.h / 2, R0 = 40; netCore = {x: cx, y: cy, r: R0};
  const x = netC.getContext("2d"), N = {};
  netW = [["hunter", -1, -1], ["scanner", 1, -1], ["coach", -1, 1], ["midas", 1, 1]].map(([k, sx, sy]) => { const n = r(k); if (!n) return null; N[k] = n;
    const p0 = [sx < 0 ? n.x + n.w : n.x, n.y + n.h / 2];
    const ang = Math.atan2(sy * 0.36, sx), d = [Math.cos(ang), Math.sin(ang)], p3 = [cx + d[0] * R0, cy + d[1] * R0];
    const p1 = [p0[0] - sx * 78, p0[1] - sy * 6], p2 = [p3[0] + d[0] * 58, p3[1] + d[1] * 58 + sy * 8];
    const col = ACC[k] === "#d5dbe3" ? "#e8edf2" : ACC[k], gr = x.createLinearGradient(p0[0], p0[1], p3[0], p3[1]);
    gr.addColorStop(0, col); gr.addColorStop(0.6, col); gr.addColorStop(1, "#ff4fa8");
    return {k, p0, p1, p2, p3, col, ca: hexA(col), gr, pts: withNormals(bez(p0, p1, p2, p3, 48))}; }).filter(Boolean);
  netX = [["hunter", "scanner", -1], ["coach", "midas", 1]].map(([a, b, sy]) => { const A = N[a], B = N[b]; if (!A || !B) return null;
    const p0 = [A.x + A.w * 0.75, sy < 0 ? A.y + A.h : A.y], p3 = [B.x + B.w * 0.25, sy < 0 ? B.y + B.h : B.y];
    const p1 = [p0[0] + 40, p0[1] - sy * 26], p2 = [p3[0] - 40, p3[1] - sy * 26];
    return {a, b, pts: bez(p0, p1, p2, p3, 40), ca: hexA(ACC[a] === "#d5dbe3" ? "#e8edf2" : ACC[a]), cb: hexA(ACC[b] === "#d5dbe3" ? "#e8edf2" : ACC[b]), t: -1}; }).filter(Boolean);
  if (!netPk.length) netW.forEach((w, i) => { for (let j = 0; j < 2; j++) netPk.push({w: i, dir: 1, t: Math.random(), sp: 0.25 + Math.random() * 0.3});
    netPk.push({w: i, dir: -1, t: Math.random(), sp: 0.2 + Math.random() * 0.25}); });
}
function netAt(pts, t) { const n = pts.length - 1, f = Math.max(0, Math.min(1, t)) * n, i = Math.min(n - 1, f | 0), u = f - i, a = pts[i], b = pts[i + 1]; return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]; }
function netFrame(ts) {
  requestAnimationFrame(netFrame);
  if (!netC || ts - netLast < 33) return; const dt = Math.min(0.1, (ts - netLast) / 1000); netLast = ts;   // ~30 fps
  const rect = netC.getBoundingClientRect(); if (rect.bottom < 0 || rect.top > window.innerHeight || !netCore) return;   // off screen: idle
  const x = netC.getContext("2d"), dpr = window.devicePixelRatio || 1, W2 = netC.width / dpr, H2 = netC.height / dpr, t = ts / 1000, C = netCore, TAU = 6.2832;
  const run = k => D ? !!agentRun(k) : true;
  x.setTransform(dpr, 0, 0, dpr, 0, 0); x.globalCompositeOperation = "source-over"; x.globalAlpha = 1; x.clearRect(0, 0, W2, H2);
  // background: drifting nebula + 3-layer parallax starfield
  x.globalCompositeOperation = "lighter";
  [[0.28 + 0.06 * Math.sin(t * 0.11), 0.35, "rgba(122,60,255,.10)"], [0.74 + 0.05 * Math.cos(t * 0.09), 0.7, "rgba(30,120,255,.08)"], [0.5, 0.5 + 0.04 * Math.sin(t * 0.13), "rgba(255,79,168,.07)"]].forEach(([nx, ny, c]) => {
    const g2 = x.createRadialGradient(nx * W2, ny * H2, 0, nx * W2, ny * H2, W2 * 0.42); g2.addColorStop(0, c); g2.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g2; x.fillRect(0, 0, W2, H2); });
  for (const s of netStars) { const sp = [3, 7, 14][s.l], px = ((s.x * W2 + t * sp) % W2 + W2) % W2, py = s.y * H2, a = (0.15 + 0.45 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph))) * (0.5 + s.l * 0.25);
    x.globalAlpha = a; x.fillStyle = s.c; x.fillRect(px, py, s.l === 2 ? 1.6 : 1, s.l === 2 ? 1.6 : 1); }
  x.globalAlpha = 1;
  netSurprises(x, t, dt, W2, H2, C);
  // cross-talk between neighbours (faint arcs, a packet now and then)
  if (t > netNextX) { const c = netX[(Math.random() * netX.length) | 0]; if (c) { c.t = 0; c.dir = Math.random() < 0.5 ? 1 : -1; } netNextX = t + 2.5 + Math.random() * 3; }
  netX.forEach(c => { x.beginPath(); c.pts.forEach((p, i) => x[i ? "lineTo" : "moveTo"](p[0], p[1])); x.strokeStyle = "rgba(169,139,255,.16)"; x.lineWidth = 1; x.setLineDash([2, 4]); x.stroke(); x.setLineDash([]);
    if (c.t >= 0) { c.t += dt * 0.9; if (c.t > 1) c.t = -1; else { const u = c.dir > 0 ? c.t : 1 - c.t, ca = c.dir > 0 ? c.ca : c.cb;
      for (let k = 9; k >= 0; k--) { const [px, py] = netAt(c.pts, u - c.dir * k * 0.02); x.fillStyle = ca((1 - k / 10) * 0.7); x.beginPath(); x.arc(px, py, 2 - k * 0.15, 0, TAU); x.fill(); } } } });
  // cables: 3 thin strands braiding around the path + soft glow
  netW.forEach((w, wi) => { const on = run(w.k), P = w.pts, n = P.length - 1;
    x.beginPath(); P.forEach((p, i) => x[i ? "lineTo" : "moveTo"](p[0], p[1])); x.strokeStyle = w.gr; x.lineCap = "round";
    x.globalAlpha = on ? 0.10 : 0.05; x.lineWidth = 9; x.stroke(); x.globalAlpha = on ? 0.16 : 0.08; x.lineWidth = 4; x.stroke();
    for (let sI = 0; sI < 3; sI++) { x.beginPath();
      for (let i = 0; i <= n; i++) { const u = i / n, env = Math.sin(Math.PI * u), off = env * (2.6 * Math.sin(u * 14 - t * (2.2 + wi * 0.3) + sI * 2.094)); const p = P[i]; x[i ? "lineTo" : "moveTo"](p[0] + p[2] * off, p[1] + p[3] * off); }
      x.globalAlpha = on ? (sI === 0 ? 0.95 : 0.6) : 0.3; x.lineWidth = sI === 0 ? 1.2 : 0.8; x.stroke(); }
    x.globalAlpha = 1; x.fillStyle = w.col; x.beginPath(); x.arc(w.p0[0], w.p0[1], 2.4, 0, TAU); x.fill();
    x.fillStyle = w.ca(0.25); x.beginPath(); x.arc(w.p0[0], w.p0[1], 5 + Math.sin(t * 3 + wi), 0, TAU); x.fill(); });
  // electric arc flicker along a cable now and then
  if (t > netNextArc && netW.length) { netArc.push({w: (Math.random() * netW.length) | 0, until: t + 0.18, seed: Math.random() * 1000}); netNextArc = t + 1.8 + Math.random() * 3.5; }
  netArc = netArc.filter(a => a.until > t); netArc.forEach(a => { const w = netW[a.w]; if (!w) return; const P = w.pts;
    for (let pass = 0; pass < 2; pass++) { x.beginPath(); let sd = (a.seed + (t * 60 | 0) * 7 + pass * 13) | 0;
      for (let i = 0; i < P.length; i += 3) { sd = (sd * 16807) % 2147483647; const j = ((sd / 2147483647) - 0.5) * 9 * Math.sin(Math.PI * i / (P.length - 1)); x[i ? "lineTo" : "moveTo"](P[i][0] + P[i][2] * j, P[i][1] + P[i][3] * j); }
      x.strokeStyle = pass ? "rgba(255,255,255,.85)" : w.ca(0.55); x.lineWidth = pass ? 0.9 : 3; x.stroke(); } });
  // data bursts: a short train of packets on one cable
  if (t > netNextBurst && netW.length && netPk.length < 30) { const wi = (Math.random() * netW.length) | 0, dir = Math.random() < 0.7 ? 1 : -1;
    for (let j = 0; j < 4; j++) netPk.push({w: wi, dir, t: dir > 0 ? -j * 0.07 : 1 + j * 0.07, sp: 0.55, once: 1});
    netNextBurst = t + 2 + Math.random() * 3; }
  netPk = netPk.filter(p => !p.dead);
  netPk.forEach(p => { const w = netW[p.w]; if (!w) return; const on = run(w.k);
    p.t += p.dir * p.sp * (on ? 1 : 0.45) * dt;
    if (p.t > 1 || p.t < 0) { if (p.dir > 0 && p.t > 1) { netRip.push({t0: t, c: w.ca}); netEnergy = Math.min(1.6, netEnergy + 0.7); } if (p.dir < 0 && p.t < 0) { const n2 = w.p0; for (let q = 0; q < 4 && netSpk.length < 70; q++) netSpk.push({x: n2[0], y: n2[1], vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.5, c: "#ffb0d8"}); }
      if (p.once) { if ((p.dir > 0 && p.t > 1) || (p.dir < 0 && p.t < 0)) p.dead = 1; return; }
      p.t = p.dir > 0 ? 0 : 1; p.sp = p.dir > 0 ? 0.25 + Math.random() * 0.3 : 0.2 + Math.random() * 0.25; }
    if (p.t < 0 || p.t > 1) return;
    const ca = p.dir > 0 ? w.ca : hexA("#ff4fa8");
    for (let k = 16; k >= 1; k--) { const [px, py] = netAt(w.pts, p.t - p.dir * k * 0.013); x.fillStyle = ca((1 - k / 17) * 0.55); x.beginPath(); x.arc(px, py, 2.6 * (1 - k / 20), 0, TAU); x.fill(); }
    const [hx, hy] = netAt(w.pts, p.t), hg = x.createRadialGradient(hx, hy, 0, hx, hy, 7); hg.addColorStop(0, "rgba(255,255,255,.95)"); hg.addColorStop(0.35, ca(0.8)); hg.addColorStop(1, ca(0));
    x.fillStyle = hg; x.beginPath(); x.arc(hx, hy, 7, 0, TAU); x.fill();
    if (Math.random() < 0.25 && netSpk.length < 70) netSpk.push({x: hx, y: hy, vx: (Math.random() - 0.5) * 18, vy: (Math.random() - 0.5) * 18, life: 0.45, c: p.dir > 0 ? w.col : "#ff8ac8"}); });
  netSpk = netSpk.filter(q => (q.life -= dt) > 0); netSpk.forEach(q => { q.x += q.vx * dt; q.y += q.vy * dt; x.globalAlpha = Math.min(1, q.life * 2.2); x.fillStyle = q.c; x.fillRect(q.x, q.y, 1.4, 1.4); }); x.globalAlpha = 1;
  // Vortex core: halo, shockwaves, counter-rotating hologram rings with ticks, orbiting motes, pulsing hexagon
  const pul = 0.5 + 0.5 * Math.sin(t * 2.4);
  const gh = x.createRadialGradient(C.x, C.y, 4, C.x, C.y, C.r * 1.6); gh.addColorStop(0, "rgba(255,79,168," + (0.30 + 0.12 * pul) + ")"); gh.addColorStop(0.5, "rgba(122,60,255,.10)"); gh.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = gh; x.beginPath(); x.arc(C.x, C.y, C.r * 1.6, 0, TAU); x.fill();
  netRip = netRip.filter(r => t - r.t0 < 0.8); netRip.forEach(r => { const u = (t - r.t0) / 0.8; x.strokeStyle = r.c((1 - u) * 0.8); x.lineWidth = 2.2 * (1 - u) + 0.4; x.beginPath(); x.arc(C.x, C.y, C.r * (0.55 + u * 0.9), 0, TAU); x.stroke(); });
  const ring = (rad, rot, dash, col, ticks, lw) => { x.save(); x.translate(C.x, C.y); x.rotate(rot); x.setLineDash(dash); x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); x.arc(0, 0, rad, 0, TAU); x.stroke(); x.setLineDash([]);
    for (let i = 0; i < ticks; i++) { const a = i * TAU / ticks; x.beginPath(); x.moveTo(Math.cos(a) * (rad - 2.5), Math.sin(a) * (rad - 2.5)); x.lineTo(Math.cos(a) * (rad + 2.5), Math.sin(a) * (rad + 2.5)); x.stroke(); } x.restore(); };
  ring(C.r, t * 0.5, [14, 6, 3, 6], "rgba(255,138,200,.75)", 4, 1.2);
  ring(C.r * 0.8, -t * 0.8, [2, 4], "rgba(126,200,255,.7)", 8, 1);
  ring(C.r * 1.14, -t * 0.25, [40, 10], "rgba(169,139,255,.45)", 12, 0.8);
  for (let i = 0; i < 6; i++) { const a = t * (0.9 + i * 0.12) + i * 1.05, rr2 = C.r * (0.9 + 0.25 * Math.sin(t * 0.7 + i)); x.fillStyle = i % 2 ? "#ffd0e8" : "#9cf5ec"; x.globalAlpha = 0.85; x.beginPath(); x.arc(C.x + Math.cos(a) * rr2, C.y + Math.sin(a) * rr2 * 0.9, 1.3, 0, TAU); x.fill(); }
  x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
  const hex = (rr3, rot) => { x.beginPath(); for (let i = 0; i < 6; i++) { const a = rot + Math.PI / 6 + i * Math.PI / 3; x[i ? "lineTo" : "moveTo"](C.x + Math.cos(a) * rr3, C.y + Math.sin(a) * rr3); } x.closePath(); };
  const hr = C.r * 0.6 + pul * 1.5, gf = x.createRadialGradient(C.x, C.y - 6, 2, C.x, C.y, hr); gf.addColorStop(0, "#4a1440"); gf.addColorStop(1, "#14060f");
  hex(hr, 0); x.fillStyle = gf; x.fill(); x.globalCompositeOperation = "lighter";
  x.strokeStyle = "rgba(255,79,168," + (0.3 + 0.35 * pul) + ")"; x.lineWidth = 4; x.stroke(); x.strokeStyle = "#ff8ac8"; x.lineWidth = 1.2; x.stroke();
  hex(hr * 0.72, t * 0.6); x.strokeStyle = "rgba(156,245,236,.35)"; x.lineWidth = 0.8; x.stroke();
  x.globalCompositeOperation = "source-over"; x.globalAlpha = 1;
  if (netFx) { const fx = netFx.getContext("2d"); fx.setTransform(dpr, 0, 0, dpr, 0, 0); fx.clearRect(0, 0, W2, H2); fx.globalCompositeOperation = "lighter";
    netIcons.forEach((ic, i) => { const on = run(ic.k), a = on ? 1 : 0.38, sp = on ? 1 : 0.35, R1 = 14;
      const rg = (rad, rot, dash, al, ticks, lw) => { fx.save(); fx.translate(ic.x, ic.y); fx.rotate(rot); fx.setLineDash(dash); fx.strokeStyle = ic.ca(al * a); fx.lineWidth = lw; fx.beginPath(); fx.arc(0, 0, rad, 0, TAU); fx.stroke(); fx.setLineDash([]);
        for (let q = 0; q < ticks; q++) { const an = q * TAU / ticks; fx.beginPath(); fx.moveTo(Math.cos(an) * (rad - 1.8), Math.sin(an) * (rad - 1.8)); fx.lineTo(Math.cos(an) * (rad + 1.8), Math.sin(an) * (rad + 1.8)); fx.stroke(); } fx.restore(); };
      const g3 = fx.createRadialGradient(ic.x, ic.y, 2, ic.x, ic.y, R1 + 4); g3.addColorStop(0, ic.ca(0.22 * a)); g3.addColorStop(1, ic.ca(0)); fx.fillStyle = g3; fx.beginPath(); fx.arc(ic.x, ic.y, R1 + 4, 0, TAU); fx.fill();
      rg(R1, t * 0.9 * sp * (i % 2 ? -1 : 1), [7, 3, 2, 3], 0.8, 3, 1);
      rg(R1 - 3.5, -t * 1.4 * sp * (i % 2 ? -1 : 1), [1.5, 2.5], 0.55, 6, 0.8);
      for (let q = 0; q < 3; q++) { const an = t * 1.6 * sp + q * 2.094 + i; fx.fillStyle = ic.ca(0.95 * a); fx.beginPath(); fx.arc(ic.x + Math.cos(an) * (R1 + 2.5), ic.y + Math.sin(an) * (R1 + 2.5) * 0.85, 1, 0, TAU); fx.fill(); } });
    fx.globalCompositeOperation = "source-over"; }
}
// ---------- quiet "surprises" in the free spaces of the network block ----------
function netSurprises(x, t, dt, W2, H2, C) {
  const TAU = 6.2832; netEnergy = Math.max(0, netEnergy - dt * 1.4); x.globalCompositeOperation = "lighter";
  // left middle: mini radar with a sweep and blips
  { const rx = 46, ry = H2 / 2, rr = 22, sw = t * 1.8;
    x.strokeStyle = "rgba(63,224,160,.35)"; x.lineWidth = 0.8; [rr, rr * 0.62, rr * 0.28].forEach(q => { x.beginPath(); x.arc(rx, ry, q, 0, TAU); x.stroke(); });
    x.beginPath(); x.moveTo(rx - rr, ry); x.lineTo(rx + rr, ry); x.moveTo(rx, ry - rr); x.lineTo(rx, ry + rr); x.strokeStyle = "rgba(63,224,160,.15)"; x.stroke();
    for (let k = 0; k < 14; k++) { const an = sw - k * 0.06; x.strokeStyle = "rgba(63,224,160," + (0.5 * (1 - k / 14)).toFixed(3) + ")"; x.lineWidth = 1.4; x.beginPath(); x.moveTo(rx, ry); x.lineTo(rx + Math.cos(an) * rr, ry + Math.sin(an) * rr); x.stroke(); }
    [[0.7, 0.55], [2.6, 0.8], [4.4, 0.4], [5.5, 0.7]].forEach(([an, d], k) => { const age = ((sw - an) % TAU + TAU) % TAU, al = Math.max(0, 1 - age / 3);
      if (al > 0) { x.fillStyle = "rgba(157,255,214," + al.toFixed(2) + ")"; x.beginPath(); x.arc(rx + Math.cos(an) * rr * d, ry + Math.sin(an) * rr * d, 1.6, 0, TAU); x.fill(); } }); }
  // right middle: holo panel with the real balance sparkline + equalizer that jumps on each packet arrival
  { const px = W2 - 82, py = H2 / 2 - 24, pw = 70, ph = 48;
    x.strokeStyle = "rgba(126,200,255,.35)"; x.lineWidth = 0.8; x.strokeRect(px + 0.5, py + 0.5, pw, ph);
    [[px, py], [px + pw, py], [px, py + ph], [px + pw, py + ph]].forEach(([cx2, cy2], k) => { x.fillStyle = "rgba(126,200,255,.8)"; x.fillRect(cx2 - 1, cy2 - 1, 3, 1); x.fillRect(cx2 - 1, cy2 - 1, 1, 3); });
    for (let k = 0; k < 4; k++) { x.fillStyle = "rgba(169,139,255,.45)"; x.fillRect(px + 4 + k * 5, py + 4, 3, 2); }
    const e = (D && D.equity) || []; const vals = e.length > 3 ? e.slice(-40).map(q => q.bal) : Array.from({length: 30}, (_, i) => 20 + Math.sin(i / 3));
    const lo = Math.min(...vals), hi = Math.max(...vals), spn = (hi - lo) || 1, n = vals.length, shown = Math.min(n, 2 + ((t * 8) | 0) % (n + 18));
    x.beginPath(); for (let i = 0; i < Math.min(n, shown); i++) { const X = px + 4 + i * (pw - 8) / (n - 1), Y = py + 10 + (1 - (vals[i] - lo) / spn) * 18; x[i ? "lineTo" : "moveTo"](X, Y); }
    x.strokeStyle = "rgba(63,224,160,.85)"; x.lineWidth = 1.1; x.stroke();
    for (let k = 0; k < 10; k++) { const h = 2 + Math.abs(Math.sin(t * (3 + k * 0.7) + k)) * (4 + netEnergy * 6); x.fillStyle = k % 3 ? "rgba(255,79,168,.7)" : "rgba(126,200,255,.7)"; x.fillRect(px + 5 + k * 6.2, py + ph - 3 - h, 4, h); } }
  // top centre: spinning Solana-style token with a small orbit ring
  { const cx2 = W2 / 2, cy2 = 26, r0 = 11, sq = Math.cos(t * 1.7), w = Math.max(1.2, Math.abs(sq) * r0);
    const gg = x.createLinearGradient(cx2 - w, cy2 - r0, cx2 + w, cy2 + r0); gg.addColorStop(0, "#9945ff"); gg.addColorStop(1, "#14f195");
    x.save(); x.globalAlpha = 0.9; x.fillStyle = gg; x.beginPath(); x.ellipse(cx2, cy2, w, r0, 0, 0, TAU); x.fill();
    if (Math.abs(sq) > 0.35) { x.fillStyle = "rgba(8,8,16,.85)"; for (let k = 0; k < 3; k++) { const yy = cy2 - 5 + k * 4; x.beginPath(); x.moveTo(cx2 - w * 0.55 + (k === 1 ? 1.5 : 0) * Math.sign(sq), yy); x.lineTo(cx2 + w * 0.65, yy); x.lineTo(cx2 + w * 0.55, yy + 2); x.lineTo(cx2 - w * 0.65, yy + 2); x.closePath(); x.fill(); } }
    x.restore(); x.strokeStyle = "rgba(169,139,255,.35)"; x.lineWidth = 0.8; x.beginPath(); x.ellipse(cx2, cy2, 22, 5, 0, 0, TAU); x.stroke();
    const oa = t * 2.2; x.fillStyle = "#14f195"; x.beginPath(); x.arc(cx2 + Math.cos(oa) * 22, cy2 + Math.sin(oa) * 5, 1.4, 0, TAU); x.fill();
    for (let k = 0; k < 4; k++) { const hgt = 3 + k * 2, on = ((t * 2) | 0) % 5 > k - 1; x.fillStyle = on ? "rgba(63,224,160,.75)" : "rgba(63,224,160,.18)"; x.fillRect(cx2 + 30 + k * 4, cy2 + 4 - hgt, 2.5, hgt);
      x.fillStyle = on ? "rgba(126,200,255,.75)" : "rgba(126,200,255,.18)"; x.fillRect(cx2 - 43 + k * 4, cy2 + 4 - (3 + (3 - k) * 2), 2.5, 3 + (3 - k) * 2); } }
  // bottom centre: data helix
  { const y0 = H2 - 24, x0 = W2 / 2 - 72, x1 = W2 / 2 + 72;
    for (let X = x0; X <= x1; X += 3) { const u = (X - x0) / (x1 - x0), env = Math.sin(Math.PI * u), ph = X * 0.09 - t * 2.4, a1 = Math.sin(ph) * 7 * env, a2 = -a1, dep = Math.cos(ph);
      x.fillStyle = dep > 0 ? "rgba(255,79,168,.75)" : "rgba(255,79,168,.3)"; x.fillRect(X, y0 + a1, 1.6, 1.6);
      x.fillStyle = dep < 0 ? "rgba(56,214,201,.75)" : "rgba(56,214,201,.3)"; x.fillRect(X, y0 + a2, 1.6, 1.6);
      if (((X - x0) / 3 | 0) % 3 === 0) { x.fillStyle = "rgba(169,139,255," + (0.12 + 0.1 * env).toFixed(2) + ")"; x.fillRect(X + 0.3, Math.min(y0 + a1, y0 + a2), 1, Math.abs(a1 - a2)); } } }
  // two little drones looping around the core, passing behind the cards
  if (!netDr.length) netDr = [{ph: 0, sp: 0.32, c: "#7ec8ff"}, {ph: 3.1, sp: -0.26, c: "#ffb52e"}];
  netDr.forEach(d => { d.ph += d.sp * dt; const pos = q => [C.x + Math.cos(q) * (W2 * 0.43), C.y + Math.sin(q * 2) * (H2 * 0.30)];
    for (let k = 10; k >= 1; k--) { const [px, py] = pos(d.ph - Math.sign(d.sp) * k * 0.025); x.fillStyle = hexA(d.c)(0.25 * (1 - k / 11)); x.fillRect(px - 1, py - 1, 2, 2); }
    const [px, py] = pos(d.ph); x.fillStyle = "#e8edf2"; x.fillRect(px - 2, py - 1, 5, 3); x.fillStyle = d.c; x.fillRect(px - 4, py, 2, 1); x.fillRect(px + 3, py, 2, 1);
    if (((t * 4) | 0) % 2) { x.fillStyle = "#ff5468"; x.fillRect(px, py - 2, 1, 1); } });
  x.globalCompositeOperation = "source-over"; x.globalAlpha = 1;
}
function renderAgents() {
  const box = $("agents");
  if (MOB && !box.classList.contains("net")) netInit(box);
  if (!box.querySelector(".ag")) ORDER.forEach(k => { const el = document.createElement("div"); el.className = "ag"; el.dataset.k = k;
    el.innerHTML = '<div class="hd"><span>' + AG[k].role + '</span><span class="st">● IDLE</span></div><div class="bd2"></div>';
    const c = document.createElement("canvas"); c.width = c.height = 20; drawBlob(c.getContext("2d"), AG[k], 2, 3, 16, 0, {});
    el.querySelector(".bd2").appendChild(c); const n = document.createElement("span"); n.className = "n"; n.textContent = AG[k].name; el.querySelector(".bd2").appendChild(n);
    el.style.setProperty("--c", ACC[k]); el.onclick = () => { infoKey = infoKey === k ? null : k; showInfo(); }; box.appendChild(el); });
  if (MOB) netGeom();
  [...box.querySelectorAll(".ag")].forEach(el => { const on = agentRun(el.dataset.k); el.classList.toggle("run", !!on); el.querySelector(".st").textContent = on ? "● RUN" : "● IDLE"; });
  showInfo();
}
function showInfo() { const el = $("info"); if (!infoKey || !D) { el.classList.add("hidden"); return; } el.classList.remove("hidden"); const A = D.agents; let h = "";
  if (infoKey === "hunter") h = "<b>HUNTER</b> · finds wallets that keep buying the same tokens as our winners.<br>Wallets found: <b>" + A.hunter.found + "</b>" +
    (A.hunter.last.length ? " · latest: <b>" + A.hunter.last.map(esc).join(", ") + "</b>" : "") + (A.hunter.candidates ? "<br>Co-buyers checked: <b>" + A.hunter.candidates + "</b>" : "");
  if (infoKey === "scanner") h = "<b>SCANNER</b> · watches <b>" + A.scanner.wallets + "</b> wallets and fires when they buy together.<br>Signals today: <b>" + A.scanner.signals_today + "</b> · trades opened: <b>" + A.scanner.opened_today + "</b>";
  if (infoKey === "coach") h = "<b>COACH</b> · grades every wallet each morning (7 days).<br>★ Stars: " + (A.coach.stars || []).map(s => "<b>" + esc(s.name) + "</b> " + eur(s.pnl, true)).join(" · ") +
    "<br>Stars " + (A.coach.counts.star || 0) + " · Mid " + (A.coach.counts.mid || 0) + " · Trial " + (A.coach.counts.trial || 0) + (A.coach.t ? " · updated " + hhmm(A.coach.t) : "");
  if (infoKey === "vortex") h = "<b>VORTEX</b> · runs the floor and keeps an eye on the numbers.<br>Balance <b>" + eur(D.balance) + "</b> · P&amp;L <b>" + eur(D.pnl_total, true) + "</b> · today's win rate <b>" + (D.today.wr == null ? "–" : D.today.wr + "%") + "</b>" +
    "<br>Daily win rate: " + D.days.slice(-7).map(x => x.d.slice(8) + "/" + x.d.slice(5,7) + " " + (x.wr == null ? "–" : x.wr + "%")).join(" · ");
  if (infoKey === "midas") { const c = (D.closed_recent || []).slice(-5).reverse();
    h = "<b>MIDAS</b> · executes the trades through Jupiter.<br>Last closed: " + c.map(x => "<b>" + esc(x.sym) + "</b> " + eur(x.pnl, true)).join(" · ") +
      (D.open.length ? "<br>Open: " + D.open.map(o => "<b>" + esc(o.sym) + "</b>" + (o.x ? " x" + o.x.toFixed(2) : "")).join(" · ") : ""); }
  el.innerHTML = h; }

function drawEq() {
  const c = $("eq"), box = c.parentElement, dpr = window.devicePixelRatio || 1, w = box.clientWidth, h = box.clientHeight;
  c.width = w*dpr; c.height = h*dpr; const x = c.getContext("2d"); x.scale(dpr, dpr); x.clearRect(0,0,w,h);
  const e = D.equity; if (!e || e.length < 2) return;
  const padL = 46, padR = 96, padT = 26, padB = 40, cw = w - padL - padR, ch = h - padT - padB;
  const v = e.map(p => p.bal), mn = Math.min(...v), mx = Math.max(...v), sp = (mx - mn) || 1;
  const X = i => padL + i*cw/(e.length-1), Y = b => padT + ch - (b-mn)/sp*ch;
  x.font = "9px " + getComputedStyle(document.body).fontFamily; x.fillStyle = "#59636f";
  [mn, mn + sp/2, mx].forEach(b => { x.fillText("€" + b.toFixed(0), 6, Y(b)+3); x.fillStyle = "#59636f"; });
  // volume bars
  const maxp = Math.max(...e.map(p => Math.abs(p.pnl))) || 1;
  e.forEach((p, i) => { if (!i) return; const bh = Math.max(1, Math.abs(p.pnl)/maxp*26); x.fillStyle = p.pnl > 0 ? "rgba(46,190,128,.75)" : "rgba(220,70,85,.7)";
    x.fillRect(X(i)-Math.max(1, cw/e.length*0.35), h - 8 - bh, Math.max(1.2, cw/e.length*0.7), bh); });
  const gr = x.createLinearGradient(0, padT, 0, padT+ch); gr.addColorStop(0, "rgba(63,224,160,.35)"); gr.addColorStop(1, "rgba(63,224,160,0)");
  x.beginPath(); e.forEach((p, i) => i ? x.lineTo(X(i), Y(p.bal)) : x.moveTo(X(i), Y(p.bal))); x.lineTo(X(e.length-1), padT+ch); x.lineTo(X(0), padT+ch); x.closePath(); x.fillStyle = gr; x.fill();
  x.beginPath(); e.forEach((p, i) => i ? x.lineTo(X(i), Y(p.bal)) : x.moveTo(X(i), Y(p.bal))); x.strokeStyle = "#3fe0a0"; x.lineWidth = 1.6; x.shadowColor = "rgba(63,224,160,.8)"; x.shadowBlur = 6; x.stroke(); x.shadowBlur = 0;
  const lx = X(e.length-1), ly = Y(v[v.length-1]); x.beginPath(); x.arc(lx, ly, 3, 0, 7); x.fillStyle = "#06120d"; x.fill(); x.strokeStyle = "#3fe0a0"; x.lineWidth = 1.5; x.stroke();
  x.fillStyle = "#59636f"; x.fillText("BALANCE", lx + 8, ly - 10); x.fillStyle = "#3fe0a0"; x.font = "bold 15px Inter,Segoe UI,Roboto,Arial,sans-serif"; x.fillText(eur(v[v.length-1]), lx + 8, ly + 6);
  x.font = "8px " + getComputedStyle(document.body).fontFamily; x.fillStyle = "#59636f"; x.fillText("INITIAL BALANCE " + eur(D.initial), padL, Y(v[0]) + 12);
}

// ---------- loop ----------
async function load() {
  try {
    const r = await fetch("data/pulse.json?t=" + Date.now(), {cache: "no-store"}); const d = await r.json(); if (!d || d.balance == null) return; d.age_s = Date.now() / 1000 - d.now; d.online = !!d.online && d.age_s < 1800;
    const ids = new Set((d.closed_recent || []).map(c => c.id));
    if (seenIds) { (d.closed_recent || []).forEach(c => { if (!seenIds.has(c.id) && c.pnl > 0) { setTimeout(() => { pop("+€" + c.pnl.toFixed(2), "midas"); chaChing(); }, 300); } }); }
    const op = new Set((d.open || []).map(o => o.sym + ":" + o.t0));
    if (seenOpen) { op.forEach(id => { if (!seenOpen.has(id)) ST.midas.next = tick; }); }      // a new real position: Midas gets up now
    if (seenIds) { (d.closed_recent || []).forEach(c => {
      if (!seenIds.has(c.id) && c.pnl > 0) ST.midas.cel = tick + 30;
      if (!seenIds.has(c.id) && (c.mult >= 1.5) && rocketPhase === 0) rocketPhase = 1;
    }); }
    const sig = d.agents && d.agents.scanner && d.agents.scanner.signals_today;
    if (lastSignals != null && sig != null && sig > lastSignals) rackHotUntil = tick + 91;  // ~5 s at 18 fps
    if (sig != null) lastSignals = sig;
    let fxSum = 0, fxN = 0; if (seenIds && D) (d.closed_recent || []).forEach(c => { if (!seenIds.has(c.id) && !c.risky && c.pnl) { fxSum += c.pnl; fxN++; } });
    const fxOld = D ? D.pnl_total : null;
    seenOpen = op; seenIds = ids; const first = !D; D = d; render(); if (first) foldFit(true);
    if (fxN && fxOld != null && d.pnl_total != null) pnlCoins(fxSum > 0, fxOld, d.pnl_total);
  } catch (e) { }
}
function frame() { tick++; if (rocketPhase > 0) { rocketPhase++; if (rocketPhase > ROCKET_FLY + ROCKET_WAIT) rocketPhase = 0; } drawRoom(); placeTags(); }
if (MOB) {   // basezoom9 (phones): Balance / P&L / Win rate as one compact row just above the room; Best trade hidden
  const fl = document.querySelector(".floor"), ph = fl && fl.querySelector(".ph"), cs = document.querySelector(".cards");
  if (ph && cs) { ph.after(cs); cs.classList.add("mini"); const L = cs.querySelectorAll(".card .lbl"); if (L[0]) L[0].textContent = "BALANCE"; if (L[2]) L[2].textContent = "WIN RATE"; }
}
// ---------- v10 (phones): a new closed Midas trade sends coins from his desk to the TOTAL P&L card ----------
function pnlCoins(win, from, to) {
  if (!MOB || document.hidden) return; const pe = $("cPnl"), card = pe && pe.closest(".card"); if (!card) return;
  const cv = document.createElement("canvas"), dpr = window.devicePixelRatio || 1, VWp = window.innerWidth, VHp = window.innerHeight;
  cv.className = "coinfx"; cv.width = VWp * dpr; cv.height = VHp * dpr; document.body.appendChild(cv);
  const x = cv.getContext("2d"); x.scale(dpr, dpr); x.imageSmoothingEnabled = false;
  const rr2 = room.getBoundingClientRect(), dk = DESKS[4], sc = rr2.width / W;
  const src = {x: rr2.left + dk[0] * sc, y: rr2.top + (dk[1] + 30) * sc};   // Midas's desk top, in viewport px
  const tgt = () => { const r = pe.getBoundingClientRect(); return {x: r.left + Math.min(r.width, 70) / 2, y: r.top + r.height / 2}; };
  const N = win ? 10 : 0, coins = [], sparks = [], drops = [], t0 = performance.now(), FLY = 820;
  for (let i = 0; i < N; i++) coins.push({d: i * 55, sx: src.x + (Math.random() - .5) * 46, sy: src.y + (Math.random() - .5) * 8,
    bend: (i % 2 ? 1 : -1) * (40 + Math.random() * 70), up: 30 + Math.random() * 60, sp: 6 + Math.random() * 6, done: false});
  let hit = false; pnlFx = {from, to};
  const arrive = now => { if (hit) return; hit = true; const T = tgt();
    card.classList.remove("fxg", "fxr"); void card.offsetWidth; card.classList.add(win ? "fxg" : "fxr");
    const c0 = performance.now(), cnt = () => { const k = Math.min(1, (performance.now() - c0) / 1000), e = 1 - Math.pow(1 - k, 3), v = from + (to - from) * e;
      pe.textContent = eur(v, true); pe.className = "big " + (v >= 0 ? "g" : "r"); if (k < 1) requestAnimationFrame(cnt); else { pnlFx = null; pe.textContent = eur(to, true); } };
    cnt();
    if (win) for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283; sparks.push({x: T.x, y: T.y, vx: Math.cos(a) * (1.2 + Math.random() * 1.6), vy: Math.sin(a) * (1.2 + Math.random() * 1.6), l: 1}); }
    else { const r = card.getBoundingClientRect(); for (let i = 0; i < 4; i++) drops.push({x: r.left + r.width * (.25 + i * .17), y: r.bottom - 4, vy: .4 + Math.random(), l: 1, d: i * 90}); } };
  if (!win) arrive(t0);
  const coin = (cx, cy, s, ph, red) => { const w = Math.max(1, Math.round(s * Math.abs(Math.cos(ph)))), h = s;
    x.fillStyle = red ? "#7a1f2b" : "#8a5a00"; x.fillRect(Math.round(cx - w / 2) - 1, Math.round(cy - h / 2), w + 2, h);
    x.fillStyle = red ? "#ff5468" : "#ffb52e"; x.fillRect(Math.round(cx - w / 2), Math.round(cy - h / 2) + 1, w, h - 2);
    if (w > 3) { x.fillStyle = red ? "#ffb0b8" : "#ffe9a0"; x.fillRect(Math.round(cx - w / 2) + 1, Math.round(cy - h / 2) + 2, Math.max(1, w >> 2), Math.max(1, h >> 2)); } };
  const step = now => {
    const t = now - t0; x.clearRect(0, 0, VWp, VHp); const T = tgt(); let alive = false;
    coins.forEach((c, i) => { const k = (t - c.d) / FLY; if (k < 0) { alive = true; return; } if (k >= 1) { if (!c.done) { c.done = true; arrive(now); } return; } alive = true;
      const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, mx = (c.sx + T.x) / 2 + c.bend, my = Math.min(c.sy, T.y) - c.up;
      const px = (1 - e) * (1 - e) * c.sx + 2 * (1 - e) * e * mx + e * e * T.x, py = (1 - e) * (1 - e) * c.sy + 2 * (1 - e) * e * my + e * e * T.y;
      x.globalAlpha = .35; x.fillStyle = "#ffd98a"; x.fillRect(px - 1, py + 4, 2, 2); x.globalAlpha = 1;
      coin(px, py, Math.round(c.sp * (1 - .3 * e)) + 2, t / 70 + i, false); });
    sparks.forEach(p => { if (p.l <= 0) return; alive = true; p.x += p.vx; p.y += p.vy; p.vx *= .94; p.vy *= .94; p.l -= .035;
      x.globalAlpha = Math.max(0, p.l); x.fillStyle = p.l > .5 ? "#fff6c8" : "#3fe0a0"; x.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); x.globalAlpha = 1; });
    drops.forEach(p => { if (p.l <= 0) return; alive = true; if (t < p.d) return; p.y += p.vy; p.vy += .12; p.l -= .022;
      x.globalAlpha = Math.max(0, p.l) * .85; coin(p.x, p.y, 7, t / 90 + p.d, true); x.globalAlpha = 1; });
    if (alive || t < 1200) requestAnimationFrame(step); else cv.remove();
  };
  requestAnimationFrame(step);
}
window.__pulseTestGain = v => { if (!D) return; const a = D.pnl_total; pnlCoins(v > 0, a, a + v); };   // test hook: preview only, does not change any data
if (/[?&]demo=(gain|loss)/.test(location.search)) { const g = /demo=gain/.test(location.search); setTimeout(() => window.__pulseTestGain(g ? 1.23 : -0.84), 3000); }

resizeStage(); load(); setInterval(load, 60000); setInterval(frame, 55); frame();
window.addEventListener("resize", () => D && drawEq());
// header logos
(() => { const a = $("logoA").getContext("2d"); a.fillStyle = "#eef1f4"; const pts = [[1,8],[4,8],[6,3],[8,13],[10,1],[12,11],[13,8],[15,8]];
  for (let i = 0; i < pts.length-1; i++) { const [x0,y0] = pts[i], [x1,y1] = pts[i+1]; const n = Math.max(Math.abs(x1-x0), Math.abs(y1-y0)); for (let k = 0; k <= n; k++) a.fillRect(Math.round(x0+(x1-x0)*k/n), Math.round(y0+(y1-y0)*k/n), 1, 1); }
  drawBlob($("logoB").getContext("2d"), {shape:"tri", col:"#ff4fa8"}, 1, 1, 14, 0, {}); })();
// installable app: a minimal service worker (network first, see sw.js)
if ("serviceWorker" in navigator && location.protocol !== "file:") window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js", {scope: "./"}).catch(() => {}); });
})();
