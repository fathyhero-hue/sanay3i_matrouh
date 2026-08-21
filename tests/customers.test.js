const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { supabase } = require("../api/config/supabase");
const { hashCustomerPassword } = require("../api/middlewares/customerAuth");
const { registerCustomer, loginCustomer, getMe, identifyCustomer } = require("../api/routes/customers");

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
      update: () => builder,
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

  test("رفض رقم هاتف مسجل بالفعل بكلمة مرور حقيقية (409)", async () => {
    const restore = queueSupabaseFrom([
      { data: { id: 1, password_set: true }, error: null } // فيه حساب حقيقي مسجل بكلمة مرور بالفعل
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

  test("حساب اتعمل بالبوابة البسيطة (password_set=false) بيترقّى بدل ما يترفض كمكرر", async () => {
    const restore = queueSupabaseFrom([
      { data: { id: 5, password_set: false }, error: null }, // حساب بوابة قديم من غير كلمة مرور حقيقية
      { data: { id: 5, name: "سارة أحمد", phone: "01099998888" }, error: null } // نتيجة الترقية (update)
    ]);
    try {
      const req = fakeReq({ body: { name: "سارة أحمد", phone: "01099998888", password: "secret123" } });
      const res = fakeRes();
      await registerCustomer(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.customer.id, 5); // نفس الـ id القديم اتحافظ عليه
      assert.ok(res.body.token);
    } finally {
      restore();
    }
  });
});

describe("POST /api/customers/identify (تسجيل بسيط اسم + رقم بس)", () => {
  test("رقم جديد بيتعمله حساب وبيرجع توكن", async () => {
    const restore = queueSupabaseFrom([
      { data: null, error: null }, // مفيش حساب بالرقم ده
      { data: { id: 10, name: "زائر", phone: "01011112222" }, error: null } // نتيجة الإدراج
    ]);
    try {
      const req = fakeReq({ body: { name: "زائر", phone: "01011112222" } });
      const res = fakeRes();
      await identifyCustomer(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.token);
    } finally {
      restore();
    }
  });

  test("رقم اتعمل بالبوابة قبل كده (password_set=false) بيرجع نفس الحساب من غير ما يعمل واحد جديد", async () => {
    const restore = queueSupabaseFrom([
      { data: { id: 10, name: "زائر", phone: "01011112222", password_set: false }, error: null }
    ]);
    try {
      const req = fakeReq({ body: { name: "زائر تاني", phone: "01011112222" } });
      const res = fakeRes();
      await identifyCustomer(req, res);

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.customer.id, 10);
    } finally {
      restore();
    }
  });

  test("رفض انتحال رقم بحساب محمي بكلمة مرور حقيقية (409) - من غير أي نداء إدراج", async () => {
    const restore = queueSupabaseFrom([
      { data: { id: 1, name: "أحمد", phone: "01099998888", password_set: true }, error: null }
    ]);
    try {
      const req = fakeReq({ body: { name: "محاولة انتحال", phone: "01099998888" } });
      const res = fakeRes();
      await identifyCustomer(req, res);

      assert.equal(res.statusCode, 409);
      assert.equal(res.body.success, false);
      assert.equal(res.body.requires_login, true);
    } finally {
      restore();
    }
  });

  test("رفض اسم أو رقم غير صحيح (400)", async () => {
    const req = fakeReq({ body: { name: "", phone: "01011112222" } });
    const res = fakeRes();
    await identifyCustomer(req, res);

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
