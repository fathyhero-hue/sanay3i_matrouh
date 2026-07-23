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

// دالة لجلب التقييمات والإحصائيات من قاعدة البيانات وربطها بالصنايعية
async function attachSmartScoresToWorkers(workers) {
  const rows = Array.isArray(workers) ? workers : [];
  const ids = rows.map(w => w && w.id).filter(v => v !== undefined && v !== null);
  if (!ids.length) return rows;

  const idKeys = ids.map(v => String(v));
  const signalsById = {};
  idKeys.forEach(k => { signalsById[k] = { rating_sum: 0, review_count: 0, rating_average: 0, call: 0, whatsapp: 0, profile_view: 0, share: 0 }; });

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

  const scored = rows.map(w => ({
    ...w,
    ...smartScoreWorker(w, signalsById[String(w.id)] || {})
  }));

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
  attachSmartScoresToWorkers
};