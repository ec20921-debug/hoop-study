// HOOP STUDY — 本体
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
      weak: { spell: {}, plural: {}, kanji: {}, qa: {} }, best: {},
      missions: DEFAULT_MISSIONS.map((m) => ({ ...m })),
      test: { name: '後期期末テスト', date: '', checks: {} },
      goals: {}, voices: [], voiceDays: {}, voiceWeek: '', cheerLog: [], startDate: todayStr(),
      milestones: {}, cheersSeen: [], lastCheer: null, lastSync: 0, syncError: null,
      device: rid(20), created: Date.now(), updated: Date.now(),
    };
  }
  function migrate(s) {
    const f = freshState();
    for (const k in f) if (s[k] === undefined) s[k] = f[k];
    for (const k of ['spell', 'plural', 'kanji', 'qa']) if (!s.weak[k]) s.weak[k] = {};
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

  // ---------- 記録の送信（Google スプレッドシート） ----------
  function loadQueue() { try { return JSON.parse(localStorage.getItem(Q_KEY) || '[]'); } catch (e) { return []; } }
  function saveQueue(q) { try { localStorage.setItem(Q_KEY, JSON.stringify(q.slice(-500))); } catch (e) { /* noop */ } }
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
    try {
      const res = await fetch(CFG.GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'log', key: CFG.APP_KEY, dev: S.device, events: batch, state: snapshot() }) });
      const j = await res.json();
      if (j.ok) {
        const rest = loadQueue().slice(batch.length);
        saveQueue(rest);
        S.lastSync = Date.now(); S.syncError = null; save();
        if (rest.length) setTimeout(flush, 300);
      } else if (j.error === 'device') { S.syncError = 'device'; save(); }
      updateSyncLabel();
    } catch (e) { /* オフライン時は次回まとめて送る */ }
    flushing = false;
  }
  async function api(params) {
    if (!CFG.GAS_URL) return null;
    const url = CFG.GAS_URL + '?' + new URLSearchParams({ key: CFG.APP_KEY, dev: S ? S.device : '', ...params });
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    try { const r = await fetch(url, { signal: ctl.signal }); return await r.json(); } catch (e) { return null; } finally { clearTimeout(t); }
  }
  async function apiPost(body) {
    if (!CFG.GAS_URL) return null;
    try { const r = await fetch(CFG.GAS_URL, { method: 'POST', body: JSON.stringify({ key: CFG.APP_KEY, dev: S.device, ...body }) }); return await r.json(); } catch (e) { return null; }
  }

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
    if (!d.win && d.pts > RIVAL.score && (d.m.length > 0 || d.ck > 0)) { d.win = true; S.tickets++; r.win = true; }
    const st = streak();
    const bonus = STREAK_BONUS[st];
    const mkey = st + '@' + addDays(todayStr(), -(st - 1));
    if (bonus && !S.milestones[mkey]) { S.milestones[mkey] = true; S.tickets += bonus; r.streakBonus = bonus; }
    const after = rankIdx(S.xp);
    if (after > before) { r.levelUp = true; r.newRank = after; d.ru = (d.ru || 0) + (after - before); }
    save();
    logEvent(type, item, subject, pts + (r.tipoff ? 1 : 0), { ...(detail || {}), win: r.win || undefined, levelUp: r.levelUp ? RANKS[after][1] : undefined });
    return r;
  }
  async function afterEffects(r) {
    render();
    if (r.win) await winOv();
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
    const msg = today ? `今日もナイス！ 明日も1本で ${st + 1}日連続` : st > 0 ? `今日1本打てば ${st + 1}日連続！` : '今日から連続記録スタート！';
    const cheer = S.lastCheer && diffDays(S.lastCheer.date, t) <= 3
      ? `<div class="cheer">📣 <b>おうちからのエール</b><br>${esc(S.lastCheer.text)}</div>` : '';
    const left = RIVAL.score + 1 - d.pts;
    return header() + `
      <div class="streak"><div class="flame ${today ? '' : 'cold'}">🔥</div>
        <div><div class="streak-num">${st}<small>日連続</small></div><div class="streak-msg">${msg}</div></div></div>
      ${cheer}
      <div class="board"><div><div class="lbl">YOU</div><div class="sc">${d.pts}</div></div>
        <div><div class="vs">VS</div><div class="clock">${t.slice(5).replace('-', '/')}</div></div>
        <div><div class="lbl">${esc(RIVAL.name)}</div><div class="sc away">${RIVAL.score}</div></div></div>
      <div class="winmsg ${d.win ? 'win' : ''}">${d.win ? '🏆 今日はWIN！ ナイスゲーム！' : left > 0 ? `あと ${left} 点で WIN → ガチャチケット！` : 'ミッションを1本決めたら WIN！'}</div>
      ${allowanceCard()}
      <div class="sec-title"><h2>今日のミッション</h2><span>タップでシュート</span></div>
      <div class="missions">${S.missions.map((m) => {
        const done = d.m.includes(m.id);
        return `<div class="mission ${done ? 'done' : ''}"><div class="ic">${m.icon || '🏀'}</div>
          <div class="tx"><div class="lb">${esc(m.label)}</div><div class="mt">${esc(m.sub)} ・ ${m.pts}P</div></div>
          <button class="shoot-btn" data-act="mission" data-id="${esc(m.id)}">${done ? '✓ IN' : 'SHOOT'}</button></div>`;
      }).join('')}</div>
      <div class="sync" id="sync"></div>`;
  }
  function qaSubjects() { return [...new Set(BANK.qa.map((x) => x.s))]; }
  function viewGame() {
    const weakN = Object.values(S.weak).reduce((a, o) => a + Object.keys(o).length, 0);
    const best = (k) => S.best[k] != null ? `<span class="best">ベスト ${S.best[k]}/${QUIZ_LEN}</span>` : '<span class="best">まだ挑戦してない</span>';
    const qaCards = qaSubjects().map((s, i) => `<button class="gamecard ${i % 2 ? 'gc-qa2' : 'gc-qa'}" data-act="quiz" data-kind="qa:${esc(s)}"><h3>${esc(s)} 一問一答</h3><p>4択で答えよう。<br>ワークで出た言葉も、おうちの人が追加できるよ。</p>${best('qa:' + s)}<span class="big">${s === '理科' ? '🧪' : s === '社会' ? '🗾' : '📚'}</span></button>`).join('');
    return header() + `
      <div class="sec-title"><h2>ミニゲーム</h2><span>1問24秒・連続正解で🔥</span></div>
      <div class="games">
        <button class="gamecard gc-weak" data-act="quiz" data-kind="weak"><h3>苦手つぶし</h3><p>まちがえた問題だけが出る。<br>正解すると苦手リストから消える！</p><span class="best">苦手 ${weakN} 問</span><span class="big">🎯</span></button>
        <button class="gamecard gc-spell" data-act="quiz" data-kind="spell"><h3>スペル・シュート</h3><p>日本語を見て英単語を書こう。<br>大文字にも注意！</p>${best('spell')}<span class="big">🔤</span></button>
        <button class="gamecard gc-plural" data-act="quiz" data-kind="plural"><h3>複数形チャレンジ</h3><p>box → boxes、child → children。<br>テストで落としやすいところ！</p>${best('plural')}<span class="big">📦</span></button>
        <button class="gamecard gc-kanji" data-act="quiz" data-kind="kanji"><h3>漢字よみ速攻</h3><p>4択で読みを当てよう。<br>覚えたら紙にも書いてね ✍️</p>${best('kanji')}<span class="big">漢</span></button>
        ${qaCards}
      </div>
      <p class="note" style="margin-top:14px">1問正解 1P。全問正解（10/10）で +2P ボーナス＆ガチャチケット（1日2枚まで）。<br>今日の WIN には、紙で勉強するミッションが1本以上必要だよ ✍️<br>「出してほしい問題」は 💬声 で教えてね。</p>`;
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
    return header() + `
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
      <div class="goals">${goalRows}<button class="btn" data-act="gsave" style="width:100%;margin-top:8px">目標を保存</button></div>
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
  function viewGacha() {
    const owned = Object.keys(S.cards).length;
    return header() + `
      <div class="gacha-machine"><div class="gacha-ball">🏀</div>
        <p>チケット1枚で1回。ダブったら +5XP！</p>
        <button class="btn big" data-act="pull" ${S.tickets > 0 ? '' : 'disabled style="opacity:.4"'}>🎟️ ガチャを回す（残り ${S.tickets}）</button>
        <div class="pity">あと ${Math.max(1, 10 - S.pity)} 回以内に SR 以上 確定！</div></div>
      <p class="note" style="margin:12px 2px">チケットのもらい方：今日のWIN ／ ミニゲーム全問正解 ／ 連続日数ボーナス（3・7・14・21・30日…）／ おうちからのエール</p>
      <div class="sec-title"><h2>コレクション</h2><span>${owned}/${CARDS.length}</span></div>
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
      ${S.missions.map((m) => `<div class="set-item"><span>${m.icon || '🏀'}</span><div class="grow">${esc(m.label)}<div class="note">${esc(m.sub)}・${m.pts}P</div></div><button class="del" data-act="mdel" data-id="${esc(m.id)}">削除</button></div>`).join('')}
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
    if (rankIdx(S.xp) > before) { const d = day(); d.ru = (d.ru || 0) + 1; }
    save();
    logEvent('gacha', card.name, '', 0, { card: card.id, rarity: rar, dup });
    return { card, dup, levelUp: rankIdx(S.xp) > before ? rankIdx(S.xp) : null };
  }
  const RCOL = { N: '#b8c0d6', R: '#2f7de1', SR: '#a855f7', SSR: '#ffc400', UR: 'linear-gradient(135deg,#ff3d7f,#ffd400,#2ee59d,#22d3ee,#a855f7)' };
  async function onPull() {
    const res = pullCard(); if (!res) return;
    const { card, dup } = res;
    render();
    sfx.drum();
    await overlay(`<div class="gacha-ball shake" style="font-size:120px">🏀</div><div class="shot-sub" style="opacity:1">ドキドキ…</div>`, { closeOnTap: false, autoClose: 1100 });
    const fl = document.createElement('div'); fl.className = 'flash'; fl.style.background = RCOL[card.r]; document.body.appendChild(fl); setTimeout(() => fl.remove(), 700);
    sfx.reveal(card.r); confetti(card.r === 'N' ? 30 : card.r === 'R' ? 70 : 180);
    await overlay(`<div class="reveal cc r-${card.r}" style="aspect-ratio:3/4"><div class="rr" style="color:${card.r === 'UR' ? '#ffd400' : RCOL[card.r]}">${card.r}</div><div class="e">${card.e}</div><div class="n">${esc(card.name)}</div><div class="d">${esc(card.d)}</div></div>
      <div class="newtag" style="margin-top:16px">${dup ? 'ダブり！ +5 XP' : 'NEW!! コレクションに追加'}</div>`, { lockMs: 900 });
    if (res.levelUp != null) await levelUpOv(res.levelUp);
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
  function buildQuestions(kind) {
    if (kind === 'spell') return sampleItems(BANK.spell, QUIZ_LEN, 'spell', (x) => x.a).map(mkSpell);
    if (kind === 'plural') return sampleItems(BANK.plural, QUIZ_LEN, 'plural', (x) => x.q).map(mkPlural);
    if (kind === 'kanji') return sampleItems(BANK.kanji, QUIZ_LEN, 'kanji', (x) => x.q).map(mkKanji);
    if (kind.startsWith('qa:')) { const s = kind.slice(3); return sampleItems(BANK.qa.filter((x) => x.s === s), QUIZ_LEN, 'qa', (x) => x.q).map(mkQa); }
    const qs = [];
    BANK.spell.filter((x) => S.weak.spell[x.a]).forEach((x) => qs.push(mkSpell(x)));
    BANK.plural.filter((x) => S.weak.plural[x.q]).forEach((x) => qs.push(mkPlural(x)));
    BANK.kanji.filter((x) => S.weak.kanji[x.q]).forEach((x) => qs.push(mkKanji(x)));
    BANK.qa.filter((x) => S.weak.qa[x.q]).forEach((x) => qs.push(mkQa(x)));
    return shuffle(qs).slice(0, QUIZ_LEN);
  }
  function quizName(kind) {
    return { spell: 'スペル・シュート', plural: '複数形チャレンジ', kanji: '漢字よみ速攻', weak: '苦手つぶし' }[kind] || (kind.startsWith('qa:') ? kind.slice(3) + ' 一問一答' : kind);
  }
  function quizSubject(kind) {
    return kind === 'kanji' ? '国語' : kind === 'weak' ? '全教科' : kind.startsWith('qa:') ? (SUBJECTS.includes(kind.slice(3)) ? kind.slice(3) : '全教科') : '英語';
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
    const st = { i: 0, answered: 0, ok: 0, combo: 0, maxCombo: 0, pts: 0, miss: [], timer: null, left: SHOT_CLOCK, locked: false, ended: false };
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
      st.left = SHOT_CLOCK;
      const ring = q$('.ring'); const num = q$('.shotclock b');
      const t0 = Date.now();
      st.timer = setInterval(() => {
        const left = Math.max(0, SHOT_CLOCK - (Date.now() - t0) / 1000);
        ring.style.strokeDashoffset = String(207.3 * (1 - left / SHOT_CLOCK));
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
        q$('.answer').textContent = `正解：${q.answer}`;
        res === 'time' ? sfx.buzzer() : sfx.ng();
        if (btn) btn.classList.add('ng');
        el.querySelectorAll('.choice').forEach((b) => { if (b.dataset.c === q.answer) b.classList.add('ok'); });
      }
      save();
      setCombo();
      setTimeout(() => { if (st.ended) return; st.i++; if (st.i < qs.length) show(); else finish(false); }, res === 'ok' ? 750 : 1700);
    }
    function finish(quit) {
      if (st.ended) return;
      st.ended = true;
      clearInterval(st.timer);
      const n = quit ? st.answered : qs.length;
      if (quit && n === 0) { el.remove(); return; }
      const d = day();
      const perfect = !quit && n >= QUIZ_LEN && st.ok === n;
      let ticket = false;
      if (perfect) { st.pts += 2; if (d.perfect < 2) { d.perfect++; S.tickets++; ticket = true; } }
      if (kind !== 'weak') S.best[kind] = Math.max(S.best[kind] || 0, st.ok);
      const subject = quizSubject(kind);
      const r = st.pts > 0 ? addPoints(st.pts, 'quiz', names[kind], subject, { kind, n, ok: st.ok, maxCombo: st.maxCombo, miss: st.miss.map((q) => q.key) }) : null;
      if (!r) { save(); logEvent('quiz', names[kind], subject, 0, { kind, n, ok: st.ok, miss: st.miss.map((q) => q.key) }); }
      const tot = st.pts + (r && r.tipoff ? 1 : 0);
      if (perfect) { sfx.fanfare(); confetti(220); } else if (st.ok >= n * 0.7) { sfx.coin(); confetti(80); } else sfx.tap();
      el.querySelector('.quiz').innerHTML = `<div class="qbody result">
        <div style="font-family:var(--display);font-weight:800;font-size:18px">${esc(names[kind])}</div>
        <div class="big">${st.ok}<span style="font-size:28px">/${n}</span></div>
        <div class="lvup-title" style="font-size:${perfect ? 40 : 30}px">${perfect ? 'PERFECT!!' : st.ok >= n * 0.7 ? 'GREAT!' : 'NICE TRY!'}</div>
        <div class="shot-pts" style="opacity:1">+${tot} PTS</div>
        ${st.maxCombo >= 3 ? `<div class="note">最大 ${st.maxCombo} 連続正解 🔥</div>` : ''}
        ${ticket ? '<div class="newtag">全問正解ボーナス 🎟️ +1</div>' : ''}
        ${st.miss.length ? `<ul>${st.miss.map((q) => `<li>${q.type === 'kanji' || q.type === 'qa' ? esc(q.key) + ' → ' + esc(q.answer) : esc(q.answer)}</li>`).join('')}</ul><div class="note">↑ 紙に3回書いて覚えよう ✍️（苦手つぶしにも出るよ）</div>` : ''}
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
      const c = e.target.closest('.choice'); if (c) { answer(c.dataset.c, c); return; }
      const qz = e.target.closest('[data-q="quit"]');
      if (qz) { if (confirm('やめる？（ここまでの正解は得点になるよ）')) finish(true); }
    });
    q$('.qform').addEventListener('submit', (e) => { e.preventDefault(); if (input.value.trim()) answer(input.value); });
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
    const j = await api({ action: 'state' });
    if (!j) { toast('通信できなかった…'); return; }
    if (!j.ok) { toast(j.error === 'device' ? 'まだリセットされていないみたい' : '失敗しちゃった'); return; }
    if (j.state && j.state.v && j.state.xp > S.xp && confirm('スプレッドシートのデータの方が進んでいるよ。そっちを使う？')) {
      const dev = S.device; S = migrate(j.state); S.device = dev; delete S.summary;
    }
    S.syncError = null; save(); flush(); toast('つながったよ！'); render();
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { stopDictation(); tab = t.dataset.tab; sfx.tap(); render(); scrollTo(0, 0); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'mission') onMission(a.dataset.id);
    else if (act === 'check') onCheck(a.dataset.id);
    else if (act === 'quiz') { sfx.tap(); startQuiz(a.dataset.kind); }
    else if (act === 'pull') onPull();
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
      const keep = { nick: S.nick, device: S.device }; S = freshState(); Object.assign(S, keep); save(); logEvent('reset', 'リセット', '', 0, {}); render();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S) { if (tab !== 'voice') render(); flush(); checkCheers(); syncBank(); }
  });
  addEventListener('online', flush);



  // ---------- おこづかい（その月の記録から計算） ----------
  function allowanceFor(ym) {
    const A = ALLOWANCE;
    const t = todayStr();
    const [y, m] = ym.split('-').map(Number);
    const monthStart = `${ym}-01`;
    const monthEnd = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    const from = S.startDate > monthStart ? S.startDate : monthStart;
    const lastDone = t > monthEnd ? monthEnd : addDays(t, -1); // 今日はまだ途中なので数えない
    let missed = 0, studied = 0, wins = 0, perfect = 0, ranks = 0;
    for (let d = monthStart; d <= monthEnd && d <= t; d = addDays(d, 1)) {
      const x = S.days[d];
      if (x && x.pts > 0) studied++;
      else if (d >= from && d <= lastDone) missed++;
      if (x) { if (x.win) wins++; perfect += Math.min(2, x.perfect || 0); ranks += x.ru || 0; }
    }
    const over = Math.max(0, missed - A.restDays);
    const base = Math.max(0, A.base - over * A.missPenalty);
    const bonusRaw = wins * A.win + perfect * A.perfect + ranks * A.rankUp;
    const bonus = Math.min(A.bonusMax, bonusRaw);
    return { ym, studied, missed, restLeft: Math.max(0, A.restDays - missed), over, base, wins, perfect, ranks, bonus, total: Math.min(A.max, base + bonus) };
  }
  const yen = (n) => n.toLocaleString('ja-JP') + '円';
  function allowanceCard() {
    const t = todayStr(); const a = allowanceFor(t.slice(0, 7));
    const d = S.days[t] || {};
    const hint = d.win ? '今日のWIN達成！ +' + ALLOWANCE.win + '円' : `今日WINすると <b>+${ALLOWANCE.win}円</b>！`;
    return `<button class="money" data-act="money">
      <div class="mo-top"><span>💰 ${Number(t.slice(5, 7))}月のおこづかい</span><span class="mo-rule">ルール ›</span></div>
      <div class="mo-total">${yen(a.total)}<small> / MAX ${yen(ALLOWANCE.max)}</small></div>
      <div class="mo-bar"><i style="width:${Math.min(100, (a.base / ALLOWANCE.max) * 100)}%" class="b1"></i><i style="width:${Math.min(100, (a.bonus / ALLOWANCE.max) * 100)}%" class="b2"></i></div>
      <div class="mo-row"><span>基本</span><b>${yen(a.base)}</b><span class="mo-sub">${a.over ? `お休みしすぎ −${yen(a.over * ALLOWANCE.missPenalty)}` : `お休み枠 あと${a.restLeft}日`}</span></div>
      <div class="mo-row"><span>がんばりボーナス</span><b class="plus">+${yen(a.bonus)}</b><span class="mo-sub">WIN ${a.wins}日・全問正解 ${a.perfect}回・ランクUP ${a.ranks}回</span></div>
      <div class="mo-hint">${hint}</div></button>`;
  }
  function moneyRules() {
    const A = ALLOWANCE;
    return overlay(`<div class="tut"><div class="tut-e">💰</div><div class="tut-t">おこづかいのルール</div><div class="tut-b">
      <b>基本 ${yen(A.base)}</b><br>1か月に <b>${A.restDays}日</b> までは、勉強しない日があっても大丈夫（大会・体調が悪い日用のお休み枠）。<br>それをこえて勉強しなかった日は、<b>1日 −${yen(A.missPenalty)}</b>。<br><br>
      <b>がんばりボーナス 最大 +${yen(A.bonusMax)}</b><br>🏆 WINした日：1日 +${yen(A.win)}<br>💯 ミニゲーム全問正解：1回 +${yen(A.perfect)}（1日2回まで）<br>⭐ ランクアップ：1回 +${yen(A.rankUp)}<br><br>
      合計は <b>最大 ${yen(A.max)}</b>。月末にしめて、次の月のはじめにもらえるよ。</div></div>`, { lockMs: 400 });
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
      { e: '💰', t: 'おこづかいと連動！', b: `毎月のおこづかいは <b>基本${ALLOWANCE.base.toLocaleString()}円</b>。<br>勉強しない日が月${ALLOWANCE.restDays}日をこえると 1日 −${ALLOWANCE.missPenalty}円。<br><br>がんばるとボーナス！<br>🏆 WINした日 +${ALLOWANCE.win}円 ／ 💯 全問正解 +${ALLOWANCE.perfect}円 ／ ⭐ ランクUP +${ALLOWANCE.rankUp}円<br><br>合計 <b>最大${ALLOWANCE.max.toLocaleString()}円</b>！ ホーム画面でいつでも確認できるよ。` },
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
  async function boot() {
    if (!S) {
      $('#app').innerHTML = '<p class="note" style="text-align:center;margin-top:40vh">準備中…</p>';
      const fresh = freshState();
      S = fresh; // api() が端末IDを使うので先に用意（保存はまだしない）
      const j = await api({ action: 'state' });
      if (j && j.ok && j.state && j.state.v) { S = migrate(j.state); S.device = fresh.device; delete S.summary; save(); toast('前のデータを復元したよ'); }
      else { S = fresh; save(); await onboarding(); await tutorial(); }
    }
    render();
    flush();
    checkCheers();
    syncBank();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  boot();
})();
