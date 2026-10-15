/* OG.Audio (phần nhạc nền) — sequencer theo nhịp + dữ liệu các bản nhạc tổng hợp.
 * Chủ sở hữu: agent Audio (src/audio/). Load SAU src/audio/audio.js.
 *
 * Mỗi bản nhạc gồm: giai điệu (lead), bass (sinh tự động từ hợp âm theo "style"),
 * pad hợp âm, arpeggio (vòng lặp thứ 2) và trống (kick/snare/hat). Lưới 16 bước / ô nhịp.
 *
 * Cú pháp giai điệu: mỗi ô nhịp là 1 chuỗi 16 token cách nhau bởi dấu cách:
 *   'C5', 'F#4', 'Bb3' = nốt;  '.' = nghỉ;  '-' = ngân nốt trước thêm 1 bước.
 * Trống: chuỗi 16 ký tự cho 1 ô nhịp (lặp lại mỗi ô): 'x' = đánh, 'X' = đánh mạnh, '.' = nghỉ.
 * Hợp âm: tên như 'C', 'Am', 'F#m', 'Bb' — 1 hợp âm / ô nhịp.
 *
 * Bản nhạc có loop:true sẽ phát 2 lượt (lượt 2 thêm arpeggio) rồi lặp lại. loop:false = jingle.
 * Bản nhạc mới: OG.Audio.tracks.<id> = {...}; định nghĩa thêm sau khi file này load đều được. */
