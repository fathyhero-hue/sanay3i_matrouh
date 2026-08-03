const { test, describe } = require("node:test");
const assert = require("node:assert/strict");

const { createMemoryRateLimiter, createDbRateLimiter } = require("../api/middlewares/rateLimit");
const { supabase } = require("../api/config/supabase");

function fakeReq(ip) {
  return { headers: { "x-forwarded-for": ip }, socket: {} };
}

function fakeRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.body = payload; return res; };
  res.setHeader = (name, value) => { res.headers[name] = value; };
  return res;
}

describe("createMemoryRateLimiter", () => {
  test("بيسمح بالطلبات لحد الحد الأقصى وبعدين يرفض (429)", () => {
    const limiter = createMemoryRateLimiter({ windowMs: 60000, max: 3, keyFn: (req) => req.headers["x-forwarded-for"] });
    const ip = "1.1.1.1";
    let allowedCount = 0;
    for (let i = 0; i < 5; i++) {
      const res = fakeRes();
      let nextCalled = false;
      limiter(fakeReq(ip), res, () => { nextCalled = true; });
      if (nextCalled) allowedCount++;
      else assert.equal(res.statusCode, 429);
    }
    assert.equal(allowedCount, 3);
  });

  test("عداد IP مختلف مستقل تمامًا عن عداد IP التاني", () => {
    const limiter = createMemoryRateLimiter({ windowMs: 60000, max: 1, keyFn: (req) => req.headers["x-forwarded-for"] });
    const res1 = fakeRes();
    let next1 = false;
    limiter(fakeReq("2.2.2.2"), res1, () => { next1 = true; });
    assert.equal(next1, true);

    const res2 = fakeRes();
    let next2 = false;
    limiter(fakeReq("3.3.3.3"), res2, () => { next2 = true; });
    assert.equal(next2, true);
  });

  test("العداد بيتصفر بعد ما الفترة الزمنية تخلص", () => {
    const realNow = Date.now;
    try {
      let now = 1000000;
      Date.now = () => now;
      const limiter = createMemoryRateLimiter({ windowMs: 1000, max: 1, keyFn: (req) => req.headers["x-forwarded-for"] });
      const ip = "4.4.4.4";

      const res1 = fakeRes();
      let next1 = false;
      limiter(fakeReq(ip), res1, () => { next1 = true; });
      assert.equal(next1, true);

      const res2 = fakeRes();
      let next2 = false;
      limiter(fakeReq(ip), res2, () => { next2 = true; });
      assert.equal(next2, false);
      assert.equal(res2.statusCode, 429);

      now += 1001; // نتخطى الفترة الزمنية

      const res3 = fakeRes();
      let next3 = false;
      limiter(fakeReq(ip), res3, () => { next3 = true; });
      assert.equal(next3, true);
    } finally {
      Date.now = realNow;
    }
  });
});

describe("createDbRateLimiter", () => {
  test("لما rl_hit يرجّع allowed=true بيكمل للراوت", async () => {
    const originalRpc = supabase.rpc;
    supabase.rpc = async () => ({ data: [{ allowed: true, remaining: 4 }], error: null });
    try {
      const limiter = createDbRateLimiter({ windowMs: 60000, max: 5, keyFn: (req) => req.headers["x-forwarded-for"], prefix: "test" });
      const res = fakeRes();
      let nextCalled = false;
      await limiter(fakeReq("5.5.5.5"), res, () => { nextCalled = true; });
      assert.equal(nextCalled, true);
      assert.equal(res.headers["X-RateLimit-Remaining"], "4");
    } finally {
      supabase.rpc = originalRpc;
    }
  });

  test("لما rl_hit يرجّع allowed=false بيرفض بـ 429", async () => {
    const originalRpc = supabase.rpc;
    supabase.rpc = async () => ({ data: [{ allowed: false, remaining: 0 }], error: null });
    try {
      const limiter = createDbRateLimiter({ windowMs: 60000, max: 5, keyFn: (req) => req.headers["x-forwarded-for"], prefix: "test" });
      const res = fakeRes();
      let nextCalled = false;
      await limiter(fakeReq("6.6.6.6"), res, () => { nextCalled = true; });
      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 429);
    } finally {
      supabase.rpc = originalRpc;
    }
  });

  test("لو Supabase مش متاحة (rl_hit بترمي خطأ)، بيرجع تلقائيًا لحماية الذاكرة وبيفضل يشتغل صح", async () => {
    const originalRpc = supabase.rpc;
    supabase.rpc = async () => { throw new Error("simulated connection failure"); };
    try {
      const limiter = createDbRateLimiter({ windowMs: 60000, max: 2, keyFn: (req) => req.headers["x-forwarded-for"], prefix: "test" });
      const ip = "7.7.7.7";
      let allowedCount = 0;
      for (let i = 0; i < 4; i++) {
        const res = fakeRes();
        let nextCalled = false;
        await limiter(fakeReq(ip), res, () => { nextCalled = true; });
        if (nextCalled) allowedCount++;
        else assert.equal(res.statusCode, 429);
      }
      assert.equal(allowedCount, 2);
    } finally {
      supabase.rpc = originalRpc;
    }
  });
});
