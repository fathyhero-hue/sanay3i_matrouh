const { supabase } = require("../config/supabase");

// القيم الافتراضية لو الأدمن لسه ما ضبطش السعر من لوحة الإدارة
const DEFAULT_MONTHLY_PRICE = 100;
const DEFAULT_DISCOUNTS = { quarter: 5, half: 10, year: 15 }; // نسبة خصم %

const PLAN_MONTHS = { month: 1, quarter: 3, half: 6, year: 12 };

async function getSetting(key, fallback) {
  const { data } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (!data || data.value === null || data.value === undefined) return fallback;
  try {
    return JSON.parse(data.value);
  } catch {
    return fallback;
  }
}

async function setSetting(key, value) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key, value: JSON.stringify(value), updated_at: new Date().toISOString() });
  if (error) throw error;
}

// بيرجع سعر كل باقة بعد حساب الخصم من السعر الشهري
async function getSubscriptionPricing() {
  const monthly = await getSetting("subscription_price_monthly", DEFAULT_MONTHLY_PRICE);
  const discounts = await getSetting("subscription_discounts", DEFAULT_DISCOUNTS);

  const priceFor = (months, discountPercent) => {
    const full = monthly * months;
    const discounted = full * (1 - (Number(discountPercent) || 0) / 100);
    return Math.round(discounted);
  };

  return {
    monthly,
    discounts,
    plans: {
      month: { months: PLAN_MONTHS.month, price: monthly, discount: 0 },
      quarter: { months: PLAN_MONTHS.quarter, price: priceFor(PLAN_MONTHS.quarter, discounts.quarter), discount: discounts.quarter },
      half: { months: PLAN_MONTHS.half, price: priceFor(PLAN_MONTHS.half, discounts.half), discount: discounts.half },
      year: { months: PLAN_MONTHS.year, price: priceFor(PLAN_MONTHS.year, discounts.year), discount: discounts.year }
    }
  };
}

async function setSubscriptionPricing({ monthly, discounts }) {
  if (monthly !== undefined) await setSetting("subscription_price_monthly", Number(monthly));
  if (discounts !== undefined) {
    await setSetting("subscription_discounts", {
      quarter: Number(discounts.quarter) || 0,
      half: Number(discounts.half) || 0,
      year: Number(discounts.year) || 0
    });
  }
  return getSubscriptionPricing();
}

module.exports = {
  PLAN_MONTHS,
  getSubscriptionPricing,
  setSubscriptionPricing
};
