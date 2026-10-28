/**
 * Reezy Fxdes booking settings. Keep this file in Apps Script as "Settings".
 * Code updates only replace the "Code" file, so these values stay put.
 */

// PIN the barbers type to open the portal
const PORTAL_PIN = "CHANGE-ME";

// WhatsApp alerts through CallMeBot: each number gets its own key (see SETUP.md). Leave "" to skip that number.
const SHOP_PHONES = [
  { phone: "+263719515630", apikey: "" },
  { phone: "+263782807245", apikey: "" },
];

// Email addresses that also get alerts and reminders, e.g. ["reezy@gmail.com", "brian@gmail.com"]
const ALERT_EMAILS = [];
