const DATABASE_NAME = "yakuza-media-library";
const DATABASE_VERSION = 1;
const STORE_NAME = "files";

const mediaLinkForm = document.querySelector("#media-link-form");
const mediaUrlInput = document.querySelector("#media-url");
const mediaKindInput = document.querySelector("#media-kind");
const mediaGrid = document.querySelector("#media-grid");
const mediaEmpty = document.querySelector("#media-empty");
const mediaSearch = document.querySelector("#media-search");
const mediaToast = document.querySelector("#media-toast");
const mediaLoginButton = document.querySelector("#media-login-button");
const mediaLoginDialog = document.querySelector("#media-login-dialog");
const mediaLoginForm = document.querySelector("#media-login-form");
const mediaLoginError = document.querySelector("#media-login-error");
const mediaAccessNote = document.querySelector("#media-access-note");
const sessionKey = "business-directory-demo-user";
let database;
let activeFilter = "all";
let objectUrls = [];
let sharedMedia = [];
let localMedia = [];
let toastTimeout;
let sessionToken = sessionStorage.getItem(sessionKey) || "";
let isLoggedIn = Boolean(sessionToken);

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        const store = request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function showToast(message) {
  mediaToast.textContent = message;
  mediaToast.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => mediaToast.classList.remove("visible"), 2800);
}

function renderAccessState() {
  mediaLoginButton.textContent = isLoggedIn ? "ВИЙТИ" : "УВІЙТИ";
  mediaLoginButton.setAttribute("aria-label", isLoggedIn ? "Вийти з Media" : "Увійти в Media");
  mediaAccessNote.textContent = isLoggedIn
    ? "Посилання спільні для всіх відвідувачів. Ви увійшли й можете видаляти записи."
    : "Посилання спільні для всіх відвідувачів. Щоб видаляти, увійди.";
  if (database) loadLocalMedia();
}

mediaLoginButton.addEventListener("click", async () => {
  if (isLoggedIn) {
    isLoggedIn = false;
    const token = sessionToken;
    sessionToken = "";
    sessionStorage.removeItem(sessionKey);
    renderAccessState();
    showToast("Ви вийшли з Media.");
    if (token) {
      try {
        await window.YakuzaAuth.request("logout", { token });
      } catch (error) {
        showToast(error.message || "Не вдалося завершити сеанс на сервері.");
      }
    }
    return;
  }
  mediaLoginError.hidden = true;
  mediaLoginForm.reset();
  mediaLoginDialog.showModal();
});

mediaLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = document.querySelector("#media-login-email").value.trim().toLowerCase();
  const password = document.querySelector("#media-login-password").value;
  const submitButton = mediaLoginForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    const token = await window.YakuzaAuth.authenticate(email, password);
    if (!token) {
      mediaLoginError.textContent = "Неправильний логін або пароль.";
      mediaLoginError.hidden = false;
      return;
    }
    sessionToken = token;
    isLoggedIn = true;
    sessionStorage.setItem(sessionKey, token);
    mediaLoginError.hidden = true;
    mediaLoginDialog.close();
    renderAccessState();
    if (sessionToken === "true") {
      sessionToken = "";
      isLoggedIn = false;
      sessionStorage.removeItem(sessionKey);
    }
    if (sessionToken) {
      window.YakuzaAuth.request("verify", { token: sessionToken })
        .then((response) => {
          isLoggedIn = response.status === "success";
          if (!isLoggedIn) {
            sessionToken = "";
            sessionStorage.removeItem(sessionKey);
          }
          renderAccessState();
        })
        .catch((error) => {
          isLoggedIn = false;
          sessionToken = "";
          sessionStorage.removeItem(sessionKey);
          renderAccessState();
          showToast(error.message || "Не вдалося перевірити сеанс.");
        });
    }
    showToast("Вхід до Media виконано.");
  } catch (error) {
    mediaLoginError.textContent = error.message || "Не вдалося виконати вхід.";
    mediaLoginError.hidden = false;
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelectorAll("[data-login-close]").forEach((button) => {
  button.addEventListener("click", () => mediaLoginDialog.close());
});

function formatFileSize(size) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} КБ`;
  return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
}

function getYouTubeVideoId(value) {
  let url;
  try { url = new URL(value); } catch { return ""; }
  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || "";
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtube-nocookie.com") {
    return url.searchParams.get("v") || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] || "";
  }
  return "";
}

function loadLocalMedia() {
  if (!database) {
    localMedia = [];
    renderMedia([...sharedMedia]);
    return;
  }
  const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
  request.addEventListener("success", () => {
    localMedia = request.result.map((record) => ({ ...record, source: "local" }));
    renderMedia([...sharedMedia, ...localMedia]);
  });
  request.addEventListener("error", () => showToast("Не вдалося завантажити медіатеку."));
}

async function loadMedia() {
  try {
    const response = await window.YakuzaAuth.request("listMedia");
    if (response.status !== "success" || !Array.isArray(response.media)) {
      throw new Error(response.status === "unsupported-action"
        ? "Потрібно оновити й опублікувати Code.gs в Apps Script."
        : "Не вдалося завантажити спільну медіатеку.");
    }
    sharedMedia = response.media.map((record) => ({ ...record, source: "shared" }));
    loadLocalMedia();
  } catch (error) {
    showToast(error.message || "Не вдалося завантажити спільну медіатеку.");
    loadLocalMedia();
  }
}

function renderMedia(records) {
  objectUrls.forEach(URL.revokeObjectURL);
  objectUrls = [];
  const query = mediaSearch.value.trim().toLocaleLowerCase("uk");
  const filtered = records
    .filter((record) => activeFilter === "all" || record.kind === activeFilter)
    .filter((record) => record.name.toLocaleLowerCase("uk").includes(query))
    .sort((first, second) => second.createdAt - first.createdAt);

  document.querySelector("#media-count").textContent = `${filtered.length} ФАЙЛІВ`;
  mediaGrid.replaceChildren();
  mediaEmpty.hidden = filtered.length > 0;
  mediaEmpty.classList.toggle("has-query", records.length > 0 && filtered.length === 0);
  mediaEmpty.querySelector("strong").textContent = records.length && !filtered.length ? "Нічого не знайдено" : "Медіатека поки порожня";
  mediaEmpty.querySelector("span:not(.empty-mark)").textContent = records.length && !filtered.length ? "Спробуй змінити пошук або фільтр." : "Додай фото чи відео сім’ї, щоб зібрати їх в одному місці.";

  filtered.forEach((record) => {
    const url = record.url || URL.createObjectURL(record.blob);
    if (!record.url) objectUrls.push(url);
    const card = document.createElement("article");
    card.className = "media-card";
    const preview = document.createElement("div");
    preview.className = "media-preview";
    if (record.kind === "video" && record.url && getYouTubeVideoId(record.url)) {
      const watchLink = document.createElement("a");
      watchLink.className = "media-video-link";
      watchLink.href = record.url;
      watchLink.target = "_blank";
      watchLink.rel = "noopener noreferrer";
      watchLink.setAttribute("aria-label", `Відкрити відео ${record.name} на YouTube`);
      const thumbnail = document.createElement("img");
      thumbnail.src = `https://img.youtube.com/vi/${encodeURIComponent(getYouTubeVideoId(record.url))}/hqdefault.jpg`;
      thumbnail.alt = record.name;
      const play = document.createElement("span");
      play.className = "media-play-icon";
      play.textContent = "▶";
      watchLink.append(thumbnail, play);
      preview.append(watchLink);
    } else if (record.kind === "video" && record.url && /(?:^|\.)vimeo\.com$/i.test(new URL(record.url).hostname)) {
      const watchLink = document.createElement("a");
      watchLink.className = "media-video-link media-video-external";
      watchLink.href = record.url;
      watchLink.target = "_blank";
      watchLink.rel = "noopener noreferrer";
      watchLink.textContent = "ВІДКРИТИ ВІДЕО ↗";
      preview.append(watchLink);
    } else if (record.kind === "video") {
      const video = document.createElement("video");
      video.src = record.url || url;
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      video.setAttribute("aria-label", record.name);
      preview.append(video);
    } else {
      const image = document.createElement("img");
      image.src = url;
      image.alt = record.name;
      image.loading = "lazy";
      preview.append(image);
    }

    const details = document.createElement("div");
    details.className = "media-details";
    const name = document.createElement("strong");
    name.className = "media-name";
    name.title = record.name;
    name.textContent = record.name;
    const meta = document.createElement("span");
    meta.className = "media-meta";
    meta.textContent = `${record.kind === "video" ? "ВІДЕО" : "ФОТО"} · ${record.url ? "ПОСИЛАННЯ" : formatFileSize(record.size)} · ${new Date(record.createdAt).toLocaleDateString("uk")}`;
    details.append(name, meta);

    const actions = document.createElement("div");
    actions.className = "media-actions";
    const download = document.createElement("a");
    download.className = "media-icon-button";
    download.href = url;
    if (record.url) {
      download.target = "_blank";
      download.rel = "noopener noreferrer";
    } else {
      download.download = record.name;
    }
    download.title = record.url ? "Відкрити джерело" : "Завантажити файл";
    download.setAttribute("aria-label", `${record.url ? "Відкрити" : "Завантажити"} ${record.name}`);
    download.textContent = record.url ? "↗" : "↓";
    const remove = document.createElement("button");
    remove.className = "media-icon-button media-delete";
    remove.type = "button";
    remove.title = "Видалити файл";
    remove.setAttribute("aria-label", `Видалити ${record.name}`);
    remove.dataset.deleteId = record.id;
    remove.dataset.deleteSource = record.source || "local";
    remove.textContent = "×";
    actions.append(download);
    if (isLoggedIn) actions.append(remove);
    card.append(preview, details, actions);
    mediaGrid.append(card);
  });
}

mediaLinkForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  let mediaUrl;
  try {
    mediaUrl = new URL(mediaUrlInput.value.trim());
  } catch {
    showToast("Встав коректне посилання на медіафайл.");
    return;
  }
  if (mediaUrl.protocol !== "https:" && mediaUrl.protocol !== "http:") {
    showToast("Посилання має починатися з http:// або https://.");
    return;
  }
  const filename = mediaUrl.pathname.split("/").filter(Boolean).at(-1);
  let name = filename || mediaUrl.hostname;
  try { name = decodeURIComponent(name); } catch { /* Keep the original URL path segment. */ }
  const record = {
    name,
    kind: mediaKindInput.value,
    url: mediaUrl.href
  };
  const submitButton = mediaLinkForm.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    const response = await window.YakuzaAuth.request("addMedia", record);
    if (response.status !== "success" || !response.record) {
      throw new Error(response.status === "unsupported-action"
        ? "Щоб зберігати посилання для всіх, онови й опублікуй Code.gs в Apps Script."
        : response.status === "invalid-media"
          ? "Перевір посилання та тип медіа."
          : "Не вдалося зберегти посилання на сервері.");
    }
    mediaLinkForm.reset();
    sharedMedia = [{ ...response.record, source: "shared" }, ...sharedMedia];
    renderMedia([...sharedMedia, ...localMedia]);
    showToast("Посилання додано до медіатеки.");
  } catch (error) {
    showToast(error.message || "Не вдалося зберегти посилання.");
  } finally {
    submitButton.disabled = false;
  }
});

mediaSearch.addEventListener("input", () => renderMedia([...sharedMedia, ...localMedia]));
document.querySelectorAll(".media-filter").forEach((button) => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".media-filter").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    renderMedia([...sharedMedia, ...localMedia]);
  });
});

mediaGrid.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-id]");
  if (!deleteButton) return;
  if (!isLoggedIn) {
    showToast("Увійди, щоб видалити файл.");
    mediaLoginDialog.showModal();
    return;
  }
  if (!confirm("Видалити цей файл з медіатеки?")) return;
  if (deleteButton.dataset.deleteSource === "shared") {
    deleteButton.disabled = true;
    try {
      const response = await window.YakuzaAuth.request("deleteMedia", {
        token: sessionToken,
        mediaId: deleteButton.dataset.deleteId
      });
      if (response.status === "unauthorized") {
        sessionToken = "";
        isLoggedIn = false;
        sessionStorage.removeItem(sessionKey);
        renderAccessState();
        throw new Error("Сеанс завершився. Увійди знову.");
      }
      if (response.status !== "success") {
        throw new Error(response.status === "unsupported-action"
          ? "Онови й опублікуй Code.gs в Apps Script."
          : "Не вдалося видалити спільний запис.");
      }
      sharedMedia = sharedMedia.filter((record) => record.id !== deleteButton.dataset.deleteId);
      renderMedia([...sharedMedia, ...localMedia]);
      showToast("Файл видалено.");
    } catch (error) {
      deleteButton.disabled = false;
      showToast(error.message || "Не вдалося видалити запис.");
    }
    return;
  }
  if (!database) {
    showToast("Локальне сховище недоступне.");
    return;
  }
  const transaction = database.transaction(STORE_NAME, "readwrite");
  transaction.objectStore(STORE_NAME).delete(deleteButton.dataset.deleteId);
  transaction.addEventListener("complete", () => {
    loadLocalMedia();
    showToast("Файл видалено.");
  });
});

openDatabase().then((openedDatabase) => {
  database = openedDatabase;
  loadLocalMedia();
}).catch(() => showToast("Локальне сховище недоступне; спільні посилання працюють окремо."));

loadMedia();
renderAccessState();
