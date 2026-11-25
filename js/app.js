import { SECTIONS, ALL_ITEMS, SCALE_LABELS } from './content.js?v=7';
import { buildProfile, encodeProfile, decodeProfile, portrait, prophecy, clamp } from './engine.js?v=7';
import { createWorld } from './scene.js?v=7';

const $ = (s, el = document) => el.querySelector(s);
const ui = $('#ui');
const hud = $('#hud');
const modal = $('#modal');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } },
};

/* ---------- Состояние ---------- */
const state = {
  answers: {}, name: '', idx: 0,
  partnerCode: null, myCode: null,
};
function readHash() {
  const m = location.hash.match(/with=([A-Za-z0-9_-]+)/);
  if (m && decodeProfile(m[1])) state.partnerCode = m[1];
}
readHash();

// Шаги прохождения
const STEPS = [{ kind: 'vows', realm: 'prologue' }, { kind: 'name', realm: 'prologue' }];
SECTIONS.forEach((s, si) => {
  STEPS.push({ kind: 'section', section: s, realm: s.realm, si });
  s.items.forEach(item => STEPS.push({ kind: 'item', section: s, item, realm: s.realm, si }));
});
const TOTAL_ITEMS = ALL_ITEMS.length;

let world;

/* ---------- Переходы экранов ---------- */
let busy = false;
async function show(html, cls = '') {
  document.body.classList.toggle('reading', cls !== 'landing');
  const old = ui.firstElementChild;
  if (old) { old.classList.add('out'); await sleep(420); }
  ui.innerHTML = `<section class="screen ${cls}">${html}</section>`;
  ui.scrollTop = 0;
  return ui.firstElementChild;
}
function setDark(realm) { document.body.classList.toggle('dark', realm === 'hades' || realm === 'storm'); }
async function travel(realm) {
  if (world.current === realm) return;
  setDark(realm);
  await world.goTo(realm, { dur: realm === 'hades' || world.current === 'hades' ? 4.2 : 3 });
}
function toast(text) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
function ask({ title, text, yes, no }) {
  return new Promise(res => {
    $('.modal-card', modal).innerHTML = `<div class="big">${title}</div><p class="body">${text}</p><div class="row"><button class="btn" data-a="1">${yes}</button><button class="btn-ghost" data-a="0">${no}</button></div>`;
    modal.classList.remove('hidden');
    modal.onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; modal.classList.add('hidden'); res(b.dataset.a === '1'); };
  });
}

/* ---------- Титул ---------- */
function landing() {
  hud.classList.add('hidden');
  const partner = state.partnerCode ? decodeProfile(state.partnerCode) : null;
  const saved = store.get('dvoe.me');
  const savedP = saved && decodeProfile(saved.code);
  const kicker = partner ? `${esc(partner.name || 'Кто-то')} зовёт тебя к Оракулу` : 'Оракул совместимости';
  const sub = partner ? 'Пройди свой путь. Потом оракул покажет, что было бы с вами двумя.' : 'Тест, которого ещё не видел свет';
  let extra = '';
  if (savedP && partner) extra = `<button class="btn-ghost" id="use-saved">Сопоставить с моим отпечатком от ${fmtDay(savedP.day)}</button>`;
  else if (savedP) extra = `<button class="btn-ghost" id="use-saved">Мой последний отпечаток · ${fmtDay(savedP.day)}</button>`;
  show(`<div class="spacer"></div><div class="kicker">${kicker}</div><div class="sub">${sub}</div>
    <div><button class="btn-giant" id="start">НАЧАТЬ</button></div>${extra}`, 'landing').then(el => {
    $('#start', el).onclick = begin;
    const us = $('#use-saved', el);
    if (us) us.onclick = async () => {
      state.myCode = saved.code; state.name = savedP.name; state.heart = saved.heart;
      hud.classList.add('hidden');
      await travel('oracle');
      if (partner) showPair(); else showMine();
    };
  });
}
function fmtDay(day) { return new Date(day * 86400000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }); }

async function begin() {
  if (busy) return; busy = true;
  world.pulse(1.5);
  hud.classList.remove('hidden');
  state.idx = 0;
  const p = travel('prologue');
  ui.firstElementChild?.classList.add('out');
  await p;
  busy = false;
  render();
}

