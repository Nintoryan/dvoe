// Профиль, кодирование «отпечатка», совместимость и пророчество.
import { CONTENT_VERSION, LOVE_ASPECTS, COMFORT_ASPECTS } from './content.js?v=3';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const avg = (...xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

/* ---------------- Профиль из ответов ---------------- */

const HABITS = ['h_money', 'h_budget', 'h_order', 'h_roles', 'h_social', 'h_place', 'h_plan', 'h_alcohol', 'h_faith', 'h_space', 'h_talk', 'h_pets'];
const HABIT_W = [1.6, 1.2, 1.3, 1.5, 0.9, 1.0, 0.8, 0.8, 1.4, 1.0, 0.9, 0.6];

export function buildProfile(ans, name = '') {
  const L = id => (ans[id] ?? 2) / 4;
  const Y = id => (ans[id] ? 1 : 0);
  const conf = { c: 0, k: 0, d: 0, s: 0, r: 0 };
  for (const id of ['f1', 'f2', 'f3', 'f4']) if (ans[id]) conf[ans[id]]++;
  const contemptFreq = L('f5');

  const soi = avg(L('s_soi1'), L('s_soi2'));
  const mono = ans.s_mono ?? 0;
  const anx = avg(L('x1'), L('x2'), L('x3'), L('x4'), L('x5'));
  const avo = avg(L('v1'), L('v2'), L('v3'), L('v4'), L('v5'));
  const C = avg(L('c1'), 1 - L('c2'), L('c3'));
  const lonely = L('now_lonely');
  // Совокупный «риск тени» — без хранения сырых признаний
  const fidRisk = clamp(
    0.30 * Y('s_cheated') + 0.20 * soi + 0.14 * [0, 0.35, 0.75, 1][mono] +
    0.09 * avo + 0.08 * L('s_nov') + 0.07 * (1 - C) + 0.06 * lonely + 0.06 * Y('s_shadow')
  );

  return {
    v: CONTENT_VERSION,
    day: Math.floor(Date.now() / 86400000),
    name: (name || '').trim().slice(0, 18),
    E: avg(L('e1'), 1 - L('e2'), L('e3')),
    A: avg(L('a1'), 1 - L('a2'), L('a3')),
    C,
    N: avg(L('n1'), L('n2'), 1 - L('n3')),
    O: avg(L('o1'), 1 - L('o2'), L('o3')),
    anx, avo,
    rec: (ans.rec || [2, 2, 2, 2, 2]).slice(),
    giv: (ans.giv || [2, 2, 2, 2, 2]).slice(),
    com: (ans.com || [2, 2, 2, 2, 2]).slice(),
    habits: HABITS.map(h => ans[h] ?? 0),
    kids: ans.kids ?? 2,
    chrono: ans.chrono ?? 0,
    energy: (ans.energy ?? 5) / 10,
    touch: Y('touch'), sleepT: Y('sleepTogether'), health: Y('health'), smell: Y('smell'),
    origin: ans.origin ?? 0,
    prior: ans.prior ?? 1,
    crit: clamp(conf.c / 3), contempt: clamp(conf.k / 2 * 0.6 + contemptFreq * 0.6),
    defend: clamp(conf.d / 2), stone: clamp(conf.s / 2), repair: clamp(conf.r / 3),
    sfreq: ans.s_freq ?? 3,
    simp: L('s_imp'), snov: L('s_nov'), stalk: L('s_talk'), soi,
    mono, init: ans.s_init ?? 0, control: L('s_control'),
    fidRisk, forgive: Y('s_forgive'),
    mood: (ans.now_mood ?? 5) / 10, lonely,
    heart: ans.now_heart ?? 0,
    ready: (ans.now_ready ?? 5) / 10,
    risk: Y('now_risk'),
  };
}

/* ---------------- Кодек отпечатка ---------------- */
// Каждое поле упаковано в 4 бита. Поля 0..1 квантуются в 0..15.

const FIELDS = [
  ['E', 'f'], ['A', 'f'], ['C', 'f'], ['N', 'f'], ['O', 'f'], ['anx', 'f'], ['avo', 'f'],
  ['rec', 'a5'], ['giv', 'a5'], ['com', 'a5'], ['habits', 'a12'],
  ['kids', 'i'], ['chrono', 'i'], ['energy', 'f'], ['touch', 'i'], ['sleepT', 'i'], ['health', 'i'], ['smell', 'i'],
  ['origin', 'i'], ['prior', 'i'], ['crit', 'f'], ['contempt', 'f'], ['defend', 'f'], ['stone', 'f'], ['repair', 'f'],
  ['sfreq', 'i'], ['simp', 'f'], ['snov', 'f'], ['stalk', 'f'], ['soi', 'f'], ['mono', 'i'], ['init', 'i'], ['control', 'f'],
  ['fidRisk', 'f'], ['forgive', 'i'], ['mood', 'f'], ['lonely', 'f'], ['heart', 'i'], ['ready', 'f'], ['risk', 'i'],
];

function b64url(bytes) {
  let s = '';
  bytes.forEach(b => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

export function encodeProfile(p) {
  const nib = [];
  for (const [k, t] of FIELDS) {
    if (t === 'f') nib.push(Math.round(clamp(p[k]) * 15));
    else if (t === 'i') nib.push(clamp(p[k] | 0, 0, 15));
    else p[k].forEach(x => nib.push(clamp(x | 0, 0, 15)));
  }
  if (nib.length % 2) nib.push(0);
  const nameBytes = new TextEncoder().encode(p.name || '').slice(0, 40);
  const out = [p.v & 255, (p.day >> 8) & 255, p.day & 255, nameBytes.length, ...nameBytes];
  for (let i = 0; i < nib.length; i += 2) out.push((nib[i] << 4) | nib[i + 1]);
  return b64url(out);
}

export function decodeProfile(code) {
  try {
    const b = unb64url(code.trim());
    if (b[0] !== CONTENT_VERSION) return null;
    const day = (b[1] << 8) | b[2];
    const nl = b[3];
    const name = new TextDecoder().decode(b.slice(4, 4 + nl));
    const nib = [];
    for (let i = 4 + nl; i < b.length; i++) nib.push(b[i] >> 4, b[i] & 15);
    const p = { v: b[0], day, name };
    let j = 0;
    for (const [k, t] of FIELDS) {
      if (t === 'f') p[k] = nib[j++] / 15;
      else if (t === 'i') p[k] = nib[j++];
      else { const n = t === 'a5' ? 5 : 12; p[k] = nib.slice(j, j + n); j += n; }
    }
    if (j > nib.length) return null;
    return p;
  } catch { return null; }
}

/* ---------------- Индивидуальный портрет ---------------- */

export function attachStyle(p) {
  const hiX = p.anx > 0.55, hiV = p.avo > 0.55;
  if (hiX && hiV) return 'fearful';
  if (hiX) return 'anxious';
  if (hiV) return 'avoidant';
  return 'secure';
}

const ARCH_NOUN = ['Хранитель Часов', 'Слушающий Сердце', 'Дитя Огня', 'Строитель Дома', 'Страж Очага'];
const ARCH_LINE = [
  'Тебе нужно, чтобы с тобой были. Не рядом, а именно с тобой.',
  'Ты веришь в любовь, когда её произносят и когда тебя по-настоящему слышат.',
  'Твоё тело узнаёт любовь раньше разума. Без прикосновения слова для тебя пусты.',
  'Для тебя любовь — это глагол. Ты веришь рукам, а не обещаниям.',
  'Тебе нужна опора под ногами. Когда о тебе позаботились, ты наконец можешь любить.',
];
const ATTACH = {
  secure: { t: 'сердце, которое не боится', d: 'Ты умеешь быть близко и не терять себя. Это редкая и самая устойчивая форма любви. Её мало кто ценит, пока не потеряет.' },
  anxious: { t: 'сердце, которое боится потерять', d: 'Ты любишь горячо и ждёшь подвоха. Тишина партнёра звучит для тебя как приговор. Тебе нужен человек, который не исчезает.' },
  avoidant: { t: 'сердце за высокой стеной', d: 'Ты сильнее, когда один(а), и бережёшь свою свободу как жизнь. Близость тебе нужна, но на расстоянии вытянутой руки.' },
  fearful: { t: 'сердце, которое зовёт и прогоняет', d: 'Ты хочешь близости и боишься её одновременно. Ты притягиваешь и отталкиваешь. Тот, кто это выдержит, увидит тебя настоящего(ую).' },
};
const HEART_NOW = [
  'Сейчас ты свободен(на) и спокоен(на). Оракул видит тебя ясно.',
  'Сейчас ты влюблён(а). Влюблённость окрашивает ответы золотом, поэтому часть того, что ты видишь, — свет, а не предмет.',
  'Сейчас твоё сердце заживает. Боль делает тебя осторожнее, чем ты есть. Пройди тест снова, когда шрам перестанет ныть.',
  'Сейчас ты в отношениях, и тебе хорошо. Твоя мера любви сегодня — сытая.',
  'Сейчас тебе тяжело в отношениях. Это сильно влияет на то, чего ты хочешь: голодный выбирает иначе.',
];

const top = arr => arr.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);

export function portrait(p) {
  const r = top(p.rec), g = top(p.giv), c = top(p.com);
  const style = attachStyle(p);
  const mismatch = p.rec.reduce((s, v, i) => s + Math.abs(v - p.giv[i]), 0) / 20; // 0..1
  const lines = [];
  lines.push(ARCH_LINE[r[0][1]]);
  lines.push(`Ты любишь через «${LOVE_ASPECTS[g[0][1]].t.toLowerCase()}»${g[1][0] > 0 ? ` и «${LOVE_ASPECTS[g[1][1]].t.toLowerCase()}»` : ''}.`);
  if (mismatch > 0.45) lines.push('Ты отдаёшь любовь на языке, на котором сам(а) её почти не слышишь. Поэтому тебе может казаться, что ты даёшь больше, чем получаешь, даже когда это не так.');
  else if (mismatch < 0.15) lines.push('Ты отдаёшь ровно то, чего ждёшь сам(а). Будь осторожен(на): другой человек может ждать совсем иного.');
  lines.push(`Хорошая жизнь для тебя — это прежде всего «${COMFORT_ASPECTS[c[0][1]].t.toLowerCase()}».`);
  lines.push(ATTACH[style].d);
  if (p.sfreq >= 5 && p.simp > 0.6) lines.push('В тебе живёт сильное желание. Тот, кто его не разделит, будет терять тебя медленно и незаметно для себя.');
  else if (p.sfreq <= 1 && p.simp < 0.4) lines.push('Страсть для тебя не главный огонь. Тебя держит тепло, а не пламя.');
  return {
    noun: ARCH_NOUN[r[0][1]],
    attach: ATTACH[style].t,
    style,
    lines,
    now: HEART_NOW[p.heart] || HEART_NOW[0],
    extreme: r[0][0] >= 8 ? LOVE_ASPECTS[r[0][1]].t : null,
  };
}

/* ---------------- Совместимость пары ---------------- */

function cover(giver, receiver) {
  // сколько естественной «отдачи» одного ложится на потребности другого
  let s = 0;
  for (let i = 0; i < 5; i++) s += Math.min(giver.giv[i], receiver.rec[i]);
  return s / 10;
}

export function compatibility(A, B) {
  const coverAB = cover(A, B); // A любит так, как нужно B
  const coverBA = cover(B, A);
  const loveAvg = (coverAB + coverBA) / 2;
  const asym = Math.abs(coverAB - coverBA);

  const sexSync = 1 - Math.abs(A.sfreq - B.sfreq) / 7;
  const sexGap = Math.abs(A.sfreq - B.sfreq);
  const novSync = 1 - Math.abs(A.snov - B.snov);
  const talk = avg(A.stalk, B.stalk);
  const initPair = A.init !== B.init ? 1 : 0.6; // оба ждут или оба ведут — хуже
  const touchSync = A.touch === B.touch ? 1 : 0.5;

  const feel = clamp(
    0.42 * clamp((loveAvg - 0.25) / 0.6) + 0.2 * sexSync + 0.08 * novSync + 0.08 * talk +
    0.07 * initPair + 0.07 * touchSync + 0.08 * (1 - Math.abs(A.O - B.O))
  );

  let hw = 0, hs = 0;
  A.habits.forEach((h, i) => { hw += HABIT_W[i]; if (h === B.habits[i]) hs += HABIT_W[i]; });
  const habitAgree = hs / hw;
  const comL1 = A.com.reduce((s, v, i) => s + Math.abs(v - B.com[i]), 0) / 20;
  const comfortSim = 1 - comL1;
  const everyday = clamp(
    0.44 * habitAgree + 0.22 * comfortSim + 0.12 * avg(A.C, B.C) +
    0.1 * (1 - Math.abs(A.energy - B.energy)) + 0.06 * (A.chrono === B.chrono ? 1 : 0.3) +
    0.06 * (A.sleepT === B.sleepT ? 1 : 0.4)
  );

  const toxic = q => clamp(0.25 * q.crit + 0.45 * q.contempt + 0.15 * q.defend + 0.25 * q.stone);
  const security = q => (1 - q.anx) * (1 - q.avo);
  const sA = attachStyle(A), sB = attachStyle(B);
  const trap = (sA === 'anxious' && (sB === 'avoidant' || sB === 'fearful')) ||
               (sB === 'anxious' && (sA === 'avoidant' || sA === 'fearful'));
  const origin = q => [1, 0.55, 0.5, 0.6, 0.6][q.origin] ?? 0.6;
  const nowState = q => avg(q.mood, q.ready, 1 - q.lonely, [1, 0.85, 0.45, 0.9, 0.5][q.heart] ?? 0.7);
  const stability = clamp(
    0.24 * (1 - avg(A.N, B.N)) - 0.08 * Math.max(A.N, B.N) + 0.08 +
    0.2 * (1 - Math.max(toxic(A), toxic(B))) + 0.13 * avg(A.repair, B.repair) +
    0.14 * avg(security(A), security(B)) + 0.1 * avg(A.A, B.A) +
    0.05 * avg(origin(A), origin(B)) + 0.08 * avg(nowState(A), nowState(B)) -
    (trap ? 0.12 : 0) - (A.habits[10] !== B.habits[10] ? 0.03 : 0)
  );

  const monoGap = Math.abs(A.mono - B.mono) / 3;
  const maxRisk = Math.max(A.fidRisk, B.fidRisk);
  const fidelity = clamp(
    1 - 0.55 * maxRisk - 0.25 * avg(A.fidRisk, B.fidRisk) - 0.18 * monoGap -
    0.05 * sexGap / 7 * 2 - 0.08 * (1 - loveAvg) + 0.08
  );

  const kidsGap = Math.abs(A.kids - B.kids);
  const kidsBreaker = kidsGap >= 3 || (kidsGap >= 2 && (A.kids === 0 || A.kids === 4 || B.kids === 0 || B.kids === 4));
  const family = clamp(
    (1 - kidsGap / 4) * 0.55 + 0.25 * stability + 0.1 * (A.habits[3] === B.habits[3] ? 1 : 0) +
    0.1 * (A.habits[8] === B.habits[8] ? 1 : 0) - (kidsBreaker ? 0.2 : 0)
  );

  const overall = clamp(0.27 * feel + 0.22 * everyday + 0.25 * stability + 0.16 * fidelity + 0.1 * family);

  return {
    coverAB, coverBA, loveAvg, asym, sexGap, habitAgree, comfortSim, trap, sA, sB,
    kidsGap, kidsBreaker, monoGap, maxRisk, toxicA: toxic(A), toxicB: toxic(B),
    axes: { feel, everyday, stability, fidelity, family }, overall,
  };
}

/* ---------------- Пророчество ---------------- */

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

const FATES = {
  union: {
    sigil: '☉', title: 'Союз', verdict: 'Вы прошли бы весь путь.',
    body: [
      'Оракул видит дом. Не дворец и не сказку, а дом, в котором горит свет, когда один из вас возвращается поздно.',
      'Вы бы поссорились, и не раз. Но каждая ваша буря заканчивалась бы тем, что кто-то протягивает руку первым. Вы умеете чинить то, что ломаете, а это и есть секрет тех, кто остаётся вместе до седины.',
      'Кольца. Годы. Общие морщины от одних и тех же шуток. Нить между вами не рвётся, она становится толще.',
    ],
  },
  fire: {
    sigil: '△', title: 'Пожар', verdict: 'Чувства сгорят в быту.',
    body: [
      'Между вами огонь. Оракул видит ночи, о которых не рассказывают, и взгляды, от которых тесно в комнате.',
      'Но огню нужен очаг, а у вас разные представления о том, как он должен выглядеть. Деньги, порядок, время, планы: каждый день вы будете спотыкаться о мелочи, которые не стоят ссоры, но копятся, как пепел.',
      'Вы не разлюбите друг друга. Вы устанете друг от друга, и это больнее. Если вы не договоритесь о простом, сложное вас не спасёт.',
    ],
  },
  harbor: {
    sigil: '▽', title: 'Тихая Гавань', verdict: 'Удобно. Но сердце будет голодать.',
    body: [
      'Оракул видит спокойную воду. С вами легко жить: вы одинаково понимаете, как устроен хороший день, вы не воюете из-за чашек и денег.',
      'Но в этой тишине один из вас однажды поймает себя на мысли, что ему не хватает чего-то, чему нет названия. Не скандала, а жара. Взгляда, от которого перехватывает дыхание.',
      'Такие союзы живут долго. Иногда — слишком долго. Главный враг здесь не ссора, а равнодушие, которое прячется под словом «нормально».',
    ],
  },
  moon: {
    sigil: '☽', title: 'Луна и Солнце', verdict: 'Один будет любить сильнее.',
    body: [
      'Оракул видит два света разной силы. Один из вас будет любить так, как умеет, щедро и всем собой. Но это будет не та любовь, которую другой способен услышать.',
      'Другой будет чувствовать себя любимым(ой) и в какой-то момент поймёт, что отвечает теплом, а не огнём. Ему будет удобно, хорошо и чуть стыдно.',
      'Такие пары держатся, пока тот, кто любит сильнее, не устанет светить в одну сторону. Это можно изменить, но только если вслух назвать неравенство.',
    ],
  },
  chase: {
    sigil: '∞', title: 'Погоня', verdict: 'Вы перепутаете тревогу со страстью.',
    body: [
      'Оракул видит бесконечную восьмёрку. Один из вас будет догонять, другой — отступать. Чем сильнее один просит близости, тем выше другой строит стену.',
      'Это будет ощущаться как великая любовь: американские горки, примирения со слезами, «я без тебя не могу». Но горки — это не дорога, а круг.',
      'Вы будете расставаться и возвращаться. Разорвать круг можно, только если догоняющий остановится, а убегающий не воспользуется этим, чтобы исчезнуть.',
    ],
  },
  serpent: {
    sigil: '∿', title: 'Змей в Саду', verdict: 'Между вами встанет третий.',
    body: [
      'Оракул видит сад, и он прекрасен. Но под листьями шевелится что-то, о чём вы оба пока не знаете.',
      'Тень третьего ляжет на ваш порог. Не обязательно тело: может быть, переписка, тайна, взгляд, который задержится слишком долго. Кто-то из вас переступит черту, которую другой считал священной.',
      'Это не приговор, а предупреждение. Сад можно сохранить, если о голоде говорить раньше, чем его утолит кто-то другой.',
    ],
  },
  storm: {
    sigil: 'ϟ', title: 'Буря', verdict: 'Вы разрушите то, что любите.',
    body: [
      'Оракул видит небо, рассечённое молниями. Чувства между вами настоящие, но под ними слишком много острого: обиды, гордость, слова, которые нельзя забрать обратно.',
      'Вы будете ранить друг друга именно потому, что друг для друга важны. Каждая ссора будет оставлять трещину, и однажды трещин станет больше, чем стены.',
      'Если вы расстанетесь, это будет громко. Если останетесь, вам придётся научиться самому трудному — проигрывать спор ради того, кого любишь.',
    ],
  },
  shores: {
    sigil: '≈', title: 'Два Берега', verdict: 'Вы не встретитесь по-настоящему.',
    body: [
      'Оракул видит реку и два берега. Вы можете долго смотреть друг на друга, махать, даже кричать через воду, но моста между вами нет.',
      'Вам нужно разное: от любви, от жизни, от утра и от ночи. Если бы вы рискнули, это была бы короткая глава — красивая или неловкая, но короткая.',
      'Это не ошибка ни одного из вас. Просто ваши дороги ведут к разным морям.',
    ],
  },
  bridge: {
    sigil: '⌒', title: 'Мост', verdict: 'Всё решит выбор, а не судьба.',
    body: [
      'Оракул видит мост, недостроенный посередине. С обеих сторон к нему ведут крепкие дороги, но середину придётся достроить руками.',
      'В вас есть то, что держит, и то, что разводит. Судьба здесь молчит и отдаёт решение вам. Такие союзы становятся либо очень сильными, либо тихо распадаются в один обычный вторник.',
      'Если вы оба возьмёте камень, мост встанет. Если будете ждать, что его построит другой, вы так и останетесь стоять на краю, глядя друг на друга.',
    ],
  },
};

function chooseFate(c) {
  const x = c.axes;
  const minAx = Math.min(x.feel, x.everyday, x.stability, x.fidelity);
  if (c.overall > 0.66 && minAx > 0.5) return 'union';
  if (x.fidelity < 0.36) return 'serpent';
  if (c.trap) return 'chase';
  if (c.asym > 0.22) return 'moon';
  if (x.stability < 0.38 && x.feel > 0.5) return 'storm';
  if (x.feel > 0.6 && x.everyday < 0.5) return 'fire';
  if (x.feel < 0.48 && x.everyday > 0.6) return 'harbor';
  if (c.overall < 0.42) return 'shores';
  if (x.stability < 0.36) return 'storm';
  return 'bridge';
}

export function prophecy(A, B, codeA, codeB) {
  const c = compatibility(A, B);
  const key = chooseFate(c);
  const fate = FATES[key];
  const seed = hashStr([codeA, codeB].sort().join('|'));
  const r = rng(seed);
  const nA = A.name || 'Первый', nB = B.name || 'Второй';
  const omens = [];
  const add = (w, t) => omens.push({ w, t });

  // любовь: кто кого слышит
  if (c.asym > 0.15) {
    const giverWeak = c.coverAB < c.coverBA ? [nA, nB] : [nB, nA];
    add(0.9 + c.asym, `${giverWeak[0]} будет любить так, как умеет, а ${giverWeak[1]} — ждать любви, которую не умеют дать. Однажды прозвучит фраза «я же всё для тебя делаю». Она будет правдой и ничего не изменит.`);
  }
  if (c.loveAvg > 0.72) add(0.8, 'Вы оба умеете отдавать именно то, чего ждёт другой. Это почти не встречается. Не принимайте это за данность.');
  if (c.sexGap >= 3) add(0.7 + c.sexGap / 10, 'В спальне будет звучать один и тот же немой вопрос. Один будет хотеть, другой — уставать от того, что его хотят. Этот разлом не виден днём.');
  else if (c.sexGap <= 1 && avg(A.simp, B.simp) > 0.55) add(0.6, 'Ваши тела будут понимать друг друга без перевода. Многие пары отдали бы за это годы.');
  if (c.maxRisk > 0.5) add(0.6 + c.maxRisk, 'Тень третьего ляжет на порог. Не обязательно тело: может быть, тайна, переписка, взгляд. Черта, которую один считал священной, для другого окажется пунктиром.');
  if (c.monoGap >= 0.66) add(0.75, 'Вы по-разному понимаете слово «верность». Договоритесь об этом словами, иначе договариваться будут поступки.');
  if (c.habitAgree < 0.5) add(0.65 + (0.5 - c.habitAgree), 'Вас будут разъедать не измены, а мелочи: деньги, посуда, выходные, «почему опять так». Великую любовь чаще убивают чашки, чем соперники.');
  if (c.comfortSim > 0.8) add(0.55, 'Вы одинаково понимаете, что такое хорошая жизнь. Вам не придётся тащить друг друга в чужую мечту.');
  if (Math.max(c.toxicA, c.toxicB) > 0.5) add(0.7 + Math.max(c.toxicA, c.toxicB) / 2, 'Самый опасный гость в вашем доме — презрение. Сначала оно приходит шуткой, потом взглядом. Если оно поселится, само не уйдёт.');
  if (c.trap) add(0.85, 'Один будет догонять, другой — убегать, и вы оба назовёте это страстью.');
  if (c.sA === 'secure' && c.sB === 'secure') add(0.6, 'Вам не придётся каждый день доказывать друг другу, что вы не уйдёте. Это и есть покой, который многие ищут всю жизнь.');
  if (A.chrono !== B.chrono) add(0.35, 'Вы будете встречаться на кухне на рассвете: один ещё не ложился, другой уже проснулся.');
  if (A.origin >= 2 && B.origin >= 2) add(0.45, 'Вы оба несёте в себе разрушенный дом родителей. Либо вы построите тот, которого у вас не было, либо повторите тот, который был.');
  if (A.heart === 2 || B.heart === 2) add(0.55, 'Сейчас один из вас ещё смотрит назад, на того, кто был раньше. Оракул видит вас сквозь этот шрам. Через время узор может стать другим.');
  if (A.risk && B.risk) add(0.5, 'Вы оба готовы прыгнуть. Если один протянет руку, другой не отдёрнет свою.');
  else if (!A.risk && !B.risk) add(0.4, 'Вы оба держитесь за берег. Чтобы что-то случилось, кому-то придётся первым отпустить его.');
  if (Math.abs(A.E - B.E) > 0.5) add(0.4, 'Один будет звать в люди, другой — в тишину. Найдите комнату, где слышно обоих.');

  omens.sort((a, b) => b.w - a.w);
  const chosen = omens.slice(0, 5).map(o => o.t);

  // о детях — только атмосфера семьи, без «медицинских» предсказаний
  let children;
  const bothNo = A.kids >= 3 && B.kids >= 3;
  if (c.kidsBreaker) children = 'Настанет день, когда один из вас заговорит о ребёнке, а другой отведёт глаза. Это развилка, которую нельзя обойти, — её можно только честно пройти. Не надейтесь, что «потом передумает».';
  else if (bothNo) children = 'Ваш союз не ищет продолжения в детях. Вы будете друг для друга всем миром: это свобода и это вес.';
  else if (c.axes.stability > 0.62) children = pick(r, [
    'Если придут дети, им достанется ваш покой. Они вырастут, зная, что любовь — это безопасно.',
    'Оракул слышит в вашем доме детский смех. Они будут учиться любви, глядя на вас, и научатся хорошему.']);
  else if (c.axes.stability < 0.45) children = pick(r, [
    'Если придут дети, им достанется ваша буря. Они будут учиться любви по вашим ссорам, и выучат её именно такой. Сначала научитесь мириться — потом зовите их.',
    'Дети не склеят то, что трещит. Если вы позовёте их, чтобы спасти союз, им придётся нести то, что не смогли нести вы.']);
  else children = 'Дети возможны, но не они решат вашу судьбу. Ребёнок станет зеркалом: всё, что между вами недоговорено, отразится в нём громче.';

  // «седьмая зима» — мистическая вероятность
  const winter = Math.round(clamp(c.overall * 1.15 - 0.08 + (r() - 0.5) * 0.06, 0.04, 0.96) * 100);

  return { key, fate, c, omens: chosen, children, winter, nA, nB };
}

export { clamp };
