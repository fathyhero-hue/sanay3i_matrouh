const crypto = require("crypto");

const PAYMOB_BASE_URL = process.env.PAYMOB_BASE_URL || "https://accept.paymob.com";
const PAYMOB_SECRET_KEY = process.env.PAYMOB_SECRET_KEY || "";
const PAYMOB_PUBLIC_KEY = process.env.PAYMOB_PUBLIC_KEY || "";
const PAYMOB_HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET || "";
const PAYMOB_CARD_INTEGRATION_ID = process.env.PAYMOB_CARD_INTEGRATION_ID || "";
const PAYMOB_WALLET_INTEGRATION_ID = process.env.PAYMOB_WALLET_INTEGRATION_ID || "";
const PAYMOB_INTENTION_EXPIRATION = Number(process.env.PAYMOB_INTENTION_EXPIRATION || 3600);

function isPaymobReady() {
  return !!(PAYMOB_SECRET_KEY && PAYMOB_PUBLIC_KEY && PAYMOB_HMAC_SECRET);
}

function activeIntegrationIds() {
  return [PAYMOB_CARD_INTEGRATION_ID, PAYMOB_WALLET_INTEGRATION_ID]
    .filter(Boolean)
    .map(id => Number(id));
}

// إنشاء نية دفع عبر PayMob Intention API (Unified Checkout) - بتفعّل البطاقة
// والمحفظة الإلكترونية معًا في نداء واحد، والصنايعي بيختار طريقة الدفع بنفسه
// من صفحة PayMob الموحدة (إنستا باي بتظهر تلقائيًا لو مفعّلة على حساب التاجر)
async function createPaymentIntention({ amountEgp, specialReference, worker, redirectionUrl, notificationUrl }) {
  if (!isPaymobReady()) throw new Error("PayMob غير مُهيّأ (متغيرات البيئة مفقودة)");

  const integrationIds = activeIntegrationIds();
  if (!integrationIds.length) throw new Error("مفيش أي integration id مفعّل لـ PayMob");

  const nameParts = String(worker?.name || "صنايعي").trim().split(/\s+/);
  const firstName = nameParts[0] || "صنايعي";
  const lastName = nameParts.slice(1).join(" ") || firstName;

  const body = {
    amount: Math.round(Number(amountEgp) * 100), // بالقرش
    currency: "EGP",
    payment_methods: integrationIds,
    expiration: PAYMOB_INTENTION_EXPIRATION,
    items: [],
    billing_data: {
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
    },
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
  createPaymentIntention,
  verifyWebhookHmac
};
