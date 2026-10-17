// @ts-check
/* ============================================================================
 * OG.Audio (phần nhạc nền) — SEQUENCER THEO NHỊP + DỮ LIỆU CÁC BẢN NHẠC TỔNG HỢP
 * ----------------------------------------------------------------------------
 * Vai trò:      Biên dịch các bản nhạc viết dạng chữ (TRACKS) thành lưới bước, rồi phát bằng một sequencer
 *               (bộ phát tuần tự) lên lịch trước theo đồng hồ AudioContext. OG.Audio.playMusic (audio.js)
 *               gọi OG.Audio._music.play(id); file này KHÔNG tự nghe event.
 * Khái niệm:    sequencer · lookahead scheduling (lên lịch trước một khoảng ngắn) · đồng hồ AudioContext vs
 *               setInterval · data-driven (bản nhạc là dữ liệu chữ) · biên dịch dữ liệu một lần + cache ·
 *               MIDI & hợp âm · swing · crossfade giữa hai bản nhạc
 * Bài học:      docs/learn/10-web-audio.md (mục sequencer)
 * Phụ thuộc:    LÚC CHẠY: OG.Audio._engine (ctx, ready, musicBus, tone, noise, mtof) do src/audio/audio.js tạo.
 *               Load SAU audio.js; lúc load chỉ gắn OG.Audio.tracks và OG.Audio._music.
 * Event:        phát: (không) · nghe: (không)
 * API công khai: OG.Audio.tracks (thêm bản nhạc: OG.Audio.tracks.<id> = {...}, định nghĩa sau khi file này load
 *               đều được) · nội bộ: OG.Audio._music.resolve/list/isPlaying/play/stop/_compile
 * Đọc tiếp:     src/audio/audio.js (tone/noise — cách một nốt thật sự kêu) → docs/learn/10-web-audio.md
 * Dữ liệu:      TrackDef, SongEvent, CompiledSong, MusicVoice (typedef ngay bên dưới)
 *
 * Định dạng bản nhạc:
 *   Mỗi bản nhạc gồm: giai điệu (lead), bass (sinh tự động từ hợp âm theo "style"),
 *   pad hợp âm, arpeggio (vòng lặp thứ 2) và trống (kick/snare/hat). Lưới 16 bước / ô nhịp (mỗi bước = nốt móc kép).
 *   Cú pháp giai điệu: mỗi ô nhịp là 1 chuỗi 16 token cách nhau bởi dấu cách:
 *     'C5', 'F#4', 'Bb3' = nốt;  '.' = nghỉ;  '-' = ngân nốt trước thêm 1 bước.
 *   Trống: chuỗi 16 ký tự cho 1 ô nhịp (lặp lại mỗi ô): 'x' = đánh, 'X' = đánh mạnh, '.' = nghỉ.
 *   Hợp âm: tên như 'C', 'Am', 'F#m', 'Bb' — 1 hợp âm / ô nhịp.
 *   Bản nhạc có loop:true sẽ phát 2 lượt (lượt 2 thêm arpeggio) rồi lặp lại. loop:false = jingle.
 * ========================================================================== */

/**
 * @typedef {Object} TrackDef  một bản nhạc dạng dữ liệu (OG.Audio.tracks.<id>)
 * @property {number} [bpm=120]  nhịp/phút (beat per minute); 1 beat = 4 bước
 * @property {boolean} [loop]  true = nhạc nền lặp; false = jingle phát 1 lần
 * @property {number} [swing]  0..~0.15: đẩy chậm các bước lẻ (tỉ lệ của 2 bước)
 * @property {number} [tail]  (jingle) giây chờ sau nốt cuối trước khi tắt bộ hẹn giờ
 * @property {string} [extend]  id bản nhạc gốc để kế thừa mọi field (vd bossFinal kế thừa boss)
 * @property {number} [transpose]  dịch cao độ, đơn vị nửa cung
 * @property {{wave?: OscillatorType, vol?: number, cutoff?: number, vib?: number}} [lead]  giai điệu
 * @property {{wave?: OscillatorType, vol?: number, style?: string, cutoff?: number}} [bass]  style: khoá BASS_STYLES
 * @property {{wave?: OscillatorType, vol?: number, cutoff?: number}} [pad]  hợp âm nền
 * @property {string[]} [chords]  1 hợp âm / ô nhịp, lặp vòng nếu ít hơn số ô
 * @property {string[]} [melody]  1 chuỗi 16 token / ô nhịp — số phần tử = số ô nhịp của bản
 * @property {{kick?: string, snare?: string, hat?: string, crashBar?: number[]}} [drums]
 */

