const crypto = require("crypto");

const PAYMOB_BASE_URL = process.env.PAYMOB_BASE_URL || "https://accept.paymob.com";
const PAYMOB_SECRET_KEY = process.env.PAYMOB_SECRET_KEY || "";
const PAYMOB_PUBLIC_KEY = process.env.PAYMOB_PUBLIC_KEY || "";
const PAYMOB_HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET || "";
const PAYMOB_CARD_INTEGRATION_ID = process.env.PAYMOB_CARD_INTEGRATION_ID || "";
const PAYMOB_WALLET_INTEGRATION_ID = process.env.PAYMOB_WALLET_INTEGRATION_ID || "";
const PAYMOB_INTENTION_EXPIRATION = Number(process.env.PAYMOB_INTENTION_EXPIRATION || 3600);
const PAYMOB_API_KEY = process.env.PAYMOB_API_KEY || ""; // مفتاح النظام القديم (Legacy) - للمحفظة الإلكترونية بس

function isPaymobReady() {
  return !!(PAYMOB_SECRET_KEY && PAYMOB_PUBLIC_KEY && PAYMOB_HMAC_SECRET);
}

function isWalletReady() {
  return !!(PAYMOB_API_KEY && PAYMOB_WALLET_INTEGRATION_ID);
}

function billingDataFor(worker) {
  const nameParts = String(worker?.name || "صنايعي").trim().split(/\s+/);
  const firstName = nameParts[0] || "صنايعي";
  const lastName = nameParts.slice(1).join(" ") || firstName;
  return {
    apartment: "NA",
    first_name: firstName,
    last_name: lastName,
    street: "NA",
    building: "NA",
    phone_number: worker?.phone || worker?.whatsapp || "01000000000",
    city: worker?.area || "مطروح",
    country: "EG",
    email: worker?.email || "no-reply@sanay3i-matrouh.online",
    floor: "NA",
    state: "NA"
  };
}

// إنشاء نية دفع عبر PayMob Intention API (Unified Checkout) - مستخدمة للبطاقة/الحساب
// البنكي بس (تكامل المحفظة بتاع حسابنا مُجهّز للنظام القديم، مش ده - شوف
// createWalletPayment تحت)
async function createPaymentIntention({ amountEgp, specialReference, worker, redirectionUrl, notificationUrl }) {
  if (!isPaymobReady()) throw new Error("PayMob غير مُهيّأ (متغيرات البيئة مفقودة)");
  if (!PAYMOB_CARD_INTEGRATION_ID) throw new Error("مفيش integration id للبطاقة مفعّل");

  const body = {
    amount: Math.round(Number(amountEgp) * 100), // بالقرش
    currency: "EGP",
    payment_methods: [Number(PAYMOB_CARD_INTEGRATION_ID)],
    expiration: PAYMOB_INTENTION_EXPIRATION,
    items: [],
    billing_data: billingDataFor(worker),
    special_reference: specialReference,
    notification_url: notificationUrl,
    redirection_url: redirectionUrl
  };

  const resp = await fetch(`${PAYMOB_BASE_URL}/v1/intention/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Token ${PAYMOB_SECRET_KEY}`
    },
    body: JSON.stringify(body)
  });

  const data = await resp.json();
  if (!resp.ok || !data.client_secret) {
    throw new Error(`فشل إنشاء نية الدفع في PayMob: ${JSON.stringify(data)}`);
  }

  return {
    intentionId: data.id || data.intention_id || null,
    clientSecret: data.client_secret,
    checkoutUrl: `${PAYMOB_BASE_URL}/unifiedcheckout/?publicKey=${encodeURIComponent(PAYMOB_PUBLIC_KEY)}&clientSecret=${encodeURIComponent(data.client_secret)}`
  };
}

// دفع بالمحفظة الإلكترونية عبر النظام القديم (Direct Mobile Wallet API) - 3
// خطوات: Auth token -> Order -> Payment key -> طلب الدفع اللي بيبعت OTP/إشعار
// على رقم المحفظة مباشرة
async function createWalletPayment({ amountEgp, specialReference, worker, walletPhone }) {
  if (!isWalletReady()) throw new Error("خدمة الدفع بالمحفظة غير متاحة حاليًا");

  const amountCents = Math.round(Number(amountEgp) * 100);

  const authResp = await fetch(`${PAYMOB_BASE_URL}/api/auth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: PAYMOB_API_KEY })
  });
  const authData = await authResp.json();
  if (!authResp.ok || !authData.token) throw new Error(`فشل التحقق من PayMob: ${JSON.stringify(authData)}`);
  const authToken = authData.token;

  const orderResp = await fetch(`${PAYMOB_BASE_URL}/api/ecommerce/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: authToken,
      delivery_needed: false,
      amount_cents: amountCents,
      currency: "EGP",
      merchant_order_id: specialReference,
      items: []
    })
  });
  const orderData = await orderResp.json();
  if (!orderResp.ok || !orderData.id) throw new Error(`فشل إنشاء الطلب في PayMob: ${JSON.stringify(orderData)}`);

  const keyResp = await fetch(`${PAYMOB_BASE_URL}/api/acceptance/payment_keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: PAYMOB_INTENTION_EXPIRATION,
      order_id: orderData.id,
      billing_data: billingDataFor(worker),
      currency: "EGP",
      integration_id: Number(PAYMOB_WALLET_INTEGRATION_ID)
    })
  });
  const keyData = await keyResp.json();
  if (!keyResp.ok || !keyData.token) throw new Error(`فشل تجهيز مفتاح الدفع في PayMob: ${JSON.stringify(keyData)}`);

  const payResp = await fetch(`${PAYMOB_BASE_URL}/api/acceptance/payments/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: { identifier: walletPhone, subtype: "WALLET" },
      payment_token: keyData.token
    })
  });
  const payData = await payResp.json();
  if (!payResp.ok) throw new Error(`فشل طلب الدفع بالمحفظة: ${JSON.stringify(payData)}`);

  return {
    redirectUrl: payData.redirect_url || payData.iframe_redirection_url || null,
    pending: !!payData.pending,
    raw: payData
  };
}

// ترتيب الحقول الموثّق من PayMob لحساب HMAC بتاع Transaction Callback -
// أي تغيير في الترتيب أو الحقول بيخلي التوقيع غلط تمامًا
const HMAC_FIELDS = [
  "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction",
  "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded",
  "is_standalone_payment", "is_voided", "order.id", "owner", "pending",
  "source_data.pan", "source_data.sub_type", "source_data.type", "success"
];

function getPath(obj, path) {
  return path.split(".").reduce((v, k) => (v == null ? v : v[k]), obj);
}

// التحقق من إن الـ webhook فعلاً جاي من PayMob ومحتواه ما اتغيرش في الطريق
function verifyWebhookHmac(transactionObj, receivedHmac) {
  if (!PAYMOB_HMAC_SECRET || !receivedHmac) return false;
  const concatenated = HMAC_FIELDS.map(f => {
    const v = getPath(transactionObj, f);
    return v === undefined || v === null ? "" : String(v);
  }).join("");

  const computed = crypto.createHmac("sha512", PAYMOB_HMAC_SECRET).update(concatenated).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(String(receivedHmac), "hex"));
  } catch {
    return false;
  }
}

module.exports = {
  isPaymobReady,
  isWalletReady,
  createPaymentIntention,
  createWalletPayment,
  verifyWebhookHmac
};
