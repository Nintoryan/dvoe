import { SECTIONS, ALL_ITEMS, SCALE_LABELS } from './content.js?v=11';
import { buildProfile, encodeProfile, decodeProfile, isOldCode, portrait, prophecy, clamp, LEAD_TRAITS } from './engine.js?v=14';
import { deepPortrait } from './reading.js?v=14';
import { createWorld } from './scene.js?v=10';

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
  me: null, // полный профиль: только на этом устройстве, в код не попадает
};
const OLD_CODE = 'Этот отпечаток сделан в прошлой версии теста. Вопросы с тех пор изменились, поэтому сравнить их нельзя. Попроси человека пройти тест заново.';
function readHash() {
  const m = location.hash.match(/with=([A-Za-z0-9_-]+)/);
  if (m && decodeProfile(m[1])) state.partnerCode = m[1];
  else if (m && isOldCode(m[1])) setTimeout(() => toast(OLD_CODE, 6000), 2600);
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
function toast(text, ms = 2600) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
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
  const savedP = saved?.full && decodeProfile(saved.code);
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
      state.myCode = saved.code; state.me = saved.full; state.name = savedP.name; state.heart = saved.heart;
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
    case 'spectrum': {
      // 0 и 4 — карточки-полюса, 1..3 — оттенки между ними
      const mid = [`Скорее «${item.a.t.toLowerCase()}»`, 'Посередине / по-разному', `Скорее «${item.b.t.toLowerCase()}»`];
      el = await show(`${head}<div class="spectrum"><div class="either">
        <button class="card glass ${a === 0 ? 'sel' : ''}" data-v="0"><h3>${item.a.t}</h3><p>${item.a.d}</p></button>
        <div class="or">или</div>
        <button class="card glass ${a === 4 ? 'sel' : ''}" data-v="4"><h3>${item.b.t}</h3><p>${item.b.d}</p></button></div>
        <div class="shades">${mid.map((t, i) => `<button class="shade glass ${a === i + 1 ? 'sel' : ''}" data-v="${i + 1}">${t}</button>`).join('')}</div></div>`);
      el.querySelectorAll('.card, .shade').forEach(b => (b.onclick = () => choose(item.id, +b.dataset.v, el, '.card, .shade', 360)));
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
        <div><h4>${asp.t}</h4><p>${asp.d}${asp.x ? `<em class="ax">${asp.x}</em>` : ''}</p></div>
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
  let btns = [...ui.querySelectorAll('.lk, .opt, .yn button, .either .card')];
  if (step.item.type === 'spectrum') { const c = [...ui.querySelectorAll('.either .card')]; btns = [c[0], ...ui.querySelectorAll('.shade'), c[1]]; }
  if (n >= 1 && n <= btns.length) btns[n - 1].click();
  if (e.key === 'Enter') $('#go', ui)?.click();
  if (step.item.type === 'spectrum' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) btns[e.key === 'ArrowLeft' ? 0 : btns.length - 1].click();
  if (step.item.type === 'yn' && (e.key.toLowerCase() === 'y' || e.key.toLowerCase() === 'н')) btns[0].click();
});

