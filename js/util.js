/* Общие утилиты + работа с арабским письмом (огласовки, формы букв, транскрипция). */
window.AL = window.AL || {};
(function (AL) {
  'use strict';

  // ---------- общие ----------
  const U = AL.util = {};
  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.el = function (tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return e;
  };
  U.shuffle = function (a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  U.pick = a => a[Math.floor(Math.random() * a.length)];
  U.sample = (a, n) => U.shuffle(a).slice(0, n);
  U.uniq = a => Array.from(new Set(a));
  U.uniqBy = (a, f) => { const s = new Set(); return a.filter(x => { const k = f(x); if (s.has(k)) return false; s.add(k); return true; }); };
  U.today = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };
  U.dayDiff = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
  U.plural = function (n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  };
  U.esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- арабский ----------
  const A = AL.ar = {};
  const FATHA = 'َ', DAMMA = 'ُ', KASRA = 'ِ', SUKUN = 'ْ', SHADDA = 'ّ',
    FATHATAN = 'ً', DAMMATAN = 'ٌ', KASRATAN = 'ٍ', DAGGER = 'ٰ', TATWEEL = 'ـ';
  A.marks = { FATHA, DAMMA, KASRA, SUKUN, SHADDA, FATHATAN, DAMMATAN, KASRATAN, DAGGER, TATWEEL };
  const MARK_RE = /[ً-ْٰ]/;
  A.isMark = ch => MARK_RE.test(ch);
  A.strip = s => s.replace(/[ً-ْٰـ]/g, '');
  A.isArabicLetter = ch => /[ء-يٱ]/.test(ch);

  // Буквы, которые не соединяются со следующей (левой) буквой.
  A.NONJOIN = new Set(['ا', 'أ', 'إ', 'آ', 'د', 'ذ', 'ر', 'ز', 'و', 'ؤ', 'ة', 'ى', 'ء']);
  A.form = function (letter, pos) {
    const nj = A.NONJOIN.has(letter);
    if (letter === 'ء') return letter;
    switch (pos) {
      case 'initial': return nj ? letter : letter + TATWEEL;
      case 'medial': return nj ? TATWEEL + letter : TATWEEL + letter + TATWEEL;
      case 'final': return TATWEEL + letter;
      default: return letter;
    }
  };
  A.FORM_NAMES = { isolated: 'отдельно', initial: 'в начале', medial: 'в середине', final: 'в конце' };

  // Базовые буквы слова (без огласовок), учитывая составные символы.
  A.letters = s => Array.from(A.strip(s)).filter(A.isArabicLetter);

  // Разбор на кластеры «буква + огласовки».
  function clusters(s) {
    const out = [];
    for (const ch of s.normalize('NFC')) {
      if (A.isMark(ch) && out.length && A.isArabicLetter(out[out.length - 1].b)) out[out.length - 1].m += ch;
      else if (ch === TATWEEL) continue;
      else out.push({ b: ch, m: '' });
    }
    return out;
  }
  A.clusters = clusters;

  function vowelOf(m) {
    if (m.includes(FATHATAN)) return 'an';
    if (m.includes(DAMMATAN)) return 'un';
    if (m.includes(KASRATAN)) return 'in';
    if (m.includes(FATHA)) return 'a';
    if (m.includes(DAMMA)) return 'u';
    if (m.includes(KASRA)) return 'i';
    if (m.includes(DAGGER)) return 'A';
    if (m.includes(SUKUN)) return '0';
    return '';
  }

  const CONS = {
    lat: {
      'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'ḥ', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z',
      'س': 's', 'ش': 'sh', 'ص': 'ṣ', 'ض': 'ḍ', 'ط': 'ṭ', 'ظ': 'ẓ', 'ع': 'ʿ', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
      'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y',
      'ء': 'ʾ', 'أ': 'ʾ', 'إ': 'ʾ', 'ؤ': 'ʾ', 'ئ': 'ʾ', 'ة': 't'
    },
    cyr: {
      'ب': 'б', 'ت': 'т', 'ث': 'с̱', 'ج': 'дж', 'ح': 'х̣', 'خ': 'х', 'د': 'д', 'ذ': 'з̱', 'ر': 'р', 'ز': 'з',
      'س': 'с', 'ش': 'ш', 'ص': 'с̣', 'ض': 'д̣', 'ط': 'т̣', 'ظ': 'з̣', 'ع': 'ʿ', 'غ': 'г', 'ф': 'ф', 'ف': 'ф', 'ق': 'к̣',
      'ك': 'к', 'ل': 'л', 'م': 'м', 'ن': 'н', 'ه': 'һ', 'و': 'в', 'ي': 'й',
      'ء': 'ʾ', 'أ': 'ʾ', 'إ': 'ʾ', 'ؤ': 'ʾ', 'ئ': 'ʾ', 'ة': 'т'
    }
  };
  const VOW = {
    lat: { a: 'a', i: 'i', u: 'u', A: 'ā', I: 'ī', U: 'ū', an: 'an', un: 'un', in: 'in' },
    cyr: { a: 'а', i: 'и', u: 'у', A: 'а̄', I: 'ӣ', U: 'ӯ', an: 'ан', un: 'ун', in: 'ин' }
  };
  A.CONS = CONS;
  const PUNCT = { '،': ',', '؟': '?', '؛': ';', '٫': ',', '٬': ' ' };
  for (let d = 0; d < 10; d++) PUNCT[String.fromCharCode(0x0660 + d)] = String(d);   // арабские цифры

  /**
   * Транскрипция огласованного арабского текста.
   * scheme: 'lat' (научная латиница) или 'cyr' (кириллица по Крачковскому, упрощённо).
   */
  A.translit = function (s, scheme) {
    scheme = scheme === 'lat' ? 'lat' : 'cyr';
    const T = CONS[scheme], V = VOW[scheme];
    const C = clusters(s);
    let out = '', wordStart = true, skipShadda = false, wsIdx = -1;
    const plain = c => c && (c.m === '' || c.m === SUKUN);

    for (let i = 0; i < C.length; i++) {
      const c = C[i], b = c.b, m = c.m, nx = C[i + 1], nx2 = C[i + 2];
      if (!A.isArabicLetter(b)) { out += PUNCT[b] != null ? PUNCT[b] : b; wordStart = true; continue; }
      const atStart = wordStart; wordStart = false;
      if (atStart) wsIdx = i;
      let v = vowelOf(m);
      const sh = m.includes(SHADDA);

      // Алиф (в т.ч. алиф-васла)
      if (b === 'ا' || b === 'ٱ') {
        // алиф-васла сразу после однобуквенной приставки: وَالْ… بِالْ… وَابْنٌ
        const afterProclitic = !atStart && i === wsIdx + 1 && 'وفبكل'.includes(C[i - 1].b) &&
          /[\u064E\u0650]/.test(C[i - 1].m) && !/[\u064B-\u0650]/.test(m);
        if (atStart || afterProclitic) {
          // после гласной алиф-васла не читается (ṣabāḥu l-khayr, wa-l-…)
          const elide = afterProclitic || (/[aiuāīūаиу\u0304ӣӯ] $/.test(out) && !/[\u064E\u064F\u0650]/.test(m));
          // артикль ال (у лама может быть касра перед алифом-васлой: الِاثْنَيْنِ)
          if (nx && nx.b === 'ل' && !/[\u064E\u064F]/.test(nx.m) && nx2 && A.isArabicLetter(nx2.b)) {
            const a = elide ? '' : V.a;
            if (nx.m.includes(KASRA) && (nx2.b === 'ا' || nx2.b === 'ٱ')) {
              out += a + (scheme === 'cyr' ? 'ль-и' : 'l-i');
              i += 2; continue;
            }
            if (nx2.m.includes(SHADDA)) {               // солнечная буква
              out += a + T[nx2.b] + '-';
              skipShadda = true;
            } else {                                     // лунная буква
              out += a + (scheme === 'cyr' ? 'ль-' : 'l-');
            }
            i += 1; continue;
          }
          if (elide) continue;
          out += (v && v.length === 1 && v !== '0' && v !== 'A') ? V[v] : V.i;
          continue;
        }
        out += (v === 'an') ? V.an : V.A;
        continue;
      }
      if (b === 'آ') { out += (atStart ? '' : T['ء']) + V.A; continue; }
      if (b === 'ى') { out += (v === 'an') ? V.an : V.A; continue; }
      if (b === 'ة') {
        if (v && v !== '0') { out += T['ة']; }
        else continue; // в паузе: -а уже произнесена огласовкой предыдущей буквы
      }
      else {
        // согласная
        let cons = T[b];
        if (cons == null) { out += b; continue; }
        if (atStart && (b === 'أ' || b === 'إ' || b === 'ء')) {
          cons = '';
          if (!v) v = (b === 'إ') ? 'i' : 'a';
        }
        if (scheme === 'cyr') {
          if (b === 'و' && (v === '' || v === '0') && !sh) cons = 'у';
          if (b === 'ل' && (v === '0' || v === '') && !sh && nx && A.isArabicLetter(nx.b)) cons = 'ль';
        }
        // -iyy в конце слова в паузе читается как -ī (كُرْسِيّ → kursī)
        if (b === 'ي' && sh && (v === '' || v === '0') && !(nx && A.isArabicLetter(nx.b)) && out.endsWith(V.i)) {
          out = out.slice(0, -V.i.length) + V.I; continue;
        }
        if (sh && !skipShadda) cons = cons + cons;
        skipShadda = false;
        out += cons;
      }

      // гласная (с поглощением букв долготы)
      // приставка + алиф-васла (وَالْ… فَاسْتَ… وَابْنٌ) — это не долгое ā
      const n3 = C[i + 3];
      const waslNext = i === wsIdx && 'وفبكل'.includes(b) && nx && nx.b === 'ا' && nx.m === '' && nx2 && A.isArabicLetter(nx2.b) &&
        (nx2.m.includes(SUKUN) || (nx2.b === 'ل' && n3 && (n3.m.includes(SHADDA) || (nx2.m.includes(KASRA) && n3.b === 'ا'))));
      if (waslNext && v && v !== '0') { out += V[v]; continue; }
      if (v === 'a' && plain(nx) && (nx.b === 'ا' || nx.b === 'ى')) { out += V.A; i++; continue; }
      if (v === 'u' && plain(nx) && nx.b === 'و') { out += V.U; i++; continue; }
      if (v === 'i' && plain(nx) && nx.b === 'ي') { out += V.I; i++; continue; }
      if (v === 'an' && plain(nx) && (nx.b === 'ا' || nx.b === 'ى')) { out += V.an; i++; continue; }
      if (v === '' && nx && nx.b === 'ا' && nx.m === '') { out += V.A; i++; continue; }
      if (v && v !== '0') out += V[v];
    }
    return out;
  };

  // Солнечные буквы
  A.SUN = new Set(['ت', 'ث', 'د', 'ذ', 'ر', 'ز', 'س', 'ش', 'ص', 'ض', 'ط', 'ظ', 'ل', 'ن']);

  // Похожие по начертанию буквы — для дистракторов.
  A.FAMILIES = [['ب', 'ت', 'ث', 'ن', 'ي'], ['ج', 'ح', 'خ'], ['د', 'ذ'], ['ر', 'ز'], ['س', 'ش'], ['ص', 'ض'],
    ['ط', 'ظ'], ['ع', 'غ'], ['ف', 'ق'], ['ك', 'ل'], ['م', 'ه'], ['و', 'ر'], ['ا', 'ل']];
  A.similar = function (ch) {
    const r = [];
    for (const f of A.FAMILIES) if (f.includes(ch)) for (const x of f) if (x !== ch) r.push(x);
    return U.uniq(r);
  };
})(window.AL);
