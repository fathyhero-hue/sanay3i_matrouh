const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { supabase } = require("../api/config/supabase");
const { createWorkerToken } = require("../api/middlewares/auth");
const { requireWorkerOwnership } = require("../api/middlewares/auth");
const {
  createServiceRequest,
  listMyRequests,
  submitServiceRequestReview,
  listWorkerRequests,
  updateServiceRequestStatus,
  withWorkerIdParam,
  ALLOWED_TRANSITIONS
} = require("../api/routes/serviceRequests");

function fakeReq({ body, params, query, headers, customerId } = {}) {
  return { body: body || {}, params: params || {}, query: query || {}, headers: headers || {}, customerId };
}

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

// بيقلد supabase.from(...).select().eq().order()... بدون سيرفر حقيقي: كل استدعاء
// لـ supabase.from() بياخد النتيجة التالية من الطابور (queue) بغض النظر عن السلسلة
// (chain) اللي بتتبنى فوقه، لأن كل الدوال المتسلسلة بترجع نفس الكائن، واللي بدوره
// "thenable" فبيتحل زي أي Promise عادي لما نعمله await.
function queueSupabaseFrom(results) {
  const queue = [...results];
  const original = supabase.from;
  supabase.from = () => {
    const result = queue.length ? queue.shift() : { data: null, error: null };
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      insert: () => builder,
      update: () => builder,
      limit: () => builder,
      single: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
    };
    return builder;
  };
  return () => { supabase.from = original; };
}

const validBody = {
  worker_id: 1,
  description: "تسريب مياه في المطبخ محتاج معاينة سريعة"
};

describe("ALLOWED_TRANSITIONS", () => {
  test("الانتقالات المسموحة مطابقة للمرحلة الأولى بالظبط", () => {
    assert.deepEqual(ALLOWED_TRANSITIONS, {
      new: ["accepted", "rejected"],
      accepted: ["in_progress"],
      in_progress: ["completed"]
    });
  });
});

