# Lời giải — Bài 10: Web Audio

> ✋ **Hãy tự làm trước.** Lời giải chỉ là *một* cách làm. Nếu bài của bạn khác nhưng chạy đúng và giải thích được vì sao, bài đó vẫn đạt.
> Quay lại bài học: [10-web-audio.md](../10-web-audio.md)

Sau mỗi thay đổi trong `src/`, chạy `node --check <file>` rồi `node tests/smoke.js` (phải **XANH**).

---

## ⭐ Tiếng "boing" khi giẫm địch

**1. Thêm công thức vào bảng `SFX`** ([src/audio/audio.js](../../../src/audio/audio.js)), ngay sau `error`:

```js
    error: function (p, v) {
      tone({ type: 'square', f: 220, f2: 180, dur: 0.18, vol: 0.08 * v, count: C, filter: { type: 'lowpass', f: 1500 } });
    },
    // Tiếng lò xo "boing": sine trượt LÊN rồi rung mạnh (vibrato) cho cảm giác bật nảy.
    boing: function (p, v) {
      tone({ type: 'sine', f: 180 * p, f2: 520 * p, slideDur: 0.12, dur: 0.35, vol: 0.18 * v, vib: 80, vibRate: 14, count: C });
      tone({ type: 'triangle', f: 90 * p, f2: 60, dur: 0.12, vol: 0.1 * v, count: C });
    }
  };
```

**2. Đổi ánh xạ event** trong `bindEvents`:

```js
    on('enemy:stomp', function () { playSfx('boing'); });
```

**3. (Nên làm) chống dồn tiếng:** thêm `boing: 0.05` vào đầu object `MIN_GAP`:

```js
  var MIN_GAP = { boing: 0.05, land: 0.12, coin: 0.035, /* ...giữ nguyên phần còn lại... */ };
```

**Giải thích**

- `f: 180 → f2: 520` trong `slideDur: 0.12` giây là cú "bật" lên. Sau khi trượt xong, nốt vẫn kêu tới hết `dur: 0.35`, và vibrato rất sâu (`vib: 80` cent, 14 lần/giây) tạo tiếng "rung rinh" của lò xo.
- Tone thứ hai (triangle trầm, ngắn) là phần "thịch" lúc chạm, giúp tiếng có lực.
- Nhân với `p` để `pitch` từ `opts` vẫn có tác dụng (và vẫn nhận lệch ngẫu nhiên `PITCH_JITTER`). Nhân với `v` để `vol` có tác dụng.
- `count: C` tính nốt này vào `activeVoices`, nên giới hạn `MAX_VOICES` vẫn bảo vệ được.
- Không phải sửa gì ở gameplay: player/level vẫn chỉ `emit('enemy:stomp')`. Đây là lợi ích của observer.

Kiểm tra: `OG.Audio.listSfx().indexOf('boing') >= 0` và `OG.Audio.sfx('boing')` trả `true` (sau khi đã bấm vào game).

---

## ⭐⭐ Bản nhạc bãi biển

**1. Thử trong console trước** (đã bấm vào game một lần):

```js
OG.Audio.tracks.beach1 = {
  bpm: 96, loop: true, swing: 0.14,
  lead: { wave: 'triangle', vol: 0.13, cutoff: 3800, vib: 12 },
  bass: { wave: 'triangle', vol: 0.2, style: 'walk' },
  pad: { wave: 'sine', vol: 0.05 },
  chords: ['F', 'C', 'Dm', 'Bb'],
  melody: [
    'A5 - . C6 . A5 . F5 G5 - . . E5 . C5 .',
    'G5 - . E5 . C5 . E5 G5 - - . . . . .',
    'F5 - . A5 . D6 . A5 F5 - . D5 . F5 . .',
    'Bb5 - - . A5 . G5 . F5 - - - . . . .'
  ],
  drums: { kick: 'x.......x.......', snare: '............x...', hat: '..x...x...x...x.' }
};
OG.Audio.playMusic('beach1');
```

Muốn sửa nốt thì đặt id mới (`beach2`...). Lý do: `compile` đã cache `beach1`, sửa object cũ không còn tác dụng.

**2. Đưa vào code:** chép object vào `TRACKS` trong [src/audio/music.js](../../../src/audio/music.js) với id `beach` (ví dụ đặt trước jingle `victory`):

```js
    // Bãi biển — Fa trưởng, chậm, swing nhiều, bass 'walk' như sóng vỗ.
    beach: {
      bpm: 96, loop: true, swing: 0.14,
      // ... như trên ...
    },
```

**3. Dùng làm nhạc của một khu.** Trong file `journey.js` của hành trình, thêm `music: 'beach'` vào AreaDef. Ví dụ với hành trình "ocean" ở [lời giải Bài 12](12-data-driven-man-cau-do-hanh-trinh.md) (phần ⭐⭐⭐):

```js
      { id: 'shore', name: 'Bãi biển', emoji: '🏖️', sceneryTheme: 'ocean-beach', music: 'beach', levels: [ /* ... */ ] }
```

