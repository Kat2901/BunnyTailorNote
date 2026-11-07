# BunnyTailor — Sổ ghi chú cho thợ may cosplay

App ghi chú cá nhân để theo dõi **đơn hàng may cosplay** + **lịch hẹn deadline** + **ô ghi chú** (mỗi ô chèn ảnh + ghi chú, ghim theo ngày). Pure Node.js, **không dependency** — chỉ cần Node 18+.


## Chạy

```bash
cd BunnyTailorWeb
node server.js
# → http://localhost:3000   (cổng bận sẽ tự thử 3001, 3002…)
```

Cấu hình cổng: `PORT=4000 node server.js`

Lần đầu chạy sẽ tự tạo `data/` (rỗng). Mở web, bấm **“Dữ liệu mẫu”** trên thanh nav để nạp vài đơn + ô ghi chú demo, hoặc bấm **“＋ Thêm đơn hàng”** để bắt đầu ngay.

## Ba tab chính

**1. Đơn hàng** — quản lý từng đơn may:
- Tên đơn · nhân vật · series · khách hàng · deadline · ghi chú.
- **Tiền đơn (VNĐ)**: số tiền khách trả, dùng để tính doanh thu. Hiển thị dạng `2.400.000đ` trên thẻ.
- **Số đo khách hàng**: lưới đầy đủ 15 chỉ số, chia 4 nhóm — *Tổng quát* (Chiều cao, Cân nặng) · *Thân trên* (Vai, Cổ, Ngực, Eo, Dài áo, Vòng nách) · *Tay* (Bắp tay, Cổ tay, Dài tay) · *Thân dưới* (Mông, Đùi, Bắp chân, Dài quần). Mọi trường tuỳ chọn — để trống nếu không đo. Thẻ đơn hiện 6 chỉ số chính + “+N chỉ số” nếu còn.
- **Loại vải** + **Số mét vải ước tính**: ghi vải chính của đơn.
- **Vật liệu bổ sung**: nút **“＋ Thêm vật liệu”** thêm tự do từng loại (tên · số lượng · đơn vị · ước tính tiền). Mỗi dòng xoá được bằng nút ×. Tổng ước tính hiện trên thẻ đơn.
- **Ảnh tham chiếu costume**: nút **“＋ Thêm ảnh costume”** tải nhiều ảnh cùng lúc (tối đa 12 ảnh/đơn, mỗi ảnh ≤ 8MB). Ảnh chọn xong hiện preview ngay trong form; bấm × để bỏ. Khi lưu đơn, ảnh được tải lên server và hiện thành dải thumbnail trên thẻ đơn — bấm ảnh để phóng to (lightbox).
- **Link Facebook khách hàng**: ô URL, hiển thị thành link bấm mở được trên thẻ đơn.
- Trạng thái: **Chờ vật liệu → Đang may → Hoàn thành**.
- Bảng thống kê số lượng + bộ lọc theo trạng thái + thẻ **💰 Đã thu (hoàn thành)**.
- Mỗi đơn hiển thị số ngày còn đến deadline (hoặc “trễ X ngày” / “hôm nay”).
- Mọi deadline tự động lên lịch ở tab Lịch.

**2. Lịch** — monthly calendar:
- Lưới 7 cột (CN → T7), chuyển tháng bằng ‹ › hoặc nút **Hôm nay**.
- Mỗi ô ngày hiển thị: badge deadline đơn (màu rose) + chip ô ghi chú (5 màu tuỳ chọn).
- **Bấm vào một ngày** → mở ô chi tiết ngày:
  - Danh sách đơn hàng đến deadline ngày đó.
  - **Ô ghi chú (sub-function)**: bấm **“＋ Thêm ô ghi chú”** để tạo bao nhiêu ô tuỳ ý. Mỗi ô có:
    - Tiêu đề + ghi chú (tự lưu khi bạn ngừng gõ ~0.6 giây).
    - 5 màu để phân loại (rose / gold / sage / cream / lilac).
    - **Chèn nhiều ảnh** (bấm ô “＋ Thêm ảnh”, chọn 1 hoặc nhiều ảnh — tối đa 12 ảnh/ô, mỗi ảnh ≤ 8 MB).
    - Bấm ảnh để phóng to (lightbox), bấm × để xoá ảnh.
    - Xoá cả ô khi không cần.

