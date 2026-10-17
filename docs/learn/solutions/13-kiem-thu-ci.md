# Lời giải — Bài 13: Kiểm thử & CI

> ✋ **Hãy tự làm trước.** Lời giải chỉ là *một* cách làm. Nếu bài của bạn khác nhưng chạy đúng và giải thích được vì sao, bài đó vẫn đạt.
> Quay lại bài học: [13-kiem-thu-ci.md](../13-kiem-thu-ci.md)

---

## ⭐ Đọc lỗi như một kỹ sư

### Thí nghiệm 1: `goal: 99`

Kết quả thật (13 lỗi, trích 6 dòng đầu):

```
THẤT BẠI — 13 lỗi:
  - [journey:setup] Hành trình home lỗi dữ liệu: home.levels.home-kitchen-1.goal: goal (99) lớn hơn số pizza (7)
  - [journey:setup] Hành trình home bị đánh dấu invalid
  - [journey:notebookHub] Sổ tay khám phá không liệt kê đủ 4 hành trình
  - [journey:notebookHub] Không tìm thấy phần tử để bấm: Sổ tay: home (scene notebookHub)
  - [journey:notebookHub] Mong đợi scene "notebook" (sổ tay khám phá → sổ tay home), thực tế: notebookHub
  - [journey:notebookHub] Mong đợi scene "notebookHub" (sổ tay → sổ tay khám phá), thực tế: menu
```

- **Nguyên nhân gốc:** chỉ dòng đầu tiên. Nó có đủ ba thông tin: giai đoạn (`journey:setup`), **đường dẫn** dữ liệu (`home.levels.home-kitchen-1.goal`), và giá trị thực tế (99 so với 7 pizza).
- **Hệ quả:** mọi lỗi còn lại. `validateAll` đặt `invalid = true`, hành trình `home` bị ẩn khỏi sổ tay và màn chọn, nên mọi bước test cần tới `home` đều hỏng dây chuyền.

Quy tắc khi đọc log test đầu-cuối: **sửa lỗi đầu tiên, chạy lại**, đừng sửa 13 lỗi cùng lúc. Đây cũng là lý do `validateDef` ghi đường dẫn vào thông báo: bạn biết ngay phải mở file nào, dòng nào.

### Thí nghiệm 2: `result.levelScor`

| Công cụ | Kết quả |
|---|---|
| `node tests/smoke.js` | **XANH** |
| `tsc` | `src/game/progress.js(106,58): error TS2551: Property 'levelScor' does not exist on type '{ levelScore: number; stars: number; time: number; }'. Did you mean 'levelScore'?` |

(Đây là kết quả thật khi chạy; số dòng có thể khác nếu file đã đổi.)

**Vì sao smoke test bỏ sót?** `result.levelScor` là `undefined`, và `undefined | 0` bằng `0`. Dòng code không ném lỗi, chỉ lặng lẽ tính sai (`bestScore` của màn không bao giờ tăng). Smoke test bắt **lỗi runtime** và những gì có `check` khẳng định, mà không check nào đọc `bestScore` của từng màn.

**Vì sao tsc bắt được?** `progress.js` có `// @ts-check`, và tham số `result` có JSDoc `{levelScore: number, stars: number, time: number}`. tsc biết chính xác các field hợp lệ.

Kết luận: hai công cụ **bổ sung** cho nhau. Smoke test bắt lỗi tích hợp và runtime; tsc bắt lỗi gõ sai tên field, sai kiểu, *ngay cả trên nhánh code test không chạy tới*. Có thể thêm một check vào smoke test (vd `check(OG.Progress.getRecord('kitchen').bestScore > 0, ...)`) để lấp chỗ hở này.

---

## ⭐⭐ `musicChecks()`

Thêm vào [tests/smoke.js](../../../tests/smoke.js), ngay **trước** comment `// In tổng kết.` (phía trên hàm `finish`):

