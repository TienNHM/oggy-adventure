// @ts-check
/* ============================================================================
 * Scene MẶC ĐỊNH (giao diện MVP) — boot, menu, worldmap, pause, gameover, victory + nền dùng chung
 * ----------------------------------------------------------------------------
 * Vai trò:      Bản tối giản của mọi scene "giao diện" để game chạy được khi module tính năng chưa viết hoặc bị lỗi.
 *               Các module tính năng THAY THẾ bằng cách OG.Scenes.register('<tên>', ...) trong init() của mình:
 *                 menu, pause, gameover, victory  → OG.Menus (src/ui/)
 *                 worldmap                         → OG.World (src/world/)
 *               Scene 'boot' và hành vi bắt buộc của từng scene: xem docs/ARCHITECTURE.md mục 5.
 * Khái niệm:    "stub rồi ghi đè" (scene mặc định bị module sau đăng ký đè cùng tên) · graceful degradation ·
 *               scene chuyển tiếp chỉ sống 1 frame (boot, worldmap mặc định) · drawBelow cho overlay (pause) ·
 *               observer theo dõi scene chơi gần nhất ('scene:change')
 * Bài học:      docs/learn/01-module-pattern-iife-namespace.md, docs/learn/05-state-machine-scene.md
 * Phụ thuộc:    LÚC LOAD: OG.Events.on, OG.Scenes.register. LÚC CHẠY: OG.DOM, OG.Game, OG.Sprites, OG.Data, OG.Save,
 *               OG.Level, OG.BossScene, OG.Input, OG.Social.mountResult (tuỳ chọn)
 * Event:        phát: 'game:pause' {scene} · nghe: 'scene:change' (nhớ scene chơi gần nhất)
 * API công khai: OG.drawLastPlayScene(ctx), OG.drawTitleBackdrop(ctx); scene boot, menu, worldmap, pause, gameover, victory
 * Đọc tiếp:     src/ui/menus.js (menu/pause/gameover thật ghi đè các scene ở đây) → src/world/world.js (worldmap thật)
 * ========================================================================== */
