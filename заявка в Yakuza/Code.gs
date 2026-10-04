const SPREADSHEET_ID = "144NFN1wzg4xji8kz4RtDKn-fJQkwz-N-7RrtjmUesmo";
const SHEET_NAME = "Заявки Yakuza";
const HEADERS = [
  "Час подання",
  "Ігровий нік",
  "Вік",
  "Discord",
  "Коли онлайн",
  "Мотивація",
  "Попередні сім'ї"
];

function doPost(event) {
  const values = event && event.parameter ? event.parameter : {};
  if (values.action === "login") return login_(values);
  if (values.action === "verify" || values.action === "listApplications") {
    if (!isValidSession_(values.token)) return apiResponse_("unauthorized", {}, values.requestId);
    if (values.action === "verify") return apiResponse_("success", {}, values.requestId);
    return listApplications_(values.requestId);
  }
  if (values.action === "logout") {
    logout_(values.token);
    return apiResponse_("success", {}, values.requestId);
  }

  if (values.website) return response_("success", values.requestId);

  const application = {
    nickname: clean_(values.nickname, 60),
    age: clean_(values.age, 3),
    discord: clean_(values.discord, 80),
    onlineTime: clean_(values.onlineTime, 100),
    motivation: clean_(values.motivation, 1000),
    previousFamilies: clean_(values.previousFamilies, 1000)
  };

  const age = application.age ? Number(application.age) : "";
  if (application.age && (!Number.isInteger(age) || age < 1 || age > 100)) {
    return response_("error", values.requestId);
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) sheet = spreadsheet.insertSheet(SHEET_NAME);

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      sheet.setFrozenRows(1);
    } else {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    }

    const row = [
      new Date(),
      safeCell_(application.nickname),
      age,
      safeCell_(application.discord),
      safeCell_(application.onlineTime),
      safeCell_(application.motivation),
      safeCell_(application.previousFamilies)
    ];
    sheet.appendRow(row);
    return response_("success", values.requestId);
  } catch (error) {
    console.error("Unable to save Yakuza application: " + error);
    return response_("error", values.requestId);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function login_(values) {
  const properties = PropertiesService.getScriptProperties();
  const expectedEmail = String(properties.getProperty("APPLICATIONS_ADMIN_EMAIL") || "").trim().toLowerCase();
  const expectedPassword = properties.getProperty("APPLICATIONS_ADMIN_PASSWORD") || "";
  const email = String(values.email || "").trim().toLowerCase().slice(0, 254);
  const password = String(values.password || "").slice(0, 256);

  if (!expectedEmail || !expectedPassword) return apiResponse_("configuration-error", {}, values.requestId);
  const cache = CacheService.getScriptCache();
  const attemptKey = "applications-login-fail:" + digest_(email);
  const failedAttempts = Number(cache.get(attemptKey) || 0);
  if (failedAttempts >= 5) return apiResponse_("locked", {}, values.requestId);
  if (email !== expectedEmail || password !== expectedPassword) {
    cache.put(attemptKey, String(failedAttempts + 1), 900);
    return apiResponse_("error", {}, values.requestId);
  }

  cache.remove(attemptKey);
  const token = Utilities.getUuid() + Utilities.getUuid();
  cache.put("applications-session:" + token, email, 21600);
  return apiResponse_("success", { token: token }, values.requestId);
}

function digest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function (byte) {
      return ("0" + ((byte + 256) % 256).toString(16)).slice(-2);
    })
    .join("");
}

function isValidSession_(token) {
  if (!token || String(token).length > 100) return false;
  return Boolean(CacheService.getScriptCache().get("applications-session:" + token));
}

function logout_(token) {
  if (token && String(token).length <= 100) {
    CacheService.getScriptCache().remove("applications-session:" + token);
  }
}

function listApplications_(requestId) {
  try {
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) return apiResponse_("success", { applications: [] }, requestId);

    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getDisplayValues();
    const applications = rows.map(function (row) {
      return {
        submittedAt: row[0],
        nickname: row[1],
        age: row[2],
        discord: row[3],
        onlineTime: row[4],
        motivation: row[5],
        previousFamilies: row[6]
      };
    });
    return apiResponse_("success", { applications: applications }, requestId);
  } catch (error) {
    console.error("Unable to load Yakuza applications: " + error);
    return apiResponse_("error", {}, requestId);
  }
}

function clean_(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeCell_(value) {
  return /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
}

function response_(status, requestId) {
  return htmlResponse_({ type: "yakuza-application", status: status, requestId: requestId || "" });
}

function apiResponse_(status, details, requestId) {
  return htmlResponse_(Object.assign(
    { type: "yakuza-api", status: status, requestId: requestId || "" },
    details || {}
  ));
}

function htmlResponse_(message) {
  const payload = JSON.stringify(JSON.stringify(message));
  const html = '<!doctype html><html><body><script>'
    + 'window.parent.parent.parent.postMessage(JSON.parse(' + payload + '),"*");'
    + '</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
