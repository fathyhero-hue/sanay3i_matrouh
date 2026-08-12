const express = require("express");
const router = express.Router();
const { supabase } = require("../config/supabase");
const { requirePermission } = require("../middlewares/auth");
const { bool, today } = require("../utils/helpers");

// ==========================================
// 1. الحرف والمناطق (Trades & Areas)
// ==========================================
router.get("/trades", async (req, res) => {
  const { data } = await supabase.from("trades").select("*").order("id", { ascending: false });
  // بيانات عامة نادرًا ما تتغير؛ نسمح لكاش CDN قصير مع تحديث بالخلفية.
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.json(data || []);
});
router.post("/trades", requirePermission("settings:manage"), async (req, res) => {
  const name = req.body.name || req.body.trade;
  const { data } = await supabase.from("trades").insert({ name: String(name).trim() }).select().single();
  res.json({ success: true, id: data?.id, name: data?.name });
});
router.delete("/trades/:id", requirePermission("settings:manage"), async (req, res) => {
  await supabase.from("trades").delete().eq("id", Number(req.params.id));
  res.json({ success: true });
});

router.get("/areas", async (req, res) => {
  const { data } = await supabase.from("areas").select("*").order("id", { ascending: false });
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  res.json(data || []);
});
router.post("/areas", requirePermission("settings:manage"), async (req, res) => {
  const name = req.body.name || req.body.area;
  const { data } = await supabase.from("areas").insert({ name: String(name).trim() }).select().single();
  res.json({ success: true, id: data?.id, name: data?.name });
});
router.delete("/areas/:id", requirePermission("settings:manage"), async (req, res) => {
  await supabase.from("areas").delete().eq("id", Number(req.params.id));
  res.json({ success: true });
});

// ==========================================
// 2. جلب وعرض بيانات الإدارة للصنايعية
// ==========================================
router.get("/admin/workers", requirePermission("workers:read"), async (req, res) => {
  const { data } = await supabase.from("workers").select("*").order("id", { ascending: false }).limit(2000);
  res.json(data || []);
});

// دوال التحكم السريع في الصنايعية (تفعيل، موافقة، تمييز)
async function setBool(req, res, col) {
  const value = bool(req.body[col]);
  const updates = { [col]: value };
  if (col === "approved" && value) {
    updates.identity_status = "verified";
    updates.identity_verified = true;
  }
  await supabase.from("workers").update(updates).eq("id", Number(req.params.id));
  res.json({ success: true });
}

router.put("/workers/:id/approve", requirePermission("workers:review"), (req, res) => setBool(req, res, "approved"));
router.put("/workers/:id/featured", requirePermission("workers:update"), (req, res) => setBool(req, res, "featured"));

// ==========================================
// 3. التقييمات وصور الأعمال
// ==========================================
router.get("/admin/reviews", requirePermission("workers:read"), async (req, res) => {
  const { data } = await supabase.from("reviews").select("*, workers(name, trade, area)").order("id", { ascending: false });
  res.json((data || []).map(r => ({ ...r, worker_name: r.workers?.name || "" })));
});

router.get("/workers/:id/reviews", async (req, res) => {
  const { data } = await supabase.from("reviews").select("*").eq("worker_id", Number(req.params.id)).eq("approved", true);
  res.json(data || []);
});

router.get("/workers/:id/reviews/summary", async (req, res) => {
  const { data } = await supabase.from("reviews").select("rating").eq("worker_id", Number(req.params.id)).eq("approved", true);
  const count = (data || []).length;
  const sum = (data || []).reduce((a, r) => a + Number(r.rating || 0), 0);
  res.json({ count, average: count ? Math.round((sum / count) * 10) / 10 : 0 });
});

router.post("/workers/:id/reviews", async (req, res) => {
  await supabase.from("reviews").insert({ 
    worker_id: Number(req.params.id), 
    customer_name: String(req.body.customer_name || "عميل").trim(), 
    rating: Number(req.body.rating), 
    comment: String(req.body.comment || "").trim(), 
    approved: false 
  });
  res.json({ success: true });
});

router.put("/reviews/:id/approve", requirePermission("reviews:review"), async (req, res) => {
  await supabase.from("reviews").update({ approved: bool(req.body.approved) }).eq("id", Number(req.params.id));
  res.json({ success: true });
});

router.delete("/reviews/:id", requirePermission("reviews:review"), async (req, res) => {
  await supabase.from("reviews").delete().eq("id", Number(req.params.id));
  res.json({ success: true });
});

router.get("/workers/:id/photos", async (req, res) => {
  const { data } = await supabase.from("worker_photos").select("*").eq("worker_id", Number(req.params.id));
  res.json(data || []);
});

router.delete("/workers/photos/:photoId", requirePermission("workers:update"), async (req, res) => {
  await supabase.from("worker_photos").delete().eq("id", Number(req.params.photoId));
  res.json({ success: true });
});

module.exports = router;
