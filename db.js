"use strict";
/* ============================================================
   BunnyTailor — IndexedDB data layer (static / GitHub Pages)
   ------------------------------------------------------------
   Đây là bản "không server": toàn bộ dữ liệu được lưu trong
   IndexedDB của trình duyệt. File này cung cấp hàm api() và
   apiJSON() có CHÍNH XÁC cùng giao diện với bản Node.js, nên
   phần giao diện (index.html) dùng được nguyên vẹn.

   · Orders  → object store "orders"  (keyPath: id)
   · Notes   → object store "notes"   (keyPath: id)
   · Ảnh     → lưu dạng data URL (base64) ngay trong order/note
   ============================================================ */

const DB_NAME = "bunnytailor";
const DB_VER = 1;
const VALID_NOTE_COLORS = ["rose", "gold", "sage", "cream", "lilac"];
const VALID_STATUSES = ["pending", "sewing", "done"];
const MAX_IMAGES = 12;

let _db = null;

function dbOpen() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains("orders")) d.createObjectStore("orders", { keyPath: "id" });
      if (!d.objectStoreNames.contains("notes")) d.createObjectStore("notes", { keyPath: "id" });
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function store(name, mode) {
  return dbOpen().then((d) => d.transaction(name, mode).objectStore(name));
}
function dbAll(name) {
  return store(name, "readonly").then((s) => new Promise((res, rej) => {
    const r = s.getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
function dbGet(name, id) {
  return store(name, "readonly").then((s) => new Promise((res, rej) => {
    const r = s.get(id);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
function dbPut(name, val) {
  return store(name, "readwrite").then((s) => new Promise((res, rej) => {
    const r = s.put(val);
    r.onsuccess = () => res(val);
    r.onerror = () => rej(r.error);
  }));
}
function dbDel(name, id) {
  return store(name, "readwrite").then((s) => new Promise((res, rej) => {
    const r = s.delete(id);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  }));
}
function dbClear(name) {
  return store(name, "readwrite").then((s) => new Promise((res, rej) => {
    const r = s.clear();
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  }));
}

/* ---------- helpers ---------- */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}
function nowISO() {
  return new Date().toISOString();
}
function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(file);
  });
}

/* ---------- cleaners (đảm bảo field mặc định) ---------- */
function cleanOrder(d, base) {
  const o = base ? Object.assign({}, base) : {};
  o.id = o.id || uid();
  o.title = String((d && d.title) || "").trim();
  o.character = String((d && d.character) || "");
  o.series = String((d && d.series) || "");
  o.client = String((d && d.client) || "");
  o.deadline = String((d && d.deadline) || "");
  o.status = VALID_STATUSES.includes(d && d.status) ? d.status : (VALID_STATUSES.includes(o.status) ? o.status : "pending");
  o.price = Math.max(0, Math.floor(Number((d && d.price) || 0) || 0));
  o.measurements = (d && d.measurements && typeof d.measurements === "object") ? d.measurements : (o.measurements || {});
  o.fabricType = String((d && d.fabricType) || "");
  o.fabricMeters = String((d && d.fabricMeters) || "");
  o.materials = Array.isArray(d && d.materials) ? d.materials : (o.materials || []);
  o.images = Array.isArray(d && d.images) ? d.images : (o.images || []);
  o.facebook = String((d && d.facebook) || "");
  o.note = String((d && d.note) || "");
  const t = nowISO();
  o.createdAt = o.createdAt || t;
  o.updatedAt = t;
  return o;
}
function cleanNote(d, base) {
  const n = base ? Object.assign({}, base) : {};
  n.id = n.id || uid();
  n.date = String((d && d.date) || "");
  n.title = String((d && d.title) || "");
  n.content = String((d && d.content) || "");
  n.color = VALID_NOTE_COLORS.includes(d && d.color) ? d.color : (VALID_NOTE_COLORS.includes(n.color) ? n.color : "rose");
  n.images = Array.isArray(d && d.images) ? d.images : (n.images || []);
  const t = nowISO();
  n.createdAt = n.createdAt || t;
  n.updatedAt = t;
  return n;
}

/* ---------- image ops (FormData → data URL) ---------- */
async function addImages(storeName, id, formData) {
  const item = await dbGet(storeName, id);
  if (!item) throw new Error(storeName === "orders" ? "Không thấy đơn hàng" : "Không thấy ô ghi chú");
  const files = [];
  if (formData && typeof formData.entries === "function") {
    for (const [, v] of formData.entries()) {
      if (v instanceof Blob) files.push(v);
    }
  }
  const room = Math.max(0, MAX_IMAGES - (item.images || []).length);
  const take = files.slice(0, room);
  const added = [];
  for (const f of take) {
    const url = await fileToDataURL(f);
    added.push({ id: uid(), url, name: f.name || "ảnh", createdAt: nowISO() });
  }
  item.images = (item.images || []).concat(added);
  item.updatedAt = nowISO();
  await dbPut(storeName, item);
  const key = storeName === "orders" ? "order" : "note";
  return { added, [key]: item };
}
async function removeImage(storeName, id, imgId) {
  const item = await dbGet(storeName, id);
  if (!item) throw new Error("Không thấy mục");
  item.images = (item.images || []).filter((i) => i.id !== imgId);
  item.updatedAt = nowISO();
  await dbPut(storeName, item);
  return { ok: true, id: imgId };
}

/* ---------- uploadOrderImages (ảnh costume khi lưu đơn) ----------
   Bản server gốc gọi hàm này nhưng quên định nghĩa → ảnh costume
   khi lưu đơn luôn lỗi. Bản static định nghĩa lại ở đây.           */
async function uploadOrderImages(orderId, files) {
  const order = await dbGet("orders", orderId);
  if (!order) throw new Error("Không thấy đơn hàng");
  const room = Math.max(0, MAX_IMAGES - (order.images || []).length);
  const take = Array.from(files || []).slice(0, room);
  const added = [];
  for (const f of take) {
    const url = await fileToDataURL(f);
    added.push({ id: uid(), url, name: f.name || "ảnh", createdAt: nowISO() });
  }
  order.images = (order.images || []).concat(added);
  order.updatedAt = nowISO();
  await dbPut("orders", order);
  return { added, order };
}

/* ---------- seed dữ liệu mẫu (deadline theo ngày tương đối) ---------- */
async function seedDemo() {
  const orders = await dbAll("orders");
  const notes = await dbAll("notes");
  if (orders.length || notes.length) {
    return { ok: false, msg: "Đã có dữ liệu. Bấm “Xoá tất cả” rồi nạp lại mẫu." };
  }
  const t = nowISO();
  const D = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return isoDate(d); };

  const ordersData = [
    {
      title: "Áo khoác Vega — Genshin", character: "Vega", series: "Genshin Impact",
      client: "Khách Linh", deadline: D(1), status: "sewing", price: 2400000,
      measurements: { cao: "165", nang: "52", vai: "40", co: "36", nguc: "88", eo: "66", dai_ao: "68", vong_nach: "42", bap_tay: "30", co_tay: "15", dai_tay: "58", mong: "92", dui: "52", bap_chan: "34", dai_quan: "100" },
      fabricType: "Nhung đen + viền gold", fabricMeters: "2.5",
      materials: [{ name: "Viền gold", qty: "0.5", unit: "m", cost: 120000 }, { name: "Cúc cổ lọ", qty: "6", unit: "cái", cost: 60000 }],
      facebook: "https://facebook.com/linh.cosplay", note: "Đo lại vai ngày 5. Cẩn ống tay.",
    },
    {
      title: "Set đồng phục Sakura", character: "Sakura", series: "Cardcaptor Sakura",
      client: "Khách Hà", deadline: D(8), status: "pending", price: 1800000,
      measurements: { cao: "158", nang: "45", vai: "36", co: "32", nguc: "80", eo: "60", dai_ao: "60", vong_nach: "38", bap_tay: "26", co_tay: "14", dai_tay: "54", mong: "86", dui: "48", bap_chan: "30", dai_quan: "96" },
      fabricType: "Batiste trắng", fabricMeters: "3",
      materials: [{ name: "Khoá kéo", qty: "1", unit: "cái", cost: 15000 }, { name: "Ren viền", qty: "2", unit: "m", cost: 80000 }],
      facebook: "https://facebook.com/ha.le", note: "Chờ vải batiste trắng về kho.",
    },
    {
      title: "Giáp vai Dante", character: "Dante", series: "Devil May Cry",
      client: "Khách Minh", deadline: D(15), status: "sewing", price: 3100000,
      measurements: { cao: "178", nang: "70", vai: "46", co: "40", nguc: "98", eo: "82", dai_ao: "74", vong_nach: "46", bap_tay: "34", co_tay: "17", dai_tay: "62", mong: "100", dui: "56", bap_chan: "38", dai_quan: "104" },
      fabricType: "EVA foam 10mm", fabricMeters: "1.2",
      materials: [{ name: "Sơn metallic red", qty: "2", unit: "lớp", cost: 220000 }, { name: "Varnish mờ", qty: "1", unit: "chai", cost: 90000 }, { name: "Dây đeo", qty: "2", unit: "bộ", cost: 110000 }],
      facebook: "", note: "Giáp EVA foam, sơn 2 lớp metallic red.",
    },
    {
      title: "Váy-padding Annie", character: "Annie", series: "League of Legends",
      client: "Khách Trang", deadline: D(20), status: "done", price: 1500000,
      measurements: { cao: "150", nang: "40", vai: "34", co: "30", nguc: "76", eo: "58", dai_ao: "56", vong_nach: "36", bap_tay: "24", co_tay: "13", dai_tay: "50", mong: "82", dui: "46", bap_chan: "28", dai_quan: "92" },
      fabricType: "Cotton đỏ", fabricMeters: "2",
      materials: [{ name: "Vải lót", qty: "1.5", unit: "m", cost: 75000 }],
      facebook: "https://facebook.com/trang.an", note: "Đã giao. Khách xác nhận vừa size.",
    },
  ];
  const notesData = [
    { date: D(1), title: "Vật liệu Vega", content: "Nhung đen 2m, viền gold 0.5m, cúc áo cổ lọ 6 chiếc.", color: "rose" },
    { date: D(1), title: "Tham khảo cổ áo", content: "Tham chiếu cổ áo + ống tay từ artbook trang 42.", color: "gold" },
    { date: D(8), title: "Ghi chú đo size Hà", content: "Vai 38, ngực 86, eo 64. Lên form thứ 6.", color: "sage" },
    { date: D(15), title: "Quy trình sơn giáp", content: "Layer 1 primer xám → layer 2 đỏ metallic → varnish mờ.", color: "lilac" },
  ];

  for (const o of ordersData) {
    const full = cleanOrder(o);
    full.createdAt = t; full.updatedAt = t;
    await dbPut("orders", full);
  }
  for (const n of notesData) {
    const full = cleanNote(n);
    full.createdAt = t; full.updatedAt = t;
    await dbPut("notes", full);
  }
  return { ok: true, orders: ordersData.length, notes: notesData.length };
}

/* ============================================================
   api() — shim IndexedDB, khớp giao diện bản Node.js
   Giao diện: api(path, opts) -> Promise<data>
   ============================================================ */
async function api(path, opts) {
  opts = opts || {};
  const method = (opts.method || "GET").toUpperCase();
  let pathname = path;
  try {
    pathname = new URL(path, location.href).pathname;
  } catch (_) { /* path đã là pathname */ }
  const parts = pathname.split("/").filter(Boolean); // ["api", "orders", id?, sub?, imgId?]

  // parse body
  let body = null;
  if (opts.body !== undefined && opts.body !== null) {
    if (opts.body instanceof FormData) body = opts.body;
    else if (typeof opts.body === "string") {
      try { body = JSON.parse(opts.body); } catch (_) { body = opts.body; }
    } else body = opts.body;
  }

  // ---- orders ----
  if (pathname === "/api/orders" && method === "GET") return dbAll("orders");
  if (pathname === "/api/orders" && method === "POST") {
    const o = cleanOrder(body || {});
    await dbPut("orders", o);
    return o;
  }
  if (parts[0] === "api" && parts[1] === "orders" && parts[2]) {
    const id = parts[2], sub = parts[3], imgId = parts[4];
    if (!sub && method === "PUT") {
      const base = await dbGet("orders", id);
      const o = cleanOrder(body || {}, base || { id });
      await dbPut("orders", o);
      return o;
    }
    if (!sub && method === "DELETE") {
      await dbDel("orders", id);
      return { ok: true, id };
    }
    if (sub === "images" && method === "POST") return addImages("orders", id, body);
    if (sub === "images" && imgId && method === "DELETE") return removeImage("orders", id, imgId);
  }

  // ---- notes ----
  if (pathname === "/api/notes" && method === "GET") return dbAll("notes");
  if (pathname === "/api/notes" && method === "POST") {
    const n = cleanNote(body || {});
    await dbPut("notes", n);
    return n;
  }
  if (parts[0] === "api" && parts[1] === "notes" && parts[2]) {
    const id = parts[2], sub = parts[3], imgId = parts[4];
    if (!sub && method === "PUT") {
      const base = await dbGet("notes", id);
      const n = cleanNote(body || {}, base || { id });
      await dbPut("notes", n);
      return n;
    }
    if (!sub && method === "DELETE") {
      await dbDel("notes", id);
      return { ok: true, id };
    }
    if (sub === "images" && method === "POST") return addImages("notes", id, body);
    if (sub === "images" && imgId && method === "DELETE") return removeImage("notes", id, imgId);
  }

  // ---- seed ----
  if (pathname === "/api/seed" && method === "POST") return seedDemo();

  // ---- reset ----
  if (pathname === "/api/reset" && method === "POST") {
    await dbClear("orders");
    await dbClear("notes");
    return { ok: true, orders: 0, notes: 0, deletedFiles: 0 };
  }

  throw new Error("Không tìm thấy endpoint");
}

function apiJSON(path, method, body) {
  return api(path, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

window.api = api;
window.apiJSON = apiJSON;
window.uploadOrderImages = uploadOrderImages;
