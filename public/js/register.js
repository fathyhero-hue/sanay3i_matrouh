const registerForm = document.getElementById("registerForm");
const resultBox = document.getElementById("resultBox");
const submitBtn = document.getElementById("submitBtn");
const formSteps = Array.from(document.querySelectorAll(".form-step"));
const stepPills = Array.from(document.querySelectorAll("[data-step-pill]"));
const prevStepBtn = document.getElementById("prevStepBtn");
const nextStepBtn = document.getElementById("nextStepBtn");
const stepCounter = document.getElementById("stepCounter");
let currentStep = 0;

const idFrontInput = document.getElementById("idFrontInput");
const idBackInput = document.getElementById("idBackInput");
const idFrontPreviewFrame = document.getElementById("idFrontPreviewFrame");
const idBackPreviewFrame = document.getElementById("idBackPreviewFrame");
const idFrontPreview = document.getElementById("idFrontPreview");
const idBackPreview = document.getElementById("idBackPreview");

let idFrontFile = null;
let idBackFile = null;
let idFrontPreviewUrl = "";
let idBackPreviewUrl = "";

function showResult(type, message) {
  if (!resultBox) return;
  resultBox.className = "result-box show " + type;
  resultBox.innerHTML = message;
}

function hideResult() {
  if (!resultBox) return;
  resultBox.className = "result-box";
  resultBox.innerHTML = "";
}

function scrollToRegisterPanel() {
  const panel = document.querySelector(".panel");
  if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function updateWizard() {
  formSteps.forEach((step, index) => {
    step.classList.toggle("active", index === currentStep);
  });

  stepPills.forEach((pill, index) => {
    pill.classList.toggle("active", index === currentStep);
    pill.classList.toggle("done", index < currentStep);
  });

  if (stepCounter) {
    stepCounter.textContent = "الخطوة " + (currentStep + 1) + " من " + formSteps.length;
  }

  if (prevStepBtn) {
    prevStepBtn.style.display = currentStep === 0 ? "none" : "inline-flex";
  }

  const isLast = currentStep === formSteps.length - 1;
  if (nextStepBtn) nextStepBtn.style.display = isLast ? "none" : "inline-flex";
  if (submitBtn) submitBtn.style.display = isLast ? "inline-flex" : "none";
}

function validateWizardStep(index) {
  hideResult();
  const name = document.getElementById("name")?.value.trim() || "";
  const phone = document.getElementById("phone")?.value.trim() || "";
  const password = document.getElementById("password")?.value.trim() || "";
  const trade = document.getElementById("trade")?.value.trim() || "";
  const area = document.getElementById("area")?.value.trim() || "";

  if (index === 0) {
    if (!name || !phone || !password) {
      showResult("error", "من فضلك املأ الاسم، رقم الاتصال، وكلمة المرور.");
      return false;
    }
    if (password.length < 6) {
      showResult("error", "كلمة المرور يجب ألا تقل عن 6 أحرف.");
      return false;
    }
  }

  if (index === 1) {
    if (!trade || !area) {
      showResult("error", "من فضلك اختر الحرفة والمنطقة.");
      return false;
    }
  }

  return true;
}

function goToStep(index, shouldScroll) {
  currentStep = Math.max(0, Math.min(index, formSteps.length - 1));
  updateWizard();
  if (shouldScroll) scrollToRegisterPanel();
}

function normalizeArray(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.data)) return data.data;
  if (data && Array.isArray(data.items)) return data.items;
  if (data && Array.isArray(data.trades)) return data.trades;
  if (data && Array.isArray(data.areas)) return data.areas;
  return [];
}

async function loadTrades() {
  const data = await fetchJson("/api/trades");
  const trades = normalizeArray(data);
  const select = document.getElementById("trade");
  if (!select) return;
  select.innerHTML = '<option value="">اختر الحرفة</option>';
  trades.forEach(item => {
    const name = item.name || item.trade || item.craft || item.title || item;
    if (!name) return;
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
}

async function loadAreas() {
  const data = await fetchJson("/api/areas");
  const areas = normalizeArray(data);
  const select = document.getElementById("area");
  if (!select) return;
  select.innerHTML = '<option value="">اختر المنطقة</option>';
  areas.forEach(item => {
    const name = item.name || item.area || item.location || item.title || item;
    if (!name) return;
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
}

function compressImage(file, maxWidth, maxHeight, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = function (event) {
      const img = new Image();
      img.src = event.target.result;
      img.onload = function () {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) { height = Math.round(height * maxWidth / width); width = maxWidth; }
        } else {
          if (height > maxHeight) { width = Math.round(width * maxHeight / height); height = maxHeight; }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality);
      };
      img.onerror = reject;
    };
    reader.onerror = reject;
  });
}