```js
// ---------------------------------------------------------------------------
// Kiểm tra DỮ LIỆU nhạc nền (kiểm tra tĩnh trên dữ liệu đã nạp, không cần phát tiếng)
// ---------------------------------------------------------------------------
// Cùng regex với noteToMidi trong src/audio/music.js: token sai bị compile() BỎ QUA trong im lặng,
// nên chỉ có test mới bắt được lỗi gõ như 'C#' (thiếu quãng tám) hay 'H5'.
const NOTE_TOKEN = /^([A-G])(#|b)?(-?\d)$/;
function musicChecks() {
  stage = 'music:data';
  const ids = OG.Audio.listTracks();
  check(ids.length >= 10, 'Quá ít bản nhạc: ' + ids.length);
  ids.forEach((id) => {
    const song = OG.Audio._music._compile(id);
    if (!check(song && song.total > 0, 'Bản nhạc "' + id + '" không biên dịch được')) return;
    // song.def là bản ĐÃ GỘP extend (bossFinal kế thừa melody của boss).
    (song.def.melody || []).forEach((bar, b) => {
      const toks = String(bar).split(/\s+/).filter((t) => t && t !== '|');
      check(toks.length === 16, '"' + id + '" ô nhịp ' + b + ': ' + toks.length + ' token (cần đúng 16)');
      toks.forEach((t) => check(t === '.' || t === '-' || NOTE_TOKEN.test(t), '"' + id + '" ô nhịp ' + b + ': token lạ "' + t + '"'));
    });
    check(song.steps.some((evs) => evs.some((e) => e.ch === 'lead')), '"' + id + '": không có nốt giai điệu nào');
  });
}
```

Gọi trong `main()`:

```js
  await qaChecks();
  await journeyChecks();
  await photoChecks();
  await difficultyChecks();
  musicChecks();

  await resetFlow();
```

**Kiểm chứng (kết quả thật):** với dữ liệu hiện tại, test XANH (10 bản nhạc có sẵn, cộng bản `beach` nếu bạn đã làm [Bài 10](../10-web-audio.md) ⭐⭐). Cố tình sửa token cuối của một ô nhịp thành `'H5'`:

```
THẤT BẠI — 1 lỗi:
  - [music:data] "beach" ô nhịp 3: token lạ "H5"
```

**Giải thích các quyết định**

- **Đặt sau `difficultyChecks`, trước `resetFlow`:** check này chỉ *đọc* dữ liệu, không đổi trạng thái game, nên không phá giả định của bước khác (xem ⚠️ phía trên `main()` về chuyện chèn check vào giữa chuỗi).
- **Không `async`:** không có `step()` hay Promise nào phải chờ.
- **`song.def` thay vì `OG.Audio.tracks[id]`:** `bossFinal` chỉ có `{ extend: 'boss', bpm, transpose }`. Bản đã biên dịch mang định nghĩa đã gộp, nên vẫn kiểm tra được giai điệu kế thừa.
- **Chép regex thay vì gọi hàm game:** `noteToMidi` là hàm nội bộ trong IIFE của music.js. Chép regex nghĩa là test và game có thể lệch nhau nếu ai đó sửa cú pháp nốt. Comment phía trên hằng `NOTE_TOKEN` nhắc điều đó. Cách chặt chẽ hơn là công khai một hàm kiểm tra, ví dụ `OG.Audio._music._parseNote` (giống cách `photoChecks` dùng `OG.Photos.licenseOk` "để test và game không lệch nhau"), nhưng làm vậy là đổi API của module.
- **`ids.length >= 10`:** giống `scanned > 60` của `fontChecks`, đây là "test cho chính test". Nếu `listTracks()` trả mảng rỗng (vd music.js không được nạp), mọi check bên trong `forEach` sẽ không chạy, và test sẽ "xanh giả".
- **Gọi `_compile` trong test có tác dụng phụ không?** Có, nó ghi vào cache `compiled`. Kết quả biên dịch tất định nên điều này vô hại: lần phát thật chỉ dùng lại cache.

---

## ⭐⭐⭐ `.github/workflows/ci.yml`