/* ---------- Финал ---------- */
async function finish() {
  hud.classList.add('hidden');
  await show(`<div class="oracle-wait"><span>Оракул смотрит в тебя</span></div><div class="gap"></div><p class="lead">Не закрывай глаза.</p>`);
  const p = buildProfile(state.answers, state.name);
  state.myCode = encodeProfile(p);
  state.me = p;
  state.heart = p.heart;
  // полный профиль (острые темы, сердце) остаётся только на этом устройстве; наружу уходит лишь код
  store.set('dvoe.me', { code: state.myCode, full: p, heart: p.heart, at: Date.now() });
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
  const me = state.me;
  if (!me) return restart();
  const pr = portrait(me, state.heart);
  const partner = state.partnerCode ? decodeProfile(state.partnerCode) : null;
  const link = linkFor(state.myCode);
  const lead = deepPortrait(me).lead;
  const { LOVE_ASPECTS, COMFORT_ASPECTS } = await import('./content.js?v=11');
  const el = await show(`
    <div class="kicker">${esc(me.name || 'Безымянный')} · отпечаток от ${fmtDay(me.day)}</div>
    <div class="gap-s"></div>
    <div class="arch-name">${pr.noun}</div>
    <div class="arch-sub">${pr.attach}</div>
    <div class="elem">Ведущая черта — <b>${lead.name}</b>. ${lead.d}</div>
    <div class="paper glass">${pr.lines.map(l => `<p>${l}</p>`).join('')}${pr.now ? `<p><em>${pr.now}</em></p>` : ''}</div>
    <div class="bars">
      ${bars('Чтобы чувствовать любовь', LOVE_ASPECTS, me.rec)}
      ${bars('Как ты любишь', LOVE_ASPECTS, me.giv)}
      ${bars('Счастливая жизнь', COMFORT_ASPECTS, me.com)}
    </div>
    ${deepMine(me)}
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
    <p class="disclaimer">«ДВОЕ» — рефлексивный тест, основанный на идеях из психологии отношений (Big Five, теория привязанности, исследования Дж. Готтмана и др.). Это не диагноз и не научный прогноз. Пророчество — метафора, а не приговор. Ответы не отправляются на сервер: всё считается в твоём браузере. Код-отпечаток содержит только то, что и так видно в пророчестве пары (характер, чаши любви, быт, ритм), и одно грубое число из смеси острых тем. Отдельных ответов о близости, верности, ссорах и прошлом в нём нет: твой полный портрет хранится только на этом устройстве. Второй человек увидит пророчество пары. Быт, ритм, характер и то, как вы проявляете любовь, там названы прямо. Близость, верность, ссоры, страх потерять и прошлое — нет: они смешаны в одну сводную оценку «Испытание» вместе с ответами обоих и показаны только уровнем. Поэтому, даже зная свои ответы, нельзя вычислить, что ответил другой, и понять, какая тема на что повлияла.</p>
  `, 'result');
  setTimeout(() => el.querySelectorAll('.tr i, .meter i').forEach(i => (i.style.width = i.dataset.w + '%')), 400);
  $('#cp', el).onclick = () => copy(link);
  $('#cmp', el).onclick = () => {
    const raw = $('#other', el).value.trim(); const m = raw.match(/with=([A-Za-z0-9_-]+)/); const code = m ? m[1] : raw;
    if (!decodeProfile(code)) return toast(isOldCode(code) ? OLD_CODE : 'Код не читается. Проверь, что он скопирован целиком.', isOldCode(code) ? 6000 : 2600);
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


/* ---------- Блоки развёрнутых результатов ---------- */
const plural = (n, f) => f[(n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2];
const meter = v => `<div class="meter"><i data-w="${Math.round(v)}"></i></div>`;
const sec = (title, inner, cls = '') => `<section class="sec glass ${cls}"><h4>${title}</h4>${inner}</section>`;

function curveSvg(pts, band) {
  const W = 320, H = 120, X = h => ((h - 6) / 18) * W, Y = v => H - 22 - v * (H - 34);
  const d = pts.map(([h, v], i) => `${i ? 'L' : 'M'}${X(h).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const ticks = [6, 9, 12, 15, 18, 21, 24].map(h => `<text x="${X(h)}" y="${H - 4}" text-anchor="${h === 6 ? 'start' : h === 24 ? 'end' : 'middle'}">${h === 24 ? '0' : h}:00</text>`).join('');
  const b = band ? `<rect x="${X(band[0])}" y="6" width="${Math.max(2, X(band[1]) - X(band[0]))}" height="${H - 28}" rx="8" class="band"/>` : '';
  return `<svg class="curve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${b}<path d="${d}L${W},${H - 22}L0,${H - 22}Z" class="area"/><path d="${d}" class="line"/>${ticks}</svg>`;
}

function heartSvg(h) {
  const cx = 20 + h.x * 160, cy = 180 - h.y * 160;
  return `<svg class="heartmap" viewBox="0 0 200 200">
    <rect x="20" y="20" width="160" height="160" rx="14" class="frame"/>
    <line x1="100" y1="20" x2="100" y2="180"/><line x1="20" y1="100" x2="180" y2="100"/>
    <text x="60" y="64">Маяк</text><text x="140" y="64">Лабиринт</text><text x="60" y="144">Гавань</text><text x="140" y="144">Крепость</text>
    <text x="100" y="196" class="ax">дистанция →</text><text x="8" y="100" class="ax" transform="rotate(-90 8 100)">тревога →</text>
    <circle cx="${cx}" cy="${cy}" r="16" class="halo"/><circle cx="${cx}" cy="${cy}" r="7" class="dot"/></svg>`;
}

function deepMine(me) {
  const d = deepPortrait(me);
  const traits = d.traits.map(t => `<div class="trait">
      <div class="th"><b>${t.name}</b><em>${t.v}%</em></div>${meter(t.v)}
      <p>${t.t}</p>${t.light ? `<p class="ls"><span>Сильные стороны:</span> ${t.light}</p><p class="ls sh"><span>Риски:</span> ${t.shadow}</p>` : ''}</div>`).join('');
  const riders = d.rider.riders.map(r => `<div class="mini"><span>${r.name}</span>${meter(r.v)}<em>${r.v}%</em></div>`).join('');
  return `
    ${sec('Пять черт личности', `<p class="cap">Модель «Большой пятёрки» — самая изученная модель личности в психологии. Ни один полюс черты не лучше другого: у каждого есть сильные стороны и риски.</p>${traits}`)}
    <div class="duo">
      ${sec('Карта сердца', `${heartSvg(d.heart)}<div class="big-name">${d.heart.name}</div><p>${d.heart.d}</p><p class="nums">тревога ${d.heart.anx}% · дистанция ${d.heart.avo}%</p>`)}
      ${sec('Твой всадник в ссоре', `<div class="big-name">${d.rider.name}</div><p>${d.rider.d}</p><p class="ls"><span>Противоядие:</span> ${d.rider.fix}</p>${riders}<div class="mini"><span>Умение мириться</span>${meter(d.rider.repair)}<em>${d.rider.repair}%</em></div>`)}
    </div>
    <div class="duo">
      ${sec('Ритм дня', `${curveSvg(d.rhythm.pts)}<p>${d.rhythm.t}</p><p class="nums">пик около ${d.rhythm.peak}:00 · энергия ${d.rhythm.energy}%</p>`)}
      ${sec('Темперамент', `<div class="big-name">${d.temper.name}</div>${meter(d.temper.v)}<p>${d.temper.d}</p><p class="nums">Это видишь только ты. В пророчество пары эти ответы попадают лишь смешанными с другими темами, так что второй человек не сможет их вычислить.</p>`)}
    </div>
    ${sec('Кто тебе подойдёт', `<div class="duo in"><div><b class="ok">С кем легко</b>${d.match.easy.map(t => `<p>${t}</p>`).join('')}</div><div><b class="no">С кем трудно</b>${d.match.hard.map(t => `<p>${t}</p>`).join('')}</div></div>`)}`;
}


function winterBlock(W) {
  const steps = L => `<span class="steps3">${[0, 1, 2].map(i => `<i class="${i <= L ? 'on' : ''}"></i>`).join('')}</span>`;
  const rows = W.parts.map(p => `<div class="mini wpart"><span>${p.t} <small>вес ${p.w}%</small></span>${p.v != null ? `${meter(p.v)}<em>${p.v}%</em>` : `${steps(p.L)}<em>${p.word.toLowerCase()}</em>`}</div>`).join('');
  return sec('❄ Седьмая зима', `
    <div class="wz"><div class="wn">${W.pct}%</div><div><div class="big-name">${W.level}</div><p>${W.text}</p></div></div>
    <h5>Что это</h5>
    <p>Сводная оценка того, переживёт ли ваш союз — если вы решитесь его начать — седьмую зиму, то есть первые семь лет вместе. Это то же число, что в строке под вердиктом.</p>
    <h5>Почему именно седьмая</h5>
    <p>«Седьмая зима» — образ, но за ним стоят данные. Удовлетворённость браком в среднем снижается в первые годы, и у многих пар заметный спад приходится на конец первого десятилетия (Kurdek, 1999). Браки, которые заканчиваются разводом, в среднем длятся около 7–8 лет (U.S. Census Bureau). Отсюда и знаменитый «кризис семи лет»: к этому времени уходит влюблённость, и пару держит уже не она, а то, как вы живёте и ссоритесь.</p>
    <h5>Из чего складывается</h5>
    ${rows}
    <p class="cap">Больше всего весит «Испытание». В долгих исследованиях пар судьбу союза сильнее предсказывает то, как партнёры проходят стресс, ссорятся и мирятся, чем исходное сходство (Karney & Bradbury, 1995; Gottman, 1994). Поэтому сходство в быту или притяжение не перевешивают хрупкость в трудном. «Испытание» и «Семья» показаны только уровнем, чтобы по ним нельзя было вычислить ответы другого.</p>
    <h5>Как это читать</h5>
    <p>Это не вероятность из исследования и не прогноз событий. Это взвешенная сумма четырёх составляющих, растянутая так, чтобы у двух случайных людей выходило около 50%. Выше 65% — ваши опоры заметно перевешивают трудности. Ниже 45% — союз возможен, но многое будет держаться на сознательных усилиях. Число меняется, когда меняетесь вы: перепройдите тест через месяц.</p>`, 'winter-card');
}

function deepPair(P) {
  const seasons = P.seasons.map(s => `<div class="season glass L${s.L}">
      <div class="sg">${s.glyph}</div><div class="sn">${s.name}</div><div class="ss">${s.sub}</div>
      ${s.k === 'trial' ? `<div class="sv steps">${[0, 1, 2].map(i => `<i class="${i <= s.L ? 'on' : ''}"></i>`).join('')}</div>` : `<div class="sv">${Math.round(s.v * 100)}%</div>`}
      <div class="sl">${s.level}</div><p>${s.text}</p></div>`).join('');
  const T = P.type, eA = LEAD_TRAITS[T.a], eB = LEAD_TRAITS[T.b];
  const love = (from, to, l) => `<div class="lv"><div class="th"><b>${esc(from)} → ${esc(to)}</b><em>${l.pct}%</em></div>${meter(l.pct)}
      <p>Лучше всего доходит: «${l.best}».${l.miss ? ` Меньше всего хватает: «${l.miss}».` : ''}</p></div>`;
  const R = P.rhythm;
  const word = m => (m >= 0.85 ? 'совпадаете' : m >= 0.5 ? 'близко' : m >= 0.2 ? 'по-разному' : 'расходитесь');
  return `
    <div class="seasons">${seasons}</div>
    <p class="axes-cap">Весна — как вы попадаете друг в друга. Лето — деньги, дом, ритм, ценности. Осень — пять хрупких тем сразу: близость, доверие, ссоры, страх потерять, устойчивость. Она складывается из ответов обоих и не раскладывается обратно — ни по темам, ни по людям, поэтому показана только уровнем.</p>
    ${winterBlock(P.winterCard)}
    ${sec('Сочетание характеров', `<div class="big-name">${T.t}</div><p class="nums">Ведущая черта: ${esc(P.nA)} — ${eA.name.toLowerCase()} · ${esc(P.nB)} — ${eB.name.toLowerCase()}</p><p>${T.d}</p><p class="ls"><span>Сильные стороны:</span> ${T.light}</p><p class="ls sh"><span>Риски:</span> ${T.shadow}</p>`)}
    ${sec('Как вы попадаете в чаши друг друга', `<p class="cap">Сколько из того, как один естественно проявляет любовь, ложится туда, где её ждёт другой.</p>${love(P.nA, P.nB, P.love.ab)}${love(P.nB, P.nA, P.love.ba)}`)}
    <div class="duo">
      ${sec('Ритм пары', `${curveSvg(R.both, [R.from, R.to])}<p>${R.gap >= 3 ? `Ваши пики энергии далеко друг от друга. Полностью «включены» вы оба примерно с ${R.from}:00 до ${R.to}:00 — берегите эти часы для важного.` : `Ваша общая энергия — примерно с ${R.from}:00 до ${R.to}:00. В эти часы вам легче всего говорить, решать и радоваться вместе.`}</p>`)}
      ${sec('Линейка быта', P.habits.map(h => `<div class="mini"><span>${h.t}</span>${meter(h.m * 100)}<em>${word(h.m)}</em></div>`).join(''))}
    </div>`;
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
      if (isOldCode(code)) { close(); return toast(OLD_CODE, 6000); }
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
  state.answers = {}; state.idx = 0; state.myCode = null; state.me = null;
  history.replaceState(null, '', location.pathname + (state.partnerCode ? `#with=${state.partnerCode}` : ''));
  begin();
}

function omensBlock(list) {
  const line = o => `<div class="omen ${o.kind}"><i>${o.kind === 'lo' ? '◇' : '✦'}</i><span>${o.t}${o.do ? `<b class="do">${o.do}</b>` : ''}<small>${o.why}</small></span></div>`;
  const good = list.filter(o => o.kind !== 'lo'), grow = list.filter(o => o.kind === 'lo');
  return `<div class="omens glass"><h4>Что вас держит</h4>${good.map(line).join('')}
    ${grow.length ? `<h4 class="grow">Над чем стоит поработать</h4>${grow.map(line).join('')}` : ''}</div>`;
}

async function showPair() {
  const A = decodeProfile(state.myCode), B = decodeProfile(state.partnerCode);
  if (!A || !B) return toast('Не удалось прочитать отпечатки');
  const P = prophecy(A, B);
  if (P.key === 'serpent' || P.key === 'storm') { setDark('hades'); await world.goTo('hades', { dur: 4 }); }
  else if (world.current !== 'oracle') { setDark('oracle'); await world.goTo('oracle'); }
  const stale = Math.abs(A.day - B.day) > 45;
  const el = await show(`
    <div class="names">${esc(P.nA)} &nbsp;·&nbsp; ${esc(P.nB)}</div>
    <div class="sigil">${P.fate.sigil}</div>
    <div class="fate-title">${P.fate.title}</div>
    <div class="verdict">${P.fate.verdict}</div>
    <div class="counts"><span><b>${P.counts.hi}</b> ${plural(P.counts.hi, ['точка опоры', 'точки опоры', 'точек опоры'])}</span><span><b>${P.counts.lo}</b> ${plural(P.counts.lo, ['точка трения', 'точки трения', 'точек трения'])}</span><span><b>${P.winter}%</b> на седьмую зиму</span></div>
    <div class="paper glass prophecy">
      <p>Оракул не знает, кто вы друг другу сейчас: коллеги, бывшие, незнакомцы, супруги. Он видит, что случилось бы, если бы вы отбросили всё и шагнули друг к другу.</p>
      ${P.fate.body.map(b => `<p>${b}</p>`).join('')}
      <p><em>${P.children}</em></p>
    </div>
    <div class="why glass"><b>Откуда этот вывод</b><p>${P.fate.why}</p><p>${P.childrenWhy}</p></div>
    ${deepPair(P)}
    ${omensBlock(P.omens)}
    <p class="retake">${stale ? 'Ваши отпечатки сделаны с разницей больше месяца. Один из вас уже другой человек. Пройдите заново, оба.' : 'Пророчество отражает вас обоих сейчас. Перепройдите через месяц: если кто-то из вас изменится, изменится и судьба.'}</p>
    <div class="gap"></div>
    <div class="row"><button class="btn-ghost" id="back">← Мой портрет</button><button class="btn-ghost" id="again">Пройти заново</button></div>
    <p class="disclaimer">Пророчество собрано из общих черт пары. Быт, ритм, характер и то, как вы проявляете любовь, названы прямо. Острые темы — близость, верность, ссоры, страх потерять, прошлое — смешаны в одну оценку «Испытание» из ответов обоих и показаны только уровнем: по ней нельзя понять ни тему, ни то, что ответил другой. Тест не может и не пытается предсказывать будущее или конкретные события. Он опирается на исследования психологии отношений и статистику по парам, но это не диагноз и не приговор. Используйте его как повод поговорить.</p>
  `, 'result');
  const ps = [...el.querySelectorAll('.prophecy p')];
  ps.forEach((p, i) => setTimeout(() => p.classList.add('on'), 900 + i * 1500));
  setTimeout(() => el.querySelectorAll('.meter i').forEach(i => (i.style.width = i.dataset.w + '%')), 600);
  $('#back', el).onclick = async () => { setDark('oracle'); await world.goTo('oracle'); showMine(); };
  $('#again', el).onclick = restart;
}

/* ---------- Демо: ?demo — два случайных отпечатка, ничего не сохраняется ---------- */
function randomAnswers() {
  const a = {}, R = n => Math.floor(Math.random() * n);
  for (const it of ALL_ITEMS) {
    if (it.type === 'yn') a[it.id] = R(2);
    else if (it.type === 'spectrum') a[it.id] = R(5);
    else if (it.type === 'likert') a[it.id] = R(5);
    else if (it.type === 'slider') a[it.id] = it.min + R(it.max - it.min + 1);
    else if (it.type === 'choice') { const o = it.options[R(it.options.length)]; a[it.id] = typeof o === 'string' ? it.options.indexOf(o) : o.v; }
    else if (it.type === 'alloc') { const v = [0, 0, 0, 0, 0]; for (let k = 0; k < 10; k++) v[R(5)]++; a[it.id] = v; }
  }
  return a;
}
async function demo() {
  const me = buildProfile(randomAnswers(), 'Ты');
  state.myCode = encodeProfile(me); state.me = me; state.heart = me.heart;
  state.partnerCode = encodeProfile(buildProfile(randomAnswers(), 'Демо'));
  hud.classList.add('hidden');
  await travel('oracle');
  showMine();
}

/* ---------- Старт ---------- */
(async () => {
  world = await createWorld($('#world'));
  window.__dvoe = world; // для отладки из консоли
  await sleep(300);
  $('#loading').classList.add('gone');
  world.startIntro();
  await sleep(1800);
  if (new URLSearchParams(location.search).has('demo')) return demo();
  landing();
})();

addEventListener('hashchange', () => { readHash(); if (hud.classList.contains('hidden') && !state.myCode) landing(); });
