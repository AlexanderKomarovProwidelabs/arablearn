/* Разделы-уровни (A1–B2): словарь, грамматика, предложения, чтение.
   Схема данных — см. PLAN.md. */
(function (AL) {
  'use strict';
  const U = AL.util, A = AL.ar, C = AL.course, G = C.gen;
  const ALL_FEATS = ['vowels', 'long', 'sukun', 'shadda', 'ta', 'tanween', 'hamza', 'article'];
  const sid = s => 'S:' + s.ar;
  const tr = s => AL.state.tr(s);

  // ---------- токенизация ----------
  const tokAr = s => s.replace(/[؟?،,.!:؛;«»"()]/g, ' ').trim().split(/\s+/).filter(Boolean);
  const tokRu = s => s.replace(/[.,!?«»"—:;()…]/g, ' ').toLowerCase().trim().split(/\s+/).filter(Boolean);
  C.tokAr = tokAr; C.tokRu = tokRu;
  const MAX_BUILD = 10;

  // ---------- построение ----------
  function distribute(items, lessons, key, explicitKey, byAr) {
    const taken = new Set();
    // явные списки
    for (const l of lessons) {
      if (Array.isArray(l[explicitKey])) {
        l[key] = l[explicitKey].map(a => byAr.get(a)).filter(Boolean);
        l[key].forEach(x => taken.add(x));
      }
    }
    const auto = lessons.filter(l => !Array.isArray(l[explicitKey]));
    const rest = items.filter(x => !taken.has(x));
    auto.forEach((l, i) => {
      const a = Math.floor(i * rest.length / auto.length), b = Math.floor((i + 1) * rest.length / auto.length);
      l[key] = rest.slice(a, b);
    });
  }

  C.buildLevel = function (sec) {
    const script = C.sections.find(s => s.id === 'script');
    sec.letterMap = script ? script.letterMap : {};
    sec.notes = sec.notes || {};
    sec.words = []; sec.sentences = []; sec.drills = [];
    sec.phrases = [];
    const allLetters = new Set(Object.keys(sec.letterMap));
    const last = C.lessons[C.lessons.length - 1];
    const known = last ? last.knownWords.slice() : [];
    const knownS = last && last.knownSents ? last.knownSents.slice() : [];
    sec.units.forEach((u, ui) => {
      u.section = sec; u.index = ui; u.letters = [];
      C.unitsById[u.id] = u;
      u.vocab = (u.vocab || []).map(v => Object.assign(v, { unitId: u.id }));
      u.sentences = (u.sentences || []).map(s => Object.assign(s, { unitId: u.id }));
      u.focusWords = u.vocab;
      u.drills = [];
      sec.words.push(...u.vocab); sec.sentences.push(...u.sentences);
      if (!u.lessons.some(l => l.kind === 'test')) u.lessons.push({ kind: 'test', title: 'Испытание юнита' });
      const vmap = new Map(u.vocab.map(v => [v.ar, v]));
      const smap = new Map(u.sentences.map(s => [s.ar, s]));
      distribute(u.vocab, u.lessons.filter(l => l.kind === 'vocab'), 'focus', 'words', vmap);
      distribute(u.sentences, u.lessons.filter(l => l.kind === 'sentences'), 'sents', 'sentences', smap);
      u.lessons.forEach((les, li) => {
        les.id = u.id + '-' + (li + 1);
        les.unit = u; les.section = sec; les.index = li;
        les.knownLetters = allLetters; les.knownFeats = new Set(ALL_FEATS);
        if (les.kind === 'grammar' || les.kind === 'test' || les.kind === 'review') { /* ok */ }
        (les.drills || []).forEach(d => { d.unitId = u.id; u.drills.push(d); sec.drills.push(d); });
        (les.focus || []).forEach(w => known.push(w));
        (les.sents || []).forEach(s => knownS.push(s));
        // слова юнита доступны как дистракторы с первого урока
        les.knownWords = U.uniqBy(known.concat(u.vocab), w => w.ar);
        les.knownSents = U.uniqBy(knownS.concat(u.sentences), s => s.ar);
        C.lessons.push(les); C.byId[les.id] = les;
      });
      // после юнита — всё его содержимое считается пройденным для следующих
      u.vocab.forEach(w => known.push(w));
      u.sentences.forEach(s => knownS.push(s));
    });
  };

  // ---------- упражнения ----------
  G.wordCard = w => ({ type: 'word', word: w, item: 'W:' + w.ar });

  function otherSents(pool, s, n, key) {
    return U.sample(U.uniqBy(pool.filter(x => x.ar !== s.ar && key(x) !== key(s)), key), n);
  }
  G.sentArRu = function (s, pool) {
    const toks = tokRu(s.ru);
    if (toks.length > MAX_BUILD) return G.sentChoose(s, pool);
    const extra = U.uniq(otherSents(pool, s, 4, x => x.ru).flatMap(x => tokRu(x.ru))).filter(t => !toks.includes(t));
    return { type: 'build', lang: 'ru', q: 'Переведите', prompt: { ar: s.ar, sub: AL.state.showTranslit() ? tr(s.ar) : '', audio: s.ar },
      tiles: U.shuffle(toks.concat(U.sample(extra, Math.min(3, extra.length)))), answer: toks, join: ' ', item: sid(s), say: s.ar, full: s.ru };
  };
  G.sentRuAr = function (s, pool) {
    const toks = tokAr(s.ar);
    if (toks.length > MAX_BUILD) return G.sentChooseAr(s, pool);
    const extra = U.uniq(otherSents(pool, s, 4, x => x.ar).flatMap(x => tokAr(x.ar))).filter(t => !toks.includes(t) && !toks.map(A.strip).includes(A.strip(t)));
    return { type: 'build', q: 'Переведите на арабский', prompt: { text: s.ru },
      tiles: U.shuffle(toks.concat(U.sample(extra, Math.min(3, extra.length)))), answer: toks, join: ' ', item: sid(s), say: s.ar, full: s.ar, explain: AL.state.showTranslit() ? tr(s.ar) : '' };
  };
  G.sentListen = function (s, pool) {
    const toks = tokAr(s.ar);
    if (toks.length > MAX_BUILD || !AL.tts.available()) return null;
    const extra = U.uniq(otherSents(pool, s, 3, x => x.ar).flatMap(x => tokAr(x.ar))).filter(t => !toks.includes(t));
    return { type: 'build', q: 'Запишите, что услышали', prompt: { audio: s.ar, autoplay: true },
      tiles: U.shuffle(toks.concat(U.sample(extra, Math.min(3, extra.length)))), answer: toks, join: ' ', item: sid(s), say: s.ar, full: s.ar, explain: s.ru, listen: true };
  };
  G.sentChoose = function (s, pool) {
    const wr = otherSents(pool, s, 3, x => x.ru).map(x => ({ text: x.ru }));
    if (wr.length < 1) return null;
    const opts = U.shuffle([{ text: s.ru }].concat(wr));
    return { type: 'choice', q: 'Что это значит?', prompt: { ar: s.ar, sub: AL.state.showTranslit() ? tr(s.ar) : '', audio: s.ar },
      options: opts, answer: opts.findIndex(o => o.text === s.ru), item: sid(s), say: s.ar };
  };
  G.sentChooseAr = function (s, pool) {
    const wr = otherSents(pool, s, 3, x => x.ar).map(x => ({ ar: x.ar }));
    if (wr.length < 1) return null;
    const opts = U.shuffle([{ ar: s.ar }].concat(wr));
    return { type: 'choice', q: 'Как сказать по-арабски?', prompt: { text: '«' + s.ru + '»' },
      options: opts, answer: opts.findIndex(o => o.ar === s.ar), item: sid(s), say: s.ar, small: true };
  };
  G.drill = function (d) {
    d.ar = d.ar || '';
    const ruOpts = d.optionsRu === true;
    const opts = d.options.map((o, i) => ({ i, o: ruOpts ? { text: o } : { ar: o } }));
    const sh = U.shuffle(opts);
    const full = d.ar.includes('___') && !ruOpts ? d.ar.replace('___', d.options[d.answer]) : d.ar;
    return { type: 'choice', q: d.q || 'Выберите правильный вариант', prompt: d.ar ? { ar: d.ar.replace('___', '_____'), sub: d.ru || '' } : { text: d.ru || '' },
      options: sh.map(x => x.o), answer: sh.findIndex(x => x.i === d.answer), say: full, explain: d.explain || '', small: true };
  };
  G.reading = (text) => ({ type: 'reading', text });
  G.question = function (q) {
    const ar = q.optionsAr === true;
    const opts = q.options.map((o, i) => ({ i, o: ar ? { ar: o } : { text: o } }));
    const sh = U.shuffle(opts);
    return { type: 'choice', q: q.q, prompt: q.ar ? { ar: q.ar } : null, options: sh.map(x => x.o), answer: sh.findIndex(x => x.i === q.answer), explain: q.explain || '', small: true };
  };

  function sentenceExercises(ss, pool, n) {
    const out = [];
    const kinds = ['arru', 'ruar', 'choose', 'listen'];
    let k = 0;
    for (let i = 0; out.length < n && i < n * 3; i++) {
      const s = ss[i % ss.length];
      if (!s) break;
      const kind = kinds[k++ % kinds.length];
      const e = kind === 'arru' ? G.sentArRu(s, pool) : kind === 'ruar' ? G.sentRuAr(s, pool) : kind === 'listen' ? G.sentListen(s, pool) : G.sentChoose(s, pool);
      if (e) out.push(e);
    }
    return out;
  }
  function wordsEx(sec, ws, les, n) {
    if (!ws.length) return [];
    const ex = C._h.wordExercises(sec, ws, les, n);
    return ex;
  }

  C.generateLevel = function (les) {
    const sec = les.section, u = les.unit;
    const notes = (les.notes || []).filter(n => sec.notes[n]).map(n => G.note(sec, n));
    const sPool = les.knownSents.length >= 4 ? les.knownSents : sec.sentences;
    let ex = [];
    switch (les.kind) {
      case 'vocab': {
        const ws = les.focus || [];
        const fresh = !AL.state.isDone(les.id);
        const intro = fresh ? ws.map(G.wordCard) : [];
        // карточка → сразу пара заданий на это слово, потом смешанная практика
        const body = [];
        ws.forEach((w, i) => {
          if (intro[i]) body.push(intro[i]);
          if (i % 2 === 1) body.push(...wordsEx(sec, U.shuffle([ws[i], ws[i - 1]]), les, 2));
        });
        const mix = wordsEx(sec, U.shuffle(ws), les, Math.max(6, Math.min(12, ws.length * 1.5 | 0)));
        if (ws.length >= 4) mix.splice(3, 0, G.matchWords(U.sample(ws, 5)));
        ex = notes.concat(body, mix);
        break;
      }
      case 'grammar': {
        const ds = U.shuffle(les.drills || []);
        ex = notes.concat(ds.slice(0, 14).map(G.drill));
        const ss = U.sample(u.sentences, 3);
        ex = ex.concat(sentenceExercises(ss, sPool, 3));
        break;
      }
      case 'sentences': {
        const ss = les.sents && les.sents.length ? les.sents : U.sample(u.sentences, 8);
        ex = notes.concat(sentenceExercises(U.shuffle(ss), sPool, Math.max(8, Math.min(14, ss.length * 2))));
        if (u.vocab.length >= 4) ex.splice(notes.length + 4, 0, G.matchWords(U.sample(u.vocab, 5)));
        break;
      }
      case 'reading': {
        ex = notes.slice();
        if (les.text) ex.push(G.reading(les.text));
        (les.questions || []).forEach(q => ex.push(G.question(q)));
        // фразы из текста — на сборку
        const lines = (les.text && les.text.lines || []).filter(l => tokAr(l.ar).length <= MAX_BUILD && l.ru);
        U.sample(lines, 3).forEach(l => { const e = U.pick([G.sentArRu, G.sentRuAr])(l, sPool.concat(lines)); if (e) ex.push(e); });
        break;
      }
      case 'review':
      case 'test': {
        const isTest = les.kind === 'test';
        const W = isTest ? u.vocab : les.knownWords.filter(w => w.unitId);
        const S = isTest ? u.sentences : les.knownSents;
        const D = isTest ? u.drills : sec.drills.filter(d => C.unitsById[d.unitId].index <= u.index);
        const items = AL.state.s.items;
        const weak = arr => U.shuffle(arr).sort((a, b) => ((items[a.id] || { s: 0 }).s - (items[b.id] || { s: 0 }).s));
        const pickW = weak(W.map(w => ({ id: 'W:' + w.ar, w }))).slice(0, 5).map(x => x.w);
        const pickS = weak(S.map(s => ({ id: sid(s), s }))).slice(0, 6).map(x => x.s);
        ex = wordsEx(sec, pickW, les, pickW.length)
          .concat(sentenceExercises(pickS, sPool, pickS.length))
          .concat(U.sample(D, 4).map(G.drill));
        ex = U.shuffle(ex);
        if (!isTest && pickW.length >= 4) ex.splice(4, 0, G.matchWords(U.sample(W, 5)));
        break;
      }
      default:
        ex = notes;
    }
    return ex.filter(Boolean);
  };

  C.placementLevel = function (sec) {
    const last = sec.units[sec.units.length - 1].lessons.slice(-1)[0];
    const fake = { section: sec, knownLetters: new Set(Object.keys(sec.letterMap)), knownWords: sec.words };
    let ex = C._h.wordExercises(sec, U.sample(sec.words, 7), fake, 7)
      .concat(sentenceExercises(U.sample(sec.sentences, 8), sec.sentences, 8))
      .concat(U.sample(sec.drills, 5).map(G.drill));
    return { ex: U.shuffle(ex.filter(Boolean)), last };
  };
  C.sentenceExercises = sentenceExercises;
})(window.AL);
