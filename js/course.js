/* Сборка курса (порядок уроков, открытие) и генерация упражнений. */
(function (AL) {
  'use strict';
  const U = AL.util, A = AL.ar;
  const C = AL.course;

  // Какие «знаки» вводятся заметками.
  const NOTE_FEATURE = { harakat: 'vowels', long: 'long', sukun: 'sukun', shadda: 'shadda', tamarbuta: 'ta', tanween: 'tanween', hamza: 'hamza', article: 'article' };
  const HAMZA = /[ءأإؤئآ]/;

  // Требования слова: буквы + знаки.
  function requirements(ar) {
    const req = { letters: new Set(), feats: new Set() };
    const plain = A.strip(ar);
    let s = ar;
    if (/^ال/.test(plain)) { req.feats.add('article'); }
    for (const ch of A.letters(s)) {
      if (HAMZA.test(ch)) { req.feats.add('hamza'); if (ch === 'آ') req.letters.add('ا'); continue; }
      if (ch === 'ة') { req.feats.add('ta'); continue; }
      if (ch === 'ى') { req.feats.add('tanween'); continue; }
      req.letters.add(ch === 'ٱ' ? 'ا' : ch);
    }
    if (/[ً-ٍٰ]/.test(s)) req.feats.add('tanween');
    if (/ّ/.test(s)) req.feats.add('shadda');
    if (/ْ/.test(s)) req.feats.add('sukun');
    if (/[َُِ]/.test(s)) req.feats.add('vowels');
    if (/[āīū]/.test(A.translit(s, 'lat'))) req.feats.add('long');
    // артикль подразумевает сукун/шадду — это часть темы артикля
    if (req.feats.has('article')) { req.feats.delete('sukun'); }
    return req;
  }
  C.requirements = requirements;

  function satisfied(req, letters, feats) {
    for (const l of req.letters) if (!letters.has(l)) return false;
    for (const f of req.feats) if (!feats.has(f)) return false;
    return true;
  }

  // ---------- построение ----------
  C.lessons = [];      // плоский список всех уроков
  C.byId = {};
  C.unitsById = {};

  C.build = function () {
    C.lessons = []; C.byId = {}; C.unitsById = {};
    C.items = {};
    for (const sec of C.sections) {
      if (sec.kind === 'level') { C.buildLevel(sec); continue; }
      sec.letterMap = {};
      for (const l of sec.letters || []) sec.letterMap[l.ch] = l;
      const knownL = new Set(), knownF = new Set(), assigned = new Set();
      const allWords = (sec.words || []).map(w => Object.assign(w, { req: w.req || requirements(w.ar) }));
      sec.units.forEach((u, ui) => {
        u.section = sec; u.index = ui;
        C.unitsById[u.id] = u;
        u.focusWords = [];
        if (!u.lessons.some(l => l.kind === 'test')) u.lessons.push({ kind: 'test', title: 'Испытание юнита' });
        const wordLessons = u.lessons.filter(l => l.kind === 'words' || l.kind === 'sunmoon');
        let wlIdx = 0;
        u.lessons.forEach((les, li) => {
          les.id = u.id + '-' + (li + 1);
          les.unit = u; les.section = sec; les.index = li;
          (les.letters || []).forEach(l => knownL.add(l));
          (les.notes || []).forEach(n => { if (NOTE_FEATURE[n]) knownF.add(NOTE_FEATURE[n]); });
          if (les.kind === 'syllables' && ui === 0) knownF.add('vowels');
          les.knownLetters = new Set(knownL);
          les.knownFeats = new Set(knownF);
          if (les.kind === 'words' || les.kind === 'sunmoon') {
            const avail = allWords.filter(w => !assigned.has(w.ar) && satisfied(w.req, knownL, knownF));
            const left = wordLessons.length - wlIdx;
            const cap = Math.max(4, Math.min(10, Math.ceil(avail.length / Math.max(1, left))));
            les.focus = avail.slice(0, left === 1 ? avail.length : cap);
            les.focus.forEach(w => { assigned.add(w.ar); u.focusWords.push(w); });
            wlIdx++;
          }
          les.knownWords = allWords.filter(w => assigned.has(w.ar));
          C.lessons.push(les);
          C.byId[les.id] = les;
        });
      });
      // слова, которые ни в один урок не попали (для отладки)
      sec.orphans = allWords.filter(w => !assigned.has(w.ar));
    }
    // индекс элементов для повторения
    for (const sec of C.sections) {
      (sec.words || []).forEach(w => { C.items['W:' + w.ar] = w; });
      (sec.phrases || []).forEach(w => { C.items['P:' + w.ar] = w; });
      (sec.sentences || []).forEach(x => { C.items['S:' + x.ar] = x; });
    }
  };

  // ---------- прогресс ----------
  C.unitDone = u => u.lessons.every(l => AL.state.isDone(l.id));
  C.sectionDone = id => {
    const sec = C.sections.find(s => s.id === id);
    return !!sec && sec.units.every(C.unitDone);
  };
  C.current = () => C.lessons.find(l => !AL.state.isDone(l.id)) || null;
  C.isUnlocked = function (les) {
    const i = C.lessons.indexOf(les);
    if (i <= 0) return true;
    return AL.state.isDone(C.lessons[i - 1].id) || AL.state.isDone(les.id);
  };
  // Прохождение теста-прыжка: отмечаем всё до этого юнита включительно.
  C.completeUpTo = function (unit) {
    for (const l of C.lessons) {
      if (!AL.state.isDone(l.id)) AL.state.markDone(l.id, 0);
      if (l.unit === unit && l.kind === 'test') break;
    }
  };

  // ---------- генерация упражнений ----------
  const G = C.gen = {};
  const tr = s => AL.state.tr(s);
  const scheme = () => AL.state.s.settings.translit;
  const canListen = () => AL.tts.available();

  function soundOf(sec, ch) {
    const l = sec.letterMap[ch];
    if (l && l.snd) return l.snd[scheme()];
    return A.CONS[scheme()][ch] || ch;
  }
  function letterLabel(sec, ch) {
    const l = sec.letterMap[ch];
    return { text: soundOf(sec, ch), sub: l ? l.name : '' };
  }
  // n дистракторов: сначала похожие, потом известные, потом любые
  function distractLetters(sec, ch, known, n) {
    const sim = A.similar(ch).filter(x => sec.letterMap[x]);
    const kn = Array.from(known).filter(x => x !== ch && sec.letterMap[x]);
    const any = Object.keys(sec.letterMap).filter(x => x !== ch);
    const out = [];
    const add = list => { for (const x of U.shuffle(list)) { if (out.length >= n) return; if (!out.includes(x)) out.push(x); } };
    add(sim.filter(x => known.has(x)));
    if (out.length < Math.min(1, n)) add(sim);
    add(kn);
    add(sim);
    add(any);
    return out.slice(0, n);
  }
  function choice(q, prompt, correct, wrongs, extra) {
    const opts = U.shuffle([correct].concat(wrongs));
    return Object.assign({ type: 'choice', q, prompt, options: opts, answer: opts.indexOf(correct) }, extra || {});
  }

  G.letterIntro = (sec, ch) => ({ type: 'letter', letter: sec.letterMap[ch], item: 'L:' + ch });
  G.note = (sec, id) => ({ type: 'note', note: sec.notes[id] });

  G.letterSound = function (sec, ch, known) {
    const wr = distractLetters(sec, ch, known, 3).map(x => letterLabel(sec, x));
    const pos = (A.NONJOIN.has(ch) || Math.random() < 0.6) ? 'isolated' : U.pick(['initial', 'medial', 'final']);
    return choice('Как читается эта буква?', { ar: A.form(ch, pos), big: true, sub: pos !== 'isolated' ? 'форма: ' + A.FORM_NAMES[pos] : '' },
      letterLabel(sec, ch), wr, { item: 'L:' + ch, say: sec.letterMap[ch].ar });
  };
  G.soundLetter = function (sec, ch, known) {
    const l = sec.letterMap[ch];
    const wr = distractLetters(sec, ch, known, 3).map(x => ({ ar: x }));
    return choice('Найдите букву', { text: '«' + l.name + '» — ' + soundOf(sec, ch), audio: l.ar },
      { ar: ch }, wr, { item: 'L:' + ch, say: l.ar });
  };
  G.formLetter = function (sec, ch, known) {
    const pos = A.NONJOIN.has(ch) ? 'final' : U.pick(['initial', 'medial', 'final']);
    const wr = distractLetters(sec, ch, known, 3).map(x => ({ ar: x }));
    return choice('Какая это буква?', { ar: A.form(ch, pos), big: true, sub: 'форма: ' + A.FORM_NAMES[pos] },
      { ar: ch }, wr, { item: 'L:' + ch, say: sec.letterMap[ch].ar });
  };
  G.findForm = function (sec, ch, known) {
    const pos = A.NONJOIN.has(ch) ? U.pick(['final', 'isolated']) : U.pick(['initial', 'medial', 'final']);
    const wr = distractLetters(sec, ch, known, 3).map(x => ({ ar: A.form(x, pos) }));
    return choice('Найдите букву «' + sec.letterMap[ch].name + '» — ' + A.FORM_NAMES[pos],
      { ar: ch, big: true }, { ar: A.form(ch, pos) }, wr, { item: 'L:' + ch });
  };
  G.matchLetters = function (sec, chars) {
    chars = U.uniq(chars).slice(0, 5);
    return { type: 'match', q: 'Соедините пары', pairs: chars.map(ch => ({ l: { ar: ch }, r: letterLabel(sec, ch), item: 'L:' + ch, say: sec.letterMap[ch].ar })) };
  };
  G.matchForms = function (sec, chars) {
    chars = U.uniq(chars).slice(0, 5);
    return { type: 'match', q: 'Соедините формы одной буквы', pairs: chars.map(ch => {
      const pos = A.NONJOIN.has(ch) ? 'final' : U.pick(['initial', 'medial', 'final']);
      return { l: { ar: ch }, r: { ar: A.form(ch, pos) }, item: 'L:' + ch };
    }) };
  };

  const SHORT = [['َ', 'a'], ['ِ', 'i'], ['ُ', 'u']];
  const LONG = [['َا', 'A'], ['ِي', 'I'], ['ُو', 'U']];
  function syllables(ch, feats) {
    if (ch === 'ا') return [];
    let list = SHORT.map(v => ch + v[0]);
    if (feats.has('long')) list = list.concat(LONG.map(v => ch + v[0]));
    if (feats.has('sukun')) list.push('ا' + 'َ' + ch + 'ْ');  // «аб»
    return list;
  }
  G.syllable = function (sec, ch, known, feats) {
    const syl = U.pick(syllables(ch, feats));
    if (!syl) return null;
    const pool = syllables(ch, feats).filter(s => s !== syl);
    for (const o of distractLetters(sec, ch, known, 2)) {
      const sy = syllables(o, feats); if (sy.length) pool.push(sy[Math.floor(Math.random() * Math.min(3, sy.length))]);
    }
    const labels = U.uniqBy(U.shuffle(pool).map(s => ({ text: tr(s) })), o => o.text).filter(o => o.text !== tr(syl)).slice(0, 3);
    return choice('Как это читается?', { ar: syl, big: true }, { text: tr(syl) }, labels, { item: 'L:' + ch, say: syl });
  };
  G.listenSyllable = function (sec, ch, known, feats) {
    const syl = U.pick(syllables(ch, feats));
    if (!syl) return null;
    const pool = syllables(ch, feats).filter(s => s !== syl).concat(
      distractLetters(sec, ch, known, 2).flatMap(o => syllables(o, feats).filter(s => tr(s).slice(-1) === tr(syl).slice(-1))));
    const wr = U.uniqBy(U.shuffle(pool), s => s).slice(0, 3).map(s => ({ ar: s }));
    return choice('Что вы слышите?', { audio: syl, autoplay: true }, { ar: syl }, wr, { item: 'L:' + ch, listen: true });
  };

  // слова
  function otherWords(pool, w, n, key) {
    const k = key || (x => x.ar);
    let cand = pool.filter(x => x.ar !== w.ar && k(x) !== k(w));
    // сначала похожие по длине
    cand = U.shuffle(cand).sort((a, b) => Math.abs(A.strip(a.ar).length - A.strip(w.ar).length) - Math.abs(A.strip(b.ar).length - A.strip(w.ar).length));
    return U.uniqBy(cand.slice(0, n * 3), k).slice(0, n * 2).sort(() => Math.random() - 0.5).slice(0, n);
  }
  const wid = w => (w.phrase ? 'P:' : 'W:') + w.ar;
  G.wordRead = function (w, pool) {
    const wr = otherWords(pool, w, 3, x => tr(x.ar)).map(x => ({ text: tr(x.ar) }));
    return choice('Как читается это слово?', { ar: w.ar, big: true }, { text: tr(w.ar) }, wr, { item: wid(w), say: w.ar, explain: w.ru });
  };
  G.wordMeaning = function (w, pool, showTr) {
    const wr = otherWords(pool, w, 3, x => x.ru).map(x => ({ text: x.ru }));
    return choice('Что это значит?', { ar: w.ar, big: !w.phrase, sub: showTr ? tr(w.ar) : '', audio: w.ar }, { text: w.ru }, wr, { item: wid(w) });
  };
  G.meaningWord = function (w, pool) {
    const wr = otherWords(pool, w, 3).map(x => ({ ar: x.ar }));
    return choice('Как сказать по-арабски?', { text: '«' + w.ru + '»' }, { ar: w.ar }, wr, { item: wid(w), say: w.ar });
  };
  G.listenWord = function (w, pool) {
    const wr = otherWords(pool, w, 3).map(x => ({ ar: x.ar }));
    return choice('Что вы слышите?', { audio: w.ar, autoplay: true }, { ar: w.ar }, wr, { item: wid(w), listen: true, explain: w.ru });
  };
  G.buildWord = function (sec, w, known) {
    const ls = A.letters(w.ar);
    if (ls.length < 2 || ls.length > 9) return null;
    const extra = [];
    for (const ch of U.shuffle(ls)) { const d = distractLetters(sec, ch, known, 1)[0]; if (d && !ls.includes(d) && !extra.includes(d)) extra.push(d); if (extra.length >= 2) break; }
    return { type: 'build', q: 'Соберите слово из букв', prompt: { text: '«' + w.ru + '»', sub: tr(w.ar), audio: w.ar },
      tiles: U.shuffle(ls.concat(extra)), answer: ls, join: '', item: wid(w), say: w.ar, full: w.ar };
  };
  // фраза по словам; огласовки сохраняем — на этом этапе они нужны для чтения
  const phraseWords = ar => ar.replace(/[؟?،,.!]/g, '').trim().split(/\s+/);
  G.buildPhrase = function (w, pool) {
    const ws = phraseWords(w.ar);
    if (ws.length < 2) return null;
    const extra = U.uniq(otherWords(pool, w, 4).flatMap(x => phraseWords(x.ar)))
      .filter(x => !ws.includes(x) && !ws.map(A.strip).includes(A.strip(x))).slice(0, 2);
    return { type: 'build', q: 'Составьте фразу', prompt: { text: '«' + w.ru + '»', audio: w.ar },
      tiles: U.shuffle(ws.concat(extra)), answer: ws, join: ' ', item: wid(w), say: w.ar, full: w.ar };
  };
  G.matchWords = function (ws) {
    ws = U.uniqBy(ws, w => w.ru).slice(0, 5);
    return { type: 'match', q: 'Соедините слова с переводом', pairs: ws.map(w => ({ l: { ar: w.ar }, r: { text: w.ru }, item: wid(w), say: w.ar })) };
  };

  // артикль: «аш-шамс» или «аль-шамс»?
  function articleSwap(ar) {
    const cl = A.clusters(ar);
    // cl[0]=ا, cl[1]=ل, cl[2]=первая буква
    const first = cl[2];
    let rest = cl.slice(3).map(c => c.b + c.m).join('');
    const isSun = first.m.includes('ّ');
    let wrong;
    if (isSun) wrong = 'الْ' + first.b + first.m.replace('ّ', '') + rest;
    else wrong = 'ال' + first.b + 'ّ' + first.m + rest;
    return { isSun, wrong, letter: first.b };
  }
  G.sunMoonRead = function (w) {
    const s = articleSwap(w.ar);
    return choice('Как читается с артиклем?', { ar: w.ar, big: true }, { text: tr(w.ar) }, [{ text: tr(s.wrong) }], { item: wid(w), say: w.ar, explain: w.ru });
  };
  G.sunMoonType = function (w) {
    const s = articleSwap(w.ar);
    const sun = { text: '☀️ солнечная' }, moon = { text: '🌙 лунная' };
    const opts = [sun, moon];
    return { type: 'choice', q: 'Буква «' + s.letter + '» — солнечная или лунная?', prompt: { ar: A.strip(w.ar).slice(2), big: true, sub: w.ru },
      options: opts, answer: s.isSun ? 0 : 1, item: wid(w), say: w.ar, explain: tr(w.ar) };
  };

  // ---------- сборка урока ----------
  function letterBlock(sec, chars, known, feats) {
    const ex = [];
    for (const ch of chars) {
      ex.push(G.letterIntro(sec, ch));
      ex.push(G.letterSound(sec, ch, known));
      ex.push(G.soundLetter(sec, ch, known));
    }
    return ex;
  }
  function wordPool(les) { return les.knownWords.length >= 4 ? les.knownWords : les.section.words; }

  function wordExercises(sec, ws, les, n) {
    const pool = wordPool(les), out = [], showTr = AL.state.showTranslit(sec);
    const types = ['read', 'meaning', 'meaningWord', 'build', 'listen'];
    let t = 0;
    for (let k = 0; out.length < n && k < n * 3; k++) {
      const w = ws[k % ws.length];
      const ty = types[t++ % types.length];
      let e = null;
      if (w.phrase) {
        if (ty === 'build') e = G.buildPhrase(w, pool);
        else if (ty === 'read') e = G.wordMeaning(w, pool, showTr);
        else if (ty === 'listen' && canListen()) e = G.listenWord(w, pool);
        else if (ty === 'meaningWord') e = G.meaningWord(w, pool);
        else e = G.wordMeaning(w, pool, showTr);
      } else if (ty === 'read') e = G.wordRead(w, pool);
      else if (ty === 'meaning') e = G.wordMeaning(w, pool, showTr);
      else if (ty === 'meaningWord') e = G.meaningWord(w, pool);
      else if (ty === 'build') e = sec.kind === 'level' && (sec.level !== 'A1' || A.letters(w.ar).length > 7) ? G.wordMeaning(w, pool, showTr) : G.buildWord(sec, w, les.knownLetters);
      else if (ty === 'listen' && canListen()) e = G.listenWord(w, pool);
      if (e) out.push(e);
    }
    return out;
  }

  // Слабые элементы среди известных (для повторения)
  function weakFrom(ids, n) {
    const items = AL.state.s.items;
    return U.shuffle(ids).sort((a, b) => ((items[a] || { s: 0 }).s - (items[b] || { s: 0 }).s)).slice(0, n);
  }

  C.generate = function (les) {
    if (les.section.kind === 'level') return C.generateLevel(les);
    const sec = les.section, known = les.knownLetters, feats = les.knownFeats;
    let ex = [];
    const notes = (les.notes || []).map(n => G.note(sec, n));
    const unitLetters = les.unit.letters.filter(ch => known.has(ch));
    const knownArr = Array.from(known);

    switch (les.kind) {
      case 'letters': {
        const chars = les.letters;
        ex = notes.concat(letterBlock(sec, chars, known, feats));
        const practice = [];
        const mixSet = U.uniq(chars.concat(U.sample(knownArr.filter(c => !chars.includes(c)), 2)));
        for (let i = 0; i < 6; i++) {
          const ch = i < 4 ? chars[i % chars.length] : U.pick(mixSet);
          const r = Math.random();
          if (feats.has('vowels') && ch !== 'ا' && r < 0.4) practice.push(G.syllable(sec, ch, known, feats));
          else if (r < 0.7) practice.push(G.letterSound(sec, ch, known));
          else practice.push(G.soundLetter(sec, ch, known));
        }
        if (mixSet.length >= 3) practice.splice(3, 0, G.matchLetters(sec, mixSet));
        ex = ex.concat(practice.filter(Boolean));
        break;
      }
      case 'syllables': {
        ex = notes.slice();
        const chars = knownArr.filter(c => c !== 'ا');
        const focus = unitLetters.filter(c => c !== 'ا');
        for (let i = 0; i < 10; i++) {
          const ch = i % 3 === 2 ? U.pick(chars) : U.pick(focus.length ? focus : chars);
          if (i % 4 === 3 && canListen()) ex.push(G.listenSyllable(sec, ch, known, feats));
          else ex.push(G.syllable(sec, ch, known, feats));
        }
        // слова с сукуном, если уже доступны
        const ws = les.knownWords.length ? les.knownWords : sec.words.filter(w => satisfied(w.req, known, feats));
        U.sample(ws.filter(w => satisfied(w.req, known, feats)), 3).forEach(w => ex.push(G.wordRead(w, sec.words)));
        break;
      }
      case 'forms': {
        ex = notes.slice();
        const focus = unitLetters.length ? unitLetters : knownArr;
        for (let i = 0; i < 10; i++) {
          const ch = i % 3 === 2 ? U.pick(knownArr) : focus[i % focus.length];
          ex.push(i % 2 ? G.findForm(sec, ch, known) : G.formLetter(sec, ch, known));
        }
        ex.splice(5, 0, G.matchForms(sec, U.uniq(focus.concat(U.sample(knownArr, 3))).slice(0, 4)));
        break;
      }
      case 'words': {
        ex = notes.slice();
        const ws = les.focus && les.focus.length ? les.focus : U.sample(les.knownWords, 8);
        ex = ex.concat(wordExercises(sec, U.shuffle(ws), les, Math.max(10, Math.min(16, ws.length * 2))));
        if (ws.length >= 3) ex.splice(notes.length + 4, 0, G.matchWords(U.sample(ws, 5)));
        break;
      }
      case 'sunmoon': {
        ex = notes.slice();
        const ws = (les.focus && les.focus.length ? les.focus : sec.words.filter(w => w.req.feats.has('article')));
        U.sample(ws, 6).forEach(w => ex.push(G.sunMoonType(w)));
        U.sample(ws, 6).forEach(w => ex.push(G.sunMoonRead(w)));
        ex = ex.slice(0, notes.length).concat(U.shuffle(ex.slice(notes.length)));
        break;
      }
      case 'phrases': {
        ex = notes.slice();
        const ws = sec.phrases.slice(les.range[0], les.range[1]);
        les.knownWords = les.knownWords.concat(sec.phrases.slice(0, les.range[1]));
        ex = ex.concat(wordExercises(sec, U.shuffle(ws), les, 14));
        ex.splice(notes.length + 5, 0, G.matchWords(U.sample(ws, 5)));
        break;
      }
      case 'review':
      case 'test': {
        const isTest = les.kind === 'test';
        const n = isTest ? 15 : 14;
        const letterIds = (isTest && unitLetters.length ? unitLetters : knownArr).map(c => 'L:' + c);
        const wordsSrc = isTest ? (les.unit.focusWords.length ? les.unit.focusWords : les.knownWords) : les.knownWords;
        let phr = [];
        if (les.unit.lessons.some(l => l.kind === 'phrases')) phr = sec.phrases;
        const wordIds = wordsSrc.concat(phr).map(wid);
        const pickL = weakFrom(letterIds, letterIds.length ? Math.ceil(n * (wordIds.length ? 0.4 : 1)) : 0);
        const pickW = weakFrom(wordIds, n - pickL.length);
        const pool = les.knownWords.concat(phr);
        const lookup = {}; pool.forEach(w => lookup[wid(w)] = w);
        for (const id of pickL) {
          const ch = id.slice(2), r = Math.random();
          ex.push(r < 0.35 ? G.letterSound(sec, ch, known) : r < 0.6 ? G.formLetter(sec, ch, known) : r < 0.8 ? G.findForm(sec, ch, known) : G.soundLetter(sec, ch, known));
        }
        if (pickW.length) {
          ex = ex.concat(wordExercises(sec, pickW.map(id => lookup[id]).filter(Boolean), Object.assign({}, les, { knownWords: pool }), pickW.length));
        }
        ex = U.shuffle(ex.filter(Boolean));
        if (pickL.length >= 4) ex.splice(4, 0, G.matchLetters(sec, U.sample(pickL.map(id => id.slice(2)), 4)));
        if (pickW.length >= 4 && !isTest) ex.splice(9, 0, G.matchWords(U.sample(pickW.map(id => lookup[id]).filter(Boolean), 5)));
        break;
      }
    }
    return ex.filter(Boolean);
  };

  C._h = { wordExercises, choice, otherWords, wid, weakFrom };

  // ---------- тренировки вне пути ----------
  function allLearned() {
    const done = C.lessons.filter(l => AL.state.isDone(l.id));
    const sec = C.sections[0];
    const letters = new Set(), words = [], sents = [];
    for (const l of done) {
      (l.sents || []).forEach(x => sents.push(x)); l.knownLetters.forEach(x => letters.add(x)); (l.focus || []).forEach(w => words.push(w)); if (l.kind === 'phrases') words.push(...sec.phrases.slice(l.range[0], l.range[1])); }
    return { sec, letters, words: U.uniqBy(words, w => w.ar), sents: U.uniqBy(sents, x => x.ar) };
  }
  C.learned = allLearned;

  C.practice = function (mode) {
    const { sec, letters, words, sents } = allLearned();
    const known = letters;
    if (!letters.size) return null;
    const pool = words.length >= 4 ? words : sec.words;
    const fake = { section: sec, knownLetters: known, knownWords: pool };
    let ex = [];
    const L = Array.from(letters);
    if (mode === 'forms') {
      for (let i = 0; i < 12; i++) { const ch = U.pick(L); ex.push(i % 2 ? G.findForm(sec, ch, known) : G.formLetter(sec, ch, known)); }
      ex.splice(6, 0, G.matchForms(sec, U.sample(L, 4)));
    } else if (mode === 'listen') {
      if (!canListen()) return null;
      const ws = U.sample(words.length ? words : [], 10);
      ws.forEach(w => ex.push(G.listenWord(w, pool)));
      if (ex.length < 10) for (let i = ex.length; i < 10; i++) ex.push(G.listenSyllable(sec, U.pick(L.filter(c => c !== 'ا')), known, new Set(['long', 'sukun'])));
    } else if (mode === 'words') {
      if (words.length < 4) return null;
      ex = wordExercises(sec, U.sample(words, 12), fake, 12);
      ex.splice(5, 0, G.matchWords(U.sample(words, 5)));
    } else {
      // слабые места: SRS
      const due = AL.state.dueItems();
      let ids = due.length >= 6 ? due.slice(0, 12) : U.uniq(due.concat(AL.state.weakItems(12))).slice(0, 12);
      if (ids.length < 6) ids = ids.concat(L.map(c => 'L:' + c)).slice(0, 12);
      const lookup = {}; words.concat(sec.phrases).forEach(w => lookup[wid(w)] = w);
      for (const id of ids) {
        if (id.startsWith('S:')) {
          const x = C.items[id]; if (!x) continue;
          const e = U.pick([G.sentChoose, G.sentRuAr, G.sentArRu])(x, sents.length >= 4 ? sents : (C.sections.find(s => s.kind === 'level') || {}).sentences || []);
          if (e) ex.push(e);
        } else if (id.startsWith('L:')) {
          const ch = id.slice(2); if (!sec.letterMap[ch]) continue;
          const r = Math.random();
          ex.push(r < 0.4 ? G.letterSound(sec, ch, known) : r < 0.7 ? G.formLetter(sec, ch, known) : G.soundLetter(sec, ch, known));
        } else {
          const w = lookup[id] || C.items[id]; if (!w) continue;
          ex = ex.concat(wordExercises(sec, [w], fake, 1));
        }
      }
      ex = U.shuffle(ex);
    }
    return ex.filter(Boolean);
  };

  // Вводный тест раздела: случайные буквы и слова всего раздела.
  C.placement = function (sec) {
    if (sec.kind === 'level') return C.placementLevel(sec);
    const last = sec.units[sec.units.length - 1].lessons.slice(-1)[0];
    const known = new Set(Object.keys(sec.letterMap));
    const ex = [];
    U.sample(Array.from(known), 10).forEach((ch, i) => ex.push(i % 3 === 0 ? G.formLetter(sec, ch, known) : i % 3 === 1 ? G.letterSound(sec, ch, known) : G.findForm(sec, ch, known)));
    U.sample(sec.words, 8).forEach((w, i) => ex.push(i % 2 ? G.wordRead(w, sec.words) : G.meaningWord(w, sec.words)));
    U.sample(sec.phrases, 2).forEach(w => ex.push(G.wordMeaning(w, sec.phrases, false)));
    return { ex: U.shuffle(ex), last };
  };
})(window.AL);