/* ---------- Рендер шага ---------- */
function progress() {
  const step = STEPS[state.idx];
  const done = STEPS.slice(0, state.idx).filter(s => s.kind === 'item').length;
  $('#hud-bar i').style.width = `${(done / TOTAL_ITEMS) * 100}%`;
  $('#hud-realm').textContent = step.section ? `${step.section.num} · ${step.section.title}` : 'Пролог';
}

async function render() {
  const step = STEPS[state.idx];
  if (!step) return finish();
  progress();
  if (step.realm && world.current !== step.realm) {
    ui.firstElementChild?.classList.add('out');
    await travel(step.realm);
  }
  world.setScales(step.item?.type === 'alloc' ? state.answers[step.item.id] || [0, 0, 0, 0, 0] : null);
  ({ vows: renderVows, name: renderName, section: renderSection, item: renderItem })[step.kind](step);
}

function next(delay = 0) {
  if (busy) return;
  busy = true;
  setTimeout(() => { busy = false; state.idx++; render(); }, delay);
}
$('#hud-back').onclick = () => {
  if (busy) return;
  if (state.idx === 0) { landing(); world.goTo('intro'); setDark('intro'); return; }
  state.idx--; render();
};

async function renderVows() {
  const el = await show(`
    <div class="kicker">Пролог</div>
    <div class="gap-s"></div>
    <div class="big">Прежде чем войти</div>
    <div class="vows">
      <div class="vow glass"><i>I</i><p><strong>Отвечай максимально честно.</strong> Не так, как правильно, и не так, как хочется выглядеть. Ложь не обманет оракула, она просто сделает пророчество чужим.</p></div>
      <div class="vow glass"><i>II</i><p><strong>Побудь сейчас совершенно один(одна).</strong> Никого рядом, никто не смотрит через плечо. Здесь нечего стесняться: некоторые вопросы будут о том, о чём не говорят вслух.</p></div>
      <div class="vow glass"><i>III</i><p><strong>Прислушайся к себе.</strong> Не думай о конкретном человеке. Чего хочешь именно ты, что чувствуешь именно ты. Первый ответ, который поднимается изнутри, почти всегда самый верный.</p></div>
      <div class="vow glass"><i>IV</i><p><strong>Оракул видит тебя сейчас</strong> — с сегодняшними эмоциями, опытом и ранами. Проходи заново раз в месяц или после важных событий: ты меняешься, и узор меняется вместе с тобой.</p></div>
    </div>
    <div class="gap"></div>
    <p class="hint">12–15 минут · 72 вопроса · 8 миров</p>
    <div class="gap-s"></div>
    <div><button class="btn" id="go">Я один(а). Я готов(а)</button></div>`);
  $('#go', el).onclick = () => next();
}

async function renderName() {
  const el = await show(`
    <div class="kicker">Пролог</div><div class="gap-s"></div>
    <div class="q">Как оракулу тебя называть?</div>
    <div class="gap"></div>
    <input class="name-input" id="nm" maxlength="18" placeholder="имя или тайное имя" value="${esc(state.name)}" autocomplete="off">
    <p class="hint">Его увидит только тот, с кем ты решишь сопоставить свою судьбу.</p>
    <div class="gap"></div><div><button class="btn" id="go">Дальше</button></div>`);
  const inp = $('#nm', el); setTimeout(() => inp.focus(), 600);
  const go = () => { state.name = inp.value.trim(); next(); };
  $('#go', el).onclick = go;
  inp.onkeydown = e => { if (e.key === 'Enter') go(); };
}

async function renderSection({ section: s }) {
  const el = await show(`
    <div class="numeral">${s.num}</div>
    <div class="gap-s"></div>
    <div class="huge">${s.title}</div>
    <div class="gap-s"></div>
    <div class="lead">${s.epigraph}</div>
    <div class="science glass"><b>Что говорит наука · ${s.sub}</b><p>${s.science}</p></div>
    <div class="gap"></div>
    <div><button class="btn" id="go">${s.realm === 'hades' ? 'Спуститься' : 'Войти'}</button></div>`);
  $('#go', el).onclick = () => next();
}

/* ---------- Типы вопросов ---------- */
function choose(id, v, el, selector, delay = 420) {
  state.answers[id] = v;
  el.querySelectorAll(selector).forEach(b => b.classList.toggle('sel', b.dataset.v === String(v)));
  world.pulse(0.5);
  next(delay);
}

