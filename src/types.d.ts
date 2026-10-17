/* src/types.d.ts — khai báo KIỂU dùng chung cho JSDoc (chỉ phục vụ VS Code / tsc, trình duyệt KHÔNG load file này).
 *
 * 💡 Khái niệm: file .d.ts (declaration file) chỉ chứa KIỂU, không chứa code chạy. Ta viết game bằng JS thuần,
 *   nhưng nhờ file này + chú thích JSDoc (vd `@param {LevelDef} level`), VS Code gợi ý được field và tsc bắt được
 *   lỗi gõ sai tên field trong các file có dòng `// @ts-check` ở đầu.
 *
 * Quy ước (xem docs/learn/CODE_STYLE.md):
 *   - Đây là file "script" (không có import/export) nên mọi interface bên dưới là TOÀN CỤC: dùng thẳng tên trong JSDoc.
 *   - Tên kiểu tránh trùng kiểu có sẵn của DOM (vd KHÔNG đặt `Body`, `Event`, `Range`, `Animation`).
 *   - Nguồn sự thật về định dạng dữ liệu vẫn là docs/ARCHITECTURE.md và docs/STORY.md; sửa kiểu ở đây phải khớp tài liệu.
 *   - Field có dấu `?` là tuỳ chọn. `[key: string]: any` = cho phép field mở rộng (module tính năng hay thêm field riêng).
 *
 * Kiểm tra: npx -y -p typescript@5.6.3 tsc -p jsconfig.json --noEmit
 */

// ---------------------------------------------------------------------------
// Namespace toàn cục. Cố ý để `any`: mỗi module tự gắn OG.X lúc load (module pattern IIFE),
// khai báo chặt toàn bộ OG sẽ rất dài và phải sửa mỗi khi thêm module.
// ---------------------------------------------------------------------------
interface Window { OG: any }
declare var OG: any;

// ---------------------------------------------------------------------------
// Hình học & vật lý (src/core/physics.js, src/core/namespace.js)
// ---------------------------------------------------------------------------

/** Hình chữ nhật thẳng trục (AABB — Axis-Aligned Bounding Box). x,y = góc TRÊN-TRÁI, đơn vị pixel thế giới. */
interface AABB { x: number; y: number; w: number; h: number }

/** Vật thể chịu trọng lực của OG.Physics.moveBody. vx/vy tính bằng pixel/giây; ground = đang đứng trên nền. */
interface PhysicsBody extends AABB { vx: number; vy: number; ground: boolean }

/** Kết quả một bước OG.Physics.moveBody. prevBottom = đáy hitbox ở frame TRƯỚC (dùng để xét "giẫm"). */
interface MoveResult { landed: boolean; prevBottom: number }

/** Nền/bục sau khi Level chuyển từ mảng [x,y,w,h] sang object. isFloor = sàn chính của màn. */
interface Platform extends AABB { isFloor?: boolean }

/** Toạ độ điểm. */
interface Vec2 { x: number; y: number }

// ---------------------------------------------------------------------------
// Scene & event (src/core/scenes.js, src/core/events.js)
// ---------------------------------------------------------------------------

/** Một scene của máy trạng thái OG.Scenes. Mọi phương thức đều tuỳ chọn. */
interface Scene {
  enter?(params: any, fromName: string | null): void;
  exit?(toName: string | null): void;
  update?(dt: number): void;
  draw?(ctx: CanvasRenderingContext2D): void;
  /** Gọi khi scene phía trên bị pop và scene này lộ ra lại. */
  resume?(): void;
  /** false = scene bên dưới KHÔNG được vẽ khi scene này nằm trên (mặc định: vẽ). */
  drawBelow?: boolean;
  [key: string]: any;
}

/** Listener của OG.Events: nhận đúng 1 payload object (listener '*' nhận (name, payload)). */
type OGListener = (payload: any, extra?: any) => void;

/** Hàm huỷ đăng ký trả về từ OG.Events.on/once. */
type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// Màn chơi (src/data/levels.js, src/game/level.js) — docs/ARCHITECTURE.md mục 7, docs/STORY.md mục 2.2
// ---------------------------------------------------------------------------

/** Mô tả một kẻ địch trong dữ liệu màn. */
interface EnemySpawn { type: string; x: number; y?: number; range?: number; speed?: number; dir?: 1 | -1 }

/** Nhiệm vụ phụ của màn (OG.Quests). */
interface QuestDef { id: string; type: string; target?: number; text: string; reward: number }

