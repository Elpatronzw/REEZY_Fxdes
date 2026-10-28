/**
 * Reezy Fxdes booking backend (Google Apps Script, attached to a Google Sheet).
 *
 * - Saves bookings from the website into the "Bookings" sheet
 * - Refuses double bookings (same barber, day and time)
 * - Sends a WhatsApp alert for each new booking, and a reminder 15 minutes before it,
 *   to both shop numbers (through CallMeBot)
 * - Gives the barbers' portal the list of bookings (protected by a PIN)
 *
 * Setup steps are in backend/SETUP.md.
 */

// ==== Fill these in ====
const PORTAL_PIN = "CHANGE-ME";            // PIN the barbers type to open the portal
const SHOP_PHONES = [
  // CallMeBot API keys: each number gets its own key (see SETUP.md). Leave "" to skip that number.
  { phone: "+263719515630", apikey: "" },
  { phone: "+263782807245", apikey: "" },
];
// Email addresses that also get new-booking alerts and reminders (Gmail notifies the phone).
// Example: ["reezy@gmail.com", "brian@gmail.com"]. Leave [] for no emails.
const ALERT_EMAILS = [];
// ==== End of settings ====

const SHEET_NAME = "Bookings";
const HEADERS = ["id", "createdAt", "date", "time", "barber", "service", "name", "phone", "notes", "status", "reminded"];
const TZ = "Africa/Harare";
const REMINDER_MINUTES = 15;

// ---------- Web endpoints ----------

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === "slots") return json_({ ok: true, booked: bookedSlots_(p.date) });
    if (p.action === "list") {
      if (p.pin !== PORTAL_PIN) return json_({ ok: false, error: "pin" });
      return json_({ ok: true, bookings: listBookings_() });
    }
    return json_({ ok: true, service: "Reezy Fxdes bookings" });
  } catch (err) {
    return json_({ ok: false, error: "server", message: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (body.action === "book") return json_(book_(body));
    if (body.action === "status") {
      if (body.pin !== PORTAL_PIN) return json_({ ok: false, error: "pin" });
      return json_(setStatus_(body.id, body.status));
    }
    return json_({ ok: false, error: "unknown_action" });
  } catch (err) {
    return json_({ ok: false, error: "server", message: String(err) });
  }
}

// ---------- Bookings ----------

function book_(b) {
  const clean = {
    date: str_(b.date).slice(0, 10),
    time: str_(b.time).slice(0, 5),
    barber: str_(b.barber).slice(0, 40),
    service: str_(b.service).slice(0, 120),
    name: str_(b.name).slice(0, 80),
    phone: str_(b.phone).slice(0, 30),
    notes: str_(b.notes).slice(0, 500),
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean.date) || !/^\d{2}:\d{2}$/.test(clean.time) ||
      !clean.barber || !clean.service || !clean.name || !clean.phone) {
    return { ok: false, error: "invalid" };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const taken = rows_().some((r) => r.status !== "cancelled" &&
      r.date === clean.date && r.time === clean.time && r.barber === clean.barber);
    if (taken) return { ok: false, error: "taken" };

    const id = Utilities.getUuid().slice(0, 8);
    const created = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm");
    sheet_().appendRow([id, created, clean.date, clean.time, clean.barber, clean.service,
      clean.name, clean.phone, clean.notes, "booked", ""]);
    SpreadsheetApp.flush();

    notify_([
      "*New booking - Reezy Fxdes*",
      clean.service + " with " + clean.barber,
      prettyDate_(clean.date) + " at " + pretty12h_(clean.time),
      "Client: " + clean.name + " (" + clean.phone + ")",
      clean.notes ? "Notes: " + clean.notes : "",
    ].filter(String).join("\n"));

    return { ok: true, id: id };
  } finally {
    lock.releaseLock();
  }
}

function bookedSlots_(date) {
  date = str_(date).slice(0, 10);
  return rows_()
    .filter((r) => r.date === date && r.status !== "cancelled")
    .map((r) => ({ time: r.time, barber: r.barber }));   // no client details
}

