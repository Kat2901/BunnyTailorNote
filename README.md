# BunnyTailor — Sổ ghi chú may cosplay (bản GitHub Pages + PWA)

## Các file

| File | Vai trò |
|------|---------|
| `index.html` | Giao diện (3 tab: Đơn hàng, Lịch, Biểu đồ) + meta PWA |
| `styles.css` | Giao diện pastel + theme thỏ |
| `app.js` | Logic chính (render, form, CRUD, lịch, biểu đồ, đăng ký service worker) |
| `db.js` | Lớp dữ liệu IndexedDB (thay thế server Node.js) |
| `manifest.json` | Cấu hình PWA (tên, icon, theme, hiển thị standalone) |
| `sw.js` | Service worker — cache app shell để chạy offline |
| `icon-192.png`, `icon-512.png`, `favicon.png` | Icon PWA (bunny face pastel) |
| `.nojekyll` | File rỗng — báo GitHub Pages bỏ qua xử lý Jekyll (để manifest/sw không bị lọc) |
| `.gitignore` | Bỏ qua file hệ điều hành/editor/log |

Đây là toàn bộ những file cần có. Không có `server.js`, không `node_modules`, không cần cài đặt gì.

## Chạy thử trên máy (không cần cài gì)

### Cách 1 — Mở trực tiếp
Bấm đúp vào `index.html` → mở trong browser.
(Lưu ý: service worker và manifest chỉ hoạt động qua `http(s)://`, không qua `file://` — muốn test PWA/offline đầy đủ thì dùng Cách 2.)

### Cách 2 — Chạy local server (khuyến nghị để test PWA)
```
cd thư-mục-chứa-các-file
python -m http.server 8000
```
Mở browser tại `http://localhost:8000`.

## Deploy lên GitHub Pages

### Bước 1 — Đẩy các file lên repo GitHub
Đặt **toàn bộ các file** ở **thư mục gốc** của repo (ví dụ repo `Kat2901/BunnyTailorNote`). Nếu repo đã có file cũ (bản Node.js với `server.js`, `package.json`, `data/`, `public/`), xoá chúng đi — chỉ giữ các file của bản này ở gốc.

Quan trọng: phải có cả file **`.nojekyll`** (rỗng) ở gốc, nếu không GitHub Pages có thể lọc mất `manifest.json` hoặc file có dấu gạch dưới.

```bash
git add index.html styles.css app.js db.js manifest.json sw.js icon-192.png icon-512.png favicon.png .nojekyll .gitignore README.md
git commit -m "Bản static PWA + IndexedDB (GitHub Pages)"
git push
```

### Bước 2 — Bật GitHub Pages
1. Vào repo trên GitHub → **Settings** → **Pages** (menu bên trái).
2. **Build and deployment** → **Source**: **Deploy from a branch**.
3. **Branch**: `main` (hoặc `master`) → thư mục **/(root)**.
4. Bấm **Save**.

### Bước 3 — Chờ ~1-2 phút

Mở link → app chạy online.

### Cập nhật sau này
Mỗi lần sửa code → `git push` → GitHub Pages tự cập nhật sau ~1-2 phút.

> Lưu ý về cache service worker: nếu sau này đổi nội dung file, người dùng đã vào app trước đó có thể vẫn thấy bản cũ (do SW cache). Để ép làm mới, tăng version cache trong `sw.js` (đổi `bunnytailor-v1` thành `bunnytailor-v2`) rồi push.

## Tính năng PWA

- **Cài vào màn hình**: trên Chrome (desktop/Android) → thanh địa chỉ hiện icon "Cài đặt"; trên iOS Safari → Share → "Thêm ra màn hình chính". App mở như app độc lập (không có thanh địa chỉ).
- **Chạy offline**: sau lần truy cập đầu, service worker cache toàn bộ app shell (HTML/CSS/JS/icon). Mở lại khi không có mạng vẫn dùng được đầy đủ — dữ liệu đọc từ IndexedDB.
- Icon app là mặt thỏ pastel (xuất hiện trên màn hình chính khi cài).

## Dữ liệu hoạt động thế nào

- **Lưu trong IndexedDB của trình duyệt** — tồn tại vĩnh viễn cho đến khi bạn tự xoá.
- **Mỗi trình duyệt/máy riêng biệt**: data trên Chrome máy nhà ≠ data trên Chrome điện thoại ≠ data trên Firefox. **Không đồng bộ giữa các thiết bị** (đây là điểm khác biệt đã chọn so với bản có server).
- **Xoá dữ liệu browse** (Clear browsing data) → mất data.
- **Ảnh** lưu dạng base64 ngay trong IndexedDB (mỗi ảnh ≤ ~8MB, tối đa 12 ảnh/đơn hoặc /ô). Ảnh lớn làm IndexedDB phình nhanh — nên nén ảnh trước khi tải lên.

## Tính năng app

- **Đơn hàng**: thêm/sửa/xoá, nhân vật, series, khách hàng, deadline, trạng thái (Chờ vật liệu / Đang may / Hoàn thành), tiền, số đo 15 chỉ số, loại vải, vật liệu bổ sung, ảnh costume, link Facebook, ghi chú.
- **Lịch**: lịch tháng, hiện deadline đơn + ô ghi chú; bấm một ngày → mở ô ghi chú (chèn ảnh + ghi chú + đổi màu).
- **Biểu đồ**: tổng doanh thu, doanh thu theo trạng thái, theo tháng.
- **Dữ liệu mẫu**: nạp 4 đơn + 4 ô ghi chú demo (deadline theo ngày hiện tại).
- **Xoá tất cả**: xoá toàn bộ đơn hàng + ô ghi chú + ảnh (có xác nhận).

