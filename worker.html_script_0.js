

    function trackWorkerAction(workerId, eventType, source) {
      try {
        if (!workerId || !eventType) return;
        const payload = JSON.stringify({
          worker_id: String(workerId),
          event_type: eventType,
          source: source || "worker_page",
          page_path: location.pathname
        });

        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: "application/json" });
          navigator.sendBeacon("/api/analytics/track", blob);
        } else {
          fetch("/api/analytics/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
            keepalive: true
          }).catch(() => {});
        }
      } catch (e) {}
    }

    function toggleMobileMenu() {
      const nav = document.getElementById("mobileNav");
      nav.classList.toggle("show");
    }

    function idFromUrl() {
      const p = location.pathname.split("/");
      return p[p.length - 1];
    }

    function getName(w) {
      return w.name || w.full_name || w.worker_name || "صنايعي";
    }

    function getTrade(w) {
      return w.trade || w.craft || w.job || w.profession || w.trade_name || "حرفة غير محددة";
    }

    function getArea(w) {
      return w.area || w.location || w.region || w.area_name || "منطقة غير محددة";
    }

    function getDesc(w) {
      return w.description || w.about || w.notes || "لا يوجد وصف متاح حاليًا.";
    }

    function getPhone(w) {
      return w.phone || w.mobile || w.phone_number || "";
    }

    function getWhatsapp(w) {
      return w.whatsapp || w.whatsapp_number || w.whats || getPhone(w);
    }

    function featured(w) {
      const f = w.featured ?? w.is_featured ?? w.special ?? 0;
      return f === 1 || f === true || f === "1" || f === "true";
    }

    function verified(w) {
      const v = w.identity_verified ?? w.identityVerified ?? w.is_verified ?? w.verified ?? false;
      return v === 1 || v === true || v === "1" || v === "true";
    }

    function imgPath(image) {
      if (!image) {
        return "/icons/default-worker-avatar.png";
      }

      if (image.startsWith("http")) return image;
      if (image.startsWith("/uploads")) return image;
      if (image.startsWith("uploads")) return "/" + image;

      return "/uploads/" + image;
    }

    function convertArabicNumbers(value) {
      const map = {
        "٠": "0",
        "١": "1",
        "٢": "2",
        "٣": "3",
        "٤": "4",
        "٥": "5",
        "٦": "6",
        "٧": "7",
        "٨": "8",
        "٩": "9",
        "۰": "0",
        "۱": "1",
        "۲": "2",
        "۳": "3",
        "۴": "4",
        "۵": "5",
        "۶": "6",
        "۷": "7",
        "۸": "8",
        "۹": "9"
      };

      return value.toString().replace(/[٠-٩۰-۹]/g, n => map[n]);
    }

    function waNum(phone) {
      if (!phone) return "";

      let d = convertArabicNumbers(phone).replace(/[^\d]/g, "");

      if (d.startsWith("00")) d = d.slice(2);

      if (d.startsWith("0") && d.length === 11) {
        d = "20" + d.slice(1);
      }

      if (
        !d.startsWith("20") &&
        d.length === 10 &&
        (
          d.startsWith("10") ||
          d.startsWith("11") ||
          d.startsWith("12") ||
          d.startsWith("15")
        )
      ) {
        d = "20" + d;
      }

      return d;
    }

    function callNum(phone) {
      if (!phone) return "";

      let d = convertArabicNumbers(phone).replace(/[^\d]/g, "");

      if (d.startsWith("20") && d.length === 12) {
        return "0" + d.slice(2);
      }

      if (d.startsWith("0020")) {
        return "0" + d.slice(4);
      }

      if (d.startsWith("0")) {
        return d;
      }

      if (
        d.length === 10 &&
        (
          d.startsWith("10") ||
          d.startsWith("11") ||
          d.startsWith("12") ||
          d.startsWith("15")
        )
      ) {
        return "0" + d;
      }

      return d;
    }

    function renderStars(value) {
      const rating = Math.round(Number(value) || 0);
      return "★★★★★".slice(0, rating) + "☆☆☆☆☆".slice(0, 5 - rating);
    }

    function openLightbox(src) {
      document.getElementById("lightboxImg").src = src;
      document.getElementById("lightbox").classList.add("show");
    }

    function closeLightbox() {
      document.getElementById("lightbox").classList.remove("show");
    }


    function showCopyToast(message) {
      const toast = document.getElementById("copyToast");
      if (!toast) return;

      toast.innerHTML = `
        <i class="fa-solid fa-circle-check"></i>
        ${message}
      `;

      toast.classList.add("show");

      setTimeout(() => {
        toast.classList.remove("show");
      }, 2200);
    }

    async function shareCurrentWorker(workerName) {
      const workerUrl = window.location.href;
      const shareText = "شوف بيانات " + workerName + " على تطبيق صنايعي مطروح";

      if (navigator.share) {
        try {
          await navigator.share({
            title: workerName + " | صنايعي مطروح",
            text: shareText,
            url: workerUrl
          });
          return;
        } catch (error) {}
      }

      try {
        await navigator.clipboard.writeText(workerUrl);
        showCopyToast("تم نسخ رابط الصنايعي");
      } catch (error) {
        const tempInput = document.createElement("input");
        tempInput.value = workerUrl;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand("copy");
        document.body.removeChild(tempInput);
        showCopyToast("تم نسخ رابط الصنايعي");
      }
    }

    async function loadPhotos(id) {
      const gallery = document.getElementById("workGallery");

      try {
        const r = await fetch("/api/workers/" + id + "/photos");
        const photos = r.ok ? await r.json() : [];

        gallery.innerHTML = "";

        if (!photos.length) {
          gallery.innerHTML = '<div class="gallery-empty">لا توجد صور أعمال مضافة حاليًا.</div>';
          return;
        }

        photos.forEach(p => {
          const src = imgPath(p.image);
          const im = document.createElement("img");
          im.src = src;
          im.onclick = () => openLightbox(src);
          gallery.appendChild(im);
        });
      } catch(e) {
        gallery.innerHTML = '<div class="gallery-empty">لا توجد صور أعمال مضافة حاليًا.</div>';
      }
    }

    async function loadReviews(id) {
      const list = document.getElementById("reviewsList");
      const avgEl = document.getElementById("ratingAverage");
      const starsEl = document.getElementById("ratingStars");
      const countEl = document.getElementById("ratingCount");

      try {
        const [summaryRes, reviewsRes] = await Promise.all([
          fetch("/api/workers/" + id + "/reviews/summary"),
          fetch("/api/workers/" + id + "/reviews")
        ]);

        const summary = summaryRes.ok ? await summaryRes.json() : {average:0,count:0};
        const reviews = reviewsRes.ok ? await reviewsRes.json() : [];

        avgEl.textContent = summary.average || 0;
        starsEl.textContent = renderStars(summary.average || 0);
        countEl.textContent = summary.count ? "بناءً على " + summary.count + " تقييم" : "لا توجد تقييمات بعد";

        list.innerHTML = "";

        if (!reviews.length) {
          list.innerHTML = '<div class="review-empty">لا توجد ريفيوهات معتمدة حتى الآن. كن أول من يقيّم هذا الصنايعي.</div>';
          return;
        }

        reviews.forEach(r => {
          const card = document.createElement("div");
          card.className = "review-card";

          card.innerHTML = `
            <div class="review-card-head">
              <strong>${r.customer_name || "عميل"}</strong>
              <span class="review-stars">${renderStars(r.rating)}</span>
            </div>
            <p>${r.comment || ""}</p>
          `;

          list.appendChild(card);
        });
      } catch(e) {
        list.innerHTML = '<div class="review-empty">تعذر تحميل التقييمات حاليًا.</div>';
      }
    }

    function showReviewMessage(type, text) {
      const box = document.getElementById("reviewMessage");
      box.className = "review-message show " + type;
      box.innerHTML = text;
    }

    document.addEventListener("submit", async function(e) {
      if (e.target && e.target.id === "reviewForm") {
        e.preventDefault();

        const workerId = idFromUrl();
        const name = document.getElementById("reviewerName").value.trim();
        const rating = document.getElementById("reviewRating").value;
        const comment = document.getElementById("reviewComment").value.trim();
        const btn = document.getElementById("reviewBtn");

        if (!rating || !comment) {
          showReviewMessage("error", "من فضلك اختر التقييم واكتب الريفيو.");
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري الإرسال...';

        try {
          const res = await fetch("/api/workers/" + workerId + "/reviews", {
            method: "POST",
            headers: {"Content-Type":"application/json"},
            body: JSON.stringify({
              customer_name: name || "عميل",
              rating: Number(rating),
              comment
            })
          });

          if (!res.ok) throw new Error();

          showReviewMessage("success", "تم إرسال تقييمك بنجاح، وسيظهر بعد مراجعة الإدارة.");
          document.getElementById("reviewForm").reset();
        } catch(err) {
          showReviewMessage("error", "لم يتم إرسال التقييم. حاول مرة أخرى.");
        }

        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> إرسال التقييم';
      }
    });

    async function loadWorker() {
      const id = idFromUrl();

      const loading = document.getElementById("loadingBox");
      const error = document.getElementById("errorBox");
      const content = document.getElementById("detailsContent");
      const sticky = document.getElementById("mobileStickyContact");

      try {
        const r = await fetch("/api/workers/" + id);

        if (!r.ok) throw new Error();

        const w = await r.json();

        const name = getName(w);
        const trade = getTrade(w);
        const area = getArea(w);
        const desc = getDesc(w);
        const phone = getPhone(w);
        const whatsappPhone = getWhatsapp(w);

        const call = callNum(phone);
        const wa = waNum(whatsappPhone);
        const txt = encodeURIComponent("السلام عليكم، شوفت بياناتك على تطبيق صنايعي مطروح وعايز أستفسر عن شغلك.");

        document.title = name + " | صنايعي مطروح";

        const shareBtn = document.getElementById("shareBtn");
        const mobileShareBtn = document.getElementById("mobileShareBtn");

        if (shareBtn) {
          shareBtn.onclick = function () {
            shareCurrentWorker(name);
          };
        }

        if (mobileShareBtn) {
          mobileShareBtn.onclick = function (e) {
            e.preventDefault();
            shareCurrentWorker(name);
          };
        }

        document.getElementById("workerImage").src = imgPath(w.image || w.photo || "");
        document.getElementById("workerImage").onerror = function () {
          this.onerror = null;
          this.src = "/icons/default-worker-avatar.png";
        };

        document.getElementById("breadcrumbName").textContent = name;
        document.getElementById("workerName").textContent = name;
        document.getElementById("workerTrade").textContent = trade;
        document.getElementById("workerArea").textContent = area;
        document.getElementById("workerDescription").textContent = desc;

        document.getElementById("workerPhone").textContent = phone || "غير متاح";
        document.getElementById("workerWhatsapp").textContent = whatsappPhone || "غير متاح";
        document.getElementById("sideArea").textContent = area;
        document.getElementById("sideTrade").textContent = trade;

        if (featured(w)) {
          document.getElementById("featuredBadge").classList.add("show");
        }

        if (verified(w)) {
          document.getElementById("verifiedBadge").classList.add("show");
        }

        const callUrl = call ? "tel:" + call : "#";
        const whatsappUrl = wa ? "https://wa.me/" + wa + "?text=" + txt : "#";

        document.getElementById("callBtn").href = callUrl;
        document.getElementById("whatsappBtn").href = whatsappUrl;
        document.getElementById("mobileCallBtn").href = callUrl;
        document.getElementById("mobileWhatsappBtn").href = whatsappUrl;

        trackWorkerAction(id, "profile_view", "worker_page");

        ["callBtn", "mobileCallBtn"].forEach(function(btnId) {
          const btn = document.getElementById(btnId);
          if (btn) {
            btn.onclick = function() {
              if (call) trackWorkerAction(id, "call", btnId === "mobileCallBtn" ? "worker_mobile_sticky" : "worker_page");
            };
          }
        });

        ["whatsappBtn", "mobileWhatsappBtn"].forEach(function(btnId) {
          const btn = document.getElementById(btnId);
          if (btn) {
            btn.onclick = function() {
              if (wa) trackWorkerAction(id, "whatsapp", btnId === "mobileWhatsappBtn" ? "worker_mobile_sticky" : "worker_page");
            };
          }
        });

        await loadPhotos(id);
        await loadReviews(id);

        loading.style.display = "none";
        error.style.display = "none";
        content.style.display = "block";
        sticky.style.display = "";
      } catch(e) {
        loading.style.display = "none";
        content.style.display = "none";
        error.style.display = "block";
        sticky.style.display = "none";
      }
    }

    loadWorker();
  