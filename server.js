#!/usr/bin/env node
/* ============================================================
   BunnyTailor — Sổ ghi chú cho thợ may cosplay.
   Pure Node.js, KHÔNG dependency bên ngoài.
   Chạy:   node server.js            (PORT mặc định 3000, tự thử 3001.. nếu bận)
   Env:    PORT=4000
   Dữ liệu: ./data/db.json   { orders, notes }
            ./data/uploads/  (ảnh khách chèn vào ô ghi chú)
   ============================================================ */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const BASE_PORT = Number(process.env.PORT) || 3000;

const MAX_FILE_SIZE = 8 * 1024 * 1024;        // 8MB / ảnh
const MAX_TOTAL_UPLOAD = 40 * 1024 * 1024;    // 40MB / lần upload
const MAX_IMAGES_PER_NOTE = 12;
const MAX_IMAGES_PER_ORDER = 12;
const ALLOWED_IMAGE_EXT = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif",
};
const STATUSES = ["pending", "sewing", "done"];
const NOTE_COLORS = ["rose", "gold", "sage", "cream", "lilac"];

/* ---------------- persistence ---------------- */
let db = null;
function loadDB() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    } catch (e) {
      console.error("⚠ Không đọc được data/db.json — sao lưu thành db.json.corrupt.", e.message);
      try { fs.renameSync(DB_FILE, DB_FILE + ".corrupt"); } catch (_) {}
      db = null;
    }
  }
  if (!db || typeof db !== "object") db = {};
  if (!Array.isArray(db.orders)) db.orders = [];
  if (!Array.isArray(db.notes)) db.notes = [];
}
function saveFile(file, obj) {
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}
function saveDB() { saveFile(DB_FILE, { orders: db.orders, notes: db.notes }); }

/* ---------------- helpers ---------------- */
const uid = () => crypto.randomBytes(9).toString("hex");
const now = () => new Date().toISOString();
function str(v, max) { return typeof v === "string" ? v.trim().slice(0, max || 1000) : ""; }
function isDateStr(v) {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));
}
function sendJSON(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

/* ---------------- body ---------------- */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_TOTAL_UPLOAD) { reject(new Error("Payload quá lớn")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
async function readJSON(req) {
  const raw = await readBody(req);
  if (!raw || !raw.length) return {};
  try { return JSON.parse(raw.toString("utf8")); }
  catch (e) { throw Object.assign(new Error("JSON không hợp lệ"), { status: 400 }); }
}
// Parser multipart/form-data thuần (không dependency). Trả về mảng các part.
function parseMultipart(buf, boundary) {
  const delim = Buffer.from("--" + boundary);
  const parts = [];
  let start = buf.indexOf(delim);
  if (start < 0) return parts;
  start += delim.length;
  while (true) {
    if (buf[start] === 0x2d && buf[start + 1] === 0x2d) break; // --boundary--
    const nextDelim = buf.indexOf(delim, start);
    if (nextDelim < 0) break;
    let raw = buf.slice(start, nextDelim - 2); // bỏ \r\n cuối
    const headEnd = raw.indexOf("\r\n\r\n");
    if (headEnd < 0) { start = nextDelim + delim.length; continue; }
    const head = raw.slice(0, headEnd).toString("utf8");
    const data = raw.slice(headEnd + 4);
    raw = null;
    const nameMatch = head.match(/name="([^"]+)"/);
    const fileMatch = head.match(/filename="([^"]*)"/);
    const ctMatch = head.match(/Content-Type:\s*([^\r\n]+)/i);
    parts.push({
      field: nameMatch ? nameMatch[1] : "",
      filename: fileMatch ? fileMatch[1] : "",
      contentType: ctMatch ? ctMatch[1].trim() : "",
      data,
    });
    start = nextDelim + delim.length;
  }
  return parts;
}