/**
 * @typedef {Object} SongEvent  một sự kiện trong lưới bước sau khi biên dịch
 * @property {'lead'|'bass'|'pad'|'arp'|'kick'|'snare'|'hat'|'crash'} ch  kênh (nhạc cụ)
 * @property {number} [midi]  số MIDI của nốt (kênh có cao độ)
 * @property {number} [len]  độ dài tính bằng BƯỚC
 * @property {number} [acc]  (trống) 1 = thường, 2 = nhấn mạnh
 */

/**
 * @typedef {Object} CompiledSong  bản nhạc đã biên dịch (cache trong `compiled`)
 * @property {string} id
 * @property {TrackDef} def  định nghĩa đã gộp extend
 * @property {SongEvent[][]} steps  steps[i] = các sự kiện ở bước i
 * @property {number} total  tổng số bước (đã nhân số lượt)
 * @property {number} stepDur  giây mỗi bước = 60 / bpm / 4
 */

/**
 * @typedef {Object} MusicVoice  trạng thái bản nhạc ĐANG phát của sequencer
 * @property {string} id
 * @property {CompiledSong} song
 * @property {GainNode} gain  gain riêng của bản này (để fade in/out độc lập khi chuyển bài)
 * @property {number} step  bước sẽ lên lịch tiếp theo
 * @property {number} nextTime  thời điểm (giây, đồng hồ AudioContext) của bước đó
 * @property {boolean} done  jingle đã lên lịch hết nốt
 * @property {number} endAt  (jingle) lúc có thể tắt bộ hẹn giờ
 */