**3. Biểu đồ** — tổng quan &amp; doanh thu:
- 4 thẻ tổng tiền: **Tổng doanh thu toàn bộ đơn** · **💰 Đã kiếm được (hoàn thành)** · **Đang may** · **Chờ vật liệu** (tính từ `price` từng đơn).
- **Donut**: đơn hàng theo trạng thái (Chờ vật liệu / Đang may / Hoàn thành).
- **Bar**: doanh thu theo trạng thái.
- **Bar**: doanh thu theo tháng (dựa trên deadline đơn).
- Biểu đồ vẽ bằng SVG inline (không cần thư viện ngoài), cập nhật tự động mỗi khi thêm/sửa/xoá đơn.

## Cấu trúc

```
BunnyTailorWeb/
├── server.js            # Server Node thuần: REST API + static + lưu JSON + upload ảnh
├── public/
│   ├── index.html       # HTML 3 tab + toàn bộ JS inline (orders CRUD, calendar, ô ghi chú, biểu đồ)
│   └── styles.css       # Design system pastel/thỏ + component calendar/ô ghi chú/biểu đồ
└── data/                # Tự tạo khi chạy
    ├── db.json          # { orders, notes }
    └── uploads/         # Ảnh chèn vào ô ghi chú (tự tạo khi có upload đầu tiên)
```

## API (cho ai muốn tự động hoá)

| Phương thức | Đường dẫn | Chức năng |
| --- | --- | --- |
| `GET` | `/api/orders` | Danh sách đơn (sắp xếp theo deadline) |
| `POST` | `/api/orders` | Tạo đơn (JSON) |
| `PUT` | `/api/orders/:id` | Sửa đơn |
| `DELETE` | `/api/orders/:id` | Xoá đơn (kèm xoá ảnh costume vật lý) |
| `POST` | `/api/orders/:id/images` | Chèn ảnh costume (multipart/form-data, field `images`) |
| `DELETE` | `/api/orders/:id/images/:imgId` | Xoá 1 ảnh costume |
| `GET` | `/api/stats` | Tổng hợp doanh thu: `count`, `byStatus`, `revenue{total,done,pending,sewing,avg}`, `byMonth[]` |
| `GET` | `/api/notes` hoặc `/api/notes?date=YYYY-MM-DD` | Ô ghi chú (lọc theo ngày nếu có) |
| `POST` | `/api/notes` | Tạo ô (JSON: `date, title, content, color`) |
| `PUT` | `/api/notes/:id` | Sửa ô |
| `DELETE` | `/api/notes/:id` | Xoá ô (kèm xoá ảnh vật lý) |
| `POST` | `/api/notes/:id/images` | Chèn ảnh (multipart/form-data, field `images`) |
| `DELETE` | `/api/notes/:id/images/:imgId` | Xoá 1 ảnh |
| `POST` | `/api/seed` | Nạp dữ liệu mẫu (chỉ khi db đang rỗng) |

Trường `date` và `deadline` theo định dạng `YYYY-MM-DD`. `color` thuộc `rose|gold|sage|cream|lilac`. `status` thuộc `pending|sewing|done`.

Đơn hàng (order) có các trường: `title`, `character`, `series`, `client`, `deadline`, `status`, `price` (số nguyên VNĐ), `measurements` (object 15 chỉ số: `cao,nang,vai,co,nguc,eo,dai_ao,vong_nach,bap_tay,co_tay,dai_tay,mong,dui,bap_chan,dai_quan` — mỗi giá trị chuỗi, tuỳ chọn), `fabricType` (chuỗi), `fabricMeters` (chuỗi), `materials` (mảng `{name,qty,unit,cost}`), `images` (mảng `{id,url,name,createdAt}` — quản lý qua endpoint `/api/orders/:id/images`, tối đa 12 ảnh), `facebook` (chuỗi URL, tuỳ chọn), `note`.