async function renderItem({ item, section }) {
  const head = `<div class="kicker">${section.num} · ${section.title}</div><div class="gap-s"></div><div class="q">${item.q}</div>${item.hint ? `<p class="hint">${item.hint}</p>` : ''}`;
  const a = state.answers[item.id];
  let el;
  switch (item.type) {
    case 'yn': {
      el = await show(`${head}<div class="yn"><button class="glass ${a === 1 ? 'sel' : ''}" data-v="1">Да</button><button class="glass ${a === 0 ? 'sel' : ''}" data-v="0">Нет</button></div>`);
      el.querySelectorAll('.yn button').forEach(b => (b.onclick = () => choose(item.id, +b.dataset.v, el, '.yn button')));
      break;
    }
    case 'likert': {
      const labels = SCALE_LABELS[item.scale];
      el = await show(`${head}<div class="likert">${labels.map((l, i) => `<button class="lk glass ${a === i ? 'sel' : ''}" data-v="${i}"><span class="dot" style="width:${14 + i * 5}px;height:${14 + i * 5}px"></span>${l}</button>`).join('')}</div>`);
      el.querySelectorAll('.lk').forEach(b => (b.onclick = () => choose(item.id, +b.dataset.v, el, '.lk')));
      break;
    }
    case 'choice': {
      const opts = item.options.map((o, i) => (typeof o === 'string' ? { t: o, v: i } : o));
      el = await show(`${head}<div class="answers">${opts.map((o, i) => `<button class="opt glass ${a === o.v ? 'sel' : ''}" data-v="${o.v}"><span class="k">${i + 1}</span>${o.t}</button>`).join('')}</div>`);
      el.querySelectorAll('.opt').forEach(b => (b.onclick = () => { const v = isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v; choose(item.id, v, el, '.opt'); }));
      break;
    }
    case 'either': {
      el = await show(`${head}<div class="either">
        <button class="card glass ${a === 0 ? 'sel' : ''}" data-v="0"><h3>${item.a.t}</h3><p>${item.a.d}</p></button>
        <div class="or">или</div>
        <button class="card glass ${a === 1 ? 'sel' : ''}" data-v="1"><h3>${item.b.t}</h3><p>${item.b.d}</p></button></div>`);
      el.querySelectorAll('.card').forEach(b => (b.onclick = () => choose(item.id, +b.dataset.v, el, '.card', 360)));
      break;
    }
    case 'slider': {
      const v0 = a ?? Math.round((item.min + item.max) / 2);
      const fmt = item.fmt || String;
      el = await show(`${head}<div class="slider-wrap"><div class="slider-val" id="sv">${fmt(v0)}</div>
        <input type="range" class="range" min="${item.min}" max="${item.max}" step="1" value="${v0}" id="rg">
        <div class="slider-labels"><span>${item.labels[0]}</span><span>${item.labels[1]}</span></div></div>
        <div class="gap"></div><div><button class="btn" id="go">Дальше</button></div>`);
      const rg = $('#rg', el), sv = $('#sv', el);
      const paint = () => { const p = (rg.value - item.min) / (item.max - item.min) * 100; rg.style.background = `linear-gradient(90deg, var(--ink) ${p}%, var(--ink-faint) ${p}%)`; };
      paint();
      rg.oninput = () => { sv.textContent = fmt(+rg.value); sv.style.transform = 'scale(1.06)'; setTimeout(() => (sv.style.transform = ''), 160); paint(); };
      $('#go', el).onclick = () => { state.answers[item.id] = +rg.value; world.pulse(0.4); next(); };
      break;
    }
    case 'alloc': renderAlloc(item, section); break;
  }
}

