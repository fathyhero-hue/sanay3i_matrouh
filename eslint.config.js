const js = require("@eslint/js");

// غلوبالز Node.js (السيرفر والاختبارات)
const nodeGlobals = {
  require: "readonly",
  module: "writable",
  exports: "writable",
  process: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  console: "readonly",
  Buffer: "readonly",
  global: "readonly",
  fetch: "readonly",
  URL: "readonly",
  setTimeout: "readonly",
  setInterval: "readonly",
  clearTimeout: "readonly",
  clearInterval: "readonly"
};

// غلوبالز المتصفح (كود public/js اللي بيشتغل عند العميل)
const browserGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  location: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  fetch: "readonly",
  FormData: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Intl: "readonly",
  Image: "readonly",
  Audio: "readonly",
  FileReader: "readonly",
  Notification: "readonly",
  alert: "readonly",
  confirm: "readonly",
  prompt: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  setInterval: "readonly",
  clearTimeout: "readonly",
  clearInterval: "readonly"
};

module.exports = [
  { ignores: ["node_modules/**", "uploads/**", "backups/**"] },
  js.configs.recommended,
  {
    files: ["api/**/*.js", "tests/**/*.js", "scripts/**/*.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: nodeGlobals
    },
    rules: {
      // الكود الحالي فيه متغيرات ملتقطة (catch (e)) ومعمول لها استخدام جزئي - تحذير بس مش خطأ
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-console": "off"
    }
  },
  {
    files: ["public/js/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: browserGlobals
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }],
      "no-console": "off"
    }
  },
  {
    // ملفات بتستخدم دوال مشتركة من public/js/common.js اللي بيتحمل قبلها في الصفحة
    files: ["public/js/home.js", "public/js/register.js"],
    languageOptions: {
      globals: { fetchJson: "readonly" }
    }
  },
  {
    // ملفات بتستخدم window.CustomerGate من public/js/customerGate.js اللي بيتحمل قبلها في الصفحة
    files: ["public/js/home.js"],
    languageOptions: {
      globals: { CustomerGate: "readonly" }
    }
  },
  {
    // service-worker.js بيشتغل جوا Service Worker scope، مش المتصفح العادي
    // (الملف داخل public/ عشان Vercel يقدر يقدّمه كملف ثابت مباشرة)
    files: ["public/service-worker.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        self: "readonly",
        caches: "readonly",
        fetch: "readonly",
        Response: "readonly",
        clients: "readonly",
        URL: "readonly",
        console: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none" }]
    }
  }
];
