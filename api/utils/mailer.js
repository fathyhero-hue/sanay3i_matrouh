const nodemailer = require("nodemailer");

const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "").trim() === "true" || SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "صنايعي مطروح <no-reply@sanay3i-matrouh.com>";
const APP_BASE_URL = String(process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

let transporter = null;

function isMailerReady() {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function getTransporter() {
  if (!isMailerReady()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: { user: SMTP_USER, pass: SMTP_PASS }
    });
  }
  return transporter;
}

// قالب HTML موحّد بسيط لكل رسائل المشروع
function baseTemplate({ title, bodyHtml }) {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Tahoma,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:24px;">
    <div style="background:#061A3D;padding:18px 24px;border-radius:10px 10px 0 0;">
      <span style="color:#fff;font-size:18px;font-weight:bold;">🛠️ صنايعي مطروح</span>
    </div>
    <div style="background:#fff;padding:24px;border-radius:0 0 10px 10px;border:1px solid #e2e8f0;border-top:none;">
      <h2 style="color:#0f172a;margin-top:0;font-size:19px;">${title}</h2>
      <div style="color:#334155;font-size:15px;line-height:1.9;">${bodyHtml}</div>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
      هذه رسالة تلقائية من دليل صنايعي مطروح، برجاء عدم الرد عليها.
    </p>
  </div>
</body>
</html>`;
}

async function sendMail({ to, subject, html }) {
  if (!to) return { skipped: true, reason: "no-recipient" };
  const t = getTransporter();
  if (!t) {
    console.warn("Mailer غير مُهيّأ (SMTP env مفقودة) - تم تخطي إرسال إيميل إلى:", to);
    return { skipped: true, reason: "not-configured" };
  }
  try {
    await t.sendMail({ from: EMAIL_FROM, to, subject, html });
    return { success: true };
  } catch (err) {
    console.error("فشل إرسال الإيميل:", err.message);
    return { success: false, error: err.message };
  }
}

// 1. رسالة ترحيب بعد التسجيل
async function sendWelcomeEmail(worker) {
  const profileUrl = `${APP_BASE_URL}/worker/${worker.id}`;
  const html = baseTemplate({
    title: `أهلاً بك يا ${worker.name} 👋`,
    bodyHtml: `
      <p>تم التسجيل بنجاح في دليل صنايعي مطروح.</p>
      <p><b>رقم طلبك:</b> ${worker.registration_code || "-"}</p>
      <p>حسابك متاح الآن على التطبيق، وفي انتظار التوثيق من الإدارة. لن يظهر حسابك للعملاء في نتائج البحث إلا بعد التوثيق.</p>
      <p><a href="${profileUrl}" style="color:#0284c7;">اضغط هنا للدخول إلى صفحتك</a></p>
    `
  });
  return sendMail({ to: worker.email, subject: "تم التسجيل بنجاح | صنايعي مطروح", html });
}

// 2. رسالة توثيق الهوية (اعتماد)
async function sendIdentityVerifiedEmail(worker) {
  const profileUrl = `${APP_BASE_URL}/worker/${worker.id}`;
  const html = baseTemplate({
    title: `مبروك! تم توثيق حسابك ✅`,
    bodyHtml: `
      <p>يا ${worker.name}، تم توثيق واعتماد بياناتك في دليل صنايعي مطروح.</p>
      <p>بروفايلك ظاهر دلوقتي للعملاء ويمكنهم التواصل معاك مباشرة.</p>
      <p><a href="${profileUrl}" style="color:#0284c7;">شاهد بروفايلك العام</a></p>
    `
  });
  return sendMail({ to: worker.email, subject: "تم توثيق حسابك | صنايعي مطروح", html });
}

// 3. رسالة إجراء مطلوب على الهوية (رفض / بيانات ناقصة / إعادة رفع بطاقة)
async function sendIdentityActionEmail(worker, status, reason, note) {
  const subjects = {
    rejected: "تعذر اعتماد طلبك | صنايعي مطروح",
    needs_data: "مطلوب استكمال بياناتك | صنايعي مطروح",
    needs_id_reupload: "مطلوب إعادة رفع صورة البطاقة | صنايعي مطروح"
  };
  const titles = {
    rejected: "تعذر اعتماد طلب التوثيق",
    needs_data: "مطلوب استكمال بعض البيانات",
    needs_id_reupload: "مطلوب إعادة رفع صورة البطاقة"
  };
  const loginUrl = `${APP_BASE_URL}/worker-login`;
  const html = baseTemplate({
    title: titles[status] || "تحديث بخصوص حسابك",
    bodyHtml: `
      <p>يا ${worker.name}، فيه تحديث بخصوص طلب التوثيق الخاص بيك.</p>
      ${reason ? `<p><b>السبب:</b> ${reason}</p>` : ""}
      ${note ? `<p><b>ملاحظة من الإدارة:</b> ${note}</p>` : ""}
      <p><a href="${loginUrl}" style="color:#0284c7;">سجّل دخولك من هنا لتحديث بياناتك</a></p>
    `
  });
  return sendMail({ to: worker.email, subject: subjects[status] || "تحديث بخصوص حسابك | صنايعي مطروح", html });
}

// 4. رسالة إعادة تعيين كلمة المرور (رابط + توكن)
async function sendPasswordResetEmail(worker, token) {
  const resetUrl = `${APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const html = baseTemplate({
    title: "إعادة تعيين كلمة المرور",
    bodyHtml: `
      <p>يا ${worker.name}، وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك.</p>
      <p><a href="${resetUrl}" style="color:#0284c7;font-weight:bold;">اضغط هنا لإعادة تعيين كلمة المرور</a></p>
      <p style="color:#dc2626;font-size:13px;">هذا الرابط صالح لمدة 30 دقيقة فقط.</p>
      <p style="font-size:13px;color:#64748b;">لو مطلبتش إعادة تعيين كلمة المرور، تجاهل هذه الرسالة ولن يتم تغيير أي شيء.</p>
    `
  });
  return sendMail({ to: worker.email, subject: "إعادة تعيين كلمة المرور | صنايعي مطروح", html });
}

// 5. رسالة تأكيد تغيير كلمة المرور بنجاح
async function sendPasswordChangedEmail(worker) {
  const html = baseTemplate({
    title: "تم تغيير كلمة المرور",
    bodyHtml: `
      <p>يا ${worker.name}، تم تغيير كلمة المرور الخاصة بحسابك بنجاح.</p>
      <p style="font-size:13px;color:#64748b;">لو الإجراء ده مش انت اللي عملته، تواصل مع الإدارة فورًا.</p>
    `
  });
  return sendMail({ to: worker.email, subject: "تم تغيير كلمة المرور | صنايعي مطروح", html });
}

// 6. تنبيه اقتراب/وصول انتهاء الاشتراك
async function sendSubscriptionReminderEmail(worker, daysLeft) {
  const loginUrl = `${APP_BASE_URL}/worker-login`;
  const isToday = daysLeft === 0;
  const html = baseTemplate({
    title: isToday ? "⏰ اشتراكك بينتهي النهاردة" : `⏰ اشتراكك هينتهي بعد ${daysLeft} ${daysLeft === 1 ? "يوم" : "أيام"}`,
    bodyHtml: `
      <p>يا ${worker.name}، ${isToday ? "اشتراكك في دليل صنايعي مطروح بينتهي النهاردة." : `باقي ${daysLeft} ${daysLeft === 1 ? "يوم" : "أيام"} بس على انتهاء اشتراكك في دليل صنايعي مطروح.`}</p>
      <p>لو الاشتراك خلص، بروفايلك هيختفي من نتائج بحث العملاء لحد ما تجدده.</p>
      <p><a href="${loginUrl}" style="color:#0284c7;font-weight:bold;">سجّل دخولك من هنا لتجديد الاشتراك</a></p>
    `
  });
  return sendMail({ to: worker.email, subject: isToday ? "اشتراكك بينتهي النهاردة | صنايعي مطروح" : `تذكير: اشتراكك هينتهي بعد ${daysLeft} ${daysLeft === 1 ? "يوم" : "أيام"} | صنايعي مطروح`, html });
}

// 7. تأكيد نجاح تجديد الاشتراك
async function sendSubscriptionRenewedEmail(worker, { months, amount, newEnd }) {
  const profileUrl = `${APP_BASE_URL}/worker/${worker.id}`;
  const html = baseTemplate({
    title: "✅ تم تجديد اشتراكك بنجاح",
    bodyHtml: `
      <p>يا ${worker.name}، تم تجديد اشتراكك في دليل صنايعي مطروح بنجاح.</p>
      <p><b>المدة:</b> ${months} ${months === 1 ? "شهر" : "أشهر"}</p>
      ${amount ? `<p><b>المبلغ:</b> ${amount} جنيه</p>` : ""}
      <p><b>الاشتراك سار لحد:</b> ${new Date(newEnd).toLocaleDateString("ar-EG")}</p>
      <p><a href="${profileUrl}" style="color:#0284c7;">شاهد بروفايلك العام</a></p>
    `
  });
  return sendMail({ to: worker.email, subject: "تم تجديد اشتراكك بنجاح | صنايعي مطروح", html });
}

module.exports = {
  isMailerReady,
  sendWelcomeEmail,
  sendIdentityVerifiedEmail,
  sendIdentityActionEmail,
  sendPasswordResetEmail,
  sendPasswordChangedEmail,
  sendSubscriptionReminderEmail,
  sendSubscriptionRenewedEmail
};
