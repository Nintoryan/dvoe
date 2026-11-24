// Трёхмерный мир «ДВОЕ»: объёмные облака (raymarching), мраморные руины, ангельские крылья,
// золотые весы, врата Аида. Всё генерируется процедурно — без внешних моделей.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const hex3 = h => { const n = parseInt(h.slice(1), 16); return new THREE.Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------- Палитры миров ---------- */
const PAL = {
  heaven: { top: '#8fbbea', bot: '#eef4fb', light: '#ffffff', dark: '#9aa9c0', sun: '#fff1d6', fog: '#eef3f9', hell: 0, storm: 0 },
  eden:   { top: '#9fc6e4', bot: '#f6f8f2', light: '#fffdf4', dark: '#a6b3c2', sun: '#fff0c8', fog: '#f1f3ea', hell: 0, storm: 0 },
  temple: { top: '#d7d9e4', bot: '#fffaf1', light: '#fffaf0', dark: '#bdb2a4', sun: '#ffe2b0', fog: '#f4efe6', hell: 0, storm: 0 },
  angels: { top: '#7ea7dc', bot: '#e3ebf7', light: '#ffffff', dark: '#8a9bbb', sun: '#fff3d0', fog: '#dce5f3', hell: 0, storm: 0 },
  scales: { top: '#e6d6b6', bot: '#fff8ea', light: '#fff7e6', dark: '#c4a77a', sun: '#ffd88a', fog: '#f6eedd', hell: 0, storm: 0 },
  arches: { top: '#c3d3e6', bot: '#f9fbfd', light: '#ffffff', dark: '#a9b3c2', sun: '#fff3dd', fog: '#eef2f7', hell: 0, storm: 0 },
  storm:  { top: '#59606e', bot: '#9aa1ad', light: '#c9ced8', dark: '#353a46', sun: '#b8c0d0', fog: '#7d8492', hell: 0, storm: 1 },
  hades:  { top: '#0b0203', bot: '#2a0605', light: '#ff5a1f', dark: '#140303', sun: '#ff3b0f', fog: '#1c0504', hell: 1, storm: 0 },
  mirror: { top: '#e9c9c4', bot: '#fff6ef', light: '#fff8f2', dark: '#c9a7a2', sun: '#ffd2b8', fog: '#f7ebe6', hell: 0, storm: 0 },
  oracle: { top: '#f2d79c', bot: '#fffaf0', light: '#fffbf2', dark: '#d2b27c', sun: '#ffcf6e', fog: '#faf0dc', hell: 0, storm: 0 },
};

export const REALMS = {
  intro: { i: 0, pal: 'heaven' }, prologue: { i: 1, pal: 'heaven' }, bio: { i: 2, pal: 'eden' },
  temple: { i: 3, pal: 'temple' }, angels: { i: 4, pal: 'angels' }, scales: { i: 5, pal: 'scales' },
  arches: { i: 6, pal: 'arches' }, storm: { i: 7, pal: 'storm' }, hades: { i: 8, pal: 'hades' },
  mirror: { i: 9, pal: 'mirror' }, oracle: { i: 10, pal: 'oracle' },
};
const SPACING = 110;
const stationPos = i => new THREE.Vector3(0, 0, -i * SPACING);

/* ---------- Шейдер облаков ---------- */
const CLOUD_FRAG = /* glsl */`
precision highp float;
uniform float uTime, uFill, uHell, uStorm, uFlash, uWhite;
uniform int uSteps, uOct;
uniform mat4 uInvProj, uCamWorld;
uniform vec3 uCamPos, uSkyTop, uSkyBot, uLight, uDark, uSun, uSunDir;
varying vec2 vUv;
float hash(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x), mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y), f.z); }
float fbm(vec3 p, int oct){ float a = .5, s = 0.; for(int i=0;i<oct;i++){ s += a*noise(p); p = p*2.07 + vec3(1.7,9.2,3.1); a *= .5; } return s; }
float shapeAt(vec3 p){
  vec2 d2 = vec2(p.x*0.55, (p.y-2.0)*1.1);
  float r = length(d2);
  float wall = smoothstep(11.0, 34.0, r);
  float sea = smoothstep(-5.0, -16.0, p.y);
  return max(wall, sea);
}
float density(vec3 p, int oct){
  vec3 q = p*0.034 + vec3(uTime*0.008, -uTime*0.002, uTime*0.004);
  // лёгкое искривление пространства — «цветная капуста» кучевых облаков
  q += 0.35*vec3(noise(q*1.7+3.1), noise(q*1.7+7.4), noise(q*1.7+1.3));
  float n = fbm(q, oct);
  float s = shapeAt(p);
  float d = n - 0.58 + s*0.5 + uFill;
  d -= smoothstep(24., 55., p.y);
  return clamp(d*4.2, 0., 1.);
}
void main(){
  vec4 ndc = vec4(vUv*2.0-1.0, 1.0, 1.0);
  vec4 v = uInvProj*ndc; v /= v.w;
  vec3 rd = normalize((uCamWorld*vec4(v.xyz,0.0)).xyz);
  vec3 ro = uCamPos;
  float h = clamp(rd.y*0.5+0.5, 0., 1.);
  vec3 sky = mix(uSkyBot, uSkyTop, smoothstep(0.47, 0.8, h));
  float sd = max(dot(rd, uSunDir), 0.);
  sky += uSun*(pow(sd, 6.)*0.28 + pow(sd, 90.)*0.9);
  sky = mix(sky, uDark*0.6, uHell*smoothstep(0.5, 0.0, h)*0.5);
  vec3 col = vec3(0.); float T = 1.;
  float t = 0.4 + hash(vec3(gl_FragCoord.xy, fract(uTime)))*1.4;
  for(int i=0;i<uSteps;i++){
    vec3 p = ro + rd*t;
    float dt = 0.45 + t*0.058;
    float den = density(p, uOct);
    if(den > 0.005){
      float ls = density(p + uSunDir*2.6, uOct-2);
      float ls2 = density(p + uSunDir*7.0, uOct-3);
      float shadow = exp(-(ls*2.2 + ls2*1.4));
      float hgt = clamp((p.y + 16.0)/40.0, 0., 1.);
      vec3 amb = mix(uDark, mix(uDark, uSkyTop, 0.5), hgt);
      vec3 lit = amb + (uLight - uDark*0.6)*shadow*1.05;
      float under = smoothstep(4.0, -14.0, p.y);
      lit += uHell*vec3(1.0,0.22,0.04)*under*0.9;
      lit = mix(lit, lit*0.55, uStorm*(1.0-shadow));
      lit += uFlash*vec3(0.85,0.9,1.0)*(0.6+0.6*shadow);
      float powder = 1.0 - exp(-den*3.5);
      lit *= mix(0.82, 1.0, powder);
      float a = 1.0 - exp(-den*dt*0.85);
      col += T*a*lit; T *= 1.0 - a;
      if(T < 0.02) break;
    }
    t += dt;
  }
  col += T*sky;
  col = mix(col, uLight*1.02, uWhite);
  gl_FragColor = vec4(col, 1.0);
}`;

