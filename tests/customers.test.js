const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { supabase } = require("../api/config/supabase");
const { hashCustomerPassword } = require("../api/middlewares/customerAuth");
const { registerCustomer, loginCustomer, getMe } = require("../api/routes/customers");

function fakeReq({ body, headers, customerId } = {}) {
  return { body: body || {}, headers: headers || {}, query: {}, customerId };
}
function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

// نفس أسلوب الـ stub المستخدم في tests/serviceRequests.test.js: كل نداء
// supabase.from() بياخد النتيجة التالية من طابور جاهز مسبقًا، بغض النظر عن
// السلسلة (chain) اللي بتتبنى فوقه.
function queueSupabaseFrom(results) {
  const queue = [...results];
  const original = supabase.from;
  supabase.from = () => {
    const result = queue.length ? queue.shift() : { data: null, error: null };
    const builder = {
      select: () => builder,
      eq: () => builder,
      insert: () => builder,
      single: () => Promise.resolve(result),
      maybeSingle: () => Promise.resolve(result),
      then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
    };
    return builder;
  };
  return () => { supabase.from = original; };
}

describe("POST /api/customers/register", () => {
  test("تسجيل صحيح بيرجع customer + token", async () => {
    const restore = queueSupabaseFrom([
      { data: null, error: null }, // مفيش رقم مكرر
      { data: { id: 1, name: "سارة أحمد", phone: "01099998888" }, error: null } // نتيجة الإدراج
    ]);
    try {
      const req = fakeReq({ body: { name: "سارة أحمد", phone: "01099998888", password: "secret123" } });
      const res = fakeRes();
      await registerCustomer(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.customer.phone, "01099998888");
      assert.ok(res.body.token);
    } finally {
      restore();
    }
  });

  test("رفض رقم هاتف مسجل بالفعل (409)", async () => {
    const restore = queueSupabaseFrom([
      { data: { id: 1 }, error: null } // فيه رقم مكرر بالفعل
    ]);
    try {
      const req = fakeReq({ body: { name: "سارة أحمد", phone: "01099998888", password: "secret123" } });
      const res = fakeRes();
      await registerCustomer(req, res);

      assert.equal(res.statusCode, 409);
      assert.equal(res.body.success, false);
    } finally {
      restore();
    }
  });

  test("رفض كلمة مرور قصيرة (400) - من غير أي نداء لقاعدة البيانات", async () => {
    const req = fakeReq({ body: { name: "سارة أحمد", phone: "01099998888", password: "123" } });
    const res = fakeRes();
    await registerCustomer(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  });
});

describe("POST /api/customers/login", () => {
  test("دخول صحيح بيرجع customer + token", async () => {
    const passwordHash = hashCustomerPassword("secret123");
    const restore = queueSupabaseFrom([
      { data: { id: 1, name: "سارة أحمد", phone: "01099998888", password_hash: passwordHash }, error: null }
    ]);
    try {
      const req = fakeReq({ body: { phone: "01099998888", password: "secret123" } });
      const res = fakeRes();
      await loginCustomer(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.token);
      assert.equal(res.body.customer.password_hash, undefined); // مينفعش الـ hash يترجع في الرد
    } finally {
      restore();
    }
  });

  test("رفض كلمة مرور غلط (401)", async () => {
    const passwordHash = hashCustomerPassword("secret123");
    const restore = queueSupabaseFrom([
      { data: { id: 1, name: "سارة أحمد", phone: "01099998888", password_hash: passwordHash }, error: null }
    ]);
    try {
      const req = fakeReq({ body: { phone: "01099998888", password: "wrong-pass" } });
      const res = fakeRes();
      await loginCustomer(req, res);

      assert.equal(res.statusCode, 401);
      assert.equal(res.body.success, false);
    } finally {
      restore();
    }
  });

  test("رفض رقم هاتف غير مسجل (401) - نفس رسالة كلمة المرور الغلط عشان منسربش وجود الحساب", async () => {
    const restore = queueSupabaseFrom([
      { data: null, error: null }
    ]);
    try {
      const req = fakeReq({ body: { phone: "01000000000", password: "secret123" } });
      const res = fakeRes();
      await loginCustomer(req, res);

      assert.equal(res.statusCode, 401);
    } finally {
      restore();
    }
  });
});

describe("GET /api/customers/me", () => {
  test("بيرجع بيانات الحساب المرتبط بالتوكن", async () => {
    const restore = queueSupabaseFrom([
      { data: { id: 7, name: "محمد", phone: "01055554444", created_at: "2026-08-20T00:00:00.000Z" }, error: null }
    ]);
    try {
      const req = fakeReq({ customerId: 7 });
      const res = fakeRes();
      await getMe(req, res);

      assert.equal(res.body.success, true);
      assert.equal(res.body.customer.id, 7);
    } finally {
      restore();
    }
  });
});