(function () {
  'use strict';
  /** @type {any} */
  var OG = (window.OG = window.OG || {});
  OG.Audio = OG.Audio || {};

  var STEPS_PER_BAR = 16;   // lưới 16 bước / ô nhịp 4/4
  var LOOP_PASSES = 2;      // bản lặp được biên dịch thành 2 lượt (lượt 2 thêm arpeggio) rồi mới quay lại đầu

  // ---------------------------------------------------------------------------
  // Dữ liệu bản nhạc
  // 💡 Khái niệm: data-driven — bản nhạc là DỮ LIỆU chữ, không phải code. Thêm bài mới chỉ cần thêm một object;
  //   compile() lo phần biến chữ thành nốt. Người không biết lập trình cũng "soạn nhạc" được.
  // ---------------------------------------------------------------------------
  /** @type {Object<string, TrackDef>} */
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
    // 🧪 Thử: đổi transpose 2 → -5 rồi vào trận trio — cùng giai điệu nhưng trầm và "đáng sợ" hơn hẳn.
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
  // Số nửa cung của 7 nốt trắng tính từ Đô (C) trong một quãng tám.
  var NOTE_SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // 'F#4' → 66. Quy ước MIDI: C4 (Đô giữa) = 60 = 12 × (4 + 1) + 0. Token sai cú pháp → null (bị bỏ qua).
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
    // +12 rồi % 12: 'Cb' cho s = −1 → 11 (Si), không ra số âm.
    return { root: (s + 12) % 12, minor: m[3] === 'm' };
  }

  // Các mẫu bass: [bước, quãng (nửa cung so với gốc), độ dài (bước)]. 0 = nốt gốc, 7 = quãng năm, 12 = quãng tám.
  var BASS_STYLES = {
    bounce: [[0, 0, 2], [3, 0, 1], [4, 7, 2], [8, 12, 2], [10, 7, 1], [12, 0, 2], [14, 7, 1]],
    walk: [[0, 0, 3], [4, 7, 3], [8, 12, 3], [12, 7, 3]],
    drive: [[0, 0, 1], [2, 0, 1], [4, 12, 1], [6, 0, 1], [8, 0, 1], [10, 12, 1], [12, 0, 1], [14, 7, 1]],
    gallop: [[0, 0, 1], [1, 0, 1], [2, 12, 1], [4, 0, 1], [5, 0, 1], [6, 12, 1], [8, 0, 1], [9, 0, 1], [10, 12, 1], [12, 0, 1], [13, 0, 1], [14, 7, 1], [15, 6, 1]],
    spooky: [[0, 0, 3], [6, 0, 2], [8, 7, 3], [14, 6, 2]],
    hits: [[0, 0, 2], [8, 7, 2], [12, 0, 4]],
    long: [[0, 0, 15]]
  };

  // Dàn trải mẫu trống 16 ký tự sang toàn bộ ô nhịp: 'x' → 1, 'X' → 2 (nhấn), còn lại → 0. Thiếu ký tự = nghỉ.
  function drumHits(pattern) {
    var out = [];
    pattern = pattern || '';
    for (var i = 0; i < STEPS_PER_BAR; i++) {
      var c = pattern.charAt(i);
      out.push(c === 'X' ? 2 : c === 'x' ? 1 : 0);
    }
    return out;
  }

  // Gộp bản nhạc có `extend`: chép mọi field của bản gốc rồi ghi đè bằng field của bản con (kế thừa nông).
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

  // ---------------------------------------------------------------------------
  // Biên dịch bản nhạc thành mảng bước: steps[i] = [{ch, midi, len, acc}]
  // 💡 Khái niệm: biên dịch MỘT lần + cache. Phân tích chuỗi tốn công nhưng chỉ làm lần đầu phát bài;
  //   sequencer lúc chạy chỉ đọc mảng có sẵn (rẻ) — quan trọng vì tick() chạy 40 lần/giây.
  // ⚠️ Bẫy: thứ tự add() trong một bước cũng là thứ tự playEvent tạo node và gọi Math.random() (detune của pad,
  //   offset của nhiễu). Nếu sửa compile, giữ nguyên thứ tự giai điệu → hợp âm → trống: khi đó mảng steps giống
  //   hệt bản cũ (so được bằng JSON.stringify(OG.Audio._music._compile('menu'))) — cách chắc nhất để biết refactor
  //   không đổi bản nhạc.
  // ---------------------------------------------------------------------------
  /** @type {Object<string, CompiledSong>} */
  var compiled = {};

  // Giai điệu: token nốt → sự kiện lead; '-' kéo dài sự kiện trước thêm 1 bước; '.' = nghỉ.
  function compileMelodyBar(def, b, off, tr, add) {
    var toks = String(def.melody[b]).split(/\s+/).filter(function (t) { return t && t !== '|'; });
    var lastEv = null;
    for (var s = 0; s < STEPS_PER_BAR && s < toks.length; s++) {
      var tk = toks[s];
      if (tk === '-') { if (lastEv) lastEv.len++; continue; }
      lastEv = null;
      if (tk === '.') continue;
      var midi = noteToMidi(tk);
      if (midi == null) continue;
      lastEv = { ch: 'lead', midi: midi + tr, len: 1 };
      add(off + s, lastEv);
    }
  }

  // Hợp âm: pad (3 nốt ngân cả ô) + bass theo style + (lượt 2) arpeggio rải hợp âm.
  function compileHarmonyBar(def, b, off, tr, pass, add) {
    var ch = parseChord(def.chords[b % def.chords.length]);
    var third = ch.minor ? 3 : 4;              // quãng ba thứ (3 nửa cung) hay trưởng (4) — "buồn" hay "vui"
    var padRoot = 48 + ch.root + tr;           // quãng tám 3–4
    if (padRoot < 52) padRoot += 12;
    add(off, { ch: 'pad', midi: padRoot, len: STEPS_PER_BAR });
    add(off, { ch: 'pad', midi: padRoot + third, len: STEPS_PER_BAR });
    add(off, { ch: 'pad', midi: padRoot + 7, len: STEPS_PER_BAR });
    var bassRoot = 36 + ch.root + tr;          // quanh quãng tám 1–2 (MIDI 32..43, trầm hơn pad)
    if (bassRoot > 43) bassRoot -= 12;
    var style = BASS_STYLES[(def.bass && def.bass.style) || 'walk'] || BASS_STYLES.walk;
    for (var n = 0; n < style.length; n++) {
      add(off + style[n][0], { ch: 'bass', midi: bassRoot + style[n][1], len: style[n][2] });
    }
    if (pass === 1) {
      var arpNotes = [0, third, 7, 12, 7, third];
      for (var s = 0; s < STEPS_PER_BAR; s += 2) {
        add(off + s, { ch: 'arp', midi: padRoot + 12 + arpNotes[(s / 2) % arpNotes.length], len: 1 });
      }
    }
  }

  // Trống: kick / snare / hat theo mẫu; ô nhịp cuối của vòng lặp thay snare bằng đoạn fill 4 bước.
  function compileDrumBar(def, b, bars, pass, passes, off, add) {
    var d = def.drums || {};
    var kk = drumHits(d.kick), sn = drumHits(d.snare), hh = drumHits(d.hat);
    var lastBarOfLoop = def.loop && b === bars - 1 && pass === passes - 1;
    for (var s = 0; s < STEPS_PER_BAR; s++) {
      if (kk[s]) add(off + s, { ch: 'kick', acc: kk[s] });
      // Fill trống ở ô nhịp cuối vòng lặp (4 bước cuối, bước cuối cùng nhấn mạnh) — báo tai "sắp quay lại đầu".
      if (lastBarOfLoop && s >= 12) add(off + s, { ch: 'snare', acc: 1 + (s === 15 ? 1 : 0) });
      else if (sn[s]) add(off + s, { ch: 'snare', acc: sn[s] });
      if (hh[s]) add(off + s, { ch: 'hat', acc: hh[s] });
    }
    if (d.crashBar && d.crashBar.indexOf(b) >= 0) add(off, { ch: 'crash', acc: 1 });
  }

  /**
   * Biên dịch (có cache) bản nhạc thành lưới bước.
   * @param {string} id  id đã resolve
   * @returns {CompiledSong|null}
   */
  function compile(id) {
    if (compiled[id]) return compiled[id];
    var def = resolveDef(id);
    if (!def) return null;
    var tr = def.transpose || 0;
    var bars = def.melody.length;
    var passes = def.loop ? LOOP_PASSES : 1;
    var total = bars * STEPS_PER_BAR * passes;
    /** @type {SongEvent[][]} */
    var steps = [];
    for (var i = 0; i < total; i++) steps.push([]);

    function add(step, ev) { if (step >= 0 && step < total) steps[step].push(ev); }

    for (var pass = 0; pass < passes; pass++) {
      var off0 = pass * bars * STEPS_PER_BAR;
      for (var b = 0; b < bars; b++) {
        var off = off0 + b * STEPS_PER_BAR;  // chỉ số bước đầu tiên của ô nhịp này
        compileMelodyBar(def, b, off, tr, add);
        compileHarmonyBar(def, b, off, tr, pass, add);
        compileDrumBar(def, b, bars, pass, passes, off, add);
      }
    }
    // Crash đầu vòng lặp cho bản có lặp
    if (def.loop) add(0, { ch: 'crash', acc: 1 });

    // stepDur: 1 beat = 60 / bpm giây, 1 bước = 1/4 beat (nốt móc kép).
    compiled[id] = { id: id, def: def, steps: steps, total: total, stepDur: 60 / (def.bpm || 120) / 4 };
    return compiled[id];
  }

  // ---------------------------------------------------------------------------
  // Phát âm thanh của từng kênh (mỗi kênh = một "nhạc cụ" tổng hợp từ tone/noise của audio.js)
  // ---------------------------------------------------------------------------
  // Đọc engine LÚC GỌI (không lưu lúc load) vì audio.js tạo _engine; và ctx chỉ có sau thao tác đầu tiên.
  function E() { return OG.Audio._engine; }

  /**
   * Phát một sự kiện ở thời điểm t (giây, đồng hồ AudioContext).
   * @param {SongEvent} ev
   * @param {number} t
   * @param {CompiledSong} song
   * @param {GainNode} bus  gain riêng của bản nhạc
   */
  function playEvent(ev, t, song, bus) {
    var eng = E(), def = song.def, sd = song.stepDur;
    var mtof = eng.mtof;
    switch (ev.ch) {
      case 'lead': {
        // dur × 0.95: nhả nốt sớm một chút để 2 nốt liền nhau vẫn nghe tách bạch; nốt dài (> 2 bước) tự rung nhẹ.
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
        // attack chậm (0,08 s) + detune ngẫu nhiên ±4 cent: 3 nốt hơi lệch nhau nghe "dày" và ấm như dàn dây.
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
      // ---- trống: cũng chỉ là tone/noise với envelope rất ngắn ----
      case 'kick':
        // Trống bass = sóng sine trượt nhanh 150 → 42 Hz trong 0,12 s ("bùm").
        eng.tone({ type: 'sine', f: 150, f2: 42, slideDur: 0.12, when: t, dur: 0.2, vol: ev.acc > 1 ? 0.42 : 0.34, bus: bus });
        break;
      case 'snare':
        // Trống snare = nhiễu bandpass (tiếng dây "xẹt") + một tone ngắn (thân trống).
        eng.noise({ when: t, dur: 0.13, vol: ev.acc > 1 ? 0.17 : 0.12, type: 'bandpass', f: 1900, q: 0.7, bus: bus });
        eng.tone({ type: 'triangle', f: 210, f2: 140, when: t, dur: 0.08, vol: 0.08, bus: bus });
        break;
      case 'hat':
        // Hi-hat = nhiễu highpass rất ngắn; nhấn mạnh (acc 2) thì dài hơn như hi-hat mở.
        eng.noise({ when: t, dur: ev.acc > 1 ? 0.12 : 0.035, vol: ev.acc > 1 ? 0.06 : 0.035, type: 'highpass', f: 7500, bus: bus });
        break;
      case 'crash':
        eng.noise({ when: t, dur: 1.1, vol: 0.06, type: 'highpass', f: 5000, f2: 3000, bus: bus });
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Sequencer (lên lịch trước bằng đồng hồ AudioContext)
  // 💡 Khái niệm: lookahead scheduling. setInterval KHÔNG chính xác (lệch vài–vài chục ms, tab nền còn bị
  //   chậm lại) — dùng nó để phát nốt "ngay" thì nhịp sẽ lảo đảo. Thay vào đó, cứ mỗi TICK_MS ta nhìn trước
  //   LOOKAHEAD giây và giao cho Web Audio mọi nốt rơi vào khoảng đó kèm THỜI ĐIỂM chính xác (when).
  //   Đồng hồ âm thanh (ctx.currentTime) chạy chuẩn trong luồng audio riêng, nên nhịp luôn đều.
  //   Điều kiện: LOOKAHEAD > TICK_MS (0,15 s > 0,025 s) để không bao giờ có khoảng trống chưa được lên lịch.
  // 🧪 Thử: đổi LOOKAHEAD 0.15 → 0.01 (nhỏ hơn TICK_MS) rồi mở nhạc menu và kéo/thu phóng cửa sổ cho máy bận —
  //   nhiều nốt bị lên lịch vào thời điểm đã qua nên phát trễ, nhịp lảo đảo.
  // ---------------------------------------------------------------------------
  var LOOKAHEAD = 0.15;      // lên lịch trước bao nhiêu giây
  var TICK_MS = 25;          // ms giữa 2 lần tick() kiểm tra
  var LATE_TOLERANCE = 0.05; // giây: trễ hơn mức này coi như bị tụt lại (tab nền) → nhảy tới
  var RESYNC_DELAY = 0.03;   // giây: khi nhảy tới, bắt đầu lại sau "bây giờ" một chút
  var timer = null;
  /** @type {MusicVoice|null} {id, song, gain, step, nextTime, done, endAt} */
  var cur = null;

  function ensureTimer() {
    if (timer) return;
    timer = setInterval(tick, TICK_MS);
  }
  function clearTimer() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  // Lên lịch mọi bước có thời điểm < now + LOOKAHEAD. Chạy mỗi TICK_MS (và một lần ngay khi play()).
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
      // Bị tụt lại (luồng chính bị nghẽn, hoặc trình duyệt làm chậm timer trong khi AudioContext vẫn chạy)
      // → nhảy tới, không xả hàng loạt nốt. (Ẩn tab thì audio.js suspend ctx nên đồng hồ dừng, không tụt.)
      // ⚠️ Bẫy: thiếu dòng này, nếu tick() bị chặn vài giây thì vòng while bên dưới lên lịch dồn vài giây nốt vào
      //   "quá khứ" → trình duyệt phát tất cả cùng lúc thành một tràng tiếng ồn.
      if (cur.nextTime < now - LATE_TOLERANCE) cur.nextTime = now + RESYNC_DELAY;
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
  // Các nốt đã lên lịch trước (tối đa LOOKAHEAD giây) vẫn đi qua gain này → fade làm chúng tắt êm theo.
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
      // disconnect sau khi fade xong (+0,8 s cho nốt ngân cuối) để node được thu hồi bộ nhớ.
      setTimeout(function () { try { node.disconnect(); } catch (e) { /* bỏ qua */ } }, (fade + 0.8) * 1000);
    } catch (e) { /* bỏ qua */ }
  }

  var Music = {
    /**
     * Chuẩn hoá id bản nhạc (kể cả alias như 'level', 'trio').
     * @param {string} id
     * @returns {string|null} id hợp lệ, hoặc null nếu không có bản nhạc nào phù hợp
     */
    resolve: function (id) {
      if (TRACKS[id]) return id;
      if (ALIASES[id] && TRACKS[ALIASES[id]]) return ALIASES[id];
      return null;
    },
    /**
     * Liệt kê id các bản nhạc.
     * @returns {string[]}
     */
    list: function () { return Object.keys(TRACKS); },
    /**
     * Kiểm tra bản nhạc này có đang được sequencer phát không.
     * @param {string} id
     * @returns {boolean}
     */
    isPlaying: function (id) { return !!(cur && cur.id === id); },

    /**
     * Phát bản nhạc: crossfade (nhỏ dần bản cũ, bản mới vào nhẹ), khởi động sequencer. No-op nếu chưa mở khoá.
     * @param {string} id  id hoặc alias
     */
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
      // Mỗi bản có GainNode RIÊNG nối vào musicBus → fade bản cũ không ảnh hưởng bản mới đang vào.
      var g = ctx.createGain();
      var t = ctx.currentTime;
      // Jingle vào ngay âm lượng đầy đủ (ngắn, cần "bật" ngay); nhạc nền fade-in 0,4 s.
      var jingle = !song.def.loop;
      g.gain.setValueAtTime(jingle ? 1 : 0.0001, t);
      if (!jingle) g.gain.linearRampToValueAtTime(1, t + 0.4);
      g.connect(bus);
      // Nốt đầu bắt đầu sau 0,05–0,1 s: đủ thời gian để lên lịch, không bị coi là "trễ".
      cur = { id: id, song: song, gain: g, step: 0, nextTime: t + (jingle ? 0.05 : 0.1), done: false, endAt: 0 };
      ensureTimer();
      tick();
    },

    /**
     * Dừng bản đang phát (nhỏ dần) và dừng bộ hẹn giờ của sequencer.
     * @param {number} [fade=0.5]  giây
     */
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
