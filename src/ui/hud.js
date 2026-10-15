/* OG.Menus (phần HUD) — hiển thị điểm, mạng, pizza, xu, thanh máu trùm, nhiệm vụ. [STUB — agent UI sẽ viết lại]
 * Chủ sở hữu: agent Menus & Shop (src/ui/). Load SAU src/ui/menus.js.
 *
 * HỢP ĐỒNG (BẮT BUỘC có, stub đã hiện thực tối thiểu như MVP):
 *   OG.Menus.updateHud(hud)   — gọi mỗi khi HUD state đổi (không phải mỗi frame). Cập nhật DOM trong #hud.
 *                               Agent UI được phép thay toàn bộ nội dung của #hud.
 *   OG.Menus.drawHud(ctx, hud) — gọi MỖI FRAME sau khi vẽ thế giới, KHÔNG GIAN MÀN HÌNH (960x540).
 *                               Dùng cho phần HUD vẽ bằng canvas (thanh máu trùm...).
 *   HudState: { scene:'level'|'boss', levelId, levelName, icon, pizzas, goal, lives, maxLives,
 *               score, coins, shield, time, boss: null|{id,name,hp,maxHp}, quests:[{id,text,done,progress,target}] }
 */
(function () {
  'use strict';
  var OG = window.OG;
  var $ = function (id) { return document.getElementById(id); };
  function setText(id, s) { var el = $(id); if (el && el.textContent !== s) el.textContent = s; }

  OG.Menus = OG.Menus || {};

  OG.Menus.updateHud = function (h) {
    setText('level', (h.icon || '📍') + ' ' + (h.levelName || ''));
    setText('objective', '🍕 ' + h.pizzas + '/' + h.goal);
    var lives = Math.max(0, h.lives | 0), max = Math.max(lives, h.maxLives | 0);
    setText('lives', '❤️'.repeat(lives) + '🖤'.repeat(max - lives) + (h.shield > 0 ? ' 🛡️' + h.shield : ''));
    setText('score', '⭐ ' + h.score);
    setText('coins', '🪙 ' + h.coins);
  };

  OG.Menus.drawHud = function (ctx, h) {
    if (!h.boss) return;
    // Thanh máu trùm đơn giản ở đáy màn hình.
    var w = 360, x = (OG.W - w) / 2, y = OG.H - 34;
    OG.util.fillRound(ctx, x - 4, y - 4, w + 8, 22, 11, '#17233ddd');
    var ratio = h.boss.maxHp ? Math.max(0, h.boss.hp / h.boss.maxHp) : 0;
    OG.util.fillRound(ctx, x, y, Math.max(8, w * ratio), 14, 7, '#e5484d');
    ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Trebuchet MS, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(h.boss.name, OG.W / 2, y - 10);
  };
})();
