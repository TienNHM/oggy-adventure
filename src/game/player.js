/* OG.Player — nhân vật người chơi: điều khiển, vật lý, bị thương, animation state.
 * Chủ sở hữu: agent Tích hợp. Logic giữ nguyên MVP (tốc độ 255, nhảy 590, trọng lực 1500).
 * Player object: {charId, skin, x, y, w, h, vx, vy, ground, face, inv, shield, speed, jumpV,
 *                 anim, animT, prevBottom, celebrate}  (x,y = góc trên-trái hitbox) */
(function () {
  'use strict';
  var OG = window.OG;
  var C = OG.Config;

  var Player = (OG.Player = {
    create: function (charId, x, y, mods, skinId) {
      var ch = OG.Data.getCharacter(charId);
      mods = mods || {};
      return {
        charId: ch.id, skin: skinId || null,
        x: x, y: y, w: ch.w, h: ch.h, vx: 0, vy: 0, ground: false, face: 1, inv: 0,
        shield: mods.shield | 0, magnet: mods.magnet || 0,
        speed: (ch.speed || C.MOVE_SPEED) * (mods.speedMul || 1),
        jumpV: (ch.jump || C.JUMP_VELOCITY) * (mods.jumpMul || 1),
        anim: 'idle', animT: 0, prevBottom: y + ch.h, celebrate: false, attackT: 0
      };
    },

    // Cập nhật 1 frame. world: {platforms, width}. Trả về kết quả moveBody ({landed, prevBottom}).
    update: function (p, dt, world) {
      var keys = OG.Input.keys;
      p.inv = Math.max(0, p.inv - dt);
      p.attackT = Math.max(0, p.attackT - dt);
      var move = p.celebrate ? 0 : (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      p.vx = move * p.speed;
      if (move) p.face = move;
      if (!p.celebrate && keys.jump && p.ground) {
        p.vy = -p.jumpV;
        p.ground = false;
        OG.Events.emit('player:jump', { charId: p.charId, x: p.x, y: p.y });
      }
      if (!p.celebrate && OG.Input.pressed('action')) {
        p.attackT = 0.3;
        OG.Events.emit('player:action', { x: p.x + p.w / 2, y: p.y + p.h / 2, face: p.face });
      }
      var res = OG.Physics.moveBody(p, dt, world.platforms, { minX: 0, maxX: world.width });
      p.prevBottom = res.prevBottom;
      if (res.landed) OG.Events.emit('player:land', { x: p.x, y: p.y, vy: 0 });
      // Vật phẩm cửa hàng cần chạy mỗi frame (Giày lò xo = nhảy đôi). Shop tự chống gọi trùng trong 1 frame.
      OG.util.call('Shop', 'tickPlayer', p, dt);
      // animation state
      var a = Player.animState(p);
      if (a !== p.anim) { p.anim = a; p.animT = 0; } else p.animT += dt;
      return res;
    },

    animState: function (p) {
      if (p.celebrate) return 'victory';
      if (p.inv > C.HURT_INVULN - 0.4) return 'hurt';
      if (p.attackT > 0) return 'attack';
      if (!p.ground) return p.vy < 0 ? 'jump' : 'fall';
      if (Math.abs(p.vx) > 1) return 'run';
      return 'idle';
    },

    // Bị thương. Trả về true nếu mất mạng. cause: 'enemy' | 'fall' | 'boss' | 'projectile' ...
    hurt: function (p, cause) {
      if (p.inv > 0) return false;
      if (p.shield > 0) {
        p.shield--;
        p.inv = 1.0;
        OG.Game.hud.shield = p.shield;
        OG.Events.emit('player:hurt', { lives: OG.Game.run ? OG.Game.run.lives : 0, cause: cause, shielded: true });
        OG.Game.refreshHud();
        return false;
      }
      p.inv = C.HURT_INVULN;
      p.vy = -C.HURT_BOUNCE;
      p.vx = -p.face * C.HURT_KNOCKBACK;
      OG.Camera.shake(5, 0.25);
      // Phát player:hurt TRƯỚC loseLife để thứ tự event là hurt -> (die -> game:over).
      var predicted = Math.max(0, (OG.Game.run ? OG.Game.run.lives : 1) - 1);
      OG.Events.emit('player:hurt', { lives: predicted, cause: cause, shielded: false });
      var lives = OG.Game.loseLife(cause);
      if (lives > 0) {
        var name = OG.Data.getCharacter(p.charId).name;
        OG.DOM.toast(cause === 'fall' ? 'Ối! ' + name + ' rơi mất rồi!'
          : cause === 'boss' ? 'Ối! Trúng đòn của trùm!'
          : cause === 'projectile' ? 'Ối! Coi chừng đồ bay tới!'
          : 'Ôi! Cẩn thận mấy chú gián!');
      }
      return true;
    },

    // Vẽ nhân vật (gọi trong không gian thế giới).
    draw: function (ctx, p, t) {
      ctx.save();
      ctx.translate(p.x + p.w / 2, p.y + p.h);
      var blink = p.inv > 0 && Math.floor(p.inv * 12) % 2 === 0;
      OG.Sprites.drawCharacter(ctx, p.charId, p.anim, p.animT, {
        face: p.face, skin: p.skin, w: p.w, h: p.h, alpha: blink ? 0.45 : 1,
        flash: p.anim === 'hurt', vx: p.vx, vy: p.vy, time: t,
        worldX: p.x + p.w / 2, worldY: p.y + p.h // vị trí chân trong thế giới (bụi chạy của Sprites)
      });
      if (p.shield > 0) {
        ctx.strokeStyle = '#7fe0ff'; ctx.lineWidth = 3; ctx.globalAlpha = 0.6 + Math.sin(t * 6) * 0.2;
        ctx.beginPath(); ctx.ellipse(0, -p.h / 2, p.w * 0.9, p.h * 0.7, 0, 0, 7); ctx.stroke();
      }
      ctx.restore();
    }
  });
})();
