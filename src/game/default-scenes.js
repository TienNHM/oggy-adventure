/* Scene MẶC ĐỊNH (giao diện MVP) — để game chạy được khi module tính năng chưa viết.
 * Chủ sở hữu: agent Tích hợp.
 * Các module tính năng THAY THẾ bằng cách OG.Scenes.register('<tên>', ...) trong init() của mình:
 *   menu, pause, gameover, victory  → OG.Menus (src/ui/)
 *   worldmap                         → OG.World (src/world/)
 * Scene 'boot' và hành vi bắt buộc của từng scene: xem docs/ARCHITECTURE.md. */
(function () {
  'use strict';
  var OG = window.OG;

  var lastPlay = 'level'; // scene chơi gần nhất (để vẽ nền cho gameover/pause)
  OG.Events.on('scene:change', function (e) { if (e.to === 'level' || e.to === 'boss') lastPlay = e.to; });

  // Vẽ khung cảnh chơi gần nhất (đứng yên) làm nền cho panel.
  OG.drawLastPlayScene = function (ctx) {
    if (lastPlay === 'boss' && OG.BossScene && OG.BossScene.isActive()) OG.BossScene.draw(ctx);
    else if (OG.Level.state) OG.Level.drawWorld(ctx);
    else OG.drawTitleBackdrop(ctx);
  };

  // Nền tiêu đề: nhà bếp + Oggy đứng chờ (giống khung cảnh sau menu MVP).
  OG.drawTitleBackdrop = function (ctx) {
    var t = OG.time;
    OG.Sprites.drawBackground(ctx, 'kitchen', 0, t);
    OG.Sprites.drawPlatform(ctx, { x: 0, y: 480, w: OG.W, h: 60, isFloor: true }, 'kitchen', t);
    OG.Sprites.drawDecor(ctx, 'kitchen', OG.W, t);
    var charId = (OG.Save.data && OG.Save.data.selectedChar) || 'oggy';
    var ch = OG.Data.getCharacter(charId);
    ctx.save();
    ctx.translate(70 + ch.w / 2, 480);
    OG.Sprites.drawCharacter(ctx, charId, 'idle', t, { face: 1, skin: OG.Save.data.equippedSkins[charId] || null, w: ch.w, h: ch.h });
    ctx.restore();
  };

  // ---- boot: chuyển ngay sang menu ở frame đầu tiên ----
  OG.Scenes.register('boot', {
    enter: function () { OG.DOM.hidePanel(); this.done = false; },
    update: function () { if (!this.done) { this.done = true; OG.Scenes.go('menu'); } },
    draw: function (ctx) { OG.drawTitleBackdrop(ctx); }
  });

  // ---- menu: panel MVP ----
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
