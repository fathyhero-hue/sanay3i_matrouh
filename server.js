const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));

const dbPath = path.join(__dirname, "sanaiey.db");
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) console.error("Database connection error:", err.message);
  else console.log("Connected to SQLite database");
});

function addColumnIfNotExists(tableName, columnName, columnDefinition) {
  db.all(`PRAGMA table_info(${tableName})`, [], (err, columns) => {
    if (err) return;
    const exists = columns.some((col) => col.name === columnName);
    if (!exists) db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  });
}

function getTodayDate() {
  return new Date().toISOString().split("T")[0];
}

function addMonthsToDate(startDate, months) {
  const d = startDate ? new Date(startDate) : new Date();
  if (isNaN(d.getTime())) d.setTime(Date.now());
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

function normalizeBooleanValue(value) {
  return value === true || value === "true" || value === "1" || value === 1 ? 1 : 0;
}

function workerImagePath(file) {
  if (!file) return "";
  return "uploads/" + file.filename;
}

function getMainImageFromRequest(req) {
  if (req.file) return workerImagePath(req.file);
  if (req.files && req.files.image && req.files.image[0]) return workerImagePath(req.files.image[0]);
  return "";
}

function getWorkPhotosFromRequest(req) {
  if (!req.files || !req.files.workPhotos) return [];
  return req.files.workPhotos.map((file) => workerImagePath(file));
}

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS workers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      whatsapp TEXT,
      trade TEXT NOT NULL,
      area TEXT NOT NULL,
      description TEXT,
      image TEXT,
      approved INTEGER DEFAULT 0,
      active INTEGER DEFAULT 1,
      featured INTEGER DEFAULT 0,
      subscription_start TEXT,
      subscription_end TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS worker_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      image TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worker_id INTEGER NOT NULL,
      customer_name TEXT,
      rating INTEGER NOT NULL,
      comment TEXT,
      approved INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (worker_id) REFERENCES workers(id) ON DELETE CASCADE
    )
  `);

  setTimeout(() => {
    addColumnIfNotExists("workers", "whatsapp", "TEXT");
    addColumnIfNotExists("workers", "description", "TEXT");
    addColumnIfNotExists("workers", "image", "TEXT");
    addColumnIfNotExists("workers", "approved", "INTEGER DEFAULT 0");
    addColumnIfNotExists("workers", "active", "INTEGER DEFAULT 1");
    addColumnIfNotExists("workers", "featured", "INTEGER DEFAULT 0");
    addColumnIfNotExists("workers", "subscription_start", "TEXT");
    addColumnIfNotExists("workers", "subscription_end", "TEXT");
    addColumnIfNotExists("workers", "created_at", "TEXT DEFAULT CURRENT_TIMESTAMP");
  }, 500);

  ["سباك","كهربائي","نجار","نقاش","فني تكييف","حداد","ألوميتال","سيراميك","محار","عامل بناء"].forEach((trade) => {
    db.run("INSERT OR IGNORE INTO trades (name) VALUES (?)", [trade]);
  });

  ["وسط البلد","علم الروم","الكيلو 4","الكيلو 7","الريفية","العزبة الغربية","شارع إسكندرية","النجيلة","أخرى"].forEach((area) => {
    db.run("INSERT OR IGNORE INTO areas (name) VALUES (?)", [area]);
  });
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images are allowed"));
  }
});

const workerUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "workPhotos", maxCount: 5 }
]);

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/register", (req, res) => res.sendFile(path.join(__dirname, "register.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "admin.html")));
app.get("/worker/:id", (req, res) => res.sendFile(path.join(__dirname, "worker.html")));

app.get("/api/workers", (req, res) => {
  db.all(
    `
    SELECT * FROM workers
    WHERE approved = 1
    AND active = 1
    AND (
      subscription_end IS NULL
      OR subscription_end = ''
      OR date(subscription_end) >= date('now')
    )
    ORDER BY featured DESC, id DESC
    `,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: "حدث خطأ أثناء جلب الصنايعية" });
      res.json(rows);
    }
  );
});

app.get("/api/admin/workers", (req, res) => {
  db.all("SELECT * FROM workers ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: "حدث خطأ أثناء جلب كل الصنايعية" });
    res.json(rows);
  });
});

app.get("/api/workers/all", (req, res) => {
  db.all("SELECT * FROM workers ORDER BY id DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json(rows);
  });
});

app.get("/api/workers/:id", (req, res) => {
  db.get("SELECT * FROM workers WHERE id = ?", [req.params.id], (err, worker) => {
    if (err) return res.status(500).json({ success: false, error: "حدث خطأ أثناء جلب بيانات الصنايعي" });
    if (!worker) return res.status(404).json({ success: false, error: "الصنايعي غير موجود" });
    res.json(worker);
  });
});

app.get("/api/sanaieya", (req, res) => {
  db.all(
    `
    SELECT * FROM workers
    WHERE approved = 1
    AND active = 1
    AND (
      subscription_end IS NULL
      OR subscription_end = ''
      OR date(subscription_end) >= date('now')
    )
    ORDER BY featured DESC, id DESC
    `,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json(rows);
    }
  );
});

app.get("/sanaieya", (req, res) => {
  db.all(
    `
    SELECT * FROM workers
    WHERE approved = 1
    AND active = 1
    AND (
      subscription_end IS NULL
      OR subscription_end = ''
      OR date(subscription_end) >= date('now')
    )
    ORDER BY featured DESC, id DESC
    `,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ success: false, error: err.message });
      res.json(rows);
    }
  );
});

function insertWorker(req, res) {
  const { name, phone, whatsapp, trade, area, description } = req.body;
  if (!name || !phone || !trade || !area) {
    return res.status(400).json({ success: false, error: "الاسم ورقم الهاتف والحرفة والمنطقة مطلوبين" });
  }

  const image = getMainImageFromRequest(req);
  const workPhotos = getWorkPhotosFromRequest(req);
  const subscriptionStart = getTodayDate();
  const subscriptionEnd = addMonthsToDate(subscriptionStart, 1);

  db.run(
    `
    INSERT INTO workers
    (name, phone, whatsapp, trade, area, description, image, approved, active, featured, subscription_start, subscription_end)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1, 0, ?, ?)
    `,
    [name.trim(), phone.trim(), trade.trim(), area.trim(), description ? description.trim() : "", image, subscriptionStart, subscriptionEnd],
    function (err) {
      if (err) return res.status(500).json({ success: false, error: "حدث خطأ أثناء تسجيل الصنايعي" });

      const workerId = this.lastID;
      if (!workPhotos.length) {
        return res.json({ success: true, message: "تم إرسال طلب التسجيل بنجاح", id: workerId });
      }

      const stmt = db.prepare("INSERT INTO worker_photos (worker_id, image) VALUES (?, ?)");
      workPhotos.forEach((photo) => stmt.run(workerId, photo));
      stmt.finalize((photoErr) => {
        if (photoErr) {
          return res.status(500).json({
            success: false,
            error: "تم تسجيل الصنايعي لكن حدث خطأ أثناء حفظ صور الأعمال"
          });
        }
        res.json({ success: true, message: "تم إرسال طلب التسجيل بنجاح", id: workerId });
      });
    }
  );
}

app.post("/api/register", workerUpload, insertWorker);
app.post("/api/sanaieya", workerUpload, insertWorker);
app.post("/api/workers", workerUpload, insertWorker);

function updateWorker(req, res) {
  const id = req.params.id;
  const { name, phone, trade, area, description, approved, active, featured } = req.body;

  db.get("SELECT * FROM workers WHERE id = ?", [id], (err, worker) => {
    if (err || !worker) return res.status(404).json({ success: false, error: "الصنايعي غير موجود" });

    db.run(
      `
      UPDATE workers
      SET name = ?, phone = ?, whatsapp = ?, trade = ?, area = ?, description = ?, approved = ?, active = ?, featured = ?
      WHERE id = ?
      `,
      [
        name !== undefined ? name : worker.name,
        phone !== undefined ? phone : worker.phone,
        whatsapp !== undefined ? whatsapp : worker.whatsapp,
        trade !== undefined ? trade : worker.trade,
        area !== undefined ? area : worker.area,
        description !== undefined ? description : worker.description,
        approved !== undefined ? normalizeBooleanValue(approved) : worker.approved,
        active !== undefined ? normalizeBooleanValue(active) : worker.active,
        featured !== undefined ? normalizeBooleanValue(featured) : worker.featured,
        id
      ],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ success: false, error: "حدث خطأ أثناء تعديل الصنايعي" });
        res.json({ success: true });
      }
    );
  });
}

app.put("/api/workers/:id", updateWorker);
app.put("/api/sanaieya/:id", updateWorker);

app.put("/api/workers/:id/approve", (req, res) => {
  db.run("UPDATE workers SET approved = ? WHERE id = ?", [normalizeBooleanValue(req.body.approved), req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});
app.put("/api/sanaieya/:id/approve", (req, res) => {
  db.run("UPDATE workers SET approved = ? WHERE id = ?", [normalizeBooleanValue(req.body.approved), req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

app.put("/api/workers/:id/active", (req, res) => {
  db.run("UPDATE workers SET active = ? WHERE id = ?", [normalizeBooleanValue(req.body.active), req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});
app.put("/api/sanaieya/:id/active", (req, res) => {
  db.run("UPDATE workers SET active = ? WHERE id = ?", [normalizeBooleanValue(req.body.active), req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

app.put("/api/workers/:id/featured", (req, res) => {
  db.run("UPDATE workers SET featured = ? WHERE id = ?", [normalizeBooleanValue(req.body.featured), req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});
app.put("/api/sanaieya/:id/featured", (req, res) => {
  db.run("UPDATE workers SET featured = ? WHERE id = ?", [normalizeBooleanValue(req.body.featured), req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true });
  });
});

function renewWorker(req, res) {
  const id = req.params.id;
  const months = Number(req.body.months) || 1;

  db.get("SELECT * FROM workers WHERE id = ?", [id], (err, worker) => {
    if (err || !worker) return res.status(404).json({ success: false, error: "الصنايعي غير موجود" });

    const today = getTodayDate();
    let startDate = today;

    if (worker.subscription_end) {
      const endDate = new Date(worker.subscription_end);
      const todayDate = new Date(today);
      if (!isNaN(endDate.getTime()) && endDate > todayDate) startDate = worker.subscription_end;
    }

    const newEndDate = addMonthsToDate(startDate, months);

    db.run(
      "UPDATE workers SET subscription_start = ?, subscription_end = ?, active = 1 WHERE id = ?",
      [today, newEndDate, id],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ success: false, error: updateErr.message });
        res.json({ success: true, subscription_start: today, subscription_end: newEndDate });
      }
    );
  });
}

app.put("/api/workers/:id/renew", renewWorker);
app.put("/api/sanaieya/:id/renew", renewWorker);
app.put("/api/workers/:id/subscription", renewWorker);
app.put("/api/sanaieya/:id/subscription", renewWorker);

app.get("/api/workers/:id/photos", (req, res) => {
  db.all("SELECT * FROM worker_photos WHERE worker_id = ? ORDER BY id DESC", [req.params.id], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: "حدث خطأ أثناء جلب صور الأعمال" });
    res.json(rows);
  });
});

app.post("/api/workers/:id/photos", upload.array("workPhotos", 5), (req, res) => {
  const workerId = req.params.id;
  if (!req.files || !req.files.length) return res.status(400).json({ success: false, error: "لم يتم رفع أي صور" });

  const photos = req.files.map((file) => workerImagePath(file));
  const stmt = db.prepare("INSERT INTO worker_photos (worker_id, image) VALUES (?, ?)");
  photos.forEach((photo) => stmt.run(workerId, photo));

  stmt.finalize((err) => {
    if (err) return res.status(500).json({ success: false, error: "حدث خطأ أثناء حفظ الصور" });
    res.json({ success: true, count: photos.length });
  });
});

app.delete("/api/workers/photos/:photoId", (req, res) => {
  const photoId = req.params.photoId;

  db.get("SELECT * FROM worker_photos WHERE id = ?", [photoId], (err, photo) => {
    if (err || !photo) return res.status(404).json({ success: false, error: "الصورة غير موجودة" });

    const imagePath = path.join(__dirname, photo.image);
    if (fs.existsSync(imagePath)) {
      try { fs.unlinkSync(imagePath); } catch (e) {}
    }

    db.run("DELETE FROM worker_photos WHERE id = ?", [photoId], (deleteErr) => {
      if (deleteErr) return res.status(500).json({ success: false, error: "حدث خطأ أثناء حذف الصورة" });
      res.json({ success: true });
    });
  });
});

function deleteWorker(req, res) {
  const id = req.params.id;

  db.get("SELECT image FROM workers WHERE id = ?", [id], (err, worker) => {
    if (worker && worker.image) {
      const imagePath = path.join(__dirname, worker.image);
      if (fs.existsSync(imagePath)) {
        try { fs.unlinkSync(imagePath); } catch (e) {}
      }
    }

    db.all("SELECT image FROM worker_photos WHERE worker_id = ?", [id], (photoErr, photos) => {
      if (!photoErr && photos && photos.length) {
        photos.forEach((photo) => {
          const photoPath = path.join(__dirname, photo.image);
          if (fs.existsSync(photoPath)) {
            try { fs.unlinkSync(photoPath); } catch (e) {}
          }
        });
      }

      db.run("DELETE FROM worker_photos WHERE worker_id = ?", [id], () => {
        db.run("DELETE FROM reviews WHERE worker_id = ?", [id], () => {
          db.run("DELETE FROM workers WHERE id = ?", [id], (deleteErr) => {
          if (deleteErr) return res.status(500).json({ success: false, error: deleteErr.message });
          res.json({ success: true });
          });
        });
      });
    });
  });
}

app.delete("/api/workers/:id", deleteWorker);
app.delete("/api/sanaieya/:id", deleteWorker);

app.get("/api/trades", (req, res) => {
  db.all("SELECT * FROM trades ORDER BY id DESC", [], (err, rows) => err ? res.status(500).json({ success: false }) : res.json(rows));
});
app.get("/api/crafts", (req, res) => {
  db.all("SELECT * FROM trades ORDER BY id DESC", [], (err, rows) => err ? res.status(500).json({ success: false }) : res.json(rows));
});
app.get("/trades", (req, res) => {
  db.all("SELECT * FROM trades ORDER BY id DESC", [], (err, rows) => err ? res.status(500).json({ success: false }) : res.json(rows));
});
app.get("/crafts", (req, res) => {
  db.all("SELECT * FROM trades ORDER BY id DESC", [], (err, rows) => err ? res.status(500).json({ success: false }) : res.json(rows));
});

function addTrade(req, res) {
  const name = req.body.name || req.body.trade || req.body.craft;
  if (!name || !name.trim()) return res.status(400).json({ success: false, error: "اسم الحرفة مطلوب" });

  db.run("INSERT INTO trades (name) VALUES (?)", [name.trim()], function (err) {
    if (err) return res.status(500).json({ success: false, error: "الحرفة موجودة بالفعل أو حدث خطأ أثناء الإضافة" });
    res.json({ success: true, id: this.lastID, name: name.trim() });
  });
}

app.post("/api/trades", addTrade);
app.post("/api/crafts", addTrade);
app.post("/trades", addTrade);
app.post("/crafts", addTrade);

function deleteTrade(req, res) {
  db.run("DELETE FROM trades WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, error: "حدث خطأ أثناء حذف الحرفة" });
    res.json({ success: true });
  });
}

app.delete("/api/trades/:id", deleteTrade);
app.delete("/api/crafts/:id", deleteTrade);
app.delete("/trades/:id", deleteTrade);
app.delete("/crafts/:id", deleteTrade);

app.get("/api/areas", (req, res) => {
  db.all("SELECT * FROM areas ORDER BY id DESC", [], (err, rows) => err ? res.status(500).json({ success: false }) : res.json(rows));
});
app.get("/api/locations", (req, res) => {
  db.all("SELECT * FROM areas ORDER BY id DESC", [], (err, rows) => err ? res.status(500).json({ success: false }) : res.json(rows));
});
app.get("/areas", (req, res) => {
  db.all("SELECT * FROM areas ORDER BY id DESC", [], (err, rows) => err ? res.status(500).json({ success: false }) : res.json(rows));
});
app.get("/locations", (req, res) => {
  db.all("SELECT * FROM areas ORDER BY id DESC", [], (err, rows) => err ? res.status(500).json({ success: false }) : res.json(rows));
});

function addArea(req, res) {
  const name = req.body.name || req.body.area || req.body.location;
  if (!name || !name.trim()) return res.status(400).json({ success: false, error: "اسم المنطقة مطلوب" });

  db.run("INSERT INTO areas (name) VALUES (?)", [name.trim()], function (err) {
    if (err) return res.status(500).json({ success: false, error: "المنطقة موجودة بالفعل أو حدث خطأ أثناء الإضافة" });
    res.json({ success: true, id: this.lastID, name: name.trim() });
  });
}

app.post("/api/areas", addArea);
app.post("/api/locations", addArea);
app.post("/areas", addArea);
app.post("/locations", addArea);

function deleteArea(req, res) {
  db.run("DELETE FROM areas WHERE id = ?", [req.params.id], (err) => {
    if (err) return res.status(500).json({ success: false, error: "حدث خطأ أثناء حذف المنطقة" });
    res.json({ success: true });
  });
}

app.delete("/api/areas/:id", deleteArea);
app.delete("/api/locations/:id", deleteArea);
app.delete("/areas/:id", deleteArea);
app.delete("/locations/:id", deleteArea);

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return res.status(404).json({ success: false, error: "API route not found" });
  next();
});


// ===============================
// Database Backup API
// ===============================

app.get("/api/backup-db", (req, res) => {
  const dbFile = path.join(__dirname, "sanaiey.db");

  if (!fs.existsSync(dbFile)) {
    return res.status(404).json({
      success: false,
      error: "ملف قاعدة البيانات غير موجود"
    });
  }

  const backupsDir = path.join(__dirname, "backups");

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir);
  }

  const now = new Date();
  const safeDate = now
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\./g, "-");

  const backupName = `sanaiey-backup-${safeDate}.db`;
  const backupPath = path.join(backupsDir, backupName);

  try {
    fs.copyFileSync(dbFile, backupPath);

    res.download(backupPath, backupName, (err) => {
      if (err) {
        console.log("Backup download error:", err.message);
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "حدث خطأ أثناء إنشاء النسخة الاحتياطية"
    });
  }
});



// ===============================
// Workers Excel/CSV Export API
// ===============================

function csvEscape(value) {
  if (value === null || value === undefined) return "";

  const text = String(value).replace(/"/g, '""');

  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text}"`;
  }

  return text;
}

