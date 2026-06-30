function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

      // ====== TOGGLE PASSWORD ======
      function togglePw(id, btn) {
        const input = document.getElementById(id);
        input.type = input.type === "password" ? "text" : "password";
      }

      // ====== TOAST ======
      let toastTimer = null;

      function showToast(msg) {
        const toast = document.getElementById("toast");
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.remove("show");
        void toast.offsetWidth;
        toast.classList.add("show");
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
          toast.classList.remove("show");
          toastTimer = null;
        }, 2800);
      }

  // ====== THEME ======
  function setTheme(theme) {
    localStorage.setItem("ls_theme", theme);
    applyTheme(theme);
    document
      .querySelectorAll(".theme-option")
      .forEach((o) => o.classList.remove("active"));
    const el = document.getElementById("opt-" + theme);
    if (el) el.classList.add("active");
    document.getElementById("settings-panel").classList.remove("open");
  }

  function applyTheme(theme) {
    const html = document.documentElement;
    const btn = document.getElementById("theme-toggle-btn");
    if (!btn) return;
    if (theme === "auto") {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      html.setAttribute("data-theme", prefersDark ? "dark" : "light");
      btn.textContent = prefersDark ? "☀️" : "🌙";
    } else {
      html.setAttribute("data-theme", theme);
      btn.textContent = theme === "dark" ? "☀️" : "🌙";
    }
  }

  function toggleSettings() {
    const panel = document.getElementById("settings-panel");
    if (panel) panel.classList.toggle("open");
  }

  document.addEventListener("click", (e) => {
    const panel = document.getElementById("settings-panel");
    const btn = document.getElementById("theme-toggle-btn");
    if (panel && !panel.contains(e.target) && e.target !== btn) {
      panel.classList.remove("open");
    }
  });

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (localStorage.getItem("ls_theme") === "auto") applyTheme("auto");
    });

  // Init theme on load
  (function () {
    const saved = localStorage.getItem("ls_theme") || "light";
    applyTheme(saved);
    window.addEventListener("DOMContentLoaded", () => {
      document
        .querySelectorAll(".theme-option")
        .forEach((o) => o.classList.remove("active"));
      const el = document.getElementById("opt-" + saved);
      if (el) el.classList.add("active");
    });
  })();
