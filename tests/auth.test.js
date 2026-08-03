const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const {
  createAdminToken,
  getAdminFromRequest,
  requirePermission,
  createWorkerToken,
  verifyWorkerToken,
  requireWorkerOwnership
} = require("../api/middlewares/auth");

// عربة بسيطة تقلد req/res بتاعة Express من غير ما نشغّل سيرفر حقيقي
function fakeReq({ cookie, params, query, body, headers } = {}) {
  return {
    headers: Object.assign({}, headers, cookie ? { cookie } : {}),
    params: params || {},
    query: query || {},
    body: body || {}
  };
}

function fakeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  return res;
}

function withFrozenNow(ms, fn) {
  const original = Date.now;
  Date.now = () => ms;
  try { return fn(); } finally { Date.now = original; }
}

describe("admin token + requirePermission", () => {
  test("توكن الأدمن الصحيح بيرجع نفس بيانات المدير", () => {
    const token = createAdminToken({ id: 1, username: "boss", role: "super_admin" });
    const req = fakeReq({ cookie: `sanay3i_admin_token=${encodeURIComponent(token)}` });
    const admin = getAdminFromRequest(req);
    assert.equal(admin.username, "boss");
    assert.equal(admin.role, "super_admin");
  });

  test("توكن متلاعب فيه (تم التعديل عليه) لازم يترفض", () => {
    const token = createAdminToken({ id: 1, username: "boss", role: "super_admin" });
    const tampered = token + "x";
    const req = fakeReq({ cookie: `sanay3i_admin_token=${encodeURIComponent(tampered)}` });
    assert.equal(getAdminFromRequest(req), null);
  });

  test("توكن منتهي الصلاحية لازم يترفض", () => {
    const token = withFrozenNow(0, () => createAdminToken({ id: 1, username: "boss", role: "super_admin" }));
    const req = fakeReq({ cookie: `sanay3i_admin_token=${encodeURIComponent(token)}` });
    assert.equal(getAdminFromRequest(req), null);
  });

  test("requirePermission بيسمح لصاحب الصلاحية ويكمل للراوت", () => {
    const token = createAdminToken({ id: 1, username: "reviewer1", role: "reviewer" });
    const req = fakeReq({ cookie: `sanay3i_admin_token=${encodeURIComponent(token)}` });
    const res = fakeRes();
    let nextCalled = false;
    requirePermission("workers:review")(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.admin.role, "reviewer");
  });

  test("requirePermission بيرفض دور من غير الصلاحية المطلوبة (403)", () => {
    const token = createAdminToken({ id: 1, username: "viewer1", role: "viewer" });
    const req = fakeReq({ cookie: `sanay3i_admin_token=${encodeURIComponent(token)}` });
    const res = fakeRes();
    let nextCalled = false;
    requirePermission("workers:delete")(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
  });

  test("requirePermission بيرفض الطلب من غير كوكي خالص (401)", () => {
    const req = fakeReq({});
    const res = fakeRes();
    let nextCalled = false;
    requirePermission("workers:read")(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });
});

describe("worker session token + requireWorkerOwnership", () => {
  test("توكن الصنايعي الصحيح بيرجع نفس الـ id", () => {
    const token = createWorkerToken(42);
    assert.equal(verifyWorkerToken(token), 42);
  });

  test("توكن متلاعب فيه لازم يترفض", () => {
    const token = createWorkerToken(42);
    assert.equal(verifyWorkerToken(token + "x"), null);
  });

  test("توكن منتهي الصلاحية لازم يترفض", () => {
    const token = withFrozenNow(0, () => createWorkerToken(42));
    assert.equal(verifyWorkerToken(token), null);
  });

  test("توكن أدمن معاد استخدامه كتوكن صنايعي لازم يترفض (اختلاف الغرض/purpose)", () => {
    const adminToken = createAdminToken({ id: 1, username: "boss", role: "super_admin" });
    assert.equal(verifyWorkerToken(adminToken), null);
  });

  test("requireWorkerOwnership بيسمح لما التوكن يطابق :id في الرابط", () => {
    const token = createWorkerToken(7);
    const req = fakeReq({ headers: { authorization: `Bearer ${token}` }, params: { id: "7" } });
    const res = fakeRes();
    let nextCalled = false;
    requireWorkerOwnership(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(req.workerId, 7);
  });

  test("requireWorkerOwnership بيسمح لما التوكن يطابق worker_id في الـ query", () => {
    const token = createWorkerToken(7);
    const req = fakeReq({ headers: { authorization: `Bearer ${token}` }, query: { worker_id: "7" } });
    const res = fakeRes();
    let nextCalled = false;
    requireWorkerOwnership(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });

  test("requireWorkerOwnership بيرفض لو الـ id مش بتاع صاحب التوكن (401)", () => {
    const token = createWorkerToken(7);
    const req = fakeReq({ headers: { authorization: `Bearer ${token}` }, params: { id: "8" } });
    const res = fakeRes();
    let nextCalled = false;
    requireWorkerOwnership(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  test("requireWorkerOwnership بيرفض الطلب من غير توكن خالص (401)", () => {
    const req = fakeReq({ params: { id: "7" } });
    const res = fakeRes();
    let nextCalled = false;
    requireWorkerOwnership(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });
});
