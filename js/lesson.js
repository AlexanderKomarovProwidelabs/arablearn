/* Плеер урока: показ упражнений, проверка, обратная связь, итог. */
(function (AL) {
  'use strict';
  const U = AL.util, A = AL.ar, el = U.el;
  const ui = AL.ui = AL.ui || {};

  // ---------- общие элементы ----------
  ui.sayBtn = function (text, cls, slow) {
    return el('button', {
      class: 'say ' + (cls || ''), title: slow ? 'Медленно' : 'Послушать', 'aria-label': 'Послушать',
      onclick: e => { e.stopPropagation(); AL.tts.speak(text, { slow }); }
    }, slow ? '🐢' : '🔊');
  };
  // {{арабский|перевод}} → пример с кнопкой и транскрипцией
  ui.expand = function (html) {
    const showTr = AL.state.showTranslit();
    return html.replace(/\{\{([^}|]+)(?:\|([^}]+))?\}\}/g, (m, ar, ru) =>
      `<span class="ex"><button class="say sm" data-say="${U.esc(ar)}">🔊</button><span class="ar">${ar}</span>` +
      (showTr ? ` <span class="tr">${U.esc(AL.state.tr(ar))}</span>` : '') +
      (ru ? ` <span class="ru">— ${U.esc(ru)}</span>` : '') + `</span>`);
  };
  ui.formsRow = function (ch) {
    const order = ['isolated', 'initial', 'medial', 'final'];
    return el('div', { class: 'forms-row' }, order.map(p => el('div', {},
      el('span', { class: 'ar' }, A.form(ch, p)), el('small', {}, A.FORM_NAMES[p]))));
  };
  ui.hydrate = function (root) {
    root.querySelectorAll('.forms-demo').forEach(d => { d.innerHTML = ''; d.appendChild(ui.formsRow(d.dataset.letter)); });
  };
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-say]');
    if (b) { e.stopPropagation(); AL.tts.speak(b.dataset.say); }
  });
  ui.letterCard = function (sec, l) {
    const scheme = AL.state.s.settings.translit;
    const snd = l.snd ? l.snd[scheme] : A.CONS[scheme][l.ch];
    return el('div', { class: 'card letter-card' },
      el('div', { class: 'audio-row' }, el('div', { class: 'huge' }, l.ch)),
      el('div', { class: 'name' }, l.name, ' ', el('span', { class: 'ar', style: { fontSize: '26px' } }, l.ar), ' ', ui.sayBtn(l.ar, 'sm')),
      el('div', { class: 'snd' }, 'звук: ', snd),
      ui.formsRow(l.ch),
      el('div', { class: 'desc', html: l.desc }),
      el('div', { class: 'example' },
        ui.sayBtn(l.ex, 'sm'), el('span', { class: 'ar' }, l.ex),
        el('span', { class: 'tr', style: { color: 'var(--blue)', fontWeight: 700 } }, AL.state.tr(l.ex)),
        el('span', { class: 'muted' }, '— ' + l.exRu)));
  };
  ui.modal = function (content, opts) {
    opts = opts || {};
    const back = el('div', { class: 'modal-back', onclick: e => { if (e.target === back && !opts.sticky) close(); } });
    const box = el('div', { class: 'modal' });
    const close = () => { back.remove(); opts.onclose && opts.onclose(); };
    box.append(...[].concat(content(close)));
    back.appendChild(box);
    document.body.appendChild(back);
    ui.hydrate(box);
    return close;
  };
  ui.confirm = function (title, text, yes, no, onYes) {
    ui.modal(close => [el('h3', {}, title), el('p', { class: 'muted' }, text),
      el('div', { class: 'actions' },
        el('button', { class: 'btn block', onclick: () => close() }, no),
        el('button', { class: 'btn ghost block', style: { color: 'var(--red)' }, onclick: () => { close(); onYes(); } }, yes))]);
  };
  ui.toast = function (msg, ms) {
    const t = el('div', { class: 'toast' }, msg);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms || 2500);
  };
  ui.confetti = function () {
    const cv = el('canvas', { class: 'confetti' });
    document.body.appendChild(cv);
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    const c = cv.getContext('2d'); c.scale(dpr, dpr);
    const cols = ['#58cc02', '#1cb0f6', '#ffc800', '#ff4b4b', '#ce82ff', '#ff9600'];
    const P = Array.from({ length: 120 }, () => ({
      x: innerWidth / 2 + (Math.random() - .5) * 80, y: innerHeight * .35, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4,
      r: Math.random() * 6 + 4, c: U.pick(cols), a: Math.random() * 6, va: (Math.random() - .5) * .3
    }));
    let f = 0;
    (function tick() {
      c.clearRect(0, 0, innerWidth, innerHeight);
      for (const p of P) {
        p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.va;
        c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.fillStyle = p.c; c.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); c.restore();
      }
      if (++f < 150) requestAnimationFrame(tick); else cv.remove();
    })();
  };

  // Сообщение об ошибке в контенте: сохраняется в прогрессе, выгружается из профиля.
  ui.report = function (ex, lessonId) {
    const correct = ex.options ? ex.options[ex.answer] : ex.full ? { ar: ex.full } : null;
    const snap = {
      ts: new Date().toISOString(), lesson: lessonId || '', type: ex.type, q: ex.q || '',
      prompt: ex.prompt ? (ex.prompt.ar || ex.prompt.text || ex.prompt.audio || '') : '',
      answer: correct ? (correct.ar || correct.text || '') : '', item: ex.item || '', explain: ex.explain || '',
    };
    const KINDS = ['Ошибка в арабском', 'Ошибка в переводе', 'Неверный «правильный» ответ', 'Плохая озвучка', 'Другое'];
    let kind = KINDS[0];
    ui.modal(close => {
      const ta = el('textarea', { rows: 3, placeholder: 'Что не так? (необязательно)', style: { width: '100%', fontSize: '16px', padding: '10px', borderRadius: '12px', border: '2px solid var(--line)', background: 'var(--card)', color: 'var(--text)', fontFamily: 'inherit' } });
      const opts = el('div', { class: 'plist' }, KINDS.map((k, i) => el('label', { style: { display: 'flex', gap: '10px', alignItems: 'center', fontWeight: 600 } },
        el('input', { type: 'radio', name: 'rk', checked: i === 0, onchange: () => { kind = k; } }), k)));
      return [el('h3', {}, '🚩 Сообщить об ошибке'),
        el('div', { class: 'card', style: { marginBottom: '12px' } },
          el('div', { class: 'muted', style: { fontSize: '13px' } }, snap.q),
          snap.prompt ? el('div', { class: 'ar', style: { fontSize: '24px' } }, snap.prompt) : null,
          snap.answer ? el('div', {}, 'Ответ: ', el('b', {}, snap.answer)) : null),
        opts, el('div', { style: { height: '12px' } }), ta,
        el('div', { class: 'actions' },
          el('button', { class: 'btn block', onclick: () => {
            snap.kind = kind; snap.comment = ta.value.trim();
            AL.state.s.reports.push(snap); AL.state.save(); close(); ui.toast('Спасибо! Сохранено в профиле');
          } }, 'Отправить'),
          el('button', { class: 'btn ghost block', onclick: close }, 'Отмена'))];
    });
  };

  const PRAISE = ['Отлично!', 'Верно!', 'Здорово!', 'Так держать!', 'Великолепно!', 'Прекрасно!', 'Мабрук! 🎉', 'Ммтаз! (ممتاز)'];

  // ---------- урок ----------
  const L = AL.lesson = {};
  let S = null; // текущее состояние урока
  L._state = () => S; // для автотестов

  L.start = function (opts) {
    // opts: {exercises, title, kind: 'lesson'|'test'|'practice'|'placement', onFinish(result), xpBase}
    if (!opts.exercises || !opts.exercises.length) { ui.toast('Пока нечего повторять — пройдите пару уроков'); return; }
    AL.state.curSection = opts.section || null;
    AL.state.regenHearts();
    if (opts.kind !== 'practice' && AL.state.heartsOn() && AL.state.s.hearts <= 0) { L.noHearts(); return; }
    S = {
      opts, queue: opts.exercises.slice(), total: opts.exercises.length, solved: 0,
      graded: 0, firstOk: 0, mistakes: 0, combo: 0, maxCombo: 0, requeued: new Map(),
      seen: new Set(), started: Date.now(), cur: null, answered: false, lostAll: false,
    };
    const root = el('div', { class: 'lesson' });
    S.root = root;
    S.bar = el('div', { style: { width: '0%' } });
    S.heartsEl = el('div', { class: 'hearts' });
    S.comboEl = el('div', { class: 'combo' });
    S.body = el('div', { class: 'lesson-body' });
    S.foot = el('div', { class: 'lesson-foot' });
    root.append(
      el('div', { class: 'lesson-top' },
        el('button', { class: 'x', 'aria-label': 'Выйти', onclick: L.quit }, '✕'),
        el('div', { class: 'progress' }, S.bar), S.heartsEl),
      S.comboEl, S.body, S.foot);
    document.body.appendChild(root);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    L.updateTop();
    L.next();
  };

  L.updateTop = function () {
    S.bar.style.width = Math.round(100 * S.solved / S.total) + '%';
    const practice = S.opts.kind === 'practice';
    S.heartsEl.textContent = (!AL.state.heartsOn() || practice) ? '' : '❤️ ' + AL.state.s.hearts;
    S.comboEl.textContent = S.combo >= 3 ? '🔥 ' + S.combo + ' подряд' : '';
  };

  L.quit = function () {
    if (!S) return;
    if (S.solved === 0) return L.close();
    ui.confirm('Выйти из урока?', 'Прогресс этого урока не сохранится.', 'Выйти', 'Продолжить урок', L.close);
  };
  L.close = function () {
    if (!S) return;
    AL.tts.supported && speechSynthesis.cancel();
    S.root.remove(); document.body.style.overflow = '';
    document.removeEventListener('keydown', onKey);
    S = null;
    AL.app && AL.app.render();
  };

  function onKey(e) {
    if (!S || document.querySelector('.modal-back')) return;
    if (e.key === 'Enter') {
      const b = S.foot.querySelector('.btn:not(:disabled)');
      if (b) { e.preventDefault(); b.click(); }
    } else if (/^[1-9]$/.test(e.key) && !S.answered) {
      const opts = S.body.querySelectorAll('.options .opt');
      const o = opts[+e.key - 1]; if (o) o.click();
    }
  }

  function setFoot(btnText, onClick, enabled, extra) {
    S.foot.className = 'lesson-foot';
    S.foot.innerHTML = '';
    const b = el('button', { class: 'btn', onclick: onClick }, btnText);
    b.disabled = !enabled;
    S.foot.appendChild(el('div', { class: 'inner' }, extra || null, b));
    S.checkBtn = b;
    return b;
  }

  L.next = function () {
    if (!S) return;
    S.answered = false;
    S.body.innerHTML = '';
    S.body.scrollTop = 0;
    if (!S.queue.length) return L.finish();
    const ex = S.cur = S.queue.shift();
    const R = renderers[ex.type];
    R(ex);
    ui.hydrate(S.body);
  };

  // ---------- рендеры ----------
  function promptEl(p) {
    const box = el('div', { class: 'prompt' });
    if (!p) return box;
    if (p.audio && !p.ar && !p.text) {
      box.appendChild(el('div', { class: 'audio-row' }, ui.sayBtn(p.audio, 'big'), ui.sayBtn(p.audio, '', true)));
      if (p.autoplay) setTimeout(() => AL.tts.speak(p.audio), 250);
      if (!AL.tts.available()) box.appendChild(el('div', { class: 'warn' }, 'Нет арабского голоса — включите озвучку в настройках или пропустите.'));
      return box;
    }
    if (p.text) box.appendChild(el('div', { class: 'txt' }, p.text));
    if (p.ar) box.appendChild(el('div', { class: 'ar' + (p.big ? ' big' : '') + (!p.big && A.strip(p.ar).length > 18 ? ' long' : '') }, p.ar));
    if (p.sub) box.appendChild(el('div', { class: 'sub' }, p.sub));
    if (p.audio && AL.tts.available()) box.appendChild(ui.sayBtn(p.audio, 'sm'));
    return box;
  }
  function optContent(o) {
    const frag = [];
    if (o.ar) frag.push(el('span', { class: 'ar' }, o.ar));
    if (o.text) frag.push(el('span', {}, o.text));
    if (o.sub) frag.push(el('span', { class: 'sub' }, o.sub));
    return frag;
  }
  function optLabel(o) { return o.ar ? el('span', { class: 'ar' }, o.ar) : el('b', {}, o.text); }

  const renderers = {
    word(ex) {
      const w = ex.word, showTr = AL.state.showTranslit();
      S.body.append(el('div', { class: 'note' }, el('div', { class: 'tag' }, 'Новое слово')),
        el('div', { class: 'card letter-card' },
          el('div', { class: 'ar', style: { fontSize: A.strip(w.ar).length > 10 ? '44px' : '64px', lineHeight: 1.7 } }, w.ar),
          showTr ? el('div', { class: 'snd' }, AL.state.tr(w.ar)) : null,
          el('div', { class: 'name', style: { margin: '6px 0' } }, w.ru),
          w.pl ? el('div', { class: 'muted' }, 'мн. ч.: ', el('span', { class: 'ar', style: { fontSize: '26px' } }, w.pl)) : null,
          w.note ? el('div', { class: 'muted', style: { marginTop: '6px' } }, w.note) : null,
          el('div', { style: { marginTop: '10px' } }, ui.sayBtn(w.ar), ' ', ui.sayBtn(w.ar, '', true))));
      setTimeout(() => AL.tts.speak(w.ar), 300);
      setFoot('Дальше', () => { S.solved++; L.updateTop(); L.next(); }, true);
    },
    reading(ex) {
      const t = ex.text, showTr = AL.state.showTranslit();
      const card = el('div', { class: 'card reading' }, el('div', { class: 'tag' }, t.kind === 'dialog' || t.lines.some(l => l.who) ? 'Диалог' : 'Текст'),
        t.title ? el('h3', {}, t.title) : null);
      const all = t.lines.map(l => l.ar).join(' ');
      card.appendChild(el('div', { class: 'reading-tools' }, ui.sayBtn(all, 'sm'), ' слушать всё ',
        el('button', { class: 'link', onclick: () => card.classList.toggle('show-ru') }, 'Перевод')));
      t.lines.forEach(l => card.appendChild(el('div', { class: 'rline' },
        l.who ? el('div', { class: 'who' }, l.who) : null,
        el('div', { class: 'rrow' }, ui.sayBtn(l.ar, 'sm'), el('span', { class: 'ar' }, l.ar)),
        showTr ? el('div', { class: 'tr' }, AL.state.tr(l.ar)) : null,
        l.ru ? el('div', { class: 'ru' }, l.ru) : null)));
      S.body.append(card);
      setFoot('Дальше', () => { S.solved++; L.updateTop(); L.next(); }, true);
    },
    letter(ex) {
      S.body.append(el('div', { class: 'note' }, el('div', { class: 'tag' }, 'Новая буква')), ui.letterCard(ex.section || AL.course.sections[0], ex.letter));
      setTimeout(() => AL.tts.speak(ex.letter.ar), 300);
      setFoot('Дальше', () => { S.solved++; L.updateTop(); L.next(); }, true);
    },
    note(ex) {
      const c = el('div', { class: 'card note' }, el('div', { class: 'tag' }, 'Правило'), el('h3', {}, ex.note.title), el('div', { html: ui.expand(ex.note.html) }));
      S.body.append(c);
      setFoot('Понятно', () => { S.solved++; L.updateTop(); L.next(); }, true);
    },
    choice(ex) {
      S.body.append(el('div', { class: 'q' }, ex.q), promptEl(ex.prompt));
      const long = ex.options.some(o => (o.text || '').length > 22 || A.strip(o.ar || '').length > 14);
      const grid = el('div', { class: 'options' + (long ? ' one' : '') + (ex.small ? ' small' : '') });
      let sel = -1;
      ex.options.forEach((o, i) => {
        const b = el('button', { class: 'opt', onclick: () => {
          if (S.answered) return;
          AL.sfx.tap();
          grid.querySelectorAll('.opt').forEach(x => x.classList.remove('sel'));
          b.classList.add('sel'); sel = i; S.checkBtn.disabled = false;
          if (o.ar && ex.listen !== true && !ex.prompt.audio) { /* не подсказываем звук */ }
        } }, optContent(o));
        grid.appendChild(b);
      });
      S.body.append(grid);
      setFoot('Проверить', () => {
        if (sel < 0) return;
        const ok = sel === ex.answer;
        const btns = grid.querySelectorAll('.opt');
        btns.forEach(b => b.disabled = true);
        btns[sel].classList.remove('sel');
        btns[sel].classList.add(ok ? 'ok' : 'bad');
        if (!ok) btns[ex.answer].classList.add('ok');
        grade(ex, ok, ex.options[ex.answer]);
      }, false);
    },
    match(ex) {
      S.body.append(el('div', { class: 'q' }, ex.q));
      const left = U.shuffle(ex.pairs.map((p, i) => ({ i, o: p.l })));
      const right = U.shuffle(ex.pairs.map((p, i) => ({ i, o: p.r })));
      const colL = el('div', { class: 'col' }), colR = el('div', { class: 'col' });
      let selL = null, selR = null, left_ = ex.pairs.length, errs = 0;
      const mk = (side, it) => {
        const b = el('button', { class: 'opt', 'data-i': it.i, 'data-side': side, onclick: () => {
          if (b.classList.contains('gone')) return;
          AL.sfx.tap();
          if (side === 'l') { colL.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); selL = { b, it }; const p = ex.pairs[it.i]; if (p.say && !p.l.text) AL.tts.speak(p.say); }
          else { colR.querySelectorAll('.sel').forEach(x => x.classList.remove('sel')); selR = { b, it }; }
          b.classList.add('sel');
          if (selL && selR) {
            const ok = selL.it.i === selR.it.i;
            const a = selL, c = selR; selL = selR = null;
            [a.b, c.b].forEach(x => x.classList.remove('sel'));
            if (ok) {
              AL.sfx.correct();
              [a.b, c.b].forEach(x => x.classList.add('ok'));
              setTimeout(() => [a.b, c.b].forEach(x => { x.classList.remove('ok'); x.classList.add('gone'); }), 350);
              const p = ex.pairs[a.it.i];
              if (p.item) AL.state.review(p.item, true);
              if (--left_ === 0) setTimeout(() => grade(ex, true, null, errs), 450);
            } else {
              AL.sfx.wrong(); errs++;
              const p = ex.pairs[a.it.i]; if (p.item) AL.state.review(p.item, false);
              [a.b, c.b].forEach(x => x.classList.add('bad'));
              setTimeout(() => [a.b, c.b].forEach(x => x.classList.remove('bad')), 450);
            }
          }
        } }, optContent(it.o));
        return b;
      };
      left.forEach(it => colL.appendChild(mk('l', it)));
      right.forEach(it => colR.appendChild(mk('r', it)));
      // в RTL-логике арабский столбец справа
      const leftIsAr = !!ex.pairs[0].l.ar && !ex.pairs[0].r.ar;
      S.body.append(el('div', { class: 'match' }, leftIsAr ? [colR, colL] : [colL, colR]));
      setFoot('Проверить', () => { }, false);
    },
    build(ex) {
      const ru = ex.lang === 'ru';
      S.body.append(el('div', { class: 'q' }, ex.q), promptEl(ex.prompt));
      const ans = el('div', { class: 'build-answer' + (ru ? ' ltr' : '') });
      const prev = el('div', { class: 'build-preview' });
      const bank = el('div', { class: 'bank' + (ru ? ' ltr' : '') });
      const chosen = [];
      const word = ex.join === ' ';
      const tcls = 'tile' + (ru ? ' ru' : word ? ' word' : '');
      const upd = () => {
        prev.textContent = word ? '' : chosen.map(c => c.t).join('');
        S.checkBtn.disabled = !chosen.length;
      };
      ex.tiles.forEach(t => {
        const b = el('button', { class: tcls, onclick: () => {
          if (S.answered) return;
          AL.sfx.tap();
          b.classList.add('used');
          const c = { t, src: b };
          c.el = el('button', { class: tcls, onclick: () => {
            if (S.answered) return;
            chosen.splice(chosen.indexOf(c), 1); c.el.remove(); b.classList.remove('used'); upd();
          } }, t);
          chosen.push(c); ans.appendChild(c.el); upd();
        } }, t);
        bank.appendChild(b);
      });
      if (!word) S.body.append(prev);
      S.body.append(ans, bank);
      setFoot('Проверить', () => {
        const got = chosen.map(c => c.t);
        const ok = got.join('|') === ex.answer.join('|');
        grade(ex, ok, ru ? { text: ex.full } : { ar: ex.full });
      }, false);
      upd();
    },
  };

  // ---------- проверка ----------
  function grade(ex, ok, correctOpt, matchErrs) {
    if (S.answered) return;
    S.answered = true;
    const first = !S.requeued.has(ex);
    S.seen.add(ex);
    if (ex.type !== 'match') {
      S.graded++;
      if (ex.item) AL.state.review(ex.item, ok);
      AL.state.s.stats.answers++;
      if (ok) AL.state.s.stats.correct++;
    } else {
      S.graded++;
    }
    if (ok) {
      S.solved++;
      if (first && !matchErrs) S.firstOk++;
      S.combo++; S.maxCombo = Math.max(S.maxCombo, S.combo);
      if (S.combo > 0 && S.combo % 5 === 0) AL.sfx.combo(); else AL.sfx.correct();
      if (ex.say) AL.tts.speak(ex.say);
    } else {
      S.mistakes++; S.combo = 0;
      AL.sfx.wrong();
      if (S.opts.kind !== 'practice') AL.state.loseHeart();
      const n = (S.requeued.get(ex) || 0) + 1;
      S.requeued.set(ex, n);
      if (n <= 2) S.queue.push(ex); else S.solved++;
      if (ex.say) setTimeout(() => AL.tts.speak(ex.say), 400);
    }
    AL.state.save();
    L.updateTop();
    showFeedback(ex, ok, correctOpt);
  }

  function showFeedback(ex, ok, correctOpt) {
    S.foot.innerHTML = '';
    S.foot.className = 'lesson-foot feedback ' + (ok ? 'ok' : 'bad');
    const inner = el('div', { class: 'inner' });
    inner.appendChild(el('h3', {}, ok ? '✓ ' + U.pick(PRAISE) : '✗ Неправильно'));
    if (!ok && correctOpt) {
      const showTr = correctOpt.ar && AL.state.showTranslit() && !/^[؀-ۿـ]$/.test(A.strip(correctOpt.ar)) && A.strip(correctOpt.ar).length > 1;
      inner.appendChild(el('div', { class: 'ans' }, 'Правильный ответ: ', optLabel(correctOpt), showTr ? ' (' + AL.state.tr(correctOpt.ar) + ')' : '',
        correctOpt.sub ? ' — ' + correctOpt.sub : ''));
    }
    if (ex.explain) inner.appendChild(el('div', { class: 'ans' }, ex.explain));
    const btn = el('button', { class: 'btn', onclick: () => {
      if (!ok && AL.state.heartsOn() && S.opts.kind !== 'practice' && AL.state.s.hearts <= 0) return L.noHearts(true);
      L.next();
    } }, 'Продолжить');
    const row = el('div', { class: 'row' });
    if (ex.say && AL.tts.available()) row.appendChild(ui.sayBtn(ex.say));
    row.appendChild(el('button', { class: 'say slow', title: 'Сообщить об ошибке в задании', 'aria-label': 'Сообщить об ошибке', onclick: () => ui.report(ex, S.opts.lessonId) }, '🚩'));
    row.appendChild(btn);
    inner.appendChild(row);
    S.foot.appendChild(inner);
    S.checkBtn = btn;
    btn.focus({ preventScroll: true });
  }

  L.noHearts = function (inLesson) {
    const mins = Math.ceil(AL.state.nextHeartIn() / 60000);
    ui.modal(close => [
      el('div', { class: 'center', style: { fontSize: '64px' } }, '💔'),
      el('h3', { class: 'center' }, 'Сердечки закончились'),
      el('p', { class: 'muted center' }, `Новое сердечко появится через ${mins} мин. Или пройдите тренировку слабых мест — она восстанавливает одно сердечко и ничего не стоит.`),
      el('div', { class: 'actions' },
        el('button', { class: 'btn blue block', onclick: () => { close(); if (S) L.close(); AL.app.startPractice('weak'); } }, 'Тренировка (+1 ❤️)'),
        el('button', { class: 'btn ghost block', onclick: () => { close(); if (S) L.close(); } }, inLesson ? 'Выйти из урока' : 'Закрыть'))
    ], { sticky: true });
  };

  L.finish = function () {
    const o = S.opts;
    const secs = Math.round((Date.now() - S.started) / 1000);
    const acc = Math.round(100 * S.firstOk / Math.max(1, S.seen.size));
    const perfect = S.mistakes === 0;
    let xp = (o.xpBase || 10) + (perfect ? 5 : 0) + (S.maxCombo >= 10 ? 3 : 0);
    const st = AL.state.s;
    st.stats.lessons += o.kind === 'practice' ? 0 : 1;
    if (o.kind === 'practice') { st.stats.practice++; AL.state.addHeart(1); }
    if (perfect) st.stats.perfect++;
    const before = AL.state.todayXP();
    const streakUp = AL.state.addXP(xp);
    const goalHit = before < st.settings.goal && AL.state.todayXP() >= st.settings.goal;
    const result = { xp, acc, secs, perfect, streakUp };
    if (o.onFinish) o.onFinish(result);
    const achs = AL.state.checkAch();
    AL.state.save();

    // экран итога
    AL.sfx.finish(); ui.confetti();
    S.body.innerHTML = '';
    S.comboEl.textContent = '';
    S.bar.style.width = '100%';
    const mm = Math.floor(secs / 60), ss = String(secs % 60).padStart(2, '0');
    S.body.appendChild(el('div', { class: 'result' },
      el('div', { class: 'trophy' }, perfect ? '🏆' : o.kind === 'practice' ? '💪' : '⭐'),
      el('h2', {}, perfect ? 'Идеально!' : o.kind === 'practice' ? 'Тренировка завершена!' : 'Урок пройден!'),
      el('div', { class: 'result-stats' },
        el('div', { class: 'rstat' }, el('div', { class: 'k' }, 'Опыт'), el('div', { class: 'v' }, '⚡ ' + xp)),
        el('div', { class: 'rstat green' }, el('div', { class: 'k' }, 'Точность'), el('div', { class: 'v' }, '🎯 ' + acc + '%')),
        el('div', { class: 'rstat blue' }, el('div', { class: 'k' }, 'Время'), el('div', { class: 'v' }, '⏱ ' + mm + ':' + ss))),
      streakUp ? el('div', { style: { fontSize: '20px', fontWeight: 800, color: 'var(--orange)' } }, '🔥 Серия: ' + st.streak + ' ' + U.plural(st.streak, 'день', 'дня', 'дней') + '!') : null,
      goalHit ? el('div', { style: { fontWeight: 800, color: 'var(--yellow-d)' } }, '🎯 Дневная цель выполнена!') : null,
      o.kind === 'practice' && AL.state.heartsOn() ? el('div', { class: 'muted' }, '+1 ❤️ восстановлено') : null,
      achs.map(a => el('div', { class: 'card', style: { display: 'flex', gap: '12px', alignItems: 'center', width: '100%' } },
        el('div', { style: { fontSize: '36px' } }, a.icon),
        el('div', { style: { textAlign: 'left' } }, el('div', { class: 'muted', style: { fontSize: '12px', fontWeight: 800, textTransform: 'uppercase' } }, 'Новое достижение'), el('b', {}, a.title), el('div', { class: 'muted' }, a.desc))))
    ));
    setFoot('Продолжить', L.close, true);
  };
})(window.AL);