describe("POST /api/service-requests (createServiceRequest) - محمي بـ requireCustomerAuth، الاسم/التليفون من الحساب الموثّق فقط", () => {
  test("إنشاء طلب صحيح: status دايمًا new، والاسم/التليفون من حساب العميل الموثّق مش من الـ body", async () => {
    const restore = queueSupabaseFrom([
      { data: { id: 1 }, error: null }, // الصنايعي موجود
      { data: { id: 1, name: "أحمد علي", phone: "01012345678" }, error: null }, // بيانات العميل الموثّق
      { data: { id: 10, worker_id: 1, customer_name: "أحمد علي", customer_phone: "01012345678", description: validBody.description, status: "new", created_at: "2026-08-20T00:00:00.000Z" }, error: null } // نتيجة الإدراج
    ]);
    try {
      // العميل بيحاول ينتحل اسم/رقم/status/تاريخ مختلف في الـ body - المفروض كله يتجاهل
      const req = fakeReq({
        body: { ...validBody, customer_name: "منتحل", customer_phone: "0100000000", status: "completed", accepted_at: "hacked" },
        customerId: 1
      });
      const res = fakeRes();
      await createServiceRequest(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.request.status, "new");
      assert.equal(res.body.request.customer_name, "أحمد علي");
      assert.equal(res.body.request.id, 10);
    } finally {
      restore();
    }
  });

  test("رفض worker_id غير موجود (404)", async () => {
    const restore = queueSupabaseFrom([
      { data: null, error: null } // مفيش صنايعي بالـ id ده
    ]);
    try {
      const req = fakeReq({ body: { ...validBody, worker_id: 999999 }, customerId: 1 });
      const res = fakeRes();
      await createServiceRequest(req, res);

      assert.equal(res.statusCode, 404);
      assert.equal(res.body.success, false);
    } finally {
      restore();
    }
  });

  test("رفض طلب من غير وصف (400) - مفيش نداء لقاعدة البيانات أصلاً", async () => {
    const req = fakeReq({ body: { ...validBody, description: "" }, customerId: 1 });
    const res = fakeRes();
    await createServiceRequest(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  });

  test("رفض worker_id غير رقم صحيح (400)", async () => {
    const req = fakeReq({ body: { ...validBody, worker_id: "abc" }, customerId: 1 });
    const res = fakeRes();
    await createServiceRequest(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  });
});

describe("GET /api/service-requests/mine (listMyRequests)", () => {
  test("بيرجع طلبات العميل الحالي فقط مع اسم/حرفة/منطقة الصنايعي وhas_review=false لما مفيش تقييم", async () => {
    const restore = queueSupabaseFrom([
      {
        data: [
          { id: 10, worker_id: 1, customer_id: 1, description: "تسريب مياه", status: "new", created_at: "2026-08-20T00:00:00.000Z", workers: { name: "محمد سيد", trade: "سباك", area: "مطروح" } }
        ],
        error: null
      },
      { data: [], error: null } // مفيش تقييمات لأي طلب من دول
    ]);
    try {
      const req = fakeReq({ customerId: 1 });
      const res = fakeRes();
      await listMyRequests(req, res);

      assert.equal(res.body.success, true);
      assert.equal(res.body.requests.length, 1);
      assert.equal(res.body.requests[0].worker_name, "محمد سيد");
      assert.equal(res.body.requests[0].worker_trade, "سباك");
      assert.equal(res.body.requests[0].has_review, false);
      assert.equal(res.body.requests[0].workers, undefined); // الكائن المتداخل الخام مايتسربش في الرد
    } finally {
      restore();
    }
  });

  test("has_review=true للطلب اللي ليه تقييم بالفعل", async () => {
    const restore = queueSupabaseFrom([
      {
        data: [
          { id: 20, worker_id: 1, customer_id: 1, description: "تركيب دش", status: "completed", created_at: "2026-08-20T00:00:00.000Z", workers: { name: "محمد سيد", trade: "سباك", area: "مطروح" } }
        ],
        error: null
      },
      { data: [{ service_request_id: 20 }], error: null }
    ]);
    try {
      const req = fakeReq({ customerId: 1 });
      const res = fakeRes();
      await listMyRequests(req, res);

      assert.equal(res.body.requests[0].has_review, true);
    } finally {
      restore();
    }
  });
});

describe("POST /api/service-requests/:id/review (submitServiceRequestReview)", () => {
  test("تقييم صحيح لطلب مكتمل يخص العميل - worker_id/customer_name من الطلب مش من الـ body", async () => {
    const restore = queueSupabaseFrom([
      { data: { id: 30, worker_id: 5, customer_id: 1, customer_name: "أحمد علي", status: "completed" }, error: null }, // جلب الطلب
      { data: null, error: null }, // مفيش تقييم سابق
      { data: { id: 99, worker_id: 5, service_request_id: 30, rating: 5, comment: "ممتاز", approved: false, created_at: "2026-08-20T00:00:00.000Z" }, error: null } // نتيجة الإدراج
    ]);
    try {
      const req = fakeReq({
        params: { id: "30" },
        body: { rating: 5, comment: "ممتاز", worker_id: 999, customer_name: "منتحل" }, // محاولة تزوير - المفروض تتجاهل
        customerId: 1
      });
      const res = fakeRes();
      await submitServiceRequestReview(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.review.worker_id, 5);
      assert.equal(res.body.review.service_request_id, 30);
    } finally {
      restore();
    }
  });

  test("رفض تقييم رقم غير صحيح (400) - مفيش نداء لقاعدة البيانات", async () => {
    const req = fakeReq({ params: { id: "30" }, body: { rating: 6 }, customerId: 1 });
    const res = fakeRes();
    await submitServiceRequestReview(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  });

  test("رفض تقييم طلب لا يخص العميل الحالي (403)", async () => {
    const restore = queueSupabaseFrom([
      { data: { id: 30, worker_id: 5, customer_id: 1, customer_name: "أحمد علي", status: "completed" }, error: null }
    ]);
    try {
      const req = fakeReq({ params: { id: "30" }, body: { rating: 5 }, customerId: 2 }); // عميل تاني
      const res = fakeRes();
      await submitServiceRequestReview(req, res);

      assert.equal(res.statusCode, 403);
      assert.equal(res.body.success, false);
    } finally {
      restore();
    }
  });

  test("رفض تقييم طلب لسه مش completed (400)", async () => {
    const restore = queueSupabaseFrom([
      { data: { id: 30, worker_id: 5, customer_id: 1, customer_name: "أحمد علي", status: "in_progress" }, error: null }
    ]);
    try {
      const req = fakeReq({ params: { id: "30" }, body: { rating: 5 }, customerId: 1 });
      const res = fakeRes();
      await submitServiceRequestReview(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
    } finally {
      restore();
    }
  });

  test("رفض تقييم مكرر لنفس الطلب (409)", async () => {
    const restore = queueSupabaseFrom([
      { data: { id: 30, worker_id: 5, customer_id: 1, customer_name: "أحمد علي", status: "completed" }, error: null },
      { data: { id: 77 }, error: null } // فيه تقييم سابق بالفعل
    ]);
    try {
      const req = fakeReq({ params: { id: "30" }, body: { rating: 4 }, customerId: 1 });
      const res = fakeRes();
      await submitServiceRequestReview(req, res);

      assert.equal(res.statusCode, 409);
      assert.equal(res.body.success, false);
    } finally {
      restore();
    }
  });

  test("رفض طلب غير موجود (404)", async () => {
    const restore = queueSupabaseFrom([
      { data: null, error: null }
    ]);
    try {
      const req = fakeReq({ params: { id: "999" }, body: { rating: 5 }, customerId: 1 });
      const res = fakeRes();
      await submitServiceRequestReview(req, res);

      assert.equal(res.statusCode, 404);
      assert.equal(res.body.success, false);
    } finally {
      restore();
    }
  });
});

describe("GET /api/service-requests/worker/:workerId - حماية الملكية", () => {
  test("منع صنايعي من قراءة طلبات صنايعي آخر (401)", () => {
    const token = createWorkerToken(7);
    const req = fakeReq({ params: { workerId: "8" }, headers: { authorization: `Bearer ${token}` } });
    const res = fakeRes();

    withWorkerIdParam(req, res, () => {});
    let nextCalled = false;
    requireWorkerOwnership(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  test("السماح للصنايعي بقراءة طلباته هو نفسه", async () => {
    const token = createWorkerToken(7);
    const req = fakeReq({ params: { workerId: "7" }, headers: { authorization: `Bearer ${token}` } });
    const res = fakeRes();

    withWorkerIdParam(req, res, () => {});
    let nextCalled = false;
    requireWorkerOwnership(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    const restore = queueSupabaseFrom([
      { data: [{ id: 10, worker_id: 7, status: "new" }], error: null }
    ]);
    try {
      await listWorkerRequests(req, res);
      assert.equal(res.body.success, true);
      assert.equal(res.body.requests.length, 1);
    } finally {
      restore();
    }
  });
});

describe("PATCH /api/service-requests/:id/status", () => {
  test("انتقال صحيح new -> accepted بيسجل accepted_at", async () => {
    const token = createWorkerToken(1);
    const restore = queueSupabaseFrom([
      { data: { id: 5, worker_id: 1, status: "new" }, error: null },
      { data: { id: 5, worker_id: 1, status: "accepted", accepted_at: "2026-08-20T00:00:00.000Z" }, error: null }
    ]);
    try {
      const req = fakeReq({ params: { id: "5" }, headers: { authorization: `Bearer ${token}` }, body: { status: "accepted" } });
      const res = fakeRes();
      await updateServiceRequestStatus(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.request.status, "accepted");
      assert.ok(res.body.request.accepted_at);
    } finally {
      restore();
    }
  });

  test("انتقال صحيح accepted -> in_progress", async () => {
    const token = createWorkerToken(1);
    const restore = queueSupabaseFrom([
      { data: { id: 5, worker_id: 1, status: "accepted" }, error: null },
      { data: { id: 5, worker_id: 1, status: "in_progress" }, error: null }
    ]);
    try {
      const req = fakeReq({ params: { id: "5" }, headers: { authorization: `Bearer ${token}` }, body: { status: "in_progress" } });
      const res = fakeRes();
      await updateServiceRequestStatus(req, res);

      assert.equal(res.body.request.status, "in_progress");
    } finally {
      restore();
    }
  });

  test("انتقال صحيح in_progress -> completed بيسجل completed_at", async () => {
    const token = createWorkerToken(1);
    const restore = queueSupabaseFrom([
      { data: { id: 5, worker_id: 1, status: "in_progress" }, error: null },
      { data: { id: 5, worker_id: 1, status: "completed", completed_at: "2026-08-20T00:00:00.000Z" }, error: null }
    ]);
    try {
      const req = fakeReq({ params: { id: "5" }, headers: { authorization: `Bearer ${token}` }, body: { status: "completed" } });
      const res = fakeRes();
      await updateServiceRequestStatus(req, res);

      assert.equal(res.body.request.status, "completed");
      assert.ok(res.body.request.completed_at);
    } finally {
      restore();
    }
  });

  test("انتقال صحيح new -> rejected مع سبب", async () => {
    const token = createWorkerToken(1);
    const restore = queueSupabaseFrom([
      { data: { id: 5, worker_id: 1, status: "new" }, error: null },
      { data: { id: 5, worker_id: 1, status: "rejected", rejected_reason: "مشغول" }, error: null }
    ]);
    try {
      const req = fakeReq({ params: { id: "5" }, headers: { authorization: `Bearer ${token}` }, body: { status: "rejected", rejected_reason: "مشغول" } });
      const res = fakeRes();
      await updateServiceRequestStatus(req, res);

      assert.equal(res.body.request.status, "rejected");
      assert.equal(res.body.request.rejected_reason, "مشغول");
    } finally {
      restore();
    }
  });

  test("رفض transition غير صحيح new -> completed (400) - من غير أي نداء update", async () => {
    const token = createWorkerToken(1);
    const restore = queueSupabaseFrom([
      { data: { id: 5, worker_id: 1, status: "new" }, error: null }
    ]);
    try {
      const req = fakeReq({ params: { id: "5" }, headers: { authorization: `Bearer ${token}` }, body: { status: "completed" } });
      const res = fakeRes();
      await updateServiceRequestStatus(req, res);

      assert.equal(res.statusCode, 400);
      assert.equal(res.body.success, false);
    } finally {
      restore();
    }
  });

  test("رفض تحديث حالة طلب صنايعي تاني (403)", async () => {
    const token = createWorkerToken(2); // صاحب التوكن مش صاحب الطلب
    const restore = queueSupabaseFrom([
      { data: { id: 5, worker_id: 1, status: "new" }, error: null }
    ]);
    try {
      const req = fakeReq({ params: { id: "5" }, headers: { authorization: `Bearer ${token}` }, body: { status: "accepted" } });
      const res = fakeRes();
      await updateServiceRequestStatus(req, res);

      assert.equal(res.statusCode, 403);
      assert.equal(res.body.success, false);
    } finally {
      restore();
    }
  });

  test("رفض الطلب من غير توكن خالص (401)", async () => {
    const req = fakeReq({ params: { id: "5" }, body: { status: "accepted" } });
    const res = fakeRes();
    await updateServiceRequestStatus(req, res);

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.success, false);
  });
});