async function renderAlloc(item, section) {
  const vals = (state.answers[item.id] || [0, 0, 0, 0, 0]).slice();
  const el = await show(`
    <div class="kicker">${section.num} · ${section.title}</div><div class="gap-s"></div>
    <div class="q">${item.q}</div><p class="hint">${item.hint}</p>
    <div class="pool" id="pool"><span class="n" id="left">10</span><span class="l">крупиц<br>осталось</span></div>
    <div class="alloc">${item.aspects.map((asp, i) => `
      <div class="arow glass" data-i="${i}">
        <div class="ico">${asp.ico}</div>
        <div><h4>${asp.t}</h4><p>${asp.d}</p></div>
        <div class="ctrl"><button data-d="-1" aria-label="Убрать">−</button><div class="pips">${'<span></span>'.repeat(10)}</div><span class="num">0</span><button data-d="1" aria-label="Добавить">+</button></div>
      </div>`).join('')}</div>
    <div class="gap"></div><div><button class="btn" id="go" disabled>Положить на весы</button></div>`);
  const total = item.total;
  const paint = () => {
    const used = vals.reduce((x, y) => x + y, 0), left = total - used;
    $('#left', el).textContent = left;
    $('#pool', el).classList.toggle('empty', left === 0);
    el.querySelectorAll('.arow').forEach((row, i) => {
      row.querySelectorAll('.pips span').forEach((p, k) => p.classList.toggle('on', k < vals[i]));
      $('.num', row).textContent = vals[i];
      row.querySelector('[data-d="1"]').disabled = left === 0;
      row.querySelector('[data-d="-1"]').disabled = vals[i] === 0;
      row.classList.toggle('hot', vals[i] >= 5);
    });
    $('#go', el).disabled = left !== 0;
    world.setScales(vals);
  };
  el.querySelectorAll('.arow').forEach((row, i) => {
    row.querySelectorAll('[data-d]').forEach(b => (b.onclick = () => {
      const d = +b.dataset.d, used = vals.reduce((x, y) => x + y, 0);
      if (d > 0 && used >= total) return;
      vals[i] = clamp(vals[i] + d, 0, total); world.pulse(0.15); paint();
    }));
    row.querySelector('.pips').onclick = e => {
      const span = e.target.closest('span'); if (!span) return;
      const k = [...row.querySelectorAll('.pips span')].indexOf(span) + 1;
      const others = vals.reduce((x, y, j) => x + (j === i ? 0 : y), 0);
      vals[i] = Math.min(k === vals[i] ? k - 1 : k, total - others); world.pulse(0.15); paint();
    };
  });
  paint();
  $('#go', el).onclick = async () => {
    const maxV = Math.max(...vals), mi = vals.indexOf(maxV);
    const zeros = vals.filter(v => v === 0).length;
    if (maxV >= 7) {
      const asp = item.aspects[mi];
      const rest = item.aspects.filter((_, j) => j !== mi).map(x => `«${x.t.toLowerCase()}»`).join(', ');
      const ok = await ask({
        title: `${maxV} из 10 — на одну чашу`,
        text: `Ты кладёшь почти всё на «${esc(asp.t.toLowerCase())}». Это значит, что ${rest} тебе от отношений почти не нужны. Так бывает очень редко. Чаще всего такой ответ говорит о сегодняшнем голоде: сейчас остро не хватает именно этого, и он заслоняет всё остальное. Это правда ты — всегда, а не только сегодня?`,
        yes: 'Да, это правда я', no: 'Пересмотрю',
      });
      if (!ok) return;
    } else if (zeros >= 3) {
      const ok = await ask({
        title: 'Три пустые чаши',
        text: 'Ты оставляешь пустыми три из пяти чаш. Это значит, что они тебе совсем не нужны, — не «меньше», а совсем. Большинство людей всё-таки нуждаются хотя бы в крупице каждого. Уверен(а)?',
        yes: 'Уверен(а)', no: 'Пересмотрю',
      });
      if (!ok) return;
    }
    state.answers[item.id] = vals.slice();
    world.pulse(1);
    next(200);
  };
}

/* ---------- Клавиатура ---------- */
addEventListener('keydown', e => {
  if (!modal.classList.contains('hidden') || e.target.tagName === 'INPUT' && e.target.type === 'text') return;
  const step = STEPS[state.idx];
  if (!step || step.kind !== 'item' || hud.classList.contains('hidden')) return;
  const n = parseInt(e.key, 10);
  const btns = [...ui.querySelectorAll('.lk, .opt, .yn button, .either .card')];
  if (n >= 1 && n <= btns.length) btns[n - 1].click();
  if (e.key === 'Enter') $('#go', ui)?.click();
  if (step.item.type === 'either' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) btns[e.key === 'ArrowLeft' ? 0 : 1].click();
  if (step.item.type === 'yn' && (e.key.toLowerCase() === 'y' || e.key.toLowerCase() === 'н')) btns[0].click();
});