Hoặc thử nhanh với hành trình có sẵn: đổi `music: 'garden'` của khu `garden` trong [src/journeys/home/journey.js](../../../src/journeys/home/journey.js) thành `music: 'beach'` (nhớ trả lại).

**Giải thích: đường đi của field `music`**

1. `compileLevel` (src/core/journeys.js) điền `L.music = L.music || area.music || null`, nên mọi màn trong khu nhận `'beach'`.
2. Scene `level` phát `'level:start'` với payload `music: level.music || level.theme`.
3. `bindEvents` trong audio.js nghe `'level:start'` và gọi `Audio.playMusic('beach')` → `_music.play` → `compile('beach')` (lần đầu) → sequencer.

**Tự kiểm tra bản nhạc**

- Đếm token: mỗi chuỗi phải có đúng 16. Gõ:
  ```js
  OG.Audio.tracks.beach.melody.map(function (b) { return b.split(/\s+/).length; });   // [16, 16, 16, 16]
  ```
- Thời lượng một vòng: 4 ô × 16 bước × (60 / 96 / 4) giây ≈ 10 giây cho mỗi lượt, `loop: true` biên dịch 2 lượt (lượt 2 thêm arpeggio).

---

## ⭐⭐⭐ Máy đếm nhịp có lookahead

Dán vào console sau khi đã bấm vào game một lần:

```js
var Metro = (function () {
  var E = OG.Audio._engine;
  var LOOKAHEAD = 0.1;       // giây: lên lịch trước bao xa
  var TICK_MS = 25;          // ms giữa 2 lần tick() kiểm tra (LOOKAHEAD phải > TICK_MS)
  var timer = null, nextTime = 0, beat = 0, bpm = 120;

  function tick() {
    var ctx = E.ctx();
    if (!ctx || ctx.state !== 'running') return;          // tab ẩn → ctx bị suspend: chờ
    var now = ctx.currentTime;
    if (nextTime < now - 0.05) nextTime = now + 0.03;      // bị tụt lại quá xa → nhảy tới, đừng xả dồn
    while (nextTime < now + LOOKAHEAD) {
      var strong = beat % 4 === 0;                         // phách mạnh đầu ô nhịp 4/4
      E.tone({ type: 'square', f: strong ? 1760 : 880, when: nextTime, dur: 0.05, vol: strong ? 0.25 : 0.15 });
      nextTime += 60 / bpm;                                // 1 phách = 60/bpm giây
      beat++;
    }
  }

  return {
    start: function (b) {
      if (!E.ready()) { console.warn('Hãy bấm vào game một lần để mở khoá âm thanh'); return; }
      this.stop();
      bpm = b || 120; beat = 0;
      nextTime = E.ctx().currentTime + 0.05;
      timer = setInterval(tick, TICK_MS);
      tick();
    },
    stop: function () { if (timer) clearInterval(timer); timer = null; },
    setBpm: function (b) { bpm = b; }
  };
})();

Metro.start(120);
// Metro.setBpm(180);  Metro.stop();
```

Mã này đã được chạy thử với một đồng hồ giả (mỗi tick tăng 25 ms): ở 120 BPM, các nốt được lên lịch đúng tại 0,05 · 0,55 · 1,05 · 1,55 · 2,05 giây, và phách mạnh rơi vào nốt thứ 1 và thứ 5.

**So sánh với bản ngây thơ**

```js
var E = OG.Audio._engine;
var naive = setInterval(function () { E.tone({ f: 880, dur: 0.05, vol: 0.15 }); }, 500);
var busy = setInterval(function () { var t = performance.now(); while (performance.now() - t < 20) {} }, 30);
// nghe khoảng 10 giây, rồi:
clearInterval(naive); clearInterval(busy);
```

| | Bản ngây thơ (`setInterval` 500 ms) | Metronome lookahead |
|---|---|---|
| Thời điểm phát | "ngay khi callback chạy", tức `currentTime + 0` | `when: nextTime`, tính sẵn bằng cộng dồn `60 / bpm` |
| Khi luồng chính bận 20 ms | callback trễ 0–20 ms một cách ngẫu nhiên → tai nghe nhịp "lảo đảo" | `tick()` trễ tối đa ~20 ms + 25 ms, vẫn **nhỏ hơn** `LOOKAHEAD` = 100 ms → mọi nốt đã nằm sẵn trong lịch của AudioContext, nên phát đúng giờ |
| Khi bị chặn lâu (> 100 ms) | trễ tương ứng | có thể hụt vài phách; dòng "nhảy tới" giúp không xả dồn một tràng nốt |

Kết luận: độ chính xác của bản lookahead không phụ thuộc `setInterval`, mà phụ thuộc đồng hồ âm thanh. Điều kiện để không hụt nốt là *thời gian bị chặn + TICK_MS < LOOKAHEAD*. Tăng `LOOKAHEAD` thì chịu được chặn lâu hơn, nhưng đổi tempo hay dừng nhạc sẽ có độ trễ (vì các nốt đã lên lịch không rút lại được). `music.js` chọn 0,15 s là điểm cân bằng; khi dừng, nó làm nhỏ dần `trackGain` để các nốt đã lên lịch tắt êm (hàm `fadeOut`).
