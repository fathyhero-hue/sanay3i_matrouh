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
const { adminApiRateLimit, analyticsRateLimit } = require("./middlewares/rateLimit");

app.use("/api/admin", (req, res, next) => {
  if (req.path === "/login") return next();
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

// ===============================
// دوال معالجة الاعتماد والمراجعة
// ===============================
async function handleWorkerVerify(req, res) {
    try {
        const { approved } = req.body;
        const updateData = { 
          approved: Boolean(approved),
          identity_verified: Boolean(approved)
        };

        if (approved) {
          const { data: workerData } = await supabase
            .from('workers')
            .select('pending_image')
            .eq('id', req.params.id)
            .maybeSingle();
            
          if (workerData && workerData.pending_image) {
            updateData.image = workerData.pending_image;
            updateData.pending_image = null;
          }
        }

        const { error } = await supabase
          .from('workers')
          .update(updateData)
          .eq('id', req.params.id);

        if (error) throw error;

        res.json({ success: true, message: 'تم تحديث حالة التحقيق والاعتماد بنجاح' });
    } catch (err) {
        console.error('Verify Worker Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
}

async function handleIdentityReview(req, res) {
    try {
        const body = req.body || {};
        const updateData = {};
        
        const isApproved = body.approved !== undefined ? Boolean(body.approved) : true;
        updateData.approved = isApproved;
        updateData.identity_verified = isApproved;

        if (isApproved) {
          const { data: workerData } = await supabase
            .from('workers')
            .select('pending_image')
            .eq('id', req.params.id)
            .maybeSingle();
            
          if (workerData && workerData.pending_image) {
            updateData.image = workerData.pending_image;
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

        res.json({ success: true, message: 'تم تحديث حالة مراجعة البطاقة والاعتماد بنجاح' });
    } catch (err) {
        console.error('Identity Review Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
}

// تسجيل مسارات الاعتماد والمراجعة
app.put('/api/workers/:id/verify', adminApiRateLimit, handleWorkerVerify);
app.post('/api/workers/:id/verify', adminApiRateLimit, handleWorkerVerify);
app.put('/api/admin/workers/:id/verify', adminApiRateLimit, handleWorkerVerify);
app.post('/api/admin/workers/:id/verify', adminApiRateLimit, handleWorkerVerify);

app.put('/api/workers/:id/identity-review', adminApiRateLimit, handleIdentityReview);
app.post('/api/workers/:id/identity-review', adminApiRateLimit, handleIdentityReview);
app.put('/api/admin/workers/:id/identity-review', adminApiRateLimit, handleIdentityReview);
app.post('/api/admin/workers/:id/identity-review', adminApiRateLimit, handleIdentityReview);

// ===============================
// مسار التحقق وتسجيل الدخول المباشر لبروفايل الصنايعي
// ===============================
app.post(['/api/worker-owner-chat/verify', '/api/workers/:id/verify-chat', '/api/support-chat/verify', '/api/worker/verify-chat'], async (req, res) => {
  try {
    const workerId = req.params.id || req.body.workerId || req.body.worker_id;
    const body = req.body || {};
    const inputPhone = String(body.phone || body.whatsapp || '').trim();

    if (!inputPhone) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال رقم الهاتف للتحقق' });
    }

    let query = supabase.from('workers').select('id, phone, whatsapp, name');
    if (workerId) {
      query = query.eq('id', workerId);
    } else {
      query = query.or(`phone.eq.${inputPhone},whatsapp.eq.${inputPhone}`);
    }

    const { data: worker, error } = await query.maybeSingle();

    let targetWorker = worker;
    if (error || !targetWorker) {
      const { data: workerByPhone } = await supabase
        .from('workers')
        .select('id, phone, whatsapp, name')
        .or(`phone.eq.${inputPhone},whatsapp.eq.${inputPhone}`)
        .maybeSingle();
        
      if (!workerByPhone) {
        return res.status(404).json({ success: false, error: 'رقم الهاتف غير مسجل في النظام' });
      }
      targetWorker = workerByPhone;
    }

    const workerPhone = String(targetWorker.phone || '').trim();
    const workerWhatsapp = String(targetWorker.whatsapp || '').trim();

    if (inputPhone === workerPhone || inputPhone === workerWhatsapp || inputPhone.slice(-9) === workerPhone.slice(-9)) {
      const sessionToken = crypto.randomBytes(32).toString('hex');
      return res.json({ 
        success: true, 
        verified: true, 
        token: sessionToken,
        unread_count: 0,
        message: 'تم التحقق بنجاح',
        worker: { id: targetWorker.id, name: targetWorker.name }
      });
    } else {
      return res.status(401).json({ success: false, verified: false, error: 'رقم الهاتف غير مطابق للرقم المسجل لهذا الصنايعي' });
    }
  } catch (err) {
    console.error('Verify Owner/Chat Error:', err);
    res.status(500).json({ success: false, error: 'حدث خطأ داخلي أثناء التحقق' });
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

    if (!name || !phone || !trade || !area || !password || !files.idFront || !files.idBack) {
      return res.status(400).json({ success: false, error: 'يرجى إكمال الحقول الأساسية، كلمة المرور، وصور البطاقة' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'كلمة المرور يجب ألا تقل عن 6 أحرف' });
    }

    const idFrontImage = await uploadToSupabase(files.idFront[0], "identity-docs");
    const idBackImage = await uploadToSupabase(files.idBack[0], "identity-docs");
    
    const { salt, hash } = hashAdminPassword(password);

    const newWorker = {
      name,
      phone,
      whatsapp,
      trade,
      area,
      description,
      username: phone,
      password_hash: hash,
      password_salt: salt,
      id_front: idFrontImage,
      id_back: idBackImage,
      id_front_path: idFrontImage,
      id_back_path: idBackImage,
      id_submitted_at: new Date().toISOString(),
      identity_verified: false,
      approved: false,
      active: true,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabase.from('workers').insert([newWorker]).select().single();
    if (error) throw error;

    const workerId = data.id;
    const registrationCode = 'SN-' + new Date().getFullYear() + '-' + String(workerId).padStart(5, '0');

    await supabase.from('workers').update({ registration_code: registrationCode }).eq('id', workerId);

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
app.post('/api/worker/login', async (req, res) => {
  try {
    const { phone, password } = req.body || {};
    if (!phone || !password) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال رقم التليفون وكلمة المرور' });
    }

    const cleanInput = String(phone).trim();
    
    let { data: worker, error } = await supabase
      .from('workers')
      .select('*')
      .eq('phone', cleanInput)
      .maybeSingle();

    if (error || !worker) {
      const cleanPhoneDigits = cleanInput.replace(/[^\d]/g, '').slice(-10);
      const { data: workersList } = await supabase.from('workers').select('*');
      
      worker = (workersList || []).find(w => {
        const wPhone = String(w.phone || '').replace(/[^\d]/g, '').slice(-10);
        const wWhats = String(w.whatsapp || '').replace(/[^\d]/g, '').slice(-10);
        return wPhone === cleanPhoneDigits || wWhats === cleanPhoneDigits || String(w.phone).trim() === cleanInput;
      });
    }

    if (!worker) {
      return res.status(401).json({ success: false, error: 'رقم التليفون غير مسجل' });
    }

    if (!worker.password_hash && password === String(worker.phone || '').slice(-6)) {
      return res.json({ 
        success: true, 
        worker: { id: worker.id, name: worker.name, phone: worker.phone, trade: worker.trade, area: worker.area }, 
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
      } 
    });
  } catch (err) {
    console.error('Worker Login Error:', err);
    res.status(500).json({ success: false, error: 'حدث خطأ داخلي في الخادم: ' + (err.message || '') });
  }
});

// المسار المعدل لربطه بالواتساب
app.post('/api/worker/forgot-password', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, error: 'يرجى إدخال رقم التليفون' });
    }

    const { data: worker, error } = await supabase
      .from('workers')
      .select('id, name, phone, whatsapp')
      .eq('phone', phone)
      .maybeSingle();

    if (error || !worker) {
      return res.status(404).json({ success: false, error: 'رقم التليفون غير مسجل في قاعدة البيانات' });
    }

    // توليد كلمة سر مؤقتة جديدة وتشفيرها
    const tempPassword = 'SN-' + Math.floor(1000 + Math.random() * 9000);
    const { salt, hash } = hashAdminPassword(tempPassword);

    await supabase.from('workers').update({
      password_hash: hash,
      password_salt: salt
    }).eq('id', worker.id);

    // ==========================================
    // إرسال كلمة السر الجديدة عبر الواتساب أوتوماتيكياً
    // ==========================================
    const WA_TOKEN = process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN;
    const WA_PHONE_ID = process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
    const WA_API_VER = process.env.WHATSAPP_API_VERSION || 'v17.0';
    
    if (WA_TOKEN && WA_PHONE_ID) {
      // تظبيط رقم التليفون ليطابق الصيغة الدولية لمصر (بدون +)
      let targetPhone = String(worker.whatsapp || worker.phone).replace(/[^\d]/g, '');
      if (targetPhone.startsWith('01') && targetPhone.length === 11) {
          targetPhone = '20' + targetPhone.substring(1);
      } else if (targetPhone.length === 10 && targetPhone.startsWith('1')) {
          targetPhone = '20' + targetPhone;
      }

      const msgText = `أهلاً بك يا ${worker.name} في دليل صنايعي مطروح 🛠️\n\nبناءً على طلبك، تم إعادة ضبط كلمة المرور الخاصة بحسابك.\n\n🔑 كلمة المرور الجديدة: *${tempPassword}*\n\nيرجى تسجيل الدخول بها الآن، ولا تشاركها مع أحد للحفاظ على أمان حسابك.`;

      try {
        const response = await fetch(`https://graph.facebook.com/${WA_API_VER}/${WA_PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${WA_TOKEN}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: targetPhone,
                type: 'text',
                text: { body: msgText }
            })
        });

        // طباعة الرد الخاص بميتا في التيرمينال
        const waResult = await response.json();
        console.log("=========================================");
        console.log("رد سيرفر واتساب (Meta API):");
        console.log(JSON.stringify(waResult, null, 2));
        console.log("=========================================");

      } catch (waErr) {
        console.error('Failed to send WhatsApp message:', waErr.message);
      }
    } else {
        console.log("تنبيه: لم يتم إرسال رسالة الواتساب لأن رموز WHATSAPP_TOKEN أو WHATSAPP_PHONE_ID غير موجودة في السيرفر.");
    }

    res.json({ 
      success: true, 
      message: 'تم إرسال كلمة المرور الجديدة في رسالة واتساب إلى رقمك المسجل بنجاح.' 
    });
  } catch (err) {
    console.error('Forgot Password Error:', err);
    res.status(500).json({ success: false, error: 'حدث خطأ أثناء استعادة كلمة المرور' });
  }
});

// ===============================
// مسارات جلب وإرسال رسائل محادثة الصنايعي مع الإدارة
// ===============================
app.get('/api/worker-owner-chat/messages', async (req, res) => {
  try {
    const workerId = req.query.worker_id;
    if (!workerId) return res.status(400).json({ success: false, error: 'معرف الصنايعي مطلوب' });

    const { data: messages, error } = await supabase
      .from('support_chat_messages')
      .select('*')
      .eq('conversation_id', workerId)
      .order('created_at', { ascending: true });

    if (error) {
      return res.json({ success: true, messages: [], unread_count: 0 });
    }

    res.json({ success: true, messages: messages || [], unread_count: 0 });
  } catch (err) {
    res.json({ success: true, messages: [], unread_count: 0 });
  }
});

app.post('/api/worker-owner-chat/messages', upload.single('attachment'), async (req, res) => {
  try {
    const body = req.body || {};
    const workerId = body.worker_id;
    const messageText = String(body.message || '').trim();

    if (!workerId || (!messageText && !req.file)) {
      return res.status(400).json({ success: false, error: 'بيانات الرسالة غير مكتملة' });
    }

    let attachmentUrl = null;
    if (req.file) {
      const fileName = await uploadToSupabase(req.file, "uploads");
      if (fileName) attachmentUrl = "/uploads/" + fileName;
    }

    const newMessage = {
      conversation_id: workerId,
      sender_type: 'worker',
      message_text: messageText,
      attachment_url: attachmentUrl,
      created_at: new Date().toISOString()
    };

    const { error } = await supabase.from('support_chat_messages').insert([newMessage]);
    if (error) throw error;

    res.json({ success: true, message: 'تم إرسال الرسالة بنجاح' });
  } catch (err) {
    console.error('Send Worker Message Error:', err);
    res.status(500).json({ success: false, error: err.message || 'تعذر إرسال الرسالة' });
  }
});

// ===============================
// 5.2. مسارات لوحة تحكم وصور بروفايل الصنايعي
// ===============================
app.get('/api/worker/profile/:id', async (req, res) => {
  try {
    const { data: worker, error } = await supabase
      .from('workers')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !worker) return res.status(404).json({ success: false, error: 'الصنايعي غير موجود' });
    
    delete worker.password_hash;
    delete worker.password_salt;

    res.json({ success: true, worker });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/worker/profile/:id', async (req, res) => {
  try {
    const { name, whatsapp, description, trade, area } = req.body;
    const { error } = await supabase
      .from('workers')
      .update({ name, whatsapp, description, trade, area })
      .eq('id', req.params.id);

    if (error) throw error;
    res.json({ success: true, message: 'تم تحديث البيانات بنجاح' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/worker/profile/:id/password', async (req, res) => {
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

app.post('/api/worker/profile/:id/work-photos', upload.array('workPhotos', 5), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ success: false, error: 'لم يتم اختيار صور' });

    const { data: worker, error: fetchErr } = await supabase
      .from('workers')
      .select('work_photos')
      .eq('id', req.params.id)
      .single();

    if (fetchErr) throw fetchErr;

    let currentPhotos = worker.work_photos || [];
    if (!Array.isArray(currentPhotos)) currentPhotos = [];

    if (currentPhotos.length + files.length > 5) {
      return res.status(400).json({ success: false, error: 'الحد الأقصى لمعرض الأعمال هو 5 صور فقط' });
    }

    for (const file of files) {
      const fileName = await uploadToSupabase(file, "uploads");
      if (fileName) currentPhotos.push(fileName);
    }

    const { error: updateErr } = await supabase
      .from('workers')
      .update({ work_photos: currentPhotos })
      .eq('id', req.params.id);

    if (updateErr) throw updateErr;

    res.json({ success: true, message: 'تم رفع صور الأعمال بنجاح', work_photos: currentPhotos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/worker/profile/:id/work-photo', async (req, res) => {
  try {
    const { photoName } = req.body;
    const { data: worker, error: fetchErr } = await supabase
      .from('workers')
      .select('work_photos')
      .eq('id', req.params.id)
      .single();

    if (fetchErr) throw fetchErr;

    let currentPhotos = worker.work_photos || [];
    currentPhotos = currentPhotos.filter(p => p !== photoName);

    const { error: updateErr } = await supabase
      .from('workers')
      .update({ work_photos: currentPhotos })
      .eq('id', req.params.id);

    if (updateErr) throw updateErr;

    res.json({ success: true, message: 'تم حذف الصورة بنجاح', work_photos: currentPhotos });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/worker/profile/:id/request-image', upload.single('profileImage'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'يرجى اختيار صورة شخصية جديدة' });

    const fileName = await uploadToSupabase(req.file, "uploads");
    if (!fileName) throw res.status(500).json({ success: false, error: 'تعذر رفع الصورة' });

    const { error } = await supabase
      .from('workers')
      .update({ pending_image: fileName })
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ success: true, message: 'تم إرسال طلب تغيير الصورة الشخصية للإدارة للمراجعة' });
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
// 5.5. مسارات الحذف، الإيقاف والتجديد
// ===============================
app.delete('/api/workers/:id', adminApiRateLimit, async (req, res) => {
    try {
        const { error } = await supabase.from('workers').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'تم الحذف بنجاح' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/workers/:id/active', adminApiRateLimit, async (req, res) => {
    try {
        const { active } = req.body;
        const { error } = await supabase.from('workers').update({ active }).eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true, message: 'تم تحديث حالة التفعيل' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/workers/:id/renew', adminApiRateLimit, async (req, res) => {
    try {
        const { months, amount, payment_method, payment_status, note } = req.body;
        const addMonths = parseInt(months) || 1;

        const { data: worker, error: fetchError } = await supabase
            .from('workers')
            .select('subscription_end')
            .eq('id', req.params.id)
            .single();

        if (fetchError) throw fetchError;

        let currentEnd = worker?.subscription_end ? new Date(worker.subscription_end) : new Date();
        if (currentEnd < new Date()) currentEnd = new Date();

        currentEnd.setMonth(currentEnd.getMonth() + addMonths);

        const { error: updateError } = await supabase
            .from('workers')
            .update({ subscription_end: currentEnd.toISOString() })
            .eq('id', req.params.id);

        if (updateError) throw updateError;

        res.json({ success: true, message: 'تم تجديد الاشتراك بنجاح' });
    } catch (err) {
        console.error('Renew Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.put('/api/admin/workers/renew-all', adminApiRateLimit, async (req, res) => {
    try {
        const { months } = req.body;
        const addMonths = parseInt(months) || 1;

        const { data: workers, error: fetchError } = await supabase.from('workers').select('id, subscription_end');
        if (fetchError) throw fetchError;

        const updatePromises = workers.map(worker => {
            let currentEnd = worker.subscription_end ? new Date(worker.subscription_end) : new Date();
            if (currentEnd < new Date()) currentEnd = new Date();
            currentEnd.setMonth(currentEnd.getMonth() + addMonths);

            return supabase.from('workers')
                .update({ subscription_end: currentEnd.toISOString() })
                .eq('id', worker.id);
        });

        await Promise.all(updatePromises);

        res.json({ success: true, message: `تم تجديد اشتراك ${workers.length} صنايعي بنجاح.` });
    } catch (err) {
        console.error('Renew All Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
});

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
app.get("/privacy-policy", (req, res) => res.sendFile(path.join(STATIC_DIR, "privacy-policy.html"))); // <--- هذا هو السطر الذي تمت إضافته

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