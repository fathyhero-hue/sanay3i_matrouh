const { supabase } = require("../config/supabase");
const { today } = require("./helpers");

function smartBool(value) {
  return value === 1 || value === true || value === "1" || value === "true" || value === "yes" || value === "approved" || value === "active";
}

function smartClamp(value, min, max) {
  const n = Number(value) || 0;
  return Math.max(min, Math.min(max, n));
}

function smartDateMs(value) {
  if (!value) return 0;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function smartSubscriptionActive(worker) {
  const end = worker?.subscription_end || worker?.subscriptionEnd || "";
  if (!end) return true;
  return String(end).slice(0, 10) >= today();
}

// الدالة الأساسية لحساب السكور الذكي
function smartScoreWorker(worker, signals) {
  const s = signals || {};
  const avgRating = Number(s.rating_average || 0);
  const reviewCount = Number(s.review_count || 0);
  const calls = Number(s.call || 0);
  const whatsapps = Number(s.whatsapp || 0);
  const views = Number(s.profile_view || 0);
  const shares = Number(s.share || 0);
  const createdMs = smartDateMs(worker?.created_at);
  const ageDays = createdMs ? Math.floor((Date.now() - createdMs) / (24 * 60 * 60 * 1000)) : 9999;

  const parts = {
    featured: smartBool(worker?.featured) ? 350 : 0,
    verified: smartBool(worker?.identity_verified || worker?.verified || worker?.is_verified) ? 250 : 0,
    subscription: smartSubscriptionActive(worker) ? 180 : 0,
    rating: Math.round(smartClamp(avgRating, 0, 5) * 35),
    reviews: Math.round(smartClamp(reviewCount * 8, 0, 90)),
    contacts: Math.round(smartClamp((calls * 20) + (whatsapps * 18) + (shares * 4), 0, 220)),
    views: Math.round(smartClamp(views * 3, 0, 90)),
    recency: Math.round(smartClamp(60 - (ageDays * 2), 0, 60))
  };

  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  const reasons = [];
  if (parts.featured) reasons.push("مميز");
  if (parts.verified) reasons.push("موثق");
  if (parts.subscription) reasons.push("اشتراك نشط");
  if (avgRating > 0) reasons.push(`تقييم ${Math.round(avgRating * 10) / 10}/5`);
  if (calls + whatsapps > 0) reasons.push("تواصل مرتفع");
  if (views > 0) reasons.push("زيارات");
  if (parts.recency) reasons.push("حديث");

  return {
    smart_score: total,
    smart_score_parts: parts,
    smart_score_signals: {
      rating_average: Math.round(avgRating * 10) / 10,
      review_count: reviewCount,
      call: calls,
      whatsapp: whatsapps,
      profile_view: views,
      share: shares
    },
    smart_score_reasons: reasons
  };
}

// مستويات الصنايعي (بند 17 - Gamification) - 4 مستويات بتتحسب ديناميكيًا مع
// كل Response، مش مخزّنة يدويًا، عشان تفضل دايمًا متسقة مع بيانات حقيقية
// (تقييم/عدد تقييمات/طلبات مكتملة). الـThresholds دي مبنية على فحص التوزيع
// الفعلي الحالي: أغلب الصنايعية (~130) لسه من غير تقييمات (جديد)، حوالي 15
// عندهم تقييم واحد لحد 3 (محترف)، حوالي 4 عندهم 4-5 تقييمات ممتازة أو 4+
// طلبات مكتملة (خبير)، وصنايعي واحد بس وصل لـ6 تقييمات ممتازة (نخبة) -
// المستويات دي هتتحرك تلقائيًا مع نمو البيانات الحقيقية بدون أي تعديل يدوي.
const LEVELS = {
  new:    { slug: "new",    label: "جديد",  icon: "fa-seedling" },
  pro:    { slug: "pro",    label: "محترف", icon: "fa-thumbs-up" },
  expert: { slug: "expert", label: "خبير",  icon: "fa-medal" },
  elite:  { slug: "elite",  label: "نخبة",  icon: "fa-crown" }
};

function computeWorkerLevel(signals) {
  const s = signals || {};
  const avgRating = Number(s.rating_average || 0);
  const reviewCount = Number(s.review_count || 0);
  const completedCount = Number(s.completed_count || 0);
  const totalRequests = Number(s.total_requests || 0);
  const cancelledCount = Number(s.cancelled_count || 0);
  // نسبة الإلغاء بتُحسب بس لو فيه عينة كافية (3 طلبات على الأقل) عشان
  // إلغاء واحد لصنايعي جديد ميبقاش مؤشر حقيقي
  const cancellationRate = totalRequests >= 3 ? cancelledCount / totalRequests : 0;

  let level = LEVELS.new;
  if ((reviewCount >= 6 && avgRating >= 4.8) || completedCount >= 6) level = LEVELS.elite;
  else if ((reviewCount >= 4 && avgRating >= 4.5) || completedCount >= 4) level = LEVELS.expert;
  else if ((reviewCount >= 1 && avgRating >= 4) || completedCount >= 1) level = LEVELS.pro;

  // نسبة إلغاء مرتفعة (أكتر من 30%) بتوقف الترقية لأعلى من "محترف" - حماية
  // بسيطة بدون نظام نقاط معقد
  if (cancellationRate > 0.3 && (level === LEVELS.expert || level === LEVELS.elite)) {
    level = LEVELS.pro;
  }
  return level;
}

// دالة لجلب التقييمات والإحصائيات من قاعدة البيانات وربطها بالصنايعية
async function attachSmartScoresToWorkers(workers) {
  const rows = Array.isArray(workers) ? workers : [];
  const ids = rows.map(w => w && w.id).filter(v => v !== undefined && v !== null);
  if (!ids.length) return rows;

  const idKeys = ids.map(v => String(v));
  const signalsById = {};
  idKeys.forEach(k => { signalsById[k] = { rating_sum: 0, review_count: 0, rating_average: 0, call: 0, whatsapp: 0, profile_view: 0, share: 0, completed_count: 0, cancelled_count: 0, total_requests: 0 }; });

  // 1. جلب التقييمات المعتمدة
  try {
    const { data: reviews, error: reviewsError } = await supabase
      .from("reviews")
      .select("worker_id,rating,approved")
      .in("worker_id", ids)
      .eq("approved", true)
      .limit(50000);

    if (!reviewsError) {
      (reviews || []).forEach(r => {
        const key = String(r.worker_id || "");
        if (!signalsById[key]) return;
        signalsById[key].rating_sum += Number(r.rating || 0);
        signalsById[key].review_count += 1;
      });
    }
  } catch (e) {}

  Object.values(signalsById).forEach(s => {
    s.rating_average = s.review_count ? s.rating_sum / s.review_count : 0;
  });

  // 2. جلب الإحصائيات (المكالمات والزيارات) لآخر 30 يوم
  try {
    const since = new Date(Date.now() - Number(process.env.SMART_SCORE_ANALYTICS_DAYS || 30) * 24 * 60 * 60 * 1000).toISOString();
    const { data: events, error: eventsError } = await supabase
      .from("analytics_events")
      .select("worker_id,event_type,created_at")
      .in("worker_id", idKeys)
      .gte("created_at", since)
      .limit(50000);

    if (!eventsError) {
      (events || []).forEach(ev => {
        const key = String(ev.worker_id || "");
        const type = String(ev.event_type || "");
        if (!signalsById[key]) return;
        if (["call", "whatsapp", "profile_view", "share"].includes(type)) {
          signalsById[key][type] = (signalsById[key][type] || 0) + 1;
        }
      });
    }
  } catch (e) {}

  // 3. جلب عدد الطلبات المكتملة/الملغاة لكل صنايعي (بند 17 - مستويات
  // الصنايعي) - نفس جدول الطلبات المستخدم في لوحة الصنايعي، بدون أي بيانات
  // شخصية للعميل
  try {
    const { data: requests, error: requestsError } = await supabase
      .from("service_requests")
      .select("worker_id,status")
      .in("worker_id", ids)
      .limit(50000);

    if (!requestsError) {
      (requests || []).forEach(r => {
        const key = String(r.worker_id || "");
        if (!signalsById[key]) return;
        signalsById[key].total_requests += 1;
        if (r.status === "completed") signalsById[key].completed_count += 1;
        if (r.status === "cancelled") signalsById[key].cancelled_count += 1;
      });
    }
  } catch (e) {}

  const scored = rows.map(w => {
    const signals = signalsById[String(w.id)] || {};
    const level = computeWorkerLevel(signals);
    return {
      ...w,
      ...smartScoreWorker(w, signals),
      level: level.slug,
      level_label: level.label,
      level_icon: level.icon
    };
  });

  // الترتيب النهائي للصنايعية
  scored.sort((a, b) => {
    const scoreDiff = Number(b.smart_score || 0) - Number(a.smart_score || 0);
    if (scoreDiff) return scoreDiff;
    const featuredDiff = (smartBool(b.featured) ? 1 : 0) - (smartBool(a.featured) ? 1 : 0);
    if (featuredDiff) return featuredDiff;
    const verifiedDiff = (smartBool(b.identity_verified) ? 1 : 0) - (smartBool(a.identity_verified) ? 1 : 0);
    if (verifiedDiff) return verifiedDiff;
    return smartDateMs(b.created_at) - smartDateMs(a.created_at);
  });

  scored.forEach((w, index) => { w.smart_rank = index + 1; });
  return scored;
}

module.exports = {
  smartScoreWorker,
  attachSmartScoresToWorkers,
  computeWorkerLevel
};