const STORAGE_KEY = "yakuza-los-santos-businesses-v1";
const MAP_KEY = "yakuza-los-santos-map-v1";
const starterBusinesses = [
  { id: "seed-1", name: "Автосервіс Strawberry", owner: "yakuza", x: 37, y: 61 },
  { id: "seed-2", name: "Нічний клуб Vespucci", owner: "yakuza", x: 26, y: 48 },
  { id: "seed-3", name: "АЗС Route 68", owner: "other", x: 59, y: 41 },
  { id: "seed-4", name: "Автосалон Vinewood", owner: "other", x: 45, y: 34 },
];

const businessList = document.querySelector("#business-list");
const mapCanvas = document.querySelector("#map-canvas");
const mapViewport = document.querySelector("#map-viewport");
const markerLayer = document.querySelector("#map-markers");
const mapImage = document.querySelector("#map-image");
const mapFallback = document.querySelector("#map-fallback");
const dialog = document.querySelector("#business-dialog");
const businessForm = document.querySelector("#business-form");
const nameInput = document.querySelector("#business-name");
const deleteButton = document.querySelector("#delete-button");
const searchInput = document.querySelector("#search-input");
const toast = document.querySelector("#toast");

let businesses = loadBusinesses();
let activeFilter = "all";
let editingId = null;
let pendingPosition = { x: 50, y: 50 };
let toastTimer;
let mapScale = 1;
let mapOffsetX = 0;
let mapOffsetY = 0;
let mapBaseLeft = 0;
let mapBaseTop = 0;
let mapDrag = null;
let mapDidDrag = false;

function loadBusinesses() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved.filter(isValidBusiness);
  } catch { /* Use the starter registry when stored data is unavailable. */ }
  return starterBusinesses.map((business) => ({ ...business }));
}

function isValidBusiness(item) {
  return item && typeof item.id === "string" && typeof item.name === "string" &&
    (item.owner === "yakuza" || item.owner === "other") &&
    Number.isFinite(item.x) && Number.isFinite(item.y);
}

function saveBusinesses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(businesses));
  render();
}

function visibleBusinesses() {
  const query = searchInput.value.trim().toLocaleLowerCase("uk");
  return businesses.filter((business) => {
    const matchesFilter = activeFilter === "all" || business.owner === activeFilter;
    return matchesFilter && business.name.toLocaleLowerCase("uk").includes(query);
  });
}

