/* OG.Audio — âm thanh tổng hợp hoàn toàn bằng Web Audio API (không file âm thanh).
 * Chủ sở hữu: agent Audio (src/audio/). File này: engine + SFX + lắng nghe event.
 * Nhạc nền (sequencer + dữ liệu bản nhạc) nằm ở src/audio/music.js (load SAU file này).
 *
 * HỢP ĐỒNG (docs/ARCHITECTURE.md mục 8.2):
 *   init()                    — main.js gọi 1 lần. Tự lắng nghe OG.Events để phát sfx/nhạc.
 *                               AudioContext chỉ được tạo/resume sau 'input:firstGesture'.
 *   playMusic(trackId)        — menu | worldmap | kitchen | garden | roof | lair | boss | victory | gameover
 *                               (thêm: level, bossFinal). Gọi lại cùng track = không làm gì.
 *   stopMusic()
 *   sfx(name, opts?)          — xem OG.Audio.listSfx(). opts: {pitch, vol}
 *   setVolume(ch, v)          — ch: 'music' | 'sfx' | 'master'; v ∈ [0,1]; lưu qua OG.Save.setSetting
 *   getVolume(ch)
 *   mute(bool) / isMuted() / toggleMute()
 * Mở rộng: unlock(), isReady(), currentTrack, listSfx(), listTracks(), setDuck(v).
 *
 * Nguyên tắc: KHÔNG BAO GIỜ ném lỗi ra ngoài. Không có AudioContext → mọi hàm là no-op. */
