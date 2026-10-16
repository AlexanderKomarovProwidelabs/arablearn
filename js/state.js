/* Состояние ученика: прогресс, XP, серия, сердечки, интервальное повторение, достижения. */
(function (AL) {
  'use strict';
  const U = AL.util;
  const KEY = 'arablearn.v1';
  const MAX_HEARTS = 5;
  const HEART_REGEN_MS = 30 * 60 * 1000;
  // интервалы повторения по уровню прочности (в днях)
  const SRS_DAYS = [0.007, 1, 3, 7, 16, 35, 80];

  function defaults() {
    return {
      v: 1,
      migHeartsOff: true,
      created: Date.now(),
      xp: 0,
      daily: {},            // 'YYYY-MM-DD' -> xp
      streak: 0,
      bestStreak: 0,
      lastDay: null,
      freezes: 1,           // заморозка серии
      hearts: MAX_HEARTS,
      heartsTs: Date.now(),
      done: {},             // lessonId -> {n, best}
      items: {},            // srs: id -> {s, due, seen, wrong}
      ach: {},              // achId -> timestamp
      stats: { lessons: 0, perfect: 0, answers: 0, correct: 0, practice: 0 },
      reports: [],          // сообщения об ошибках в контенте
      settings: {
        translit: 'cyr',    // 'cyr' | 'lat'
        showTranslit: 'auto', // 'auto' | 'always' | 'never'
        hearts: false,
        tts: true,
        rate: 0.8,
        sfx: true,
        goal: 30,
        voice: null,
        theme: 'auto',
      },
    };
  }

  function merge(def, src) {
    if (!src || typeof src !== 'object') return def;
    for (const k in def) {
      if (src[k] === undefined) continue;
      if (def[k] && typeof def[k] === 'object' && !Array.isArray(def[k]) && Object.keys(def[k]).length && typeof src[k] === 'object')
        def[k] = merge(def[k], src[k]);
      else def[k] = src[k];
    }
    return def;
  }

  const st = AL.state = { s: defaults(), MAX_HEARTS };

  st.load = function () {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        st.s = merge(defaults(), saved);
        // миграция: сердечки выключены (ограничение снято)
        if (!saved.migHeartsOff) { st.s.settings.hearts = false; st.s.hearts = MAX_HEARTS; st.save(); }
      }
    } catch (e) { /* приватный режим и т.п. */ }
    st.regenHearts();
    st.checkStreak();
  };
  st.save = function () {
    try { localStorage.setItem(KEY, JSON.stringify(st.s)); } catch (e) { }
  };
  st.reset = function () { st.s = defaults(); st.save(); };
  st.exportJSON = () => JSON.stringify(st.s, null, 1);
  st.importJSON = function (txt) {
    const o = JSON.parse(txt);
    if (!o || typeof o !== 'object' || o.v !== 1) throw new Error('Неверный формат файла');
    st.s = merge(defaults(), o);
    st.save();
  };

  // ---------- сердечки ----------
  st.regenHearts = function () {
    const s = st.s;
    if (s.hearts >= MAX_HEARTS) { s.heartsTs = Date.now(); return; }
    const n = Math.floor((Date.now() - s.heartsTs) / HEART_REGEN_MS);
    if (n > 0) {
      s.hearts = Math.min(MAX_HEARTS, s.hearts + n);
      s.heartsTs += n * HEART_REGEN_MS;
      if (s.hearts >= MAX_HEARTS) s.heartsTs = Date.now();
    }
  };
  st.heartsOn = () => !!st.s.settings.hearts;
  st.loseHeart = function () {
    if (!st.heartsOn()) return;
    st.regenHearts();
    if (st.s.hearts >= MAX_HEARTS) st.s.heartsTs = Date.now();
    st.s.hearts = Math.max(0, st.s.hearts - 1);
    st.save();
  };
  st.addHeart = function (n) {
    st.s.hearts = Math.min(MAX_HEARTS, st.s.hearts + (n || 1));
    st.save();
  };
  st.nextHeartIn = function () {
    if (st.s.hearts >= MAX_HEARTS) return 0;
    return Math.max(0, HEART_REGEN_MS - (Date.now() - st.s.heartsTs));
  };

  // ---------- серия ----------
  st.checkStreak = function () {
    const s = st.s, t = U.today();
    if (!s.lastDay) return;
    const d = U.dayDiff(s.lastDay, t);
    if (d <= 1) return;
    // пропущен день (или больше)
    if (d === 2 && s.freezes > 0) {
      s.freezes--;
      // замораживаем: считаем, что вчера был активен
      const y = new Date(); y.setDate(y.getDate() - 1);
      s.lastDay = U.today(y);
      s.frozeOn = s.lastDay;
    } else {
      s.streak = 0;
    }
    st.save();
  };
  st.todayXP = () => st.s.daily[U.today()] || 0;
  st.addXP = function (n) {
    const s = st.s, t = U.today();
    s.xp += n;
    s.daily[t] = (s.daily[t] || 0) + n;
    let streakUp = false;
    if (s.lastDay !== t) {
      if (s.lastDay && U.dayDiff(s.lastDay, t) === 1) s.streak++;
      else s.streak = 1;
      s.lastDay = t;
      streakUp = true;
      // каждые 7 дней — бесплатная заморозка (макс 2)
      if (s.streak % 7 === 0 && s.freezes < 2) s.freezes++;
    }
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    st.save();
    return streakUp;
  };

  // ---------- уроки ----------
  st.isDone = id => !!st.s.done[id];
  st.markDone = function (id, acc) {
    const d = st.s.done[id] || { n: 0, best: 0 };
    d.n++; d.best = Math.max(d.best, acc || 0);
    st.s.done[id] = d;
    st.save();
  };

  // ---------- интервальное повторение ----------
  st.review = function (id, ok) {
    const it = st.s.items[id] || { s: 0, due: 0, seen: 0, wrong: 0 };
    it.seen++;
    if (ok) it.s = Math.min(SRS_DAYS.length - 1, it.s + 1);
    else { it.wrong++; it.s = Math.max(0, it.s - 2); }
    it.due = Date.now() + SRS_DAYS[it.s] * 86400000;
    st.s.items[id] = it;
  };
  st.dueItems = function () {
    const now = Date.now(), r = [];
    for (const id in st.s.items) {
      const it = st.s.items[id];
      if (it.due <= now) r.push(id);
    }
    // сначала самые слабые
    r.sort((a, b) => st.s.items[a].s - st.s.items[b].s || st.s.items[b].wrong - st.s.items[a].wrong);
    return r;
  };
  st.weakItems = function (n) {
    const ids = Object.keys(st.s.items);
    ids.sort((a, b) => {
      const A = st.s.items[a], B = st.s.items[b];
      return (A.s - B.s) || ((B.wrong / B.seen) - (A.wrong / A.seen));
    });
    return ids.slice(0, n);
  };

  // ---------- достижения ----------
  st.ACH = [
    { id: 'first', icon: '🌱', title: 'Первый шаг', desc: 'Пройти первый урок', test: s => s.stats.lessons >= 1 },
    { id: 'l10', icon: '📚', title: 'Усердие', desc: 'Пройти 10 уроков', test: s => s.stats.lessons >= 10 },
    { id: 'l50', icon: '🎓', title: 'Студент', desc: 'Пройти 50 уроков', test: s => s.stats.lessons >= 50 },
    { id: 'perfect', icon: '💎', title: 'Без ошибок', desc: 'Пройти урок без единой ошибки', test: s => s.stats.perfect >= 1 },
    { id: 'perfect10', icon: '👑', title: 'Перфекционист', desc: '10 уроков без ошибок', test: s => s.stats.perfect >= 10 },
    { id: 'streak3', icon: '🔥', title: 'Разгон', desc: 'Серия 3 дня', test: s => s.bestStreak >= 3 },
    { id: 'streak7', icon: '🔥', title: 'Неделя', desc: 'Серия 7 дней', test: s => s.bestStreak >= 7 },
    { id: 'streak30', icon: '🌙', title: 'Месяц', desc: 'Серия 30 дней', test: s => s.bestStreak >= 30 },
    { id: 'xp100', icon: '⭐', title: '100 XP', desc: 'Набрать 100 XP', test: s => s.xp >= 100 },
    { id: 'xp1000', icon: '🌟', title: '1000 XP', desc: 'Набрать 1000 XP', test: s => s.xp >= 1000 },
    { id: 'practice5', icon: '🔁', title: 'Повторение — мать учения', desc: '5 тренировок слабых мест', test: s => s.stats.practice >= 5 },
    { id: 'script', icon: '✍️', title: 'Алфавит освоен', desc: 'Завершить раздел «Письменность»', test: () => AL.course && AL.course.sectionDone && AL.course.sectionDone('script') },
    ...['a1', 'a2', 'b1', 'b2'].map((id, i) => ({ id, icon: ['🥉', '🥈', '🥇', '🏅'][i], title: 'Уровень ' + id.toUpperCase(), desc: 'Завершить раздел ' + id.toUpperCase(),
      test: () => { const sec = AL.course && AL.course.sections.find(s => s.id === id); return !!sec && sec.units.length > 0 && AL.course.sectionDone(id); } })),
  ];
  st.checkAch = function () {
    const got = [];
    for (const a of st.ACH) {
      if (!st.s.ach[a.id] && a.test(st.s)) { st.s.ach[a.id] = Date.now(); got.push(a); }
    }
    if (got.length) st.save();
    return got;
  };

  // Показывать ли транскрипцию для данного раздела.
  st.showTranslit = function (section) {
    section = section || st.curSection;
    const m = st.s.settings.showTranslit;
    if (m === 'always') return true;
    if (m === 'never') return false;
    return !section || section.translit !== false;
  };
  st.tr = s => AL.ar.translit(s, st.s.settings.translit);
})(window.AL);
