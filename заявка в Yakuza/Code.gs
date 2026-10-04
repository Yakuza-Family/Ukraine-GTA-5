const APPLICATIONS_FILE_PROPERTY = "APPLICATIONS_DATA_FILE_ID";
const APPLICATIONS_FILE_NAME = "yakuza-applications.json";
const MEDIA_FILE_PROPERTY = "MEDIA_DATA_FILE_ID";
const MEDIA_FILE_NAME = "yakuza-media.json";

function doPost(event) {
  const values = event && event.parameter ? event.parameter : {};
  if (values.action === "login") return login_(values);
  if (values.action === "listMedia") return listMedia_(values.requestId);
  if (values.action === "addMedia") return addMedia_(values, values.requestId);
  if (values.action === "deleteMedia") {
    if (!isValidSession_(values.token)) return apiResponse_("unauthorized", {}, values.requestId);
    return deleteMedia_(values, values.requestId);
  }
  if (values.action === "verify" || values.action === "listApplications") {
    if (!isValidSession_(values.token)) return apiResponse_("unauthorized", {}, values.requestId);
    if (values.action === "verify") return apiResponse_("success", {}, values.requestId);
    return listApplications_(values.requestId);
  }
  if (values.action === "updateApplicationStatus") {
    if (!isValidSession_(values.token)) return apiResponse_("unauthorized", {}, values.requestId);
    return updateApplicationStatus_(values, values.requestId);
  }
  if (values.action === "logout") {
    logout_(values.token);
    return apiResponse_("success", {}, values.requestId);
  }
  if (values.action) return apiResponse_("unsupported-action", {}, values.requestId);

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
    return response_("invalid-age", values.requestId);
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const file = getApplicationsFile_(true);
    const applications = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
    if (!Array.isArray(applications)) throw new Error("Applications storage is not a list.");
    applications.push({
      id: Utilities.getUuid(),
      submittedAt: new Date().toISOString(),
      status: "pending",
      nickname: application.nickname,
      age: age,
      discord: application.discord,
      onlineTime: application.onlineTime,
      motivation: application.motivation,
      previousFamilies: application.previousFamilies
    });
    file.setContent(JSON.stringify(applications));
    return response_("success", values.requestId);
  } catch (error) {
    console.error("Unable to save Yakuza application: " + error);
    return response_("storage-error", values.requestId);
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
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const file = getApplicationsFile_(false);
    if (!file) return apiResponse_("success", { applications: [] }, requestId);
    const applications = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
    if (!Array.isArray(applications)) throw new Error("Applications storage is not a list.");
    let migrated = false;
    applications.forEach(function (application) {
      if (!application.id) {
        application.id = Utilities.getUuid();
        migrated = true;
      }
      if (!application.status) {
        application.status = "pending";
        migrated = true;
      }
    });
    if (migrated) file.setContent(JSON.stringify(applications));
    return apiResponse_("success", { applications: applications }, requestId);
  } catch (error) {
    console.error("Unable to load Yakuza applications: " + error);
    return apiResponse_("error", {}, requestId);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function updateApplicationStatus_(values, requestId) {
  const allowedStatuses = ["pending", "accepted", "rejected"];
  const applicationId = String(values.applicationId || "");
  const status = String(values.status || "");
  if (!applicationId || applicationId.length > 100 || allowedStatuses.indexOf(status) === -1) {
    return apiResponse_("error", {}, requestId);
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const file = getApplicationsFile_(false);
    if (!file) return apiResponse_("not-found", {}, requestId);
    const applications = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
    if (!Array.isArray(applications)) throw new Error("Applications storage is not a list.");
    const application = applications.find(function (item) {
      return item.id === applicationId;
    });
    if (!application) return apiResponse_("not-found", {}, requestId);

    application.status = status;
    file.setContent(JSON.stringify(applications));
    return apiResponse_("success", { applicationId: applicationId, applicationStatus: status }, requestId);
  } catch (error) {
    console.error("Unable to update Yakuza application status: " + error);
    return apiResponse_("error", {}, requestId);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function getApplicationsFile_(createIfMissing) {
  const properties = PropertiesService.getScriptProperties();
  const fileId = properties.getProperty(APPLICATIONS_FILE_PROPERTY);
  if (fileId) return DriveApp.getFileById(fileId);
  if (!createIfMissing) return null;

  const file = DriveApp.createFile(APPLICATIONS_FILE_NAME, "[]", MimeType.PLAIN_TEXT);
  properties.setProperty(APPLICATIONS_FILE_PROPERTY, file.getId());
  return file;
}

function listMedia_(requestId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const file = getMediaFile_(false);
    if (!file) return apiResponse_("success", { media: [] }, requestId);
    const media = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
    if (!Array.isArray(media)) throw new Error("Media storage is not a list.");
    return apiResponse_("success", { media: media }, requestId);
  } catch (error) {
    console.error("Unable to load Yakuza media: " + error);
    return apiResponse_("error", {}, requestId);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function addMedia_(values, requestId) {
  const name = clean_(values.name, 200);
  const kind = String(values.kind || "");
  const url = String(values.url || "").trim();
  if (!name || (kind !== "image" && kind !== "video") || url.length > 2000 ||
      !/^https?:\/\/[^\s]+$/i.test(url)) {
    return apiResponse_("invalid-media", {}, requestId);
  }

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const file = getMediaFile_(true);
    const media = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
    if (!Array.isArray(media)) throw new Error("Media storage is not a list.");
    const record = {
      id: Utilities.getUuid(),
      name: name,
      kind: kind,
      size: 0,
      createdAt: Date.now(),
      url: url
    };
    media.push(record);
    file.setContent(JSON.stringify(media));
    return apiResponse_("success", { record: record }, requestId);
  } catch (error) {
    console.error("Unable to save Yakuza media: " + error);
    return apiResponse_("error", {}, requestId);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function deleteMedia_(values, requestId) {
  const mediaId = String(values.mediaId || "");
  if (!mediaId || mediaId.length > 100) return apiResponse_("invalid-media", {}, requestId);

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const file = getMediaFile_(false);
    if (!file) return apiResponse_("not-found", {}, requestId);
    const media = JSON.parse(file.getBlob().getDataAsString("UTF-8"));
    if (!Array.isArray(media)) throw new Error("Media storage is not a list.");
    const remainingMedia = media.filter(function (record) {
      return record.id !== mediaId;
    });
    if (remainingMedia.length === media.length) return apiResponse_("not-found", {}, requestId);
    file.setContent(JSON.stringify(remainingMedia));
    return apiResponse_("success", {}, requestId);
  } catch (error) {
    console.error("Unable to delete Yakuza media: " + error);
    return apiResponse_("error", {}, requestId);
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function getMediaFile_(createIfMissing) {
  const properties = PropertiesService.getScriptProperties();
  const fileId = properties.getProperty(MEDIA_FILE_PROPERTY);
  if (fileId) return DriveApp.getFileById(fileId);
  if (!createIfMissing) return null;

  const file = DriveApp.createFile(MEDIA_FILE_NAME, "[]", MimeType.PLAIN_TEXT);
  properties.setProperty(MEDIA_FILE_PROPERTY, file.getId());
  return file;
}

function setupApplicationsStorage() {
  getApplicationsFile_(true);
  Logger.log("Приватне сховище заявок створено на Google Drive власника скрипту.");
}

function clean_(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
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
  const script = "window.parent.parent.parent.parent.postMessage(JSON.parse(" + payload + "), '*');";
  const html = '<!doctype html><html><body><script>'
    + script
    + '</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