(function () {
  'use strict';
  var OG = (window.OG = window.OG || {});

  // ---------------------------------------------------------------------------
  // Cài đặt (đọc/ghi qua OG.Save; nếu Save chưa sẵn sàng dùng bản trong bộ nhớ)
  // ---------------------------------------------------------------------------
  var fallbackSettings = { musicVolume: 0.6, sfxVolume: 0.8, masterVolume: 1, muted: false };

  function settings() {
    try {
      var s = OG.Save && OG.Save.data && OG.Save.data.settings;
      if (s && typeof s === 'object') return s;
    } catch (e) { /* bỏ qua */ }
    return fallbackSettings;
  }

  function num(v, fb) {
    v = +v;
    return isFinite(v) ? Math.max(0, Math.min(1, v)) : fb;
  }

  function saveSetting(key, value) {
    try {
      if (OG.Save && typeof OG.Save.setSetting === 'function' && OG.Save.data && OG.Save.data.settings) {
        OG.Save.setSetting(key, value); // tự commit + phát settings:change
        return;
      }
    } catch (e) { /* rơi xuống fallback */ }
    fallbackSettings[key] = value;
    applyVolumes();
  }

  var KEY_OF = { music: 'musicVolume', sfx: 'sfxVolume', master: 'masterVolume' };
  var DEFAULT_VOL = { music: 0.6, sfx: 0.8, master: 1 };

  function getVol(ch) {
    var key = KEY_OF[ch];
    if (!key) return 0;
    return num(settings()[key], DEFAULT_VOL[ch]);
  }

  // ---------------------------------------------------------------------------
  // Engine: AudioContext + các bus gain
  //   nguồn → sfxBus ─┐
  //   nguồn → trackGain → musicBus ─┼→ master → compressor → destination
  // ---------------------------------------------------------------------------
  var ctx = null;          // AudioContext (null cho tới lần chạm đầu tiên)
  var master = null, musicBus = null, sfxBus = null, compressor = null;
  var noiseBuf = null;
  var unlocked = false;
  var supported = !!(window.AudioContext || window.webkitAudioContext);
  var duck = 1;            // hệ số giảm nhạc khi tạm dừng
  var activeVoices = 0;    // số voice SFX đang kêu (giới hạn để tránh vỡ tiếng)
  var MAX_VOICES = 40;

  function createContext() {
    if (ctx || !supported) return ctx;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 12;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.004;
      compressor.release.value = 0.2;
      compressor.connect(ctx.destination);

      master = ctx.createGain();
      master.connect(compressor);
      musicBus = ctx.createGain();
      musicBus.connect(master);
      sfxBus = ctx.createGain();
      sfxBus.connect(master);

      // 1 giây nhiễu trắng dùng chung cho trống/tiếng nổ/whoosh.
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var ch = noiseBuf.getChannelData(0);
      for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;

      applyVolumes(true);
    } catch (e) {
      console.warn('[OG.Audio] không tạo được AudioContext:', e);
      ctx = null;
      supported = false;
    }
    return ctx;
  }

  // Đặt gain mượt (tránh tiếng lách cách).
  function setGain(node, value, immediate) {
    if (!node || !ctx) return;
    try {
      var t = ctx.currentTime;
      node.gain.cancelScheduledValues(t);
      if (immediate) node.gain.setValueAtTime(value, t);
      else { node.gain.setValueAtTime(node.gain.value, t); node.gain.setTargetAtTime(value, t, 0.05); }
    } catch (e) { /* bỏ qua */ }
  }

  function applyVolumes(immediate) {
    if (!ctx) return;
    var muted = !!settings().muted;
    setGain(master, muted ? 0 : getVol('master'), immediate);
    // Nhân thêm hệ số để mức nhạc/sfx cân bằng với nhau.
    setGain(musicBus, getVol('music') * 0.55 * duck, immediate);
    setGain(sfxBus, getVol('sfx') * 0.9, immediate);
  }

  // Mở khoá: tạo/resume context. Gọi từ cử chỉ người dùng.
  function unlock() {
    if (!supported) return false;
    createContext();
    if (!ctx) return false;
    try {
      if (ctx.state === 'suspended' && !document.hidden) {
        var p = ctx.resume();
        if (p && p.then) p.then(onUnlocked, function () { /* bỏ qua */ });
        else onUnlocked();
      } else {
        onUnlocked();
      }
      // Mẹo cho iOS Safari: phát 1 buffer im lặng trong cùng cử chỉ.
      var src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
    } catch (e) { /* bỏ qua */ }
    return true;
  }

  function onUnlocked() {
    if (unlocked) return;
    unlocked = true;
    // Bắt đầu bản nhạc đang được yêu cầu trước khi mở khoá.
    if (Audio.currentTrack) startTrack(Audio.currentTrack);
  }

  function ready() {
    return !!(ctx && unlocked && ctx.state !== 'closed');
  }

  // ---------------------------------------------------------------------------
  // Khối tổng hợp cơ bản (music.js cũng dùng qua OG.Audio._engine)
  // ---------------------------------------------------------------------------
  function trackVoice(node) {
    activeVoices++;
    node.onended = function () { activeVoices = Math.max(0, activeVoices - 1); };
  }

  /* Dao động có envelope.
   * o: {type, f, f2 (tần số cuối, trượt), slide:'exp'|'lin', at (giây, tuyệt đối hoặc offset),
   *     dur, vol, a (attack), hold (true → giữ mức rồi nhả), detune, vib (cents), vibRate,
   *     filter: {type, f, f2, q}, bus, count (tính voice SFX?)} */
  function tone(o) {
    if (!ctx) return null;
    try {
      var t0 = o.when != null ? o.when : ctx.currentTime + (o.at || 0);
      var dur = Math.max(0.02, o.dur || 0.1);
      var vol = o.vol == null ? 0.2 : o.vol;
      var a = Math.min(o.a == null ? 0.005 : o.a, dur * 0.5);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = o.type || 'square';
      var f = Math.max(1, o.f || 440);
      osc.frequency.setValueAtTime(f, t0);
      if (o.f2) {
        if (o.slide === 'lin') osc.frequency.linearRampToValueAtTime(Math.max(1, o.f2), t0 + (o.slideDur || dur));
        else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + (o.slideDur || dur));
      }
      if (o.detune) osc.detune.setValueAtTime(o.detune, t0);
      if (o.vib) {
        var lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.frequency.value = o.vibRate || 6;
        lg.gain.value = o.vib;
        lfo.connect(lg); lg.connect(osc.detune);
        lfo.start(t0); lfo.stop(t0 + dur + 0.05);
      }
      // Envelope
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + a);
      if (o.hold) {
        g.gain.linearRampToValueAtTime(vol * 0.75, t0 + dur * 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      } else {
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      }
      var last = osc;
      if (o.filter) {
        var bq = ctx.createBiquadFilter();
        bq.type = o.filter.type || 'lowpass';
        bq.frequency.setValueAtTime(o.filter.f || 2000, t0);
        if (o.filter.f2) bq.frequency.exponentialRampToValueAtTime(Math.max(10, o.filter.f2), t0 + dur);
        if (o.filter.q) bq.Q.value = o.filter.q;
        osc.connect(bq); last = bq;
      }
      last.connect(g);
      g.connect(o.bus || sfxBus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
      if (o.count) trackVoice(osc);
      return osc;
    } catch (e) { return null; }
  }

  /* Nhiễu có lọc. o: {at|when, dur, vol, type:'lowpass'|'bandpass'|'highpass', f, f2, q, a, bus, count} */
  function noise(o) {
    if (!ctx || !noiseBuf) return null;
    try {
      var t0 = o.when != null ? o.when : ctx.currentTime + (o.at || 0);
      var dur = Math.max(0.02, o.dur || 0.1);
      var src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = dur > 0.9;
      var bq = ctx.createBiquadFilter();
      bq.type = o.type || 'lowpass';
      bq.frequency.setValueAtTime(o.f || 3000, t0);
      if (o.f2) bq.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2), t0 + dur);
      bq.Q.value = o.q || 0.8;
      var g = ctx.createGain();
      var vol = o.vol == null ? 0.2 : o.vol;
      var a = Math.min(o.a == null ? 0.003 : o.a, dur * 0.5);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(bq); bq.connect(g); g.connect(o.bus || sfxBus);
      src.start(t0, Math.random() * 0.5);
      src.stop(t0 + dur + 0.05);
      if (o.count) trackVoice(src);
      return src;
    } catch (e) { return null; }
  }

  // Tần số từ số MIDI.
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // Chuỗi nốt nhanh (arpeggio). notes: mảng số MIDI.
  function arp(notes, step, base) {
    for (var i = 0; i < notes.length; i++) {
      var o = {};
      for (var k in base) o[k] = base[k];
      o.f = mtof(notes[i]);
      o.at = (base.at || 0) + i * step;
      tone(o);
    }
  }

  // ---------------------------------------------------------------------------
  // Thư viện SFX. Mỗi hàm nhận p (hệ số cao độ) và v (hệ số âm lượng).
  // ---------------------------------------------------------------------------
  var C = true; // viết tắt cho cờ count
  var SFX = {
    jump: function (p, v) {
      tone({ type: 'square', f: 280 * p, f2: 640 * p, dur: 0.16, vol: 0.13 * v, count: C, filter: { type: 'lowpass', f: 3200 } });
      tone({ type: 'sine', f: 560 * p, f2: 1200 * p, dur: 0.1, vol: 0.06 * v, count: C });
    },
    land: function (p, v) {
      noise({ dur: 0.07, vol: 0.12 * v, type: 'lowpass', f: 500, f2: 150, count: C });
      tone({ type: 'sine', f: 140 * p, f2: 60, dur: 0.08, vol: 0.12 * v, count: C });
    },
    collect: function (p, v) { // pizza
      arp([79, 84, 88, 91], 0.045, { type: 'triangle', dur: 0.14, vol: 0.16 * v, count: C });
      arp([91, 96], 0.05, { type: 'sine', dur: 0.12, vol: 0.06 * v, at: 0.12, count: C });
    },
    coin: function (p, v) {
      tone({ type: 'square', f: mtof(83) * p, dur: 0.06, vol: 0.09 * v, count: C, filter: { type: 'lowpass', f: 5000 } });
      tone({ type: 'square', f: mtof(88) * p, at: 0.055, dur: 0.22, vol: 0.09 * v, count: C, filter: { type: 'lowpass', f: 5000 } });
    },
    hurt: function (p, v) {
      tone({ type: 'sawtooth', f: 440 * p, f2: 110 * p, dur: 0.32, vol: 0.16 * v, vib: 60, vibRate: 30, count: C, filter: { type: 'lowpass', f: 2400 } });
      noise({ dur: 0.12, vol: 0.12 * v, type: 'bandpass', f: 1200, q: 1.2, count: C });
    },
    shield: function (p, v) { // trúng đòn nhưng có khiên
      tone({ type: 'sine', f: 1320 * p, f2: 880 * p, dur: 0.3, vol: 0.12 * v, count: C });
      tone({ type: 'triangle', f: 1980 * p, f2: 1320 * p, dur: 0.25, vol: 0.06 * v, count: C });
      noise({ dur: 0.06, vol: 0.06 * v, type: 'highpass', f: 5000, count: C });
    },
    stomp: function (p, v) {
      tone({ type: 'sine', f: 220 * p, f2: 50, dur: 0.16, vol: 0.22 * v, count: C });
      noise({ dur: 0.08, vol: 0.13 * v, type: 'lowpass', f: 1800, f2: 300, count: C });
      tone({ type: 'square', f: 520 * p, f2: 1040 * p, at: 0.04, dur: 0.1, vol: 0.06 * v, count: C });
    },
    door: function (p, v) {
      noise({ dur: 0.5, vol: 0.08 * v, type: 'bandpass', f: 400, f2: 3000, q: 2, a: 0.15, count: C });
      arp([67, 72, 76, 79, 84], 0.07, { type: 'triangle', dur: 0.25, vol: 0.14 * v, count: C });
    },
    locked: function (p, v) {
      tone({ type: 'square', f: 150, dur: 0.11, vol: 0.09 * v, count: C, filter: { type: 'lowpass', f: 1200 } });
      tone({ type: 'square', f: 112, at: 0.13, dur: 0.18, vol: 0.09 * v, count: C, filter: { type: 'lowpass', f: 1200 } });
    },
    bossHit: function (p, v) {
      tone({ type: 'sawtooth', f: 180 * p, f2: 55, dur: 0.25, vol: 0.18 * v, count: C, filter: { type: 'lowpass', f: 1600 } });
      noise({ dur: 0.18, vol: 0.18 * v, type: 'lowpass', f: 3000, f2: 400, count: C });
      tone({ type: 'square', f: 880 * p, f2: 1320 * p, at: 0.02, dur: 0.08, vol: 0.06 * v, count: C });
    },
    bossDefeat: function (p, v) {
      noise({ dur: 1.3, vol: 0.22 * v, type: 'lowpass', f: 3500, f2: 120, a: 0.01, count: C });
      tone({ type: 'sawtooth', f: 420, f2: 35, dur: 1.1, vol: 0.14 * v, count: C, filter: { type: 'lowpass', f: 1800, f2: 200 } });
      tone({ type: 'sine', f: 90, f2: 30, dur: 0.9, vol: 0.25 * v, count: C });
      arp([72, 76, 79, 84, 88], 0.09, { type: 'square', dur: 0.3, vol: 0.08 * v, at: 0.75, count: C, filter: { type: 'lowpass', f: 4000 } });
      tone({ type: 'triangle', f: mtof(84), dur: 0.9, vol: 0.12 * v, at: 1.2, hold: true, count: C });
    },
    bossStart: function (p, v) { // tiếng còi báo trùm xuất hiện
      tone({ type: 'sawtooth', f: 110, dur: 0.35, vol: 0.12 * v, count: C, filter: { type: 'lowpass', f: 900 } });
      tone({ type: 'sawtooth', f: 104, at: 0.38, dur: 0.5, vol: 0.12 * v, count: C, filter: { type: 'lowpass', f: 900 } });
      noise({ dur: 0.6, vol: 0.06 * v, type: 'lowpass', f: 400, at: 0.0, count: C });
    },
    phase: function (p, v) { // trùm chuyển giai đoạn
      tone({ type: 'square', f: 300, f2: 900, dur: 0.35, vol: 0.08 * v, slide: 'lin', count: C, filter: { type: 'lowpass', f: 2500 } });
      tone({ type: 'square', f: 300, f2: 900, at: 0.35, dur: 0.35, vol: 0.08 * v, slide: 'lin', count: C, filter: { type: 'lowpass', f: 2500 } });
    },
    click: function (p, v) {
      tone({ type: 'sine', f: 1250 * p, f2: 900 * p, dur: 0.05, vol: 0.12 * v, count: C });
    },
    select: function (p, v) {
      tone({ type: 'triangle', f: mtof(76) * p, dur: 0.07, vol: 0.12 * v, count: C });
      tone({ type: 'triangle', f: mtof(83) * p, at: 0.06, dur: 0.12, vol: 0.12 * v, count: C });
    },
    victory: function (p, v) { // fanfare ngắn khi qua màn
      arp([72, 76, 79], 0.1, { type: 'square', dur: 0.12, vol: 0.09 * v, count: C, filter: { type: 'lowpass', f: 3500 } });
      tone({ type: 'square', f: mtof(84), at: 0.3, dur: 0.6, vol: 0.09 * v, hold: true, count: C, filter: { type: 'lowpass', f: 3500 } });
      tone({ type: 'triangle', f: mtof(76), at: 0.3, dur: 0.6, vol: 0.08 * v, hold: true, count: C });
      tone({ type: 'triangle', f: mtof(48), at: 0.3, dur: 0.6, vol: 0.12 * v, hold: true, count: C });
    },
    gameover: function (p, v) {
      arp([67, 66, 65], 0.22, { type: 'triangle', dur: 0.22, vol: 0.14 * v, count: C });
      tone({ type: 'triangle', f: mtof(64), at: 0.66, dur: 0.8, vol: 0.14 * v, vib: 25, vibRate: 5, hold: true, count: C });
    },
    pause: function (p, v) {
      tone({ type: 'sine', f: 880, dur: 0.08, vol: 0.12 * v, count: C });
      tone({ type: 'sine', f: 660, at: 0.08, dur: 0.12, vol: 0.12 * v, count: C });
    },
    resume: function (p, v) {
      tone({ type: 'sine', f: 660, dur: 0.08, vol: 0.12 * v, count: C });
      tone({ type: 'sine', f: 880, at: 0.08, dur: 0.12, vol: 0.12 * v, count: C });
    },
    quest: function (p, v) {
      arp([76, 79, 83, 88], 0.06, { type: 'triangle', dur: 0.2, vol: 0.13 * v, count: C });
      arp([88, 91, 95], 0.05, { type: 'sine', dur: 0.25, vol: 0.06 * v, at: 0.25, count: C });
    },
    purchase: function (p, v) { // "ka-ching"
      noise({ dur: 0.08, vol: 0.1 * v, type: 'highpass', f: 4000, count: C });
      tone({ type: 'square', f: mtof(88), at: 0.05, dur: 0.08, vol: 0.08 * v, count: C, filter: { type: 'lowpass', f: 6000 } });
      tone({ type: 'square', f: mtof(95), at: 0.12, dur: 0.3, vol: 0.08 * v, count: C, filter: { type: 'lowpass', f: 6000 } });
      tone({ type: 'sine', f: mtof(100), at: 0.12, dur: 0.35, vol: 0.05 * v, count: C });
    },
    powerup: function (p, v) {
      var notes = [60, 64, 67, 72, 67, 72, 76, 79, 76, 79, 84, 88];
      arp(notes, 0.035, { type: 'square', dur: 0.06, vol: 0.07 * v, count: C, filter: { type: 'lowpass', f: 4000 } });
      tone({ type: 'sine', f: 400, f2: 1600, dur: 0.45, vol: 0.05 * v, count: C });
    },
    dash: function (p, v) { // whoosh khi bấm action
      noise({ dur: 0.2, vol: 0.12 * v, type: 'bandpass', f: 600 * p, f2: 3200 * p, q: 1.5, a: 0.03, count: C });
      tone({ type: 'sine', f: 200 * p, f2: 90, dur: 0.12, vol: 0.06 * v, count: C });
    },
    unlock: function (p, v) {
      arp([72, 76, 79, 84, 88, 91], 0.07, { type: 'square', dur: 0.18, vol: 0.07 * v, count: C, filter: { type: 'lowpass', f: 4500 } });
      tone({ type: 'triangle', f: mtof(96), at: 0.42, dur: 0.6, vol: 0.08 * v, hold: true, count: C });
      noise({ dur: 0.5, vol: 0.04 * v, type: 'highpass', f: 6000, at: 0.4, count: C });
    },
    error: function (p, v) {
      tone({ type: 'square', f: 220, f2: 180, dur: 0.18, vol: 0.08 * v, count: C, filter: { type: 'lowpass', f: 1500 } });
    }
  };

  // Khoảng cách tối thiểu (giây) giữa 2 lần phát cùng một SFX — chống dồn tiếng.
  var MIN_GAP = { land: 0.12, coin: 0.035, click: 0.05, stomp: 0.05, jump: 0.05, locked: 0.4, dash: 0.08, select: 0.05 };
  var lastPlayed = {};
  // Tên thay thế để tương thích.
  var ALIAS = { pizza: 'collect', hit: 'hurt', bossdefeat: 'bossDefeat', bosshit: 'bossHit', deny: 'error' };

  function playSfx(name, opts) {
    if (!ready() || settings().muted) return false;
    if (getVol('sfx') <= 0 || getVol('master') <= 0) return false;
    name = ALIAS[name] || name;
    var fn = SFX[name];
    if (!fn) return false;
    if (activeVoices > MAX_VOICES) return false;
    var now = ctx.currentTime;
    var gap = MIN_GAP[name] || 0.025;
    if (lastPlayed[name] != null && now - lastPlayed[name] < gap) return false;
    lastPlayed[name] = now;
    opts = opts || {};
    // Lệch cao độ ngẫu nhiên nhỏ để bớt nhàm.
    var p = (opts.pitch || 1) * (opts.noVary ? 1 : 1 + (Math.random() - 0.5) * 0.04);
    fn(p, opts.vol == null ? 1 : opts.vol);
    return true;
  }

  // ---------------------------------------------------------------------------
  // Nhạc nền: điều phối, phần sequencer ở music.js (OG.Audio._music)
  // ---------------------------------------------------------------------------
  function startTrack(id) {
    if (!ready()) return;
    var m = Audio._music;
    if (m && typeof m.play === 'function') {
      try { m.play(id); } catch (e) { console.warn('[OG.Audio] lỗi phát nhạc', e); }
    }
  }

  function setDuck(v) {
    duck = num(v, 1);
    applyVolumes();
  }

  // ---------------------------------------------------------------------------
  // Ánh xạ event → âm thanh
  // ---------------------------------------------------------------------------
  // Scene → bản nhạc. Scene không có trong bảng (vd 'boot', scene lạ) giữ nguyên nhạc hiện tại.
  var SCENE_MUSIC = {
    menu: 'menu', charselect: 'menu', settings: 'menu', shop: 'menu', leaderboard: 'menu',
    worldmap: 'worldmap', victory: 'victory', gameover: 'gameover',
    // v2 (Tích hợp nối): menu hành trình dùng nhạc menu, bản đồ hành trình dùng nhạc bản đồ.
    // 'comic' không có trong bảng → giữ nhạc đang phát.
    modeSelect: 'menu', journeySelect: 'menu', notebookHub: 'menu', notebook: 'menu',
    journeyMap: 'worldmap', journeyEnd: 'victory'
  };
  var CHAR_PITCH = { oggy: 1, jack: 0.88, olivia: 1.15 };

  var levelTrack = null;   // bản nhạc của màn hiện tại (từ level:start)
  var bossTrack = 'boss';
  var lastLives = null;

  function onSceneChange(e) {
    var to = e && e.to;
    if (!to) return;
    if (to === 'pause') { setDuck(0.3); return; }
    if (e.push) return;              // scene chồng lên (vd settings trên pause) → giữ nhạc
    var top = null;
    try { top = OG.Scenes && OG.Scenes.current ? OG.Scenes.current() : to; } catch (err) { top = to; }
    if (top !== 'pause') setDuck(1);
    if (e.pop) return;               // quay lại scene cũ → nhạc vẫn đang chạy

    if (to === 'level') {
      var t = levelTrack;
      if (!t) {
        try { var st = OG.Level && OG.Level.state; t = st && st.level && (st.level.music || st.level.theme); } catch (err2) { t = null; }
      }
      Audio.playMusic(t || 'kitchen');
    } else if (to === 'boss') {
      Audio.playMusic(bossTrack || 'boss');
    } else if (SCENE_MUSIC[to]) {
      Audio.playMusic(SCENE_MUSIC[to]);
    }
  }

  function bindEvents() {
    var E = OG.Events;
    if (!E || typeof E.on !== 'function') return;
    function on(name, fn) {
      E.on(name, function (p) { try { fn(p || {}); } catch (e) { /* không bao giờ làm hỏng gameplay */ } });
    }

    on('input:firstGesture', function () { unlock(); });
    on('scene:change', onSceneChange);

    on('game:start', function (p) { lastLives = p.run && p.run.lives != null ? p.run.lives : null; });
    on('level:start', function (p) {
      levelTrack = p.music || p.theme || 'kitchen';
      Audio.playMusic(levelTrack);
    });
    on('level:exitLocked', function () { playSfx('locked'); });
    on('door:enter', function () { playSfx('door'); });
    on('level:complete', function (r) { if (!r.isFinal) playSfx('victory'); });

    on('player:jump', function (p) { playSfx('jump', { pitch: CHAR_PITCH[p.charId] || 1 }); });
    on('player:land', function () { playSfx('land', { vol: 0.8 }); });
    on('player:action', function () { playSfx('dash'); });
    on('player:hurt', function (p) { playSfx(p.shielded ? 'shield' : 'hurt'); });
    on('player:die', function () { Audio.stopMusic(0.3); });

    on('item:collect', function (p) {
      if (p.type === 'coin') playSfx('coin');
      else if (p.type === 'pizza') {
        playSfx('collect');
        if (p.goal && p.count === p.goal) playSfx('unlock', { vol: 0.6 }); // đủ pizza → cửa mở
      } else playSfx('powerup'); // vật phẩm khác (tim, khiên, sao...)
    });
    on('enemy:stomp', function () { playSfx('stomp'); });
    on('lives:change', function (p) {
      if (lastLives != null && p.lives > lastLives) playSfx('powerup');
      lastLives = p.lives;
    });

    on('boss:start', function (p) {
      bossTrack = p.bossId === 'trio' ? 'bossFinal' : 'boss';
      playSfx('bossStart');
      Audio.playMusic(bossTrack);
    });
    on('boss:hit', function () { playSfx('bossHit'); });
    on('boss:phase', function () { playSfx('phase'); });
    on('boss:defeated', function () { Audio.stopMusic(0.4); playSfx('bossDefeat'); });

    on('game:over', function () { Audio.playMusic('gameover'); });
    on('game:victory', function () { Audio.playMusic('victory'); });
    on('game:pause', function () { playSfx('pause'); });
    on('game:resume', function () { playSfx('resume'); });

    on('quest:complete', function () { playSfx('quest'); });
    on('shop:purchase', function () { playSfx('purchase'); });
    on('char:unlock', function () { playSfx('unlock'); });
    on('char:select', function () { playSfx('select'); });
    on('skin:equip', function () { playSfx('select'); });
    on('leaderboard:submit', function (p) { if (p.rank != null && p.rank >= 0) playSfx('quest'); });
    on('ui:click', function () { playSfx('click'); });

    // ---- v2: hành trình học tập (docs/STORY.md mục 7). Trả lời sai chỉ có âm nhẹ, KHÔNG dùng âm "thua". ----
    on('page:collect', function () { playSfx('collect'); });
    on('card:unlock', function () { playSfx('quest'); });
    on('quiz:answer', function (p) { if (!p.correct) playSfx('select', { pitch: 0.75, vol: 0.6 }); });
    on('quiz:pass', function () { playSfx('victory', { vol: 0.7 }); });
    on('gate:open', function () { playSfx('unlock'); });
    on('checkpoint:reach', function () { playSfx('coin'); });
    on('guide:talk', function () { playSfx('click', { pitch: 1.3, vol: 0.6 }); });
    on('player:respawn', function () { playSfx('powerup', { vol: 0.6 }); });
    on('journey:complete', function () { Audio.playMusic('victory'); });

    on('settings:change', function (p) {
      if (p.key === 'musicVolume' || p.key === 'sfxVolume' || p.key === 'masterVolume' || p.key === 'muted') applyVolumes();
    });
    on('save:reset', function () { applyVolumes(); });
  }

  // Lắng nghe DOM: resume khi trình duyệt tự suspend, tạm ngưng khi ẩn tab, phím M tắt tiếng.
  function bindDom() {
    var resumeIfNeeded = function () {
      if (!ctx) { if (OG.Audio._gestured) unlock(); return; }
      if (ctx.state === 'suspended' && !document.hidden) { try { ctx.resume(); } catch (e) { /* bỏ qua */ } }
    };
    // Dự phòng nếu Input chưa phát input:firstGesture (vd Input vẫn là stub).
    var gesture = function () { OG.Audio._gestured = true; resumeIfNeeded(); };
    ['pointerdown', 'touchend', 'keydown', 'mousedown'].forEach(function (n) {
      try { window.addEventListener(n, gesture, true); } catch (e) { /* bỏ qua */ }
    });
    try {
      document.addEventListener('visibilitychange', function () {
        if (!ctx) return;
        try {
          if (document.hidden) ctx.suspend();
          else if (unlocked) ctx.resume();
        } catch (e) { /* bỏ qua */ }
      });
    } catch (e) { /* bỏ qua */ }
    // Phím M: bật/tắt tiếng (bỏ qua khi đang gõ vào ô nhập).
    try {
      window.addEventListener('keydown', function (e) {
        if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
        var tg = e.target && e.target.tagName;
        if (tg === 'INPUT' || tg === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
        var m = Audio.toggleMute();
        try { if (OG.DOM && OG.DOM.toast) OG.DOM.toast(m ? '🔇 Đã tắt tiếng (M)' : '🔊 Đã bật tiếng (M)', 1.2); } catch (err) { /* bỏ qua */ }
      });
    } catch (e) { /* bỏ qua */ }
  }

  // ---------------------------------------------------------------------------
  // API công khai
  // ---------------------------------------------------------------------------
  var inited = false;
  var Audio = (OG.Audio = {
    currentTrack: null,
    supported: supported,
    _gestured: false,

    init: function () {
      if (inited) return;
      inited = true;
      try { bindEvents(); } catch (e) { console.warn('[OG.Audio] bindEvents', e); }
      try { bindDom(); } catch (e) { console.warn('[OG.Audio] bindDom', e); }
    },

    // Mở khoá thủ công (UI có thể gọi trong handler click).
    unlock: function () { try { return unlock(); } catch (e) { return false; } },
    isReady: function () { return ready(); },

    playMusic: function (trackId) {
      try {
        if (!trackId) return;
        var m = Audio._music;
        if (m && m.resolve) trackId = m.resolve(trackId);
        if (!trackId) return;
        if (Audio.currentTrack === trackId && (!m || !m.isPlaying || m.isPlaying(trackId) || !ready())) return;
        Audio.currentTrack = trackId;
        startTrack(trackId);
      } catch (e) { /* bỏ qua */ }
    },

    // fade: thời gian nhỏ dần (giây), mặc định 0.5
    stopMusic: function (fade) {
      try {
        Audio.currentTrack = null;
        var m = Audio._music;
        if (m && m.stop) m.stop(fade == null ? 0.5 : fade);
      } catch (e) { /* bỏ qua */ }
    },

    sfx: function (name, opts) {
      try { return playSfx(name, opts); } catch (e) { return false; }
    },

    setVolume: function (channel, v) {
      try {
        var key = KEY_OF[channel];
        if (!key) return;
        saveSetting(key, num(v, DEFAULT_VOL[channel]));
      } catch (e) { /* bỏ qua */ }
    },
    getVolume: function (channel) {
      try { return getVol(channel); } catch (e) { return 0; }
    },
    mute: function (m) {
      try { saveSetting('muted', !!m); } catch (e) { /* bỏ qua */ }
    },
    isMuted: function () {
      try { return !!settings().muted; } catch (e) { return false; }
    },
    toggleMute: function () {
      Audio.mute(!Audio.isMuted());
      return Audio.isMuted();
    },

    setDuck: function (v) { try { setDuck(v); } catch (e) { /* bỏ qua */ } },
    listSfx: function () { return Object.keys(SFX); },
    listTracks: function () { var m = Audio._music; return m && m.list ? m.list() : []; },

    // Nội bộ: music.js dùng các khối tổng hợp này.
    _engine: {
      ctx: function () { return ctx; },
      ready: ready,
      musicBus: function () { return musicBus; },
      tone: tone,
      noise: noise,
      mtof: mtof
    },
    _music: (OG.Audio && OG.Audio._music) || null
  });
})();
