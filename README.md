# Reezy Fxdes / VIP Classic Barbershop

Booking website for the Reezy Fxdes barbershop. Black and white, mobile-friendly.

## Run it
Open `index.html` in a browser. Live site (once GitHub Pages is on): https://elpatronzw.github.io/REEZY_Fxdes/

## How bookings work
A customer picks a service, a day and a free time, adds their name and phone, and taps **Send booking on WhatsApp**. WhatsApp opens with the booking already typed out and addressed to **+263 71 951 5630**. The customer taps send to deliver it.

## Making changes
1. Edit `demo/reezy-demo.html`. It's the source for both the website and the Claude demo page.
2. Run `sh build-site.sh` to rebuild `index.html`.

Shop settings are at the top of the `<script>` in `demo/reezy-demo.html`:
- `SERVICES`: names, descriptions and prices (`price: null` shows "TBA")
- `HOURS` / `OPEN_LATE`: opening hours per day
- `SLOT_MINUTES`: booking slot length
- `DAYS_AHEAD`: how many days ahead clients can book
- `WHATSAPP_NUMBER`: number that bookings go to

## Files
- `demo/reezy-demo.html`: the page source (also published as the Claude demo)
- `index.html`: the public website, built from the source
- `build-site.sh`: builds `index.html`
- `assets/logo.jpeg`: shop logo
