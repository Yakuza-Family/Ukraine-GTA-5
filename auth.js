(() => {
  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyJ2mSoP3bdK6-P6m8tnhXbxNFr-HTE4UUCYoOoAHhDCZUXfTa2Bt-knIZ470z1oXI/exec";

  window.YakuzaAuth = {
    scriptUrl: SCRIPT_URL,
    request(action, values = {}) {
      return new Promise((resolve, reject) => {
        const requestId = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
        const form = document.createElement("form");
        form.method = "post";
        form.target = "yakuza-api-response";
        form.action = SCRIPT_URL;

        let timeout;
        const cleanup = () => {
          window.clearTimeout(timeout);
          window.removeEventListener("message", onMessage);
          form.remove();
        };
        const onMessage = (event) => {
          if (event.data?.requestId !== requestId) return;
          if (event.data.type !== "yakuza-api" && event.data.type !== "yakuza-application") return;
          cleanup();
          if (event.data.type === "yakuza-api") {
            resolve(event.data);
            return;
          }
          if (event.data.type === "yakuza-application") {
            reject(new Error("Опублікована версія Apps Script застаріла. Онови Code.gs і опублікуй нову версію вебзастосунку."));
          }
        };

        Object.entries({ action, ...values, requestId }).forEach(([name, value]) => {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = String(value);
          form.append(input);
        });

        window.addEventListener("message", onMessage);
        timeout = window.setTimeout(() => {
          cleanup();
          reject(new Error("Сервер не відповів. Перевір URL вебзастосунку й спробуй знову."));
        }, 30000);
        document.body.append(form);
        form.submit();
      });
    },
    async authenticate(email, password) {
      const response = await this.request("login", { email, password });
      return response.status === "success" && response.token
        ? response.token
        : "";
    }
  };
  const responseFrame = document.createElement("iframe");
  responseFrame.name = "yakuza-api-response";
  responseFrame.title = "Відповідь сервера Yakuza";
  responseFrame.hidden = true;
  document.addEventListener("DOMContentLoaded", () => document.body.append(responseFrame), { once: true });
})();
