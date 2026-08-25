// أداة موحدة لضغط الصور client-side قبل الرفع، بحسب نوع الصورة (profile)
// تُستخدم في كل نظام رفع الصور بالمشروع بدل تكرار منطق Canvas في كل صفحة

const IMAGE_COMPRESSOR_PROFILES = {
  banner: { maxWidth: 1600, maxHeight: 1600, format: "image/webp", quality: 0.75, minQuality: 0.60, targetBytes: 500 * 1024 },
  portfolio: { maxWidth: 1280, maxHeight: 1280, format: "image/webp", quality: 0.75, minQuality: 0.60, targetBytes: 400 * 1024 },
  avatar: { maxWidth: 800, maxHeight: 800, format: "image/webp", quality: 0.75, minQuality: 0.75, targetBytes: 250 * 1024 },
  identity: { maxWidth: 2000, maxHeight: 2000, format: "image/jpeg", quality: 0.85, minQuality: 0.85, targetBytes: 1.2 * 1024 * 1024 }
};

const IMAGE_COMPRESSOR_MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
const IMAGE_COMPRESSOR_ERROR_MESSAGE = "تعذر تحسين الصورة، يرجى اختيار صورة أخرى أو تقليل حجمها.";

function compressImageWithProfile(file, profileName) {
  const profile = IMAGE_COMPRESSOR_PROFILES[profileName];
  if (!profile) return Promise.reject(new Error(IMAGE_COMPRESSOR_ERROR_MESSAGE));

  if (!file || !file.type || !file.type.startsWith("image/")) {
    return Promise.reject(new Error(IMAGE_COMPRESSOR_ERROR_MESSAGE));
  }
  if (file.size > IMAGE_COMPRESSOR_MAX_ORIGINAL_BYTES) {
    return Promise.reject(new Error("حجم الصورة كبير جدًا، برجاء اختيار صورة أصغر من 15 ميجابايت."));
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = function () {
      URL.revokeObjectURL(objectUrl);
      try {
        let width = img.width;
        let height = img.height;
        if (!width || !height) throw new Error(IMAGE_COMPRESSOR_ERROR_MESSAGE);

        if (width > profile.maxWidth || height > profile.maxHeight) {
          const ratio = Math.min(profile.maxWidth / width, profile.maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error(IMAGE_COMPRESSOR_ERROR_MESSAGE);
        ctx.drawImage(img, 0, 0, width, height);

        tryEncode(canvas, profile.quality, profile);
      } catch (err) {
        reject(new Error(IMAGE_COMPRESSOR_ERROR_MESSAGE));
      }
    };

    img.onerror = function () {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(IMAGE_COMPRESSOR_ERROR_MESSAGE));
    };

    img.src = objectUrl;

    function tryEncode(canvas, quality, profile) {
      canvas.toBlob(function (blob) {
        if (!blob) { reject(new Error(IMAGE_COMPRESSOR_ERROR_MESSAGE)); return; }
        if (blob.size <= profile.targetBytes || quality <= profile.minQuality) {
          resolve(blobToFile(blob, profile.format));
          return;
        }
        const nextQuality = Math.max(profile.minQuality, Math.round((quality - 0.1) * 100) / 100);
        if (nextQuality === quality) {
          resolve(blobToFile(blob, profile.format));
          return;
        }
        tryEncode(canvas, nextQuality, profile);
      }, profile.format, quality);
    }

    function blobToFile(blob, format) {
      const ext = format === "image/webp" ? "webp" : "jpg";
      return new File([blob], "img-" + Date.now() + "." + ext, { type: format });
    }
  });
}
