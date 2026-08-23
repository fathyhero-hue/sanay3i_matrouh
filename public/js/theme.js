// Dark Mode (بند 21) - تلقائي/فاتح/داكن، محفوظ محليًا فقط (localStorage)
// بدون أي Backend. الاختيار الفعلي (light/dark) بيتحط كـdata-theme على
// <html>، و"تلقائي" معناها إزالة data-theme خالص عشان الصفحة تتبع
// prefers-color-scheme زي ما هو معرّف في global.css
var SANAY3I_THEME_KEY = "sanay3i_theme";

function setSanay3iTheme(mode) {
  if (mode === "light" || mode === "dark") {
    localStorage.setItem(SANAY3I_THEME_KEY, mode);
    document.documentElement.setAttribute("data-theme", mode);
  } else {
    localStorage.removeItem(SANAY3I_THEME_KEY);
    document.documentElement.removeAttribute("data-theme");
  }
  updateThemeToggleUI(mode);
}

function updateThemeToggleUI(mode) {
  document.querySelectorAll("[data-theme-option]").forEach(function (btn) {
    btn.classList.toggle("active", btn.getAttribute("data-theme-option") === mode);
  });
}

document.addEventListener("DOMContentLoaded", function () {
  var saved = localStorage.getItem(SANAY3I_THEME_KEY) || "auto";
  updateThemeToggleUI(saved);
  document.querySelectorAll("[data-theme-option]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      setSanay3iTheme(btn.getAttribute("data-theme-option"));
    });
  });
});
