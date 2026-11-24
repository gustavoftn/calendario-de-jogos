    (function () {
  var KEY = "galoday-theme";
  var root = document.documentElement;
  var media = window.matchMedia("(prefers-color-scheme: dark)");

  function saved() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function current() { return saved() || (media.matches ? "dark" : "light"); }

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "light" ? "#f5f3f1" : "#101010");
    var btn = document.getElementById("themeBtn");
    if (btn) {
      btn.querySelector("span").textContent = theme === "light" ? "☾" : "☀";
      btn.setAttribute("aria-label", theme === "light" ? "Ativar modo escuro" : "Ativar modo claro");
    }
  }

  apply(current());

  document.addEventListener("DOMContentLoaded", function () {
    apply(current());
    var btn = document.getElementById("themeBtn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "light" ? "dark" : "light";
      try { localStorage.setItem(KEY, next); } catch (e) {}
      apply(next);
    });
  });

  media.addEventListener && media.addEventListener("change", function () {
    if (!saved()) apply(current());
  });
})();