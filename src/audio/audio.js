/* OG.Audio — âm thanh tổng hợp bằng Web Audio API. [STUB — agent Audio sẽ viết lại]
 * Chủ sở hữu: agent Audio (src/audio/).
 *
 * HỢP ĐỒNG:
 *   OG.Audio.init()                    — gọi 1 lần bởi main.js. Tự lắng nghe OG.Events để phát sfx/nhạc.
 *                                        AudioContext chỉ tạo/resume sau 'input:firstGesture'.
 *   OG.Audio.playMusic(trackId)        — trackId: menu | worldmap | kitchen | garden | roof | lair | boss | victory | gameover
 *                                        (id lạ → bỏ qua hoặc dùng nhạc mặc định). Gọi lại cùng track = không làm gì.
 *   OG.Audio.stopMusic()
 *   OG.Audio.sfx(name)                 — name: jump | collect | coin | hurt | stomp | door | locked | bossHit |
 *                                        bossDefeat | click | victory | gameover | pause | quest | purchase | land
 *   OG.Audio.setVolume(channel, v)     — channel: 'music' | 'sfx'; v ∈ [0,1]; lưu vào OG.Save.settings
 *   OG.Audio.getVolume(channel)
 *   OG.Audio.mute(bool) / OG.Audio.isMuted() / OG.Audio.toggleMute()
 * Gameplay KHÔNG gọi trực tiếp Audio; Audio tự map event -> âm thanh (xem docs/ARCHITECTURE.md).
 * UI có thể gọi OG.Audio.sfx('click') trực tiếp hoặc dựa vào event 'ui:click'. */
(function () {
  'use strict';
  var OG = window.OG;

  function settings() { return OG.Save.data.settings; }

  OG.Audio = {
    currentTrack: null,
    init: function () {},
    playMusic: function (trackId) { OG.Audio.currentTrack = trackId; },
    stopMusic: function () { OG.Audio.currentTrack = null; },
    sfx: function (name) {},
    setVolume: function (channel, v) {
      v = OG.util.clamp(+v || 0, 0, 1);
      OG.Save.setSetting(channel === 'music' ? 'musicVolume' : 'sfxVolume', v);
    },
    getVolume: function (channel) { return channel === 'music' ? settings().musicVolume : settings().sfxVolume; },
    mute: function (m) { OG.Save.setSetting('muted', !!m); },
    isMuted: function () { return !!settings().muted; },
    toggleMute: function () { OG.Audio.mute(!OG.Audio.isMuted()); return OG.Audio.isMuted(); }
  };
})();
