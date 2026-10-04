const SESSION_KEY = "business-directory-demo-user";

const loginForm = document.querySelector("#applications-login");
const loginButton = document.querySelector("#applications-login-button");
const loginState = document.querySelector("#applications-login-state");
const tableWrap = document.querySelector("#applications-table-wrap");
const applicationsRows = document.querySelector("#applications-rows");
const emptyState = document.querySelector("#applications-empty");
const actions = document.querySelector("#applications-actions");

function setStatus(message, state = "") {
  loginState.textContent = message;
  loginState.dataset.state = state;
}

function showLogin(message, state = "") {
  loginForm.hidden = false;
  tableWrap.hidden = true;
  actions.hidden = true;
  setStatus(message, state);
}

function renderApplications(applications) {
  applicationsRows.replaceChildren();
  applications.forEach((application) => {
    const row = document.createElement("tr");
    row.dataset.applicationId = application.id;
    [
      application.submittedAt,
      application.nickname,
      application.age,
      application.discord,
      application.onlineTime,
      application.motivation,
      application.previousFamilies
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value || "—";
      row.append(cell);
    });

    const statusCell = document.createElement("td");
    statusCell.className = "application-decision-cell";
    const controls = document.createElement("div");
    controls.className = "application-decision";
    [
      { value: "accepted", label: "Прийняти" },
      { value: "rejected", label: "Відхилити" },
      { value: "pending", label: "На розгляді" }
    ].forEach(({ value, label }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `decision-button decision-${value}`;
      button.dataset.status = value;
      button.textContent = label;
      button.setAttribute("aria-pressed", String((application.status || "pending") === value));
      button.disabled = (application.status || "pending") === value;
      controls.append(button);
    });
    const state = document.createElement("span");
    state.className = `decision-state decision-state-${application.status || "pending"}`;
    state.textContent = {
      accepted: "Прийнята",
      rejected: "Відхилена",
      pending: "На розгляді"
    }[application.status || "pending"];
    statusCell.append(controls, state);
    row.append(statusCell);
    applicationsRows.append(row);
  });
  emptyState.hidden = applications.length > 0;
}

applicationsRows.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-status]");
  const row = button?.closest("[data-application-id]");
  const token = sessionStorage.getItem(SESSION_KEY);
  if (!button || !row || !token || button.disabled) return;

  const buttons = row.querySelectorAll("[data-status]");
  buttons.forEach((item) => { item.disabled = true; });
  setStatus("Зберігаємо рішення…");
  try {
    const response = await window.YakuzaAuth.request("updateApplicationStatus", {
      token,
      applicationId: row.dataset.applicationId,
      status: button.dataset.status
    });
    if (response.status === "unauthorized") {
      sessionStorage.removeItem(SESSION_KEY);
      showLogin("Сеанс завершився. Увійди ще раз.", "error");
      return;
    }
    if (response.status !== "success") {
      const messages = {
        "not-found": "Заявку не знайдено. Онови таблицю.",
        "unsupported-action": "Опублікована версія Apps Script застаріла. Онови Code.gs і опублікуй нову версію вебзастосунку."
      };
      throw new Error(messages[response.status] || "Не вдалося зберегти рішення.");
    }

    const selectedStatus = response.applicationStatus;
    if (!["pending", "accepted", "rejected"].includes(selectedStatus)) {
      throw new Error("Сервер повернув невідоме рішення. Онови таблицю.");
    }
    row.querySelectorAll("[data-status]").forEach((item) => {
      const isSelected = item.dataset.status === selectedStatus;
      item.setAttribute("aria-pressed", String(isSelected));
      item.disabled = isSelected;
    });
    const state = row.querySelector(".decision-state");
    state.className = `decision-state decision-state-${selectedStatus}`;
    state.textContent = {
      accepted: "Прийнята",
      rejected: "Відхилена",
      pending: "На розгляді"
    }[selectedStatus];
    setStatus("Рішення збережено.");
  } catch (error) {
    buttons.forEach((item) => { item.disabled = false; });
    setStatus(error.message || "Не вдалося зберегти рішення.", "error");
  }
});

async function loadApplications(token) {
  setStatus("Завантажуємо заявки…");
  const response = await window.YakuzaAuth.request("listApplications", { token });
  if (response.status === "unauthorized") {
    sessionStorage.removeItem(SESSION_KEY);
    showLogin("Сеанс завершився. Увійди ще раз.", "error");
    return;
  }
  if (response.status !== "success" || !Array.isArray(response.applications)) {
    throw new Error("Не вдалося завантажити таблицю заявок.");
  }
  renderApplications(response.applications);
  loginForm.hidden = true;
  tableWrap.hidden = false;
  actions.hidden = false;
  setStatus(`Заявок: ${response.applications.length}`);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginButton.disabled = true;
  setStatus("Перевіряємо вхід…");

  try {
    const response = await window.YakuzaAuth.request("login", {
      email: document.querySelector("#applications-email").value.trim(),
      password: document.querySelector("#applications-password").value
    });
    document.querySelector("#applications-password").value = "";

    if (response.status === "configuration-error") {
      throw new Error("Облікові дані ще не налаштовані у властивостях Apps Script.");
    }
    if (response.status !== "success" || !response.token) {
      const message = response.status === "locked"
        ? "Забагато спроб входу. Спробуй ще раз через 15 хвилин."
        : "Неправильна електронна пошта або пароль.";
      setStatus(message, "error");
      return;
    }

    sessionStorage.setItem(SESSION_KEY, response.token);
    await loadApplications(response.token);
  } catch (error) {
    setStatus(error.message || "Не вдалося виконати вхід.", "error");
  } finally {
    loginButton.disabled = false;
  }
});

document.querySelector("#refresh-applications").addEventListener("click", async () => {
  const token = sessionStorage.getItem(SESSION_KEY);
  if (!token) return showLogin("Увійди, щоб переглядати заявки.", "error");
  try {
    await loadApplications(token);
  } catch (error) {
    setStatus(error.message || "Не вдалося оновити таблицю.", "error");
  }
});

document.querySelector("#logout-applications").addEventListener("click", async () => {
  const token = sessionStorage.getItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  try {
    if (token) await window.YakuzaAuth.request("logout", { token });
  } catch (error) {
    console.error("Unable to end Yakuza applications session:", error);
  }
  showLogin("Ви вийшли з кабінету.");
});

const savedToken = sessionStorage.getItem(SESSION_KEY);
if (savedToken) {
  window.YakuzaAuth.request("verify", { token: savedToken })
    .then((response) => {
      if (response.status === "success") return loadApplications(savedToken);
      sessionStorage.removeItem(SESSION_KEY);
      showLogin("Сеанс завершився. Увійди ще раз.", "error");
    })
    .catch((error) => showLogin(error.message || "Не вдалося перевірити сеанс.", "error"));
}