const QUAD_VERT = /* glsl */`varying vec2 vUv; void main(){ vUv = position.xy*0.5+0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BLIT_FRAG = /* glsl */`
precision highp float; uniform sampler2D tCloud; uniform float uTime, uVig; varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
void main(){ vec3 c = texture2D(tCloud, vUv).rgb;
  vec2 q = vUv-0.5; c *= 1.0 - dot(q,q)*uVig;
  c += (h(vUv*1000.0+uTime)-0.5)*0.018;
  gl_FragColor = vec4(c,1.0); }`;

function fsTriangle() {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  return g;
}

/* ---------- Процедурные текстуры ---------- */
function valueNoise2D(seed = 1) {
  const P = new Uint8Array(512); const r = mulberry(seed);
  const p = [...Array(256).keys()].sort(() => r() - 0.5); for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const fade = t => t * t * (3 - 2 * t);
  const g = (x, y) => P[P[x & 255] + (y & 255)] / 255;
  return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y); const xf = fade(x - xi), yf = fade(y - yi);
    return lerp(lerp(g(xi, yi), g(xi + 1, yi), xf), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), xf), yf); };
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function marbleTexture(tint = [255, 255, 255], vein = [120, 118, 125], seed = 3) {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d'), img = ctx.createImageData(S, S), n = valueNoise2D(seed);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let turb = 0, a = 1, f = 1 / 64;
    for (let o = 0; o < 5; o++) { turb += a * n(x * f, y * f); a *= 0.5; f *= 2; }
    const v = Math.abs(Math.sin((x * 0.012 + y * 0.02) + turb * 5.5));
    const veinAmt = Math.pow(1 - v, 9) * 0.85 + Math.pow(1 - v, 2.5) * 0.12;
    const cloud = n(x / 90 + 30, y / 90) * 0.08;
    const i = (y * S + x) * 4;
    for (let k = 0; k < 3; k++) img.data[i + k] = lerp(tint[k] * (1 - cloud), vein[k], veinAmt);
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function puffTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const ctx = c.getContext('2d');
  const r = mulberry(7);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.7) * S * 0.28;
    const x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * 0.7, rad = S * (0.08 + r() * 0.16);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function crackTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  const r = mulberry(11);
  ctx.strokeStyle = '#ff5a14'; ctx.shadowColor = '#ff3000'; ctx.shadowBlur = 12; ctx.lineCap = 'round';
  for (let k = 0; k < 16; k++) {
    let x = r() * S, y = r() * S; ctx.lineWidth = 1 + r() * 3; ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 14; s++) { x += (r() - 0.5) * 60; y += (r() - 0.3) * 50; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

/* ---------- Материалы ---------- */
function makeMaterials() {
  const marbleMap = marbleTexture();
  const warmMap = marbleTexture([250, 244, 232], [150, 128, 110], 9);
  return {
    marble: new THREE.MeshPhysicalMaterial({ map: marbleMap, roughness: 0.32, clearcoat: 0.55, clearcoatRoughness: 0.28, color: 0xffffff }),
    marbleWarm: new THREE.MeshPhysicalMaterial({ map: warmMap, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
    gold: new THREE.MeshPhysicalMaterial({ color: 0xf0c470, metalness: 1, roughness: 0.26, clearcoat: 0.3, envMapIntensity: 2.2 }),
    obsidian: new THREE.MeshPhysicalMaterial({ color: 0x0b0707, metalness: 0.3, roughness: 0.18, envMapIntensity: 0.3, clearcoat: 1, clearcoatRoughness: 0.05,
      emissive: 0xffffff, emissiveMap: crackTexture(), emissiveIntensity: 1.6 }),
    feather: new THREE.MeshPhysicalMaterial({ color: 0xf4efe6, roughness: 0.5, sheen: 1, sheenColor: new THREE.Color(0xfff6e8), sheenRoughness: 0.4, side: THREE.DoubleSide }),
    water: new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.75, clearcoat: 1 }),
    pomegranate: new THREE.MeshPhysicalMaterial({ color: 0x8a0412, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 0.5, sheenColor: new THREE.Color(0xff4060) }),
  };
}

/* ---------- Геометрия ---------- */
function fluted(geo, r, n = 20, depth = 0.05) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const rad = Math.hypot(v.x, v.z); if (rad < r * 0.6) continue;
    const a = Math.atan2(v.z, v.x);
    const k = 1 - depth * Math.pow(Math.abs(Math.cos(a * n * 0.5)), 0.6);
    p.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  geo.computeVertexNormals(); return geo;
}

function lathe(points, seg = 64) { return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg); }

function column(M, h = 9, r = 0.6, mat = M.marble) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(lathe([[0, 0], [r * 1.55, 0], [r * 1.55, 0.25], [r * 1.35, 0.35], [r * 1.38, 0.5], [r * 1.15, 0.62], [r * 1.1, 0.75], [0, 0.75]]), mat);
  const shaft = new THREE.Mesh(fluted(new THREE.CylinderGeometry(r * 0.9, r, h, 96, 30), r, 20, 0.06), mat);
  shaft.position.y = 0.75 + h / 2;
  const cap = new THREE.Mesh(lathe([[0, 0], [r * 0.95, 0], [r * 1.05, 0.12], [r * 1.35, 0.4], [r * 1.5, 0.55], [0, 0.55]]), mat);
  cap.position.y = 0.75 + h;
  const abacus = new THREE.Mesh(new THREE.BoxGeometry(r * 3.4, 0.35, r * 3.4), mat);
  abacus.position.y = 0.75 + h + 0.72;
  g.add(base, shaft, cap, abacus);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.height = h + 1.6;
  return g;
}

function platform(M, r = 10, mat = M.marble) {
  const g = new THREE.Group();
  for (let s = 0; s < 3; s++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r + s * 1.2, r + s * 1.2 + 0.1, 0.5, 96), mat);
    m.position.y = -s * 0.5 - 0.25; m.receiveShadow = true; g.add(m);
  }
  // каменное «корневище» под островом
  const rock = new THREE.Mesh(displaced(new THREE.ConeGeometry(r + 2, r * 1.3, 48, 10, true), 0.9, 5), mat);
  rock.rotation.x = Math.PI; rock.position.y = -1.5 - r * 0.65; g.add(rock);
  return g;
}

function displaced(geo, amt = 0.4, seed = 1) {
  const p = geo.attributes.position, v = new THREE.Vector3(), r = mulberry(seed);
  const off = [r() * 10, r() * 10, r() * 10];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = Math.sin(v.x * 1.3 + off[0]) * Math.cos(v.y * 1.7 + off[1]) * Math.sin(v.z * 1.1 + off[2]) +
              0.5 * Math.sin(v.x * 3.1 + v.z * 2.3 + off[1]);
    v.addScaledVector(v.clone().normalize(), n * amt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals(); return geo;
}

function draped(M, h = 6, mat = M.marble) {
  // абстрактная «статуя» в драпировке: силуэт вращения + складки
  const g = new THREE.Group();
  const prof = [[0, 0], [1.3, 0], [1.15, 1.2], [0.95, 2.6], [0.8, 3.6], [0.95, 4.3], [0.75, 4.75], [0.35, 4.95], [0, 5.0]];
  const geo = lathe(prof, 128);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), rad = Math.hypot(v.x, v.z);
    const fold = 1 + 0.07 * Math.sin(a * 9 + v.y * 0.8) * (1 - v.y / 5.5) + 0.03 * Math.sin(a * 23 - v.y * 2.1);
    p.setXYZ(i, v.x * fold * 0.85, v.y, v.z * fold * 0.7);
    void rad;
  }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, mat); body.scale.setScalar(h / 5);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 64, 48), mat);
  head.scale.set(0.85, 1.12, 0.95); head.position.y = h * 1.07;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.5, 32), mat); neck.position.y = h * 0.99;
  g.add(body, neck, head);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function featherGeo(len, wid) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.quadraticCurveTo(wid, len * 0.25, wid * 0.7, len * 0.8); s.quadraticCurveTo(wid * 0.35, len * 1.02, 0, len);
  s.quadraticCurveTo(-wid * 0.45, len * 0.6, -wid * 0.5, len * 0.3); s.quadraticCurveTo(-wid * 0.3, len * 0.05, 0, 0);
  const g = new THREE.ShapeGeometry(s, 10);
  // изгиб пера
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), x = p.getX(i); p.setZ(i, Math.sin((y / len) * Math.PI) * len * 0.08 + x * x * 0.15); }
  g.computeVertexNormals(); return g;
}

function wing(M, side = 1) {
  const g = new THREE.Group();
  const rows = [
    { n: 13, len: 1.6, wid: 0.55, rad: 2.0, spread: 1.6, z: 0.06 },
    { n: 15, len: 3.2, wid: 0.62, rad: 3.4, spread: 1.9, z: 0.03 },
    { n: 12, len: 5.8, wid: 0.75, rad: 5.2, spread: 2.2, z: 0 },
  ];
  rows.forEach((row, ri) => {
    const geo = featherGeo(row.len, row.wid);
    for (let i = 0; i < row.n; i++) {
      const t = i / (row.n - 1);
      const ang = lerp(0.15, row.spread, t);
      const f = new THREE.Mesh(geo, M.feather);
      const ax = Math.cos(ang) * row.rad * 0.55, ay = Math.sin(ang) * row.rad * 0.35 + 0.4;
      f.position.set(ax * side, ay, row.z - ri * 0.08);
      f.rotation.z = side * -(Math.PI / 2 - ang * 1.05) + (side > 0 ? 0 : 0);
      f.rotation.z = side > 0 ? -(Math.PI / 2 - ang) - 0.25 : (Math.PI / 2 - ang) + 0.25;
      f.rotation.y = side * 0.15;
      f.castShadow = true;
      g.add(f);
    }
  });
  return g;
}

/* ---------- Частицы ---------- */
function particles(count, spread, { color = 0xffe7a8, size = 0.12, rise = 0.3, additive = true, box = [1, 1, 1] } = {}) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), seed = new Float32Array(count);
  const r = mulberry(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (r() - 0.5) * spread * box[0]; pos[i * 3 + 1] = (r() - 0.5) * spread * box[1]; pos[i * 3 + 2] = (r() - 0.5) * spread * box[2];
    seed[i] = r();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uRise: { value: rise }, uSpan: { value: spread * box[1] }, uOpacity: { value: 1 } },
    vertexShader: `attribute float seed; uniform float uTime, uSize, uRise, uSpan; varying float vA;
      void main(){ vec3 p = position; p.y = mod(p.y + uTime*uRise*(0.4+seed) + uSpan*0.5, uSpan) - uSpan*0.5;
        p.x += sin(uTime*0.4 + seed*30.0)*0.6; p.z += cos(uTime*0.3 + seed*20.0)*0.6;
        vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
        gl_PointSize = uSize*(300.0/-mv.z)*(0.6+seed*0.8);
        vA = (0.5+0.5*sin(uTime*2.0+seed*40.0)) * smoothstep(uSpan*0.5, uSpan*0.3, abs(p.y)); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uColor, a*vA*uOpacity); }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; return pts;
}

