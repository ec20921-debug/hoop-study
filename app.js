// HOOP STUDY — 本体
function calcAllowance(st, ym, today, cfg) {
  var A = cfg; var days = (st && st.days) || {};
  var p = ym.split('-').map(Number);
  var monthStart = ym + '-01';
  var monthEnd = new Date(Date.UTC(p[0], p[1], 0)).toISOString().slice(0, 10);
  var add = function (ds, n) { var q = ds.split('-').map(Number); return new Date(Date.UTC(q[0], q[1] - 1, q[2] + n)).toISOString().slice(0, 10); };
  var dow = function (ds) { return new Date(ds + 'T00:00:00Z').getUTCDay(); };
  var std = A.stdMissions || [];
  var isBig = function (x) { return !!x && (x.m || []).filter(function (id) { return std.indexOf(id) >= 0; }).length >= A.bigWinMissions; };
  var start = (st && st.startDate) || monthStart;
  var from = start > monthStart ? start : monthStart;
  var lastDone = today > monthEnd ? monthEnd : add(today, -1);
  var missed = 0, studied = 0, bigs = 0, perfect = 0, ranks = 0, mvp = 0;
  for (var d = monthStart; d <= monthEnd && d <= today; d = add(d, 1)) {
    var x = days[d];
    if (x && x.pts > 0) studied++;
    else if (d >= from && d <= lastDone) missed++;
    if (x) {
      if (isBig(x)) bigs++;
      perfect += Math.min(A.perfectPerDay, x.cp || 0);
      ranks += x.ru2 || 0;
    }
    // 週間MVP：日曜日（週の終わり）がこの月にあり、終わった週だけ数える
    if (dow(d) === 0 && d < today) {
      var n = 0;
      for (var k = 0; k < 7; k++) if (isBig(days[add(d, -k)])) n++;
      if (n >= A.mvpDays) mvp++;
    }
  }
  var over = Math.max(0, missed - A.restDays);
  var base = Math.max(0, A.base - over * A.missPenalty);
  var bonus = Math.min(A.bonusMax, bigs * A.bigWin + mvp * A.mvp + perfect * A.perfect + ranks * A.rankUp);
  return { ym: ym, studied: studied, missed: missed, restLeft: Math.max(0, A.restDays - missed), over: over, base: base, bigs: bigs, mvp: mvp, perfect: perfect, ranks: ranks, bonus: bonus, total: Math.min(A.max, base + bonus) };
}

