# Audio: ghi chú tích hợp

Không cần thêm thẻ `<script>`: vẫn là `src/audio/audio.js` rồi `src/audio/music.js` (đúng thứ tự hiện tại).
Không cần sửa core. Audio chỉ cần `main.js` gọi `OG.Audio.init()` như hợp đồng.

## Phần mở rộng so với hợp đồng
- `setVolume/getVolume('master')`: thêm khoá cài đặt `settings.masterVolume` (mặc định 1, ghi qua `Save.setSetting`). Defaults trong `save.js` có thể thêm `masterVolume: 1` (không bắt buộc, Audio tự dùng 1 nếu thiếu).
- `sfx(name, {pitch, vol})`. SFX mới ngoài danh sách gốc: `shield, bossStart, phase, select, resume, powerup, dash, unlock, error`.
- Track mới: `bossFinal` (tự dùng khi `boss:start` có `bossId === 'trio'`), alias `level` → `kitchen`.
- `OG.Audio.unlock()`, `isReady()`, `listSfx()`, `listTracks()`, `setDuck(v)`.
- Phím **M** bật/tắt tiếng (bỏ qua khi đang gõ vào input). Menus có thể ghi chú phím này trong phần Cài đặt.

## Event Audio nghe
`input:firstGesture, scene:change, game:start, level:start, level:exitLocked, door:enter, level:complete,
player:jump, player:land, player:action, player:hurt, player:die, item:collect, enemy:stomp, lives:change,
boss:start, boss:hit, boss:phase, boss:defeated, game:over, game:victory, game:pause, game:resume,
quest:complete, shop:purchase, char:unlock, char:select, skin:equip, leaderboard:submit, ui:click,
settings:change, save:reset`.

Nhạc theo scene: `menu/charselect/settings/shop/leaderboard` → menu, `worldmap` → worldmap,
`level` → `level.music`, `boss` → boss/bossFinal, `victory`/`gameover` → jingle. Khi push `pause`, nhạc nhỏ lại (duck) và trở lại bình thường khi pop.
Item `item:collect` có `type` khác `pizza|coin` (tim, khiên...) phát `powerup`.
