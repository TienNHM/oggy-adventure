/* OG.Bosses — registry trùm. [STUB — agent Bosses sẽ viết lại/mở rộng]
 * Chủ sở hữu: agent Bosses (src/bosses/). Mỗi trùm nên nằm ở file riêng (joey.js, marky.js,
 * deedee.js, trio.js) và gọi OG.Bosses.register(def) khi load.
 *
 * HỢP ĐỒNG:
 *   OG.Bosses.init()
 *   OG.Bosses.register(def)   def = { id, name, maxHp, arena?: ArenaDef, create(arena) -> BossInstance }
 *   OG.Bosses.has(bossId) -> bool          (false → scene boss bị bỏ qua, màn hoàn thành luôn)
 *   OG.Bosses.list() -> [bossId]
 *   OG.Bosses.getInfo(bossId) -> {id, name, maxHp} | null
 *   OG.Bosses.getArena(bossId) -> ArenaDef | null
 *        ArenaDef = { width (>=960), platforms: [[x,y,w,h],...] (phần tử đầu là sàn y=480),
 *                     spawn: {x,y}, theme }
 *   OG.Bosses.create(bossId, arena) -> BossInstance | null
 *
 *   BossInstance (do agent Bosses hiện thực):
 *     id, name, hp, maxHp, phase (số), x, y, w, h
 *     update(dt, arena)          — AI, đạn, gọi arena.hurtPlayer() khi đạn trúng
 *     draw(ctx, arena)           — vẽ trong KHÔNG GIAN THẾ GIỚI (camera đã áp dụng)
 *     getHurtboxes() -> [{x,y,w,h}]  — chạm vào = người chơi bị thương
 *     getWeakspot() -> {x,y,w,h} | null — người chơi rơi xuống trúng = boss.onHit(); null khi bất tử
 *     onHit(dmg, arena)          — trừ máu, đổi phase (tự emit 'boss:phase' nếu đổi phase)
 *     isDefeated() -> bool
 *
 *   Arena (do scene boss truyền vào, chỉ đọc trừ khi ghi chú):
 *     levelId, bossId, theme, width, height, floorY (480), t (giây), platforms [{x,y,w,h}],
 *     player {x,y,w,h,vx,vy,ground,face,inv}, enemies [] (lính được gọi ra),
 *     hurtPlayer(cause) -> bool, overlapsPlayer(rect) -> bool, shake(mag,dur),
 *     particles(x,y,opts), floatText(x,y,text,color), toast(text), emit(name,payload),
 *     addScore(n), spawnEnemy({type:'roach', x, range, speed}) -> enemy
 */
(function () {
  'use strict';
  var OG = window.OG;
  var defs = {};

  OG.Bosses = {
    defs: defs,
    init: function () {},
    register: function (def) {
      if (!def || !def.id || typeof def.create !== 'function') { console.warn('[OG.Bosses] def không hợp lệ', def); return null; }
      defs[def.id] = def;
      return def;
    },
    has: function (id) { return !!defs[id]; },
    list: function () { return Object.keys(defs); },
    getInfo: function (id) { var d = defs[id]; return d ? { id: d.id, name: d.name || d.id, maxHp: d.maxHp || 0 } : null; },
    getArena: function (id) { var d = defs[id]; return (d && d.arena) || null; },
    create: function (id, arena) { var d = defs[id]; return d ? d.create(arena) : null; }
  };
})();