/** Định nghĩa màn (cổ điển v1 + field mở rộng v2 của hành trình). Toạ độ mảng: [x, y, w, h] / [x, y]. */
interface LevelDef {
  id: string;
  name: string;
  icon?: string;
  theme?: string;
  music?: string;
  width: number;
  spawn: Vec2;
  goal: number;
  platforms: number[][];
  pizzas: number[][];
  coins?: number[][];
  enemies?: EnemySpawn[];
  exit: { x: number };
  boss?: string | null;
  requires?: string[];
  final?: boolean;
  map?: Vec2;
  quests?: QuestDef[];
  // ---- v2 (hành trình) ----
  from?: string;
  pages?: { card: string; x: number; y: number }[];
  quizGate?: { quiz: string; x?: number | 'exit' };
  quizGates?: { quiz: string; x?: number | 'exit'; id?: string }[];
  guideSpots?: { x: number; y?: number; text?: string; lines?: string[]; charId?: string; name?: string; card?: string }[];
  checkpoints?: number[];
  comicTriggers?: { x: number; comic: string; once?: boolean }[];
  intro?: string;
  outro?: string;
  /** Có sau khi OG.Journeys biên dịch: id hành trình chứa màn. */
  journey?: string;
  [key: string]: any;
}

/** Hook gắn hành vi vào scene 'level' mà không sửa level.js (OG.Level.addHook). */
interface LevelHook {
  id: string;
  order?: number;
  enter?(st: any): void;
  /** Trả về true để dừng xử lý frame này (vd vừa push scene câu đố). */
  update?(st: any, dt: number, player: Player): boolean | void;
  /** Trả về false để chặn cửa EXIT. */
  canExit?(st: any, player: Player): boolean | void;
  drawWorld?(ctx: CanvasRenderingContext2D, st: any, t: number): void;
  drawFront?(ctx: CanvasRenderingContext2D, st: any, t: number): void;
  drawScreen?(ctx: CanvasRenderingContext2D, st: any, t: number): void;
}

// ---------------------------------------------------------------------------
// Nhân vật & kẻ địch (src/game/player.js, src/game/enemies.js)
// ---------------------------------------------------------------------------

/** Trạng thái người chơi do OG.Player.create tạo. */
interface Player extends PhysicsBody {
  charId: string;
  skin: string | null;
  /** Hướng mặt: 1 = phải, -1 = trái. */
  face: 1 | -1;
  /** Giây bất tử còn lại sau khi bị thương (invulnerability). */
  inv: number;
  invMax: number;
  shield: number;
  magnet: number;
  speed: number;
  jumpV: number;
  anim: string;
  animT: number;
  prevBottom: number;
  celebrate: boolean;
  attackT: number;
  /** Coyote time còn lại: vẫn được nhảy một chút sau khi rời mép bục. */
  coyote: number;
  /** Jump buffer còn lại: bấm nhảy hơi sớm trước khi chạm đất vẫn được tính. */
  jumpBuf: number;
  safeX: number;
  safeY: number;
  [key: string]: any;
}

/** Kẻ địch đang sống trong màn (OG.Enemies.create). */
interface Enemy extends AABB {
  type: string;
  base: number;
  range: number;
  speed: number;
  dir: number;
  alive: boolean;
  stompable: boolean;
  hurts: boolean;
  score: number;
  t: number;
  deadT: number;
  [key: string]: any;
}

/** Loại kẻ địch đăng ký qua OG.Enemies.registerType(name, def). */
interface EnemyTypeDef {
  w: number;
  h: number;
  score?: number;
  stompable?: boolean;
  init?(e: Enemy, src: EnemySpawn): void;
  update?(e: Enemy, dt: number, world: any): void;
  draw?(ctx: CanvasRenderingContext2D, e: Enemy, t: number): void;
}

// ---------------------------------------------------------------------------
// Trùm (src/bosses/) — docs/ARCHITECTURE.md mục 8.3
// ---------------------------------------------------------------------------

/** Đấu trường trùm: dữ liệu + các hàm tiện ích scene 'boss' cung cấp cho trùm. */
interface Arena {
  levelId: string;
  bossId: string;
  theme: string;
  width: number;
  height: number;
  floorY: number;
  t: number;
  platforms: Platform[];
  player: Player;
  enemies: Enemy[];
  hurtPlayer(cause: string): void;
  overlapsPlayer(rect: AABB): boolean;
  shake(mag: number, dur: number): void;
  particles(x: number, y: number, opts?: any): void;
  floatText(x: number, y: number, text: string, color?: string): void;
  toast(text: string): void;
  emit(name: string, payload?: any): void;
  addScore(n: number): void;
  spawnEnemy(src: EnemySpawn): void;
  [key: string]: any;
}

/** Một trùm đang đánh. Thường được viết như một state machine (b.state = 'roll' | 'dizzy' | ...). */
interface BossInstance extends AABB {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  phase: number;
  update(dt: number, arena: Arena): void;
  draw(ctx: CanvasRenderingContext2D, arena: Arena): void;
  getHurtboxes(): AABB[];
  getWeakspot(): AABB | null;
  onHit(dmg: number, arena: Arena): void;
  isDefeated(): boolean;
  [key: string]: any;
}