(function () {
  'use strict';
  var OG = (window.OG = window.OG || {});
  OG.Audio = OG.Audio || {};

  // ---------------------------------------------------------------------------
  // Dữ liệu bản nhạc
  // ---------------------------------------------------------------------------
  var TRACKS = {
    // Menu chính — Đô trưởng, tươi vui, nhún nhảy.
    menu: {
      bpm: 120, loop: true, swing: 0.08,
      lead: { wave: 'square', vol: 0.085, cutoff: 3200 },
      bass: { wave: 'triangle', vol: 0.2, style: 'bounce' },
      pad: { wave: 'triangle', vol: 0.035 },
      chords: ['C', 'Am', 'F', 'G'],
      melody: [
        'E5 . G5 . C6 - . G5 . E5 . G5 - - . .',
        'A5 - . G5 . E5 . C5 - . D5 . E5 - . .',
        'F5 . A5 . C6 . A5 . G5 . F5 . E5 - D5 .',
        'D5 . G4 . B4 . D5 . G5 - - - . . . .'
      ],
      drums: { kick: 'x.......x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }
    },

    // Bản đồ thế giới — Fa trưởng, nhịp vừa, cảm giác phiêu lưu nhẹ nhàng.
    worldmap: {
      bpm: 100, loop: true, swing: 0.12,
      lead: { wave: 'triangle', vol: 0.13, cutoff: 4000 },
      bass: { wave: 'triangle', vol: 0.2, style: 'walk' },
      pad: { wave: 'sine', vol: 0.05 },
      chords: ['F', 'Dm', 'Bb', 'C'],
      melody: [
        'C5 . F5 . A5 - G5 . F5 . C5 . D5 - . .',
        'D5 . F5 . A5 - . G5 F5 - D5 . C5 - . .',
        'Bb4 . D5 . F5 . Bb5 - A5 . G5 . F5 - . .',
        'E5 . G5 . C6 - . . Bb5 . A5 . G5 - - .'
      ],
      drums: { kick: 'x.......x.......', snare: '............x...', hat: '..x...x...x...x.' }
    },

    // Màn 1 — Nhà bếp: Sol trưởng, nhanh, vui nhộn (cũng dùng làm 'level' mặc định).
    kitchen: {
      bpm: 140, loop: true,
      lead: { wave: 'square', vol: 0.08, cutoff: 3000 },
      bass: { wave: 'square', vol: 0.11, style: 'bounce', cutoff: 900 },
      pad: { wave: 'triangle', vol: 0.03 },
      chords: ['G', 'Em', 'C', 'D'],
      melody: [
        'G5 . D5 G5 . B5 . G5 A5 . F#5 . D5 . . .',
        'E5 . B4 E5 . G5 . E5 F#5 . E5 . D5 . B4 .',
        'C5 . E5 G5 . C6 . B5 A5 . G5 . E5 . G5 .',
        'A5 . F#5 . D5 . F#5 . A5 . . D6 - - . .'
      ],
      drums: { kick: 'x.....x.x.......', snare: '....x.......x..x', hat: 'x.xxx.xxx.xxx.xx' }
    },

    // Màn 2 — Khu vườn: Rê trưởng, mượt mà, đồng quê.
    garden: {
      bpm: 112, loop: true, swing: 0.1,
      lead: { wave: 'triangle', vol: 0.14, cutoff: 5000 },
      bass: { wave: 'triangle', vol: 0.2, style: 'walk' },
      pad: { wave: 'sine', vol: 0.05 },
      chords: ['D', 'G', 'Bm', 'A'],
      melody: [
        'F#5 - A5 . D6 - A5 . F#5 - E5 . D5 - . .',
        'G5 - B5 . D6 - B5 . G5 - A5 . B5 - . .',
        'F#5 - D5 . B4 - D5 . F#5 - G5 . F#5 - . .',
        'E5 - C#5 . A4 - C#5 . E5 - . . A5 - - .'
      ],
      drums: { kick: 'x.......x..x....', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.' }
    },

    // Màn 3 — Mái nhà: Mi thứ, rất nhanh, rượt đuổi.
    roof: {
      bpm: 150, loop: true,
      lead: { wave: 'square', vol: 0.075, cutoff: 3500 },
      bass: { wave: 'sawtooth', vol: 0.09, style: 'drive', cutoff: 800 },
      pad: { wave: 'triangle', vol: 0.03 },
      chords: ['Em', 'C', 'D', 'B'],
      melody: [
        'E5 . E5 G5 . E5 B5 . A5 . G5 . F#5 . G5 .',
        'E5 . E5 G5 . E5 C6 . B5 . A5 . G5 . E5 .',
        'D5 . F#5 A5 . D6 . A5 F#5 . D5 . F#5 . A5 .',
        'B5 . A5 . G5 . F#5 . D#5 - - . B4 - . .'
      ],
      drums: { kick: 'x...x...x...x...', snare: '....x.......x.x.', hat: 'xxxxxxxxxxxxxxxx' }
    },

    // Màn 4 — Hang ổ gián: Rê thứ, rờn rợn, nửa cung chromatic.
    lair: {
      bpm: 118, loop: true,
      lead: { wave: 'triangle', vol: 0.13, cutoff: 2500, vib: 18 },
      bass: { wave: 'sawtooth', vol: 0.1, style: 'spooky', cutoff: 600 },
      pad: { wave: 'sawtooth', vol: 0.02, cutoff: 900 },
      chords: ['Dm', 'Bb', 'Gm', 'A'],
      melody: [
        'D5 . . F5 . . A5 . G#5 . . A5 - . . .',
        'Bb4 . . D5 . . F5 . E5 . . F5 - . . .',
        'G4 . . Bb4 . . D5 . C#5 . . D5 - . . .',
        'E5 . . C#5 . . A4 . . . E5 . A5 - - .'
      ],
      drums: { kick: 'x.....x...x.....', snare: '........x.......', hat: '..x...x...x...x.' }
    },

    // Đánh trùm — Đô thứ, dồn dập, căng thẳng.
    boss: {
      bpm: 165, loop: true,
      lead: { wave: 'square', vol: 0.07, cutoff: 2600 },
      bass: { wave: 'sawtooth', vol: 0.1, style: 'gallop', cutoff: 700 },
      pad: { wave: 'sawtooth', vol: 0.025, cutoff: 1200 },
      chords: ['Cm', 'Cm', 'Ab', 'G'],
      melody: [
        'C5 C5 Eb5 C5 G5 C5 F#5 C5 G5 C5 Eb5 C5 D5 C5 B4 C5',
        'C5 C5 Eb5 C5 G5 C5 Ab5 C5 G5 C5 F5 C5 Eb5 C5 D5 C5',
        'Ab4 C5 Eb5 Ab5 G5 Eb5 C5 Eb5 Ab5 G5 F5 Eb5 C5 Eb5 F5 Eb5',
        'G4 B4 D5 G5 F5 D5 B4 D5 G5 - - - B5 - - -'
      ],
      drums: { kick: 'x..x..x.x..x..x.', snare: '....X.......X...', hat: 'x.x.x.x.x.x.x.x.' }
    },

    // Trùm cuối (bộ ba gián): giống 'boss' nhưng nhanh hơn và cao hơn 1 cung.
    bossFinal: { extend: 'boss', bpm: 178, transpose: 2 },

    // Jingle chiến thắng (không lặp).
    victory: {
      bpm: 150, loop: false, tail: 1.2,
      lead: { wave: 'square', vol: 0.09, cutoff: 4000 },
      bass: { wave: 'triangle', vol: 0.2, style: 'hits' },
      pad: { wave: 'triangle', vol: 0.05 },
      chords: ['C', 'G', 'C'],
      melody: [
        'C5 . E5 . G5 . C6 . . . G5 . C6 - - -',
        'A5 . B5 . D6 . B5 - G5 . B5 . D6 - - -',
        'E6 - - - - - - - C6 - - - - - - .'
      ],
      drums: { kick: 'x.......x...x...', snare: '....x.......x.xx', hat: 'x.x.x.x.x.x.x.x.', crashBar: [0, 2] }
    },

    // Jingle thua cuộc (không lặp) — đi xuống buồn bã.
    gameover: {
      bpm: 92, loop: false, tail: 1.5,
      lead: { wave: 'triangle', vol: 0.15, cutoff: 3000, vib: 20 },
      bass: { wave: 'triangle', vol: 0.18, style: 'long' },
      pad: { wave: 'sine', vol: 0.05 },
      chords: ['Cm', 'Fm', 'Cm'],
      melody: [
        'G4 . . . F#4 . . . F4 . . . E4 - - -',
        'Eb4 - - - D4 - - - Db4 - - - B3 - - -',
        'C4 - - - - - - - - - - - - - - .'
      ],
      drums: { kick: 'x...............', snare: '', hat: '' }
    }
  };

  // Tên thay thế: 'level' và id lạ của theme.
  var ALIASES = { level: 'kitchen', title: 'menu', map: 'worldmap', win: 'victory', lose: 'gameover', final: 'bossFinal', trio: 'bossFinal' };

  // ---------------------------------------------------------------------------
  // Phân tích cú pháp
  // ---------------------------------------------------------------------------
  var NOTE_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function noteToMidi(tok) {
    var m = /^([A-G])(#|b)?(-?\d)$/.exec(tok);
    if (!m) return null;
    var s = NOTE_SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 12 * (parseInt(m[3], 10) + 1) + s;
  }

  // Hợp âm → {root (pitch class 0..11), minor}
  function parseChord(name) {
    var m = /^([A-G])(#|b)?(m?)$/.exec(String(name || 'C'));
    if (!m) return { root: 0, minor: false };
    var s = NOTE_SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return { root: (s + 12) % 12, minor: m[3] === 'm' };
  }

  // Các mẫu bass: [bước, quãng (bán cung so với gốc), độ dài (bước)]
  var BASS_STYLES = {
    bounce: [[0, 0, 2], [3, 0, 1], [4, 7, 2], [8, 12, 2], [10, 7, 1], [12, 0, 2], [14, 7, 1]],
    walk: [[0, 0, 3], [4, 7, 3], [8, 12, 3], [12, 7, 3]],
    drive: [[0, 0, 1], [2, 0, 1], [4, 12, 1], [6, 0, 1], [8, 0, 1], [10, 12, 1], [12, 0, 1], [14, 7, 1]],
    gallop: [[0, 0, 1], [1, 0, 1], [2, 12, 1], [4, 0, 1], [5, 0, 1], [6, 12, 1], [8, 0, 1], [9, 0, 1], [10, 12, 1], [12, 0, 1], [13, 0, 1], [14, 7, 1], [15, 6, 1]],
    spooky: [[0, 0, 3], [6, 0, 2], [8, 7, 3], [14, 6, 2]],
    hits: [[0, 0, 2], [8, 7, 2], [12, 0, 4]],
    long: [[0, 0, 15]]
  };

  // Dàn trải mẫu trống 16 ký tự sang toàn bộ ô nhịp.
  function drumHits(pattern) {
    var out = [];
    pattern = pattern || '';
    for (var i = 0; i < 16; i++) {
      var c = pattern.charAt(i);
      out.push(c === 'X' ? 2 : c === 'x' ? 1 : 0);
    }
    return out;
  }

  function resolveDef(id) {
    var def = TRACKS[id];
    if (!def) return null;
    if (def.extend && TRACKS[def.extend]) {
      var base = TRACKS[def.extend], merged = {};
      var k;
      for (k in base) merged[k] = base[k];
      for (k in def) if (k !== 'extend') merged[k] = def[k];
      return merged;
    }
    return def;
  }

  /* Biên dịch bản nhạc thành mảng bước: steps[i] = [{ch, midi, len, acc}] */
  var compiled = {};
  function compile(id) {
    if (compiled[id]) return compiled[id];
    var def = resolveDef(id);
    if (!def) return null;
    var tr = def.transpose || 0;
    var bars = def.melody.length;
    var passes = def.loop ? 2 : 1;
    var total = bars * 16 * passes;
    var steps = [];
    var i, b, s;
    for (i = 0; i < total; i++) steps.push([]);

    function add(step, ev) { if (step >= 0 && step < total) steps[step].push(ev); }

    for (var pass = 0; pass < passes; pass++) {
      var off0 = pass * bars * 16;
      for (b = 0; b < bars; b++) {
        var off = off0 + b * 16;
        // Giai điệu
        var toks = String(def.melody[b]).split(/\s+/).filter(function (t) { return t && t !== '|'; });
        var lastEv = null;
        for (s = 0; s < 16 && s < toks.length; s++) {
          var tk = toks[s];
          if (tk === '-') { if (lastEv) lastEv.len++; continue; }
          lastEv = null;
          if (tk === '.') continue;
          var midi = noteToMidi(tk);
          if (midi == null) continue;
          lastEv = { ch: 'lead', midi: midi + tr, len: 1 };
          add(off + s, lastEv);
        }
        // Hợp âm: pad + bass + (lượt 2) arpeggio
        var ch = parseChord(def.chords[b % def.chords.length]);
        var third = ch.minor ? 3 : 4;
        var padRoot = 48 + ch.root + tr;           // quãng tám 3–4
        if (padRoot < 52) padRoot += 12;
        add(off, { ch: 'pad', midi: padRoot, len: 16 });
        add(off, { ch: 'pad', midi: padRoot + third, len: 16 });
        add(off, { ch: 'pad', midi: padRoot + 7, len: 16 });
        var bassRoot = 36 + ch.root + tr;          // quãng tám 2
        if (bassRoot > 43) bassRoot -= 12;
        var style = BASS_STYLES[(def.bass && def.bass.style) || 'walk'] || BASS_STYLES.walk;
        for (var n = 0; n < style.length; n++) {
          add(off + style[n][0], { ch: 'bass', midi: bassRoot + style[n][1], len: style[n][2] });
        }
        if (pass === 1) {
          var arpNotes = [0, third, 7, 12, 7, third];
          for (s = 0; s < 16; s += 2) {
            add(off + s, { ch: 'arp', midi: padRoot + 12 + arpNotes[(s / 2) % arpNotes.length], len: 1 });
          }
        }
        // Trống
        var d = def.drums || {};
        var kk = drumHits(d.kick), sn = drumHits(d.snare), hh = drumHits(d.hat);
        var lastBarOfLoop = def.loop && b === bars - 1 && pass === passes - 1;
        for (s = 0; s < 16; s++) {
          if (kk[s]) add(off + s, { ch: 'kick', acc: kk[s] });
          // Fill trống ở ô nhịp cuối vòng lặp.
          if (lastBarOfLoop && s >= 12) add(off + s, { ch: 'snare', acc: 1 + (s === 15 ? 1 : 0) });
          else if (sn[s]) add(off + s, { ch: 'snare', acc: sn[s] });
          if (hh[s]) add(off + s, { ch: 'hat', acc: hh[s] });
        }
        if (d.crashBar && d.crashBar.indexOf(b) >= 0) add(off, { ch: 'crash', acc: 1 });
      }
    }
    // Crash đầu vòng lặp cho bản có lặp
    if (def.loop) add(0, { ch: 'crash', acc: 1 });

    compiled[id] = { id: id, def: def, steps: steps, total: total, stepDur: 60 / (def.bpm || 120) / 4 };
    return compiled[id];
  }

  // ---------------------------------------------------------------------------
  // Phát âm thanh của từng kênh
  // ---------------------------------------------------------------------------
  function E() { return OG.Audio._engine; }

  function playEvent(ev, t, song, bus) {
    var eng = E(), def = song.def, sd = song.stepDur;
    var mtof = eng.mtof;
    switch (ev.ch) {
      case 'lead': {
        var L = def.lead || {};
        eng.tone({ type: L.wave || 'square', f: mtof(ev.midi), when: t, dur: ev.len * sd * 0.95, vol: L.vol || 0.08,
          a: 0.008, hold: ev.len > 1, vib: L.vib || (ev.len > 2 ? 10 : 0), vibRate: 5.5,
          filter: { type: 'lowpass', f: L.cutoff || 3000 }, bus: bus });
        break;
      }
      case 'bass': {
        var B = def.bass || {};
        eng.tone({ type: B.wave || 'triangle', f: mtof(ev.midi), when: t, dur: ev.len * sd * 0.9, vol: B.vol || 0.18,
          a: 0.005, hold: ev.len > 1, filter: B.cutoff ? { type: 'lowpass', f: B.cutoff } : null, bus: bus });
        break;
      }
      case 'pad': {
        var P = def.pad || {};
        eng.tone({ type: P.wave || 'triangle', f: mtof(ev.midi), when: t, dur: ev.len * sd, vol: P.vol || 0.03,
          a: 0.08, hold: true, detune: (Math.random() - 0.5) * 8,
          filter: { type: 'lowpass', f: P.cutoff || 2000 }, bus: bus });
        break;
      }
      case 'arp':
        eng.tone({ type: 'triangle', f: mtof(ev.midi), when: t, dur: sd * 0.9, vol: 0.035, bus: bus,
          filter: { type: 'lowpass', f: 3500 } });
        break;
      case 'kick':
        eng.tone({ type: 'sine', f: 150, f2: 42, slideDur: 0.12, when: t, dur: 0.2, vol: ev.acc > 1 ? 0.42 : 0.34, bus: bus });
        break;
      case 'snare':
        eng.noise({ when: t, dur: 0.13, vol: ev.acc > 1 ? 0.17 : 0.12, type: 'bandpass', f: 1900, q: 0.7, bus: bus });
        eng.tone({ type: 'triangle', f: 210, f2: 140, when: t, dur: 0.08, vol: 0.08, bus: bus });
        break;
      case 'hat':
        eng.noise({ when: t, dur: ev.acc > 1 ? 0.12 : 0.035, vol: ev.acc > 1 ? 0.06 : 0.035, type: 'highpass', f: 7500, bus: bus });
        break;
      case 'crash':
        eng.noise({ when: t, dur: 1.1, vol: 0.06, type: 'highpass', f: 5000, f2: 3000, bus: bus });
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Sequencer (lên lịch trước bằng đồng hồ AudioContext)
  // ---------------------------------------------------------------------------
  var LOOKAHEAD = 0.15;   // lên lịch trước bao nhiêu giây
  var TICK_MS = 25;
  var timer = null;
  var cur = null;         // {id, song, gain, step, nextTime, done, endAt}

  function ensureTimer() {
    if (timer) return;
    timer = setInterval(tick, TICK_MS);
  }
  function clearTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function tick() {
    try {
      var eng = E();
      var ctx = eng && eng.ctx();
      if (!ctx || !cur) { clearTimer(); return; }
      if (ctx.state !== 'running') return;   // bị suspend (ẩn tab): chờ
      var now = ctx.currentTime;
      if (cur.done) {
        if (now > cur.endAt) clearTimer();
        return;
      }
      // Bị tụt lại (tab nền throttle timer) → nhảy tới, không xả hàng loạt nốt.
      if (cur.nextTime < now - 0.05) cur.nextTime = now + 0.03;
      var song = cur.song;
      while (cur.nextTime < now + LOOKAHEAD) {
        var evs = song.steps[cur.step];
        // Swing: đẩy chậm các bước lẻ (8th-note feel).
        var sw = (song.def.swing || 0) * song.stepDur * 2;
        var t = cur.nextTime + (cur.step % 2 === 1 ? sw : 0);
        for (var i = 0; i < evs.length; i++) playEvent(evs[i], t, song, cur.gain);
        cur.nextTime += song.stepDur;
        cur.step++;
        if (cur.step >= song.total) {
          if (song.def.loop) cur.step = 0;
          else {
            cur.done = true;
            cur.endAt = cur.nextTime + (song.def.tail || 1);
            break;
          }
        }
      }
    } catch (e) {
      console.warn('[OG.Audio] lỗi sequencer', e);
      clearTimer();
    }
  }

  // Nhỏ dần rồi ngắt gain của bản đang phát.
  function fadeOut(entry, fade) {
    if (!entry || !entry.gain) return;
    try {
      var ctx = E().ctx();
      var t = ctx.currentTime;
      var g = entry.gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0.0001, t + Math.max(0.02, fade));
      var node = entry.gain;
      setTimeout(function () { try { node.disconnect(); } catch (e) { /* bỏ qua */ } }, (fade + 0.8) * 1000);
    } catch (e) { /* bỏ qua */ }
  }

  var Music = {
    // Trả về id hợp lệ (hoặc null nếu không có bản nhạc nào phù hợp).
    resolve: function (id) {
      if (TRACKS[id]) return id;
      if (ALIASES[id] && TRACKS[ALIASES[id]]) return ALIASES[id];
      return null;
    },
    list: function () { return Object.keys(TRACKS); },
    isPlaying: function (id) { return !!(cur && cur.id === id); },

    play: function (id) {
      var eng = E();
      var ctx = eng && eng.ctx();
      if (!ctx || !eng.ready()) return;
      id = Music.resolve(id);
      if (!id) return;
      var song = compile(id);
      if (!song) return;
      var bus = eng.musicBus();
      if (!bus) return;
      // Nhỏ dần bản cũ, bản mới vào nhẹ.
      if (cur) fadeOut(cur, 0.35);
      var g = ctx.createGain();
      var t = ctx.currentTime;
      var jingle = !song.def.loop;
      g.gain.setValueAtTime(jingle ? 1 : 0.0001, t);
      if (!jingle) g.gain.linearRampToValueAtTime(1, t + 0.4);
      g.connect(bus);
      cur = { id: id, song: song, gain: g, step: 0, nextTime: t + (jingle ? 0.05 : 0.1), done: false, endAt: 0 };
      ensureTimer();
      tick();
    },

    stop: function (fade) {
      if (cur) fadeOut(cur, fade == null ? 0.5 : fade);
      cur = null;
      clearTimer();
    },

    // Dành cho kiểm thử: biên dịch và trả số bước của bản nhạc.
    _compile: compile
  };

  OG.Audio.tracks = TRACKS;
  OG.Audio._music = Music;
})();