/* ---------------- static files ---------------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8", ".webp": "image/webp", ".txt": "text/plain; charset=utf-8",
};
function serveStatic(res, pathname) {
  if (pathname === "/") pathname = "/index.html";
  const safe = path.normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(PUBLIC_DIR, safe);
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("Not found"); return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(file).pipe(res);
}
function serveUploads(res, pathname) {
  const rel = decodeURIComponent(pathname.replace(/^\/uploads\//, ""));
  const file = path.join(UPLOAD_DIR, path.basename(rel));
  if (!file.startsWith(UPLOAD_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("Not found"); return;
  }
  const ext = path.extname(file).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "public, max-age=86400" });
  fs.createReadStream(file).pipe(res);
}

/* ---------------- validation ---------------- */
const MEAS_KEYS = [
  "cao", "nang", "vai", "co", "nguc", "eo", "dai_ao", "vong_nach",
  "bap_tay", "co_tay", "dai_tay", "mong", "dui", "bap_chan", "dai_quan"
];
function cleanMeasurements(m) {
  const out = {};
  for (const k of MEAS_KEYS) out[k] = "";
  if (m && typeof m === "object") {
    for (const k of MEAS_KEYS) {
      if (typeof m[k] === "string") out[k] = str(m[k], 20);
    }
  }
  return out;
}
function cleanMaterials(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((it) => ({
      name: str(it && it.name, 80),
      qty: str(it && it.qty, 20),
      unit: str(it && it.unit, 20),
      cost: Math.max(0, Math.floor(Number(it && it.cost) || 0)),
    }))
    .filter((it) => it.name || it.qty || it.cost > 0);
}
function toPrice(v) {
  if (v === undefined || v === null || v === "") return 0;
  const n = Math.floor(Number(String(v).replace(/[^\d]/g, "")) || 0);
  return Math.max(0, Math.min(n, 1_000_000_000));
}
function cleanOrder(o, existing) {
  const title = str(o.title, 120);
  if (!title) throw Object.assign(new Error("Thiếu tên đơn hàng"), { status: 400 });
  const status = STATUSES.includes(o.status) ? o.status : "pending";
  const deadline = o.deadline ? (isDateStr(o.deadline) ? o.deadline : "") : (existing ? existing.deadline : "");
  return {
    id: existing ? existing.id : uid(),
    title, character: str(o.character, 120), series: str(o.series, 120),
    client: str(o.client, 120), deadline, status,
    price: o.price !== undefined && o.price !== null && o.price !== "" ? toPrice(o.price) : 0,
    measurements: cleanMeasurements(o.measurements),
    fabricType: str(o.fabricType, 120),
    fabricMeters: str(o.fabricMeters, 20),
    materials: cleanMaterials(o.materials),
    images: existing ? (Array.isArray(existing.images) ? existing.images : []) : [],
    facebook: str(o.facebook, 500),
    note: str(o.note, 4000),
    createdAt: existing ? existing.createdAt : now(),
    updatedAt: now(),
  };
}
function cleanNote(n, existing) {
  const date = n.date && isDateStr(n.date) ? n.date : (existing ? existing.date : "");
  if (!date) throw Object.assign(new Error("Thiếu ngày (date YYYY-MM-DD)"), { status: 400 });
  const title = str(n.title, 120);
  const color = NOTE_COLORS.includes(n.color) ? n.color : "rose";
  return {
    id: existing ? existing.id : uid(),
    date, title, content: str(n.content, 8000), color,
    images: existing ? (Array.isArray(existing.images) ? existing.images : []) : [],
    createdAt: existing ? existing.createdAt : now(),
    updatedAt: now(),
  };
}