function listBookings_() {
  const from = Utilities.formatDate(new Date(Date.now() - 7 * 864e5), TZ, "yyyy-MM-dd");
  return rows_()
    .filter((r) => r.date >= from)
    .map((r) => ({ id: r.id, date: r.date, time: r.time, barber: r.barber, service: r.service,
                   name: r.name, phone: r.phone, notes: r.notes, status: r.status }))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

function setStatus_(id, status) {
  if (["booked", "done", "cancelled"].indexOf(status) < 0) return { ok: false, error: "invalid" };
  const row = rows_().filter((r) => r.id === String(id))[0];
  if (!row) return { ok: false, error: "not_found" };
  sheet_().getRange(row._row, HEADERS.indexOf("status") + 1).setValue(status);
  return { ok: true };
}

// ---------- Reminders (runs every 5 minutes, see setup()) ----------

function sendReminders() {
  const now = Date.now();
  const sh = sheet_();
  rows_().forEach((r) => {
    if (r.status !== "booked" || r.reminded === "yes") return;
    const start = Utilities.parseDate(r.date + " " + r.time, TZ, "yyyy-MM-dd HH:mm").getTime();
    const minsUntil = (start - now) / 60000;
    if (minsUntil > 0 && minsUntil <= REMINDER_MINUTES + 1) {
      notify_([
        "*Reminder - booking in " + Math.round(minsUntil) + " min*",
        r.service + " with " + r.barber + " at " + pretty12h_(r.time),
        "Client: " + r.name + " (" + r.phone + ")",
      ].join("\n"));
      sh.getRange(r._row, HEADERS.indexOf("reminded") + 1).setValue("yes");
    }
  });
}

// ---------- One-time setup: run this once from the Apps Script editor ----------

function setup() {
  sheet_();
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === "sendReminders")
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("sendReminders").timeBased().everyMinutes(5).create();
  // Also checks that WhatsApp / email alerts work
  notify_("*Reezy Fxdes bookings are connected*\nYou'll get booking alerts and reminders here.");
}

// ---------- Helpers ----------

function notify_(text) {
  if (ALERT_EMAILS.length) {
    const subject = text.split("\n")[0].replace(/\*/g, "");
    try { MailApp.sendEmail(ALERT_EMAILS.join(","), subject, text.replace(/\*/g, "")); } catch (err) { console.log(err); }
  }
  SHOP_PHONES.forEach((p) => {
    if (!p.apikey) return;
    const url = "https://api.callmebot.com/whatsapp.php?phone=" + encodeURIComponent(p.phone) +
      "&text=" + encodeURIComponent(text) + "&apikey=" + encodeURIComponent(p.apikey);
    try { UrlFetchApp.fetch(url, { muteHttpExceptions: true }); } catch (err) { console.log(err); }
  });
}

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.getRange("A:K").setNumberFormat("@");   // plain text, so dates and times aren't converted
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function rows_() {
  const values = sheet_().getDataRange().getValues();
  const head = values.shift() || [];
  return values.map((v, i) => {
    const o = { _row: i + 2 };
    head.forEach((h, j) => { o[h] = cell_(v[j], h); });
    return o;
  });
}

// Sheets may still turn typed-in values into dates; read them back as text
function cell_(v, header) {
  if (v instanceof Date) {
    if (header === "date") return Utilities.formatDate(v, TZ, "yyyy-MM-dd");
    if (header === "time") return Utilities.formatDate(v, TZ, "HH:mm");
    return Utilities.formatDate(v, TZ, "yyyy-MM-dd HH:mm");
  }
  return String(v);
}

function str_(v) { return v == null ? "" : String(v).trim(); }

function prettyDate_(iso) {
  return Utilities.formatDate(Utilities.parseDate(iso, TZ, "yyyy-MM-dd"), TZ, "EEE d MMM");
}

function pretty12h_(t) {
  const h = Number(t.slice(0, 2)), m = t.slice(3, 5);
  return ((h % 12) || 12) + ":" + m + (h < 12 ? " AM" : " PM");
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