/* ---------- Финал ---------- */
async function finish() {
  hud.classList.add('hidden');
  await show(`<div class="oracle-wait"><span>Оракул смотрит в тебя</span></div><div class="gap"></div><p class="lead">Не закрывай глаза.</p>`);
  const p = buildProfile(state.answers, state.name);
  state.myCode = encodeProfile(p);
  state.heart = p.heart;
  store.set('dvoe.me', { code: state.myCode, heart: p.heart, at: Date.now() }); // сердце остаётся только на этом устройстве
  await Promise.all([travel('oracle'), sleep(2600)]);
  showMine();
}

function linkFor(code) { return `${location.origin}${location.pathname}#with=${code}`; }
function qrSvg(text) {
  if (!window.qrcode) return '<p class="hint">QR недоступен офлайн</p>';
  const q = window.qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}

function bars(title, aspects, vals) {
  return `<div class="barbox glass"><h5>${title}</h5>${aspects.map((a, i) => `<div class="bline"><span>${a.t}</span><span style="text-align:right">${vals[i]}/10</span><div class="tr"><i data-w="${vals[i] * 10}"></i></div></div>`).join('')}</div>`;
}

async function showMine() {
  const me = decodeProfile(state.myCode);
  const pr = portrait(me, state.heart);
  const partner = state.partnerCode ? decodeProfile(state.partnerCode) : null;
  const link = linkFor(state.myCode);
  const { LOVE_ASPECTS, COMFORT_ASPECTS } = await import('./content.js?v=7');
  const el = await show(`
    <div class="kicker">${esc(me.name || 'Безымянный')} · отпечаток от ${fmtDay(me.day)}</div>
    <div class="gap-s"></div>
    <div class="arch-name">${pr.noun}</div>
    <div class="arch-sub">${pr.attach}</div>
    <div class="paper glass">${pr.lines.map(l => `<p>${l}</p>`).join('')}${pr.now ? `<p><em>${pr.now}</em></p>` : ''}</div>
    <div class="bars">
      ${bars('Чтобы чувствовать любовь', LOVE_ASPECTS, me.rec)}
      ${bars('Как ты любишь', LOVE_ASPECTS, me.giv)}
      ${bars('Счастливая жизнь', COMFORT_ASPECTS, me.com)}
    </div>
    ${partner ? `<div class="gap"></div><div class="kicker">${esc(partner.name || 'Другой человек')} уже прошёл(ла) свой путь</div><div class="gap-s"></div><div><button class="btn-giant" id="pair">ПРОРОЧЕСТВО</button></div>` : ''}
    <div class="share glass">
      <div class="qr">${qrSvg(link)}</div>
      <div>
        <h3>${partner ? 'Отправь свой отпечаток обратно' : 'Позови второго'}</h3>
        <p class="body">${partner ? 'Чтобы и он(а) увидел(а) ваше пророчество, отправь эту ссылку или покажи QR.' : 'Пусть другой человек отсканирует QR или откроет ссылку и пройдёт тест сам, в одиночестве. Сайт сопоставит вас и покажет, что было бы, если бы вы рискнули. Кем бы вы ни были друг другу сейчас.'}</p>
        <div class="code-box"><input readonly value="${esc(link)}" id="lnk"><button id="cp">Копировать</button></div>
        <button class="btn scan-btn" id="scan">◎ Сканировать QR партнёра</button>
        <div class="code-box"><input placeholder="…или вставь ссылку / код другого человека" id="other"><button id="cmp">Сопоставить</button></div>
      </div>
    </div>
    <p class="retake">Этот отпечаток — снимок сегодняшнего тебя. Эмоции, одиночество, влюблённость, свежие раны меняют его. Возвращайся через месяц или после того, что тебя изменило.</p>
    <div class="gap"></div>
    <div class="row"><button class="btn-ghost" id="again">Пройти заново</button></div>
    <p class="disclaimer">«ДВОЕ» — рефлексивный тест, основанный на идеях из психологии отношений (Big Five, теория привязанности, исследования Дж. Готтмана и др.). Это не диагноз и не научный прогноз. Пророчество — метафора, а не приговор. Ответы не отправляются на сервер: всё считается в твоём браузере. Код-отпечаток зашифрован и содержит только сводные оценки, без отдельных ответов. Второй человек увидит лишь общее пророчество пары, размытое туманом: по нему нельзя понять, кто из вас что ответил.</p>
  `, 'result');
  setTimeout(() => el.querySelectorAll('.tr i').forEach(i => (i.style.width = i.dataset.w + '%')), 400);
  $('#cp', el).onclick = () => copy(link);
  $('#cmp', el).onclick = () => {
    const raw = $('#other', el).value.trim(); const m = raw.match(/with=([A-Za-z0-9_-]+)/); const code = m ? m[1] : raw;
    if (!decodeProfile(code)) return toast('Код не читается. Проверь, что он скопирован целиком.');
    if (code === state.myCode) return toast('Это твой собственный отпечаток.');
    state.partnerCode = code; showPair();
  };
  $('#scan', el).onclick = () => scanQR(code => {
    if (code === state.myCode) return toast('Это твой собственный отпечаток.');
    state.partnerCode = code; history.replaceState(null, '', location.pathname); showPair();
  });
  $('#again', el).onclick = restart;
  const pb = $('#pair', el); if (pb) pb.onclick = showPair;
}

