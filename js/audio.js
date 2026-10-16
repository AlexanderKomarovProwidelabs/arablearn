/* Озвучка (Web Speech API) и звуковые эффекты (WebAudio, без файлов). */
(function (AL) {
  'use strict';

  const tts = AL.tts = {
    voice: null,
    voices: [],
    supported: 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined',
    listeners: [],
  };

  function score(v) {
    let s = 0;
    if (/^ar[-_]SA/i.test(v.lang)) s += 3;
    else if (/^ar[-_](EG|AE|JO|KW|QA|BH|LB)/i.test(v.lang)) s += 2;
    else if (/^ar/i.test(v.lang)) s += 1;
    if (/google|neural|natural|premium|enhanced/i.test(v.name)) s += 2;
    if (v.localService) s += 1;
    return s;
  }

  tts.load = function () {
    if (!tts.supported) return;
    const all = speechSynthesis.getVoices() || [];
    tts.voices = all.filter(v => /^ar/i.test(v.lang)).sort((a, b) => score(b) - score(a));
    const pref = AL.state && AL.state.s.settings.voice;
    tts.voice = tts.voices.find(v => v.name === pref) || tts.voices[0] || null;
    tts.listeners.forEach(f => f());
  };

  // Есть ли арабский голос (или мы ещё не знаем — тогда пробуем с lang=ar).
  tts.available = function () {
    if (!tts.supported) return false;
    if (AL.state && !AL.state.s.settings.tts) return false;
    return !!tts.voice;
  };

  tts.speak = function (text, opts) {
    opts = opts || {};
    if (!tts.supported || !text) return;
    if (AL.state && !AL.state.s.settings.tts) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = tts.voice ? tts.voice.lang : 'ar-SA';
      if (tts.voice) u.voice = tts.voice;
      const base = (AL.state && AL.state.s.settings.rate) || 0.8;
      u.rate = opts.slow ? Math.max(0.4, base * 0.6) : base;
      u.pitch = 1;
      if (opts.onend) u.onend = opts.onend;
      speechSynthesis.speak(u);
    } catch (e) { /* молча */ }
  };

  if (tts.supported) {
    tts.load();
    speechSynthesis.onvoiceschanged = tts.load;
    // некоторые браузеры отдают голоса с задержкой
    setTimeout(tts.load, 300);
    setTimeout(tts.load, 1500);
  }

  // ---------- звуковые эффекты ----------
  const sfx = AL.sfx = {};
  let ctx = null;
  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, start, dur, type, vol) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const t0 = c.currentTime + start;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  const on = () => !AL.state || AL.state.s.settings.sfx;
  sfx.correct = () => { if (!on()) return; tone(660, 0, 0.12, 'sine'); tone(990, 0.09, 0.22, 'sine'); };
  sfx.wrong = () => { if (!on()) return; tone(220, 0, 0.18, 'square', 0.08); tone(180, 0.12, 0.25, 'square', 0.08); };
  sfx.tap = () => { if (!on()) return; tone(520, 0, 0.05, 'triangle', 0.08); };
  sfx.finish = () => {
    if (!on()) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, 'triangle', 0.15));
  };
  sfx.combo = () => { if (!on()) return; tone(880, 0, 0.08); tone(1175, 0.07, 0.08); tone(1568, 0.14, 0.18); };
})(window.AL);
