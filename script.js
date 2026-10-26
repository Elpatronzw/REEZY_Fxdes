// ==== Shop settings: edit these ====

// WhatsApp number in international format, digits only
const WHATSAPP_NUMBER = "263719515630";

// Services and prices. Set price to a number (e.g. 5) once known; null shows "TBA".
const SERVICES = [
  { name: "Haircut", desc: "Classic cut, styled to finish.", price: null },
  { name: "Fade", desc: "Low, mid, high or skin fade.", price: null },
  { name: "Fade + Beard", desc: "Fade with beard shape-up and line.", price: null },
  { name: "Beard Trim", desc: "Shape, line and tidy.", price: null },
  { name: "Line-up / Shape-up", desc: "Sharp edges around the hairline.", price: null },
  { name: "Kids Cut", desc: "For under 12s.", price: null },
  { name: "Women's Cut", desc: "Cuts, fades and shaping for women.", price: null },
];

const CURRENCY = "$";

// Opening hours per weekday (0 = Sunday). null = closed. Times are 24h "HH:MM".
const HOURS = {
  0: null,
  1: { open: "08:00", close: "18:00" },
  2: { open: "08:00", close: "18:00" },
  3: { open: "08:00", close: "18:00" },
  4: { open: "08:00", close: "18:00" },
  5: { open: "08:00", close: "19:00" },
  6: { open: "08:00", close: "19:00" },
};

// Length of each booking slot, in minutes
const SLOT_MINUTES = 30;

// ==== End of settings ====

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const formatPrice = (p) => (p == null ? "TBA" : `${CURRENCY}${p}`);

// Services list
const servicesList = document.getElementById("services-list");
const serviceSelect = document.getElementById("service");
SERVICES.forEach((s) => {
  const li = document.createElement("li");
  li.className = "service";
  li.innerHTML = `
    <div>
      <h3>${s.name}</h3>
      <p class="muted">${s.desc}</p>
    </div>
    <span class="service__price">${formatPrice(s.price)}</span>`;
  servicesList.appendChild(li);

  const opt = document.createElement("option");
  opt.value = s.name;
  opt.textContent = s.price == null ? s.name : `${s.name} (${formatPrice(s.price)})`;
  serviceSelect.appendChild(opt);
});

// Hours list (Monday first)
const hoursList = document.getElementById("hours-list");
[1, 2, 3, 4, 5, 6, 0].forEach((d) => {
  const h = HOURS[d];
  const li = document.createElement("li");
  li.innerHTML = `<span>${DAY_NAMES[d]}</span><span>${h ? `${h.open} – ${h.close}` : "Closed"}</span>`;
  hoursList.appendChild(li);
});

// Date: no past dates
const dateInput = document.getElementById("date");
const timeSelect = document.getElementById("time");
const toISODate = (d) => {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 10);
};
dateInput.min = toISODate(new Date());

// Time slots for the picked date
const toMinutes = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
const toHHMM = (mins) =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

dateInput.addEventListener("change", () => {
  timeSelect.innerHTML = "";
  if (!dateInput.value) {
    timeSelect.innerHTML = '<option value="">Pick a date first</option>';
    return;
  }
  const picked = new Date(dateInput.value + "T00:00");
  const hours = HOURS[picked.getDay()];
  if (!hours) {
    timeSelect.innerHTML = '<option value="">Closed on this day</option>';
    return;
  }

  const now = new Date();
  const isToday = dateInput.value === toISODate(now);
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const slots = [];
  for (let m = toMinutes(hours.open); m + SLOT_MINUTES <= toMinutes(hours.close); m += SLOT_MINUTES) {
    if (!isToday || m > nowMins) slots.push(toHHMM(m));
  }

  if (!slots.length) {
    timeSelect.innerHTML = '<option value="">No slots left today</option>';
    return;
  }
  timeSelect.innerHTML = '<option value="">Choose a time</option>' +
    slots.map((t) => `<option value="${t}">${t}</option>`).join("");
});

// Submit: build a WhatsApp message and open it
const form = document.getElementById("booking-form");
const errorEl = document.getElementById("form-error");

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  Object.keys(data).forEach((k) => (data[k] = String(data[k]).trim()));

  const missing = ["name", "phone", "service", "date", "time"].filter((k) => !data[k]);
  if (missing.length) {
    errorEl.textContent = "Please fill in your name, phone, service, date and time.";
    return;
  }
  errorEl.textContent = "";

  const prettyDate = new Date(data.date + "T00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const lines = [
    "*New Booking – Reezy Fxdes*",
    "",
    `Name: ${data.name}`,
    `Phone: ${data.phone}`,
    `Service: ${data.service}`,
    `Date: ${prettyDate}`,
    `Time: ${data.time}`,
  ];
  if (data.notes) lines.push(`Notes: ${data.notes}`);

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
  window.open(url, "_blank", "noopener");
});

// Mobile menu
const toggle = document.querySelector(".nav__toggle");
const links = document.querySelector(".nav__links");
toggle.addEventListener("click", () => {
  const open = links.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded", open);
});
links.addEventListener("click", (e) => {
  if (e.target.tagName === "A") {
    links.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }
});

document.getElementById("year").textContent = new Date().getFullYear();
