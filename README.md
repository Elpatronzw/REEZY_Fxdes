# Reezy Fxdes

Booking website for the Reezy Fxdes barbershop. Black and white, mobile-friendly, no build step.

## Run it
Open `index.html` in a browser.

## How bookings work
A customer fills in the booking form and taps **Send booking on WhatsApp**. WhatsApp opens with the booking details already typed out and addressed to **+263 71 951 5630**. The customer taps send to deliver it.

## Editing
All shop settings are at the top of `script.js`:
- `SERVICES`: names, descriptions and prices (`price: null` shows "TBA")
- `HOURS`: opening hours per day
- `SLOT_MINUTES`: booking slot length
- `WHATSAPP_NUMBER`: number that bookings go to

## Files
- `index.html`: page structure
- `styles.css`: black and white theme
- `script.js`: services, hours, time slots and the WhatsApp booking message
- `assets/logo.jpeg`: shop logo
