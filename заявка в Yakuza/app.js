const form = document.querySelector("#application-form");
const submitButton = document.querySelector("#submit-button");
const status = document.querySelector("#form-status");

form.action = window.YakuzaAuth.scriptUrl;
submitButton.disabled = false;
status.textContent = "Заповни анкету — відповіді надійдуть до таблиці заявок.";

let responseTimeout;
let isSubmitting = false;
let activeRequestId = "";

form.addEventListener("submit", (event) => {
  if (isSubmitting) {
    event.preventDefault();
    return;
  }

  isSubmitting = true;
  activeRequestId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  let requestIdInput = form.querySelector('[name="requestId"]');
  if (!requestIdInput) {
    requestIdInput = document.createElement("input");
    requestIdInput.type = "hidden";
    requestIdInput.name = "requestId";
    form.append(requestIdInput);
  }
  requestIdInput.value = activeRequestId;
  submitButton.disabled = true;
  status.dataset.state = "";
  status.textContent = "Надсилаємо заявку…";

  window.clearTimeout(responseTimeout);
  responseTimeout = window.setTimeout(() => {
    isSubmitting = false;
    submitButton.disabled = false;
    status.dataset.state = "error";
    status.textContent = "Не вдалося отримати підтвердження від сервера. Перевір підключення перед повторним надсиланням.";
  }, 30000);
});

window.addEventListener("message", (event) => {
  if (event.data?.type !== "yakuza-application" || event.data.requestId !== activeRequestId) return;

  window.clearTimeout(responseTimeout);
  isSubmitting = false;
  activeRequestId = "";
  submitButton.disabled = false;

  if (event.data.status === "success") {
    form.reset();
    status.dataset.state = "success";
    status.textContent = "Заявку надіслано в таблицю. Дякуємо — команда зв'яжеться з тобою в Discord.";
    return;
  }

  status.dataset.state = "error";
  status.textContent = "Не вдалося зберегти заявку. Перевір вік (1–100) та спробуй пізніше.";
});