app.get("/api/export-workers", (req, res) => {
  const query = `
    SELECT
      workers.id,
      workers.name,
      workers.phone,
      workers.whatsapp,
      workers.trade,
      workers.area,
      workers.description,
      workers.approved,
      workers.active,
      workers.featured,
      workers.subscription_start,
      workers.subscription_end,
      workers.created_at,
      COUNT(reviews.id) AS approved_reviews_count,
      ROUND(AVG(reviews.rating), 1) AS average_rating
    FROM workers
    LEFT JOIN reviews
      ON reviews.worker_id = workers.id
      AND reviews.approved = 1
    GROUP BY workers.id
    ORDER BY workers.id DESC
  `;

  db.all(query, [], (err, rows) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: "حدث خطأ أثناء تصدير التقرير"
      });
    }

    const headers = [
      "ID",
      "الاسم",
      "رقم الهاتف",
      "رقم الواتساب",
      "الحرفة",
      "المنطقة",
      "الوصف",
      "حالة الموافقة",
      "حالة التفعيل",
      "مميز",
      "بداية الاشتراك",
      "نهاية الاشتراك",
      "تاريخ التسجيل",
      "عدد التقييمات المعتمدة",
      "متوسط التقييم"
    ];

    const lines = [];
    lines.push(headers.map(csvEscape).join(","));

    rows.forEach((row) => {
      const approvedText = row.approved == 1 ? "موافق عليه" : "بانتظار الموافقة";
      const activeText = row.active == 1 ? "نشط" : "متوقف";
      const featuredText = row.featured == 1 ? "مميز" : "عادي";

      const values = [
        row.id,
        row.name,
        row.phone,
        row.whatsapp,
        row.trade,
        row.area,
        row.description,
        approvedText,
        activeText,
        featuredText,
        row.subscription_start,
        row.subscription_end,
        row.created_at,
        row.approved_reviews_count || 0,
        row.average_rating || 0
      ];

      lines.push(values.map(csvEscape).join(","));
    });

    const csvContent = "\uFEFF" + lines.join("\n");

    const now = new Date();
    const safeDate = now
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\./g, "-");

    const fileName = `sanay3i-workers-report-${safeDate}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send(csvContent);
  });
});


app.listen(PORT, () => {
  console.log("----------------------------------");
  console.log("Sanay3i Matrouh server is running");
  console.log(`http://localhost:${PORT}`);
  console.log("----------------------------------");
});
