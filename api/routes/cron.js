const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { supabase } = require("../config/supabase");
const mailer = require("../utils/mailer");

const REMINDER_THRESHOLDS = [7, 3, 0];

function isAuthorizedCronRequest(req) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret) return false;
  const header = String(req.headers["authorization"] || "");
  const expected = `Bearer ${secret}`;
  if (header.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

// يشتغل يوميًا (Vercel Cron) - بيبعت تذكير للصنايعية اللي اشتراكهم هيخلص خلال
// 7 أو 3 أو 0 يوم، ومش مبعوتلهم تذكير لنفس العتبة دي قبل كده في نفس الدورة
router.get("/subscription-reminders", async (req, res) => {
  if (!isAuthorizedCronRequest(req)) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }

  try {
    const { data: workers, error } = await supabase
      .from("workers")
      .select("id, name, email, subscription_end, last_subscription_reminder_days")
      .not("subscription_end", "is", null)
      .not("email", "is", null);
    if (error) throw error;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let sent = 0;
    for (const worker of workers || []) {
      const end = new Date(worker.subscription_end);
      end.setHours(0, 0, 0, 0);
      const daysLeft = Math.round((end - today) / 86400000);

      if (!REMINDER_THRESHOLDS.includes(daysLeft)) continue;
      if (worker.last_subscription_reminder_days === daysLeft) continue;

      const result = await mailer.sendSubscriptionReminderEmail(worker, daysLeft);
      if (result?.success) sent += 1;

      await supabase.from("workers").update({ last_subscription_reminder_days: daysLeft }).eq("id", worker.id);
    }

    res.json({ success: true, checked: (workers || []).length, sent });
  } catch (err) {
    console.error("Subscription Reminders Cron Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
