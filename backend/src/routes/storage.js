import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { nanoid } from "nanoid";
import { db } from "../db.js";
import { logSettledPayment } from "../middleware/x402Payment.js";

const router = Router();

const uploadsDir = path.resolve("uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const id = nanoid(16);
    const ext = path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// PAID — protected by x402PaymentMiddleware in index.js ("POST /api/storage/upload")
router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no_file" });

  logSettledPayment(req, "storage.upload");

  const id = nanoid(12);
  db.prepare(
    `INSERT INTO files (id, original_name, stored_path, mime_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.file.originalname,
    req.file.filename,
    req.file.mimetype,
    req.file.size,
    req.body.agentId ?? null
  );

  res.status(201).json({
    fileId: id,
    downloadUrl: `/api/storage/${id}`,
  });
});

// PAID — protected by x402PaymentMiddleware in index.js ("GET /api/storage/:id")
router.get("/:id", (req, res) => {
  const record = db.prepare(`SELECT * FROM files WHERE id = ?`).get(req.params.id);
  if (!record) return res.status(404).json({ error: "not_found" });

  logSettledPayment(req, "storage.download");

  const filePath = path.join(uploadsDir, record.stored_path);
  res.setHeader("Content-Type", record.mime_type || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${record.original_name}"`);
  res.sendFile(filePath);
});

export default router;
