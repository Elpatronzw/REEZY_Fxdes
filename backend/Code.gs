/**
 * Reezy Fxdes booking backend (Google Apps Script, attached to a Google Sheet).
 *
 * - Saves bookings from the website into the "Bookings" sheet
 * - Refuses double bookings (same barber, with times that overlap; each service has its own length)
 * - Sends a WhatsApp alert for each new booking, and a reminder 15 minutes before it,
 *   to both shop numbers (through CallMeBot)
 * - Gives the barbers' portal the list of bookings and report data (protected by a PIN)
 * - Stores the website's price list, gallery photos and opening hours, edited from the
 *   portal's Settings (saved in a "Site" tab; photos go to a public Google Drive folder)
 * - Gives the portal the clients not yet saved to the phone's contacts, and remembers
 *   which numbers have been saved (in a "Contacts" tab) so they are never offered twice
 *
 * Setup steps are in backend/SETUP.md.
 * Settings (PIN, phones, emails) live in the separate "Settings" file (backend/Settings.gs).
 */

const SHEET_NAME = "Bookings";
const HEADERS = ["id", "createdAt", "date", "time", "barber", "service", "name", "phone", "notes", "status", "reminded", "minutes"];
const TZ = "Africa/Harare";
const REMINDER_MINUTES = 15;
// Length assumed for bookings saved before services had their own length
const DEFAULT_MINUTES = 30;

// ---------- Web endpoints ----------

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === "slots") return json_({ ok: true, booked: bookedSlots_(p.date) });
    if (p.action === "config") return json_({ ok: true, config: getConfig_() });
    if (p.action === "list") {
      if (p.pin !== PORTAL_PIN) return json_({ ok: false, error: "pin" });
      return json_({ ok: true, bookings: listBookings_() });
    }
    if (p.action === "report") {
      if (p.pin !== PORTAL_PIN) return json_({ ok: false, error: "pin" });
      return json_({ ok: true, rows: reportRows_(p.from, p.to) });
    }
    if (p.action === "contacts") {
      if (p.pin !== PORTAL_PIN) return json_({ ok: false, error: "pin" });
      return json_(newContacts_());
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
    if (body.action === "saveConfig" || body.action === "upload" || body.action === "deletePhoto") {
      if (body.pin !== PORTAL_PIN) return json_({ ok: false, error: "pin" });
      if (body.action === "saveConfig") return json_(saveConfig_(body.config));
      if (body.action === "upload") return json_(uploadPhoto_(body));
      return json_(deletePhoto_(body.id));
    }
    if (body.action === "contactsSaved") {
      if (body.pin !== PORTAL_PIN) return json_({ ok: false, error: "pin" });
      return json_(markContactsSaved_(body.phones));
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
    minutes: minutesOf_(b.minutes),
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean.date) || !/^\d{2}:\d{2}$/.test(clean.time) ||
      !clean.barber || !clean.service || !clean.name || !clean.phone) {
    return { ok: false, error: "invalid" };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const taken = rows_().some((r) => r.status !== "cancelled" && overlaps_(r, clean));
    if (taken) return { ok: false, error: "taken" };

    const id = Utilities.getUuid().slice(0, 8);
    const created = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm");
    sheet_().appendRow([id, created, clean.date, clean.time, clean.barber, clean.service,
      clean.name, clean.phone, clean.notes, "booked", "", String(clean.minutes)]);
    SpreadsheetApp.flush();

    notify_([
      "*New booking - Reezy Fxdes*",
      clean.service + " with " + clean.barber,
      prettyDate_(clean.date) + ", " + prettyRange_(clean.time, clean.minutes),
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
    .map((r) => ({ time: r.time, barber: r.barber, minutes: minutesOf_(r.minutes) }));   // no client details
}

function listBookings_() {
  const from = Utilities.formatDate(new Date(Date.now() - 7 * 864e5), TZ, "yyyy-MM-dd");
  return rows_()
    .filter((r) => r.date >= from)
    .map((r) => ({ id: r.id, date: r.date, time: r.time, minutes: minutesOf_(r.minutes), barber: r.barber, service: r.service,
                   name: r.name, phone: r.phone, notes: r.notes, status: r.status }))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

// Bookings between two dates (inclusive) for the portal's reports. No client details.
function reportRows_(from, to) {
  from = str_(from).slice(0, 10);
  to = str_(to).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return [];
  return rows_()
    .filter((r) => r.date >= from && r.date <= to && r.status !== "cancelled")
    .map((r) => ({ date: r.date, time: r.time, minutes: minutesOf_(r.minutes), barber: r.barber,
                   service: r.service, status: r.status }));
}

function setStatus_(id, status) {
  if (["booked", "done", "cancelled"].indexOf(status) < 0) return { ok: false, error: "invalid" };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const all = rows_();
    const row = all.filter((r) => r.id === String(id))[0];
    if (!row) return { ok: false, error: "not_found" };
    const prev = row.status;
    if (prev === status) return { ok: true };

    // Restoring a cancelled booking: only if nobody else has taken that time since
    if (status === "booked" && prev === "cancelled") {
      const taken = all.some((r) => r.id !== row.id && r.status !== "cancelled" && overlaps_(r, row));
      if (taken) return { ok: false, error: "taken" };
    }

    sheet_().getRange(row._row, HEADERS.indexOf("status") + 1).setValue(status);
    SpreadsheetApp.flush();

    const what = row.service + " with " + row.barber + "\n" +
      prettyDate_(row.date) + ", " + prettyRange_(row.time, minutesOf_(row.minutes)) + "\n" +
      "Client: " + row.name + " (" + row.phone + ")";
    if (status === "cancelled") notify_("*Barber cancelled - Reezy Fxdes*\n" + what + "\nThis time is free again on the website.");
    if (status === "booked" && prev === "cancelled") notify_("*Booking restored - Reezy Fxdes*\n" + what);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
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
        r.service + " with " + r.barber + ", " + prettyRange_(r.time, minutesOf_(r.minutes)),
        "Client: " + r.name + " (" + r.phone + ")",
      ].join("\n"));
      sh.getRange(r._row, HEADERS.indexOf("reminded") + 1).setValue("yes");
    }
  });
}

