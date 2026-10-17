// @ts-check
/* ============================================================================
 * OG.Audio — ÂM THANH TỔNG HỢP BẰNG WEB AUDIO API (engine + SFX + nghe event)
 * ----------------------------------------------------------------------------
 * Vai trò:      Phát mọi hiệu ứng âm thanh (SFX) và điều phối nhạc nền mà KHÔNG cần file âm thanh nào:
 *               mọi tiếng đều được tổng hợp từ oscillator và nhiễu. main.js gọi init() một lần; sau đó Audio
 *               tự nghe OG.Events (gameplay không bao giờ gọi Audio trực tiếp).
 * Khái niệm:    AudioContext & đồ thị node (audio graph) · autoplay policy (chỉ được phát âm sau thao tác
 *               đầu tiên) · oscillator + gain envelope (attack/decay) · lên lịch theo đồng hồ AudioContext
 *               (currentTime) · noise buffer dùng chung · bus âm lượng (GainNode) & ducking · giới hạn voice ·
 *               chống dồn tiếng (rate limit) · MIDI → tần số · observer (nghe event để phát âm)
 * Bài học:      docs/learn/10-web-audio.md (chính) · docs/learn/06-event-bus-observer.md (bindEvents)
 * Phụ thuộc:    LÚC CHẠY: OG.Events.on, OG.Save.data.settings / OG.Save.setSetting, OG.Scenes.current,
 *               OG.Level.state, OG.DOM.toast, OG.Audio._music (do src/audio/music.js gắn vào, load SAU file này).
 *               Lúc load chỉ tạo OG.Audio, không đọc module nào khác.
 * Event:        phát: (không — ghi cài đặt qua OG.Save.setSetting, hàm đó tự phát 'settings:change')
 *               nghe: 'input:firstGesture', 'scene:change', 'level:start', 'player:*', 'item:collect', 'boss:*',
 *               'game:*', 'quest:complete', 'quiz:*', 'settings:change'... (đủ danh sách ở bindEvents)
 * API công khai: OG.Audio.init(), playMusic(trackId), stopMusic(fade?), sfx(name, opts?), setVolume(ch, v),
 *               getVolume(ch), mute(bool), isMuted(), toggleMute(), unlock(), isReady(), setDuck(v),
 *               listSfx(), listTracks(), currentTrack · nội bộ cho music.js: OG.Audio._engine
 * Đọc tiếp:     src/audio/music.js (sequencer dùng tone/noise của file này để phát nhạc nền)
 *               → src/core/input.js (nơi phát 'input:firstGesture') → src/core/save.js (settings)
 * Dữ liệu:      ToneOpts, NoiseOpts (typedef bên dưới, music.js cũng dùng)
 *
 * Hợp đồng (docs/ARCHITECTURE.md mục 8.2):
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
 * Nguyên tắc: KHÔNG BAO GIỜ ném lỗi ra ngoài. Không có AudioContext → mọi hàm là no-op (không làm gì).
 * ========================================================================== */

/**
 * @typedef {Object} ToneOpts  tham số một nốt oscillator có envelope (tone()). Thời gian tính bằng GIÂY.
 * @property {OscillatorType} [type='square']  dạng sóng: 'sine' | 'square' | 'sawtooth' | 'triangle'
 * @property {number} [f=440]  tần số bắt đầu (Hz)
 * @property {number} [f2]  tần số kết thúc — có thì trượt cao độ (pitch slide) từ f tới f2
 * @property {'exp'|'lin'} [slide='exp']  kiểu trượt: hàm mũ (nghe tự nhiên) hay tuyến tính
 * @property {number} [slideDur]  thời gian trượt (mặc định = dur)
 * @property {number} [when]  thời điểm TUYỆT ĐỐI trên đồng hồ AudioContext (music.js dùng)
 * @property {number} [at=0]  độ trễ so với "bây giờ" (SFX dùng) — bỏ qua nếu có when
 * @property {number} [dur=0.1]  độ dài nốt
 * @property {number} [vol=0.2]  âm lượng đỉnh (0..1, trước khi qua bus)
 * @property {number} [a=0.005]  attack: thời gian từ im lặng lên âm lượng đỉnh
 * @property {boolean} [hold]  true = nốt ngân: sau attack chỉ giảm tuyến tính xuống 75% đỉnh ở mốc 70% độ dài rồi mới tắt dần; false = tắt dần ngay sau attack
 * @property {number} [detune]  lệch cao độ (cent; 100 cent = 1 nửa cung)
 * @property {number} [vib]  độ sâu rung (vibrato), cent
 * @property {number} [vibRate=6]  tốc độ rung, Hz
 * @property {{type?: BiquadFilterType, f?: number, f2?: number, q?: number}|null} [filter]  bộ lọc (mặc định lowpass 2000 Hz)
 * @property {AudioNode} [bus]  node đích (mặc định sfxBus; nhạc truyền gain của bản nhạc)
 * @property {boolean} [count]  true = tính vào số voice SFX đang kêu (để giới hạn MAX_VOICES)
 */

