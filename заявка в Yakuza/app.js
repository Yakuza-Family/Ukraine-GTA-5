const SCRIPT_URL = "PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE";

const form = document.querySelector("#application-form");
const submitButton = document.querySelector("#submit-button");
const status = document.querySelector("#form-status");
const responseFrame = document.querySelector('iframe[name="submission-frame"]');
const configured = SCRIPT_URL.startsWith("https://script.google.com/macros/s/")
  && SCRIPT_URL.endsWith("/exec");

if (configured) {
  form.action = SCRIPT_URL;
  submitButton.disabled = false;
  status.textContent = "Заповни анкету — відповіді надійдуть у таблицю.";
} else {
  status.textContent = "Щоб увімкнути надсилання, налаштуй Apps Script за інструкцією в README.md.";
}

let responseTimeout;

form.addEventListener("submit", () => {
  if (!configured) return;

  submitButton.disabled = true;
  status.dataset.state = "";
  status.textContent = "Надсилаємо заявку…";

  window.clearTimeout(responseTimeout);
  responseTimeout = window.setTimeout(() => {
    submitButton.disabled = false;
    status.dataset.state = "error";
    status.textContent = "Не вдалося отримати підтвердження. Перевір підключення та таблицю перед повторним надсиланням.";
  }, 30000);
});

window.addEventListener("message", (event) => {
  if (event.source !== responseFrame.contentWindow || event.data?.type !== "yakuza-application") return;

  window.clearTimeout(responseTimeout);
  submitButton.disabled = false;

  if (event.data.status === "success") {
    form.reset();
    status.dataset.state = "success";
    status.textContent = "Заявку надіслано. Дякуємо — команда зв'яжеться з тобою в Discord.";
    return;
  }

  status.dataset.state = "error";
  status.textContent = "Не вдалося зберегти заявку. Спробуй пізніше або звернися до адміністрації.";
});