// ---------- Website settings: price list, gallery, opening hours ----------
// Each section is saved as JSON in the "Site" tab (column A = section, column B = JSON).
// A section that was never saved is left out, and the website keeps its built-in version.

const SITE_SHEET = "Site";
const CONFIG_SECTIONS = ["services", "gallery", "hours"];
const PHOTO_FOLDER = "Reezy Fxdes Gallery";

function siteSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SITE_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SITE_SHEET);
    sh.getRange("A:B").setNumberFormat("@");
    sh.appendRow(["section", "json"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function getConfig_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get("config");
  if (hit) return JSON.parse(hit);
  const out = {};
  siteSheet_().getDataRange().getValues().slice(1).forEach((r) => {
    if (CONFIG_SECTIONS.indexOf(String(r[0])) < 0) return;
    try { out[r[0]] = JSON.parse(String(r[1])); } catch (err) { /* skip a damaged cell */ }
  });
  cache.put("config", JSON.stringify(out), 600);
  return out;
}

function saveConfig_(config) {
  config = config || {};
  const clean = {};
  try {
    if (config.services !== undefined) clean.services = cleanServices_(config.services);
    if (config.gallery !== undefined) clean.gallery = cleanGallery_(config.gallery);
    if (config.hours !== undefined) clean.hours = cleanHours_(config.hours);
  } catch (err) {
    return { ok: false, error: "invalid", message: String(err.message || err) };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = siteSheet_();
    const keys = sh.getDataRange().getValues().map((r) => String(r[0]));
    Object.keys(clean).forEach((k) => {
      const json = JSON.stringify(clean[k]);
      const at = keys.indexOf(k);
      if (at > 0) sh.getRange(at + 1, 2).setValue(json);
      else { sh.appendRow([k, json]); keys.push(k); }
    });
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove("config");
  } finally {
    lock.releaseLock();
  }
  return { ok: true, config: getConfig_() };
}

function text_(v, max) { return str_(v).replace(/\s+/g, " ").slice(0, max); }

function cleanServices_(list) {
  if (!Array.isArray(list) || !list.length || list.length > 60) throw new Error("The price list needs 1 to 60 services.");
  return list.map((s, i) => {
    const name = text_(s.name, 80), group = text_(s.group, 30) || "Services";
    const price = Math.round(Number(s.price) * 100) / 100;
    const minutes = Math.round(Number(s.minutes) / 15) * 15;
    if (!name) throw new Error("Service " + (i + 1) + " needs a name.");
    if (!(price >= 0 && price <= 10000)) throw new Error(name + " needs a price.");
    if (!(minutes >= 15 && minutes <= 240)) throw new Error(name + " needs a length between 15 minutes and 4 hours.");
    const o = { group: group, name: name, price: price, minutes: minutes };
    if (text_(s.unit, 20)) o.unit = text_(s.unit, 20);
    if (text_(s.note, 120)) o.note = text_(s.note, 120);
    if (s.needsAddress) o.needsAddress = true;
    return o;
  });
}

function cleanGallery_(list) {
  if (!Array.isArray(list) || list.length > 60) throw new Error("The gallery can hold up to 60 photos.");
  return list.map((p) => {
    const src = str_(p.src).slice(0, 300);
    if (!/^assets\/gallery\/[\w.-]+$/.test(src) && !/^https:\/\/lh3\.googleusercontent\.com\/d\/[\w-]+(=[\w-]+)?$/.test(src)) {
      throw new Error("A gallery photo has an unknown address.");
    }
    const o = { src: src, caption: text_(p.caption, 100) || "Fresh cut at VIP Classic" };
    if (/^[\w-]{10,}$/.test(str_(p.id))) o.id = str_(p.id);
    return o;
  });
}

function cleanHours_(hours) {
  const out = {};
  for (let d = 0; d < 7; d++) {
    const h = hours && hours[d];
    if (!h) { out[d] = null; continue; }
    const open = str_(h.open), close = str_(h.close);
    if (!/^\d{2}:\d{2}$/.test(open) || !/^\d{2}:\d{2}$/.test(close) || mins_(open) >= mins_(close)) {
      throw new Error("Opening hours: closing time must be after opening time.");
    }
    out[d] = { open: open, close: close };
  }
  return out;
}

function photoFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("PHOTO_FOLDER_ID");
  if (id) { try { return DriveApp.getFolderById(id); } catch (err) { /* deleted: make a new one */ } }
  const folder = DriveApp.createFolder(PHOTO_FOLDER);
  props.setProperty("PHOTO_FOLDER_ID", folder.getId());
  return folder;
}

