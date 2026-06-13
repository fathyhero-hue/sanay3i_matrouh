
    const registerForm = document.getElementById("registerForm");
    const resultBox = document.getElementById("resultBox");
    const submitBtn = document.getElementById("submitBtn");
    const formSteps = Array.from(document.querySelectorAll(".form-step"));
    const stepPills = Array.from(document.querySelectorAll("[data-step-pill]"));
    const prevStepBtn = document.getElementById("prevStepBtn");
    const nextStepBtn = document.getElementById("nextStepBtn");
    const stepCounter = document.getElementById("stepCounter");
    let currentStep = 0;


    const imageInput = document.getElementById("imageInput");
    const workImagesInput = document.getElementById("workImagesInput");
    const idFrontInput = document.getElementById("idFrontInput");
    const idBackInput = document.getElementById("idBackInput");
    const idFrontPreviewFrame = document.getElementById("idFrontPreviewFrame");
    const idBackPreviewFrame = document.getElementById("idBackPreviewFrame");
    const idFrontPreview = document.getElementById("idFrontPreview");
    const idBackPreview = document.getElementById("idBackPreview");

    const mainPreviewCard = document.getElementById("mainPreviewCard");
    const mainPreviewImage = document.getElementById("mainPreviewImage");
    const editMainImageBtn = document.getElementById("editMainImageBtn");
    const removeMainImageBtn = document.getElementById("removeMainImageBtn");

    const workPreviewGrid = document.getElementById("workPreviewGrid");

    const cropModal = document.getElementById("cropModal");
    const cropImage = document.getElementById("cropImage");
    const cropTitle = document.getElementById("cropTitle");
    const cropSubtitle = document.getElementById("cropSubtitle");
    const cropPreview = document.getElementById("cropPreview");
    const cropPreviewTitle = document.getElementById("cropPreviewTitle");
    const closeCropBtn = document.getElementById("closeCropBtn");

    const zoomInBtn = document.getElementById("zoomInBtn");
    const zoomOutBtn = document.getElementById("zoomOutBtn");
    const rotateBtn = document.getElementById("rotateBtn");
    const resetCropBtn = document.getElementById("resetCropBtn");
    const applyCropBtn = document.getElementById("applyCropBtn");
    const skipWorkCropBtn = document.getElementById("skipWorkCropBtn");

    const workCropCounter = document.getElementById("workCropCounter");
    const workCropCounterText = document.getElementById("workCropCounterText");

    let cropper = null;
    let currentCropMode = "main";
    let currentOriginalMainFile = null;
    let mainImageBlob = null;
    let mainImageUrl = "";

    let pendingWorkFiles = [];
    let currentWorkIndex = 0;
    let workImageBlobs = [];
    let workImageUrls = [];
    let idFrontFile = null;
    let idBackFile = null;
    let idFrontPreviewUrl = "";
    let idBackPreviewUrl = "";

    function showResult(type, message) {
      resultBox.className = "result-box show " + type;
      resultBox.innerHTML = message;
    }

    function hideResult() {
      resultBox.className = "result-box";
      resultBox.innerHTML = "";
    }

    function scrollToRegisterPanel() {
      const panel = document.querySelector(".panel");
      if (panel) {
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
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

      if (nextStepBtn) {
        nextStepBtn.style.display = isLast ? "none" : "inline-flex";
      }

      if (submitBtn) {
        submitBtn.style.display = isLast ? "inline-flex" : "none";
      }
    }

    function validateWizardStep(index) {
      hideResult();

      const name = document.getElementById("name").value.trim();
      const phone = document.getElementById("phone").value.trim();
      const trade = document.getElementById("trade").value.trim();
      const area = document.getElementById("area").value.trim();

      if (index === 0 && (!name || !phone)) {
        showResult("error", "من فضلك املأ الاسم ورقم الاتصال قبل الانتقال للخطوة التالية.");
        return false;
      }

      if (index === 1 && (!trade || !area)) {
        showResult("error", "من فضلك اختر الحرفة والمنطقة قبل الانتقال للخطوة التالية.");
        return false;
      }

      if (index === 2 && (!idFrontFile || !idBackFile)) {
        showResult("error", "لازم ترفع صورة البطاقة الشخصية وجه وظهر قبل الانتقال للخطوة التالية.");
        return false;
      }

      return true;
    }

    function goToStep(index, shouldScroll) {
      currentStep = Math.max(0, Math.min(index, formSteps.length - 1));
      updateWizard();
      if (shouldScroll) scrollToRegisterPanel();
    }

    function validateAllWizardSteps() {
      for (let i = 0; i < formSteps.length - 1; i++) {
        if (!validateWizardStep(i)) {
          goToStep(i, true);
          return false;
        }
      }
      return true;
    }

    function fetchJsonWithFallback(urls) {
      return new Promise(async (resolve) => {
        for (const url of urls) {
          try {
            const response = await fetch(url);
            if (response.ok) {
              resolve(await response.json());
              return;
            }
          } catch (error) {}
        }

        resolve([]);
      });
    }

    function normalizeArray(data) {
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.data)) return data.data;
      if (data && Array.isArray(data.items)) return data.items;
      if (data && Array.isArray(data.trades)) return data.trades;
      if (data && Array.isArray(data.crafts)) return data.crafts;
      if (data && Array.isArray(data.areas)) return data.areas;
      return [];
    }

    async function loadTrades() {
      const data = await fetchJsonWithFallback([
        "/api/trades",
        "/api/crafts",
        "/trades",
        "/crafts"
      ]);

      const trades = normalizeArray(data);
      const select = document.getElementById("trade");

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
      const data = await fetchJsonWithFallback([
        "/api/areas",
        "/api/locations",
        "/areas",
        "/locations"
      ]);

      const areas = normalizeArray(data);
      const select = document.getElementById("area");

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

    function openCropModal(file, mode) {
      if (!file) return;

      currentCropMode = mode;

      cropModal.classList.add("show");

      if (cropper) {
        cropper.destroy();
        cropper = null;
      }

      const fileUrl = URL.createObjectURL(file);
      cropImage.src = fileUrl;

      if (mode === "main") {
        cropTitle.textContent = "تعديل الصورة الأساسية";
        cropSubtitle.textContent = "اضبط الصورة لتظهر بشكل مناسب داخل كارت الصنايعي.";
        cropPreviewTitle.textContent = "معاينة صورة الكارت";
        cropPreview.classList.remove("work");
        workCropCounter.style.display = "none";
        skipWorkCropBtn.style.display = "none";
      } else {
        cropTitle.textContent = "تعديل صورة من صور الأعمال";
        cropSubtitle.textContent = "اضبط صورة العمل قبل إضافتها إلى معرض الصور.";
        cropPreviewTitle.textContent = "معاينة صورة العمل";
        cropPreview.classList.add("work");
        workCropCounter.style.display = "inline-flex";
        workCropCounterText.textContent = "صورة " + (currentWorkIndex + 1) + " من " + pendingWorkFiles.length;
        skipWorkCropBtn.style.display = "inline-flex";
      }

      cropImage.onload = function () {
        cropper = new Cropper(cropImage, {
          aspectRatio: mode === "main" ? 4 / 3 : 1,
          viewMode: 1,
          dragMode: "move",
          autoCropArea: 1,
          responsive: true,
          background: false,
          preview: "#cropPreview",
          movable: true,
          zoomable: true,
          rotatable: true,
          scalable: false
        });
      };
    }

    function closeCropModal() {
      cropModal.classList.remove("show");

      if (cropper) {
        cropper.destroy();
        cropper = null;
      }

      cropImage.src = "";
    }

    function blobToUrl(blob) {
      return URL.createObjectURL(blob);
    }

    function setMainImage(blob) {
      mainImageBlob = blob;

      if (mainImageUrl) {
        URL.revokeObjectURL(mainImageUrl);
      }

      mainImageUrl = blobToUrl(blob);
      mainPreviewImage.src = mainImageUrl;
      mainPreviewCard.classList.add("show");
    }

    function clearMainImage() {
      mainImageBlob = null;
      currentOriginalMainFile = null;
      imageInput.value = "";

      if (mainImageUrl) {
        URL.revokeObjectURL(mainImageUrl);
        mainImageUrl = "";
      }

      mainPreviewImage.src = "";
      mainPreviewCard.classList.remove("show");
    }

    function renderWorkPreview() {
      workPreviewGrid.innerHTML = "";

      if (!workImageBlobs.length) {
        workPreviewGrid.classList.remove("show");
        return;
      }

      workPreviewGrid.classList.add("show");

      workImageBlobs.forEach((blob, index) => {
        if (workImageUrls[index]) {
          URL.revokeObjectURL(workImageUrls[index]);
        }

        const url = blobToUrl(blob);
        workImageUrls[index] = url;

        const item = document.createElement("div");
        item.className = "work-photo-item";
        item.innerHTML = `
          <img src="${url}" alt="صورة عمل">
          <button type="button" onclick="removeWorkPhoto(${index})">
            <i class="fa-solid fa-xmark"></i>
          </button>
        `;

        workPreviewGrid.appendChild(item);
      });
    }

    function removeWorkPhoto(index) {
      workImageBlobs.splice(index, 1);

      if (workImageUrls[index]) {
        URL.revokeObjectURL(workImageUrls[index]);
      }

      workImageUrls.splice(index, 1);
      renderWorkPreview();
    }

    window.removeWorkPhoto = removeWorkPhoto;

    function processNextWorkImage() {
      if (currentWorkIndex >= pendingWorkFiles.length) {
        pendingWorkFiles = [];
        currentWorkIndex = 0;
        closeCropModal();
        renderWorkPreview();
        workImagesInput.value = "";
        return;
      }

      openCropModal(pendingWorkFiles[currentWorkIndex], "work");
    }

    function acceptCrop() {
      if (!cropper) return;

      const isMain = currentCropMode === "main";

      const canvas = cropper.getCroppedCanvas({
        width: isMain ? 1200 : 1000,
        height: isMain ? 900 : 1000,
        imageSmoothingEnabled: true,
        imageSmoothingQuality: "high"
      });

      canvas.toBlob(function (blob) {
        if (!blob) return;

        if (isMain) {
          setMainImage(blob);
          closeCropModal();
        } else {
          if (workImageBlobs.length >= 5) {
            showResult("error", "مسموح بحد أقصى 5 صور أعمال فقط.");
            closeCropModal();
            return;
          }

          workImageBlobs.push(blob);
          currentWorkIndex++;
          processNextWorkImage();
        }
      }, "image/jpeg", 0.92);
    }

    function skipCurrentWorkImage() {
      if (currentCropMode !== "work") return;

      currentWorkIndex++;
      processNextWorkImage();
    }

    function setIdPreview(side, file) {
      if (!file) return;
      if (!file.type || !file.type.startsWith("image/")) {
        showResult("error", "من فضلك ارفع صورة صحيحة للبطاقة.");
        return;
      }

      const isFront = side === "front";
      if (isFront) {
        idFrontFile = file;
        if (idFrontPreviewUrl) URL.revokeObjectURL(idFrontPreviewUrl);
        idFrontPreviewUrl = URL.createObjectURL(file);
        idFrontPreview.src = idFrontPreviewUrl;
        idFrontPreviewFrame.classList.add("show");
      } else {
        idBackFile = file;
        if (idBackPreviewUrl) URL.revokeObjectURL(idBackPreviewUrl);
        idBackPreviewUrl = URL.createObjectURL(file);
        idBackPreview.src = idBackPreviewUrl;
        idBackPreviewFrame.classList.add("show");
      }
    }

    function clearIdImages() {
      idFrontFile = null;
      idBackFile = null;
      idFrontInput.value = "";
      idBackInput.value = "";

      if (idFrontPreviewUrl) URL.revokeObjectURL(idFrontPreviewUrl);
      if (idBackPreviewUrl) URL.revokeObjectURL(idBackPreviewUrl);

      idFrontPreviewUrl = "";
      idBackPreviewUrl = "";
      idFrontPreview.src = "";
      idBackPreview.src = "";
      idFrontPreviewFrame.classList.remove("show");
      idBackPreviewFrame.classList.remove("show");
    }

    idFrontInput.addEventListener("change", function (event) {
      const file = event.target.files[0];
      if (!file) return;
      hideResult();
      setIdPreview("front", file);
    });

    idBackInput.addEventListener("change", function (event) {
      const file = event.target.files[0];
      if (!file) return;
      hideResult();
      setIdPreview("back", file);
    });

    imageInput.addEventListener("change", function (event) {
      const file = event.target.files[0];
      if (!file) return;

      hideResult();
      currentOriginalMainFile = file;
      openCropModal(file, "main");
    });

    workImagesInput.addEventListener("change", function (event) {
      const selected = Array.from(event.target.files || []);

      if (!selected.length) return;

      hideResult();

      const remaining = 5 - workImageBlobs.length;

      if (remaining <= 0) {
        showResult("error", "تم الوصول للحد الأقصى: 5 صور أعمال.");
        workImagesInput.value = "";
        return;
      }

      if (selected.length > remaining) {
        showResult("error", "سيتم استخدام أول " + remaining + " صورة فقط لأن الحد الأقصى 5 صور.");
      }

      pendingWorkFiles = selected.slice(0, remaining);
      currentWorkIndex = 0;
      processNextWorkImage();
    });

    editMainImageBtn.addEventListener("click", function () {
      if (currentOriginalMainFile) {
        openCropModal(currentOriginalMainFile, "main");
      } else {
        imageInput.click();
      }
    });

    removeMainImageBtn.addEventListener("click", function () {
      clearMainImage();
    });

    closeCropBtn.addEventListener("click", function () {
      closeCropModal();
    });

    zoomInBtn.addEventListener("click", function () {
      if (cropper) cropper.zoom(0.1);
    });

    zoomOutBtn.addEventListener("click", function () {
      if (cropper) cropper.zoom(-0.1);
    });

    rotateBtn.addEventListener("click", function () {
      if (cropper) cropper.rotate(90);
    });

    resetCropBtn.addEventListener("click", function () {
      if (cropper) cropper.reset();
    });

    applyCropBtn.addEventListener("click", function () {
      acceptCrop();
    });

    skipWorkCropBtn.addEventListener("click", function () {
      skipCurrentWorkImage();
    });

    cropModal.addEventListener("click", function (event) {
      if (event.target === cropModal) {
        closeCropModal();
      }
    });


    nextStepBtn.addEventListener("click", function () {
      if (!validateWizardStep(currentStep)) return;
      goToStep(currentStep + 1, true);
    });

    prevStepBtn.addEventListener("click", function () {
      goToStep(currentStep - 1, true);
    });

    stepPills.forEach((pill, index) => {
      pill.addEventListener("click", function () {
        if (index <= currentStep) {
          goToStep(index, true);
        }
      });
    });


    function normalizeRegisterPhone(phone) {
      let d = String(phone || "")
        .replace(/[٠-٩]/g, c => "٠١٢٣٤٥٦٧٨٩".indexOf(c))
        .replace(/[۰-۹]/g, c => "۰۱۲۳۴۵۶۷۸۹".indexOf(c))
        .replace(/\D/g, "");
      if (!d) return "";
      if (d.startsWith("0020")) d = d.slice(2);
      if (d.startsWith("20") && d.length === 12) d = "0" + d.slice(2);
      if (d.length === 10 && /^(10|11|12|15)/.test(d)) d = "0" + d;
      return d;
    }

    async function checkDuplicateRegistration(phone, whatsapp) {
      const params = new URLSearchParams();
      params.set("phone", phone || "");
      params.set("whatsapp", whatsapp || "");
      const response = await fetch("/api/workers/check-duplicate?" + params.toString());
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "تعذر فحص تكرار الرقم");
      }
      return data;
    }

    registerForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      hideResult();

      if (!validateAllWizardSteps()) {
        return;
      }

      const name = document.getElementById("name").value.trim();
      const phone = document.getElementById("phone").value.trim();
      const whatsapp = document.getElementById("whatsapp").value.trim();
      const trade = document.getElementById("trade").value.trim();
      const area = document.getElementById("area").value.trim();
      const description = document.getElementById("description").value.trim();

      if (!name || !phone || !trade || !area) {
        showResult("error", "من فضلك املأ الاسم ورقم الاتصال والحرفة والمنطقة.");
        return;
      }

      try {
        const duplicateCheck = await checkDuplicateRegistration(phone, whatsapp);
        if (duplicateCheck.duplicate) {
          const duplicateName = duplicateCheck.worker && duplicateCheck.worker.name ? duplicateCheck.worker.name : "صنايعي آخر";
          showResult("error", "هذا الرقم مسجل بالفعل باسم " + duplicateName + ". لا يمكن تسجيل نفس رقم الهاتف أو الواتساب أكثر من مرة.");
          return;
        }
      } catch (error) {
        showResult("error", error.message || "تعذر فحص تكرار الرقم.");
        return;
      }

      if (!idFrontFile || !idBackFile) {
        showResult("error", "لازم ترفع صورة البطاقة الشخصية وجه وظهر لإكمال طلب التسجيل.");
        return;
      }

      const formData = new FormData();
      formData.append("name", name);
      formData.append("phone", phone);
      formData.append("whatsapp", whatsapp);
      formData.append("trade", trade);
      formData.append("area", area);
      formData.append("description", description);

      formData.append("idFront", idFrontFile, "id-front.jpg");
      formData.append("idBack", idBackFile, "id-back.jpg");

      if (mainImageBlob) {
        formData.append("image", mainImageBlob, "profile-cropped.jpg");
      }

      workImageBlobs.forEach((blob, index) => {
        formData.append("workPhotos", blob, "work-photo-" + (index + 1) + ".jpg");
      });

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري إرسال الطلب...';

      try {
        const response = await fetch("/api/register", {
          method: "POST",
          body: formData
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "تعذر إرسال الطلب");
        }

        showResult(
          "success",
          "تم إرسال طلب التسجيل بنجاح ✅<br>سيتم مراجعة البيانات من الإدارة قبل الظهور في الدليل."
        );

        registerForm.reset();
        clearMainImage();
        clearIdImages();

        workImageBlobs = [];
        workImageUrls.forEach(url => URL.revokeObjectURL(url));
        workImageUrls = [];
        renderWorkPreview();
        goToStep(0, false);

      } catch (error) {
        showResult("error", error.message || "حدث خطأ أثناء إرسال الطلب.");
      }

      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال طلب التسجيل';
    });

    loadTrades();
    loadAreas();
    updateWizard();
  