// ---------- сканер QR прямо на сайте (без сервера) ----------
let jsqrP = null;
function loadJsQR() {
  if (window.jsQR) return Promise.resolve();
  return jsqrP ||= new Promise((ok, no) => {
    const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
    sc.onload = ok; sc.onerror = () => { jsqrP = null; no(); }; document.head.appendChild(sc);
  });
}

async function scanQR(onCode) {
  if (!navigator.mediaDevices?.getUserMedia) return toast('Камера недоступна в этом браузере. Вставь ссылку вручную.');
  const ov = document.createElement('div'); ov.className = 'scanner';
  ov.innerHTML = `<div class="scan-box"><video playsinline muted></video><div class="scan-frame"></div></div>
    <p class="scan-tip">Наведи камеру на QR другого человека</p><button class="btn-ghost scan-close">Закрыть</button>`;
  document.body.appendChild(ov);
  const video = ov.querySelector('video');
  let stream = null, alive = true;
  const close = () => { alive = false; stream?.getTracks().forEach(t => t.stop()); ov.remove(); };
  ov.querySelector('.scan-close').onclick = close;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
  } catch (e) { close(); return toast('Нет доступа к камере. Разреши его в настройках браузера или вставь ссылку вручную.'); }
  if (!alive) return stream.getTracks().forEach(t => t.stop());
  video.srcObject = stream; video.play().catch(() => {}); // не ждём: в некоторых WebKit промис висит
  let detect;
  if ('BarcodeDetector' in window) {
    try { const bd = new BarcodeDetector({ formats: ['qr_code'] }); detect = async () => (await bd.detect(video))[0]?.rawValue; } catch (e) {}
  }
  if (!detect) {
    try { await loadJsQR(); } catch (e) { close(); return toast('Не удалось загрузить сканер. Проверь интернет.'); }
    const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
    detect = async () => {
      const w = video.videoWidth, h = video.videoHeight; if (!w || video.readyState < 2) return null;
      const k = Math.min(1, 640 / Math.max(w, h)); cv.width = w * k | 0; cv.height = h * k | 0;
      cx.drawImage(video, 0, 0, cv.width, cv.height);
      return window.jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'dontInvert' })?.data;
    };
  }
  let warned = false;
  const tick = async () => {
    if (!alive) return;
    let txt = null; try { txt = await detect(); } catch (e) {}
    if (txt) {
      const m = txt.match(/with=([A-Za-z0-9_-]+)/); const code = m ? m[1] : txt.trim();
      if (decodeProfile(code)) { navigator.vibrate?.(40); close(); return onCode(code); }
      if (!warned) { warned = true; toast('Это не QR из «ДВОЕ»'); setTimeout(() => (warned = false), 2500); }
    }
    setTimeout(tick, 120);
  };
  tick();
}

function copy(text) {
  (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => toast('Скопировано'), () => {
    const i = document.createElement('textarea'); i.value = text; document.body.appendChild(i); i.select(); document.execCommand('copy'); i.remove(); toast('Скопировано');
  });
}