function render() {
  const visible = visibleBusinesses();
  businessList.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = businesses.length ? "За цим запитом бізнесів не знайдено." : "Реєстр порожній. Додайте перший бізнес через карту або кнопку +.";
    businessList.append(empty);
  }

  visible.forEach((business) => {
    const row = document.createElement("div");
    row.className = "business-row";
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Редагувати бізнес ${business.name}`);
    const dot = document.createElement("i");
    dot.className = `legend-dot ${business.owner === "yakuza" ? "owned" : "other"}`;
    const name = document.createElement("span");
    name.className = "business-name";
    name.textContent = business.name;
    const owner = document.createElement("span");
    owner.className = `business-owner ${business.owner === "yakuza" ? "owner-yakuza" : "owner-other"}`;
    owner.textContent = business.owner === "yakuza" ? "YAKUZA" : "ІНШІ";
    const edit = document.createElement("button");
    edit.className = "row-edit";
    edit.type = "button";
    edit.title = "Редагувати бізнес";
    edit.setAttribute("aria-label", `Редагувати ${business.name}`);
    edit.textContent = "↗";
    edit.addEventListener("click", (event) => { event.stopPropagation(); openEditor(business); });
    row.append(dot, name, owner, edit);
    row.addEventListener("click", () => openEditor(business));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openEditor(business); }
    });
    businessList.append(row);
  });

  markerLayer.replaceChildren();
  businesses.forEach((business) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `map-marker ${business.owner === "yakuza" ? "marker-owned" : "marker-other"}`;
    marker.style.left = `${business.x}%`;
    marker.style.top = `${business.y}%`;
    marker.title = `${business.name} · ${business.owner === "yakuza" ? "Yakuza" : "Інші"}`;
    marker.setAttribute("aria-label", `Редагувати ${business.name}`);
    marker.innerHTML = '<span class="marker-core"></span><span class="marker-label"></span>';
    marker.querySelector(".marker-label").textContent = business.name;
    marker.addEventListener("click", (event) => { event.stopPropagation(); openEditor(business); });
    markerLayer.append(marker);
  });

  const total = String(businesses.length).padStart(2, "0");
  document.querySelector("#record-count").textContent = total;
  document.querySelector("#map-count").textContent = `${total} ОБ’ЄКТІВ`;
  document.querySelector("#all-count").textContent = businesses.length;
}

function openEditor(business = null, position = null) {
  editingId = business?.id ?? null;
  pendingPosition = position ?? (business ? { x: business.x, y: business.y } : { x: 50, y: 50 });
  document.querySelector("#dialog-title").textContent = business ? "РЕДАГУВАТИ БІЗНЕС" : "НОВИЙ БІЗНЕС";
  document.querySelector(".dialog-top .eyebrow").textContent = business ? "РЕЄСТР / РЕДАГУВАННЯ" : "РЕЄСТР / НОВИЙ ЗАПИС";
  nameInput.value = business?.name ?? "";
  businessForm.elements.owner.value = business?.owner ?? "yakuza";
  deleteButton.hidden = !business;
  dialog.showModal();
  requestAnimationFrame(() => nameInput.focus());
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
}

function resizeMapCanvas() {
  const viewportWidth = mapViewport.clientWidth;
  const viewportHeight = mapViewport.clientHeight;
  const aspect = mapImage.naturalWidth && mapImage.naturalHeight ? mapImage.naturalWidth / mapImage.naturalHeight : 1;
  let width = viewportWidth;
  let height = viewportHeight;
  if (viewportWidth / viewportHeight > aspect) height = viewportWidth / aspect;
  else width = viewportHeight * aspect;
  mapBaseLeft = (viewportWidth - width) / 2;
  mapBaseTop = (viewportHeight - height) / 2;
  mapCanvas.style.left = `${mapBaseLeft}px`;
  mapCanvas.style.top = `${mapBaseTop}px`;
  mapCanvas.style.width = `${width}px`;
  mapCanvas.style.height = `${height}px`;
  clampMapOffset();
  renderMapTransform();
}

mapImage.addEventListener("error", () => {
  mapImage.classList.add("broken");
  mapFallback.hidden = false;
});
mapImage.addEventListener("load", () => {
  mapImage.classList.remove("broken");
  mapFallback.hidden = true;
  resizeMapCanvas();
});

try {
  const savedMap = localStorage.getItem(MAP_KEY);
  if (savedMap) mapImage.src = savedMap;
} catch { /* The default map remains available when storage is restricted. */ }

if (mapImage.complete && mapImage.naturalWidth) resizeMapCanvas();
window.addEventListener("resize", resizeMapCanvas);

function clampMapOffset() {
  mapOffsetX = Math.min(-mapBaseLeft, Math.max(mapViewport.clientWidth - mapBaseLeft - mapCanvas.offsetWidth * mapScale, mapOffsetX));
  mapOffsetY = Math.min(-mapBaseTop, Math.max(mapViewport.clientHeight - mapBaseTop - mapCanvas.offsetHeight * mapScale, mapOffsetY));
}

function renderMapTransform() {
  mapCanvas.style.transform = `translate(${mapOffsetX}px, ${mapOffsetY}px) scale(${mapScale})`;
  mapViewport.classList.toggle("zoomed", mapScale > 1);
  document.querySelector("#zoom-level").value = `${Math.round(mapScale * 100)}%`;
}

function zoomMap(nextScale, x = mapViewport.clientWidth / 2, y = mapViewport.clientHeight / 2) {
  nextScale = Math.min(4, Math.max(1, nextScale));
  const ratio = nextScale / mapScale;
  mapOffsetX = x - mapBaseLeft - (x - mapBaseLeft - mapOffsetX) * ratio;
  mapOffsetY = y - mapBaseTop - (y - mapBaseTop - mapOffsetY) * ratio;
  mapScale = nextScale;
  clampMapOffset();
  renderMapTransform();
}

mapViewport.addEventListener("wheel", (event) => {
  event.preventDefault();
  const bounds = mapViewport.getBoundingClientRect();
  const nextScale = mapScale * Math.exp(-event.deltaY * 0.0012);
  zoomMap(nextScale, event.clientX - bounds.left, event.clientY - bounds.top);
}, { passive: false });

mapViewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || event.target.closest(".map-marker")) return;
  mapDrag = { x: event.clientX, y: event.clientY, offsetX: mapOffsetX, offsetY: mapOffsetY };
  mapDidDrag = false;
  mapViewport.classList.add("map-dragging");
  mapViewport.setPointerCapture(event.pointerId);
});

mapViewport.addEventListener("pointermove", (event) => {
  if (!mapDrag) return;
  const deltaX = event.clientX - mapDrag.x;
  const deltaY = event.clientY - mapDrag.y;
  if (Math.abs(deltaX) + Math.abs(deltaY) > 3) mapDidDrag = true;
  mapOffsetX = mapDrag.offsetX + deltaX;
  mapOffsetY = mapDrag.offsetY + deltaY;
  clampMapOffset();
  renderMapTransform();
});

function finishMapDrag() {
  mapDrag = null;
  mapViewport.classList.remove("map-dragging");
}

mapViewport.addEventListener("pointerup", finishMapDrag);
mapViewport.addEventListener("pointercancel", finishMapDrag);

document.querySelector("#zoom-in").addEventListener("click", () => zoomMap(mapScale * 1.25));
document.querySelector("#zoom-out").addEventListener("click", () => zoomMap(mapScale / 1.25));
document.querySelector("#zoom-reset").addEventListener("click", () => {
  mapScale = 1;
  mapOffsetX = 0;
  mapOffsetY = 0;
  renderMapTransform();
});

mapViewport.addEventListener("click", (event) => {
  if (mapDidDrag) { mapDidDrag = false; return; }
  if (event.target.closest(".map-marker")) return;
  const bounds = mapCanvas.getBoundingClientRect();
  const x = ((event.clientX - bounds.left) / bounds.width) * 100;
  const y = ((event.clientY - bounds.top) / bounds.height) * 100;
  if (x < 0 || x > 100 || y < 0 || y > 100) return;
  openEditor(null, { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) });
});

document.querySelector("#add-button").addEventListener("click", () => openEditor());
document.querySelector("#map-add-hint").addEventListener("click", () => showToast("Клацніть у потрібному місці на карті."));
document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
searchInput.addEventListener("input", render);

document.querySelectorAll(".filter-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    activeFilter = tab.dataset.filter;
    document.querySelectorAll(".filter-tab").forEach((item) => {
      const selected = item === tab;
      item.classList.toggle("selected", selected);
      item.setAttribute("aria-selected", String(selected));
    });
    render();
  });
});

businessForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  const owner = businessForm.elements.owner.value;
  if (editingId) {
    businesses = businesses.map((business) => business.id === editingId ? { ...business, name, owner } : business);
  } else {
    businesses.push({ id: crypto.randomUUID(), name, owner, ...pendingPosition });
  }
  saveBusinesses();
  dialog.close();
  showToast(editingId ? "Зміни бізнесу збережено." : "Бізнес додано на карту.");
});

deleteButton.addEventListener("click", () => {
  if (!editingId || !confirm("Видалити цей бізнес із реєстру?")) return;
  businesses = businesses.filter((business) => business.id !== editingId);
  saveBusinesses();
  dialog.close();
  showToast("Бізнес видалено.");
});

document.querySelector("#map-upload").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) {
    showToast("Зображення завелике. Максимальний розмір — 3 МБ.");
    event.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      localStorage.setItem(MAP_KEY, reader.result);
      mapImage.src = reader.result;
      showToast("Карту оновлено.");
    } catch {
      showToast("Не вдалося зберегти карту. Спробуйте менше зображення.");
    }
  });
  reader.readAsDataURL(file);
  event.target.value = "";
});

document.querySelector("#export-button").addEventListener("click", () => {
  const payload = { version: 1, businesses };
  const file = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "yakuza-businesses.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Резервну копію завантажено.");
});

document.querySelector("#import-upload").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(reader.result);
      const imported = Array.isArray(parsed) ? parsed : parsed.businesses;
      if (!Array.isArray(imported) || !imported.every(isValidBusiness)) throw new Error("Invalid registry");
      businesses = imported;
      saveBusinesses();
      showToast("Реєстр успішно імпортовано.");
    } catch {
      showToast("Файл не схожий на резервну копію реєстру.");
    }
  });
  reader.readAsText(file);
  event.target.value = "";
});

render();
