const navigationLinks = [...document.querySelectorAll(".top-nav .nav-link")];

function syncNavigation() {
  const currentPath = window.location.pathname;
  const currentHash = window.location.hash || "#home";
  navigationLinks.forEach((link) => {
    const target = new URL(link.href);
    const active = target.pathname === currentPath && (!target.hash || target.hash === currentHash);
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
}

window.addEventListener("hashchange", syncNavigation);
syncNavigation();