```yaml
# Kiểm tra mọi Pull Request và mọi nhánh KHÁC master (master đã có pages.yml lo test + deploy).
name: CI

on:
  pull_request:
  push:
    branches-ignore: [master]

permissions:
  contents: read          # chỉ đọc code: workflow kiểm tra không cần quyền ghi

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true   # đẩy commit mới lên cùng nhánh thì huỷ lần chạy cũ

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        node: [20, 22]     # chạy song song trên 2 bản Node
    steps:
      - uses: actions/checkout@v5

      - uses: actions/setup-node@v5
        with:
          node-version: ${{ matrix.node }}

      - name: Kiểm tra cú pháp từng file JS
        run: |
          for f in $(git ls-files 'src/*.js' 'tests/*.js'); do
            node --check "$f" || exit 1
          done

      - name: Smoke test
        run: node tests/smoke.js

      - name: Kiểm tra kiểu (JSDoc + tsc)
        if: matrix.node == 22   # kiểu không phụ thuộc bản Node → chạy 1 lần là đủ
        run: npx -y -p typescript@5.6.3 tsc -p jsconfig.json --noEmit
```

**Đã kiểm tra:** file YAML hợp lệ (đọc lại được bằng một trình phân tích YAML). Vòng lặp `node --check` qua mọi file hiện có. Smoke test XANH, và `tsc` thoát mã 0 trên code hiện tại. Riêng việc chạy trên GitHub thì bạn cần push lên một nhánh để xem trong tab **Actions**.

**Giải thích từng phần**

| Phần | Ý nghĩa |
|---|---|
| `pull_request` + `branches-ignore: [master]` | PR được kiểm tra **trước** khi merge; push vào nhánh tính năng cũng được kiểm tra. `master` bỏ qua vì `pages.yml` đã chạy smoke test ở đó (tránh chạy hai lần). |
| `permissions: contents: read` | least privilege. Workflow chạy code của PR (có thể từ người ngoài); cấp quyền ghi là mở cửa cho rủi ro. |
| `concurrency` theo `github.ref` | mỗi nhánh/PR một nhóm; push liên tiếp chỉ giữ lần chạy mới nhất, tiết kiệm phút chạy. |
| `matrix.node: [20, 22]` | phát hiện code chỉ chạy được trên một bản Node (vd dùng API mới của Node 22 trong test). |
| `fail-fast: false` | một bản đỏ không huỷ bản kia, nên bạn biết lỗi xảy ra ở một bản hay cả hai. |
| `node --check` trước smoke test | báo lỗi cú pháp **đúng tên file** và chạy rất nhanh. Smoke test cũng bắt được ("Lỗi khi load ..."), nhưng chậm hơn và log dài hơn. |
| `git ls-files` | chỉ kiểm tra file đã commit (giống thứ sẽ được deploy), bỏ qua file rác chưa track. |
| `if: matrix.node == 22` cho tsc | kết quả kiểm tra kiểu không phụ thuộc runtime Node. Ghim `typescript@5.6.3` để kết quả không đổi khi TypeScript ra bản mới. |

**Vì sao không gộp vào `pages.yml`?**

1. `pages.yml` cần quyền `pages: write` + `id-token: write` để deploy. Chạy nó cho mọi PR nghĩa là cấp quyền đó cho code chưa được review.
2. Mỗi PR không nên deploy đè lên site thật.
3. Tách riêng thì mỗi file có một mục đích rõ ràng: `ci.yml` = "code này có tốt không?", `pages.yml` = "đưa bản tốt lên mạng".

**Chặn merge PR đỏ:** vào *Settings → Branches* (hoặc *Rules → Rulesets*), tạo quy tắc cho `master`: bật **Require a pull request before merging** và **Require status checks to pass before merging**, rồi chọn các check `test (20)` và `test (22)`. Từ đó nút *Merge* bị khoá cho tới khi CI xanh.

**Mở rộng (tuỳ chọn)**

- Thêm `cache: npm` cho `setup-node` thì không có tác dụng ở đây, vì dự án không có `package.json`. Lệnh `npx` tự tải TypeScript vào cache của runner.
- Chạy smoke test với `--verbose` chỉ khi thất bại: tách thành hai bước, bước thứ hai có `if: failure()`.