function restart() {
  state.answers = {}; state.idx = 0; state.myCode = null;
  history.replaceState(null, '', location.pathname + (state.partnerCode ? `#with=${state.partnerCode}` : ''));
  begin();
}

function ring(v, label) {
  const C = 2 * Math.PI * 42;
  return `<div class="axis glass"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" stroke-opacity=".15" stroke-width="5"/>
    <circle class="f" cx="50" cy="50" r="42" fill="none" stroke="var(--gold)" stroke-width="5" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}" data-o="${C * (1 - v)}"/></svg>
    <div class="v">${Math.round(v * 100)}</div><div class="t">${label}</div></div>`;
}

async function showPair() {
  const A = decodeProfile(state.myCode), B = decodeProfile(state.partnerCode);
  if (!A || !B) return toast('Не удалось прочитать отпечатки');
  const P = prophecy(A, B, state.myCode, state.partnerCode);
  const x = P.axes;
  if (P.key === 'serpent' || P.key === 'storm') { setDark('hades'); await world.goTo('hades', { dur: 4 }); }
  else if (world.current !== 'oracle') { setDark('oracle'); await world.goTo('oracle'); }
  const stale = Math.abs(A.day - B.day) > 45;
  const el = await show(`
    <div class="names">${esc(P.nA)} &nbsp;·&nbsp; ${esc(P.nB)}</div>
    <div class="sigil">${P.fate.sigil}</div>
    <div class="fate-title">${P.fate.title}</div>
    <div class="verdict">${P.fate.verdict}</div>
    <div class="paper glass prophecy">
      <p>Оракул не знает, кто вы друг другу сейчас: коллеги, бывшие, незнакомцы, супруги. Он видит, что случилось бы, если бы вы отбросили всё и шагнули друг к другу.</p>
      ${P.fate.body.map(b => `<p>${b}</p>`).join('')}
      <p><em>${P.children}</em></p>
    </div>
    <div class="axes">
      ${ring(x.feel, 'Чувства')}${ring(x.everyday, 'Быт')}${ring(x.stability, 'Прочность')}${ring(x.fidelity, 'Верность')}${ring(x.family, 'Семья')}
    </div>
    <div class="winter glass"><div class="n">${P.winter}%</div><p>Столько оракул даёт на то, что ваш союз переживёт седьмую зиму, если вы решитесь его начать.</p></div>
    <div class="omens glass"><h4>Знамения</h4>${P.omens.map(o => `<div class="omen"><i>✦</i><span>${o}</span></div>`).join('')}</div>
    <p class="retake">${stale ? 'Ваши отпечатки сделаны с разницей больше месяца. Один из вас уже другой человек. Пройдите заново, оба.' : 'Пророчество отражает вас обоих сейчас. Перепройдите через месяц: если кто-то из вас изменится, изменится и судьба.'}</p>
    <div class="gap"></div>
    <div class="row"><button class="btn-ghost" id="back">← Мой портрет</button><button class="btn-ghost" id="again">Пройти заново</button></div>
    <p class="disclaimer">Пророчество собрано из общих черт пары и намеренно размыто: оно не раскрывает ответы ни одного из вас. Это художественная интерпретация, а не научный или медицинский прогноз. Тест не может и не пытается предсказывать здоровье детей или конкретные события. Используйте его как повод поговорить, а не как приговор.</p>
  `, 'result');
  const ps = [...el.querySelectorAll('.prophecy p')];
  ps.forEach((p, i) => setTimeout(() => p.classList.add('on'), 900 + i * 1500));
  setTimeout(() => el.querySelectorAll('circle.f').forEach(c => (c.style.strokeDashoffset = c.dataset.o)), 600);
  $('#back', el).onclick = async () => { setDark('oracle'); await world.goTo('oracle'); showMine(); };
  $('#again', el).onclick = restart;
}

/* ---------- Старт ---------- */
(async () => {
  world = await createWorld($('#world'));
  window.__dvoe = world; // для отладки из консоли
  await sleep(300);
  $('#loading').classList.add('gone');
  world.startIntro();
  await sleep(1800);
  landing();
})();

addEventListener('hashchange', () => { readHash(); if (hud.classList.contains('hidden') && !state.myCode) landing(); });
