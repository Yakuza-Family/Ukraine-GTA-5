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
  if (values.website) return response_("success");

  const application = {
    nickname: clean_(values.nickname, 60),
    age: clean_(values.age, 3),
    discord: clean_(values.discord, 80),
    onlineTime: clean_(values.onlineTime, 100),
    motivation: clean_(values.motivation, 1000),
    previousFamilies: clean_(values.previousFamilies, 1000)
  };

  const age = Number(application.age);
  if (
    !application.nickname
    || !application.discord
    || !application.motivation
    || !Number.isInteger(age)
    || age < 1
    || age > 100
    || values.consent !== "on"
  ) {
    return response_("error");
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
    return response_("success");
  } catch (error) {
    console.error("Unable to save Yakuza application: " + error);
    return response_("error");
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}

function clean_(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeCell_(value) {
  return /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
}

function response_(status) {
  const html = '<!doctype html><html><body><script>'
    + 'window.parent.postMessage({type:"yakuza-application",status:"' + status + '"},"*");'
    + '</script></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
