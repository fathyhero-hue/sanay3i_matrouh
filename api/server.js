const express = require("express");
const path = require("path");
const multer = require("multer");
const fs = require("fs");
const crypto = require("crypto");
try { require("dotenv").config(); } catch(e) {}

const app = express();

// ===============================
// 1. الإعدادات الأساسية والحماية
// ===============================
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.disable("x-powered-by");

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  if (req.path.startsWith("/admin") || req.path.startsWith("/api/admin")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  }
  next();
});

// ===============================
// 2. تفعيل حراس الأمان (Rate Limiters)
// ===============================
const { adminApiRateLimit, analyticsRateLimit, adminLoginRateLimit, workerLoginRateLimit } = require("./middlewares/rateLimit");

app.use("/api/admin", (req, res, next) => {
  if (req.path === "/login") return adminLoginRateLimit(req, res, next);
  return adminApiRateLimit(req, res, next);
});

// ===============================
// دوال تشفير كلمات المرور الخاصة بالصنايعية
// ===============================
const ADMIN_PASSWORD_ITERATIONS = 120000;
function hashAdminPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, ADMIN_PASSWORD_ITERATIONS, 64, "sha256").toString("hex");
  return { salt, hash };
}

function verifyWorkerPassword(row, password) {
  if (!row || !row.password_salt || !row.password_hash) return false;
  const { hash } = hashAdminPassword(password, row.password_salt);
  const a = Buffer.from(hash);
  const b = Buffer.from(String(row.password_hash || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ===============================
// 3. إعدادات رفع الملفات (Multer) لبيئة Vercel
// ===============================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const { supabase } = require("./config/supabase");
const { requirePermission, createWorkerToken, requireWorkerOwnership } = require("./middlewares/auth");
const { isValidEmail, generateSecureToken, hashToken } = require("./utils/helpers");
const { logAdminActivity } = require("./utils/activityLogger");
const mailer = require("./utils/mailer");

async function uploadToSupabase(file, targetBucket = "uploads") {
  if (!file) return null;
  const ext = path.extname(file.originalname || ".jpg");
  const fileName = Date.now() + "-" + Math.round(Math.random() * 1E9) + ext;
  
  const { data, error } = await supabase.storage
    .from(targetBucket)
    .upload(fileName, file.buffer, {
      contentType: file.mimetype,
      upsert: false
    });
    
  if (error) {
    console.error("Supabase Upload Error:", error);
    throw error;
  }
  return fileName;
}

// دمج تعديل ذاتي مقترح من الصنايعي جوه pending_changes (بدل تطبيقه مباشرة) - يفضل معلّق لحد ما الإدارة تعتمده
async function mergePendingChanges(workerId, patch, summaryText) {
  const { data: current } = await supabase
    .from('workers')
    .select('pending_changes')
    .eq('id', workerId)
    .maybeSingle();

  const merged = Object.assign({}, current?.pending_changes || {}, patch);

  const { error } = await supabase
    .from('workers')
    .update({
      pending_changes: merged,
      has_pending_changes: true,
      pending_changes_summary: summaryText,
      pending_changes_at: new Date().toISOString()
    })
    .eq('id', workerId);

  if (error) throw error;
  return merged;
}

// ===============================
// دالة معالجة اعتماد ومراجعة البطاقة الشخصية
// ===============================
async function handleIdentityReview(req, res) {
    try {
        const body = req.body || {};
        const ALLOWED_STATUSES = ["pending", "verified", "rejected", "needs_data", "needs_id_reupload"];

        let status = String(body.identity_status || "").trim();
        // توافق رجعي لو حد لسه بيبعت النداء القديم بـ approved boolean بس
        if (!status && body.approved !== undefined) {
          status = body.approved ? "verified" : "rejected";
        }
        if (!ALLOWED_STATUSES.includes(status)) {
          return res.status(400).json({ success: false, error: "حالة تحقق غير صحيحة" });
        }

        const reason = String(body.reason || "").trim();
        const note = String(body.note || "").trim();

        const { data: before, error: beforeErr } = await supabase
          .from('workers')
          .select('*')
          .eq('id', req.params.id)
          .maybeSingle();

        if (beforeErr || !before) {
          return res.status(404).json({ success: false, error: "الصنايعي غير موجود" });
        }

        const isVerified = status === "verified";
        const updateData = {
          identity_status: status,
          identity_verified: isVerified,
          identity_rejection_reason: reason,
          identity_review_note: note
        };

        // نفس نمط setBool في core.js: التوثيق يفرض approved=true، وباقي الحالات ما بتلغيش approved تلقائيًا
        if (isVerified) {
          updateData.approved = true;
          if (before.pending_image) {
            updateData.image = before.pending_image;
            updateData.pending_image = null;
          }
        }

        const { error } = await supabase
            .from('workers')
            .update(updateData)
            .eq('id', req.params.id);

        if (error) {
            console.error('Supabase update error:', error);
            return res.status(400).json({ success: false, error: error.message });
        }

        logAdminActivity(req, "identity_review", {
          entity_type: "worker",
          entity_id: before.id,
          entity_name: before.name,
          details: { identity_status: status, reason, note },
          before_data: { identity_status: before.identity_status, identity_verified: before.identity_verified, approved: before.approved },
          after_data: updateData
        }).catch(err => console.warn("Failed to log identity_review activity:", err.message));

        if (isVerified) {
          await mailer.sendIdentityVerifiedEmail(before).catch(err => console.error('Failed to send verified email:', err.message));
        } else if (["rejected", "needs_data", "needs_id_reupload"].includes(status)) {
          await mailer.sendIdentityActionEmail(before, status, reason, note).catch(err => console.error('Failed to send identity action email:', err.message));
        }

        res.json({ success: true, message: 'تم تحديث حالة مراجعة البطاقة والاعتماد بنجاح' });
    } catch (err) {
        console.error('Identity Review Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
}

// تسجيل مسار الاعتماد والمراجعة (المسار الوحيد اللي بيستخدمه admin.js فعليًا)
app.put('/api/admin/workers/:id/identity-review', adminApiRateLimit, requirePermission("workers:review"), handleIdentityReview);

// اعتماد كل التعديلات الذاتية المعلّقة للصنايعي دفعة واحدة (بيانات / صور أعمال / صورة شخصية)
app.post('/api/admin/workers/:id/approve-pending-changes', adminApiRateLimit, requirePermission("workers:update"), async (req, res) => {
  try {
    const { data: worker, error: fetchErr } = await supabase
      .from('workers')
      .select('pending_changes, name')
      .eq('id', req.params.id)
      .maybeSingle();

    if (fetchErr || !worker) return res.status(404).json({ success: false, error: 'الصنايعي غير موجود' });
    const pending = worker.pending_changes || {};
    if (!Object.keys(pending).length) {
      return res.status(400).json({ success: false, error: 'لا يوجد تعديل معلّق لهذا الصنايعي' });
    }

    const updateData = {
      pending_changes: null,
      has_pending_changes: false,
      pending_changes_summary: null,
      pending_changes_at: null
    };
    if (pending.profile && typeof pending.profile === 'object') Object.assign(updateData, pending.profile);
    if (Array.isArray(pending.work_photos)) updateData.work_photos = pending.work_photos;
    if (pending.image) updateData.image = pending.image;

    const { error } = await supabase.from('workers').update(updateData).eq('id', req.params.id);
    if (error) throw error;

    logAdminActivity(req, "worker_update", {
      entity_type: "worker",
      entity_id: req.params.id,
      entity_name: worker.name,
      details: { approved_pending_changes: pending }
    }).catch(() => {});

    res.json({ success: true, message: 'تم اعتماد التعديلات وتفعيلها' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// رفض التعديلات الذاتية المعلّقة (مع سبب اختياري يوصل للصنايعي عبر شات الإدارة)
app.post('/api/admin/workers/:id/reject-pending-changes', adminApiRateLimit, requirePermission("workers:update"), async (req, res) => {
  try {
    const reason = String((req.body || {}).reason || '').trim();

    const { error } = await supabase
      .from('workers')
      .update({ pending_changes: null, has_pending_changes: false, pending_changes_summary: null, pending_changes_at: null })
      .eq('id', req.params.id);

    if (error) throw error;

    if (reason) {
      try {
        await supabase.from('worker_chat_messages').insert([{
          worker_id: req.params.id,
          sender_type: 'admin',
          message_text: 'تم رفض تعديلك الأخير من الإدارة.\nالسبب: ' + reason,
          attachment_url: null,
          is_read: false,
          created_at: new Date().toISOString()
        }]);
      } catch (chatErr) {
        console.warn('Failed to send rejection chat message:', chatErr.message);
      }
    }

    res.json({ success: true, message: 'تم رفض التعديلات' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// إنشاء رابط تفعيل آمن (توكن استعادة كلمة مرور بصلاحية أطول) - للصنايعية القدامى اللي معندهمش كلمة مرور حقيقية
// بيستخدم نفس آلية "نسيت كلمة المرور" الموجودة، فمفيش داعي لعمود جديد
app.post('/api/admin/workers/:id/generate-activation-link', adminApiRateLimit, requirePermission("workers:update"), async (req, res) => {
  try {
    const { data: worker, error: fetchErr } = await supabase
      .from('workers')
      .select('id')
      .eq('id', req.params.id)
      .maybeSingle();

    if (fetchErr || !worker) return res.status(404).json({ success: false, error: 'الصنايعي غير موجود' });

    const token = generateSecureToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // صلاحية أطول (7 أيام) لأنه رابط حملة، مش طلب فوري

    const { error } = await supabase
      .from('workers')
      .update({ password_reset_token_hash: tokenHash, password_reset_expires_at: expiresAt.toISOString() })
      .eq('id', req.params.id);

    if (error) throw error;

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    res.json({ success: true, url: `${baseUrl}/reset-password?token=${token}` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===============================
// مسار استقبال البلاغات والشكاوى من العملاء (Public Reports API)
// ===============================
app.post("/api/reports", async (req, res) => {
  try {
    const body = req.body || {};
    const workerId = body.worker_id || body.workerId;
    const reportType = String(body.report_type || body.type || "other").trim();
    const reporterName = String(body.reporter_name || body.name || "زائر").trim();
    const reporterPhone = String(body.reporter_phone || body.phone || "").trim();
    const message = String(body.message || body.notes || "").trim();

    if (!workerId) {
      return res.status(400).json({ success: false, error: "معرف الصنايعي مطلوب" });
    }

    // جلب بيانات الصنايعي لعمل Snapshot (حفظ نسختها وقت البلاغ)
    const { data: worker } = await supabase
      .from("workers")
      .select("id, name, trade, area, phone")
      .eq("id", workerId)
      .maybeSingle();

    const newReport = {
      worker_id: workerId,
      report_type: reportType,
      reporter_name: reporterName,
      reporter_phone: reporterPhone,
      message: message,
      status: 'new', // حالة البلاغ جديد
      worker_snapshot: worker || null,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase.from("reports").insert([newReport]);
    if (error) throw error;

    res.json({ success: true, message: "تم إرسال البلاغ بنجاح وشكراً لمساعدتنا في تحسين الدليل." });
  } catch (err) {
    console.error("Submit Report Error:", err);
    res.status(500).json({ success: false, error: err.message || "تعذر إرسال البلاغ حالياً" });
  }
});

// ===============================
// 4. مسار فحص تكرار الأرقام عند التسجيل
// ===============================
app.get('/api/workers/check-duplicate', async (req, res) => {
  try {
    const { phone, whatsapp } = req.query;
    let query = supabase.from('workers').select('id, name, phone, whatsapp');
    
    if (phone && whatsapp) {
      query = query.or(`phone.eq.${phone},whatsapp.eq.${whatsapp},phone.eq.${whatsapp},whatsapp.eq.${phone}`);
    } else if (phone) {
      query = query.or(`phone.eq.${phone},whatsapp.eq.${phone}`);
    } else if (whatsapp) {
      query = query.or(`phone.eq.${whatsapp},whatsapp.eq.${whatsapp}`);
    } else {
      return res.json({ success: true, duplicate: false });
    }

    const { data, error } = await query.limit(1);
    if (error) throw error;

    if (data && data.length > 0) {
      return res.json({ success: true, duplicate: true, worker: data[0] });
    }
    res.json({ success: true, duplicate: false });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===============================
// 5. مسار استقبال تسجيلات الصنايعية الجدد
// ===============================
app.post('/api/register', upload.fields([
  { name: 'idFront', maxCount: 1 },
  { name: 'idBack', maxCount: 1 }
]), async (req, res) => {
  try {
    const body = req.body || {};
    const files = req.files || {};

    const name = String(body.name || '').trim();
    const phone = String(body.phone || '').trim();
    const whatsapp = String(body.whatsapp || body.phone || '').trim();
    const trade = String(body.trade || '').trim();
    const area = String(body.area || '').trim();
    const description = String(body.description || '').trim();
    const password = String(body.password || '').trim();
    const email = String(body.email || '').trim().toLowerCase();

    if (!name || !phone || !trade || !area || !password || !email || !files.idFront || !files.idBack) {
      return res.status(400).json({ success: false, error: 'يرجى إكمال الحقول الأساسية، البريد الإلكتروني، كلمة المرور، وصور البطاقة' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'صيغة البريد الإلكتروني غير صحيحة' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'كلمة المرور يجب ألا تقل عن 6 أحرف' });
    }

    const { data: existingWorkers, error: checkErr } = await supabase
      .from('workers')
      .select('id, phone, whatsapp')
      .or(`phone.eq.${phone},whatsapp.eq.${whatsapp},phone.eq.${whatsapp},whatsapp.eq.${phone}`);

    if (checkErr) console.error("Check duplicate error:", checkErr);

    if (existingWorkers && existingWorkers.length > 0) {
      return res.status(400).json({
        success: false,
        error: '⚠️ رقم الهاتف أو الواتساب مسجل بالفعل لصنايعي آخر! لا يمكن إتمام التسجيل برقم مكرر.'
      });
    }

    const { data: existingEmailWorkers, error: emailCheckErr } = await supabase
      .from('workers')
      .select('id')
      .ilike('email', email)
      .limit(1);

    if (emailCheckErr) console.error("Check duplicate email error:", emailCheckErr);

    if (existingEmailWorkers && existingEmailWorkers.length > 0) {
      return res.status(400).json({
        success: false,
        error: '⚠️ هذا البريد الإلكتروني مسجل بالفعل لصنايعي آخر!'
      });
    }

    const idFrontImage = await uploadToSupabase(files.idFront[0], "identity-docs");
    const idBackImage = await uploadToSupabase(files.idBack[0], "identity-docs");
    
    const { salt, hash } = hashAdminPassword(password);

    const now = new Date();
    const oneMonthLater = new Date();
    oneMonthLater.setMonth(now.getMonth() + 1);

    const newWorker = {
      name,
      phone,
      whatsapp,
      trade,
      area,
      description,
      email,
      username: phone,
      password_hash: hash,
      password_salt: salt,
      id_front: idFrontImage,
      id_back: idBackImage,
      id_front_path: idFrontImage,
      id_back_path: idBackImage,
      id_submitted_at: now.toISOString(),
      identity_status: 'pending',
      identity_verified: false,
      approved: false,
      active: true,
      created_at: now.toISOString(),
      subscription_start: now.toISOString(),
      subscription_end: oneMonthLater.toISOString()
    };

    const { data, error } = await supabase.from('workers').insert([newWorker]).select().single();
    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ success: false, error: 'رقم الهاتف أو البريد الإلكتروني مسجل بالفعل. برجاء المحاولة برقم أو بريد مختلف.' });
      }
      throw error;
    }

    const workerId = data.id;
    const registrationCode = 'SN-' + new Date().getFullYear() + '-' + String(workerId).padStart(5, '0');

    await supabase.from('workers').update({ registration_code: registrationCode }).eq('id', workerId);

    await mailer.sendWelcomeEmail({ ...data, email, registration_code: registrationCode })
      .catch(err => console.error('Failed to send welcome email:', err.message));

    return res.json({
      success: true,
      id: workerId,
      registration_code: registrationCode,
      message: 'تم التسجيل بنجاح! يمكنك تسجيل الدخول إلى بروفايلك الآن.'
    });
  } catch (err) {
    console.error('Registration Error:', err);
    return res.status(500).json({ success: false, error: err.message || 'حدث خطأ أثناء التسجيل' });
  }
});

// ===============================
// 5.1. مسارات تسجيل الدخول واستعادة كلمة المرور
// ===============================
app.post('/api/worker/login', workerLoginRateLimit, async (req, res) => {
  try {
    const { phone, email, identifier, password } = req.body || {};
    const rawInput = String(identifier || phone || email || '').trim();
    if (!rawInput || !password) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال رقم التليفون أو البريد الإلكتروني وكلمة المرور' });
    }

    const cleanInput = rawInput;
    const isEmailInput = isValidEmail(cleanInput);

    let worker = null;
    if (isEmailInput) {
      const { data } = await supabase
        .from('workers')
        .select('*')
        .ilike('email', cleanInput)
        .maybeSingle();
      worker = data || null;
    } else {
      let { data, error } = await supabase
        .from('workers')
        .select('*')
        .eq('phone', cleanInput)
        .maybeSingle();

      worker = data || null;

      if (error || !worker) {
        const cleanPhoneDigits = cleanInput.replace(/[^\d]/g, '').slice(-10);
        const { data: workersList } = await supabase.from('workers').select('*');

        worker = (workersList || []).find(w => {
          const wPhone = String(w.phone || '').replace(/[^\d]/g, '').slice(-10);
          const wWhats = String(w.whatsapp || '').replace(/[^\d]/g, '').slice(-10);
          return wPhone === cleanPhoneDigits || wWhats === cleanPhoneDigits || String(w.phone).trim() === cleanInput;
        });
      }
    }

    if (!worker) {
      return res.status(401).json({ success: false, error: isEmailInput ? 'البريد الإلكتروني غير مسجل' : 'رقم التليفون غير مسجل' });
    }

    if (!worker.password_hash && password === String(worker.phone || '').slice(-6)) {
      return res.json({
        success: true,
        worker: { id: worker.id, name: worker.name, phone: worker.phone, trade: worker.trade, area: worker.area },
        token: createWorkerToken(worker.id),
        requirePasswordReset: true
      });
    }

    const isValid = verifyWorkerPassword(worker, password);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'كلمة المرور غير صحيحة' });
    }

    res.json({
      success: true,
      worker: {
        id: worker.id,
        name: worker.name,
        phone: worker.phone,
        trade: worker.trade,
        area: worker.area
      },
      token: createWorkerToken(worker.id)
    });
  } catch (err) {
    console.error('Worker Login Error:', err);
    res.status(500).json({ success: false, error: 'حدث خطأ داخلي في الخادم: ' + (err.message || '') });
  }
});

app.post('/api/worker/forgot-password', workerLoginRateLimit, async (req, res) => {
  try {
    const body = req.body || {};
    const rawInput = String(body.identifier || body.phone || body.email || '').trim();
    if (!rawInput) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال رقم التليفون أو البريد الإلكتروني' });
    }

    const isEmailInput = isValidEmail(rawInput);
    const query = supabase.from('workers').select('id, name, phone, whatsapp, email');
    const { data: worker, error } = isEmailInput
      ? await query.ilike('email', rawInput).maybeSingle()
      : await query.eq('phone', rawInput).maybeSingle();

    if (error || !worker) {
      return res.status(404).json({ success: false, error: isEmailInput ? 'البريد الإلكتروني غير مسجل في قاعدة البيانات' : 'رقم التليفون غير مسجل في قاعدة البيانات' });
    }

    if (!worker.email) {
      return res.status(400).json({ success: false, error: 'لا يوجد بريد إلكتروني مسجل لهذا الحساب. يرجى التواصل مع الإدارة لتحديث بياناتك.' });
    }

    const token = generateSecureToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // صلاحية 30 دقيقة

    await supabase.from('workers').update({
      password_reset_token_hash: tokenHash,
      password_reset_expires_at: expiresAt.toISOString()
    }).eq('id', worker.id);

    await mailer.sendPasswordResetEmail(worker, token)
      .catch(err => console.error('Failed to send reset email:', err.message));

    res.json({
      success: true,
      message: 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني المسجل.'
    });
  } catch (err) {
    console.error('Forgot Password Error:', err);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء استعادة كلمة المرور' });
  }
});

app.post('/api/worker/reset-password', workerLoginRateLimit, async (req, res) => {
  try {
    const token = String((req.body || {}).token || '').trim();
    const newPassword = String((req.body || {}).password || '').trim();

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, error: 'الرابط غير صالح أو كلمة المرور مفقودة' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'كلمة المرور يجب ألا تقل عن 6 أحرف' });
    }

    const tokenHash = hashToken(token);
    const { data: worker, error } = await supabase
      .from('workers')
      .select('id, name, email, password_reset_expires_at')
      .eq('password_reset_token_hash', tokenHash)
      .maybeSingle();

    if (error || !worker) {
      return res.status(400).json({ success: false, error: 'رابط إعادة التعيين غير صالح أو تم استخدامه بالفعل' });
    }

    if (!worker.password_reset_expires_at || new Date(worker.password_reset_expires_at).getTime() < Date.now()) {
      return res.status(400).json({ success: false, error: 'انتهت صلاحية رابط إعادة التعيين، يرجى طلب رابط جديد' });
    }

    const { salt, hash } = hashAdminPassword(newPassword);

    await supabase.from('workers').update({
      password_hash: hash,
      password_salt: salt,
      password_reset_token_hash: null,
      password_reset_expires_at: null
    }).eq('id', worker.id);

    await mailer.sendPasswordChangedEmail(worker)
      .catch(err => console.error('Failed to send password-changed email:', err.message));

    res.json({ success: true, message: 'تم تحديث كلمة المرور بنجاح، يمكنك الآن تسجيل الدخول.' });
  } catch (err) {
    console.error('Reset Password Error:', err);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء إعادة تعيين كلمة المرور' });
  }
});

// ===============================
// مسارات جلب وإرسال رسائل محادثة الصنايعي مع الإدارة (تحديث المحادثات - الجدول الجديد)
// ===============================

// 1. جلب لستة كل المحادثات (للإدارة - متوافقة مع كل احتمالات admin.js)
app.get('/api/admin/worker-chat/threads', adminApiRateLimit, requirePermission("workers:read"), async (req, res) => {
  try {
    const { data: messages, error } = await supabase
      .from('worker_chat_messages')
      .select('worker_id, message_text, created_at, sender_type, attachment_url, is_read')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const { data: workers } = await supabase.from('workers').select('id, name, phone, registration_code, trade, area');
    const workersMap = {};
    if (workers) {
      workers.forEach(w => workersMap[w.id] = w);
    }

    const threadsMap = {};
    if (messages) {
       messages.forEach(msg => {
          const cid = msg.worker_id;
          const worker = workersMap[cid];

          if (!worker) return;

          if (!threadsMap[cid]) {
             const msgText = msg.message_text ? msg.message_text : (msg.attachment_url ? 'صورة مرفقة 📷' : 'رسالة جديدة');
             
             threadsMap[cid] = {
                id: cid,
                worker_id: cid,
                workerId: cid,
                workerID: cid,
                thread_id: cid,
                threadId: cid,
                
                name: worker.name,
                worker_name: worker.name,
                workerName: worker.name,
                fullName: worker.name,
                title: worker.name,
                
                phone: worker.phone,
                worker_phone: worker.phone,
                workerPhone: worker.phone,
                
                trade: worker.trade || '',
                area: worker.area || '',
                registration_code: worker.registration_code || '',
                
                message: msgText,
                message_text: msgText,
                last_message: msgText,
                lastMessage: msgText,
                text: msgText,
                
                date: msg.created_at,
                created_at: msg.created_at,
                createdAt: msg.created_at,
                last_message_date: msg.created_at,
                updated_at: msg.created_at,
                
                unread_count: msg.is_read === false && msg.sender_type === 'worker' ? 1 : 0,
                unreadCount: msg.is_read === false && msg.sender_type === 'worker' ? 1 : 0
             };
          } else {
             if (msg.is_read === false && msg.sender_type === 'worker') {
                 threadsMap[cid].unread_count += 1;
                 threadsMap[cid].unreadCount += 1;
             }
          }
       });
    }

    const threadsList = Object.values(threadsMap);
    res.json({ 
      success: true, 
      threads: threadsList, 
      data: threadsList,
      items: threadsList,
      list: threadsList
    });
  } catch (err) {
    console.error('Fetch Threads Error:', err);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء جلب المحادثات' });
  }
});

// 2. جلب رسايل محادثة واحدة (للصنايعي والإدارة)
async function getWorkerChatMessages(req, res) {
  try {
    const workerId = req.query.worker_id || req.params.id;
    if (!workerId) return res.status(400).json({ success: false, error: 'معرف الصنايعي مطلوب' });

    // تحديث الرسايل كمقروءة لو الإدارة اللي بتفتحها
    if (req.path.includes('/admin/')) {
        await supabase.from('worker_chat_messages')
          .update({ is_read: true })
          .eq('worker_id', workerId)
          .eq('sender_type', 'worker')
          .eq('is_read', false);
    }

    const { data: messages, error } = await supabase
      .from('worker_chat_messages')
      .select('*')
      .eq('worker_id', workerId)
      .order('created_at', { ascending: true });

    if (error) {
      return res.json({ success: true, messages: [], unread_count: 0 });
    }

    res.json({ success: true, messages: messages || [], unread_count: 0 });
  } catch (err) {
    res.json({ success: true, messages: [], unread_count: 0 });
  }
}

app.get('/api/worker-owner-chat/messages', requireWorkerOwnership, getWorkerChatMessages);
app.get('/api/admin/worker-chat/messages/:id', adminApiRateLimit, requirePermission("workers:read"), getWorkerChatMessages);

// 3. إرسال رسالة (للصنايعي والإدارة)
async function sendWorkerChatMessage(req, res) {
  try {
    const body = req.body || {};
    const workerId = body.worker_id;
    const messageText = String(body.message || '').trim();
    
    const senderType = req.path.includes('/admin/') ? 'admin' : 'worker';

    if (!workerId || (!messageText && !req.file)) {
      return res.status(400).json({ success: false, error: 'بيانات الرسالة غير مكتملة' });
    }

    let attachmentUrl = null;
    if (req.file) {
      const fileName = await uploadToSupabase(req.file, "uploads");
      if (fileName) attachmentUrl = "/uploads/" + fileName;
    }

    const newMessage = {
      worker_id: workerId,
      sender_type: senderType, 
      message_text: messageText,
      attachment_url: attachmentUrl,
      is_read: false,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase.from('worker_chat_messages').insert([newMessage]);
    if (error) throw error;

    res.json({ success: true, message: 'تم إرسال الرسالة بنجاح' });
  } catch (err) {
    console.error('Send Worker Message Error:', err);
    res.status(500).json({ success: false, error: err.message || 'تعذر إرسال الرسالة' });
  }
}

app.post('/api/worker-owner-chat/messages', upload.single('attachment'), requireWorkerOwnership, sendWorkerChatMessage);
app.post('/api/admin/worker-chat/messages', adminApiRateLimit, requirePermission("workers:read"), upload.single('attachment'), sendWorkerChatMessage);

// 4. جلب عدد الرسائل غير المقروءة للإدارة (عشان الـ Badge)
app.get('/api/admin/worker-chat/unread-count', adminApiRateLimit, requirePermission("workers:read"), async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('worker_chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
      .eq('sender_type', 'worker');
      
    res.json({ success: true, count: count || 0 });
  } catch (err) {
    res.json({ success: true, count: 0 });
  }
});

// ===============================
// مسارات جلب وإرسال رسائل خدمة العملاء (للإدارة)
// ===============================

// 1. جلب لستة محادثات خدمة العملاء
app.get('/api/admin/support-chat/threads', adminApiRateLimit, requirePermission("workers:read"), async (req, res) => {
  try {
    const { data: messages, error } = await supabase
      .from('support_chat_messages')
      .select('conversation_id, message_text, created_at, sender_name')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // جلب بيانات العملاء من جدول المحادثات
    const { data: convos } = await supabase.from('support_chat_conversations').select('id, phone, customer_name');
    const convosMap = {};
    if (convos) {
      convos.forEach(c => convosMap[c.id] = c);
    }

    const threadsMap = {};
    if (messages) {
       messages.forEach(msg => {
          const cid = msg.conversation_id;
          const convo = convosMap[cid] || {};
          
          if (!threadsMap[cid]) {
             threadsMap[cid] = {
                id: cid,
                customer_name: convo.customer_name || msg.sender_name || 'عميل غير معروف',
                phone: convo.phone || '',
                message_text: msg.message_text,
                created_at: msg.created_at
             };
          }
       });
    }

    res.json({ success: true, threads: Object.values(threadsMap) });
  } catch (err) {
    console.error('Support Threads Error:', err);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء جلب محادثات خدمة العملاء' });
  }
});

// 2. جلب رسائل محادثة خدمة عملاء معينة (وتحديثها كمقروءة)
app.get('/api/admin/support-chat/threads/:id/messages', adminApiRateLimit, requirePermission("workers:read"), async (req, res) => {
  try {
    const threadId = req.params.id;

    // تحديث الرسائل غير المقروءة إلى مقروءة بمجرد فتح الإدارة لها
    await supabase
      .from('support_chat_messages')
      .update({ is_read: true })
      .eq('conversation_id', threadId)
      .neq('sender_type', 'admin') // رسائل العميل فقط
      .eq('is_read', false);

    const { data: messages, error } = await supabase
      .from('support_chat_messages')
      .select('*')
      .eq('conversation_id', threadId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const { data: thread } = await supabase
      .from('support_chat_conversations')
      .select('*')
      .eq('id', threadId)
      .maybeSingle();

    res.json({ success: true, messages: messages || [], thread: thread || {} });
  } catch (err) {
    res.status(500).json({ success: false, error: 'حدث خطأ' });
  }
});

// 3. إرسال رد من الإدارة لخدمة العملاء
app.post('/api/admin/support-chat/threads/:id/messages', adminApiRateLimit, requirePermission("workers:read"), async (req, res) => {
  try {
    const threadId = req.params.id;
    const { message } = req.body;
    
    if (!message) return res.status(400).json({ success: false, error: 'الرسالة فارغة' });

    const newMessage = {
      conversation_id: threadId,
      sender_type: 'admin',
      sender_name: 'الإدارة',
      message_text: message,
      is_read: true,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase.from('support_chat_messages').insert([newMessage]);
    if (error) throw error;

    res.json({ success: true, message: 'تم إرسال الرد' });
  } catch (err) {
    console.error('Send Support Message Error:', err);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء إرسال الرسالة' });
  }
});

// 4. جلب عدد رسائل خدمة العملاء غير المقروءة للإدارة (الـ Badge)
app.get('/api/admin/support-chat/unread-count', adminApiRateLimit, requirePermission("workers:read"), async (req, res) => {
  try {
    const { count, error } = await supabase
      .from('support_chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false)
      .neq('sender_type', 'admin');

    if (error) {
      return res.json({ success: true, unread_count: 0 });
    }

    res.json({ success: true, unread_count: count || 0 });
  } catch (err) {
    console.error("Error fetching support unread count:", err);
    res.json({ success: true, unread_count: 0 });
  }
});

// ===============================
// 5.2. مسارات لوحة تحكم وصور بروفايل الصنايعي
// ===============================
app.get('/api/worker/profile/:id', requireWorkerOwnership, async (req, res) => {
  try {
    const { data: worker, error } = await supabase
      .from('workers')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !worker) return res.status(404).json({ success: false, error: 'الصنايعي غير موجود' });
    
    delete worker.password_hash;
    delete worker.password_salt;
    delete worker.password_reset_token_hash;
    delete worker.password_reset_expires_at;

    res.json({ success: true, worker });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/worker/profile/:id', requireWorkerOwnership, async (req, res) => {
  try {
    const { name, whatsapp, description, trade, area } = req.body;
    await mergePendingChanges(
      req.params.id,
      { profile: { name, whatsapp, description, trade, area } },
      'عدّل الصنايعي بياناته الأساسية'
    );
    res.json({ success: true, message: 'تم إرسال تعديلك بنجاح، وفي انتظار مراجعة الإدارة قبل ما يظهر للعملاء' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/worker/profile/:id/password', requireWorkerOwnership, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'كلمة المرور يجب ألا تقل عن 6 أحرف' });
    }

    const { salt, hash } = hashAdminPassword(newPassword);
    const { error } = await supabase
      .from('workers')
      .update({ password_hash: hash, password_salt: salt })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// إضافة/تعديل البريد الإلكتروني من لوحة تحكم الصنايعي - يتفعل فورًا (مش بيانات ظاهرة للعملاء فمحتاجش موافقة الإدارة)
app.put('/api/worker/profile/:id/email', requireWorkerOwnership, async (req, res) => {
  try {
    const email = String((req.body || {}).email || '').trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ success: false, error: 'صيغة البريد الإلكتروني غير صحيحة' });
    }

    const { data: existing } = await supabase
      .from('workers')
      .select('id')
      .ilike('email', email)
      .neq('id', req.params.id)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(400).json({ success: false, error: 'هذا البريد الإلكتروني مسجل بالفعل لصنايعي آخر' });
    }

    const { error } = await supabase
      .from('workers')
      .update({ email })
      .eq('id', req.params.id);

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ success: false, error: 'هذا البريد الإلكتروني مسجل بالفعل لصنايعي آخر' });
      }
      throw error;
    }

    res.json({ success: true, message: 'تم حفظ بريدك الإلكتروني بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/worker/profile/:id/work-photos', requireWorkerOwnership, upload.array('workPhotos', 5), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ success: false, error: 'لم يتم اختيار صور' });

    const { data: worker, error: fetchErr } = await supabase
      .from('workers')
      .select('work_photos, pending_changes')
      .eq('id', req.params.id)
      .single();

    if (fetchErr) throw fetchErr;

    const stagedPhotos = Array.isArray(worker.pending_changes?.work_photos) ? worker.pending_changes.work_photos : null;
    let currentPhotos = stagedPhotos || worker.work_photos || [];
    if (!Array.isArray(currentPhotos)) currentPhotos = [];
    currentPhotos = [...currentPhotos];

    if (currentPhotos.length + files.length > 5) {
      return res.status(400).json({ success: false, error: 'الحد الأقصى لمعرض الأعمال هو 5 صور فقط' });
    }

    for (const file of files) {
      const fileName = await uploadToSupabase(file, "uploads");
      if (fileName) currentPhotos.push(fileName);
    }

    await mergePendingChanges(
      req.params.id,
      { work_photos: currentPhotos },
      'أضاف الصنايعي صور أعمال جديدة'
    );

    res.json({ success: true, message: 'تم إرسال الصور للمراجعة، وفي انتظار موافقة الإدارة', work_photos: currentPhotos, pending: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/worker/profile/:id/work-photo', requireWorkerOwnership, async (req, res) => {
  try {
    const { photoName } = req.body;
    const { data: worker, error: fetchErr } = await supabase
      .from('workers')
      .select('work_photos, pending_changes')
      .eq('id', req.params.id)
      .single();

    if (fetchErr) throw fetchErr;

    const stagedPhotos = Array.isArray(worker.pending_changes?.work_photos) ? worker.pending_changes.work_photos : null;
    let currentPhotos = stagedPhotos || worker.work_photos || [];
    if (!Array.isArray(currentPhotos)) currentPhotos = [];
    currentPhotos = currentPhotos.filter(p => p !== photoName);

    await mergePendingChanges(
      req.params.id,
      { work_photos: currentPhotos },
      'حذف الصنايعي صورة من معرض أعماله'
    );

    res.json({ success: true, message: 'تم إرسال طلب الحذف للمراجعة، وفي انتظار موافقة الإدارة', work_photos: currentPhotos, pending: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/worker/profile/:id/request-image', requireWorkerOwnership, upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'يرجى اختيار صورة شخصية جديدة' });

    const fileName = await uploadToSupabase(req.file, "uploads");
    if (!fileName) return res.status(500).json({ success: false, error: 'تعذر رفع الصورة' });

    await mergePendingChanges(
      req.params.id,
      { image: fileName },
      'رفع الصنايعي صورة شخصية جديدة'
    );

    res.json({ success: true, message: 'تم إرسال طلب تغيير الصورة الشخصية للإدارة للمراجعة' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// إعادة رفع صورة البطاقة الشخصية (وجه/ظهر) - غالبًا بعد ما الإدارة تطلب ذلك عبر identity_status=needs_id_reupload
app.post('/api/worker/profile/:id/reupload-id', requireWorkerOwnership, upload.fields([
  { name: 'idFront', maxCount: 1 },
  { name: 'idBack', maxCount: 1 }
]), async (req, res) => {
  try {
    const files = req.files || {};
    if (!files.idFront || !files.idBack) {
      return res.status(400).json({ success: false, error: 'يرجى رفع صورتي وجه وظهر البطاقة الشخصية' });
    }

    const idFrontImage = await uploadToSupabase(files.idFront[0], "identity-docs");
    const idBackImage = await uploadToSupabase(files.idBack[0], "identity-docs");

    const { error } = await supabase
      .from('workers')
      .update({
        id_front: idFrontImage,
        id_back: idBackImage,
        id_front_path: idFrontImage,
        id_back_path: idBackImage,
        id_submitted_at: new Date().toISOString(),
        identity_status: 'pending',
        identity_rejection_reason: null,
        identity_review_note: null
      })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ success: true, message: 'تم إرسال صورة البطاقة الجديدة للإدارة للمراجعة' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===============================
// 5.3. مسارات عرض صور البطاقات السرية
// ===============================
async function serveIdentityImage(req, res) {
  try {
    let fileName = req.params.fileName;
    if (fileName && fileName.includes('/')) {
      fileName = fileName.split('/').pop();
    }
    const { data, error } = await supabase.storage.from("identity-docs").createSignedUrl(fileName, 300);
    if (data && data.signedUrl) {
      return res.redirect(data.signedUrl);
    }
    const { data: pubData } = supabase.storage.from("identity-docs").getPublicUrl(fileName);
    if (pubData && pubData.publicUrl) {
      return res.redirect(pubData.publicUrl);
    }
    res.status(404).send("Image not found");
  } catch (err) {
    res.status(404).send("Image not found");
  }
}

app.get("/identity-docs/:fileName", serveIdentityImage);
app.get("/api/identity-docs/:fileName", serveIdentityImage);

app.get("/uploads/:fileName", async (req, res) => {
  const fileName = req.params.fileName;
  try {
    const { data, error } = await supabase.storage.from("identity-docs").createSignedUrl(fileName, 300);
    if (!error && data && data.signedUrl) {
      return res.redirect(data.signedUrl);
    }
  } catch (e) {}

  const bucket = process.env.SUPABASE_BUCKET || "uploads";
  const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
  if (data && data.publicUrl) {
    res.redirect(data.publicUrl);
  } else {
    res.status(404).send("Image not found");
  }
});

// ===============================
// 5.5. مسارات الإيقاف والتجديد (الحذف موجود في routes/workers.js)
// ===============================
app.put('/api/workers/:id', adminApiRateLimit, requirePermission("workers:update"), async (req, res) => {
    try {
        const body = req.body || {};
        const name = String(body.name || '').trim();
        const phone = String(body.phone || '').trim();
        const whatsapp = String(body.whatsapp || '').trim();
        const trade = String(body.trade || '').trim();
        const area = String(body.area || '').trim();
        const description = String(body.description || '').trim();

        if (!name || !phone || !trade || !area) {
            return res.status(400).json({ success: false, error: 'الاسم ورقم الاتصال والحرفة والمنطقة مطلوبين' });
        }

        const { error } = await supabase
            .from('workers')
            .update({ name, phone, whatsapp, trade, area, description })
            .eq('id', req.params.id);

        if (error) {
            if (error.code === '23505') {
                return res.status(400).json({ success: false, error: 'رقم الهاتف مسجل بالفعل لصنايعي آخر' });
            }
            throw error;
        }

        logAdminActivity(req, "worker_update", {
          entity_type: "worker",
          entity_id: req.params.id,
          entity_name: name,
          details: { name, phone, whatsapp, trade, area, description }
        }).catch(() => {});

        res.json({ success: true, message: 'تم تعديل بيانات الصنايعي بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/workers/:id/active', adminApiRateLimit, requirePermission("workers:update"), async (req, res) => {
    try {
        const { active } = req.body;
        const { error } = await supabase.from('workers').update({ active }).eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'تم تحديث حالة التفعيل' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/workers/:id/renew', adminApiRateLimit, requirePermission("subscriptions:manage"), async (req, res) => {
    try {
        const { months, amount, payment_method, payment_status, note } = req.body;
        const addMonths = parseInt(months) || 1;

        const { data: worker, error: fetchError } = await supabase
            .from('workers')
            .select('subscription_start, subscription_end')
            .eq('id', req.params.id)
            .single();

        if (fetchError) throw fetchError;

        const now = new Date();
        let currentEnd = worker?.subscription_end ? new Date(worker.subscription_end) : new Date(now);
        if (currentEnd < now) currentEnd = new Date(now);

        currentEnd.setMonth(currentEnd.getMonth() + addMonths);

        const updateData = { subscription_end: currentEnd.toISOString() };
        
        if (!worker?.subscription_start) {
            updateData.subscription_start = now.toISOString();
        }

        const { error: updateError } = await supabase
            .from('workers')
            .update(updateData)
            .eq('id', req.params.id);

        if (updateError) throw updateError;

        res.json({ success: true, message: 'تم تجديد الاشتراك بنجاح' });
    } catch (err) {
        console.error('Renew Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/admin/workers/renew-all', adminApiRateLimit, requirePermission("subscriptions:manage"), async (req, res) => {
    try {
        const { months } = req.body;
        const addMonths = parseInt(months) || 1;

        const { data: workers, error: fetchError } = await supabase.from('workers').select('id, subscription_start, subscription_end');
        if (fetchError) throw fetchError;

        const now = new Date();
        const updatePromises = workers.map(worker => {
            let currentEnd = worker.subscription_end ? new Date(worker.subscription_end) : new Date(now);
            if (currentEnd < now) currentEnd = new Date(now);
            currentEnd.setMonth(currentEnd.getMonth() + addMonths);

            const updateData = { subscription_end: currentEnd.toISOString() };
            
            if (!worker.subscription_start) {
                updateData.subscription_start = now.toISOString();
            }

            return supabase.from('workers')
                .update(updateData)
                .eq('id', worker.id);
        });

        await Promise.all(updatePromises);

        res.json({ success: true, message: `تم تجديد اشتراك ${workers.length} صنايعي بنجاح.` });
    } catch (err) {
        console.error('Renew All Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

function csvCell(v) {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

app.get('/api/export-workers', adminApiRateLimit, requirePermission("backup:export"), async (req, res) => {
    try {
        const { data: workers, error } = await supabase
            .from('workers')
            .select('id,name,phone,whatsapp,trade,area,description,approved,active,featured,identity_status,subscription_start,subscription_end,registration_code,created_at')
            .order('id', { ascending: false });
        if (error) throw error;

        const headers = ['ID', 'الاسم', 'الهاتف', 'واتساب', 'الحرفة', 'المنطقة', 'الوصف', 'معتمد', 'نشط', 'مميز', 'حالة التوثيق', 'بداية الاشتراك', 'نهاية الاشتراك', 'رقم الطلب', 'تاريخ التسجيل'];
        const rows = (workers || []).map(w => [
            w.id, w.name, w.phone, w.whatsapp, w.trade, w.area, w.description,
            w.approved ? 'نعم' : 'لا', w.active ? 'نعم' : 'لا', w.featured ? 'نعم' : 'لا',
            w.identity_status, w.subscription_start, w.subscription_end, w.registration_code, w.created_at
        ]);
        const csv = [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');

        logAdminActivity(req, "backup_export_csv", { entity_type: "backup" }).catch(() => {});
        res.setHeader('Content-Disposition', `attachment; filename="sanay3i-matrouh-workers-${new Date().toISOString().split('T')[0]}.csv"`);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.send(Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from(csv, 'utf8')]));
    } catch (err) {
        console.error('Export Workers Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ===============================
// 7. مسارات التحليلات والإحصائيات
// ===============================
app.post("/api/analytics/track", analyticsRateLimit, async (req, res) => {
  try {
    const body = req.body || {};
    const eventType = String(body.event_type || body.type).trim().slice(0, 40);
    const allowed = new Set(["profile_view", "call", "whatsapp", "share", "filter_trade", "filter_area", "search"]);
    if (!allowed.has(eventType)) return res.status(400).json({ success: false });

    const row = {
      worker_id: String(body.worker_id || body.workerId).trim().slice(0, 80),
      event_type: eventType,
      source: String(body.source).trim().slice(0, 160),
      page_path: String(body.page_path || body.page || req.headers.referer || "").trim().slice(0, 500),
      user_agent: String(req.headers["user-agent"]).trim().slice(0, 500),
      ip_hash: "hidden-for-privacy"
    };
    await supabase.from("analytics_events").insert(row);
    return res.json({ success: true, tracked: true });
  } catch (e) {
    return res.json({ success: true, tracked: false });
  }
});

// (مسار التحليلات /api/admin/analytics موجود في routes/admin.js فقط)

// ===============================
// 6. استدعاء وتفعيل المسارات الأخرى
// ===============================
const adminRoutes = require("./routes/admin");
const workersRoutes = require("./routes/workers");
const whatsappRoutes = require("./routes/whatsapp");
const supportRoutes = require("./routes/support");
const coreRoutes = require("./routes/core");

app.use("/api/admin", adminRoutes);
app.use("/api/workers", workersRoutes);
app.use("/api/sanaieya", workersRoutes);
app.use("/api", whatsappRoutes);
app.use("/api/support-chat", supportRoutes);
app.use("/api", coreRoutes);


// ===============================
// 8. الملفات الثابتة والصفحات
// ===============================
const STATIC_DIR = path.join(__dirname, "..");

app.get("/favicon.ico", (req, res) => res.status(204).end());

app.get("/manifest.json", (req, res) => {
  res.status(200).json({
    name: "Sanay3i Matrouh",
    short_name: "Sanay3i",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000"
  });
});

app.use(express.static(path.join(STATIC_DIR, "public"), {
  maxAge: process.env.NODE_ENV === "production" ? "7d" : 0
}));

app.use(express.static(STATIC_DIR, {
  maxAge: process.env.NODE_ENV === "production" ? "7d" : 0
}));

app.get(["/style.css", "/*/style.css"], (req, res) => {
  res.type("text/css");
  res.setHeader("Cache-Control", process.env.NODE_ENV === "production" ? "public, max-age=604800" : "no-cache");
  res.sendFile(path.join(STATIC_DIR, "style.css"), (err) => {
    if (err) res.status(404).send("CSS not found");
  });
});

const MATROUH_HERO_BANNER_FILE = path.join(STATIC_DIR, "images", "matrouh-hero-banner.jpg");
app.get(["/api/static/matrouh-hero-banner.jpg", "/images/matrouh-hero-banner.jpg", "/matrouh-hero-banner.jpg"], (req, res) => {
  res.type("image/jpeg");
  res.setHeader("Cache-Control", process.env.NODE_ENV === "production" ? "public, max-age=604800" : "no-cache");
  res.sendFile(MATROUH_HERO_BANNER_FILE, (err) => {
    if (err) {
      res.status(404).send("Image not found");
    }
  });
});

app.get("/uploads/:fileName", (req, res) => {
  const bucket = process.env.SUPABASE_BUCKET || "uploads";
  const { data } = supabase.storage.from(bucket).getPublicUrl(req.params.fileName);
  if (data && data.publicUrl) {
    res.redirect(data.publicUrl);
  } else {
    res.status(404).send("Image not found");
  }
});

// المسارات الأساسية للصفحات
app.get("/", (req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));
app.get("/register", (req, res) => res.sendFile(path.join(STATIC_DIR, "register.html")));
app.get("/privacy-policy", (req, res) => res.sendFile(path.join(STATIC_DIR, "privacy-policy.html")));

app.get(["/worker-login", "/worker-login.html"], (req, res) => {
  const filePath = path.join(STATIC_DIR, "worker-login.html");
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.status(404).send(`
      <html dir='rtl'>
        <body style='text-align:center; font-family: Cairo, sans-serif; margin-top:50px; background-color:#f8fafc; color:#0f172a;'>
          <h2 style='color:#dc2626;'>ملف صفحة تسجيل الدخول مفقود!</h2>
          <p>يرجى إنشاء ملف <b>worker-login.html</b> في المجلد الرئيسي (نفس المكان اللي فيه index.html).</p>
        </body>
      </html>
    `);
  }
});

app.get("/reset-password", (req, res) => res.sendFile(path.join(STATIC_DIR, "reset-password.html")));
app.get("/worker-dashboard", (req, res) => res.sendFile(path.join(STATIC_DIR, "worker-dashboard.html")));
app.get("/status", (req, res) => res.sendFile(path.join(STATIC_DIR, "status.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(STATIC_DIR, "admin.html")));
app.get("/admin/add-worker", (req, res) => res.sendFile(path.join(STATIC_DIR, "admin-add-worker.html")));
app.get("/worker/:id", (req, res) => res.sendFile(path.join(STATIC_DIR, "worker.html")));
app.get("/trade/:trade", (req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));
app.get("/area/:area", (req, res) => res.sendFile(path.join(STATIC_DIR, "index.html")));

app.get("/icons/:fileName", (req, res) => {
  res.type("image/png");
  res.sendFile(path.join(STATIC_DIR, "icons", req.params.fileName));
});

app.get("/robots.txt", (req, res) => {
  res.type("text/plain");
  res.send("User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n");
});

// ===============================
// 9. معالجة الأخطاء والتشغيل
// ===============================
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, error: "خطأ في رفع الملفات: " + err.message });
  }
  if (err && err.message) {
    const msg = String(err.message || "");
    if (msg.includes("الصورة") || msg.includes("image") || msg.includes("امتداد") || msg.includes("نوع")) {
      return res.status(400).json({ success: false, error: msg });
    }
  }
  
  if (err.code !== 'ENOENT') {
     console.error("Server Error:", err.message);
  }
  
  res.status(500).json({ success: false, error: "حدث خطأ داخلي في الخادم" });
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return res.status(404).json({ success: false, error: "API route not found" });
  next();
});

module.exports = app;

const PORT = process.env.PORT || 3000;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log('-------------------------------------------');
    console.log(`Sanay3i Matrouh server is running locally`);
    console.log(`http://localhost:${PORT}`);
    console.log('-------------------------------------------');
  });
}