/** Định nghĩa trùm đăng ký qua OG.Bosses.register(def). */
interface BossDef {
  id: string;
  name: string;
  maxHp: number;
  arena?: { width: number; platforms: number[][]; spawn: Vec2; theme?: string };
  create(arena: Arena): BossInstance;
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// Hành trình học tập (src/core/journeys.js, src/journeys/<id>/) — docs/STORY.md mục 2
// ---------------------------------------------------------------------------

/** Hàm vẽ biểu tượng: (x,y) = tâm, size = cạnh ô vuông, t = thời gian (giây) để làm hoạt ảnh. */
type DrawIconFn = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, t: number) => void;

/** Biểu tượng của thẻ / đáp án: hàm vẽ | decor thư viện | chân dung nhân vật | emoji (tạm). */
type IconSpec = DrawIconFn | { decor: string; opts?: any } | { char: string } | { emoji: string } | string;

/** Thẻ kiến thức. */
interface CardDef { id: string; areaId: string; title: string; fact: string; drawIcon?: DrawIconFn; icon?: IconSpec }

/** Câu đố mở cổng. answer = chỉ số đáp án đúng trong choices. */
interface QuizDef {
  id: string;
  areaId: string;
  question: string;
  choices: { text: string; icon?: IconSpec; drawIcon?: DrawIconFn }[];
  answer: number;
  hint: string;
  explain: string;
  cardId?: string;
}

/** Một khung truyện tranh. */
interface PanelDef {
  bg: string | { theme: string; camX?: number } | ((ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number) => void);
  chars?: { id: string; anim?: string; x: number; y?: number; face?: 1 | -1; scale?: number }[];
  bubbles?: { who: string; text: string }[];
  caption?: string;
}

/** Một khu trong hành trình (nhóm màn cùng chủ đề cảnh nền, có thể kết thúc bằng trùm). */
interface AreaDef {
  id: string;
  name: string;
  emoji?: string;
  sceneryTheme: string;
  music?: string;
  intro?: string;
  outro?: string;
  boss?: { bossId: string; arena?: any; intro?: string };
  levels: LevelDef[];
}

/** Hành trình học tập: dữ liệu THUẦN, đăng ký bằng OG.Journeys.register(def) (data-driven design). */
interface JourneyDef {
  id: string;
  order?: number;
  title: string;
  emoji?: string;
  description?: string;
  guide: { charId: string; name: string };
  palette?: { primary?: string; secondary?: string; accent?: string; bg?: string; ink?: string };
  intro?: string;
  ending?: string | { comic?: string; title?: string; text?: string };
  areas: AreaDef[];
  cards?: CardDef[];
  quizzes?: QuizDef[];
  comics?: { [comicId: string]: PanelDef[] | { panels: PanelDef[] } };
  /** Do validateAll gắn khi dữ liệu có lỗi: hành trình bị ẩn khỏi màn chọn. */
  invalid?: boolean;
  [key: string]: any;
}

/** Kết quả OG.Journeys.validate. */
interface ValidateResult { ok: boolean; errors: string[]; warnings: string[] }

// ---------------------------------------------------------------------------
// Cảnh nền theo chủ đề (src/core/scenery-registry.js, src/gfx/scenery.js) — docs/STORY.md mục 4
// ---------------------------------------------------------------------------

/** Một lớp cảnh nền. parallax: 0 = đứng yên như bầu trời, 1 = cuộn cùng tốc độ camera. */
interface SceneryLayer {
  kind: string;
  parallax?: number;
  y?: number;
  height?: number;
  color?: string;
  spacing?: number;
  draw?: (ctx: CanvasRenderingContext2D, camX: number, t: number, layer: SceneryLayer, theme: ThemeDef) => void;
  [key: string]: any;
}

/** Kiểu tô một loại nền (sàn chính hoặc bục). */
interface PlatformPaint { fill: string; top: string; topH?: number; radius?: number }

/** Định nghĩa chủ đề cảnh nền (OG.Scenery.registerTheme). */
interface ThemeDef {
  name?: string;
  base?: string;
  sky?: {
    top: string;
    bottom: string;
    sun?: { x: number; y: number; r: number; color?: string };
    stars?: boolean;
    clouds?: false | { color?: string; count?: number };
  };
  layers?: SceneryLayer[];
  platformStyle?: { floor?: PlatformPaint; ledge?: PlatformPaint; outline?: boolean };
  decor?: { kind: string; every?: number; start?: number; at?: number[]; y?: number; scale?: number; front?: boolean; opts?: any }[];
  ambient?: { kind: 'snow' | 'leaves' | 'bubbles' | 'sparkle'; color?: string };
  drawCustom?: {
    background?(ctx: CanvasRenderingContext2D, camX: number, t: number, theme: ThemeDef): void;
    platform?(ctx: CanvasRenderingContext2D, plat: Platform, t: number, theme: ThemeDef): boolean | void;
    decor?(ctx: CanvasRenderingContext2D, worldW: number, t: number, theme: ThemeDef): void;
  };
  [key: string]: any;
}

/** Hàm vẽ decor: x = tâm, y = mặt đất (toạ độ thế giới). */
type DecorFn = (ctx: CanvasRenderingContext2D, x: number, y: number, scale: number, t: number, opts?: any) => void;
