/* Экраны приложения: путь, тренировка, алфавит, профиль. */
(function (AL) {
  'use strict';
  const U = AL.util, el = U.el, ui = AL.ui, C = AL.course, ST = AL.state;
  const app = AL.app = { tab: 'path' };

  const KIND_ICON = { vocab: '📝', grammar: '🧩', sentences: '💬', reading: '📰', letters: '✏️', syllables: '🔤', forms: '🔀', words: '📖', sunmoon: '☀️', phrases: '💬', review: '🔁', test: '🏆' };
  const KIND_NAME = { vocab: 'Новые слова', grammar: 'Грамматика', sentences: 'Предложения', reading: 'Чтение', letters: 'Новые буквы', syllables: 'Слоги и огласовки', forms: 'Формы букв', words: 'Слова', sunmoon: 'Артикль', phrases: 'Фразы', review: 'Повторение', test: 'Испытание' };
  const UNIT_COLORS = ['#58cc02', '#ce82ff', '#00cd9c', '#1cb0f6', '#ff9600', '#ff4b4b', '#2b70c9', '#cc348d', '#8549ba', '#e5a400'];
  const OFFSETS = [0, 46, 70, 46, 0, -46, -70, -46];

  app.init = function () {
    ST.load();
    C.build();
    applyTheme();
    AL.tts.listeners.push(() => { if (app.tab === 'profile') app.render(); });
    app.root = U.$('#app');
    document.addEventListener('click', closePops);
    window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (TABS[t]) { app.tab = t; app.render(); } });
    const t = location.hash.slice(1); if (TABS[t]) app.tab = t;
    app.render();
    // обновление сердечек раз в минуту
    setInterval(() => { const h = ST.s.hearts; ST.regenHearts(); if (ST.s.hearts !== h) { ST.save(); app.renderTop(); } }, 60000);
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => { });
    }
  };

  function applyTheme() {
    const t = ST.s.settings.theme || 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.dataset.theme = t;
  }

  // ---------- каркас ----------
  const TABS = {
    path: { ico: '🏠', name: 'Путь', render: renderPath },
    practice: { ico: '🏋️', name: 'Тренировка', render: renderPractice },
    abc: { ico: 'أ', name: 'Алфавит', render: renderAbc },
    profile: { ico: '👤', name: 'Профиль', render: renderProfile },
  };

  app.render = function () {
    const r = app.root;
    r.innerHTML = '';
    app.top = el('div', { class: 'topbar' });
    r.appendChild(app.top);
    app.renderTop();
    const scr = el('div', { class: 'screen' });
    r.appendChild(scr);
    TABS[app.tab].render(scr);
    ui.hydrate(scr);
    const tabs = el('nav', { class: 'tabs' }, el('div', { class: 'inner' }, Object.keys(TABS).map(k =>
      el('button', { class: k === app.tab ? 'on' : '', onclick: () => { if (app.tab !== k) { location.hash = k; } else if (k === 'path') scrollToCurrent(true); } },
        el('span', { class: 'ico' + (k === 'abc' ? ' ar' : '') }, TABS[k].ico), TABS[k].name))));
    r.appendChild(tabs);
    if (app.tab === 'path') scrollToCurrent(false);
  };

  app.renderTop = function () {
    if (!app.top) return;
    const s = ST.s;
    const activeToday = s.lastDay === U.today();
    app.top.innerHTML = '';
    app.top.append(
      el('div', { class: 'flag', title: 'Арабский' }, 'عربي'),
      el('div', { class: 'stat streak' + (activeToday ? '' : ' off'), onclick: streakInfo }, '🔥 ' + s.streak),
      el('div', { class: 'stat gems', onclick: () => { location.hash = 'profile'; } }, '⚡ ' + s.xp),
      el('div', { class: 'stat hearts', onclick: heartsInfo }, ST.heartsOn() ? '❤️ ' + s.hearts : '❤️ ∞'));
  };

  function streakInfo() {
    const s = ST.s, today = ST.todayXP();
    ui.modal(close => [
      el('div', { class: 'center', style: { fontSize: '64px' } }, '🔥'),
      el('h3', { class: 'center' }, 'Серия: ' + s.streak + ' ' + U.plural(s.streak, 'день', 'дня', 'дней')),
      el('p', { class: 'center muted' }, s.lastDay === U.today() ? 'Сегодня вы уже занимались — отлично!' : 'Пройдите урок сегодня, чтобы не потерять серию.'),
      el('p', {}, '🎯 Цель на день: ' + today + ' / ' + s.settings.goal + ' XP'),
      el('div', { class: 'goalbar' }, el('div', { style: { width: Math.min(100, 100 * today / s.settings.goal) + '%' } })),
      el('p', { class: 'muted' }, '🧊 Заморозок серии: ' + s.freezes + '. Заморозка автоматически спасёт серию, если вы пропустите один день. Каждые 7 дней серии — новая заморозка (до 2).'),
      el('p', { class: 'muted' }, 'Рекорд: ' + s.bestStreak),
      el('div', { class: 'actions' }, el('button', { class: 'btn block', onclick: close }, 'Понятно'))]);
  }
  function heartsInfo() {
    ST.regenHearts();
    const s = ST.s, mins = Math.ceil(ST.nextHeartIn() / 60000);
    ui.modal(close => [
      el('div', { class: 'center', style: { fontSize: '48px' } }, '❤️'.repeat(Math.max(1, ST.heartsOn() ? s.hearts : 5))),
      el('h3', { class: 'center' }, ST.heartsOn() ? 'Сердечки: ' + s.hearts + ' из ' + ST.MAX_HEARTS : 'Сердечки отключены'),
      el('p', { class: 'muted' }, ST.heartsOn()
        ? 'Каждая ошибка в уроке стоит одно сердечко. Новое появляется каждые 30 минут' + (s.hearts < ST.MAX_HEARTS ? ' (следующее через ' + mins + ' мин)' : '') + '. Тренировка слабых мест бесплатна и восстанавливает одно сердечко.'
        : 'Ошибки ничего не стоят. Включить сердечки можно в профиле.'),
      el('div', { class: 'actions' },
        ST.heartsOn() && s.hearts < ST.MAX_HEARTS ? el('button', { class: 'btn blue block', onclick: () => { close(); app.startPractice('weak'); } }, 'Тренировка (+1 ❤️)') : null,
        el('button', { class: 'btn ghost block', onclick: close }, 'Закрыть'))]);
  }

  // ---------- путь ----------
  function renderPath(scr) {
    const cur = C.current();
    for (const sec of C.sections) {
      if (!sec.units.length) continue;
      scr.appendChild(el('div', { class: 'section-head' },
        el('div', {}, el('div', { class: 'lvl' }, 'Уровень ' + sec.level), el('h2', {}, sec.title)),
        el('div', { class: 'muted', style: { fontSize: '14px', textAlign: 'right' } }, sec.subtitle)));
      const started = sec.units.some(u => u.lessons.some(l => ST.isDone(l.id)));
      if (!C.sectionDone(sec.id) && sec.units.length > 1) {
        scr.appendChild(el('div', { class: 'placement' },
          el('p', {}, sec.kind === 'level' ? 'Уже владеете уровнем ' + sec.level + '? Тест на 20 вопросов откроет весь раздел.' : started ? 'Уже знаете весь алфавит? Пройдите тест и перейдите сразу к следующему разделу.' : 'Учили арабский раньше? Проверьте себя: тест на 20 вопросов откроет весь раздел.'),
          el('button', { class: 'btn ghost', onclick: () => startPlacement(sec) }, 'Тест')));
      }
      sec.units.forEach((u, ui_) => {
        const color = UNIT_COLORS[ui_ % UNIT_COLORS.length];
        const unlocked = C.isUnlocked(u.lessons[0]);
        scr.appendChild(el('div', { class: 'unit-banner' + (unlocked ? '' : ' locked'), style: { background: color } },
          el('div', {}, el('div', { class: 't' }, 'Юнит ' + (ui_ + 1)), el('div', { class: 'h' }, u.title),
            el('div', { class: 'd', html: U.esc(u.desc).replace(/([؀-ۿ][؀-ۿ\s]*[؀-ۿ]|[؀-ۿ])/g, '<span class="ar">$1</span>') })),
          el('button', { class: 'tipbtn', title: 'Справка юнита', onclick: () => unitTips(u) }, '📖')));
        const nodes = el('div', { class: 'nodes' });
        u.lessons.forEach((les, li) => {
          const done = ST.isDone(les.id), open = C.isUnlocked(les), isCur = les === cur;
          const wrap = el('div', { class: 'node-wrap' + (isCur ? ' cur' : ''), style: { transform: `translateX(${OFFSETS[li % OFFSETS.length]}px)` }, 'data-id': les.id });
          const node = el('button', {
            class: 'node' + (les.kind === 'test' ? ' test' : '') + (done ? ' done' : '') + (!open ? ' locked' : '') + (isCur ? ' current' : ''),
            style: open && !done ? { background: color, boxShadow: '0 7px 0 rgba(0,0,0,.2)' } : null,
            onclick: e => { e.stopPropagation(); togglePop(wrap, les, open, done, color); }
          }, !open ? (les.kind === 'test' ? '🏆' : '🔒') : done && les.kind !== 'test' ? '✓' : KIND_ICON[les.kind]);
          wrap.appendChild(node);
          if (isCur) wrap.appendChild(el('div', { class: 'start-bubble' }, ST.isDone(C.lessons[0].id) ? 'Дальше' : 'Начать'));
          nodes.appendChild(wrap);
        });
        scr.appendChild(nodes);
      });
    }
    const missing = ['A1', 'A2', 'B1', 'B2'].filter(l => !C.sections.some(s => s.level === l && s.units.length));
    if (missing.length) scr.appendChild(el('div', { class: 'card center', style: { marginTop: '30px' } },
      el('div', { style: { fontSize: '40px' } }, '🚧'),
      el('b', {}, 'Скоро: ' + missing.join(' → ')),
      el('p', { class: 'muted' }, 'Эти разделы курса ещё готовятся.')));
  }
  function closePops(e) {
    if (e && e.target.closest('.popover')) return;
    document.querySelectorAll('.popover').forEach(p => { p.parentNode.classList.remove('open'); p.remove(); });
  }
  function togglePop(wrap, les, open, done, color) {
    const had = wrap.querySelector('.popover');
    closePops();
    if (had) return;
    const u = les.unit, n = u.lessons.length;
    const isTest = les.kind === 'test';
    let body;
    if (open) {
      body = [el('h4', {}, les.title || KIND_NAME[les.kind]),
        el('p', {}, isTest ? 'Испытание юнита · 15 заданий' : 'Урок ' + (les.index + 1) + ' из ' + (n - 1) + ' · ' + KIND_NAME[les.kind]),
        el('button', { class: 'btn white', style: { color }, onclick: () => { closePops(); startLesson(les); } },
          done ? 'Повторить +5 XP' : 'Начать +' + (isTest ? 20 : 10) + ' XP')];
    } else if (isTest) {
      body = [el('h4', {}, 'Перепрыгнуть сюда?'),
        el('p', {}, 'Пройдите испытание, чтобы открыть всё до этого места включительно.'),
        el('button', { class: 'btn', onclick: () => { closePops(); startLesson(les, true); } }, 'Испытание')];
    } else {
      body = [el('h4', {}, les.title || KIND_NAME[les.kind]), el('p', {}, 'Сначала пройдите предыдущие уроки — или испытание в конце юнита, чтобы перепрыгнуть.')];
    }
    const pop = el('div', { class: 'popover' + (open ? '' : ' locked'), style: open ? { background: color, borderBottomColor: color } : null }, body);
    wrap.appendChild(pop);
    wrap.classList.add('open');
    const r = pop.getBoundingClientRect();
    if (r.bottom > innerHeight - 70) pop.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function scrollToCurrent(smooth) {
    const cur = C.current(); if (!cur) return;
    requestAnimationFrame(() => {
      const n = document.querySelector(`[data-id="${cur.id}"]`);
      if (n) n.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
    });
  }

  function startLesson(les, jump) {
    const done = ST.isDone(les.id);
    let ex;
    try { ex = C.generate(les); } catch (e) { console.error(e); ui.toast('Ошибка генерации урока: ' + e.message); return; }
    ex.forEach(x => { if (x.type === 'letter') x.section = les.section; });
    AL.lesson.start({
      exercises: ex, kind: les.kind === 'test' ? 'test' : 'lesson', section: les.section,
      xpBase: done ? 5 : (les.kind === 'test' ? 20 : 10),
      lessonId: les.id,
      onFinish: res => {
        if (jump) C.completeUpTo(les.unit);
        ST.markDone(les.id, res.acc);
      }
    });
  }
  function startPlacement(sec) {
    ui.modal(close => [
      el('h3', {}, 'Тест по разделу «' + sec.title + '»'),
      el('p', {}, '20 вопросов по всем буквам, формам и словам раздела. Если пройдёте, не потеряв все сердечки, весь раздел отметится пройденным.'),
      el('p', { class: 'muted' }, 'Не получилось — не страшно: значит, повторить буквы будет полезно. Уроки, где вы уверены, проходятся за 2–3 минуты.'),
      el('div', { class: 'actions' },
        el('button', { class: 'btn block', onclick: () => {
          close();
          const p = C.placement(sec);
          AL.lesson.start({ exercises: p.ex, kind: 'test', xpBase: 30, section: sec, onFinish: () => { C.completeUpTo(p.last.unit); } });
        } }, 'Начать тест'),
        el('button', { class: 'btn ghost block', onclick: close }, 'Отмена'))]);
  }
  function unitTips(u) {
    const sec = u.section;
    const notes = U.uniq(u.lessons.flatMap(l => l.notes || []));
    ui.modal(close => {
      const out = [el('h3', {}, '📖 ' + u.title)];
      if (u.letters.length) {
        out.push(el('p', { class: 'muted' }, 'Буквы юнита — нажмите, чтобы открыть карточку:'));
        out.push(el('div', { class: 'abc' }, u.letters.map(ch => {
          const l = sec.letterMap[ch];
          return el('button', { onclick: () => { close(); letterModal(sec, l); } }, el('span', { class: 'ar' }, ch), el('small', {}, l.name));
        })));
      }
      for (const n of notes) {
        const note = sec.notes[n];
        out.push(el('div', { class: 'card note', style: { marginTop: '14px' } }, el('h3', {}, note.title), el('div', { html: ui.expand(note.html) })));
      }
      if (!notes.length && !u.letters.length) out.push(el('p', { class: 'muted' }, 'В этом юните новых правил нет — только практика.'));
      const words = u.focusWords || [];
      if (words.length) {
        out.push(el('h3', { class: 'sub' }, 'Слова юнита'));
        out.push(el('div', { html: ui.expand(words.map(w => '{{' + w.ar + '|' + w.ru + '}}').join('<br>')) }));
      }
      if (u.lessons.some(l => l.kind === 'phrases')) {
        out.push(el('h3', { class: 'sub' }, 'Фразы'));
        out.push(el('div', { html: ui.expand(sec.phrases.map(w => '{{' + w.ar + '|' + w.ru + '}}').join('<br>')) }));
      }
      out.push(el('div', { class: 'actions' }, el('button', { class: 'btn block', onclick: close }, 'Закрыть')));
      return out;
    });
  }
  function letterModal(sec, l) {
    ui.modal(close => [ui.letterCard(sec, l), el('div', { class: 'actions' }, el('button', { class: 'btn block', onclick: close }, 'Закрыть'))]);
    AL.tts.speak(l.ar);
  }

  // ---------- тренировка ----------
  app.startPractice = function (mode) {
    const ex = C.practice(mode);
    if (!ex || !ex.length) {
      ui.toast(mode === 'listen' && !AL.tts.available() ? 'Нет арабского голоса для озвучки' : 'Сначала пройдите несколько уроков');
      return;
    }
    AL.lesson.start({ exercises: ex, kind: 'practice', xpBase: 5 });
  };
  function renderPractice(scr) {
    const due = ST.dueItems().length;
    const learned = C.learned();
    const has = learned.letters.size > 0;
    const card = (ico, title, desc, mode, ok) => el('button', {
      class: 'pcard' + (ok ? '' : ' disabled'),
      onclick: () => ok ? app.startPractice(mode) : ui.toast('Пока недоступно — пройдите ещё уроков')
    }, el('div', { class: 'ico' }, ico), el('div', {}, el('b', {}, title), el('span', {}, desc)));
    scr.append(
      el('h1', { class: 'title' }, 'Тренировка'),
      el('p', { class: 'muted' }, 'Тренировки не тратят сердечки, восстанавливают одно ❤️ и дают +5 XP. Система сама подбирает то, что вы начинаете забывать.'),
      el('div', { class: 'plist' },
        card('🧠', 'Слабые места', due ? due + ' ' + U.plural(due, 'элемент ждёт', 'элемента ждут', 'элементов ждут') + ' повторения' : 'Всё повторено — можно закрепить самые трудные', 'weak', has),
        card('🔀', 'Формы букв', 'Узнавайте буквы в начале, середине и конце слова', 'forms', has),
        card('👂', 'Аудирование', AL.tts.available() ? 'Слушайте и выбирайте слово' : 'Нужен арабский голос в системе (см. Профиль)', 'listen', has && AL.tts.available()),
        card('📖', 'Слова', learned.words.length + ' ' + U.plural(learned.words.length, 'слово', 'слова', 'слов') + ' изучено', 'words', learned.words.length >= 4)));
    // самые трудные
    const weak = ST.weakItems(8).filter(id => ST.s.items[id].wrong > 0);
    if (weak.length) {
      scr.appendChild(el('h3', { class: 'sub' }, 'Чаще всего ошибки в:'));
      scr.appendChild(el('div', { html: ui.expand(weak.map(id => {
        const ar = id.slice(2);
        const w = learned.sec.words.concat(learned.sec.phrases).find(x => x.ar === ar);
        const l = learned.sec.letterMap[ar];
        return '{{' + ar + '|' + (w ? w.ru : l ? 'буква ' + l.name : '') + '}}';
      }).join(' ')) }));
    }
  }

  // ---------- алфавит ----------
  function renderAbc(scr) {
    const sec = C.sections[0];
    const learned = C.learned().letters;
    scr.append(el('h1', { class: 'title' }, 'Алфавит'),
      el('p', { class: 'muted' }, 'Нажмите на букву, чтобы увидеть её формы и услышать название. Полоска показывает, насколько прочно вы её помните.'));
    scr.appendChild(el('div', { class: 'abc' }, sec.letters.map(l => {
      const it = ST.s.items['L:' + l.ch];
      const pct = it ? Math.round(100 * it.s / 6) : 0;
      return el('button', { class: learned.has(l.ch) ? '' : 'unknown', onclick: () => letterModal(sec, l) },
        el('span', { class: 'ar' }, l.ch), el('small', {}, l.name), el('div', { class: 'bar' }, el('div', { style: { width: pct + '%' } })));
    })));
    scr.appendChild(el('h3', { class: 'sub' }, 'Значки огласовки'));
    const signs = [['بَ', 'фатха', 'а'], ['بِ', 'касра', 'и'], ['بُ', 'дамма', 'у'], ['بْ', 'сукун', 'нет гласной'],
      ['بّ', 'шадда', 'удвоение'], ['بً', 'танвин фатха', '-ан'], ['بٌ', 'танвин дамма', '-ун'], ['بٍ', 'танвин касра', '-ин']];
    scr.appendChild(el('div', { class: 'abc' }, signs.map(([a, n, d]) =>
      el('button', { onclick: () => AL.tts.speak(a) }, el('span', { class: 'ar' }, a), el('small', {}, n), el('small', {}, d)))));
    scr.appendChild(el('h3', { class: 'sub' }, 'Особые буквы'));
    const extra = [['ة', 'та марбута', '-а / -ат'], ['ى', 'алиф максура', 'ā'], ['ء', 'хамза', 'ʾ'], ['أ', 'хамза на алифе', 'ʾа / ʾу'],
      ['إ', 'хамза под алифом', 'ʾи'], ['ؤ', 'хамза на вав', 'ʾ'], ['ئ', 'хамза на йа', 'ʾ'], ['آ', 'мадда', 'ʾā'], ['لا', 'лям-алиф', 'лā']];
    scr.appendChild(el('div', { class: 'abc' }, extra.map(([a, n, d]) =>
      el('button', {}, el('span', { class: 'ar' }, a), el('small', {}, n), el('small', {}, d)))));
  }

  // ---------- профиль ----------
  function renderProfile(scr) {
    const s = ST.s;
    const acc = s.stats.answers ? Math.round(100 * s.stats.correct / s.stats.answers) : 0;
    const done = C.lessons.filter(l => ST.isDone(l.id)).length;
    scr.append(el('h1', { class: 'title' }, 'Профиль'),
      el('div', { class: 'grid2' },
        statbox('🔥', s.streak, U.plural(s.streak, 'день', 'дня', 'дней') + ' подряд (рекорд ' + s.bestStreak + ')'),
        statbox('⚡', s.xp, 'всего XP'),
        statbox('📘', done + ' / ' + C.lessons.length, 'уроков пройдено'),
        statbox('🎯', acc + '%', 'точность ответов')));

    // неделя
    const today = ST.todayXP();
    scr.appendChild(el('h3', { class: 'sub' }, 'Цель на сегодня: ' + today + ' / ' + s.settings.goal + ' XP'));
    scr.appendChild(el('div', { class: 'goalbar' }, el('div', { style: { width: Math.min(100, 100 * today / s.settings.goal) + '%' } })));
    const days = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d); }
    const max = Math.max(s.settings.goal, ...days.map(d => s.daily[U.today(d)] || 0));
    const DN = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
    scr.appendChild(el('h3', { class: 'sub' }, 'Последние 7 дней'));
    scr.appendChild(el('div', { class: 'week' }, days.map((d, i) => {
      const v = s.daily[U.today(d)] || 0;
      return el('div', { class: 'd' + (i === 6 ? ' today' : '') }, el('span', {}, v || ''), el('div', { class: 'b', style: { height: Math.round(80 * v / max) + '%' } }), DN[d.getDay()]);
    })));

    // достижения
    scr.appendChild(el('h3', { class: 'sub' }, 'Достижения'));
    for (const a of ST.ACH) {
      scr.appendChild(el('div', { class: 'ach' + (s.ach[a.id] ? '' : ' locked') }, el('div', { class: 'i' }, a.icon), el('div', {}, el('b', {}, a.title), el('span', {}, a.desc))));
    }

    // настройки
    scr.appendChild(el('h3', { class: 'sub' }, 'Настройки'));
    const set = el('div', { class: 'settings' });
    const save = (k, v) => { s.settings[k] = v; ST.save(); };
    const sel = (label, hint, key, opts, after) => el('div', { class: 'row' },
      el('label', {}, label, hint ? el('small', {}, hint) : null),
      el('select', { onchange: e => { const v = e.target.value; save(key, isNaN(+v) || v === '' ? v : +v); after && after(); } },
        opts.map(([v, t]) => el('option', { value: v, selected: String(s.settings[key]) === String(v) }, t))));
    const sw = (label, hint, key, after) => el('div', { class: 'row' },
      el('label', {}, label, hint ? el('small', {}, hint) : null),
      el('label', { class: 'switch' }, el('input', { type: 'checkbox', checked: !!s.settings[key], onchange: e => { save(key, e.target.checked); after && after(); } }), el('span')));
    set.append(
      sel('Транскрипция', 'Как записывать звучание: ' + AL.ar.translit('كِتَاب', s.settings.translit), 'translit', [['cyr', 'Кириллица (кита̄б)'], ['lat', 'Латиница (kitāb)']], () => app.render()),
      sel('Подсказки-транскрипция', 'Авто: показываются до уровня A2', 'showTranslit', [['auto', 'Авто'], ['always', 'Всегда'], ['never', 'Никогда']]),
      sel('Цель на день', null, 'goal', [[10, '10 XP — легко'], [20, '20 XP — нормально'], [30, '30 XP — серьёзно'], [50, '50 XP — интенсивно']]),
      sw('Сердечки', 'Выкл.: ошибки ничего не стоят. Вкл.: ошибки отнимают жизни, как в Duolingo', 'hearts', () => app.renderTop()),
      sw('Звуковые эффекты', null, 'sfx'),
      sw('Озвучка арабского', AL.tts.supported ? (AL.tts.voice ? 'Голос: ' + AL.tts.voice.name : 'Арабский голос не найден в системе') : 'Браузер не поддерживает синтез речи', 'tts'),
    );
    if (AL.tts.voices.length > 1) set.append(sel('Голос', null, 'voice', AL.tts.voices.map(v => [v.name, v.name + ' (' + v.lang + ')']), () => AL.tts.load()));
    set.append(
      el('div', { class: 'row' }, el('label', {}, 'Скорость речи', el('small', {}, String(s.settings.rate))),
        el('input', { type: 'range', min: '0.5', max: '1.2', step: '0.1', value: s.settings.rate, onchange: e => { save('rate', +e.target.value); app.render(); } })),
      el('div', { class: 'row' }, el('label', {}, 'Проверить голос'), el('button', { class: 'btn blue', onclick: () => AL.tts.speak('مَرْحَبًا! أَنَا أَتَعَلَّمُ اللُّغَةَ الْعَرَبِيَّةَ') }, '🔊 Тест')),
      sel('Тема', null, 'theme', [['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']], () => applyTheme()));
    scr.appendChild(set);
    if (!AL.tts.voice) scr.appendChild(el('div', { class: 'tipnote', html:
      '<b>Нет арабского голоса?</b><br>Android: Настройки → Специальные возможности → Синтез речи → Google → установить «Арабский».<br>' +
      'iPhone: Настройки → Универсальный доступ → Устный контент → Голоса → Арабский.<br>' +
      'Windows: Параметры → Время и язык → Речь → Добавить голоса → Арабский. Chrome на компьютере обычно уже имеет голос Google.' }));

    // сообщения об ошибках
    const reps = s.reports || [];
    if (reps.length) {
      scr.appendChild(el('h3', { class: 'sub' }, '🚩 Сообщения об ошибках: ' + reps.length));
      scr.appendChild(el('p', { class: 'muted' }, 'Скопируйте и пришлите разработчику курса (или они попадут в файл прогресса).'));
      const text = reps.map((r, i) => `${i + 1}. [${r.kind}] урок ${r.lesson} · ${r.type} · ${r.q}\n   задание: ${r.prompt}\n   ответ курса: ${r.answer}${r.comment ? '\n   комментарий: ' + r.comment : ''}`).join('\n');
      scr.appendChild(el('div', { class: 'plist' },
        el('button', { class: 'btn ghost block', onclick: () => {
          (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => ui.toast('Скопировано'), () => ui.modal(c => [el('textarea', { rows: 12, style: { width: '100%' } }, text), el('button', { class: 'btn block', onclick: c }, 'Закрыть')]));
        } }, '📋 Скопировать сообщения'),
        el('button', { class: 'btn ghost block', onclick: () => ui.confirm('Очистить сообщения?', 'Они удалятся из этого браузера.', 'Очистить', 'Отмена', () => { s.reports = []; ST.save(); app.render(); }) }, 'Очистить')));
    }

    // данные
    scr.appendChild(el('h3', { class: 'sub' }, 'Прогресс'));
    scr.appendChild(el('p', { class: 'muted' }, 'Прогресс хранится только в этом браузере. Чтобы перенести его на другое устройство — сохраните файл и загрузите его там.'));
    const file = el('input', { type: 'file', accept: '.json,application/json', class: 'hidden', onchange: e => {
      const f = e.target.files[0]; if (!f) return;
      f.text().then(t => { try { ST.importJSON(t); applyTheme(); ui.toast('Прогресс загружен ✓'); app.render(); } catch (er) { ui.toast('Ошибка: ' + er.message); } });
    } });
    scr.append(file, el('div', { class: 'plist' },
      el('button', { class: 'btn ghost block', onclick: () => {
        const blob = new Blob([ST.exportJSON()], { type: 'application/json' });
        const a = el('a', { href: URL.createObjectURL(blob), download: 'arablearn-progress-' + U.today() + '.json' });
        document.body.appendChild(a); a.click(); a.remove();
      } }, '💾 Сохранить прогресс в файл'),
      el('button', { class: 'btn ghost block', onclick: () => file.click() }, '📂 Загрузить из файла'),
      el('button', { class: 'btn ghost block', style: { color: 'var(--red)' }, onclick: () =>
        ui.confirm('Сбросить весь прогресс?', 'Это удалит XP, серию и пройденные уроки. Отменить нельзя.', 'Сбросить', 'Отмена', () => { ST.reset(); applyTheme(); app.render(); }) }, '🗑 Сбросить прогресс')));
    scr.appendChild(el('p', { class: 'muted center', style: { marginTop: '24px', fontSize: '13px' } }, 'ArabLearn · литературный арабский (фусха)'));
  }
  function statbox(ico, v, label) {
    return el('div', { class: 'statbox' }, el('div', { class: 'ico' }, ico), el('div', {}, el('b', {}, String(v)), el('span', {}, label)));
  }

  document.addEventListener('DOMContentLoaded', app.init);
})(window.AL);
