const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  hashCustomerPassword,
  verifyCustomerPassword,
  createCustomerToken,
  verifyCustomerToken,
  requireCustomerAuth
} = require("../api/middlewares/customerAuth");
const { createWorkerToken, createAdminToken, requireWorkerOwnership, requirePermission } = require("../api/middlewares/auth");

function fakeReq({ headers, body, query, params } = {}) {
  return { headers: headers || {}, body: body || {}, query: query || {}, params: params || {} };
}
function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

describe("hashCustomerPassword / verifyCustomerPassword", () => {
  test("كلمة مرور صحيحة بتتحقق بنجاح", () => {
    const hash = hashCustomerPassword("secret123");
    assert.equal(verifyCustomerPassword({ password_hash: hash }, "secret123"), true);
  });

  test("كلمة مرور غلط بترفض", () => {
    const hash = hashCustomerPassword("secret123");
    assert.equal(verifyCustomerPassword({ password_hash: hash }, "wrong-pass"), false);
  });

  test("نفس كلمة المرور بتنتج hash مختلف كل مرة (salt عشوائي)", () => {
    const h1 = hashCustomerPassword("secret123");
    const h2 = hashCustomerPassword("secret123");
    assert.notEqual(h1, h2);
  });
});

describe("createCustomerToken / verifyCustomerToken", () => {
  test("توكن عميل صحيح بيرجع نفس الـ id", () => {
    const token = createCustomerToken({ id: 5 });
    assert.equal(verifyCustomerToken(token), 5);
  });

  test("توكن متلاعب فيه لازم يترفض", () => {
    const token = createCustomerToken({ id: 5 });
    assert.equal(verifyCustomerToken(token + "x"), null);
  });

  test("توكن فاضي/مفقود لازم يترفض", () => {
    assert.equal(verifyCustomerToken(""), null);
    assert.equal(verifyCustomerToken(null), null);
  });

  test("توكن الصنايعي (نظام تاني بالكامل) لازم يترفض كتوكن عميل", () => {
    const workerToken = createWorkerToken(42);
    assert.equal(verifyCustomerToken(workerToken), null);
  });

  test("توكن الأدمن (نظام تاني بالكامل) لازم يترفض كتوكن عميل", () => {
    const adminToken = createAdminToken({ id: 1, username: "boss", role: "super_admin" });
    assert.equal(verifyCustomerToken(adminToken), null);
  });
});

describe("requireCustomerAuth", () => {
  test("بيسمح بتوكن عميل صحيح في Authorization header", () => {
    const token = createCustomerToken({ id: 9 });
    const req = fakeReq({ headers: { authorization: `Bearer ${token}` } });
    const res = fakeRes();
    let nextCalled = false;
    requireCustomerAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.customerId, 9);
  });

  test("بيرفض من غير توكن خالص (401)", () => {
    const req = fakeReq({});
    const res = fakeRes();
    let nextCalled = false;
    requireCustomerAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  test("بيرفض توكن صنايعي متستخدم مكان توكن عميل (401)", () => {
    const workerToken = createWorkerToken(3);
    const req = fakeReq({ headers: { authorization: `Bearer ${workerToken}` } });
    const res = fakeRes();
    let nextCalled = false;
    requireCustomerAuth(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });
});

describe("عزل التوكنات بين الأنظمة الثلاثة (عميل / صنايعي / أدمن)", () => {
  test("توكن العميل مايشتغلش مع requireWorkerOwnership (مسارات الصنايعي)", () => {
    const customerToken = createCustomerToken({ id: 3 });
    const req = fakeReq({ headers: { authorization: `Bearer ${customerToken}` }, params: { id: "3" } });
    const res = fakeRes();
    let nextCalled = false;
    requireWorkerOwnership(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  test("توكن الصنايعي مايشتغلش مع requirePermission (مسارات الأدمن) - محتاج كوكي أدمن مش Bearer token", () => {
    const workerToken = createWorkerToken(3);
    const req = fakeReq({ headers: { authorization: `Bearer ${workerToken}` } });
    const res = fakeRes();
    let nextCalled = false;
    requirePermission("workers:read")(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  test("توكن العميل مايشتغلش مع requirePermission (مسارات الأدمن)", () => {
    const customerToken = createCustomerToken({ id: 3 });
    const req = fakeReq({ headers: { authorization: `Bearer ${customerToken}` } });
    const res = fakeRes();
    let nextCalled = false;
    requirePermission("workers:read")(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  test("توكن الأدمن مايشتغلش مع requireWorkerOwnership (مسارات الصنايعي)", () => {
    const adminToken = createAdminToken({ id: 1, username: "boss", role: "super_admin" });
    const req = fakeReq({ headers: { authorization: `Bearer ${adminToken}` }, params: { id: "1" } });
    const res = fakeRes();
    let nextCalled = false;
    requireWorkerOwnership(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });
});
