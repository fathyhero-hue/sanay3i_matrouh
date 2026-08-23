const express = require("express");
const router = express.Router();
const { supabase, isSupabaseReady } = require("../config/supabase");
const { requireCustomerAuth } = require("../middlewares/customerAuth");

// 1. جلب معرّفات الصنايعية المفضّلين للعميل الحالي فقط (محمي)
router.get("/", requireCustomerAuth, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const { data, error } = await supabase
      .from("customer_favorites")
      .select("worker_id")
      .eq("customer_id", req.customerId);
    if (error) throw error;
    res.json({ success: true, worker_ids: (data || []).map(r => r.worker_id) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || "تعذر جلب المفضلة" });
  }
});

// 2. إضافة صنايعي للمفضلة (محمي - customer_id بياخده السيرفر من التوكن، منع
// تكرار عن طريق Unique Constraint على (customer_id, worker_id))
router.post("/", requireCustomerAuth, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const workerId = Number(req.body?.worker_id);
    if (!Number.isInteger(workerId) || workerId <= 0) {
      return res.status(400).json({ success: false, error: "معرف الصنايعي مطلوب وغير صحيح" });
    }
    const { error } = await supabase
      .from("customer_favorites")
      .insert([{ customer_id: req.customerId, worker_id: workerId }]);
    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({ success: false, error: "الصنايعي ده في المفضلة بالفعل" });
      }
      throw error;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || "تعذر الإضافة للمفضلة" });
  }
});

// 3. حذف صنايعي من المفضلة (محمي - نفس العميل صاحب التوكن بس)
router.delete("/:workerId", requireCustomerAuth, async (req, res) => {
  if (!isSupabaseReady(res)) return;
  try {
    const workerId = Number(req.params.workerId);
    const { error } = await supabase
      .from("customer_favorites")
      .delete()
      .eq("customer_id", req.customerId)
      .eq("worker_id", workerId);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message || "تعذر الحذف من المفضلة" });
  }
});

module.exports = router;