function fountainWater(count = 1800) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), seed = new Float32Array(count * 2);
  const r = mulberry(5);
  for (let i = 0; i < count; i++) { seed[i * 2] = r(); seed[i * 2 + 1] = r(); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 2));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `attribute vec2 seed; uniform float uTime; varying float vA;
      void main(){ float T = 1.6; float t = mod(uTime + seed.x*T, T);
        float ang = seed.y*6.2831; float tier = step(0.55, seed.x);
        vec3 o = mix(vec3(0., 5.7, 0.), vec3(0., 3.35, 0.), tier);
        float sp = mix(1.25, 2.3, tier) * (0.85+seed.y*0.3);
        vec3 v = vec3(cos(ang)*sp, mix(2.6, 1.2, tier), sin(ang)*sp);
        vec3 p = o + v*t + vec3(0., -4.9*t*t, 0.);
        vec4 mv = modelViewMatrix*vec4(p,1.0); gl_Position = projectionMatrix*mv;
        gl_PointSize = 4.0*(30.0/-mv.z)*(0.6+seed.y);
        vA = smoothstep(0.0, 0.1, t) * (1.0 - t/T); }`,
    fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord-0.5); gl_FragColor = vec4(0.8,0.92,1.0, smoothstep(0.5,0.0,d)*vA*0.8); }`,
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; return pts;
}

function lightShaft(h = 30, r = 4, color = 0xfff1cc, op = 0.18) {
  const geo = new THREE.CylinderGeometry(r * 0.25, r, h, 48, 1, true);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOp: { value: op }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOp, uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float rim = pow(abs(dot(vN, vV)), 1.5); float fade = smoothstep(0.0, 0.4, vUv.y)*smoothstep(1.0, 0.7, vUv.y);
        float flick = 0.85 + 0.15*sin(uTime*1.3 + vUv.x*40.0);
        gl_FragColor = vec4(uColor, rim*fade*uOp*flick); }`,
  });
  return new THREE.Mesh(geo, mat);
}