async function setIdPreview(side, file) {
  if (!file) return;
  if (!file.type || !file.type.startsWith("image/")) {
    showResult("error", "من فضلك ارفع صورة صحيحة للبطاقة.");
    return;
  }
  showResult("success", "جاري تهيئة وضغط الصورة...");
  try {
    const compressedBlob = await compressImage(file, 1200, 1200, 0.7);
    hideResult();
    if (side === "front") {
      idFrontFile = compressedBlob;
      if (idFrontPreviewUrl) URL.revokeObjectURL(idFrontPreviewUrl);
      idFrontPreviewUrl = URL.createObjectURL(compressedBlob);
      if (idFrontPreview) idFrontPreview.src = idFrontPreviewUrl;
      if (idFrontPreviewFrame) idFrontPreviewFrame.classList.add("show");
    } else {
      idBackFile = compressedBlob;
      if (idBackPreviewUrl) URL.revokeObjectURL(idBackPreviewUrl);
      idBackPreviewUrl = URL.createObjectURL(compressedBlob);
      if (idBackPreview) idBackPreview.src = idBackPreviewUrl;
      if (idBackPreviewFrame) idBackPreviewFrame.classList.add("show");
    }
  } catch (err) {
    showResult("error", "حدث خطأ أثناء معالجة الصورة.");
  }
}

if (idFrontInput) idFrontInput.addEventListener("change", (e) => setIdPreview("front", e.target.files[0]));
if (idBackInput) idBackInput.addEventListener("change", (e) => setIdPreview("back", e.target.files[0]));

if (nextStepBtn) {
  nextStepBtn.addEventListener("click", () => {
    if (!validateWizardStep(currentStep)) return;
    goToStep(currentStep + 1, true);
  });
}

if (prevStepBtn) {
  prevStepBtn.addEventListener("click", () => goToStep(currentStep - 1, true));
}

stepPills.forEach((pill, index) => {
  pill.addEventListener("click", () => {
    if (index <= currentStep) goToStep(index, true);
  });
});

if (registerForm) {
  registerForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    hideResult();

    const name = document.getElementById("name")?.value.trim() || "";
    const phone = document.getElementById("phone")?.value.trim() || "";
    const password = document.getElementById("password")?.value.trim() || "";
    const whatsapp = document.getElementById("whatsapp")?.value.trim() || "";
    const trade = document.getElementById("trade")?.value.trim() || "";
    const area = document.getElementById("area")?.value.trim() || "";
    const description = document.getElementById("description")?.value.trim() || "";

    if (!name || !phone || !password || !trade || !area) {
      showResult("error", "يرجى إكمال الحقول الأساسية وكلمة المرور والحرفة والمنطقة.");
      return;
    }

    if (!idFrontFile || !idBackFile) {
      showResult("error", "يجب رفع صورتي وجه وظهر البطاقة الشخصية لإتمام التسجيل.");
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("phone", phone);
    formData.append("password", password);
    formData.append("whatsapp", whatsapp);
    formData.append("trade", trade);
    formData.append("area", area);
    formData.append("description", description);
    formData.append("idFront", idFrontFile, "id-front.jpg");
    formData.append("idBack", idBackFile, "id-back.jpg");

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري إرسال الطلب...';
    }

    try {
      const response = await fetch("/api/register", { method: "POST", body: formData });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "تعذر إرسال الطلب");
      }

      const registrationCode = data.registration_code || "";
      showResult(
        "success",
        '<div class="success-card"><div class="success-card-title"><i class="fa-solid fa-circle-check"></i> تم إرسال طلبك بنجاح</div><div class="success-code-box"><small>رقم الطلب</small><strong>' + registrationCode + '</strong></div><p>يمكنك الآن تسجيل الدخول ببروفايلك بعد مراجعة الإدارة.</p><div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap"><a class="btn btn-primary" href="/status?code=' + encodeURIComponent(registrationCode) + '"><i class="fa-solid fa-clipboard-check"></i> متابعة الحالة</a><a class="btn btn-secondary" href="/"><i class="fa-solid fa-house"></i> الرئيسية</a></div></div>'
      );

      registerForm.reset();
      goToStep(0, false);
    } catch (error) {
      showResult("error", error.message || "حدث خطأ أثناء إرسال الطلب.");
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال طلب التسجيل';
    }
  });
}

loadTrades();
loadAreas();
updateWizard();