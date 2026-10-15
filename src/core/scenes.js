/* OG.Scenes — máy trạng thái scene có ngăn xếp (stack).
 * Scene: { enter(params, fromName), exit(toName), update(dt), draw(ctx), resume(), drawBelow:bool }
 * - go(name, params): thay toàn bộ stack.
 * - push(name, params): đè scene lên trên (vd: pause). Scene dưới không update; vẫn được draw
 *   nếu scene trên có drawBelow !== false.
 * - pop(): bỏ scene trên cùng, gọi resume() của scene lộ ra.
 * register() lần sau GHI ĐÈ lần trước → module tính năng thay thế scene mặc định bằng cách
 * đăng ký lại cùng tên trong init().
 * Tên scene chuẩn: boot, menu, worldmap, level, boss, pause, gameover, victory,
 * charselect, shop, settings, leaderboard (xem docs/ARCHITECTURE.md). */
(function () {
  'use strict';
  var OG = window.OG;
  var registry = {};
  var stack = []; // [{name, scene}]

  function topEntry() { return stack[stack.length - 1] || null; }

  var Scenes = (OG.Scenes = {
    register: function (name, scene) {
      registry[name] = scene;
      return scene;
    },
    get: function (name) { return registry[name] || null; },
    has: function (name) { return !!registry[name]; },
    names: function () { return Object.keys(registry); },

    current: function () { var t = topEntry(); return t ? t.name : null; },
    // Scene "nền" (đáy stack) — vd 'level' khi đang pause.
    base: function () { return stack.length ? stack[0].name : null; },
    stackNames: function () { return stack.map(function (e) { return e.name; }); },

    go: function (name, params) {
      var scene = registry[name];
      if (!scene) { console.error('[OG.Scenes] chưa đăng ký scene: ' + name); return; }
      var from = Scenes.current();
      while (stack.length) {
        var e = stack.pop();
        if (e.scene.exit) OG.util.safe('scene ' + e.name + '.exit', e.scene.exit, e.scene, [name]);
      }
      OG.Input.reset();
      stack.push({ name: name, scene: scene });
      if (scene.enter) OG.util.safe('scene ' + name + '.enter', scene.enter, scene, [params || {}, from]);
      OG.Events.emit('scene:change', { from: from, to: name, params: params || {} });
    },

    push: function (name, params) {
      var scene = registry[name];
      if (!scene) { console.error('[OG.Scenes] chưa đăng ký scene: ' + name); return; }
      var from = Scenes.current();
      OG.Input.reset();
      stack.push({ name: name, scene: scene });
      if (scene.enter) OG.util.safe('scene ' + name + '.enter', scene.enter, scene, [params || {}, from]);
      OG.Events.emit('scene:change', { from: from, to: name, params: params || {}, push: true });
    },

    pop: function () {
      if (stack.length <= 1) return;
      var e = stack.pop();
      if (e.scene.exit) OG.util.safe('scene ' + e.name + '.exit', e.scene.exit, e.scene, [Scenes.current()]);
      OG.Input.reset();
      var t = topEntry();
      if (t.scene.resume) OG.util.safe('scene ' + t.name + '.resume', t.scene.resume, t.scene, []);
      OG.Events.emit('scene:change', { from: e.name, to: t.name, params: {}, pop: true });
    },

    update: function (dt) {
      var t = topEntry();
      if (t && t.scene.update) t.scene.update(dt);
    },

    draw: function (ctx) {
      // Tìm scene thấp nhất cần vẽ (dừng khi gặp scene có drawBelow === false).
      var start = stack.length - 1;
      while (start > 0 && stack[start].scene.drawBelow !== false) start--;
      for (var i = start; i < stack.length; i++) {
        var s = stack[i].scene;
        if (s.draw) { ctx.save(); s.draw(ctx); ctx.restore(); }
      }
    }
  });
})();