/* ---------------- demo seed ---------------- */
function seedDemo() {
  if (db.orders.length || db.notes.length) return { ok: false, msg: "Đã có dữ liệu, không seed lại." };
  const Y = new Date();
  const m = String(Y.getMonth() + 1).padStart(2, "0");
  const d = (day) => `${Y.getFullYear()}-${m}-${String(day).padStart(2, "0")}`;
  const orders = [
    { title: "Áo khoác Vega — Genshin", character: "Vega", series: "Genshin Impact", client: "Khách Linh", deadline: d(8), status: "sewing", price: 2400000,
      measurements: { cao:"165", nang:"52", vai:"40", co:"36", nguc:"88", eo:"66", dai_ao:"68", vong_nach:"42", bap_tay:"30", co_tay:"15", dai_tay:"58", mong:"92", dui:"52", bap_chan:"34", dai_quan:"100" },
      fabricType: "Nhung đen + viền gold", fabricMeters: "2.5", materials: [{ name:"Viền gold", qty:"0.5", unit:"m", cost:120000 }, { name:"Cúc cổ lọ", qty:"6", unit:"cái", cost:60000 }],
      facebook: "https://www.facebook.com/nguyen.kat.oeoeoe", note: "Đo lại vai ngày 5. Cẩn ống tay." },
    { title: "Set đồng phục Sakura", character: "Sakura", series: "Cardcaptor Sakura", client: "Khách Hà", deadline: d(15), status: "pending", price: 1800000,
      measurements: { cao:"158", nang:"45", vai:"36", co:"32", nguc:"80", eo:"60", dai_ao:"60", vong_nach:"38", bap_tay:"26", co_tay:"14", dai_tay:"54", mong:"86", dui:"48", bap_chan:"30", dai_quan:"96" },
      fabricType: "Batiste trắng", fabricMeters: "3", materials: [{ name:"Khoá kéo", qty:"1", unit:"cái", cost:15000 }, { name:"Ren viền", qty:"2", unit:"m", cost:80000 }],
      facebook: "https://www.facebook.com/lamthhai.13", note: "Chờ vải batiste trắng về kho." },
    { title: "Giáp vai Dante", character: "Dante", series: "Devil May Cry", client: "Khách Minh", deadline: d(22), status: "sewing", price: 3100000,
      measurements: { cao:"178", nang:"70", vai:"46", co:"40", nguc:"98", eo:"82", dai_ao:"74", vong_nach:"46", bap_tay:"34", co_tay:"17", dai_tay:"62", mong:"100", dui:"56", bap_chan:"38", dai_quan:"104" },
      fabricType: "EVA foam 10mm", fabricMeters: "1.2", materials: [{ name:"Sơn metallic red", qty:"2", unit:"lớp", cost:220000 }, { name:"Varnnish mờ", qty:"1", unit:"chai", cost:90000 }, { name:"Dây đeo", qty:"2", unit:"bộ", cost:110000 }],
      facebook: "https://www.facebook.com/keiko.ashimy", note: "Giáp EVA foam, sơn 2 lớp metallic red." },
    { title: "Váy-padding Annie", character: "Annie", series: "League of Legends", client: "Khách Trang", deadline: d(27), status: "done", price: 1500000,
      measurements: { cao:"150", nang:"40", vai:"34", co:"30", nguc:"76", eo:"58", dai_ao:"56", vong_nach:"36", bap_tay:"24", co_tay:"13", dai_tay:"50", mong:"82", dui:"46", bap_chan:"28", dai_quan:"92" },
      fabricType: "Cotton đỏ", fabricMeters: "2", materials: [{ name:"Vải lót", qty:"1.5", unit:"m", cost:75000 }],
      facebook: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", note: "Đã giao 30/10. Khách xác nhận vừa size." },
  ].map((o) => cleanOrder(o));
  const notes = [
    { date: d(8), title: "Vật liệu Vega", content: "Nhung đen 2m, viền gold 0.5m, cúc áo cổ lọ 6 chiếc.", color: "rose" },
    { date: d(8), title: "Tham khảo tham khảo", content: "Tham chiếu cổ áo + ống tay từ artbook trang 42.", color: "gold" },
    { date: d(15), title: "Ghi chú đo size Hà", content: "Vai 38, ngực 86, eo 64. Lên form thứ 6.", color: "sage" },
    { date: d(22), title: "Quy trình sơn giáp", content: "Layer 1 primer xám → layer 2 đỏ metallic → varnish mờ.", color: "lilac" },
  ].map((n) => cleanNote(n));
  db.orders = orders;
  db.notes = notes;
  saveDB();
  return { ok: true, orders: orders.length, notes: notes.length };
}

/* ---------------- API router ---------------- */
async function handleAPI(req, res, pathname, urlObj) {
  const method = req.method;

  /* ---- orders ---- */
  if (method === "GET" && pathname === "/api/orders") {
    return sendJSON(res, 200, db.orders.slice().sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999")));
  }
  if (method === "GET" && pathname === "/api/stats") {
    const priceOf = (o) => (typeof o.price === "number" ? o.price : 0);
    const sum = (arr) => arr.reduce((s, o) => s + priceOf(o), 0);
    const byStatus = {
      pending: db.orders.filter((o) => o.status === "pending"),
      sewing: db.orders.filter((o) => o.status === "sewing"),
      done: db.orders.filter((o) => o.status === "done"),
    };
    const byMonth = {};
    for (const o of db.orders) {
      const key = (o.deadline || "").slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      if (!byMonth[key]) byMonth[key] = { month: key, revenue: 0, count: 0 };
      byMonth[key].revenue += priceOf(o);
      byMonth[key].count += 1;
    }
    const total = sum(db.orders);
    const done = sum(byStatus.done);
    return sendJSON(res, 200, {
      count: db.orders.length,
      byStatus: {
        pending: byStatus.pending.length, sewing: byStatus.sewing.length, done: byStatus.done.length,
      },
      revenue: {
        total,
        done,
        pending: sum(byStatus.pending),
        sewing: sum(byStatus.sewing),
        avg: db.orders.length ? Math.round(total / db.orders.length) : 0,
      },
      byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)),
    });
  }
  if (method === "POST" && pathname === "/api/orders") {
    const o = cleanOrder(await readJSON(req));
    db.orders.push(o); saveDB();
    return sendJSON(res, 201, o);
  }
  if (pathname.startsWith("/api/orders/")) {
    const seg = pathname.split("/"); // ['', 'api','orders','<id>','<sub?>','<imgId?>']
    const id = seg[3], sub = seg[4], imgId = seg[5];
    const idx = db.orders.findIndex((o) => o.id === id);
    if (method === "PUT" && !sub) {
      if (idx < 0) return sendJSON(res, 404, { error: "Không thấy đơn hàng" });
      const o = cleanOrder(await readJSON(req), db.orders[idx]);
      db.orders[idx] = o; saveDB();
      return sendJSON(res, 200, o);
    }
    if (method === "DELETE" && !sub) {
      if (idx < 0) return sendJSON(res, 404, { error: "Không thấy đơn hàng" });
      const removed = db.orders.splice(idx, 1)[0];
      for (const im of (removed.images || [])) {
        try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(im.url))); } catch (_) {}
      }
      saveDB();
      return sendJSON(res, 200, { ok: true, id: removed.id });
    }
    /* images (ảnh tham chiếu costume) */
    if (idx < 0) return sendJSON(res, 404, { error: "Không thấy đơn hàng" });
    const order = db.orders[idx];
    if (sub === "images" && method === "POST") {
      const ct = req.headers["content-type"] || "";
      const bMatch = ct.match(/boundary=(.+)$/i);
      if (!ct.startsWith("multipart/form-data") || !bMatch) {
        return sendJSON(res, 400, { error: "Yêu cầu multipart/form-data" });
      }
      const buf = await readBody(req);
      const parts = parseMultipart(buf, bMatch[1]);
      const added = [];
      for (const p of parts) {
        if (!p.filename) continue;
        const ext = path.extname(p.filename).toLowerCase();
        if (!ALLOWED_IMAGE_EXT[ext]) continue;
        if (p.data.length > MAX_FILE_SIZE) return sendJSON(res, 400, { error: `Ảnh quá lớn (tối đa ${MAX_FILE_SIZE / 1048576}MB)` });
        if (order.images.length + added.length >= MAX_IMAGES_PER_ORDER) {
          return sendJSON(res, 400, { error: `Tối đa ${MAX_IMAGES_PER_ORDER} ảnh / đơn` });
        }
        const fname = `order_${order.id}_${uid()}${ext}`;
        fs.writeFileSync(path.join(UPLOAD_DIR, fname), p.data);
        added.push({ id: uid(), url: "/uploads/" + fname, name: p.filename, createdAt: now() });
      }
      order.images.push(...added);
      order.updatedAt = now(); saveDB();
      return sendJSON(res, 201, { added, order });
    }
    if (sub === "images" && imgId && method === "DELETE") {
      const i = order.images.findIndex((im) => im.id === imgId);
      if (i < 0) return sendJSON(res, 404, { error: "Không thấy ảnh" });
      const removed = order.images.splice(i, 1)[0];
      try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(removed.url))); } catch (_) {}
      order.updatedAt = now(); saveDB();
      return sendJSON(res, 200, { ok: true, id: removed.id });
    }
  }

  /* ---- notes ---- */
  if (method === "GET" && pathname === "/api/notes") {
    const date = urlObj.searchParams.get("date");
    let list = db.notes;
    if (date && isDateStr(date)) list = db.notes.filter((n) => n.date === date);
    return sendJSON(res, 200, list.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }
  if (method === "POST" && pathname === "/api/notes") {
    const n = cleanNote(await readJSON(req));
    db.notes.push(n); saveDB();
    return sendJSON(res, 201, n);
  }
  if (pathname.startsWith("/api/notes/")) {
    const seg = pathname.split("/");
    if (seg.length >= 4) {
      const id = seg[3], sub = seg[4], imgId = seg[5];
      const idx = db.notes.findIndex((n) => n.id === id);
      if (idx < 0) return sendJSON(res, 404, { error: "Không thấy ô ghi chú" });
      const note = db.notes[idx];
      if (method === "PUT" && !sub) {
        const upd = cleanNote(await readJSON(req), note);
        db.notes[idx] = upd; saveDB();
        return sendJSON(res, 200, upd);
      }
      if (method === "DELETE" && !sub) {
        const removed = db.notes.splice(idx, 1)[0];
        for (const im of removed.images) {
          try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(im.url))); } catch (_) {}
        }
        saveDB();
        return sendJSON(res, 200, { ok: true, id: removed.id });
      }
      /* images */
      if (sub === "images" && method === "POST") {
        const ct = req.headers["content-type"] || "";
        const bMatch = ct.match(/boundary=(.+)$/i);
        if (!ct.startsWith("multipart/form-data") || !bMatch) {
          return sendJSON(res, 400, { error: "Yêu cầu multipart/form-data" });
        }
        const buf = await readBody(req);
        const parts = parseMultipart(buf, bMatch[1]);
        const added = [];
        for (const p of parts) {
          if (!p.filename) continue;
          const ext = path.extname(p.filename).toLowerCase();
          if (!ALLOWED_IMAGE_EXT[ext]) continue;
          if (p.data.length > MAX_FILE_SIZE) return sendJSON(res, 400, { error: `Ảnh quá lớn (tối đa ${MAX_FILE_SIZE / 1048576}MB)` });
          if (note.images.length + added.length >= MAX_IMAGES_PER_NOTE) {
            return sendJSON(res, 400, { error: `Tối đa ${MAX_IMAGES_PER_NOTE} ảnh / ô` });
          }
          const fname = `note_${note.id}_${uid()}${ext}`;
          fs.writeFileSync(path.join(UPLOAD_DIR, fname), p.data);
          added.push({ id: uid(), url: "/uploads/" + fname, name: p.filename, createdAt: now() });
        }
        note.images.push(...added);
        note.updatedAt = now(); saveDB();
        return sendJSON(res, 201, { added, note });
      }
      if (sub === "images" && imgId && method === "DELETE") {
        const i = note.images.findIndex((im) => im.id === imgId);
        if (i < 0) return sendJSON(res, 404, { error: "Không thấy ảnh" });
        const removed = note.images.splice(i, 1)[0];
        try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(removed.url))); } catch (_) {}
        note.updatedAt = now(); saveDB();
        return sendJSON(res, 200, { ok: true, id: removed.id });
      }
    }
  }

  /* ---- demo seed ---- */
  if (method === "POST" && pathname === "/api/seed") return sendJSON(res, 200, seedDemo());

  /* ---- xoá toàn bộ dữ liệu ---- */
  if (method === "POST" && pathname === "/api/reset") {
    let deletedFiles = 0;
    try {
      for (const f of fs.readdirSync(UPLOAD_DIR)) {
        try { fs.unlinkSync(path.join(UPLOAD_DIR, f)); deletedFiles++; } catch (_) {}
      }
    } catch (_) {}
    db.orders = []; db.notes = []; saveDB();
    return sendJSON(res, 200, { ok: true, orders: 0, notes: 0, deletedFiles });
  }

  return sendJSON(res, 404, { error: "Không tìm thấy endpoint" });
}

/* ---------------- server ---------------- */
const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, "http://" + (req.headers.host || "localhost"));
    const pathname = urlObj.pathname;
    if (pathname.startsWith("/api/")) return await handleAPI(req, res, pathname, urlObj);
    if (pathname.startsWith("/uploads/")) return serveUploads(res, pathname);
    return serveStatic(res, pathname);
  } catch (e) {
    const status = e.status || 500;
    if (!res.headersSent) sendJSON(res, status, { error: e.message || "Lỗi server" });
    else if (!res.writableEnded) res.end();
  }
});

loadDB();
(function listen(p) {
  server.on("error", (err) => {
    if (err.code === "EADDRINUSE" && p < BASE_PORT + 10) listen(p + 1);
    else throw err;
  });
  server.listen(p, () => {
    console.log(`\n  🐰  BunnyTailor — Sổ ghi chú may cosplay`);
    console.log(`      →  http://localhost:${p}`);
    console.log(`      Dữ liệu: ${DATA_DIR}`);
    console.log(`      Ctrl+C để dừng.\n`);
  });
})(BASE_PORT);