(function () {
  'use strict';
  var OG = window.OG;

  var lastPlay = 'level'; // scene chơi gần nhất (để vẽ nền cho gameover/pause)
  // Nghe scene:change thay vì để level.js/boss-scene.js tự báo: hai scene đó không cần biết file này tồn tại.
  OG.Events.on('scene:change', function (e) { if (e.to === 'level' || e.to === 'boss') lastPlay = e.to; });

  /**
   * Vẽ khung cảnh chơi gần nhất (đứng yên) làm nền cho panel: trận trùm → màn → nền tiêu đề.
   * @param {CanvasRenderingContext2D} ctx
   */
  OG.drawLastPlayScene = function (ctx) {
    if (lastPlay === 'boss' && OG.BossScene && OG.BossScene.isActive()) OG.BossScene.draw(ctx);
    else if (OG.Level.state) OG.Level.drawWorld(ctx);
    else OG.drawTitleBackdrop(ctx);
  };

  /**
   * Vẽ nền tiêu đề: nhà bếp + nhân vật đã chọn đứng chờ (giống khung cảnh sau menu MVP). Camera x = 0.
   * @param {CanvasRenderingContext2D} ctx
   */
  OG.drawTitleBackdrop = function (ctx) {
    var t = OG.time;
    OG.Sprites.drawBackground(ctx, 'kitchen', 0, t);
    OG.Sprites.drawPlatform(ctx, { x: 0, y: 480, w: OG.W, h: 60, isFloor: true }, 'kitchen', t);
    OG.Sprites.drawDecor(ctx, 'kitchen', OG.W, t);
    var charId = (OG.Save.data && OG.Save.data.selectedChar) || 'oggy';
    var ch = OG.Data.getCharacter(charId);
    ctx.save();
    // Neo ở giữa-đáy (chân) theo hợp đồng của OG.Sprites; chân đặt trên sàn y = 480.
    ctx.translate(70 + ch.w / 2, 480);
    OG.Sprites.drawCharacter(ctx, charId, 'idle', t, { face: 1, skin: OG.Save.data.equippedSkins[charId] || null, w: ch.w, h: ch.h });
    ctx.restore();
  };

  // ---- boot: chuyển ngay sang menu ở frame đầu tiên ----
  // 💡 Khái niệm: scene chuyển tiếp — boot chỉ sống đúng 1 frame. Đổi scene trong update (không phải enter) để
  //   main.js chạy xong Scenes.go('boot') và Loop.start trước, rồi frame đầu tiên mới sang menu.
  OG.Scenes.register('boot', {
    enter: function () { OG.DOM.hidePanel(); this.done = false; },
    update: function () { if (!this.done) { this.done = true; OG.Scenes.go('menu'); } },
    draw: function (ctx) { OG.drawTitleBackdrop(ctx); }
  });

  // ---- menu: panel MVP ----
  // 💡 Khái niệm: "stub rồi ghi đè" — file này load TRƯỚC src/ui/menus.js; OG.Menus.init() đăng ký lại 'menu' cùng tên
  //   và registry giữ bản sau cùng. Xoá <script src="src/ui/menus.js"> thì panel đơn giản dưới đây hiện ra.
  // 🧪 Thử: comment dòng <script src="src/ui/menus.js"></script> trong index.html rồi mở game — thấy menu MVP này.
  OG.Scenes.register('menu', {
    enter: function () {
      OG.DOM.setHudVisible(false);
      OG.DOM.setControlsVisible(false);
      OG.DOM.panel({
        title: 'OGGY ADVENTURE!',
        html: '<p>Ba chú gián tinh nghịch đã lấy mất đồ ăn của Oggy!<br>Khám phá ngôi nhà, thu thập pizza và bắt những tên gián quậy phá.</p>' +
          '<p class="small">PC: A/D hoặc ←/→ để đi · Space/W/↑ để nhảy · E để tương tác · Esc/P tạm dừng<br>Mobile: dùng các nút điều khiển trên màn hình</p>',
        buttons: [{ id: 'start', label: 'BẮT ĐẦU CHƠI', primary: true, onClick: function () { OG.Game.newRun(); OG.Scenes.go('worldmap'); } }],
        small: 'Game fan-made, không chính thức.'
      });
    },
    exit: function () { OG.DOM.hidePanel(); },
    draw: function (ctx) { OG.drawTitleBackdrop(ctx); }
  });

  // ---- worldmap mặc định: tự vào màn tiếp theo của run (giữ luồng tuyến tính MVP) ----
  OG.Scenes.register('worldmap', {
    enter: function (params) {
      OG.DOM.hidePanel();
      this.params = params || {};
      this.started = false;
    },
    update: function () {
      if (this.started) return;
      this.started = true;
      var run = OG.Game.ensureRun();
      if (this.params.completed) OG.DOM.toast('Màn mới! Cố lên Oggy!');
      OG.Game.startLevel(run.nextLevel | 0);
    },
    draw: function (ctx) { OG.drawTitleBackdrop(ctx); }
  });

  // ---- pause ----
  OG.Scenes.register('pause', {
    // drawBelow: scene 'level'/'boss' bên dưới vẫn được vẽ (đứng yên vì không được update), pause chỉ phủ lớp tối mờ.
    drawBelow: true,
    enter: function (params) {
      var from = (params && params.from) || OG.Scenes.base();
      OG.Events.emit('game:pause', { scene: from });
      OG.DOM.panel({
        title: 'TẠM DỪNG',
        html: '<p>Oggy đang nghỉ xả hơi một chút…</p>',
        buttons: [
          { id: 'resume', label: 'TIẾP TỤC', primary: true, onClick: function () { OG.Scenes.pop(); } },
          { id: 'restart', label: 'CHƠI LẠI MÀN', secondary: true, onClick: function () { OG.Game.startLevel(OG.Game.run ? OG.Game.run.nextLevel : 0); } },
          { id: 'quit', label: 'VỀ MENU', secondary: true, onClick: function () { OG.Scenes.go('menu'); } }
        ]
      });
    },
    update: function () {
      // consume trước khi pop: cùng cú bấm P không được scene 'level' lộ ra xử lý tiếp (sẽ push pause lại ngay).
      if (OG.Input.pressed('pause')) { OG.Input.consume('pause'); OG.Scenes.pop(); }
    },
    draw: function (ctx) { ctx.fillStyle = '#10192b55'; ctx.fillRect(0, 0, OG.W, OG.H); }
  });

  // ---- gameover (MVP) ----
  OG.Scenes.register('gameover', {
    enter: function (params) {
      var r = (params && params.result) || OG.Game.buildResult('gameover');
      var panel = OG.DOM.panel({
        title: 'HẾT LƯỢT! 💫',
        // escapeHtml: tên nhân vật có thể đến từ dữ liệu module khác — không chèn thẳng vào innerHTML.
        html: '<p>' + OG.util.escapeHtml(OG.Data.getCharacter(r.charId).name) + ' cần nghỉ một chút. Điểm của bạn: ' + r.score + '</p>',
        buttons: [
          { id: 'retry', label: 'THỬ LẠI', primary: true, onClick: function () { OG.Game.newRun(); OG.Scenes.go('worldmap'); } },
          { id: 'menu', label: 'VỀ MENU', secondary: true, onClick: function () { OG.Scenes.go('menu'); } }
        ]
      });
      OG.util.call('Social', 'mountResult', panel, r);
    },
    exit: function () { OG.DOM.hidePanel(); },
    draw: function (ctx) { OG.drawLastPlayScene(ctx); }
  });

  // ---- victory (MVP) ----
  OG.Scenes.register('victory', {
    enter: function (params) {
      var r = (params && params.result) || OG.Game.buildResult('victory');
      var panel = OG.DOM.panel({
        title: 'CHIẾN THẮNG! 🏆',
        html: '<p>Oggy đã lấy lại đồ ăn! Điểm: ' + r.score + ' · Kỷ lục: ' + OG.Save.data.bestScore + '</p>',
        buttons: [
          { id: 'again', label: 'CHƠI LẠI', primary: true, onClick: function () { OG.Game.newRun(); OG.Scenes.go('worldmap'); } },
          { id: 'menu', label: 'VỀ MENU', secondary: true, onClick: function () { OG.Scenes.go('menu'); } }
        ]
      });
      OG.util.call('Social', 'mountResult', panel, r);
    },
    exit: function () { OG.DOM.hidePanel(); },
    draw: function (ctx) { OG.drawLastPlayScene(ctx); }
  });
})();