/* ---------- Заголовок: многослойные 3D-буквы ---------- */
async function titleMesh(text) {
  try { await document.fonts.load('900 300px "Playfair Display"'); } catch { /* шрифт по умолчанию */ }
  const c = document.createElement('canvas'); c.width = 2048; c.height = 640;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '900 470px "Playfair Display", "Times New Roman", serif';
  ctx.fillText(text, 1024, 350);
  const tex = new THREE.CanvasTexture(c); tex.anisotropy = 8;
  const g = new THREE.Group();
  const W = 22, H = W * 640 / 2048, layers = 44, depth = 1.5;
  const geo = new THREE.PlaneGeometry(W, H);
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const shade = i === 0 ? 0.02 : lerp(0.2, 0.06, t);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, transparent: false, color: new THREE.Color(shade, shade, shade * 1.02), toneMapped: false, fog: false }));
    m.position.z = -t * depth;
    g.add(m);
  }
  // золотая кромка-сияние за буквами
  const glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.35, color: 0xffd98a, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false }));
  glow.position.z = -depth - 0.2; glow.scale.setScalar(1.03); g.add(glow);
  return g;
}

/* =================================================================== */

export async function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const DPR = Math.min(window.devicePixelRatio || 1, 1.6);
  renderer.setPixelRatio(DPR);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.autoClear = false;

  const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 600);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.fog = new THREE.FogExp2(0xeef3f9, 0.016);

  // облака
  let cloudScale = 0.42;
  const rt = new THREE.WebGLRenderTarget(2, 2, { type: THREE.HalfFloatType, depthBuffer: false });
  const sunDir = new THREE.Vector3(0.35, 0.55, -0.75).normalize();
  const U = {
    uSteps: { value: 46 }, uOct: { value: 5 }, uTime: { value: 0 }, uFill: { value: 0 }, uHell: { value: 0 }, uStorm: { value: 0 }, uFlash: { value: 0 }, uWhite: { value: 1 },
    uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
    uSkyTop: { value: hex3(PAL.heaven.top) }, uSkyBot: { value: hex3(PAL.heaven.bot) }, uLight: { value: hex3(PAL.heaven.light) },
    uDark: { value: hex3(PAL.heaven.dark) }, uSun: { value: hex3(PAL.heaven.sun) }, uSunDir: { value: sunDir },
  };
  const cloudMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: CLOUD_FRAG, uniforms: U, depthTest: false, depthWrite: false });
  const quadScene = new THREE.Scene(), quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(fsTriangle(), cloudMat); quad.frustumCulled = false; quadScene.add(quad);
  const blitMat = new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: BLIT_FRAG, uniforms: { tCloud: { value: rt.texture }, uTime: { value: 0 }, uVig: { value: 0.6 } }, depthTest: false, depthWrite: false });
  const blitScene = new THREE.Scene(); const blit = new THREE.Mesh(fsTriangle(), blitMat); blit.frustumCulled = false; blitScene.add(blit);

  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.fov = camera.aspect < 0.8 ? 68 : 52;
    camera.updateProjectionMatrix();
    rt.setSize(Math.max(2, Math.floor(innerWidth * cloudScale)), Math.max(2, Math.floor(innerHeight * cloudScale)));
  }
  addEventListener('resize', resize); resize();

  // свет
  const hemi = new THREE.HemisphereLight(0xffffff, 0xd8dde6, 1.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 120 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  const fireLight = new THREE.PointLight(0xff3a10, 0, 70, 1.6); scene.add(fireLight);
  const flashLight = new THREE.PointLight(0xdfe8ff, 0, 120, 1.2); scene.add(flashLight);

  const M = makeMaterials();
  const puff = puffTexture();
  const realms = {};
  const animators = [];
  const anim = f => animators.push(f);

  function addPuffs(group, n, seed, { radius = 26, y = [-6, 10], tint = 0xffffff, near = false } = {}) {
    const r = mulberry(seed);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: puff, color: tint, transparent: true, depthWrite: false, opacity: 0.55 + r() * 0.35, toneMapped: false, fog: true });
      const s = new THREE.Sprite(mat);
      const side = r() > 0.5 ? 1 : -1;
      const x = near ? (r() - 0.5) * 30 : side * (9 + r() * radius);
      s.position.set(x, lerp(y[0], y[1], r()), (r() - 0.5) * 40 + (near ? 8 : 0));
      const sc = 10 + r() * 18; s.scale.set(sc * 1.6, sc, 1);
      s.userData = { drift: (r() - 0.5) * 0.4, base: s.position.clone(), ph: r() * 10 };
      group.add(s);
      anim((t) => { s.position.x = s.userData.base.x + Math.sin(t * 0.05 + s.userData.ph) * 2 + t * s.userData.drift * 0.02 % 4; s.material.rotation = Math.sin(t * 0.03 + s.userData.ph) * 0.1; });
    }
  }

  function realmGroup(name) {
    const g = new THREE.Group(); g.position.copy(stationPos(REALMS[name].i)); g.visible = false; scene.add(g); realms[name] = g; return g;
  }

  /* --- INTRO: гигантские буквы --- */
  const intro = realmGroup('intro');
  const title = await titleMesh('ДВОЕ');
  title.position.set(0, -9, -6); intro.add(title);
  addPuffs(intro, 14, 2);
  const dustIntro = particles(500, 40, { size: 0.09, rise: 0.25 }); intro.add(dustIntro);
  let titleT = -1;
  anim((t, dt) => {
    dustIntro.material.uniforms.uTime.value = t;
    if (titleT >= 0) titleT += dt;
    const k = titleT < 0 ? 0 : ease(Math.min(1, titleT / 4.2));
    title.position.y = lerp(-11, 3.6, k) + Math.sin(t * 0.6) * 0.18 * k;
    title.position.z = lerp(-16, -4, k);
    title.rotation.x = lerp(0.6, 0, k) + mouse.y * 0.08;
    title.rotation.y = mouse.x * 0.18 + Math.sin(t * 0.3) * 0.03;
    title.scale.setScalar(Math.min(1, camera.aspect / 0.95));
  });

  /* --- PROLOGUE --- */
  const pro = realmGroup('prologue');
  addPuffs(pro, 16, 3);
  const dustPro = particles(700, 40, { size: 0.08, rise: 0.15 }); pro.add(dustPro);
  const ringsPro = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2 + i * 1.4, 0.045, 16, 200), M.gold);
    ring.rotation.set(Math.PI / 2 + i * 0.4, i * 0.6, 0); ringsPro.add(ring);
  }
  ringsPro.position.set(0, 2, -8); pro.add(ringsPro);
  anim(t => { dustPro.material.uniforms.uTime.value = t; ringsPro.children.forEach((r, i) => { r.rotation.y = t * 0.12 * (i + 1); r.rotation.x += 0.0008 * (i + 1); }); });

  /* --- BIO: Сад Эдема, фонтан и золотое яблоко --- */
  const bio = realmGroup('bio');
  const pf1 = platform(M, 11); pf1.position.set(0, -4.5, -9); bio.add(pf1);
  const fountain = new THREE.Group();
  const basin = new THREE.Mesh(lathe([[0, 0], [4.6, 0], [4.8, 0.2], [4.8, 1.0], [4.5, 1.05], [4.4, 0.4], [0, 0.4]], 128), M.marble);
  const stem = new THREE.Mesh(lathe([[0, 0], [0.9, 0], [0.55, 0.6], [0.45, 2.2], [0.7, 2.9], [0, 2.9]], 64), M.marble);
  const bowl = new THREE.Mesh(lathe([[0, 2.85], [0.6, 2.85], [2.2, 3.15], [2.4, 3.45], [2.25, 3.5], [0.4, 3.2], [0, 3.2]], 96), M.marble);
  const stem2 = new THREE.Mesh(lathe([[0, 3.2], [0.4, 3.2], [0.28, 4.6], [0.5, 5.2], [0.15, 5.7], [0, 5.7]], 48), M.marble);
  const water1 = new THREE.Mesh(new THREE.CircleGeometry(4.45, 96), M.water); water1.rotation.x = -Math.PI / 2; water1.position.y = 0.85;
  const water2 = new THREE.Mesh(new THREE.CircleGeometry(2.15, 64), M.water); water2.rotation.x = -Math.PI / 2; water2.position.y = 3.38;
  const spray = fountainWater();
  fountain.add(basin, stem, bowl, stem2, water1, water2, spray);
  fountain.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  fountain.position.set(0, -4.5, -9); bio.add(fountain);
  const apple = new THREE.Group();
  const appleBody = new THREE.Mesh(lathe(Array.from({ length: 24 }, (_, i) => { const a = (i / 23) * Math.PI; return [Math.sin(a) * (0.9 + 0.12 * Math.sin(a * 2)), -Math.cos(a) * 0.95 + (i < 3 || i > 20 ? 0.12 * (i < 3 ? 1 : -1) : 0)]; }), 64), M.gold);
  const leaf = new THREE.Mesh(featherGeo(0.9, 0.35), M.gold); leaf.position.set(0.05, 0.9, 0); leaf.rotation.z = -0.8;
  apple.add(appleBody, leaf); apple.position.set(5.5, 3.2, -6); bio.add(apple);
  for (let i = 0; i < 4; i++) { const cl = column(M, 6 + (i % 2) * 2.5, 0.5); cl.position.set(i < 2 ? -9 - i * 3 : 9 + (i - 2) * 3, -4.5, -13 - (i % 2) * 3); bio.add(cl); }
  addPuffs(bio, 16, 4);
  anim(t => { spray.material.uniforms.uTime.value = t; apple.rotation.y = t * 0.5; apple.position.y = 3.2 + Math.sin(t * 0.9) * 0.4; });

  /* --- TEMPLE: колоннада --- */
  const temple = realmGroup('temple');
  const pf2 = platform(M, 14, M.marbleWarm); pf2.position.set(0, -5, -12); temple.add(pf2);
  const colTemple = new THREE.Group();
  for (let row = 0; row < 2; row++) for (let i = 0; i < 6; i++) {
    const broken = (row === 1 && i === 4) || (row === 0 && i === 1);
    const cl = column(M, broken ? 4.5 : 10, 0.62, M.marbleWarm);
    cl.position.set(row === 0 ? -6.5 : 6.5, 0, -i * 4.2 + 4); colTemple.add(cl);
  }
  const fallen = column(M, 8, 0.62, M.marbleWarm); fallen.rotation.z = Math.PI / 2 - 0.08; fallen.rotation.y = 0.5; fallen.position.set(-1.5, 0.7, -2); colTemple.add(fallen);
  const archi = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 22), M.marbleWarm); archi.position.set(-6.5, 12.4, -6.5); archi.castShadow = true; colTemple.add(archi);
  colTemple.position.set(0, -5, -12); temple.add(colTemple);
  const statue = draped(M, 5.2, M.marble); statue.position.set(0, -5, -18); temple.add(statue);
  addPuffs(temple, 16, 5);
  temple.add(lightShaft(34, 5, 0xffe4b0, 0.12)).children.at(-1).position.set(0, 10, -18);
  anim(t => { temple.children.forEach(c => c.material?.uniforms?.uTime && (c.material.uniforms.uTime.value = t)); statue.rotation.y = Math.sin(t * 0.15) * 0.25; });

  /* --- ANGELS: крылья и нимб --- */
  const angels = realmGroup('angels');
  const angel = new THREE.Group();
  const wL = wing(M, -1), wR = wing(M, 1);
  wL.position.x = -0.4; wR.position.x = 0.4;
  const figure = draped(M, 4.2, M.marble); figure.position.y = -4.4;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.06, 24, 160), new THREE.MeshBasicMaterial({ color: 0xffe2a0, toneMapped: false }));
  halo.rotation.x = Math.PI / 2.3; halo.position.y = 0.55;
  const haloGlow = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.22, 16, 120), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  haloGlow.rotation.copy(halo.rotation); haloGlow.position.copy(halo.position);
  angel.add(wL, wR, figure, halo, haloGlow);
  angel.position.set(0, 1.5, -10); angel.scale.setScalar(1.15); angels.add(angel);
  angels.add(lightShaft(40, 7, 0xffffff, 0.14)).children.at(-1).position.set(0, 14, -10);
  const feathersFall = particles(140, 30, { size: 0.25, rise: -0.4, color: 0xffffff, additive: false }); angels.add(feathersFall);
  addPuffs(angels, 18, 6);
  anim(t => {
    const flap = Math.sin(t * 0.9) * 0.12;
    wL.rotation.y = -0.35 - flap; wR.rotation.y = 0.35 + flap;
    wL.rotation.z = flap * 0.4; wR.rotation.z = -flap * 0.4;
    angel.position.y = 1.5 + Math.sin(t * 0.7) * 0.35;
    feathersFall.material.uniforms.uTime.value = t;
    angels.children.forEach(c => c.material?.uniforms?.uTime && (c.material.uniforms.uTime.value = t));
  });

  /* --- SCALES: золотые весы --- */
  const scales = realmGroup('scales');
  const sc = new THREE.Group();
  const pillar = new THREE.Mesh(lathe([[0, 0], [2.2, 0], [2.2, 0.3], [1.2, 0.6], [0.35, 1.2], [0.3, 7.5], [0.5, 7.8], [0.25, 8.2], [0, 8.2]], 96), M.gold);
  const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.45, 48, 32), M.gold); pivot.position.y = 8.4;
  const beam = new THREE.Group(); beam.position.y = 8.4;
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 12, 24), M.gold); bar.rotation.z = Math.PI / 2; beam.add(bar);
  [-6, 6].forEach(x => { const knob = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), M.gold); knob.position.x = x; beam.add(knob); });
  const pans = [-6, 6].map(x => {
    const pg = new THREE.Group();
    const pan = new THREE.Mesh(lathe([[0, 0], [1.9, 0.25], [2.1, 0.6], [2.0, 0.62], [1.8, 0.3], [0, 0.08]], 96), M.gold);
    pan.position.y = -4.4; pg.add(pan);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const end = new THREE.Vector3(Math.cos(a) * 1.9, -4.0, Math.sin(a) * 1.9);
      const len = end.length();
      const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 6), M.gold);
      ch.position.copy(end.clone().multiplyScalar(0.5));
      ch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().normalize());
      pg.add(ch);
    }
    const grains = particles(90, 2.6, { size: 0.16, rise: 0, box: [1.2, 0.08, 1.2], color: 0xffd36a }); grains.position.y = -3.9; pg.add(grains);
    pg.userData.grains = grains;
    pg.userData.x = x; scales.add(pg); return pg;
  });
  sc.add(pillar, pivot, beam); sc.traverse(o => { if (o.isMesh) o.castShadow = true; });
  sc.position.set(0, -6, -10); pans.forEach(p => sc.add(p)); scales.add(sc);
  const pfS = platform(M, 9, M.marbleWarm); pfS.position.set(0, -6, -10); scales.add(pfS);
  const dustS = particles(600, 36, { size: 0.1, rise: 0.2, color: 0xffd98a }); scales.add(dustS);
  addPuffs(scales, 16, 7, { tint: 0xfff3dc });
  let tilt = 0, tiltTarget = 0;
  anim((t, dt) => {
    tilt += (tiltTarget - tilt) * Math.min(1, dt * 3);
    beam.rotation.z = tilt + Math.sin(t * 0.8) * 0.012;
    pans.forEach(p => { const x = p.userData.x; p.position.set(Math.cos(beam.rotation.z) * x, 8.4 + Math.sin(beam.rotation.z) * x, 0); p.rotation.y = Math.sin(t * 0.4 + x) * 0.05; p.userData.grains.material.uniforms.uTime.value = t; });
    dustS.material.uniforms.uTime.value = t;
  });

  /* --- ARCHES: анфилада --- */
  const arches = realmGroup('arches');
  const anf = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const a = new THREE.Group();
    const cl = column(M, 7, 0.45), cr = column(M, 7, 0.45);
    cl.position.x = -4; cr.position.x = 4;
    const arc = new THREE.Mesh(new THREE.TorusGeometry(4, 0.42, 24, 96, Math.PI), M.marble);
    arc.position.y = 8.9; arc.castShadow = true;
    a.add(cl, cr, arc); a.position.z = -i * 6; anf.add(a);
    const tile = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.4, 5.6), M.marbleWarm); tile.position.set(0, -0.2, -i * 6); tile.receiveShadow = true; anf.add(tile);
  }
  anf.position.set(0, -5, -4); arches.add(anf);
  addPuffs(arches, 18, 8);
  anim(t => { anf.children.forEach((c, i) => { if (c.isGroup) c.position.y = Math.sin(t * 0.5 + i * 0.7) * 0.12; }); });

  /* --- STORM: обломки и молнии --- */
  const storm = realmGroup('storm');
  const rocks = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const r = mulberry(100 + i);
    const m = new THREE.Mesh(displaced(new THREE.IcosahedronGeometry(0.6 + r() * 1.6, 4), 0.25, i), i % 3 ? M.marble : M.marbleWarm);
    m.position.set((r() - 0.5) * 26, (r() - 0.5) * 12 + 1, -6 - r() * 18);
    m.userData = { rs: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.4), ph: r() * 6 };
    m.castShadow = true; rocks.add(m);
  }
  const brokenHead = draped(M, 3, M.marble); brokenHead.rotation.z = 1.1; brokenHead.position.set(3, -1, -10); rocks.add(brokenHead);
  const c1 = column(M, 5, 0.6); c1.rotation.set(0.4, 0, -0.9); c1.position.set(-6, -2, -9); rocks.add(c1);
  storm.add(rocks);
  const boltMat = new THREE.LineBasicMaterial({ color: 0xe9f0ff, transparent: true, opacity: 0, toneMapped: false });
  const bolt = new THREE.Line(new THREE.BufferGeometry(), boltMat); storm.add(bolt);
  addPuffs(storm, 18, 9, { tint: 0x9aa2b0 });
  let nextFlash = 3, flash = 0;
  function makeBolt() {
    const r = Math.random, pts = []; let x = (r() - 0.5) * 30, y = 26, z = -14 - r() * 10;
    while (y > -8) { pts.push(new THREE.Vector3(x, y, z)); x += (r() - 0.5) * 3.5; y -= 1 + r() * 2.2; z += (r() - 0.5) * 1.5; }
    bolt.geometry.dispose(); bolt.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }
  anim((t, dt) => {
    rocks.children.forEach(m => { if (m.userData.rs) { m.rotation.x += m.userData.rs.x * dt; m.rotation.y += m.userData.rs.y * dt; m.position.y += Math.sin(t * 0.6 + m.userData.ph) * 0.004; } });
    if (current === 'storm' || target === 'storm') {
      nextFlash -= dt;
      if (nextFlash < 0) { flash = 1; makeBolt(); nextFlash = 2.5 + Math.random() * 5; }
    }
    flash = Math.max(0, flash - dt * 2.8);
    const f = flash > 0 ? flash * (0.6 + 0.4 * Math.sin(t * 90)) : 0;
    boltMat.opacity = f; U.uFlash.value = f * 0.55 * palMix.storm; flashLight.intensity = f * 300 * palMix.storm;
  });
  flashLight.position.set(0, 18, -REALMS.storm.i * SPACING - 12);

  /* --- HADES: обсидиановые врата, угли, гранат Персефоны --- */
  const hades = realmGroup('hades');
  const gate = new THREE.Group();
  const gpL = new THREE.Mesh(displaced(new THREE.BoxGeometry(2.6, 18, 2.6, 6, 30, 6), 0.12, 3), M.obsidian); gpL.position.set(-6, 4, 0);
  const gpR = gpL.clone(); gpR.position.x = 6;
  const lint = new THREE.Mesh(displaced(new THREE.BoxGeometry(17, 2.6, 3.2, 30, 6, 6), 0.12, 4), M.obsidian); lint.position.y = 13.5;
  const lint2 = new THREE.Mesh(new THREE.BoxGeometry(19, 0.8, 3.8), M.obsidian); lint2.position.y = 15.1;
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(9.4, 12.2), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){ vec2 q = vUv*vec2(3.,4.); float f = 0.; float a = .5; vec2 p = q + vec2(0., -uTime*0.6);
        for(int i=0;i<5;i++){ f += a*n(p); p *= 2.1; a *= .5; }
        float edge = smoothstep(0.0, 0.18, vUv.x)*smoothstep(1.0, 0.82, vUv.x)*smoothstep(0.0,0.1,vUv.y)*smoothstep(1.0,0.9,vUv.y);
        float glow = pow(f, 2.2)*1.8*(1.0-vUv.y*0.6);
        vec3 col = mix(vec3(0.02,0.0,0.0), vec3(1.0,0.32,0.05), glow) + vec3(1.,.7,.3)*pow(glow,4.)*0.6;
        gl_FragColor = vec4(col, edge*0.97); }`,
  }));
  portal.position.set(0, 6.2, 0.2);
  gate.add(gpL, gpR, lint, lint2, portal);
  gate.traverse(o => { if (o.isMesh && o !== portal) o.castShadow = true; });
  gate.position.set(0, -6, -14); hades.add(gate);
  const pfH = platform(M, 12, M.obsidian); pfH.position.set(0, -6, -12); hades.add(pfH);
  const embers = particles(1400, 46, { size: 0.14, rise: 1.6, color: 0xff6a1a }); hades.add(embers);
  const ash = particles(600, 46, { size: 0.1, rise: -0.3, color: 0x3a2a2a, additive: false }); hades.add(ash);
  const pom = new THREE.Group();
  const pomBody = new THREE.Mesh(lathe(Array.from({ length: 26 }, (_, i) => { const a = (i / 25) * Math.PI; return [Math.sin(a) * (1 + 0.06 * Math.sin(a * 5)), -Math.cos(a)]; }), 72), M.pomegranate);
  const crown = new THREE.Group();
  for (let k = 0; k < 6; k++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 8), M.pomegranate); const a = k / 6 * Math.PI * 2; s.position.set(Math.cos(a) * 0.22, 1.12, Math.sin(a) * 0.22); s.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); crown.add(s); }
  pom.add(pomBody, crown); pom.position.set(-7.5, 3.5, -6); hades.add(pom);
  for (let i = 0; i < 6; i++) { const cl = column(M, 5 + (i % 3) * 3.5, 0.55, M.obsidian); cl.position.set(i < 3 ? -12 - i * 2.4 : 12 + (i - 3) * 2.4, -6, -10 - (i % 3) * 4); cl.rotation.z = (i % 2 ? 0.08 : -0.06); hades.add(cl); }
  addPuffs(hades, 18, 10, { tint: 0x3a0c08 });
  anim(t => {
    embers.material.uniforms.uTime.value = t; ash.material.uniforms.uTime.value = t;
    portal.material.uniforms.uTime.value = t;
    M.obsidian.emissiveIntensity = 1.3 + Math.sin(t * 1.7) * 0.5;
    pom.rotation.y = t * 0.35; pom.position.y = 3.5 + Math.sin(t * 0.8) * 0.3;
    fireLight.intensity = palMix.hell * (180 + Math.sin(t * 7) * 30 + Math.sin(t * 13) * 20);
  });
  fireLight.position.set(0, -2, -REALMS.hades.i * SPACING - 8);

  /* --- MIRROR: волшебное зеркало --- */
  const mirror = realmGroup('mirror');
  const mframe = new THREE.Mesh(new THREE.TorusGeometry(5, 0.38, 48, 220), M.gold);
  const frame2 = new THREE.Mesh(new THREE.TorusGeometry(5.6, 0.12, 24, 220), M.gold);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(4.8, 128), new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      void main(){ vec2 q = vUv-0.5; float r = length(q); float a = atan(q.y,q.x);
        vec2 p = vec2(a*1.5 + uTime*0.05 + r*3.0, r*6.0 - uTime*0.15);
        float f = 0.; float am = .5; for(int i=0;i<5;i++){ f += am*n(p*2.0); p *= 2.0; am *= .5; }
        vec3 c = mix(vec3(1.0,0.96,0.94), vec3(0.93,0.78,0.78), f);
        c += vec3(1.0,0.9,0.7)*pow(1.0-r*2.0, 3.0)*0.5;
        float stars = step(0.996, h(floor(vUv*300.0)))*0.8*(0.5+0.5*sin(uTime*3.0+h(floor(vUv*300.0))*50.));
        gl_FragColor = vec4(c + stars, 1.0); }`,
  }));
  glass.position.z = -0.05;
  const mir = new THREE.Group(); mir.add(mframe, frame2, glass); mir.position.set(0, 2, -11); mirror.add(mir);
  addPuffs(mirror, 18, 11, { tint: 0xfff0ea });
  const dustM = particles(500, 34, { size: 0.08, rise: 0.15, color: 0xffd8c8 }); mirror.add(dustM);
  anim(t => { glass.material.uniforms.uTime.value = t; mir.rotation.y = Math.sin(t * 0.25) * 0.12; frame2.rotation.z = t * 0.1; dustM.material.uniforms.uTime.value = t; });

  /* --- ORACLE: солнце и кольца --- */
  const oracle = realmGroup('oracle');
  const sunDisk = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){ vec2 q = vUv-0.5; float r = length(q); float a = atan(q.y,q.x);
      float rays = pow(0.5+0.5*sin(a*24.0 + uTime*0.2), 8.0)*smoothstep(0.5, 0.05, r)*0.5 + pow(0.5+0.5*sin(a*9.0 - uTime*0.13), 6.0)*smoothstep(0.5,0.1,r)*0.3;
      float core = smoothstep(0.12, 0.0, r) + smoothstep(0.35, 0.0, r)*0.35;
      vec3 c = vec3(1.0,0.82,0.48)*(rays + core);
      gl_FragColor = vec4(c, clamp(rays+core,0.,1.)); }`,
  }));
  sunDisk.position.set(0, 4, -30); oracle.add(sunDisk);
  const orbits = new THREE.Group();
  for (let i = 0; i < 5; i++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(4 + i * 1.6, 0.05 + (i % 2) * 0.04, 16, 240), M.gold); ring.rotation.set(Math.PI / 2 + (i - 2) * 0.25, i * 0.5, 0); orbits.add(ring); }
  orbits.position.set(0, 2, -14); oracle.add(orbits);
  const twin = [0, 1].map(k => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.6, 48, 32), k ? M.gold : M.marble); orbits.add(s); return s; });
  const dustO = particles(900, 44, { size: 0.12, rise: 0.3, color: 0xffd98a }); oracle.add(dustO);
  addPuffs(oracle, 18, 12, { tint: 0xfff4de });
  anim(t => {
    sunDisk.material.uniforms.uTime.value = t; dustO.material.uniforms.uTime.value = t;
    orbits.children.forEach((r, i) => { if (r.geometry.type === 'TorusGeometry') r.rotation.z = t * 0.05 * (i + 1); });
    twin.forEach((s, k) => { const a = t * 0.4 + k * Math.PI; s.position.set(Math.cos(a) * 6, Math.sin(a * 0.5) * 1.2, Math.sin(a) * 6); });
  });

  /* ---------- Движение камеры между мирами ---------- */
  let current = 'intro', target = 'intro';
  const camBase = new THREE.Vector3(), from = new THREE.Vector3(), to = new THREE.Vector3();
  const camOffset = new THREE.Vector3(0, 1.2, 14);
  camBase.copy(stationPos(0)).add(camOffset);
  let travel = null; // {t, dur, from, to, dip, resolve, fromPal, toPal}
  const palMix = { hell: 0, storm: 0 };
  const palCur = clonePal(PAL.heaven);
  let palFrom = clonePal(PAL.heaven), palTo = clonePal(PAL.heaven);
  realms.intro.visible = true;
  let whiteTarget = 0;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', e => { mouse.tx = (e.clientX / innerWidth - 0.5) * 2; mouse.ty = (e.clientY / innerHeight - 0.5) * 2; });

  function clonePal(p) { return { top: hex3(p.top), bot: hex3(p.bot), light: hex3(p.light), dark: hex3(p.dark), sun: hex3(p.sun), fog: new THREE.Color(p.fog), hell: p.hell, storm: p.storm }; }
  function applyPal(k) {
    for (const key of ['top', 'bot', 'light', 'dark', 'sun']) palCur[key].lerpVectors(palFrom[key], palTo[key], k);
    palCur.fog.lerpColors(palFrom.fog, palTo.fog, k);
    palMix.hell = lerp(palFrom.hell, palTo.hell, k); palMix.storm = lerp(palFrom.storm, palTo.storm, k);
    U.uSkyTop.value.copy(palCur.top); U.uSkyBot.value.copy(palCur.bot); U.uLight.value.copy(palCur.light); U.uDark.value.copy(palCur.dark); U.uSun.value.copy(palCur.sun);
    U.uHell.value = palMix.hell; U.uStorm.value = palMix.storm;
    scene.fog.color.copy(palCur.fog);
    hemi.intensity = lerp(1.1, 0.25, palMix.hell) * lerp(1, 0.6, palMix.storm);
    hemi.color.setRGB(lerp(1, 0.6, palMix.hell), lerp(1, 0.25, palMix.hell), lerp(1, 0.2, palMix.hell));
    sun.intensity = lerp(2.6, 0.5, palMix.hell) * lerp(1, 0.35, palMix.storm);
    sun.color.setRGB(1, lerp(0.95, 0.4, palMix.hell), lerp(0.87, 0.25, palMix.hell));
    blitMat.uniforms.uVig.value = lerp(0.6, 1.8, Math.max(palMix.hell, palMix.storm * 0.7));
    scene.fog.density = lerp(0.016, 0.022, palMix.hell);
  }

  function goTo(name, { dur = 3.2 } = {}) {
    if (!REALMS[name] || name === target) return Promise.resolve();
    return new Promise(resolve => {
      const prev = target;
      target = name;
      realms[name].visible = true;
      from.copy(camBase);
      to.copy(stationPos(REALMS[name].i)).add(camOffset);
      const dip = name === 'hades' ? -1 : prev === 'hades' ? 1 : 0;
      palFrom = { ...clonePal(PAL.heaven) };
      for (const k of ['top', 'bot', 'light', 'dark', 'sun']) palFrom[k] = palCur[k].clone();
      palFrom.fog = palCur.fog.clone(); palFrom.hell = palMix.hell; palFrom.storm = palMix.storm;
      palTo = clonePal(PAL[REALMS[name].pal]);
      travel = { t: 0, dur, dip, resolve, prev };
    });
  }

  function setScales(values) {
    if (!values || !values.length) { tiltTarget = 0; return; }
    const total = values.reduce((a, b) => a + b, 0) || 1;
    // левая чаша — первые аспекты, правая — последние; центр — нейтрален
    const left = values[0] + values[1] + values[2] * 0.5, right = values[3] + values[4] + values[2] * 0.5;
    tiltTarget = ((left - right) / total) * 0.32;
    pans[0].userData.grains.material.uniforms.uOpacity.value = Math.min(1, left / 5);
    pans[1].userData.grains.material.uniforms.uOpacity.value = Math.min(1, right / 5);
  }

  let shake = 0;
  function pulse(power = 1) { shake = Math.max(shake, 0.25 * power); }

  function startIntro() { titleT = 0; whiteTarget = 0; }

  /* ---------- Цикл ---------- */
  const clock = new THREE.Clock();
  let frames = 0, acc = 0, t = 0;
  function frame() {
    const dt = Math.min(0.05, clock.getDelta()); t += dt;
    // адаптивное разрешение облаков
    frames++; acc += dt;
    if (acc > 2) { const fps = frames / acc; if (fps < 38 && cloudScale > 0.24) { cloudScale -= 0.06; resize(); } else if (fps > 58 && cloudScale < 0.5) { cloudScale += 0.03; resize(); } frames = 0; acc = 0; }

    mouse.x += (mouse.tx - mouse.x) * 0.04; mouse.y += (mouse.ty - mouse.y) * 0.04;

    let fill = 0;
    if (travel) {
      travel.t += dt;
      const k = Math.min(1, travel.t / travel.dur), e = ease(k);
      camBase.lerpVectors(from, to, e);
      camBase.y += travel.dip * Math.sin(Math.PI * e) * 20;
      fill = Math.sin(Math.PI * k) * 0.85;
      applyPal(Math.min(1, Math.max(0, (k - 0.25) / 0.5)));
      if (k >= 1) {
        realms[travel.prev] && (realms[travel.prev].visible = false);
        current = target; const r = travel.resolve; travel = null; r();
      }
    }
    U.uWhite.value += (whiteTarget - U.uWhite.value) * Math.min(1, dt * 0.9);
    U.uFill.value = fill;

    shake *= 0.9;
    camera.position.set(
      camBase.x + mouse.x * 1.2 + Math.sin(t * 0.21) * 0.4 + (Math.random() - 0.5) * shake,
      camBase.y - mouse.y * 0.6 + Math.sin(t * 0.33) * 0.3 + (Math.random() - 0.5) * shake,
      camBase.z);
    const look = new THREE.Vector3(camBase.x + mouse.x * 0.6, camBase.y + 0.6 - mouse.y * 0.3, camBase.z - 20);
    camera.lookAt(look);
    camera.updateMatrixWorld();

    // солнце-тень следует за станцией
    sun.position.copy(camBase).add(new THREE.Vector3(18, 30, -10)); sun.target.position.copy(camBase).add(new THREE.Vector3(0, -4, -14));

    for (const f of animators) f(t, dt);

    U.uTime.value = t; blitMat.uniforms.uTime.value = t;
    U.uInvProj.value.copy(camera.projectionMatrixInverse);
    U.uCamWorld.value.copy(camera.matrixWorld);
    U.uCamPos.value.copy(camera.position);

    renderer.setRenderTarget(rt); renderer.render(quadScene, quadCam);
    renderer.setRenderTarget(null); renderer.clear(); renderer.render(blitScene, quadCam);
    renderer.clearDepth(); renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  applyPal(1);
  frame();

  return { goTo, setScales, pulse, startIntro, get current() { return current; } };
}
