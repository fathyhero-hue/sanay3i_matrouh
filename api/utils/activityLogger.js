const { supabase } = require("../config/supabase");

// دالة لترجمة كود العملية إلى اسم عربي مفهوم يظهر في لوحة التحكم
function activityActionLabel(action) {
  const labels = {
    worker_update: "تعديل بيانات صنايعي",
    worker_register: "تسجيل صنايعي جديد",
    worker_approve: "اعتماد صنايعي",
    worker_unapprove: "إلغاء اعتماد صنايعي",
    worker_activate: "تفعيل صنايعي",
    worker_deactivate: "إيقاف صنايعي",
    worker_feature: "تمييز صنايعي",
    worker_unfeature: "إلغاء تمييز صنايعي",
    worker_delete: "حذف صنايعي",
    subscription_renew: "تجديد اشتراك",
    identity_review: "مراجعة تحقق",
    work_photos_add: "إضافة صور أعمال",
    work_photo_delete: "حذف صورة عمل",
    review_approve: "اعتماد تقييم",
    review_unapprove: "إلغاء اعتماد تقييم",
    review_delete: "حذف تقييم",
    trade_add: "إضافة حرفة",
    trade_delete: "حذف حرفة",
    area_add: "إضافة منطقة",
    area_delete: "حذف منطقة",
    admin_user_create: "إنشاء مستخدم إدارة",
    admin_user_update: "تعديل مستخدم إدارة",
    admin_user_password_change: "تغيير كلمة سر مستخدم إدارة",
    admin_user_delete: "حذف مستخدم إدارة",
    backup_export_json: "تصدير نسخة JSON",
    backup_create_storage: "إنشاء نسخة احتياطية في Storage",
    backup_export_subscriptions_csv: "تصدير الاشتراكات CSV",
    backup_export_payments_csv: "تصدير المدفوعات CSV",
    backup_auto_daily: "نسخ احتياطي يومي تلقائي",
    worker_report_status_update: "تحديث حالة بلاغ",
    worker_report_delete: "حذف بلاغ",
    whatsapp_send: "إرسال واتساب تلقائي",
    whatsapp_bulk_send: "إرسال واتساب جماعي",
    whatsapp_inbox_reply: "رد على رسالة واتساب",
    admin_chat_reply: "رد داخل شات التطبيق",
    support_chat_reply: "رد خدمة العملاء"
  };
  return labels[action] || action;
}

// الدالة الأساسية التي تسجل تفاصيل الحركة في قاعدة البيانات
async function logAdminActivity(req, action, options = {}) {
  try {
    if (!supabase) return;
    
    // جلب بيانات المدير الذي قام بالعملية من الطلب
    const admin = options.admin || (req && req.admin) || null;
    
    const baseRow = {
      action: String(action || "admin_action"),
      action_label: activityActionLabel(action),
      entity_type: options.entity_type ? String(options.entity_type) : null,
      entity_id: options.entity_id !== undefined && options.entity_id !== null && options.entity_id !== "" ? Number(options.entity_id) : null,
      entity_name: options.entity_name ? String(options.entity_name) : null,
      details: options.details || {},
      admin_name: options.admin_name || admin?.display_name || admin?.username || "الإدارة"
    };

    const fullRow = {
      ...baseRow,
      admin_id: admin?.id || null,
      admin_username: admin?.username || null,
      admin_role: admin?.role || null,
      before_data: options.before_data || options.before || {},
      after_data: options.after_data || options.after || {}
    };

    // محاولة إرسال البيانات بجميع التفاصيل
    let { error } = await supabase.from("admin_activity_log").insert(fullRow);
    
    // إذا فشل الإرسال (مثلاً بسبب عدم وجود عواميد جديدة)، أرسل البيانات الأساسية فقط
    if (error) {
      await supabase.from("admin_activity_log").insert(baseRow);
    }
  } catch (e) {
    console.warn("تم تخطي تسجيل نشاط الإدارة:", e.message);
  }
}

module.exports = {
  logAdminActivity,
  activityActionLabel
};