// A photo from the portal (already shrunk by the phone), saved to Drive and shared view-only
function uploadPhoto_(b) {
  const mime = str_(b.mime);
  const data = str_(b.data);
  if (["image/jpeg", "image/png", "image/webp"].indexOf(mime) < 0) return { ok: false, error: "invalid", message: "Only photos can be added." };
  if (!data || data.length > 8000000) return { ok: false, error: "invalid", message: "That photo is too large." };
  const name = "cut-" + Utilities.formatDate(new Date(), TZ, "yyyyMMdd-HHmmss") + "-" + Utilities.getUuid().slice(0, 4) + ".jpg";
  const blob = Utilities.newBlob(Utilities.base64Decode(data), mime, name);
  const file = photoFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, id: file.getId(), src: "https://lh3.googleusercontent.com/d/" + file.getId() + "=w1600" };
}

// Moves an uploaded photo to the Drive bin (only photos in the gallery folder)
function deletePhoto_(id) {
  id = str_(id);
  if (!/^[\w-]{10,}$/.test(id)) return { ok: false, error: "invalid" };
  try {
    const file = DriveApp.getFileById(id);
    const folderId = photoFolder_().getId();
    let inFolder = false;
    const parents = file.getParents();
    while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
    if (inFolder) file.setTrashed(true);
  } catch (err) { /* already gone */ }
  return { ok: true };
}