/**
 * @typedef {Object} NoiseOpts  tham số một tiếng nhiễu có lọc (noise()) — trống, tiếng nổ, whoosh. Thời gian: GIÂY.
 * @property {number} [when]
 * @property {number} [at=0]
 * @property {number} [dur=0.1]
 * @property {number} [vol=0.2]
 * @property {number} [a=0.003]  attack
 * @property {BiquadFilterType} [type='lowpass']  lowpass = trầm, đục · bandpass = "xì" ở giữa · highpass = xì xì sáng (hi-hat)
 * @property {number} [f=3000]  tần số cắt bắt đầu (Hz)
 * @property {number} [f2]  tần số cắt kết thúc (quét lọc)
 * @property {number} [q=0.8]  độ "nhọn" của bộ lọc
 * @property {AudioNode} [bus]
 * @property {boolean} [count]
 */
(function () {
  'use strict';
  /** @type {any} */
  var OG = (window.OG = window.OG || {});

  // ---------------------------------------------------------------------------
  // Hằng số engine
  // ---------------------------------------------------------------------------
  var SILENCE = 0.0001;          // mức gain "gần như im lặng" — điểm đầu/cuối của envelope
  var MIN_DUR = 0.02;            // giây: nốt / nhiễu ngắn nhất
  var STOP_PAD = 0.05;           // giây: dừng oscillator trễ hơn lúc envelope tắt một chút, tránh cắt cụt
  var GAIN_SMOOTH = 0.05;        // giây: hằng số thời gian khi đổi âm lượng bus (setTargetAtTime)
  var MUSIC_TRIM = 0.55;         // hệ số cân bằng: nhạc nhỏ hơn SFX để tiếng gameplay luôn nghe rõ
  var SFX_TRIM = 0.9;
  var PAUSE_DUCK = 0.3;          // nhạc còn 30% âm lượng khi tạm dừng
  var PITCH_JITTER = 0.04;       // SFX lệch cao độ ngẫu nhiên ±2% mỗi lần phát
  var DEFAULT_SFX_GAP = 0.025;   // giây: khoảng cách tối thiểu mặc định giữa 2 lần phát cùng một SFX
  var MAX_VOICES = 40;           // số voice SFX tối đa cùng lúc (giới hạn để tránh vỡ tiếng / tốn CPU)

  // ---------------------------------------------------------------------------
  // Cài đặt (đọc/ghi qua OG.Save; nếu Save chưa sẵn sàng dùng bản trong bộ nhớ)
  // ---------------------------------------------------------------------------
  var fallbackSettings = { musicVolume: 0.6, sfxVolume: 0.8, masterVolume: 1, muted: false };

  // Luôn đọc settings MỚI NHẤT từ Save (không cache) → reset save / đổi cài đặt ở menu có hiệu lực ngay.
  function settings() {
    try {
      var s = OG.Save && OG.Save.data && OG.Save.data.settings;
      if (s && typeof s === 'object') return s;
    } catch (e) { /* bỏ qua */ }
    return fallbackSettings;
  }

  // Ép v về số trong [0, 1]; không phải số hợp lệ (NaN, chuỗi lạ trong save hỏng) thì dùng fb.
  function num(v, fb) {
    v = +v;
    return isFinite(v) ? Math.max(0, Math.min(1, v)) : fb;
  }

  function saveSetting(key, value) {
    try {
      if (OG.Save && typeof OG.Save.setSetting === 'function' && OG.Save.data && OG.Save.data.settings) {
        OG.Save.setSetting(key, value); // tự commit + phát settings:change (→ applyVolumes qua bindEvents)
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
  // 💡 Khái niệm: audio graph (đồ thị node). Web Audio không "phát file" mà nối các node thành dây chuyền:
  //   nguồn (oscillator / buffer) → bộ lọc → gain → ... → destination (loa). Mỗi nhóm âm đi qua một
  //   GainNode chung gọi là "bus" → chỉnh một núm là đổi âm lượng cả nhóm.
  //   nguồn → sfxBus ─────────────────┐
  //   nguồn → trackGain → musicBus ───┼→ master → compressor → destination
  // ---------------------------------------------------------------------------
  var ctx = null;          // AudioContext (null cho tới lần chạm đầu tiên)
  var master = null, musicBus = null, sfxBus = null, compressor = null;
  var noiseBuf = null;     // 1 giây nhiễu trắng, tạo một lần dùng mãi
  var unlocked = false;
  var supported = !!(window.AudioContext || /** @type {any} */ (window).webkitAudioContext);
  var duck = 1;            // hệ số giảm nhạc khi tạm dừng
  var activeVoices = 0;    // số voice SFX đang kêu (giới hạn để tránh vỡ tiếng)

  /**
   * Tạo AudioContext + bus + noise buffer (chỉ một lần). Trả ctx, hoặc null nếu trình duyệt không hỗ trợ.
   * ⚠️ Bẫy: chỉ gọi hàm này TỪ thao tác của người dùng (xem unlock). Tạo AudioContext lúc load trang thì
   *   trình duyệt để nó ở trạng thái 'suspended' (autoplay policy) và cảnh báo trong console.
   */
  function createContext() {
    if (ctx || !supported) return ctx;
    try {
      var AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      ctx = new AC();
      // Compressor cuối dây chuyền: khi nhiều tiếng chồng lên nhau (nổ + nhạc + nhảy) thì nén bớt đỉnh
      // thay vì để tổng vượt 1.0 và bị méo (clipping). Thông số: ngưỡng −14 dB, tỉ lệ 4:1, attack 4 ms, release 0,2 s.
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

      // 💡 Khái niệm: noise buffer — 1 giây nhiễu trắng (mẫu ngẫu nhiên −1..1) tạo MỘT lần. Mỗi tiếng trống / nổ
      //   chỉ tạo một AudioBufferSourceNode nhỏ đọc buffer này (rẻ), không phải sinh lại hàng chục nghìn mẫu.
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
  // 💡 Khái niệm: đổi gain đột ngột tạo bước nhảy trong sóng âm → tiếng "tách". setTargetAtTime tiến dần
  //   về giá trị mới theo hàm mũ (hằng số thời gian GAIN_SMOOTH: sau 0,05 s đi được ~63% quãng, sau ~0,25 s gần như tới hẳn)
  //   nên nghe mượt.
  function setGain(node, value, immediate) {
    if (!node || !ctx) return;
    try {
      var t = ctx.currentTime;
      // ⚠️ Bẫy: phải cancelScheduledValues trước — nếu không, lịch đổi gain cũ (vd đang fade) vẫn chạy chồng lên.
      node.gain.cancelScheduledValues(t);
      if (immediate) node.gain.setValueAtTime(value, t);
      else { node.gain.setValueAtTime(node.gain.value, t); node.gain.setTargetAtTime(value, t, GAIN_SMOOTH); }
    } catch (e) { /* bỏ qua */ }
  }

  // Áp âm lượng từ settings lên 3 bus. muted chỉ tắt master → bật lại tiếng thì music/sfx vẫn giữ mức cũ.
  function applyVolumes(immediate) {
    if (!ctx) return;
    var muted = !!settings().muted;
    setGain(master, muted ? 0 : getVol('master'), immediate);
    // Nhân thêm hệ số để mức nhạc/sfx cân bằng với nhau.
    setGain(musicBus, getVol('music') * MUSIC_TRIM * duck, immediate);
    setGain(sfxBus, getVol('sfx') * SFX_TRIM, immediate);
  }

  /**
   * Mở khoá âm thanh: tạo/resume AudioContext. Phải gọi từ cử chỉ người dùng (click, phím, chạm).
   * 💡 Khái niệm: autoplay policy — trình duyệt chặn web tự phát tiếng khi người dùng chưa tương tác.
   *   Vì vậy game chờ 'input:firstGesture' (lần bấm/chạm đầu tiên) rồi mới tạo hoặc resume() context.
   */
  function unlock() {
    if (!supported) return false;
    createContext();
    if (!ctx) return false;
    try {
      if (ctx.state === 'suspended' && !document.hidden) {
        // resume() trả Promise: chỉ coi là "đã mở" khi trình duyệt thật sự cho chạy.
        var p = ctx.resume();
        if (p && p.then) p.then(onUnlocked, function () { /* bỏ qua */ });
        else onUnlocked();
      } else {
        onUnlocked();
      }
      // Mẹo cho iOS Safari: phát 1 buffer im lặng (1 mẫu) trong cùng cử chỉ — nếu không, iOS vẫn giữ im lặng.
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
    // Bắt đầu bản nhạc đang được yêu cầu trước khi mở khoá (vd menu gọi playMusic('menu') lúc chưa ai bấm gì).
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
    // onended chạy khi node dừng (sau stop()) → trả lại một "chỗ" voice.
    node.onended = function () { activeVoices = Math.max(0, activeVoices - 1); };
  }

  /**
   * Phát một nốt: oscillator → (bộ lọc) → gain có envelope → bus. Lên lịch theo đồng hồ AudioContext.
   * @param {ToneOpts} o
   * @returns {OscillatorNode|null} null nếu chưa có context hoặc lỗi
   */
  function tone(o) {
    if (!ctx) return null;
    try {
      // 💡 Khái niệm: lên lịch theo đồng hồ AudioContext. Mọi lệnh setValueAtTime/start/stop nhận THỜI ĐIỂM
      //   (giây, theo ctx.currentTime) chứ không phải "ngay bây giờ". Trình duyệt thực thi chính xác tới từng mẫu
      //   âm thanh, nên ta có thể xếp sẵn cả chuỗi nốt (arp, nhạc nền) mà không cần setTimeout.
      var t0 = o.when != null ? o.when : ctx.currentTime + (o.at || 0);
      var dur = Math.max(MIN_DUR, o.dur || 0.1);
      var vol = o.vol == null ? 0.2 : o.vol;
      var a = Math.min(o.a == null ? 0.005 : o.a, dur * 0.5);
      var osc = ctx.createOscillator();
      var g = ctx.createGain();
      osc.type = o.type || 'square';
      var f = Math.max(1, o.f || 440);
      osc.frequency.setValueAtTime(f, t0);
      // Trượt cao độ: tiếng nhảy "vút lên", tiếng bị thương "tụt xuống".
      if (o.f2) {
        if (o.slide === 'lin') osc.frequency.linearRampToValueAtTime(Math.max(1, o.f2), t0 + (o.slideDur || dur));
        else osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + (o.slideDur || dur));
      }
      if (o.detune) osc.detune.setValueAtTime(o.detune, t0);
      // Vibrato: một oscillator thứ hai (LFO — low frequency oscillator, dao động tần số thấp) qua gain
      // = độ sâu (cent), nối vào detune của oscillator chính → cao độ rung lên xuống vibRate lần/giây.
      if (o.vib) {
        var lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.frequency.value = o.vibRate || 6;
        lg.gain.value = o.vib;
        lfo.connect(lg); lg.connect(osc.detune);
        lfo.start(t0); lfo.stop(t0 + dur + STOP_PAD);
      }
      // 💡 Khái niệm: gain envelope (đường bao âm lượng). Bắt đầu im lặng → tăng tuyến tính lên vol trong `a` giây
      //   (attack) → giảm dần theo hàm mũ về im lặng ở cuối nốt (decay). Không có envelope, sóng bật/tắt đột ngột
      //   sẽ nghe "tách" ở đầu và cuối mỗi nốt.
      // ⚠️ Bẫy: exponentialRampToValueAtTime KHÔNG nhận 0 (ném lỗi — hàm mũ không bao giờ chạm 0) nên ta dùng
      //   SILENCE = 0.0001 (≈ −80 dB, tai không nghe thấy) làm điểm đầu và cuối.
      g.gain.setValueAtTime(SILENCE, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + a);
      if (o.hold) {
        // Nốt ngân: giảm chậm (tuyến tính) từ đỉnh xuống 75% ở mốc 70% độ dài, rồi mới tắt dần theo hàm mũ.
        g.gain.linearRampToValueAtTime(vol * 0.75, t0 + dur * 0.7);
        g.gain.exponentialRampToValueAtTime(SILENCE, t0 + dur);
      } else {
        g.gain.exponentialRampToValueAtTime(SILENCE, t0 + dur);
      }
      var last = osc;
      if (o.filter) {
        // Lowpass cắt bớt âm cao của sóng vuông/răng cưa → bớt chói, nghe "tròn" hơn.
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
      // Oscillator chỉ dùng được MỘT lần: start → stop rồi bị huỷ. Nốt sau tạo node mới (rẻ, đó là cách dùng chuẩn).
      osc.stop(t0 + dur + STOP_PAD);
      if (o.count) trackVoice(osc);
      return osc;
    } catch (e) { return null; }
  }

  /**
   * Phát một tiếng nhiễu có lọc: noise buffer → bộ lọc biquad → gain có envelope → bus.
   * @param {NoiseOpts} o
   * @returns {AudioBufferSourceNode|null}
   */
  function noise(o) {
    if (!ctx || !noiseBuf) return null;
    try {
      var t0 = o.when != null ? o.when : ctx.currentTime + (o.at || 0);
      var dur = Math.max(MIN_DUR, o.dur || 0.1);
      var src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      // Buffer chỉ dài 1 s và (bên dưới) bắt đầu đọc ở vị trí ngẫu nhiên tới 0,5 s: tiếng dài hơn 0,9 s thì bật loop
      // cho khỏi hụt. Tiếng 0,5–0,9 s không loop nên có thể hết buffer sớm khi offset lớn — lúc đó envelope đã
      // tắt gần hết nên khó nghe ra, đổi ngưỡng 0.9 sẽ đổi âm thanh nên giữ nguyên.
      src.loop = dur > 0.9;
      var bq = ctx.createBiquadFilter();
      bq.type = o.type || 'lowpass';
      bq.frequency.setValueAtTime(o.f || 3000, t0);
      if (o.f2) bq.frequency.exponentialRampToValueAtTime(Math.max(10, o.f2), t0 + dur);
      bq.Q.value = o.q || 0.8;
      var g = ctx.createGain();
      var vol = o.vol == null ? 0.2 : o.vol;
      var a = Math.min(o.a == null ? 0.003 : o.a, dur * 0.5);
      g.gain.setValueAtTime(SILENCE, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + a);
      g.gain.exponentialRampToValueAtTime(SILENCE, t0 + dur);
      src.connect(bq); bq.connect(g); g.connect(o.bus || sfxBus);
      // Bắt đầu đọc buffer ở vị trí ngẫu nhiên (0..0,5 s) → hai tiếng trống liên tiếp không giống hệt nhau.
      src.start(t0, Math.random() * 0.5);
      src.stop(t0 + dur + STOP_PAD);
      if (o.count) trackVoice(src);
      return src;
    } catch (e) { return null; }
  }

  // 💡 Khái niệm: MIDI → tần số. Nốt MIDI 69 = La4 = 440 Hz; mỗi nửa cung nhân tần số với 2^(1/12),
  //   lên 12 nửa cung (1 quãng tám) thì tần số gấp đôi. Vd mtof(81) = 880 Hz, mtof(60) ≈ 261,6 Hz (Đô giữa).
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // Chuỗi nốt nhanh (arpeggio). notes: mảng số MIDI; step: giây giữa 2 nốt; base: ToneOpts chung cho mọi nốt.
  function arp(notes, step, base) {
    for (var i = 0; i < notes.length; i++) {
      /** @type {ToneOpts} bản sao nông của base (không sửa base vì nó dùng chung cho cả chuỗi) */
      var o = {};
      for (var k in base) o[k] = base[k];
      o.f = mtof(notes[i]);
      o.at = (base.at || 0) + i * step;
      tone(o);
    }
  }

  // ---------------------------------------------------------------------------
  // Thư viện SFX (data-driven: mỗi tiếng là "công thức" ghép vài tone/noise).
  // Mỗi hàm nhận p (hệ số cao độ, 1 = gốc) và v (hệ số âm lượng, 1 = gốc).
  // Số MIDI trong arp: 72 = Đô5, 76 = Mi5, 79 = Sol5, 84 = Đô6 (hợp âm Đô trưởng nghe "vui, thắng lợi").
  // 🧪 Thử: gõ trong console OG.Audio.sfx('jump', { pitch: 2 }) — tiếng nhảy cao gấp đôi (lên 1 quãng tám);
  //   pitch 0.5 thì trầm như nhân vật khổng lồ.
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
    // ---- trùm ----
    bossHit: function (p, v) {
      tone({ type: 'sawtooth', f: 180 * p, f2: 55, dur: 0.25, vol: 0.18 * v, count: C, filter: { type: 'lowpass', f: 1600 } });
      noise({ dur: 0.18, vol: 0.18 * v, type: 'lowpass', f: 3000, f2: 400, count: C });
      tone({ type: 'square', f: 880 * p, f2: 1320 * p, at: 0.02, dur: 0.08, vol: 0.06 * v, count: C });
    },
    bossDefeat: function (p, v) {
      // tiếng nổ dài (nhiễu quét lọc xuống) + tiếng "rơi" trầm, rồi fanfare đi lên ở 0,75 s
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
    phase: function (p, v) { // trùm chuyển giai đoạn — 2 tiếng còi báo động đi lên
      tone({ type: 'square', f: 300, f2: 900, dur: 0.35, vol: 0.08 * v, slide: 'lin', count: C, filter: { type: 'lowpass', f: 2500 } });
      tone({ type: 'square', f: 300, f2: 900, at: 0.35, dur: 0.35, vol: 0.08 * v, slide: 'lin', count: C, filter: { type: 'lowpass', f: 2500 } });
    },
    // ---- giao diện ----
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
    dash: function (p, v) { // whoosh khi bấm action — nhiễu bandpass quét lên
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

  // Khoảng cách tối thiểu (giây) giữa 2 lần phát cùng một SFX — chống dồn tiếng
  // (vd 10 đồng xu nhặt trong 1 frame chỉ kêu 1 lần thay vì 10 lần chồng lên nhau, to gấp 10).
  var MIN_GAP = { land: 0.12, coin: 0.035, click: 0.05, stomp: 0.05, jump: 0.05, locked: 0.4, dash: 0.08, select: 0.05 };
  var lastPlayed = {};
  // Tên thay thế để tương thích.
  var ALIAS = { pizza: 'collect', hit: 'hurt', bossdefeat: 'bossDefeat', bosshit: 'bossHit', deny: 'error' };

  /**
   * Phát một SFX theo tên nếu được phép (đã mở khoá, không tắt tiếng, chưa quá MAX_VOICES, không quá dày).
   * @param {string} name
   * @param {{pitch?: number, vol?: number, noVary?: boolean}} [opts]
   * @returns {boolean} true nếu thật sự phát
   */
  function playSfx(name, opts) {
    if (!ready() || settings().muted) return false;
    if (getVol('sfx') <= 0 || getVol('master') <= 0) return false;
    name = ALIAS[name] || name;
    var fn = SFX[name];
    if (!fn) return false;
    if (activeVoices > MAX_VOICES) return false;
    var now = ctx.currentTime;
    var gap = MIN_GAP[name] || DEFAULT_SFX_GAP;
    if (lastPlayed[name] != null && now - lastPlayed[name] < gap) return false;
    lastPlayed[name] = now;
    opts = opts || {};
    // Lệch cao độ ngẫu nhiên nhỏ để bớt nhàm (cùng một tiếng nhảy 100 lần nghe như máy).
    var p = (opts.pitch || 1) * (opts.noVary ? 1 : 1 + (Math.random() - 0.5) * PITCH_JITTER);
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

  // Ducking: hạ âm lượng nhạc (không dừng) — vd khi mở màn hình tạm dừng.
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
  // Cao độ tiếng nhảy theo nhân vật: Jack to con → trầm hơn, Olivia → cao hơn.
  var CHAR_PITCH = { oggy: 1, jack: 0.88, olivia: 1.15 };

  var levelTrack = null;   // bản nhạc của màn hiện tại (từ level:start)
  var bossTrack = 'boss';
  var lastLives = null;    // số mạng lần trước — để nhận ra "được thêm mạng" từ lives:change

  // Đổi nhạc theo scene. Payload: {from, to, params, push?, pop?} (scene stack: push = chồng lên, pop = quay lại).
  function onSceneChange(e) {
    var to = e && e.to;
    if (!to) return;
    if (to === 'pause') { setDuck(PAUSE_DUCK); return; }
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

  // 💡 Khái niệm: observer — Audio chỉ NGHE event. Player phát 'player:jump' mà không biết Audio tồn tại;
  //   xoá cả thư mục src/audio/ thì game vẫn chạy, chỉ là im lặng.
  function bindEvents() {
    var E = OG.Events;
    if (!E || typeof E.on !== 'function') return;
    // ⚠️ Bẫy: bọc MỌI listener bằng try/catch — lỗi âm thanh (vd payload thiếu field) tuyệt đối không được
    //   lan sang code gameplay đang emit. `p || {}` để listener không phải kiểm tra payload undefined.
    function on(name, fn) {
      E.on(name, function (p) { try { fn(p || {}); } catch (e) { /* không bao giờ làm hỏng gameplay */ } });
    }

    // ---- mở khoá & nhạc theo scene ----
    on('input:firstGesture', function () { unlock(); });
    on('scene:change', onSceneChange);

    // ---- màn chơi ----
    on('game:start', function (p) { lastLives = p.run && p.run.lives != null ? p.run.lives : null; });
    on('level:start', function (p) {
      levelTrack = p.music || p.theme || 'kitchen';
      Audio.playMusic(levelTrack);
    });
    on('level:exitLocked', function () { playSfx('locked'); });
    on('door:enter', function () { playSfx('door'); });
    on('level:complete', function (r) { if (!r.isFinal) playSfx('victory'); });

    // ---- người chơi & vật phẩm ----
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

    // ---- trùm ----
    on('boss:start', function (p) {
      bossTrack = p.bossId === 'trio' ? 'bossFinal' : 'boss';
      playSfx('bossStart');
      Audio.playMusic(bossTrack);
    });
    on('boss:hit', function () { playSfx('bossHit'); });
    on('boss:phase', function () { playSfx('phase'); });
    on('boss:defeated', function () { Audio.stopMusic(0.4); playSfx('bossDefeat'); });

    // ---- luồng game & giao diện ----
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

    // ---- cài đặt ----
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
    // Tham số true = capture phase: nhận event TRƯỚC mọi handler khác, kể cả khi chúng gọi stopPropagation().
    var gesture = function () { OG.Audio._gestured = true; resumeIfNeeded(); };
    ['pointerdown', 'touchend', 'keydown', 'mousedown'].forEach(function (n) {
      try { window.addEventListener(n, gesture, true); } catch (e) { /* bỏ qua */ }
    });
    // Ẩn tab → suspend() để dừng hẳn đồng hồ âm thanh (nhạc không chạy "ngầm", sequencer tự chờ ở music.js).
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
        var target = /** @type {HTMLElement} */ (e.target);
        var tg = target && target.tagName;
        if (tg === 'INPUT' || tg === 'TEXTAREA' || (target && target.isContentEditable)) return;
        var m = Audio.toggleMute();
        try { if (OG.DOM && OG.DOM.toast) OG.DOM.toast(m ? '🔇 Đã tắt tiếng (M)' : '🔊 Đã bật tiếng (M)', 1.2); } catch (err) { /* bỏ qua */ }
      });
    } catch (e) { /* bỏ qua */ }
  }

  // ---------------------------------------------------------------------------
  // API công khai — mọi hàm bọc try/catch: Audio không bao giờ được làm hỏng game.
  // ---------------------------------------------------------------------------
  var inited = false;
  var Audio = (OG.Audio = {
    /** @type {string|null} id bản nhạc đang (hoặc sẽ) phát; giữ cả khi chưa mở khoá để phát ngay sau đó */
    currentTrack: null,
    supported: supported,
    _gestured: false,

    /**
     * Khởi tạo: đăng ký listener OG.Events và DOM. Gọi nhiều lần vẫn chỉ đăng ký một lần.
     */
    init: function () {
      if (inited) return;
      inited = true;
      try { bindEvents(); } catch (e) { console.warn('[OG.Audio] bindEvents', e); }
      try { bindDom(); } catch (e) { console.warn('[OG.Audio] bindDom', e); }
    },

    /**
     * Mở khoá thủ công (UI có thể gọi trong handler click).
     * @returns {boolean} false nếu trình duyệt không hỗ trợ Web Audio
     */
    unlock: function () { try { return unlock(); } catch (e) { return false; } },
    /**
     * Kiểm tra đã có thể phát âm chưa (context đã tạo, đã mở khoá, chưa đóng).
     * @returns {boolean}
     */
    isReady: function () { return ready(); },

    /**
     * Phát nhạc nền. Gọi lại cùng bản đang phát thì không làm gì; chưa mở khoá thì ghi nhớ để phát sau.
     * @param {string} trackId  id hoặc alias (vd 'level' → 'kitchen'); id lạ bị bỏ qua
     * @example
     *   OG.Audio.playMusic('boss');
     */
    playMusic: function (trackId) {
      try {
        if (!trackId) return;
        var m = Audio._music;
        if (m && m.resolve) trackId = m.resolve(trackId);
        if (!trackId) return;
        // Bỏ qua nếu đang phát đúng bản này (hoặc chưa sẵn sàng — onUnlocked sẽ phát currentTrack sau).
        if (Audio.currentTrack === trackId && (!m || !m.isPlaying || m.isPlaying(trackId) || !ready())) return;
        Audio.currentTrack = trackId;
        startTrack(trackId);
      } catch (e) { /* bỏ qua */ }
    },

    /**
     * Dừng nhạc nền, nhỏ dần trong `fade` giây.
     * @param {number} [fade=0.5]  giây
     */
    stopMusic: function (fade) {
      try {
        Audio.currentTrack = null;
        var m = Audio._music;
        if (m && m.stop) m.stop(fade == null ? 0.5 : fade);
      } catch (e) { /* bỏ qua */ }
    },

    /**
     * Phát một hiệu ứng âm thanh (danh sách: listSfx()).
     * @param {string} name  vd 'jump', 'coin', 'bossHit' (hoặc alias: 'pizza', 'hit'...)
     * @param {{pitch?: number, vol?: number, noVary?: boolean}} [opts]  pitch/vol là hệ số (1 = gốc)
     * @returns {boolean} true nếu thật sự phát (false khi tắt tiếng, chưa mở khoá, phát quá dày...)
     * @example
     *   OG.Audio.sfx('coin');
     *   OG.Audio.sfx('select', { pitch: 0.75, vol: 0.6 });
     */
    sfx: function (name, opts) {
      try { return playSfx(name, opts); } catch (e) { return false; }
    },

    /**
     * Đặt âm lượng một kênh và lưu vào save (qua OG.Save.setSetting → phát 'settings:change').
     * @param {'music'|'sfx'|'master'} channel
     * @param {number} v  0..1 (ngoài khoảng bị kẹp lại)
     */
    setVolume: function (channel, v) {
      try {
        var key = KEY_OF[channel];
        if (!key) return;
        saveSetting(key, num(v, DEFAULT_VOL[channel]));
      } catch (e) { /* bỏ qua */ }
    },
    /**
     * Lấy âm lượng một kênh.
     * @param {'music'|'sfx'|'master'} channel
     * @returns {number} 0..1 (kênh lạ trả 0)
     */
    getVolume: function (channel) {
      try { return getVol(channel); } catch (e) { return 0; }
    },
    /**
     * Bật/tắt tiếng toàn bộ (lưu vào save).
     * @param {boolean} m  true = tắt tiếng
     */
    mute: function (m) {
      try { saveSetting('muted', !!m); } catch (e) { /* bỏ qua */ }
    },
    /**
     * Kiểm tra đang tắt tiếng không.
     * @returns {boolean}
     */
    isMuted: function () {
      try { return !!settings().muted; } catch (e) { return false; }
    },
    /**
     * Đảo trạng thái tắt tiếng.
     * @returns {boolean} trạng thái MỚI (true = đang tắt tiếng)
     */
    toggleMute: function () {
      Audio.mute(!Audio.isMuted());
      return Audio.isMuted();
    },

    /**
     * Đặt hệ số giảm nhạc (ducking): 1 = bình thường, 0.3 = nhỏ lại khi tạm dừng.
     * @param {number} v  0..1
     */
    setDuck: function (v) { try { setDuck(v); } catch (e) { /* bỏ qua */ } },
    /**
     * Liệt kê tên các SFX.
     * @returns {string[]}
     */
    listSfx: function () { return Object.keys(SFX); },
    /**
     * Liệt kê id các bản nhạc (do music.js cung cấp; rỗng nếu music.js chưa load).
     * @returns {string[]}
     */
    listTracks: function () { var m = Audio._music; return m && m.list ? m.list() : []; },

    // Nội bộ: music.js dùng các khối tổng hợp này. ctx/musicBus là HÀM (không phải giá trị) vì
    // AudioContext chỉ được tạo sau thao tác đầu tiên — đọc lúc gọi mới có giá trị mới nhất.
    _engine: {
      ctx: function () { return ctx; },
      ready: ready,
      musicBus: function () { return musicBus; },
      tone: tone,
      noise: noise,
      mtof: mtof
    },
    // Giữ lại _music nếu music.js lỡ load trước file này (thứ tự <script> sai) — không mất sequencer.
    _music: (OG.Audio && OG.Audio._music) || null
  });
})();