(() => {
  'use strict';

  const CFG = window.HOOP_CONFIG || {};
  const LS_KEY = 'hoop_v1';
  const Q_KEY = 'hoop_queue_v1';
  const QUIZ_LEN = 10;
  const SHOT_CLOCK = 24;

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- 日付（日本時間） ----------
  const todayStr = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(d);
  const addDays = (ds, n) => { const [y, m, d] = ds.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

  // ---------- 状態 ----------
  const rid = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => (b % 36).toString(36)).join('');
  function freshState() {
    return {
      v: 1, nick: '', sound: true, xp: 0, tickets: 1, days: {}, cards: {}, pulls: 0, pity: 0,
      weak: { spell: {}, plural: {}, kanji: {}, qa: {}, past: {}, third: {}, hkanji: {}, speak: {}, listen: {} }, best: {}, lastPlay: {},
      missions: DEFAULT_MISSIONS.map((m) => ({ ...m })),
      test: { name: '後期期末テスト', date: '', checks: {} },
      goals: {}, voices: [], voiceDays: {}, voiceWeek: '', cheerLog: [], startDate: todayStr(),
      milestones: {}, cheersSeen: [], lastCheer: null, lastSync: 0, syncError: null,
      timer: null, moneySeen: null, complete: '',
      device: rid(20), created: Date.now(), updated: Date.now(),
    };
  }
  function migrate(s) {
    const f = freshState();
    for (const k in f) if (s[k] === undefined) s[k] = f[k];
    for (const k of ['spell', 'plural', 'kanji', 'qa', 'past', 'third', 'hkanji', 'speak', 'listen']) if (!s.weak[k]) s.weak[k] = {};
    const firstDay = Object.keys(s.days || {}).sort()[0];
    if (firstDay && firstDay < s.startDate) s.startDate = firstDay;
    return s;
  }
  function loadLocal() {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) return migrate(JSON.parse(raw)); } catch (e) { /* 読めない時は新規 */ }
    return null;
  }
  let S = loadLocal();
  function save() { S.updated = Date.now(); try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* 容量不足など */ } }

  function day(ds = todayStr()) {
    if (!S.days[ds]) S.days[ds] = { m: [], pts: 0, win: false, perfect: 0 };
    return S.days[ds];
  }
  const played = (ds) => !!(S.days[ds] && S.days[ds].pts > 0);
  function streak() {
    const t = todayStr();
    let cur = played(t) ? t : addDays(t, -1);
    let n = 0;
    while (played(cur)) { n++; cur = addDays(cur, -1); }
    return n;
  }
  function rankIdx(xp) { let i = 0; RANKS.forEach((r, j) => { if (xp >= r[0]) i = j; }); return i; }
  // 紙の勉強をした日か（ミッション1本・試合前チェック・タイマー10分以上のどれか）
  const paperDone = (d) => !!d && ((d.m || []).length > 0 || d.ck > 0 || (d.tm || 0) >= TIMER.winMin);

  // ---------- 記録の送信（Google スプレッドシート） ----------
  function loadQueue() { try { return JSON.parse(localStorage.getItem(Q_KEY) || '[]'); } catch (e) { return []; } }
  // 500件を超えたら、まず「アプリを使った時間」の記録から古い順に捨てる（声やミッションを残すため）
  function saveQueue(q) {
    q = q.slice();
    for (let i = 0; q.length > 500 && i < q.length; ) { if (q[i].type === 'session') q.splice(i, 1); else i++; }
    try { localStorage.setItem(Q_KEY, JSON.stringify(q.slice(-500))); } catch (e) { /* noop */ }
  }
  function logEvent(type, item, subject, points, detail) {
    const q = loadQueue();
    q.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), ts: new Date().toISOString(), date: todayStr(), type, item, subject: subject || '', points: points || 0, detail: detail || {} });
    saveQueue(q);
    flushSoon();
  }
  function snapshot() {
    const r = RANKS[rankIdx(S.xp)];
    return { ...S, summary: { rank: r[1], streak: streak(), cardKinds: Object.keys(S.cards).length, allowanceCfg: ALLOWANCE } };
  }
  let flushTimer = null;
  let flushing = false;
  function flushSoon() { clearTimeout(flushTimer); flushTimer = setTimeout(flush, 1500); }
  async function flush() {
    if (!CFG.GAS_URL || flushing || !navigator.onLine) return;
    const q = loadQueue();
    const batch = q.slice(0, 50);
    flushing = true;
    // 画面を閉じる瞬間の送信が決着しないまま止まっても、次の送信が詰まらないように15秒で打ち切る
    const ctl = new AbortController();
    const tmo = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(CFG.GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'log', key: CFG.APP_KEY, dev: S.device, events: batch, state: snapshot() }), signal: ctl.signal });
      const j = await res.json();
      if (j.ok) {
        const sent = new Set(batch.map((e) => e.id));
        const rest = loadQueue().filter((e) => !sent.has(e.id));
        saveQueue(rest);
        S.lastSync = Date.now(); S.syncError = null; S.everSynced = true; save();
        if (rest.length) setTimeout(flush, 300);
      } else if (j.error === 'device') { S.syncError = 'device'; save(); }
      updateSyncLabel();
    } catch (e) { /* オフライン時は次回まとめて送る */ } finally { clearTimeout(tmo); flushing = false; }
  }
  async function api(params, withDev) {
    if (!CFG.GAS_URL) return null;
    const dev = S && (withDev || S.everSynced) ? S.device : '';
    const url = CFG.GAS_URL + '?' + new URLSearchParams({ key: CFG.APP_KEY, dev, ...params });
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    try { const r = await fetch(url, { signal: ctl.signal }); return await r.json(); } catch (e) { return null; } finally { clearTimeout(t); }
  }
  async function apiPost(body) {
    if (!CFG.GAS_URL) return null;
    try { const r = await fetch(CFG.GAS_URL, { method: 'POST', body: JSON.stringify({ key: CFG.APP_KEY, dev: S.device, ...body }) }); return await r.json(); } catch (e) { return null; }
  }

  // ---------- 使った時間（アプリを開いていた時間）の記録 ----------
  // 20秒未満のちょっとした出し入れは記録にせず、同じ日の次の記録に足す（記録が増えすぎないように）
  const SESS_KEY = 'hoop_sess_carry';
  let sessStart = 0;
  function sessionBegin() { if (!sessStart) sessStart = Date.now(); }
  function sessionEnd() {
    if (!sessStart || !S) return;
    const from = sessStart; sessStart = 0;
    const sec = Math.min(90 * 60, Math.round((Date.now() - from) / 1000));
    let carry = { date: '', sec: 0 };
    try { carry = JSON.parse(localStorage.getItem(SESS_KEY) || 'null') || carry; } catch (e) { /* noop */ }
    const total = sec + (carry.date === todayStr() ? carry.sec : 0);
    if (total < 20) { try { localStorage.setItem(SESS_KEY, JSON.stringify({ date: todayStr(), sec: total })); } catch (e) { /* noop */ } return; }
    try { localStorage.removeItem(SESS_KEY); } catch (e) { /* noop */ }
    logEvent('session', 'アプリを使った', '', 0, { sec: total, from: new Date(from).toISOString() });
  }

  // ---------- 紙の勉強タイマー（紙で勉強した時間を記録する） ----------
  const timerMin = () => (S.timer ? Math.floor((Date.now() - S.timer.start) / 60000) : 0);
  const timerLabel = () => (timerMin() > TIMER.maxMin ? `${TIMER.maxMin}+` : String(timerMin()));
  function timerCard() {
    const tm = (S.days[todayStr()] || {}).tm || 0;
    if (S.timer) {
      const over = timerMin() > TIMER.maxMin || (S.timer.date && S.timer.date !== todayStr());
      return `<div class="timer on"><div class="tm-l">⏱ 紙の勉強タイマー <span class="tm-live">計測中</span></div>
        <div class="tm-n"><b id="tmr">${timerLabel()}</b>分</div>
        ${over ? '<div class="tm-s">止め忘れてない？ 押すと、やった分だけ入力できるよ</div>' : ''}
        <button class="btn big" data-act="tstop">⏹ 終わった！</button></div>`;
    }
    return `<div class="timer mini"><div class="grow"><div class="tm-l">⏱ 紙の勉強タイマー${tm ? `<span class="tm-today">今日 ${tm}分</span>` : ''}</div>
      <div class="tm-s">${TIMER.winMin}分で WIN の条件クリア ・ ${TIMER.perPts}分ごとに +1P</div></div>
      <button class="btn" data-act="tstart">▶ スタート</button></div>`;
  }
  function startTimer() { S.timer = { start: Date.now(), date: todayStr() }; save(); sfx.buzzer(); toast('⏱ スタート！ 終わったら「終わった！」を押してね'); render(); }
  async function stopTimer() {
    if (!S.timer) return;
    const start = S.timer.start; const sameDay = !S.timer.date || S.timer.date === todayStr();
    let min = Math.floor((Date.now() - start) / 60000);
    // 止め忘れ（日またぎ・上限超え）は自動で入れず、本人に「何分やったか」を入れてもらう
    if (!sameDay || min > TIMER.maxMin) {
      const ans = prompt(`止め忘れかも？ 今日、紙で勉強したのは何分？（最大${TIMER.manualMax}分・0なら記録しない）`, '0');
      if (ans === null) return;
      min = Math.max(0, Math.min(TIMER.manualMax, parseInt(String(ans).replace(/[^0-9]/g, ''), 10) || 0));
    }
    S.timer = null;
    if (min < 1) { save(); toast('記録しなかったよ'); render(); return; }
    const d = day();
    const before = d.tm || 0;
    d.tm = before + min;
    const earned = Math.min(TIMER.maxPts, Math.floor(d.tm / TIMER.perPts)) - Math.min(TIMER.maxPts, Math.floor(before / TIMER.perPts));
    const detail = { min, from: new Date(start).toISOString(), total: d.tm };
    if (earned > 0) {
      const r = addPoints(earned, 'timer', `紙の勉強 ${min}分`, '全教科', detail);
      render();
      await shootOv(earned + (r.tipoff ? 1 : 0), `⏱ ${min}分 集中！ 今日の合計 ${d.tm}分`);
      await afterEffects(r);
    } else {
      save(); logEvent('timer', `紙の勉強 ${min}分`, '全教科', 0, detail);
      toast(`⏱ ${min}分 記録したよ（今日の合計 ${d.tm}分）`); render();
    }
  }
  setInterval(() => { const el = $('#tmr'); if (el && S && S.timer) el.textContent = timerLabel(); }, 15000);

  // ---------- 問題（スプレッドシート「問題」タブが正本。圏外では最後に読んだ問題を使う） ----------
  const BANK_KEY = 'hoop_bank_v1';
  function builtinBank() {
    return {
      spell: SPELL_WORDS.map((w) => ({ q: w[1], a: w[0], f: false })),
      plural: PLURAL_WORDS.map((w) => ({ q: w[0], a: w[1], h: w[2], f: false })),
      kanji: KANJI_WORDS.map((w) => ({ q: w[0], a: w[1], f: false })),
      qa: QA_WORDS.map((w) => ({ s: w[0], q: w[1], a: w[2], f: false })),
    };
  }
  function loadBank() {
    try { const b = JSON.parse(localStorage.getItem(BANK_KEY) || 'null'); if (b && b.spell && b.qa) return b; } catch (e) { /* 読めない時は内蔵の問題 */ }
    return builtinBank();
  }
  let BANK = loadBank();
  let seeded = false;
  async function syncBank() {
    const j = await api({ action: 'questions' });
    if (!j || !j.ok) return;
    if (j.empty) { if (seeded) return; seeded = true; const r = await apiPost({ action: 'seed', bank: builtinBank() }); if (r && r.ok) return syncBank(); return; }
    const b = { spell: [], plural: [], kanji: [], qa: [] };
    (j.questions || []).forEach((r) => {
      const f = !!r.focus;
      if (!r.q || !r.a) return;
      if (r.type === '英単語') b.spell.push({ q: r.q, a: r.a, f });
      else if (r.type === '複数形') b.plural.push({ q: r.q, a: r.a, h: r.hint || '', f });
      else if (r.type === '漢字') b.kanji.push({ q: r.q, a: r.a, f });
      else if (r.type === '一問一答') b.qa.push({ s: r.sub || 'その他', q: r.q, a: r.a, f });
    });
    const base = builtinBank();
    for (const k of ['spell', 'plural', 'kanji']) if (b[k].length < 4) b[k] = base[k];
    BANK = b;
    try { localStorage.setItem(BANK_KEY, JSON.stringify(b)); } catch (e) { /* noop */ }
    if (tab === 'game') render();
  }

  // ---------- 効果音（その場で合成） ----------
  let AC = null;
  function ac() {
    if (!S || !S.sound) return null;
    try {
      if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
    } catch (e) { return null; }
    return AC;
  }
  function tone(freq, dur, type = 'sine', vol = 0.15, when = 0, slideTo) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + when;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol = 0.3, when = 0, f1 = 3000, f2 = 800) {
    const c = ac(); if (!c) return;
    const t = c.currentTime + when;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, len, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(f1, t); f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination); src.start(t);
  }
  const sfx = {
    tap: () => tone(880, 0.05, 'triangle', 0.06),
    shoot: () => { noise(0.25, 0.12, 0, 600, 2000); noise(0.35, 0.35, 0.6, 4000, 900); tone(1046, 0.12, 'sine', 0.12, 0.8); tone(1568, 0.25, 'sine', 0.12, 0.88); },
    ok: () => { tone(880, 0.08, 'square', 0.07); tone(1320, 0.14, 'square', 0.07, 0.07); },
    ng: () => tone(220, 0.25, 'sawtooth', 0.08, 0, 140),
    buzzer: () => { tone(330, 0.6, 'square', 0.1); tone(336, 0.6, 'square', 0.08); },
    coin: () => { tone(988, 0.08, 'square', 0.08); tone(1319, 0.3, 'square', 0.08, 0.08); },
    fanfare: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'square', 0.08, i * 0.12)); tone(1046, 0.6, 'triangle', 0.12, 0.5); tone(1318, 0.6, 'triangle', 0.08, 0.5); },
    drum: () => { for (let i = 0; i < 10; i++) noise(0.06, 0.18, i * 0.1, 300, 200); },
    reveal: (r) => {
      const base = { N: 523, R: 659, SR: 784, SSR: 880, UR: 1046 }[r] || 523;
      tone(base, 0.15, 'square', 0.08); tone(base * 1.5, 0.3, 'square', 0.08, 0.12);
      if (r === 'SSR' || r === 'UR') { tone(base * 2, 0.5, 'triangle', 0.1, 0.3); noise(0.6, 0.15, 0.3, 6000, 3000); }
    },
  };

  // ---------- 紙吹雪 ----------
  function confetti(n = 120) {
    const cv = document.createElement('canvas'); cv.className = 'confetti';
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    document.body.appendChild(cv);
    const x = cv.getContext('2d'); x.scale(dpr, dpr);
    const cols = ['#ff7a1a', '#ffd400', '#22d3ee', '#ff3d7f', '#2ee59d', '#a855f7', '#ffffff'];
    const ps = Array.from({ length: n }, () => ({
      x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight * 0.38,
      vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 15 - 4, s: Math.random() * 7 + 4,
      r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: pick(cols),
    }));
    const start = performance.now();
    (function loop(now) {
      const t = now - start;
      x.clearRect(0, 0, innerWidth, innerHeight);
      ps.forEach((p) => {
        p.vy += 0.42; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.globalAlpha = Math.max(0, 1 - t / 2200);
        x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore();
      });
      if (t < 2200) requestAnimationFrame(loop); else cv.remove();
    })(start);
  }

  // ---------- オーバーレイ ----------
  function overlay(html, opt = {}) {
    return new Promise((res) => {
      const el = document.createElement('div');
      el.className = 'ov';
      el.innerHTML = html + (opt.closeOnTap === false ? '' : '<div class="tap-close">タップで閉じる</div>');
      document.body.appendChild(el);
      let done = false;
      const close = () => { if (done) return; done = true; el.remove(); res(); };
      if (opt.closeOnTap !== false) setTimeout(() => el.addEventListener('click', close), opt.lockMs || 600);
      if (opt.autoClose) setTimeout(close, opt.autoClose);
      if (opt.onMount) opt.onMount(el, close);
    });
  }
  function toast(msg, ms = 2200) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), ms);
  }
  const HOOP_SVG = `<svg class="hoop" viewBox="0 0 150 130">
    <rect x="15" y="0" width="120" height="74" rx="6" fill="#f4f6fb" opacity=".95"/>
    <rect x="50" y="26" width="50" height="36" fill="none" stroke="#ff3d3d" stroke-width="4"/>
    <g class="net"><path d="M42 80 L52 122 M58 80 L62 124 M75 80 L75 125 M92 80 L88 124 M108 80 L98 122 M46 96 L104 96 M50 110 L100 110" stroke="#fff" stroke-width="2" fill="none" opacity=".85"/></g>
    <ellipse cx="75" cy="80" rx="36" ry="7" fill="none" stroke="#ff6a00" stroke-width="5"/>
  </svg>`;
  function shootOv(pts, sub) {
    sfx.shoot();
    setTimeout(() => { confetti(90); document.body.classList.add('shake-screen'); setTimeout(() => document.body.classList.remove('shake-screen'), 400); }, 620);
    return overlay(`<div class="court">${HOOP_SVG}<div class="ball">🏀</div></div>
      <div class="shot-word">${esc(pick(SHOT_WORDS))}</div>
      <div class="shot-pts">+${pts} PTS</div>
      ${sub ? `<div class="shot-sub">${esc(sub)}</div>` : ''}`, { autoClose: 2200, lockMs: 900 });
  }
  function winOv() {
    sfx.buzzer(); setTimeout(() => { sfx.fanfare(); confetti(160); }, 500);
    return overlay(`<div class="lvup-title">WIN!!</div><div class="lvup-rank">🏆</div>
      <div class="lvup-name">${esc(RIVAL.name)}に勝った！</div>
      <div class="shot-sub" style="opacity:1">ガチャチケット +1 🎟️</div>`, { lockMs: 1200 });
  }
  function bigWinOv() {
    sfx.fanfare(); setTimeout(() => confetti(220), 200);
    return overlay(`<div class="lvup-title" style="font-size:56px">BIG WIN!!</div><div class="lvup-rank">🔥🏆🔥</div>
      <div class="lvup-name">基本ミッション${ALLOWANCE.bigWinMissions}本クリア！</div>
      <div class="reward-big">💰 おこづかい +${ALLOWANCE.bigWin}円 アップ！</div>`, { lockMs: 1200 });
  }
  function levelUpOv(i) {
    sfx.fanfare(); confetti(200);
    const r = RANKS[i];
    return overlay(`<div class="lvup-title">LEVEL UP!</div><div class="lvup-rank">${r[2]}</div>
      <div class="lvup-name">${esc(r[1])} に昇格！</div>
      ${REWARDS[r[1]] ? `<div class="reward-big">🎁 ごほうび：${esc(REWARDS[r[1]])}<br><small>この画面をおうちの人に見せてね</small></div>` : ''}
      <div class="shot-sub" style="opacity:1">${i + 1 < RANKS.length ? `次は「${esc(RANKS[i + 1][1])}」まで あと ${RANKS[i + 1][0] - S.xp} XP` : '最高ランク到達！'}</div>`, { lockMs: 1400 });
  }

  // ---------- ポイント加算（全ての得点はここを通る） ----------
  function addPoints(pts, type, item, subject, detail) {
    const before = rankIdx(S.xp);
    const d = day();
    const r = { pts, tipoff: false, win: false, levelUp: false, newRank: before, streakBonus: 0 };
    if (d.pts <= 0 && pts > 0) { r.tipoff = true; d.pts += 1; S.xp += 1; }
    d.pts += pts; S.xp = Math.max(0, S.xp + pts);
    if (!d.win && d.pts > RIVAL.score && paperDone(d)) { d.win = true; S.tickets++; r.win = true; }
    const stdDone = d.m.filter((id) => ALLOWANCE.stdMissions.includes(id)).length;
    if (!d.big && stdDone >= ALLOWANCE.bigWinMissions) { d.big = true; r.big = true; }
    const st = streak();
    const bonus = STREAK_BONUS[st];
    const mkey = st + '@' + addDays(todayStr(), -(st - 1));
    if (bonus && !S.milestones[mkey]) { S.milestones[mkey] = true; S.tickets += bonus; r.streakBonus = bonus; }
    const after = rankIdx(S.xp);
    if (after > before) { r.levelUp = true; r.newRank = after; d.ru = (d.ru || 0) + (after - before); for (let k = before + 1; k <= after; k++) if (k >= ALLOWANCE.rankUpFrom) d.ru2 = (d.ru2 || 0) + 1; }
    save();
    logEvent(type, item, subject, pts + (r.tipoff ? 1 : 0), { ...(detail || {}), win: r.win || undefined, levelUp: r.levelUp ? RANKS[after][1] : undefined });
    return r;
  }
  async function afterEffects(r) {
    render();
    if (r.win) await winOv();
    if (r.big) await bigWinOv();
    if (r.streakBonus) { sfx.coin(); toast(`🔥 ${streak()}日連続ボーナス！ チケット +${r.streakBonus}`); }
    if (r.levelUp) await levelUpOv(r.newRank);
    render();
  }

  // ---------- 画面 ----------
  let tab = 'home';
  const TABS = [['home', '🏠', 'ホーム'], ['game', '🎮', 'ゲーム'], ['test', '🏆', '試合前'], ['voice', '💬', '声'], ['gacha', '🎰', 'ガチャ']];
  function renderTabs() {
    const dot = (id) => (id === 'gacha' && S.tickets > 0) || (id === 'voice' && !S.voiceDays[todayStr()]);
    $('#tabbar').innerHTML = TABS.map(([id, ic, lb]) => `<button class="tab ${tab === id ? 'on' : ''}" data-tab="${id}"><span class="ti">${ic}</span>${lb}${dot(id) ? '<i class="dot"></i>' : ''}</button>`).join('');
  }
  function header() {
    const i = rankIdx(S.xp); const r = RANKS[i]; const nx = RANKS[i + 1];
    const pct = nx ? Math.min(100, ((S.xp - r[0]) / (nx[0] - r[0])) * 100) : 100;
    return `<div class="top"><div class="rank-badge" data-tab="ranks">${r[2]}</div>
      <div class="top-info" data-tab="ranks"><div class="top-name">${esc(S.nick || 'PLAYER')} ・ Lv.${i + 1}</div><div class="top-rank">${esc(r[1])}</div>
      <div class="xpbar"><i style="width:${pct}%"></i></div><div class="xpnum">${S.xp} XP${nx ? ` ／ 次の「${esc(nx[1])}」まで ${nx[0] - S.xp}` : ''} <span class="ranklink">ランク表 ›</span></div></div>
      <div class="top-side"><div class="tickets">🎟️ ${S.tickets}</div><button class="gear" data-tab="set" aria-label="設定">⚙️</button></div></div>`;
  }
  function viewHome() {
    const t = todayStr(); const d = S.days[t] || { m: [], pts: 0, win: false, ck: 0 };
    const st = streak(); const today = played(t);
    const cheer = S.lastCheer && diffDays(S.lastCheer.date, t) <= 3
      ? `<div class="cheer">📣 <b>おうちからのエール</b><br>${esc(S.lastCheer.text)}</div>` : '';
    const left = RIVAL.score + 1 - d.pts;
    // 上から「今の状態 → すぐやる1つ → 紙のミッション」の順。くわしい数字はタップした先に置く
    return header() + coachBox() + `
      <div class="status">
        <div class="st-streak"><span class="flame ${today ? '' : 'cold'}">🔥</span><b>${st}</b><small>日連続</small></div>
        <div class="st-score"><span class="lbl">YOU</span><b class="sc">${d.pts}</b><span class="vs">VS</span><b class="sc away">${RIVAL.score}</b><span class="lbl">${esc(RIVAL.name)}</span></div>
      </div>
      <div class="winmsg ${d.win ? 'win' : ''}">${d.win ? '🏆 今日はWIN！ ナイスゲーム！' : left > 0 ? `あと ${left} 点で WIN → ガチャチケット！` : '紙のミッション1本（または⏱タイマー10分）で WIN！'}</div>
      ${allowanceCard()}
      ${cheer}
      ${heroButton()}
      <div class="sec-title"><h2>今日のミッション</h2><span>${bigProgress(d)}</span></div>
      <div class="missions">${S.missions.map((m) => {
        const done = d.m.includes(m.id);
        return `<div class="mission ${done ? 'done' : ''}"><div class="ic">${m.icon || '🏀'}</div>
          <div class="tx"><div class="lb">${esc(m.label)}</div><div class="mt">${esc(m.sub)} ・ ${m.pts}P${ALLOWANCE.stdMissions.includes(m.id) ? '' : ' ・ おこづかい対象外'}</div></div>
          <button class="shoot-btn" data-act="mission" data-id="${esc(m.id)}">${done ? '✓ IN' : 'SHOOT'}</button></div>`;
      }).join('')}</div>
      ${timerCard()}
      <div class="sync" id="sync"></div>`;
  }
  // ---------- おまかせ（今やるといいゲームを1つ選ぶ。迷わずすぐ始められるように） ----------
  function gameKinds() { return ['speak', 'listen', 'spell', 'plural', 'kanji', ...qaSubjects().map((x) => 'qa:' + x), 'challenge']; }
  const playedToday = (k) => ((S.days[todayStr()] || {}).qk || []).includes(k);
  function autoPick() {
    const d = S.days[todayStr()] || {};
    const n = weakTotal();
    if (n >= WEAK_BONUS_MIN && !d.wkt) return { kind: 'weak', why: `苦手が${n}問。全問正解で 🎟️ +1` };
    if (!playedToday('speak')) return { kind: 'speak', why: '今日はまだ英語を声に出してないよ（5問・2分）' };
    // まだ今日やっていないものの中で、いちばん長くやっていないもの（チャレンジは上級なので最後）
    const c = gameKinds().filter((k) => !playedToday(k));
    const pool = c.length ? c : gameKinds();
    const oldest = pool.reduce((a, k) => ((S.lastPlay[k] || '') < (S.lastPlay[a] || '') ? k : a), pool[0]);
    const last = S.lastPlay[oldest];
    return { kind: oldest, why: !last ? 'まだやったことがないゲーム！' : c.length ? `${diffDays(last, todayStr())}日ぶりのゲーム` : 'もう1回、自己ベストに挑戦！' };
  }
  const KIND_ICON = { speak: '🎤', listen: '🎧', spell: '🔤', plural: '📦', kanji: '漢', weak: '🎯', challenge: '👑' };
  const kindIcon = (k) => KIND_ICON[k] || ({ 理科: '🧪', 社会: '🗾', 数学: '📐', 国語: '✍️' }[k.slice(3)] || '📚');
  function heroButton() {
    const p = autoPick();
    return `<button class="hero" data-act="omakase" data-kind="${esc(p.kind)}"><span class="hero-k">▶ おまかせ</span>
      <span class="hero-t">${kindIcon(p.kind)} ${esc(quizName(p.kind))}</span><span class="hero-s">${esc(p.why)}</span><span class="hero-a">START</span></button>`;
  }
  function playKind(kind) { if (kind === 'speak') startSpeak(); else startQuiz(kind); }
  function markPlayed(kind) {
    const d = day(); d.qk = d.qk || [];
    if (!d.qk.includes(kind)) d.qk.push(kind);
    S.lastPlay[kind] = todayStr();
  }
  // ---------- コーチ（キャラクターが吹き出しで話す） ----------
  function coachSvg(mood = 'happy') {
    const eyes = mood === 'wink' ? '<path d="M37 47 q5 -5 10 0" stroke="#3a1a05" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="68" cy="47" r="5" fill="#3a1a05"/>'
      : mood === 'think' ? '<circle cx="42" cy="49" r="4.5" fill="#3a1a05"/><circle cx="68" cy="49" r="4.5" fill="#3a1a05"/><path d="M35 39 q7 -6 14 -2 M61 36 q7 -4 14 1" stroke="#3a1a05" stroke-width="3" fill="none" stroke-linecap="round"/>'
      : '<circle cx="42" cy="47" r="5" fill="#3a1a05"/><circle cx="68" cy="47" r="5" fill="#3a1a05"/><circle cx="44" cy="45" r="1.6" fill="#fff"/><circle cx="70" cy="45" r="1.6" fill="#fff"/>';
    const mouth = mood === 'think' ? '<path d="M46 66 q9 -4 18 0" stroke="#3a1a05" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
      : mood === 'fire' ? '<path d="M42 60 q13 16 26 0 z" fill="#3a1a05"/><path d="M48 64 q7 6 14 0" fill="#ff6b6b"/>'
      : '<path d="M43 61 q12 11 24 0" stroke="#3a1a05" stroke-width="3.5" fill="none" stroke-linecap="round"/>';
    return `<svg class="coach-svg" viewBox="0 0 110 110" aria-hidden="true">
      <circle cx="55" cy="58" r="44" fill="#ff7a1a"/><circle cx="55" cy="58" r="44" fill="url(#cg)"/>
      <defs><radialGradient id="cg" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffb066" stop-opacity=".9"/><stop offset="1" stop-color="#c2410c" stop-opacity="0"/></radialGradient></defs>
      <path d="M11 58 h88 M55 14 v88 M24 26 q22 32 0 64 M86 26 q-22 32 0 64" stroke="#7a2a05" stroke-width="2.4" fill="none" opacity=".55"/>
      <rect x="14" y="22" width="82" height="11" rx="5.5" fill="#22d3ee"/><rect x="14" y="26" width="82" height="3" fill="#fff" opacity=".7"/>
      <ellipse cx="33" cy="60" rx="6" ry="4" fill="#ff3d7f" opacity=".45"/><ellipse cx="77" cy="60" rx="6" ry="4" fill="#ff3d7f" opacity=".45"/>
      ${eyes}${mouth}
      <path d="M90 74 l12 8" stroke="#ffd400" stroke-width="3"/><circle cx="104" cy="84" r="5" fill="#ffd400"/>
    </svg>`;
  }
  // コーチの絵（data.js の COACH.img があればアニメの絵、読み込めない時はいつものボールのキャラ）
  function coachFace(mood = 'happy') {
    if (!COACH.img) return coachSvg(mood);
    return `<i class="coach-face"><img class="coach-img" src="${esc(COACH.img)}" alt="" onerror="this.parentNode.classList.add('noimg')">${coachSvg(mood)}</i>`;
  }
  const fillLine = (s, v) => s.replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
  let coachIdx = 0;
  function coachCandidates() {
    const t = todayStr(); const d = S.days[t] || { m: [], pts: 0 };
    const st = streak(); const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', hour: 'numeric', hour12: false }).format(new Date())) % 24;
    const left = ALLOWANCE.bigWinMissions - stdCount(d);
    const v = { name: S.nick || 'キミ', streak: st, next: st + 1, left, weak: weakTotal(), days: S.test.date ? diffDays(t, S.test.date) : '', min: timerMin() };
    const L = COACH_LINES; const out = [];
    const add = (k, mood) => (L[k] || []).forEach((s) => out.push({ text: fillLine(s, v), mood }));
    if (S.timer) add('timer', 'happy');
    if (d.pts > 0 && !paperDone(d)) add('gameOnly', 'think');
    if (played(t) && !(d.qk || []).includes('speak')) add('speakNotYet', 'wink');
    if (stdCount(d) >= ALLOWANCE.bigWinMissions) add('bigDone', 'fire');
    else if (left > 0 && left <= 2 && stdCount(d) > 0) add('nearBig', 'fire');
    if (!played(t)) add('notYet', 'think');
    else if (d.win) add('winDone', 'wink');
    if (STREAK_BONUS[st] || [3, 5, 7, 10, 14, 21, 30, 50, 100].includes(st)) add('streakUp', 'fire');
    if (v.weak >= 5) add('weak', 'think');
    if (v.days !== '' && v.days > 0 && v.days <= 21) add('test', 'think');
    if (S.lastCheer && diffDays(S.lastCheer.date, t) <= 1) add('cheer', 'wink');
    add(h >= 5 && h < 11 ? 'morning' : h < 17 && h >= 11 ? 'day' : h >= 17 && h < 21 ? 'evening' : 'late', 'happy');
    add('tips', 'wink');
    return out;
  }
  function coachBox() {
    const c = coachCandidates(); if (!c.length) return '';
    // いちばん大事なひとことから。タップするたびに次のひとこと
    const x = c[coachIdx % c.length];
    return `<button class="coach-box" data-act="coach"><span class="coach-av">${coachFace(x.mood)}</span>
      <span class="coach-bub"><span class="coach-nm">${esc(COACH.role)} ${esc(COACH.name)}</span>${esc(x.text)}<span class="coach-more">タップで次のひとこと ›</span></span></button>`;
  }
  function coachQuizLine(perfect, ok, n) {
    const k = perfect ? 'quizPerfect' : n && ok / n >= 0.7 ? 'quizGood' : 'quizLow';
    return `<div class="coach-mini">${coachFace(perfect ? 'fire' : k === 'quizGood' ? 'wink' : 'think')}<span>${esc(pick(COACH_LINES[k] || ['ナイスゲーム！']))}</span></div>`;
  }
  const stdCount = (d) => ((d && d.m) || []).filter((id) => ALLOWANCE.stdMissions.includes(id)).length;
  function bigProgress(d) {
    const n = stdCount(d); const A = ALLOWANCE;
    return n >= A.bigWinMissions ? `🔥 BIG WIN 達成！ +${A.bigWin}円` : `基本 <b class="bp">${n}/${A.bigWinMissions}本</b> → BIG WIN +${A.bigWin}円`;
  }
  const weakTotal = () => weakPool().length;
  function weakCall() {
    const n = weakTotal();
    if (n < 3) return '';
    const done = (S.days[todayStr()] || {}).wkt;
    return `<button class="weakcall" data-act="quiz" data-kind="weak"><span class="wc-e">🎯</span><span class="wc-t"><b>苦手つぶし ${n}問 たまってるよ</b><br>${done ? '今日のボーナスはゲットずみ ✓' : n >= WEAK_BONUS_MIN ? `全問正解で 🎟️ +1（1日1回）` : `正解すると苦手リストから消えるよ`}</span><span class="wc-a">›</span></button>`;
  }
  // ゲームだけで紙の勉強がまだの日に出す一押し
  function paperNudge() {
    const d = S.days[todayStr()];
    if (!d || d.pts <= 0 || paperDone(d)) return '';
    return `<div class="nudge">✍️ 今日はまだ紙の勉強が0本。<b>ミッション1本</b>（または⏱タイマー${TIMER.winMin}分）で今日も <b>WIN</b> → 🎟️！<button class="btn" data-q="home" data-tab="home">ミッションへ ›</button></div>`;
  }
  function qaSubjects() { return [...new Set(BANK.qa.map((x) => x.s))]; }
  function viewGame() {
    const weakN = weakTotal();
    const best = (k, n = QUIZ_LEN) => (S.best[k] != null ? `ベスト ${S.best[k]}/${n}` : 'NEW');
    const tile = (k, cls, sub) => `<button class="tile ${cls}" data-act="quiz" data-kind="${esc(k)}"><span class="t-e">${kindIcon(k)}</span><span class="t-n">${esc(quizName(k))}</span><span class="t-b">${sub}</span></button>`;
    const qaTiles = qaSubjects().map((s, i) => tile('qa:' + s, i % 2 ? 'gc-qa2' : 'gc-qa', best('qa:' + s))).join('');
    // おまかせがスピーキングを選んでいる時は、同じボタンを2つ並べない
    const speakCard = autoPick().kind === 'speak' ? '' : `<button class="speakcard" data-act="speak"><span class="sp-e">🎤</span><span class="sp-t"><b>スピーキング</b><small>お手本を聞いて、英語で話そう ・ 5問</small></span><span class="sp-b">${best('speak', SPEAK_LEN)}</span></button>`;
    return header() + paperNudge() + heroButton() + speakCard + `
      <div class="sec-title"><h2>ゲームをえらぶ</h2><span>1問 1P</span></div>
      <div class="tiles">
        ${tile('listen', 'gc-listen', best('listen'))}
        ${tile('challenge', 'gc-challenge', `全問正解 +${ALLOWANCE.perfect}円`)}
        ${tile('weak', 'gc-weak', `苦手 ${weakN}問`)}
        ${tile('spell', 'gc-spell', best('spell'))}
        ${tile('plural', 'gc-plural', best('plural'))}
        ${tile('kanji', 'gc-kanji', best('kanji'))}
        ${qaTiles}
      </div>
      <p class="note" style="margin-top:14px">全問正解で +2P ＆ 🎟️（1日2枚まで）。今日の WIN には紙のミッション1本か ⏱タイマー10分が必要だよ ✍️</p>`;
  }
  function phaseOf(left) { return left == null ? null : ROADMAP.findIndex((p) => left <= p.from && left >= p.to); }
  function viewTest() {
    const t = todayStr(); const T = S.test;
    const left = T.date ? diffDays(t, T.date) : null;
    const done = TEST_CHECKS.filter((c) => T.checks[c.id]).length;
    const groups = [...new Set(TEST_CHECKS.map((c) => c.sub))];
    const ph = phaseOf(left);
    const goalRows = ['国語', '数学', '英語', '理科', '社会'].map((s) => {
      const g = S.goals[s] || {};
      return `<div class="goalrow"><span>${s}</span><input class="inp" inputmode="numeric" id="gp-${s}" value="${esc(g.prev || '')}" placeholder="前回"><span class="arrow">→</span><input class="inp goal" inputmode="numeric" id="gg-${s}" value="${esc(g.goal || '')}" placeholder="目標"></div>`;
    }).join('');
    const SUBS5 = ['国語', '数学', '英語', '理科', '社会'];
    const gSum = SUBS5.reduce((n, x) => n + (Number((S.goals[x] || {}).goal) || 0), 0);
    const pSum = SUBS5.reduce((n, x) => n + (Number((S.goals[x] || {}).prev) || 0), 0);
    const gSet = SUBS5.every((x) => (S.goals[x] || {}).goal);
    const target = `<div class="target">
        <div class="tg-l">🎯 家族の目標</div>
        <div class="tg-n">${esc(TEST_TARGET.name)}で <b>5科 ${TEST_TARGET.total}点</b></div>
        ${pSum ? `<div class="tg-s">前回 ${pSum}点 → あと <b>+${Math.max(0, TEST_TARGET.total - pSum)}点</b></div>` : '<div class="tg-s">下の「目標スコア」に前回の点数を入れてね</div>'}
        <div class="tg-bar"><i style="width:${Math.min(100, (pSum / TEST_TARGET.total) * 100)}%"></i><span style="left:${Math.min(100, (gSum / TEST_TARGET.total) * 100)}%"></span></div>
        <div class="tg-s">${gSet ? (gSum >= TEST_TARGET.total ? `✅ 目標の合計 ${gSum}点 — ${TEST_TARGET.total}点プラン完成！` : `目標の合計 ${gSum}点 — あと${TEST_TARGET.total - gSum}点ぶん、どの教科で上げる？`) : '教科ごとの目標を入れて、400点プランを作ろう'}</div>
      </div>`;
    return header() + target + `
      <div class="testhead">
        <div style="font-size:13px;color:var(--sub)">次の試合（テスト）</div>
        <div style="font-family:var(--display);font-weight:800;font-size:22px;margin:4px 0 6px">${esc(T.name)}</div>
        <div class="countdown">${left == null ? '<small>日付が決まったら入れてね ↓</small>' : left > 0 ? `あと ${left}<small>日</small>` : left === 0 ? '<small>今日が本番！ がんばれ！</small>' : '<small>おつかれさま！ 次のテストを登録しよう</small>'}</div>
        <div class="row" style="margin-top:10px"><input class="inp" id="tname" value="${esc(T.name)}" style="flex:1"><input class="inp" type="date" id="tdate" value="${esc(T.date)}"></div>
        <div class="row" style="margin-top:8px"><button class="btn" data-act="tsave">保存</button><button class="btn ghost" data-act="treset">次のテストにする</button></div>
        <div class="progress"><i style="width:${(done / TEST_CHECKS.length) * 100}%"></i></div>
        <div class="note" style="margin-top:6px">準備度 ${done}/${TEST_CHECKS.length} ・ チェック1つ 3P</div>
      </div>
      <div class="sec-title"><h2>試合までの作戦</h2><span>${ph != null && ph >= 0 ? '今ここ ▶' : ''}</span></div>
      <div class="roadmap">${ROADMAP.map((p, i) => `<div class="phase ${i === ph ? 'now' : ph != null && ph >= 0 && i < ph ? 'past' : ''}"><div class="pt">${i === ph ? '▶ ' : ''}${esc(p.title)}<span>${p.from >= 999 ? `${p.to}日前まで` : p.to === 0 ? '前日〜当日' : `${p.from}〜${p.to}日前`}</span></div><div class="px">${esc(p.text)}</div></div>`).join('')}</div>
      <div class="sec-title"><h2>目標スコア</h2><span>自分で決めよう</span></div>
      <div class="goals">${goalRows}<div class="note" style="text-align:right;margin:4px 2px">前回 合計 <b>${pSum || '—'}</b> → 目標 合計 <b style="color:var(--yellow)">${gSum || '—'}</b> / ${TEST_TARGET.total}</div><button class="btn" data-act="gsave" style="width:100%;margin-top:8px">目標を保存</button></div>
      <div class="sec-title"><h2>試合前チェック</h2><span>前期の振り返りから</span></div>
      ${groups.map((g) => `<div class="subgroup"><h4>${esc(g)}</h4>${TEST_CHECKS.filter((c) => c.sub === g).map((c) => `
        <button class="check ${T.checks[c.id] ? 'on' : ''}" data-act="check" data-id="${c.id}"><span class="bx">${T.checks[c.id] ? '✓' : ''}</span><span>${esc(c.label)}</span></button>`).join('')}</div>`).join('')}`;
  }
  // ---------- 声（要望・わからない・苦手を伝える） ----------
  let voiceCat = 'dunno';
  let voiceQ = '';
  function coachQuestion() { const n = Math.floor(Date.parse(todayStr() + 'T00:00:00Z') / 86400000); return COACH_QUESTIONS[n % COACH_QUESTIONS.length]; }
  function viewVoice() {
    const cq = coachQuestion();
    const doneToday = !!S.voiceDays[todayStr()];
    const catName = Object.fromEntries(VOICE_CATS.map((c) => [c.id, c.label]));
    const sent = new Set(loadQueue().filter((e) => e.type === 'voice').map((e) => e.detail && e.detail.vid));
    return header() + `
      <div class="coach">
        <div class="coach-l">🏀 コーチから今日の質問</div>
        <div class="coach-q">${esc(cq)}</div>
        <button class="btn" data-act="vanswer">この質問に答える</button>
      </div>
      <div class="sec-title"><h2>おうちの人に伝える</h2><span>${doneToday ? '今日のボーナス獲得ずみ ✓' : '送ると +2P（1日1回）'}</span></div>
      <div class="vbox">
        <div class="chips">${VOICE_CATS.map((c) => `<button class="chip ${c.id === voiceCat ? 'on' : ''}" data-act="vcat" data-id="${c.id}">${c.label}</button>`).join('')}</div>
        <div class="vq ${voiceQ ? '' : 'hidden'}" id="vq">📝 ${esc(voiceQ)} <button data-act="vqclear">✕</button></div>
        <textarea class="inp vtext" id="vtext" maxlength="400" placeholder="例：理科の「力」のところがよくわからない／ゲームに歴史の問題を増やしてほしい"></textarea>
        <div class="row" style="margin-top:8px">
          <button class="btn mic" data-act="vmic" id="vmic">🎤 話して入力</button>
          <button class="btn" data-act="vsend" style="flex:1">送る 📨</button>
        </div>
        <p class="note" style="margin:8px 2px 0">🎤 が使えない時は、キーボードのマイクボタンでも話して入力できるよ。週に1回、声を送るとガチャチケット +1！</p>
      </div>
      ${S.cheerLog.length ? `<div class="sec-title"><h2>おうちからの返事・エール</h2></div>
        <div class="vlist">${S.cheerLog.slice(-10).reverse().map((c) => `<div class="vitem reply"><div class="vm">${esc(c.date.slice(5).replace('-', '/'))} 📣</div>${esc(c.text)}</div>`).join('')}</div>` : ''}
      ${S.voices.length ? `<div class="sec-title"><h2>送った声</h2></div>
        <div class="vlist">${S.voices.slice(-10).reverse().map((v) => `<div class="vitem"><div class="vm">${esc(v.date.slice(5).replace('-', '/'))} ${esc(catName[v.cat] || '')} <span>${sent.has(v.id) ? '送信待ち' : '届いたよ ✓'}</span></div>${v.q ? `<div class="vqq">Q. ${esc(v.q)}</div>` : ''}${esc(v.text)}</div>`).join('')}</div>` : ''}`;
  }
  const extraCards = () => Object.values(S.cards).reduce((a, n) => a + Math.max(0, n - 1), 0);
  function viewGacha() {
    const owned = Object.keys(S.cards).length;
    const ex = extraCards();
    const canTrade = ex >= TRADE_COST && tradable().length > 0;
    const nextMs = COLLECTION_MILESTONES.find((m) => m > owned);
    return header() + `
      ${S.complete ? `<div class="complete-banner">👑 コンプリート達成！（${esc(S.complete.slice(5).replace('-', '/'))}）<br><small>34種類ぜんぶ集めた殿堂入りプレーヤー</small></div>` : ''}
      <div class="gacha-machine"><div class="gacha-ball">🏀</div>
        <p>チケット1枚で1回。ダブったら +5XP！</p>
        <button class="btn big" data-act="pull" ${S.tickets > 0 ? '' : 'disabled style="opacity:.4"'}>🎟️ ガチャを回す（残り ${S.tickets}）</button>
        <div class="pity">あと ${Math.max(1, 10 - S.pity)} 回以内に SR 以上 確定！</div></div>
      <div class="trade">
        <div class="tr-t">🔄 トレード <span>ダブり ${ex}枚</span></div>
        <div class="tr-s">ダブり${TRADE_COST}枚で、<b>まだ持っていないカード</b>が1枚もらえる！（レア度はガチャと同じ確率・UR はガチャだけ）</div>
        <button class="btn" data-act="trade" ${canTrade ? '' : 'disabled style="opacity:.4"'}>${owned >= CARDS.length ? 'もう全部持ってる！' : !tradable().length ? '残りは UR だけ！ UR はガチャでしか出ないよ' : canTrade ? `ダブり${TRADE_COST}枚でトレード` : `あと${TRADE_COST - ex}枚ダブったらトレードできる`}</button>
      </div>
      <p class="note" style="margin:12px 2px">チケットのもらい方：今日のWIN ／ ミニゲーム全問正解 ／ 苦手つぶし全問正解 ／ 連続日数ボーナス（3・7・14・21・30日…）／ コレクション${COLLECTION_MILESTONES.join('・')}種 ／ おうちからのエール</p>
      <div class="sec-title"><h2>コレクション</h2><span>${owned}/${CARDS.length}${nextMs ? `（${nextMs}種で 🎟️${nextMs >= CARDS.length ? ' ＋👑' : ''}）` : ''}</span></div>
      <div class="collection">${CARDS.slice().sort((a, b) => RARITY_ORDER.indexOf(b.r) - RARITY_ORDER.indexOf(a.r)).map((c) => {
        const n = S.cards[c.id] || 0;
        return `<div class="cc r-${c.r} ${n ? '' : 'locked'}"><span class="r">${c.r}</span>${n > 1 ? `<span class="cnt">×${n}</span>` : ''}<div class="e">${c.e}</div><div class="n">${n ? esc(c.name) : '？？？'}</div></div>`;
      }).join('')}</div>`;
  }
  function viewSet() {
    return header() + `
      <div class="sec-title"><h2>プレーヤー</h2><button class="btn ghost" data-tab="home">← もどる</button></div>
      <div class="set-item"><span>選手名</span><input class="inp grow" id="nick" value="${esc(S.nick)}" maxlength="12"><button class="btn" data-act="nick">保存</button></div>
      <div class="set-item"><span class="grow">あそびかた・ランクのしくみ</span><button class="btn ghost" data-act="howto">見る</button></div>
      <div class="set-item"><span class="grow">効果音</span><button class="btn ghost" data-act="sound">${S.sound ? '🔊 ON' : '🔇 OFF'}</button></div>
      <div class="sec-title"><h2>ミッションの編集</h2><span>自分で決めてOK</span></div>
      ${S.missions.map((m) => `<div class="set-item"><span>${m.icon || '🏀'}</span><div class="grow">${esc(m.label)}<div class="note">${esc(m.sub)}・${m.pts}P${ALLOWANCE.stdMissions.includes(m.id) ? '・基本' : '・おこづかい対象外'}</div></div><button class="del" data-act="mdel" data-id="${esc(m.id)}">削除</button></div>`).join('')}
      <div class="set-item" style="flex-wrap:wrap">
        <input class="inp" id="mlabel" placeholder="例：理科ワーク1ページ" style="flex:1 1 100%">
        <select class="inp" id="msub">${SUBJECTS.map((s) => `<option>${s}</option>`).join('')}</select>
        <select class="inp" id="mpts"><option value="2">2P</option><option value="3">3P</option></select>
        <button class="btn" data-act="madd">追加</button></div>
      <div class="sec-title"><h2>データ</h2></div>
      ${S.syncError === 'device' ? `<div class="warn">⚠️ おうちのスプレッドシートに記録が届いていません。<br>おうちの人に「保護者画面 → スマホの登録をリセット」を押してもらってから、下のボタンを押してね。<br><button class="btn" data-act="restore" style="margin-top:8px">もう一度つなぐ</button></div>` : ''}
      <p class="note">記録は${CFG.GAS_URL ? 'おうちの人のスプレッドシートにも自動で保存されます。' : 'このスマホの中にだけ保存されています（送信先が未設定）。'}<br>
      ${S.lastSync ? '最終送信：' + new Date(S.lastSync).toLocaleString('ja-JP') : ''}</p>
      <button class="btn ghost" data-act="wipe" style="margin-top:8px">全部リセットする</button>`;
  }
  function updateSyncLabel() {
    const el = $('#sync'); if (!el) return;
    const q = loadQueue().length;
    el.textContent = !CFG.GAS_URL ? '' : S.syncError === 'device' ? '⚠️ 送信できていません（⚙️設定を見てね）' : q ? `送信待ち ${q} 件（電波のある所で自動送信）` : S.lastSync ? '✓ おうちに送信ずみ' : '';
  }
  function render() {
    const v = { home: viewHome, game: viewGame, test: viewTest, voice: viewVoice, gacha: viewGacha, set: viewSet, ranks: viewRanks }[tab] || viewHome;
    $('#app').innerHTML = v();
    renderTabs();
    updateSyncLabel();
  }

  // ---------- 操作 ----------
  async function onMission(id) {
    const m = S.missions.find((x) => x.id === id); if (!m) return;
    const d = day();
    if (d.m.includes(id)) {
      if (!confirm(`「${m.label}」を取り消す？`)) return;
      d.m = d.m.filter((x) => x !== id);
      d.pts -= m.pts; S.xp = Math.max(0, S.xp - m.pts); save();
      logEvent('undo', m.label, m.sub, -m.pts, { mission: id });
      render(); return;
    }
    d.m.push(id);
    const r = addPoints(m.pts, 'mission', m.label, m.sub, { mission: id });
    render();
    await shootOv(m.pts + (r.tipoff ? 1 : 0), r.tipoff ? '🏀 TIP OFF！ 今日の1本目ボーナス +1' : null);
    await afterEffects(r);
    // おこづかいの手応え：基本ミッションを決めるたびに BIG WIN までの残りを知らせる
    const left = ALLOWANCE.bigWinMissions - stdCount(d);
    if (ALLOWANCE.stdMissions.includes(id) && left > 0) { sfx.coin(); toast(left === 1 ? `💰 あと1本で BIG WIN！ おこづかい +${ALLOWANCE.bigWin}円` : `💰 BIG WIN まで あと${left}本（+${ALLOWANCE.bigWin}円）`, 2600); }
  }
  async function onCheck(id) {
    const c = TEST_CHECKS.find((x) => x.id === id); if (!c) return;
    if (S.test.checks[id]) {
      delete S.test.checks[id];
      const d = day(); d.pts -= 3; S.xp = Math.max(0, S.xp - 3); save();
      logEvent('undo', c.label, c.sub, -3, { check: id });
      render(); return;
    }
    S.test.checks[id] = todayStr();
    { const d = day(); d.ck = (d.ck || 0) + 1; }
    const r = addPoints(3, 'check', c.label, c.sub === '本番' ? '全教科' : c.sub, { check: id, test: S.test.name });
    sfx.ok(); confetti(50); toast(`✅ +${3 + (r.tipoff ? 1 : 0)}P  準備OK！`);
    await afterEffects(r);
  }
  function pullCard() {
    if (S.tickets < 1) return;
    S.tickets--; S.pulls++; S.pity++;
    let roll = Math.random() * 100; let rar = 'N';
    let acc = 0;
    for (const k of RARITY_ORDER) { acc += RARITY_RATE[k]; if (roll < acc) { rar = k; break; } }
    if (S.pity >= 10 && (rar === 'N' || rar === 'R')) {
      const hi = ['SR', 'SSR', 'UR']; const tot = hi.reduce((a, k) => a + RARITY_RATE[k], 0);
      roll = Math.random() * tot; acc = 0;
      for (const k of hi) { acc += RARITY_RATE[k]; if (roll < acc) { rar = k; break; } }
    }
    if (['SR', 'SSR', 'UR'].includes(rar)) S.pity = 0;
    const card = pick(CARDS.filter((c) => c.r === rar));
    const dup = !!S.cards[card.id];
    S.cards[card.id] = (S.cards[card.id] || 0) + 1;
    const before = rankIdx(S.xp);
    if (dup) S.xp += 5;
    if (rankIdx(S.xp) > before) { const d = day(); d.ru = (d.ru || 0) + 1; if (rankIdx(S.xp) >= ALLOWANCE.rankUpFrom) d.ru2 = (d.ru2 || 0) + 1; }
    const col = dup ? null : collectionCheck();
    save();
    logEvent('gacha', card.name, '', 0, { card: card.id, rarity: rar, dup });
    return { card, dup, col, levelUp: rankIdx(S.xp) > before ? rankIdx(S.xp) : null };
  }
  // コレクションの節目（20・30種でチケット、全種そろったらコンプリート）
  function collectionCheck() {
    const owned = Object.keys(S.cards).length;
    const r = { ticket: 0, complete: false, owned };
    COLLECTION_MILESTONES.forEach((m) => { const k = 'col' + m; if (owned >= m && !S.milestones[k]) { S.milestones[k] = true; S.tickets++; r.ticket++; } });
    if (owned >= CARDS.length && !S.complete) { S.complete = todayStr(); r.complete = true; logEvent('complete', 'コレクション コンプリート', '', 0, { kinds: owned, pulls: S.pulls }); }
    return r;
  }
  async function collectionOv(col) {
    if (!col) return;
    if (col.complete) {
      sfx.fanfare(); confetti(260);
      await overlay(`<div class="lvup-title" style="font-size:46px">COMPLETE!!</div><div class="lvup-rank">👑</div>
        <div class="lvup-name">バスケ技カード ${CARDS.length}種類 コンプリート！</div>
        <div class="reward-big">🏅 殿堂入り！${col.ticket ? `　🎟️ +${col.ticket}` : ''}${COMPLETE_REWARD ? `<br>🎁 ごほうび：${esc(COMPLETE_REWARD)}<br><small>この画面をおうちの人に見せてね</small>` : ''}</div>`, { lockMs: 1400 });
    } else if (col.ticket) { sfx.coin(); toast(`📚 コレクション ${col.owned}種たっせい！ 🎟️ +${col.ticket}`, 3000); }
  }
  // ダブり（2枚目以降）を TRADE_COST 枚使って、まだ持っていないカードを1枚もらう
  const tradable = () => CARDS.filter((c) => !S.cards[c.id] && c.r !== 'UR');
  function tradeCard() {
    if (extraCards() < TRADE_COST || !tradable().length) return null;
    let left = TRADE_COST; const used = [];
    Object.keys(S.cards).sort((a, b) => S.cards[b] - S.cards[a]).forEach((id) => { while (left > 0 && S.cards[id] > 1) { S.cards[id]--; left--; used.push(id); } });
    const missing = tradable();
    const rars = RARITY_ORDER.filter((r) => missing.some((c) => c.r === r));
    let roll = Math.random() * rars.reduce((a, r) => a + RARITY_RATE[r], 0); let rar = rars[rars.length - 1];
    for (const r of rars) { if (roll < RARITY_RATE[r]) { rar = r; break; } roll -= RARITY_RATE[r]; }
    const card = pick(missing.filter((c) => c.r === rar));
    S.cards[card.id] = 1;
    const col = collectionCheck();
    save();
    logEvent('trade', card.name, '', 0, { card: card.id, rarity: rar, used });
    return { card, col };
  }
  const RCOL = { N: '#b8c0d6', R: '#2f7de1', SR: '#a855f7', SSR: '#ffc400', UR: 'linear-gradient(135deg,#ff3d7f,#ffd400,#2ee59d,#22d3ee,#a855f7)' };
  async function revealOv(card, tag, wait) {
    sfx.drum();
    await overlay(`<div class="gacha-ball shake" style="font-size:120px">${wait}</div><div class="shot-sub" style="opacity:1">ドキドキ…</div>`, { closeOnTap: false, autoClose: 1100 });
    const fl = document.createElement('div'); fl.className = 'flash'; fl.style.background = RCOL[card.r]; document.body.appendChild(fl); setTimeout(() => fl.remove(), 700);
    sfx.reveal(card.r); confetti(card.r === 'N' ? 30 : card.r === 'R' ? 70 : 180);
    await overlay(`<div class="reveal cc r-${card.r}" style="aspect-ratio:3/4"><div class="rr" style="color:${card.r === 'UR' ? '#ffd400' : RCOL[card.r]}">${card.r}</div><div class="e">${card.e}</div><div class="n">${esc(card.name)}</div><div class="d">${esc(card.d)}</div></div>
      <div class="newtag" style="margin-top:16px">${tag}</div>`, { lockMs: 900 });
  }
  async function onPull() {
    const res = pullCard(); if (!res) return;
    const { card, dup } = res;
    render();
    await revealOv(card, dup ? 'ダブり！ +5 XP' : 'NEW!! コレクションに追加', '🏀');
    if (res.levelUp != null) await levelUpOv(res.levelUp);
    await collectionOv(res.col);
    render();
  }
  async function onTrade() {
    if (!confirm(`ダブり${TRADE_COST}枚を、持っていないカード1枚とトレードする？`)) return;
    const res = tradeCard(); if (!res) return;
    render();
    await revealOv(res.card, '🔄 トレード成功！ NEW!!', '🔄');
    await collectionOv(res.col);
    render();
  }

  // ---------- ミニゲーム ----------
  // 重点（f）の問題は3倍出やすく、苦手リストの問題は最大3問まで優先して出す
  function sampleItems(items, n, kind, keyOf) {
    const wk = S.weak[kind] || {};
    const weak = shuffle(items.filter((it) => wk[keyOf(it)])).slice(0, 3);
    const pool = [];
    items.forEach((it) => { if (!weak.includes(it)) { pool.push(it); if (it.f) pool.push(it, it); } });
    const out = weak.slice();
    for (const it of shuffle(pool)) { if (out.length >= n) break; if (!out.includes(it)) out.push(it); }
    return shuffle(out);
  }
  function choicesFor(answer, pool) {
    const ds = [];
    const near = shuffle(pool.filter((a) => a !== answer && Math.abs(a.length - answer.length) <= 2));
    for (const a of near.concat(shuffle(pool))) { if (a !== answer && !ds.includes(a)) ds.push(a); if (ds.length === 3) break; }
    return shuffle([answer, ...ds]);
  }
  const mkSpell = (it) => ({ type: 'spell', key: it.a, sub: '英語', prompt: '英語で書くと？', main: esc(it.q), hint: it.a[0] + ' ' + '_ '.repeat(it.a.length - 1).trim(), answer: it.a });
  const mkPlural = (it) => ({ type: 'plural', key: it.q, sub: '英語', prompt: '複数形にすると？', main: `${esc(it.q)}${it.h ? `<div style="font-size:16px;color:var(--sub);font-family:var(--body)">（${esc(it.h)}）</div>` : ''}`, hint: `${it.a.length}文字`, answer: it.a });
  const mkKanji = (it) => ({ type: 'kanji', key: it.q, sub: '国語', prompt: '読みは？', main: esc(it.q), answer: it.a, choices: choicesFor(it.a, [...new Set(BANK.kanji.map((k) => k.a))]) });
  function mkQa(it) {
    const same = [...new Set(BANK.qa.filter((x) => x.s === it.s).map((x) => x.a))];
    const pool = same.length >= 4 ? same : [...new Set(BANK.qa.map((x) => x.a))];
    return { type: 'qa', key: it.q, sub: it.s, prompt: `${it.s}・答えは？`, main: esc(it.q), long: true, answer: it.a, choices: choicesFor(it.a, pool) };
  }
  const mkPast = (w) => ({ type: 'past', key: w[0], sub: '英語', prompt: '過去形にすると？', main: `${esc(w[0])}<div style="font-size:16px;color:var(--sub);font-family:var(--body)">（${esc(w[2])}）</div>`, hint: `${w[1].length}文字`, answer: w[1] });
  const mkThird = (w) => ({ type: 'third', key: w[0], sub: '英語', prompt: '( ) の動詞を正しい形に', main: `He ___ … (${esc(w[0])})`, hint: `${w[1].length}文字`, answer: w[1] });
  const mkHard = (w) => ({ type: 'hkanji', key: w[0], sub: '国語', prompt: '読みは？（上級）', main: esc(w[0]), answer: w[1], choices: choicesFor(w[1], [...new Set(HARD_KANJI.map((k) => k[1]))]) });
  // まちがえた時に出す文法ルールのヒント（複数形・3単現・過去形）。規則どおりの s / ed だけの語は出さない
  function sRule(base, ans) {
    const b = base.toLowerCase(); const a = ans.toLowerCase();
    if (/[^aeiou]y$/.test(b) && a === b.slice(0, -1) + 'ies') return `子音＋y で終わる語は、y を i にかえて es（${base} → ${ans}）`;
    if (/[aeiou]y$/.test(b) && a === b + 's') return `母音＋y（ay・ey・oy・uy）は、s をつけるだけ（${base} → ${ans}）`;
    if (/(s|x|z|ch|sh|o)$/.test(b) && a === b + 'es') return `s・x・ch・sh・o で終わる語は、es をつける（${base} → ${ans}）`;
    if (/(f|fe)$/.test(b) && a.endsWith('ves')) return `f・fe で終わる語は、f を v にかえて es（${base} → ${ans}）`;
    if (a === b + 's') return '';
    return `形が変わる特別な形。そのまま覚えよう（${base} → ${ans}）`;
  }
  function pastRule(base, ans) {
    const b = base.toLowerCase(); const a = ans.toLowerCase();
    if (/[^aeiou]y$/.test(b) && a === b.slice(0, -1) + 'ied') return `子音＋y で終わる動詞は、y を i にかえて ed（${base} → ${ans}）`;
    if (a === b + b.slice(-1) + 'ed') return `短い音＋子音1文字で終わる動詞は、最後の文字を重ねて ed（${base} → ${ans}）`;
    if (a === b + 'd' || a === b + 'ed') return '';
    return `不規則動詞。形ごと覚えよう（${base} → ${ans}）`;
  }
  function ruleTip(q) {
    if (!q) return '';
    if (q.type === 'plural' || q.type === 'third') return sRule(q.key, q.answer);
    if (q.type === 'past') return pastRule(q.key, q.answer);
    return '';
  }
  // リスニング：英語を聞いて答える（意味を選ぶ／聞こえた単語を選ぶ／質問への返事を選ぶ）
  const listenMain = (extra) => `<div class="lsn"><button class="lsn-btn" data-listen="1">🔊</button><button class="lsn-slow" data-listen="slow">🐢 ゆっくり</button></div>${extra || ''}`;
  function mkListenMeaning(w) {
    return { type: 'listen', key: w[0], sub: '英語', prompt: '聞いて、意味は？', main: listenMain(), say: w[0], answer: w[1], long: true, choices: choicesFor(w[1], SPEAK_SENTENCES.map((x) => x[1])) };
  }
  function mkListenWord(w) {
    const words = w[0].split(' ');
    const cand = words.map((x, i) => [x.replace(/[^A-Za-z']/g, ''), i]).filter(([x]) => x.length >= 3 && !/'/.test(x));
    if (!cand.length) return mkListenMeaning(w);
    const [ans, at] = pick(cand);
    const pool = [...new Set(SPEAK_SENTENCES.flatMap((x) => x[0].split(' ').map((y) => y.replace(/[^A-Za-z']/g, ''))).filter((y) => y.length >= 3 && !/'/.test(y) && y.toLowerCase() !== ans.toLowerCase()))];
    const blank = words.map((x, i) => (i === at ? x.replace(ans, '＿＿＿') : x)).join(' ');
    return { type: 'listen', key: w[0], sub: '英語', prompt: '聞こえた単語はどれ？', main: listenMain(`<div class="lsn-blank">${esc(blank)}</div>`), say: w[0], answer: ans, choices: choicesFor(ans, pool) };
  }
  function mkListenReply(t) {
    return { type: 'listen', key: t[0], sub: '英語', prompt: '質問を聞いて、正しい返事は？', main: listenMain(), say: t[0], answer: t[3], long: true, choices: choicesFor(t[3], SPEAK_TALK.map((x) => x[3])) };
  }
  function mkListenFor(key) {
    const t = SPEAK_TALK.find((x) => x[0] === key); if (t) return mkListenReply(t);
    const w = SPEAK_SENTENCES.find((x) => x[0] === key); return w ? mkListenMeaning(w) : null;
  }
  function buildListen() {
    const wk = S.weak.listen;
    const sent = sampleItems(SPEAK_SENTENCES.map((w) => ({ w, f: false })), 7, 'listen', (x) => x.w[0]);
    const talk = sampleItems(SPEAK_TALK.map((w) => ({ w, f: false })), 3, 'listen', (x) => x.w[0]);
    return shuffle([...sent.map((x, i) => (i < 4 ? mkListenMeaning(x.w) : mkListenWord(x.w))), ...talk.map((x) => mkListenReply(x.w))]).map((q) => ({ ...q, weak: !!wk[q.key] }));
  }
  function pickW(list, n, kind) { const wk = S.weak[kind] || {}; const weak = shuffle(list.filter((w) => wk[w[0]])).slice(0, 1); return shuffle(weak.concat(shuffle(list.filter((w) => !weak.includes(w))).slice(0, n - weak.length))); }
  function buildQuestions(kind) {
    if (kind === 'challenge') {
      const qa = shuffle(BANK.qa).slice(0, 2).map(mkQa);
      return shuffle([...pickW(PAST_FORMS, 3, 'past').map(mkPast), ...pickW(THIRD_FORMS, 2, 'third').map(mkThird), ...pickW(HARD_KANJI, 3, 'hkanji').map(mkHard), ...qa]);
    }
    if (kind === 'listen') return buildListen();
    if (kind === 'spell') return sampleItems(BANK.spell, QUIZ_LEN, 'spell', (x) => x.a).map(mkSpell);
    if (kind === 'plural') return sampleItems(BANK.plural, QUIZ_LEN, 'plural', (x) => x.q).map(mkPlural);
    if (kind === 'kanji') return sampleItems(BANK.kanji, QUIZ_LEN, 'kanji', (x) => x.q).map(mkKanji);
    if (kind.startsWith('qa:')) { const s = kind.slice(3); return sampleItems(BANK.qa.filter((x) => x.s === s), QUIZ_LEN, 'qa', (x) => x.q).map(mkQa); }
    return shuffle(weakPool()).slice(0, QUIZ_LEN);
  }
  // 苦手つぶしで実際に出せる問題（スプレッドシートで「お休み」にした問題などは入らない）
  function weakPool() {
    const qs = [];
    BANK.spell.filter((x) => S.weak.spell[x.a]).forEach((x) => qs.push(mkSpell(x)));
    BANK.plural.filter((x) => S.weak.plural[x.q]).forEach((x) => qs.push(mkPlural(x)));
    BANK.kanji.filter((x) => S.weak.kanji[x.q]).forEach((x) => qs.push(mkKanji(x)));
    BANK.qa.filter((x) => S.weak.qa[x.q]).forEach((x) => qs.push(mkQa(x)));
    PAST_FORMS.filter((w) => S.weak.past[w[0]]).forEach((w) => qs.push(mkPast(w)));
    THIRD_FORMS.filter((w) => S.weak.third[w[0]]).forEach((w) => qs.push(mkThird(w)));
    HARD_KANJI.filter((w) => S.weak.hkanji[w[0]]).forEach((w) => qs.push(mkHard(w)));
    Object.keys(S.weak.listen).map(mkListenFor).filter(Boolean).forEach((q) => qs.push(q));
    return qs;
  }
  function quizName(kind) {
    return { speak: 'スピーキング', listen: 'リスニング', spell: 'スペル・シュート', plural: '複数形チャレンジ', kanji: '漢字よみ速攻', weak: '苦手つぶし', challenge: 'チャレンジ（上級）' }[kind] || (kind.startsWith('qa:') ? kind.slice(3) + ' 一問一答' : kind);
  }
  function quizSubject(kind) {
    return kind === 'kanji' ? '国語' : kind === 'weak' || kind === 'challenge' ? '全教科' : kind.startsWith('qa:') ? (SUBJECTS.includes(kind.slice(3)) ? kind.slice(3) : '全教科') : '英語';
  }
  function judgeText(q, val) {
    const v = val.trim().replace(/\s+/g, ' ');
    if (v === q.answer) return 'ok';
    if (v.toLowerCase() === q.answer.toLowerCase()) return 'case';
    return 'ng';
  }
  function startQuiz(kind) {
    const qs = buildQuestions(kind);
    if (!qs.length) { toast('苦手リストは空っぽ！ すごい！'); return; }
    const names = { [kind]: quizName(kind) };
    const CLOCK = kind === 'challenge' ? 15 : SHOT_CLOCK;
    const st = { i: 0, answered: 0, ok: 0, combo: 0, maxCombo: 0, pts: 0, miss: [], timer: null, left: CLOCK, locked: false, ended: false, t0: Date.now() };
    const el = document.createElement('div'); el.className = 'ov';
    el.style.background = 'radial-gradient(circle at 50% 30%, #1b2a55, #05070d)';
    el.innerHTML = `<div class="quiz">
      <div class="qhead"><button class="qclose" data-q="quit">✕ やめる</button><div class="qprog"><i></i></div><div class="combo"></div></div>
      <div class="qbody">
        <div class="shotclock"><svg width="76" height="76"><circle cx="38" cy="38" r="33" stroke="#26324f" stroke-width="7" fill="none"/><circle class="ring" cx="38" cy="38" r="33" stroke="#ff5a5a" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="207.3" stroke-dashoffset="0"/></svg><b>24</b></div>
        <div class="qprompt"></div><div class="qmain"></div><div class="qhint"></div>
        <form class="qform" style="width:100%" autocomplete="off"><input class="qinput" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off" enterkeyhint="send"><button class="btn big" style="margin-top:10px">SHOOT 🏀</button></form>
        <div class="choices"></div>
        <div class="judge"></div><div class="answer"></div>
      </div></div>`;
    document.body.appendChild(el);
    const q$ = (s) => el.querySelector(s);
    const input = q$('.qinput');

    function tick() {
      clearInterval(st.timer);
      st.left = CLOCK;
      const ring = q$('.ring'); const num = q$('.shotclock b');
      const t0 = Date.now();
      st.timer = setInterval(() => {
        const left = Math.max(0, CLOCK - (Date.now() - t0) / 1000);
        ring.style.strokeDashoffset = String(207.3 * (1 - left / CLOCK));
        num.textContent = Math.ceil(left);
        if (left <= 0) { clearInterval(st.timer); answer(null); }
      }, 100);
    }
    function show() {
      const q = qs[st.i];
      st.locked = false;
      q$('.qprog i').style.width = (st.i / qs.length) * 100 + '%';
      q$('.qprompt').textContent = `${st.i + 1}/${qs.length} ・ ${q.prompt}`;
      q$('.qmain').innerHTML = q.main; q$('.qmain').classList.toggle('long', !!q.long);
      if (q.say) sayEn(q.say);
      q$('.qhint').textContent = q.hint || '';
      q$('.judge').textContent = ''; q$('.judge').className = 'judge';
      q$('.answer').textContent = '';
      const isText = !q.choices;
      q$('.qform').classList.toggle('hidden', !isText);
      q$('.choices').classList.toggle('hidden', isText);
      if (isText) { input.value = ''; input.focus(); }
      else q$('.choices').innerHTML = q.choices.map((c) => `<button class="choice" data-c="${esc(c)}">${esc(c)}</button>`).join('');
      tick();
    }
    function setCombo() {
      const c = q$('.combo');
      c.textContent = st.combo >= 3 ? `🔥 ON FIRE ×${st.combo}` : st.combo > 0 ? `${st.combo} COMBO` : '';
      c.className = 'combo' + (st.combo >= 3 ? ' fire' : '');
    }
    function answer(val, btn) {
      if (st.locked || st.ended) return;
      st.locked = true;
      st.answered++;
      clearInterval(st.timer);
      const q = qs[st.i];
      const res = val == null ? 'time' : q.choices ? (val === q.answer ? 'ok' : 'ng') : judgeText(q, val);
      const j = q$('.judge');
      const wk = S.weak[q.type];
      if (res === 'ok') {
        st.ok++; st.combo++; st.maxCombo = Math.max(st.maxCombo, st.combo);
        const p = 1; st.pts += p;
        j.textContent = st.combo >= 3 ? `🔥 SWISH! +${p}` : `NICE! +${p}`; j.className = 'judge ok';
        if (wk[q.key]) { wk[q.key]--; if (wk[q.key] <= 0) delete wk[q.key]; }
        sfx.ok(); if (st.combo >= 3) confetti(25);
        if (btn) btn.classList.add('ok');
      } else {
        st.combo = 0;
        wk[q.key] = (wk[q.key] || 0) + 1;
        st.miss.push(q);
        j.textContent = res === 'time' ? '⏰ ショットクロック！' : res === 'case' ? 'おしい！ 大文字に注意' : 'MISS…'; j.className = 'judge ng';
        const tip = ruleTip(q);
        q$('.answer').innerHTML = `正解：${esc(q.answer)}${q.say ? `<div class="rule">🔊 ${esc(q.say)}</div>` : ''}${tip ? `<div class="rule">💡 ${esc(tip)}</div>` : ''}`;
        res === 'time' ? sfx.buzzer() : sfx.ng();
        if (btn) btn.classList.add('ng');
        el.querySelectorAll('.choice').forEach((b) => { if (b.dataset.c === q.answer) b.classList.add('ok'); });
      }
      save();
      setCombo();
      setTimeout(() => { if (st.ended) return; st.i++; if (st.i < qs.length) show(); else finish(false); }, res === 'ok' ? 750 : ruleTip(q) || q.say ? 3200 : 1700);
    }
    function finish(quit) {
      if (st.ended) return;
      st.ended = true;
      clearInterval(st.timer);
      if (window.speechSynthesis) speechSynthesis.cancel();
      const n = quit ? st.answered : qs.length;
      if (quit && n === 0) { el.remove(); return; }
      const d = day();
      const perfect = !quit && n >= QUIZ_LEN && st.ok === n;
      let ticket = false;
      if (perfect) { st.pts += 2; if (d.perfect < 2) { d.perfect++; S.tickets++; ticket = true; } if (kind === 'challenge') d.cp = (d.cp || 0) + 1; }
      // 苦手つぶし：WEAK_BONUS_MIN 問以上を全問正解でチケット（1日1回。10問の全問正解チケットとは別枠）
      let weakTicket = false;
      if (kind === 'weak' && !quit && n >= WEAK_BONUS_MIN && st.ok === n && !d.wkt) { d.wkt = 1; S.tickets++; weakTicket = true; }
      if (kind !== 'weak') S.best[kind] = Math.max(S.best[kind] || 0, st.ok);
      markPlayed(kind);
      const subject = quizSubject(kind);
      const sec = Math.round((Date.now() - st.t0) / 1000);
      const info = { kind, n, ok: st.ok, maxCombo: st.maxCombo, miss: st.miss.map((q) => q.key), sec, quit: quit || undefined, weakBonus: weakTicket || undefined };
      const r = st.pts > 0 ? addPoints(st.pts, 'quiz', names[kind], subject, info) : null;
      if (!r) { save(); logEvent('quiz', names[kind], subject, 0, info); }
      const tips = [...new Set(st.miss.map(ruleTip).filter(Boolean))];
      const tot = st.pts + (r && r.tipoff ? 1 : 0);
      if (perfect) { sfx.fanfare(); confetti(220); } else if (st.ok >= n * 0.7) { sfx.coin(); confetti(80); } else sfx.tap();
      el.querySelector('.quiz').innerHTML = `<div class="qbody result">
        <div style="font-family:var(--display);font-weight:800;font-size:18px">${esc(names[kind])}</div>
        <div class="big">${st.ok}<span style="font-size:28px">/${n}</span></div>
        <div class="lvup-title" style="font-size:${perfect || weakTicket ? 40 : 30}px">${perfect || weakTicket ? 'PERFECT!!' : st.ok >= n * 0.7 ? 'GREAT!' : 'NICE TRY!'}</div>
        <div class="shot-pts" style="opacity:1">+${tot} PTS</div>
        ${st.maxCombo >= 3 ? `<div class="note">最大 ${st.maxCombo} 連続正解 🔥</div>` : ''}
        ${ticket ? '<div class="newtag">全問正解ボーナス 🎟️ +1</div>' : ''}
        ${weakTicket ? '<div class="newtag">🎯 苦手つぶし完了！ 🎟️ +1</div>' : ''}
        ${perfect && kind === 'challenge' && (d.cp || 0) <= ALLOWANCE.perfectPerDay ? `<div class="reward-big">💰 チャレンジ全問正解！ おこづかい +${ALLOWANCE.perfect}円</div>` : ''}
        ${st.miss.length ? `<ul>${st.miss.map((q) => `<li>${['kanji', 'qa', 'hkanji', 'past', 'third', 'listen'].includes(q.type) ? esc(q.key) + ' → ' + esc(q.answer) : esc(q.answer)}</li>`).join('')}</ul><div class="note">↑ 紙に3回書いて覚えよう ✍️（苦手つぶしにも出るよ）</div>` : ''}
        ${coachQuizLine(perfect || weakTicket, st.ok, n)}
        ${tips.length ? `<div class="rulebox"><b>💡 ルールのおさらい</b>${tips.map((t) => `<div>・${esc(t)}</div>`).join('')}</div>` : ''}
        ${paperNudge()}
        <div class="row" style="width:100%;margin-top:14px"><button class="btn ghost" style="flex:1" data-q="again">もう1回</button><button class="btn" style="flex:1" data-q="close">とじる</button></div>
      </div>`;
      el.addEventListener('click', async (e) => {
        const a = e.target.closest('[data-q]'); if (!a) return;
        el.remove();
        if (r) await afterEffects(r); else render();
        if (a.dataset.q === 'again') startQuiz(kind);
      });
    }
    el.addEventListener('click', (e) => {
      const lb = e.target.closest('[data-listen]'); if (lb) { const q = qs[st.i]; if (q && q.say) sayEn(q.say, lb.dataset.listen === 'slow'); return; }
      const c = e.target.closest('.choice'); if (c) { answer(c.dataset.c, c); return; }
      const qz = e.target.closest('[data-q="quit"]');
      if (qz) { if (confirm('やめる？（ここまでの正解は得点になるよ）')) finish(true); }
    });
    q$('.qform').addEventListener('submit', (e) => { e.preventDefault(); if (input.value.trim()) answer(input.value); });
    sfx.buzzer();
    show();
  }

  // ---------- スピーキング（お手本を聞く → 英語で話す → 聞き取れた単語を色分け） ----------
  // 端末の音声認識（英語）で聞き取り、お手本の単語と順番どおりに照らし合わせる。
  // 音声認識が使えない端末では「録音 → 聞き比べ → 自分で判定」に切りかえる（このときは全問正解のチケットなし）
  const SPEAK_LEN = SPEAK_PLAN.length;
  const SPEAK_PASS = 0.8;
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let speakAuto = !!SpeechRec;
  const SPK_EXPAND = { "i'm": 'i am', "you're": 'you are', "he's": 'he is', "she's": 'she is', "it's": 'it is', "that's": 'that is', "we're": 'we are', "they're": 'they are', "what's": 'what is', "where's": 'where is', "let's": 'let us', "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "can't": 'can not', cannot: 'can not', "isn't": 'is not', "aren't": 'are not', "i'd": 'i would', okay: 'ok', "o'clock": 'oclock' };
  const SPK_NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  function spkWords(text) {
    return String(text).toLowerCase().replace(/[’‘]/g, "'").replace(/(\d+):00/g, '$1 oclock').replace(/\bo clock\b/g, 'oclock')
      .replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean)
      .flatMap((w) => (SPK_EXPAND[w] || (SPK_NUM[w] ? SPK_NUM[w] : w)).split(' '))
      .map((w) => w.replace(/'/g, '')).filter(Boolean);
  }
  // 1文字ちがいまでは同じ単語とみなす（practised / practiced など。短い単語は完全一致だけ）
  function sameWord(a, b) {
    if (a === b) return true;
    if (a.length < 5 || Math.abs(a.length - b.length) > 1) return false;
    let i = 0; while (i < a.length && a[i] === b[i]) i++;
    let j = 0; while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
    return Math.max(a.length, b.length) - i - j <= 1;
  }
  // お手本の単語のうち、順番どおりに言えたものに印をつける（最長共通部分列）
  function matchWords(target, heard) {
    const n = target.length, m = heard.length;
    const L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = sameWord(target[i], heard[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    const ok = new Array(n).fill(false);
    for (let i = 0, j = 0; i < n && j < m; ) { if (sameWord(target[i], heard[j])) { ok[i] = true; i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++; }
    return ok;
  }
  function gradeSpeak(item, alts) {
    let best = { score: 0, ok: [], heard: '' };
    for (const h of alts) {
      const hw = spkWords(h);
      if (item.mode === 'talk') {
        const need = spkWords(item.tpl.replace('___', ' '));
        const ok = matchWords(need, hw);
        const got = ok.filter(Boolean).length;
        const extra = hw.length > got; // ___ の部分に自分のことを言えたか
        const score = need.length ? (got / need.length) * (extra ? 1 : 0.7) : 0;
        if (score > best.score || !best.heard) best = { score, ok, heard: h, extra };
      } else {
        const tw = spkWords(item.en);
        const ok = matchWords(tw, hw);
        const score = tw.length ? ok.filter(Boolean).length / tw.length : 0;
        if (score > best.score || !best.heard) best = { score, ok, heard: h };
      }
    }
    return best;
  }
  // お手本の読み上げ（端末の英語の声）
  let enVoice = null;
  function pickVoice() {
    if (!window.speechSynthesis) return;
    const vs = speechSynthesis.getVoices();
    enVoice = vs.find((v) => /^en[-_]US/i.test(v.lang) && /Samantha|Ava|Allison|Google US/i.test(v.name)) || vs.find((v) => /^en[-_]US/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
  }
  if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function sayEn(text, slow) {
    return new Promise((res) => {
      if (!window.speechSynthesis) { res(); return; }
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; if (enVoice) u.voice = enVoice; u.rate = slow ? 0.6 : 0.9;
      const to = setTimeout(res, 9000);
      u.onend = u.onerror = () => { clearTimeout(to); res(); };
      speechSynthesis.speak(u);
    });
  }
  // 英語を1回聞き取る。もう一度ボタンを押す・黙る・9秒たつ のどれかで終わる
  let spkRec = null;
  function hearEnglish(onInterim) {
    return new Promise((res) => {
      let r;
      try { r = new SpeechRec(); } catch (e) { res({ alts: [], error: 'init' }); return; }
      r.lang = 'en-US'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 3;
      let alts = []; let done = false;
      const fin = (x) => { if (done) return; done = true; clearTimeout(cap); spkRec = null; try { r.abort(); } catch (e) { /* noop */ } res(x); };
      r.onresult = (e) => {
        const k = Math.max(...Array.from(e.results, (x) => x.length));
        alts = Array.from({ length: k }, (_, a) => Array.from(e.results, (x) => x[Math.min(a, x.length - 1)].transcript).join(' ').trim()).filter(Boolean);
        if (onInterim && alts[0]) onInterim(alts[0]);
        if (e.results[e.results.length - 1].isFinal) fin({ alts });
      };
      r.onerror = (e) => fin({ alts, error: e.error });
      r.onend = () => fin({ alts });
      const cap = setTimeout(() => { try { r.stop(); } catch (e) { fin({ alts }); } setTimeout(() => fin({ alts }), 1200); }, 9000);
      try { r.start(); spkRec = r; } catch (e) { fin({ alts: [], error: 'start' }); }
    });
  }
  // 録音して自分の声を聞き比べる（音声認識が使えない時）
  let selfRec = null;
  async function recordStart() {
    if (!navigator.mediaDevices || !window.MediaRecorder) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream); const chunks = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      selfRec = { mr, stream, chunks, done: new Promise((res) => { mr.onstop = () => { stream.getTracks().forEach((t) => t.stop()); res(chunks.length ? URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || 'audio/mp4' })) : null); }; }) };
      mr.start();
      return true;
    } catch (e) { return false; }
  }
  async function recordStop() { if (!selfRec) return null; const r = selfRec; selfRec = null; try { r.mr.stop(); } catch (e) { /* noop */ } return r.done; }

  function buildSpeak() {
    const wk = S.weak.speak;
    const sent = sampleItems(SPEAK_SENTENCES.map((w) => ({ en: w[0], ja: w[1] })), SPEAK_PLAN.filter((m) => m !== 'talk').length, 'speak', (x) => x.en);
    const talk = sampleItems(SPEAK_TALK.map((w) => ({ q: w[0], ja: w[1], tpl: w[2], ex: w[3] })), SPEAK_PLAN.filter((m) => m === 'talk').length, 'speak', (x) => x.q);
    let si = 0, ti = 0;
    return SPEAK_PLAN.map((mode) => (mode === 'talk' ? { mode, key: talk[ti].q, ...talk[ti++] } : { mode, key: sent[si].en, ...sent[si++] })).map((x) => ({ ...x, weak: !!wk[x.key] }));
  }
  const firstLetters = (en) => en.replace(/[A-Za-z']+/g, (w) => w[0] + '_'.repeat(Math.max(0, w.length - 1)));
  function startSpeak() {
    const items = buildSpeak();
    const st = { i: 0, ok: 0, pts: 0, miss: [], scores: [], tries: 0, best: 0, cleared: false, ended: false, busy: false, auto: speakAuto, t0: Date.now() };
    const el = document.createElement('div'); el.className = 'ov';
    el.style.background = 'radial-gradient(circle at 50% 30%, #0f3b4f, #05070d)';
    el.innerHTML = `<div class="quiz spk">
      <div class="qhead"><button class="qclose" data-s="quit">✕ やめる</button><div class="qprog"><i></i></div><div class="combo"></div></div>
      <div class="qbody">
        <div class="spk-mode"></div>
        <div class="spk-q"></div>
        <div class="spk-en"></div>
        <div class="spk-ja"></div>
        <div class="row spk-listen"><button class="btn ghost" data-s="play">🔊 お手本</button><button class="btn ghost" data-s="slow">🐢 ゆっくり</button></div>
        <button class="spk-mic" data-s="mic"><span class="mic-i">🎤</span><span class="mic-t">押して話す</span></button>
        <div class="spk-heard"></div>
        <div class="judge"></div>
        <div class="row spk-next hidden" style="width:100%"><button class="btn ghost" style="flex:1" data-s="retry">もう1回</button><button class="btn" style="flex:1" data-s="next">次へ ▶</button></div>
      </div></div>`;
    document.body.appendChild(el);
    const q$ = (x) => el.querySelector(x);
    const cur = () => items[st.i];
    const modeLabel = { repeat: '🔁 リピート ・ お手本のとおりに言おう', say: '🇯🇵→🇺🇸 英語で言ってみよう', talk: '💬 会話 ・ コーチの質問に答えよう' };
    const spoken = (it) => (it.mode === 'talk' ? it.q : it.en);
    function wordsHtml(it, ok) {
      return it.en.split(/\s+/).map((w, i) => `<span class="w ${ok ? (ok[i] ? 'ok' : 'ng') : ''}" data-w="${esc(w.replace(/[^A-Za-z']/g, ''))}">${esc(w)}</span>`).join(' ');
    }
    // 句読点つきの単語と、照らし合わせ用の単語の数がずれないように、表示の単語ごとに判定し直す
    function okPerShown(it, heardAlts) {
      const shown = it.en.split(/\s+/);
      const flat = []; const owner = [];
      shown.forEach((w, i) => spkWords(w).forEach((x) => { flat.push(x); owner.push(i); }));
      let bestOk = null, bestN = -1;
      for (const h of heardAlts) { const ok = matchWords(flat, spkWords(h)); const n = ok.filter(Boolean).length; if (n > bestN) { bestN = n; bestOk = ok; } }
      const res = shown.map(() => true);
      owner.forEach((o, k) => { if (!bestOk || !bestOk[k]) res[o] = false; });
      return res;
    }
    function show() {
      const it = cur();
      st.tries = 0; st.best = 0; st.cleared = false; st.busy = false;
      q$('.qprog i').style.width = (st.i / items.length) * 100 + '%';
      q$('.combo').textContent = `${st.i + 1}/${items.length}`;
      q$('.spk-mode').textContent = modeLabel[it.mode] + (it.weak ? ' ・ 🎯前回の苦手' : '');
      q$('.judge').textContent = ''; q$('.judge').className = 'judge';
      q$('.spk-heard').textContent = st.auto ? '' : '自分の声を録音して、お手本と聞き比べよう';
      q$('.spk-next').classList.add('hidden');
      q$('.spk-mic').classList.remove('hidden', 'rec');
      q$('.mic-t').textContent = st.auto ? '押して話す' : '押して録音';
      if (it.mode === 'talk') {
        q$('.spk-q').innerHTML = `${coachFace('happy')}<span><b>${esc(it.q)}</b><small>${esc(it.ja)}</small></span>`;
        q$('.spk-q').classList.remove('hidden');
        q$('.spk-en').innerHTML = `<span class="tpl">${esc(it.tpl).replace('___', '<i>＿＿＿</i>')}</span>`;
        q$('.spk-ja').textContent = '＿＿＿ に自分のことを入れて答えよう';
        q$('[data-s="play"]').textContent = '🔊 質問';
      } else {
        q$('.spk-q').classList.add('hidden');
        q$('.spk-en').innerHTML = it.mode === 'say' ? `<span class="hint">${esc(firstLetters(it.en))}</span>` : wordsHtml(it);
        q$('.spk-ja').textContent = it.ja;
        q$('[data-s="play"]').textContent = it.mode === 'say' ? '🔊 答えを聞く' : '🔊 お手本';
      }
      // リピートと会話は最初にお手本（質問）を読み上げる。「英語で言ってみよう」は自分で考えてから
      if (it.mode !== 'say' && S.sound) sayEn(spoken(it));
    }
    function judgeShow(g) {
      const it = cur();
      const pct = Math.round(g.score * 100);
      const pass = it.mode === 'talk' ? g.score >= 0.999 : g.score >= SPEAK_PASS;
      if (it.mode !== 'talk') q$('.spk-en').innerHTML = wordsHtml(it, okPerShown(it, g.alts));
      else q$('.spk-en').innerHTML = `<span class="tpl">${esc(it.tpl).replace('___', '<i>＿＿＿</i>')}</span><div class="ex">例：${esc(it.ex)}</div>`;
      q$('.spk-heard').textContent = g.heard ? `聞こえた：「${g.heard}」` : '';
      const j = q$('.judge');
      if (pass) { j.innerHTML = `${pct >= 95 ? 'PERFECT!' : 'NICE!'} <small>${pct}点</small>`; j.className = 'judge ok'; sfx.ok(); if (pct >= 95) confetti(40); }
      else {
        j.innerHTML = `おしい！ <small>${pct}点</small>`; j.className = 'judge ng'; sfx.ng();
        q$('.spk-heard').textContent += it.mode === 'talk' ? (g.extra ? '　→ 答えの型の単語を全部入れよう' : '　→ ＿＿＿ に自分のことも言おう') : '　→ 赤い単語をタップすると発音が聞けるよ';
      }
      return pass;
    }
    function settle(pass) {
      st.tries++;
      if (pass && !st.cleared) { st.cleared = true; st.ok++; st.pts += 1; }
      q$('.spk-next').classList.remove('hidden');
      q$('[data-s="retry"]').classList.toggle('hidden', st.cleared || st.tries >= 3);
      q$('.spk-mic').classList.add('hidden');
      if (st.cleared || st.tries >= 3) q$('[data-s="next"]').textContent = st.i + 1 < items.length ? '次へ ▶' : '結果を見る 🏁';
      else q$('[data-s="next"]').textContent = 'パス ▶';
    }
    async function onMic() {
      if (st.busy) {
        if (spkRec) { try { spkRec.stop(); } catch (e) { /* noop */ } } else if (selfRec) selfStop();
        return;
      }
      st.busy = true;
      if (window.speechSynthesis) speechSynthesis.cancel();
      const mic = q$('.spk-mic');
      if (!st.auto) {
        if (!(await recordStart())) { st.busy = false; selfJudge(null); return; }
        mic.classList.add('rec'); q$('.mic-t').textContent = '話したら押して止める';
        return;
      }
      mic.classList.add('rec'); q$('.mic-t').textContent = '聞いてるよ…（終わったら押す）';
      q$('.spk-heard').textContent = '';
      const r = await hearEnglish((txt) => { q$('.spk-heard').textContent = `🎧 ${txt}`; });
      mic.classList.remove('rec'); q$('.mic-t').textContent = '押して話す';
      st.busy = false;
      if (st.ended) return;
      if (r.error === 'not-allowed' || r.error === 'service-not-allowed' || r.error === 'init' || r.error === 'start' || r.error === 'audio-capture') {
        // この端末では聞き取りが使えない → 録音モードに切りかえ
        speakAuto = false; st.auto = false;
        q$('.mic-t').textContent = '押して録音';
        q$('.spk-heard').textContent = 'このスマホでは英語の聞き取りが使えなかったので、録音して聞き比べるモードにしたよ（マイクを許可すると聞き取りも使えることがあるよ）';
        return;
      }
      if (!r.alts.length) { q$('.spk-heard').textContent = r.error === 'network' ? '電波が弱くて聞き取れなかった… もう1回押してね' : '聞こえなかった… もう少し大きな声で、もう1回！'; return; }
      const g = { ...gradeSpeak(cur(), r.alts), alts: r.alts };
      settle(judgeShow(g));
    }
    async function selfStop() {
      const url = await recordStop();
      q$('.spk-mic').classList.remove('rec'); q$('.mic-t').textContent = '押して録音';
      st.busy = false;
      selfJudge(url);
    }
    function selfJudge(url) {
      const it = cur();
      if (it.mode === 'say') q$('.spk-en').innerHTML = wordsHtml(it);
      if (it.mode === 'talk') q$('.spk-en').innerHTML = `<span class="tpl">${esc(it.tpl).replace('___', '<i>＿＿＿</i>')}</span><div class="ex">例：${esc(it.ex)}</div>`;
      q$('.spk-heard').innerHTML = url ? `<button class="btn ghost" data-s="mine">▶ 自分の声</button> <button class="btn ghost" data-s="model">🔊 お手本</button><div style="margin-top:8px">お手本と聞き比べて、言えた？</div>` : '声に出して言えた？';
      if (url) { st.selfUrl = url; new Audio(url).play().catch(() => {}); }
      q$('.spk-mic').classList.add('hidden');
      q$('.spk-next').classList.remove('hidden');
      q$('[data-s="retry"]').classList.remove('hidden'); q$('[data-s="retry"]').textContent = 'もう1回';
      q$('[data-s="next"]').textContent = '言えた！ ✓';
      st.selfAsk = true;
    }
    function next() {
      const it = cur();
      if (st.selfAsk) { st.selfAsk = false; if (!st.cleared) { st.cleared = true; st.ok++; st.pts += 1; } sfx.ok(); }
      const wk = S.weak.speak;
      if (st.cleared) { if (wk[it.key]) { wk[it.key]--; if (wk[it.key] <= 0) delete wk[it.key]; } }
      else { wk[it.key] = (wk[it.key] || 0) + 1; st.miss.push(it); }
      save();
      st.i++;
      if (st.i < items.length) show(); else finish(false);
    }
    function finish(quit) {
      if (st.ended) return;
      st.ended = true;
      if (window.speechSynthesis) speechSynthesis.cancel();
      if (spkRec) try { spkRec.abort(); } catch (e) { /* noop */ }
      recordStop();
      const n = quit ? st.i : items.length;
      if (quit && n === 0) { el.remove(); return; }
      const d = day();
      const perfect = !quit && st.auto && st.ok === n && n >= SPEAK_LEN;
      let ticket = false;
      if (perfect) { st.pts += 2; if (d.perfect < 2) { d.perfect++; S.tickets++; ticket = true; } }
      S.best.speak = Math.max(S.best.speak || 0, st.ok);
      markPlayed('speak');
      const info = { kind: 'speak', n, ok: st.ok, miss: st.miss.map((x) => x.key), sec: Math.round((Date.now() - st.t0) / 1000), quit: quit || undefined, mode: st.auto ? 'auto' : 'self' };
      const r = st.pts > 0 ? addPoints(st.pts, 'quiz', 'スピーキング', '英語', info) : null;
      if (!r) { save(); logEvent('quiz', 'スピーキング', '英語', 0, info); }
      const tot = st.pts + (r && r.tipoff ? 1 : 0);
      if (perfect) { sfx.fanfare(); confetti(220); } else if (st.ok >= n * 0.6) { sfx.coin(); confetti(80); } else sfx.tap();
      el.querySelector('.quiz').innerHTML = `<div class="qbody result">
        <div style="font-family:var(--display);font-weight:800;font-size:18px">🎤 スピーキング</div>
        <div class="big">${st.ok}<span style="font-size:28px">/${n}</span></div>
        <div class="lvup-title" style="font-size:${perfect ? 40 : 30}px">${perfect ? 'PERFECT!!' : st.ok >= n * 0.6 ? 'GREAT!' : 'NICE TRY!'}</div>
        <div class="shot-pts" style="opacity:1">+${tot} PTS</div>
        ${ticket ? '<div class="newtag">全問クリア ボーナス 🎟️ +1</div>' : ''}
        ${st.miss.length ? `<ul>${st.miss.map((x) => `<li>${esc(x.mode === 'talk' ? x.ex : x.en)}</li>`).join('')}</ul><div class="note">↑ 次のスピーキングにもう一度出るよ。声に出して3回言ってみよう</div>` : ''}
        ${coachQuizLine(perfect, st.ok, n)}
        ${paperNudge()}
        <div class="row" style="width:100%;margin-top:14px"><button class="btn ghost" style="flex:1" data-s="again">もう1回</button><button class="btn" style="flex:1" data-s="close">とじる</button></div>
      </div>`;
      el.addEventListener('click', async (e) => {
        const a = e.target.closest('[data-s="again"],[data-s="close"],[data-tab]'); if (!a) return;
        el.remove();
        if (r) await afterEffects(r); else render();
        if (a.dataset.s === 'again') startSpeak();
      });
    }
    el.addEventListener('click', (e) => {
      if (st.ended) return;
      const w = e.target.closest('.w'); if (w && w.dataset.w) { sayEn(w.dataset.w, true); return; }
      const b = e.target.closest('[data-s]'); if (!b) return;
      const s = b.dataset.s; const it = cur();
      if (s === 'quit') { if (confirm('やめる？（ここまでのクリアは得点になるよ）')) finish(true); }
      else if (s === 'play' || s === 'model') sayEn(it.mode === 'talk' && s === 'play' ? it.q : it.mode === 'talk' ? it.ex : it.en);
      else if (s === 'slow') sayEn(it.mode === 'talk' ? it.q : it.en, true);
      else if (s === 'mine') { if (st.selfUrl) new Audio(st.selfUrl).play().catch(() => {}); }
      else if (s === 'mic') onMic();
      else if (s === 'retry') { st.selfAsk = false; q$('.spk-next').classList.add('hidden'); q$('.spk-mic').classList.remove('hidden'); if (!st.auto) q$('.spk-heard').textContent = ''; onMic(); }
      else if (s === 'next') next();
    });
    sfx.buzzer();
    show();
  }

  // ---------- おうちからのエール ----------
  async function checkCheers() {
    const j = await api({ action: 'cheers' });
    if (!j || !j.ok || !Array.isArray(j.cheers)) return;
    const fresh = j.cheers.filter((c) => !S.cheersSeen.includes(c.id));
    if (!fresh.length) return;
    for (const c of fresh) {
      S.cheersSeen.push(c.id);
      const tk = Math.max(0, Math.min(3, Number(c.tickets) || 0));
      S.tickets += tk;
      S.lastCheer = { text: c.text, date: todayStr() };
      S.cheerLog.push({ date: todayStr(), text: c.text });
      S.cheerLog = S.cheerLog.slice(-30);
      save();
      logEvent('cheer_read', c.text, '', 0, { id: c.id, tickets: tk });
      render();
      sfx.fanfare(); confetti(120);
      await overlay(`<div style="font-size:64px">📣</div><div class="lvup-name" style="margin:10px 0">おうちからエール！</div>
        <div class="cheer" style="max-width:340px;font-size:16px">${esc(c.text)}</div>
        ${tk ? `<div class="newtag">ガチャチケット +${tk} 🎟️</div>` : ''}`, { lockMs: 1200 });
    }
    S.cheersSeen = S.cheersSeen.slice(-200); save(); render();
  }

  // ---------- 声を送る ----------
  const weekKey = (ds) => addDays(ds, -((new Date(ds + 'T00:00:00Z').getUTCDay() + 6) % 7));
  let rec = null;
  function stopDictation() { if (rec) { try { rec.stop(); } catch (e) { /* noop */ } rec = null; } const b = $('#vmic'); if (b) { b.textContent = '🎤 話して入力'; b.classList.remove('rec'); } }
  function startDictation() {
    if (rec) { stopDictation(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const ta = $('#vtext');
    if (!SR) { toast('キーボードのマイク🎤ボタンで話してね', 3000); ta.focus(); return; }
    const r = new SR();
    r.lang = 'ja-JP'; r.interimResults = true; r.continuous = true;
    const base = ta.value ? ta.value + ' ' : '';
    r.onresult = (e) => { let txt = ''; for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript; ta.value = (base + txt).slice(0, 400); };
    r.onerror = () => { stopDictation(); toast('うまく聞き取れなかった… キーボードの🎤でもOK', 3000); };
    r.onend = () => stopDictation();
    try { r.start(); } catch (e) { toast('キーボードのマイク🎤ボタンで話してね', 3000); return; }
    rec = r;
    const b = $('#vmic'); b.textContent = '⏹ 止める'; b.classList.add('rec');
    sfx.tap();
  }
  async function sendVoice() {
    stopDictation();
    const text = ($('#vtext').value || '').trim();
    if (!text) { toast('話すか書いてから送ってね'); return; }
    const t = todayStr();
    const v = { id: rid(8), date: t, cat: voiceCat, q: voiceQ, text: text.slice(0, 400) };
    S.voices.push(v); S.voices = S.voices.slice(-50);
    const catLabel = (VOICE_CATS.find((c) => c.id === voiceCat) || {}).label || '';
    const detail = { vid: v.id, cat: catLabel, q: voiceQ };
    let r = null;
    let ticket = false;
    if (!S.voiceDays[t]) { S.voiceDays[t] = true; r = addPoints(2, 'voice', v.text, '', detail); }
    else { save(); logEvent('voice', v.text, '', 0, detail); }
    if (S.voiceWeek !== weekKey(t)) { S.voiceWeek = weekKey(t); S.tickets++; ticket = true; save(); }
    voiceQ = '';
    flush();
    render();
    sfx.coin(); confetti(90);
    await overlay(`<div style="font-size:72px">📨</div><div class="lvup-name" style="margin:10px 0">ナイスアシスト！</div>
      <div class="shot-sub" style="opacity:1">おうちの人に届けるね。${r ? '<br>+2P' : ''}${ticket ? '<br>今週はじめての声 🎟️ +1' : ''}</div>`, { lockMs: 900, autoClose: 2600 });
    if (r) await afterEffects(r);
  }

  // ---------- イベント ----------
  async function tryRestore() {
    const j = await api({ action: 'state' }, true);
    if (!j) { toast('通信できなかった…'); return; }
    if (!j.ok) { toast(j.error === 'device' ? 'まだリセットされていないみたい' : '失敗しちゃった'); return; }
    if (j.state && j.state.v && j.state.xp > S.xp && confirm('スプレッドシートのデータの方が進んでいるよ。そっちを使う？')) {
      const dev = S.device; S = migrate(j.state); S.device = dev; S.timer = null; delete S.summary;
    }
    S.syncError = null; S.everSynced = true; save(); flush(); checkCheers(); toast('つながったよ！'); render();
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { stopDictation(); tab = t.dataset.tab; sfx.tap(); render(); scrollTo(0, 0); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'mission') onMission(a.dataset.id);
    else if (act === 'check') onCheck(a.dataset.id);
    else if (act === 'quiz') { sfx.tap(); startQuiz(a.dataset.kind); }
    else if (act === 'speak') { sfx.tap(); startSpeak(); }
    else if (act === 'omakase') { sfx.tap(); playKind(a.dataset.kind); }
    else if (act === 'pull') onPull();
    else if (act === 'trade') onTrade();
    else if (act === 'coach') { coachIdx++; sfx.tap(); const b = $('.coach-box'); if (b) b.outerHTML = coachBox(); }
    else if (act === 'tstart') startTimer();
    else if (act === 'tstop') stopTimer();
    else if (act === 'tsave') {
      S.test.name = ($('#tname').value || '').trim() || 'テスト'; S.test.date = $('#tdate').value || ''; save();
      logEvent('test_set', S.test.name, '', 0, { date: S.test.date }); toast('保存したよ'); render();
    } else if (act === 'treset') {
      if (!confirm('チェックを全部外して、次のテストにする？（ポイントはそのまま）')) return;
      S.test = { name: '次のテスト', date: '', checks: {} }; save(); render();
    } else if (act === 'gsave') {
      const num = (v) => { const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) ? String(Math.min(100, n)) : ''; };
      ['国語', '数学', '英語', '理科', '社会'].forEach((s) => { S.goals[s] = { prev: num($('#gp-' + s).value), goal: num($('#gg-' + s).value) }; });
      save(); logEvent('goal_set', S.test.name, '', 0, { goals: S.goals }); sfx.coin(); toast('目標を保存したよ 🎯'); render();
    } else if (act === 'vcat') {
      voiceCat = a.dataset.id;
      document.querySelectorAll('[data-act="vcat"]').forEach((b) => b.classList.toggle('on', b === a));
    } else if (act === 'vanswer') {
      voiceQ = coachQuestion();
      const vq = $('#vq'); vq.classList.remove('hidden'); vq.firstChild.textContent = '📝 ' + voiceQ + ' ';
      $('#vtext').focus();
    } else if (act === 'vqclear') { voiceQ = ''; $('#vq').classList.add('hidden'); }
    else if (act === 'vmic') startDictation();
    else if (act === 'vsend') sendVoice();
    else if (act === 'restore') tryRestore();
    else if (act === 'howto') tutorial();
    else if (act === 'money') moneyRules();
    else if (act === 'nick') { S.nick = ($('#nick').value || '').trim().slice(0, 12); save(); toast('保存したよ'); render(); }
    else if (act === 'sound') { S.sound = !S.sound; save(); render(); sfx.tap(); }
    else if (act === 'mdel') {
      if (S.missions.length <= 1) { toast('ミッションは1つ以上残してね'); return; }
      if (!confirm('このミッションを削除する？')) return;
      S.missions = S.missions.filter((m) => m.id !== a.dataset.id); save(); render();
    } else if (act === 'madd') {
      const label = ($('#mlabel').value || '').trim(); if (!label) { toast('内容を入れてね'); return; }
      const icons = { 国語: '✍️', 数学: '📐', 英語: '🔤', 理科: '🧪', 社会: '🗾', 全教科: '📚' };
      const sub = $('#msub').value;
      S.missions.push({ id: 'c' + Date.now().toString(36), label: label.slice(0, 30), sub, pts: Number($('#mpts').value) || 2, icon: icons[sub] || '🏀' });
      save(); toast('追加したよ'); render();
    } else if (act === 'wipe') {
      if (!confirm('本当に全部リセットする？（元に戻せません）')) return;
      if (!confirm('ほんとうに？ ポイントもカードも消えるよ')) return;
      const keep = { nick: S.nick, device: S.device, seenUpdate: S.seenUpdate }; S = freshState(); Object.assign(S, keep); save(); logEvent('reset', 'リセット', '', 0, {}); render();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!S) return;
    if (document.visibilityState === 'visible') { sessionBegin(); if (tab !== 'voice') render(); flush(); checkCheers(); syncBank(); }
    else { sessionEnd(); flush(); }
  });
  addEventListener('pagehide', () => { if (S) { sessionEnd(); flush(); } });
  addEventListener('online', flush);



  // ---------- おこづかい（その月の記録から計算） ----------
  function allowanceFor(ym) { return calcAllowance(S, ym, todayStr(), ALLOWANCE); }
  const yen = (n) => n.toLocaleString('ja-JP') + '円';
  function weekBigs(t) {
    const idx = (new Date(t + 'T00:00:00Z').getUTCDay() + 6) % 7; let n = 0;
    for (let k = 0; k <= idx; k++) { const x = S.days[addDays(t, -k)]; if (x && (x.m || []).filter((id) => ALLOWANCE.stdMissions.includes(id)).length >= ALLOWANCE.bigWinMissions) n++; }
    return n;
  }
  // おこづかいの今の額・見込み（計算は前と同じ。ホームには1行だけ出し、くわしくはタップした先に出す）
  function allowanceInfo() {
    const t = todayStr(); const a = allowanceFor(t.slice(0, 7)); const A = ALLOWANCE;
    const d = S.days[t] || { m: [] };
    const std = (d.m || []).filter((id) => A.stdMissions.includes(id)).length;
    const wb = weekBigs(t);
    const hint = std >= A.bigWinMissions ? `🔥 今日は BIG WIN！ +${A.bigWin}円` : `BIG WIN まで 基本ミッション あと<b>${A.bigWinMissions - std}本</b>（+${A.bigWin}円）`;
    // 前に見た時より増えていたら「+◯円 UP!」を数秒出す
    const ym = t.slice(0, 7); const seen = S.moneySeen;
    if (!seen || seen.ym !== ym) S.moneySeen = { ym, total: a.total, diff: 0, at: 0 };
    else if (a.total > seen.total) S.moneySeen = { ym, total: a.total, diff: a.total - seen.total, at: Date.now() };
    else if (a.total < seen.total) S.moneySeen = { ...seen, total: a.total };
    const up = S.moneySeen.diff > 0 && Date.now() - S.moneySeen.at < 20000 ? S.moneySeen.diff : 0;
    // このペースが月末まで続いた場合の見込み（使い始めてから3日たってから表示）
    // 日割りで伸ばすのは毎日の要素（BIG WIN・上級全問正解）だけ。週間MVP・ランクUPは今ある分だけ足す。今より下には出さない
    const from = S.startDate > ym + '-01' ? S.startDate : ym + '-01';
    const p = ym.split('-').map(Number); const monthEnd = new Date(Date.UTC(p[0], p[1], 0)).toISOString().slice(0, 10);
    const passed = diffDays(from, t) + (played(t) ? 1 : 0); const span = diffDays(from, monthEnd) + 1;
    const perDay = (a.bigs * A.bigWin + a.perfect * A.perfect) / Math.max(1, passed);
    const proj = passed >= 3 ? Math.max(a.total, Math.min(A.max, a.base + Math.min(A.bonusMax, Math.floor(perDay * span / 10) * 10 + a.mvp * A.mvp + a.ranks * A.rankUp))) : null;
    return { t, a, A, wb, hint, up, proj };
  }
  function allowanceCard() {
    const { t, a, A, up, proj } = allowanceInfo();
    return `<button class="money mini" data-act="money">
      <span class="mo-l">💰 ${Number(t.slice(5, 7))}月</span><b class="mo-total">${yen(a.total)}</b>${up ? `<span class="mo-up">+${yen(up)} UP!</span>` : ''}
      <span class="mo-proj">${proj != null ? `見込み 約${yen(proj)}` : `MAX ${yen(A.max)}`}</span><span class="mo-a">›</span>
      <span class="mo-bar"><i style="width:${Math.min(100, (a.base / A.max) * 100)}%" class="b1"></i><i style="width:${Math.min(100, (a.bonus / A.max) * 100)}%" class="b2"></i></span></button>`;
  }
  function moneyRules() {
    const { t, a, A, wb, hint, proj } = allowanceInfo();
    return overlay(`<div class="tut"><div class="tut-e">💰</div><div class="tut-t">${Number(t.slice(5, 7))}月のおこづかい ${yen(a.total)}</div><div class="tut-b">
      ${proj != null ? `📈 このペースなら月末 約 <b>${yen(proj)}</b><br>` : ''}
      基本 <b>${yen(a.base)}</b>（${a.over ? `お休みしすぎ −${yen(a.over * A.missPenalty)}` : `お休み枠 あと${a.restLeft}日`}）<br>
      がんばりボーナス <b>+${yen(a.bonus)}</b>（BIG ${a.bigs}日・MVP ${a.mvp}週・上級全問 ${a.perfect}回・ランク ${a.ranks}）<br>
      ${hint}<br>今週の BIG WIN ${wb}/${A.mvpDays}日 ${wb >= A.mvpDays ? '→ 週間MVP達成！🏅' : `（${A.mvpDays}日で週間MVP +${yen(A.mvp)}）`}<br><br>
      <b>ルール</b><br>
      <b>基本 ${yen(A.base)}</b><br>1か月に <b>${A.restDays}日</b> までは、勉強しない日があっても大丈夫（大会・体調が悪い日用のお休み枠）。<br>それをこえて勉強しなかった日は、<b>1日 −${yen(A.missPenalty)}</b>。<br><br>
      <b>がんばりボーナス 最大 +${yen(A.bonusMax)}</b><br>🔥 BIG WIN（基本ミッションを1日${A.bigWinMissions}本以上）：+${yen(A.bigWin)}<br>🏅 週間MVP（月〜日でBIG WIN ${A.mvpDays}日以上）：+${yen(A.mvp)}<br>👑 チャレンジ（上級ゲーム）全問正解：+${yen(A.perfect)}（1日${A.perfectPerDay}回まで）<br>⭐ スタメン以上にランクアップ：+${yen(A.rankUp)}<br><br>
      ※ ゲームの点数や、自分で追加したミッションはおこづかいには数えないよ。紙での勉強が勝負！<br><br>
      合計は <b>最大 ${yen(A.max)}</b>。毎日BIG WIN＋毎日チャレンジ全問正解の、完ぺきな月だけ届く金額！<br>月末にしめて、次の月のはじめにもらえるよ。</div></div>`, { lockMs: 400 });
  }
  // ---------- ランク表・あそびかた ----------
  function pacePerDay() {
    const t = todayStr();
    const days = Object.keys(S.days).filter((d) => S.days[d].pts > 0).sort();
    if (!days.length) return 10;
    const span = Math.min(14, diffDays(days[0], t) + 1);
    let sum = 0;
    for (let i = 0; i < span; i++) { const d = S.days[addDays(t, -i)]; if (d) sum += Math.max(0, d.pts); }
    const p = sum / span;
    return span < 3 ? Math.max(p, 10) : Math.max(p, 1);
  }
  function viewRanks() {
    const i = rankIdx(S.xp); const r = RANKS[i]; const nx = RANKS[i + 1];
    const pct = nx ? Math.min(100, ((S.xp - r[0]) / (nx[0] - r[0])) * 100) : 100;
    const pace = pacePerDay();
    const left = nx ? nx[0] - S.xp : 0;
    const t = todayStr();
    let testLine = '';
    if (S.test.date && diffDays(t, S.test.date) > 0) {
      const dl = diffDays(t, S.test.date);
      const proj = rankIdx(S.xp + Math.round(pace * dl));
      testLine = `<div class="fc-line">🏆 ${esc(S.test.name)}（${Number(S.test.date.slice(5, 7))}/${Number(S.test.date.slice(8))}）のころには<br><b class="fc-big">${RANKS[proj][2]} ${esc(RANKS[proj][1])}</b> になれそう！</div>`;
    }
    return `
      <div class="sec-title"><h2>ランク表</h2><button class="btn ghost" data-tab="home">← もどる</button></div>
      <div class="rank-now">
        <div class="rn-e">${r[2]}</div>
        <div class="rn-l">いまのランク ・ Lv.${i + 1}/${RANKS.length}</div>
        <div class="rn-n">${esc(r[1])}</div>
        <div class="xpbar" style="height:14px"><i style="width:${pct}%"></i></div>
        <div class="rn-x">${nx ? `次の <b>${nx[2]} ${esc(nx[1])}</b> まで あと <b>${left} XP</b>（ミッションなら約${Math.ceil(left / 2)}本）` : '最高ランク！ レジェンド！'}</div>
      </div>
      <div class="forecast">
        <div class="fc-line">📈 今のペース：1日 約<b>${Math.round(pace)}</b>ポイント</div>
        ${nx ? `<div class="fc-line">→ 「${esc(nx[1])}」まで あと約 <b>${Math.max(1, Math.ceil(left / pace))}日</b></div>` : ''}
        ${testLine}
      </div>
      <div class="sec-title"><h2>全${RANKS.length}ランク</h2><span>ポイントがたまると上がる</span></div>
      <div class="ladder">${RANKS.map((x, j) => {
        const st = j < i ? 'done' : j === i ? 'now' : 'lock';
        const rw = REWARDS[x[1]];
        return `<div class="rung ${st}"><span class="re">${x[2]}</span><div class="rt"><div class="rnm">${esc(x[1])}${j === i ? ' <span class="here">◀ いまここ</span>' : ''}</div>
          <div class="rxp">${x[0]} XP${st === 'done' ? ' ・ 達成 ✓' : st === 'lock' ? ` ・ あと ${x[0] - S.xp}` : ''}</div>${rw ? `<div class="rrw">🎁 ${esc(rw)}</div>` : ''}</div></div>`;
      }).join('')}</div>
      <div class="sec-title"><h2>ポイントのもらい方</h2></div>
      <div class="howto">${HOWTO_POINTS.map((h) => `<div class="hrow"><span>${h[0]}</span><span class="hl">${esc(h[1])}</span><b>${esc(h[2])}</b></div>`).join('')}</div>
      <p class="note" style="margin-top:12px">最初の1か月は、どんどんランクが上がるよ。部活で疲れた日は「1本だけ」でOK。続けた人が一番強い！</p>`;
  }
  async function tutorial() {
    const slides = [
      { e: '🏀', t: '毎日1本、シュートを打とう', b: 'ミッションをタップするとシュートが決まる！<br>1日1本でも打てば <b>🔥連続記録</b> がのびるよ。<br>部活で疲れた日は「1本だけ」でOK。<br><br>「サボり虫（6点）」に勝つと <b>WIN</b> → ガチャチケット🎟️' },
      { e: '⭐', t: 'ポイントでランクアップ', b: `スタートは <b>🪑 ベンチ見習い</b>。<br>ポイントがたまると<br><span class="tl-ladder">🪑 → 6️⃣ → 🏀 スタメン → ⭐ エース → ©️ キャプテン → 🏅 → 🥉 → 🥈 → 🥇 → 🇯🇵 日本代表 → ✈️ → 🌎 → 👑 レジェンド</span><br>全${RANKS.length}ランク！ 最初の1か月はどんどん上がるよ。<br>上のランクのマークをタップすると<b>ランク表</b>が見られる。` },
      { e: '💰', t: 'おこづかいと連動！', b: `毎月のおこづかいは <b>基本${ALLOWANCE.base.toLocaleString()}円</b>。<br>勉強しない日が月${ALLOWANCE.restDays}日をこえると 1日 −${ALLOWANCE.missPenalty}円。<br><br>がんばるとボーナス！<br>🔥 BIG WIN（基本ミッション${ALLOWANCE.bigWinMissions}本）+${ALLOWANCE.bigWin}円<br>🏅 週間MVP（BIG WIN 週${ALLOWANCE.mvpDays}日）+${ALLOWANCE.mvp}円<br>👑 チャレンジ全問正解 +${ALLOWANCE.perfect}円 ／ ⭐ スタメン以上にランクUP +${ALLOWANCE.rankUp}円<br><br>合計 <b>最大${ALLOWANCE.max.toLocaleString()}円</b>。完ぺきな月だけ届く本気の金額！` },
      { e: '💬', t: '声とガチャ', b: 'わからないこと・苦手なところ・「アプリこうしてほしい」は <b>💬声</b> へ。マイクで話すだけで送れるよ。<br>おうちの人から返事やエールが届く📣<br><br>チケットで <b>🎰ガチャ</b>。バスケ技カード34種類を集めよう！' },
    ];
    for (let k = 0; k < slides.length; k++) {
      const s = slides[k];
      await new Promise((res) => {
        overlay(`<div class="tut"><div class="tut-step">${k + 1} / ${slides.length}</div><div class="tut-e">${s.e}</div><div class="tut-t">${s.t}</div><div class="tut-b">${s.b}</div>
          <button class="btn big" data-tut="next">${k + 1 < slides.length ? '次へ ▶' : 'はじめる！ 🏀'}</button></div>`, {
          closeOnTap: false,
          onMount: (el, close) => { el.querySelector('[data-tut]').addEventListener('click', () => { sfx.tap(); close(); res(); }); },
        });
      });
    }
    sfx.buzzer();
  }

  // アップデートのお知らせ（UPDATE_NOTE.id が変わった時に1回だけ出す）
  function whatsNew() {
    sfx.fanfare(); confetti(120);
    return overlay(`<div class="tut"><div class="tut-step">NEW!</div>${UPDATE_NOTE.img ? `<img class="wn-img" src="${esc(UPDATE_NOTE.img)}" alt="" onerror="this.remove()">` : '<div class="tut-e">🆕</div>'}<div class="tut-t">${esc(UPDATE_NOTE.title)}</div>
      <div class="tut-b">${UPDATE_NOTE.items.map((x) => `<div class="wn-i">${x}</div>`).join('')}</div></div>`, { lockMs: 900 });
  }

  // ---------- 起動 ----------
  async function onboarding() {
    $('#app').innerHTML = '';
    await new Promise((res) => {
      overlay(`<div style="font-size:90px">🏀</div><div class="lvup-title" style="font-size:42px">HOOP STUDY</div>
        <p class="note" style="text-align:center;margin:10px 0 18px">毎日1本、勉強のシュートを打とう。<br>連続日数・ランクアップ・ガチャで強くなる！</p>
        <input class="inp" id="obnick" placeholder="選手名（ニックネーム）" maxlength="12" style="width:260px;text-align:center">
        <button class="btn big" id="obgo" style="width:260px;margin-top:12px">TIP OFF! 🏀</button>`, {
        closeOnTap: false,
        onMount: (el, close) => {
          el.querySelector('#obgo').addEventListener('click', () => {
            S.nick = (el.querySelector('#obnick').value || '').trim().slice(0, 12); save();
            sfx.buzzer(); close(); res();
          });
        },
      });
    });
  }
  function needsInstall() {
    const ua = navigator.userAgent || '';
    const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    return ios && !standalone;
  }
  function installGuide() {
    $('#tabbar').innerHTML = '';
    $('#app').innerHTML = `<div class="install">
      <div style="font-size:84px">🏀</div>
      <div class="lvup-title" style="font-size:38px">HOOP STUDY</div>
      <p class="ins-lead">まずは <b>ホーム画面に追加</b> してね！<br>ホーム画面のアイコンから開いたときだけ、記録がおうちに届くよ。</p>
      <ol class="ins-steps">
        <li>画面の下（または上）にある <b>共有ボタン</b> <span class="ins-ic">⬆︎</span> をタップ</li>
        <li>メニューを下にスクロールして <b>「ホーム画面に追加」</b> をタップ</li>
        <li>右上の <b>「追加」</b> をタップ</li>
        <li>ホーム画面にできた <b>🏀 HOOP STUDY</b> のアイコンから開く</li>
      </ol>
      <p class="note" style="text-align:center">※ このSafariの画面では使わないでね（記録が別々になっちゃうよ）</p></div>`;
  }
  async function boot() {
    if (needsInstall()) { installGuide(); return; }
    if (!S) {
      $('#app').innerHTML = '<p class="note" style="text-align:center;margin-top:40vh">準備中…</p>';
      const fresh = freshState();
      S = fresh; // api() が端末IDを使うので先に用意（保存はまだしない）
      const j = await api({ action: 'state' });
      if (j && j.ok && j.state && j.state.v) { S = migrate(j.state); S.device = fresh.device; S.timer = null; delete S.summary; save(); toast('前のデータを復元したよ'); }
      else { S = fresh; S.seenUpdate = UPDATE_NOTE.id; save(); await onboarding(); await tutorial(); }
    }
    render();
    sessionBegin();
    if (S.seenUpdate !== UPDATE_NOTE.id) { S.seenUpdate = UPDATE_NOTE.id; save(); whatsNew(); }
    flush();
    checkCheers();
    syncBank();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  boot();
})();