// Run once from the editor after updating, so Google asks for the new Drive permission
function authorize() {
  photoFolder_();
  siteSheet_();
  console.log("Ready: gallery folder and Site tab are set up.");
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

// ---------- Contacts saved to the phone ----------

const CONTACTS_SHEET = "Contacts";

function contactsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(CONTACTS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(CONTACTS_SHEET);
    sh.getRange("A:C").setNumberFormat("@");
    sh.appendRow(["phone", "name", "savedAt"]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// One way of writing each number, so 0771 234 567 and +263 77 123 4567 count as the same client
function phoneKey_(p) {
  let d = str_(p).replace(/\D/g, "");
  if (d.indexOf("00") === 0) d = d.slice(2);
  if (d.indexOf("0") === 0) d = "263" + d.slice(1);
  else if (d.length === 9 && d.charAt(0) === "7") d = "263" + d;   // 77 123 4567 typed without the 0
  return d;
}

function savedPhones_() {
  const set = {};
  contactsSheet_().getDataRange().getValues().slice(1).forEach((r) => { if (r[0]) set[phoneKey_(r[0])] = true; });
  return set;
}

// Everyone who has ever booked and isn't in the phone's contacts yet, newest name for each number
function newContacts_() {
  const saved = savedPhones_();
  const byPhone = {};
  rows_().forEach((r) => {
    const key = phoneKey_(r.phone);
    if (key.length < 9 || saved[key] || !str_(r.name)) return;
    const when = str_(r.createdAt);
    if (!byPhone[key] || when >= byPhone[key].when) byPhone[key] = { phone: "+" + key, name: text_(r.name, 80), when: when };
  });
  const contacts = Object.keys(byPhone).map((k) => ({ phone: byPhone[k].phone, name: byPhone[k].name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ok: true, contacts: contacts, savedCount: Object.keys(saved).length };
}

function markContactsSaved_(phones) {
  if (!Array.isArray(phones) || !phones.length) return { ok: false, error: "invalid", message: "No contacts to mark." };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const saved = savedPhones_();
    const names = {};
    rows_().forEach((r) => { names[phoneKey_(r.phone)] = text_(r.name, 80); });
    const now = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm");
    const add = [];
    phones.slice(0, 5000).forEach((p) => {
      const key = phoneKey_(p);
      if (key.length < 9 || saved[key]) return;
      saved[key] = true;
      add.push(["+" + key, names[key] || "", now]);
    });
    if (add.length) {
      const sh = contactsSheet_();
      sh.getRange(sh.getLastRow() + 1, 1, add.length, 3).setValues(add);
    }
    return { ok: true, added: add.length };
  } finally {
    lock.releaseLock();
  }
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
  // Sheets made before a column was added: add the missing headers at the end
  const head = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
  HEADERS.filter((h) => head.indexOf(h) < 0).forEach((h) => {
    const col = sh.getLastColumn() + 1;
    sh.getRange(1, col, sh.getMaxRows(), 1).setNumberFormat("@");
    sh.getRange(1, col).setValue(h);
  });
  return sh;
}

// Two bookings clash if they are on the same day with the same barber and their times overlap
function overlaps_(a, b) {
  if (a.date !== b.date || a.barber !== b.barber) return false;
  const aStart = mins_(a.time), aEnd = aStart + minutesOf_(a.minutes);
  const bStart = mins_(b.time), bEnd = bStart + minutesOf_(b.minutes);
  return aStart < bEnd && bStart < aEnd;
}

// A booking's length in minutes (old bookings have none saved)
function minutesOf_(v) {
  const n = Math.round(Number(v));
  return n >= 15 && n <= 240 ? n : DEFAULT_MINUTES;
}

function mins_(t) { return Number(String(t).slice(0, 2)) * 60 + Number(String(t).slice(3, 5)); }

function prettyRange_(t, minutes) {
  const end = mins_(t) + minutes;
  const hhmm = ("0" + Math.floor(end / 60)).slice(-2) + ":" + ("0" + (end % 60)).slice(-2);
  return pretty12h_(t) + " - " + pretty12h_(hhmm);
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
