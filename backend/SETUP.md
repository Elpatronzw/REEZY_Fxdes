# Booking backend setup (about 15 minutes, free)

This connects the website to a Google Sheet so that:
- bookings are saved and double bookings are blocked
- both shop numbers get a WhatsApp alert for every new booking
- both shop numbers get a WhatsApp reminder 15 minutes before each booking
- the barbers' portal (`/portal.html`) shows all bookings

You need a Google account and the two shop phones.

## 1. Create the sheet and paste the script
1. Go to https://sheets.new and name the sheet **Reezy Fxdes Bookings**.
2. Click **Extensions → Apps Script**.
3. Delete the code there and paste everything from `backend/Code.gs`.
4. At the top, change `PORTAL_PIN` to a PIN the barbers will use, e.g. `"4821"`.
   Keep the real PIN only in Google, never in the GitHub repo.

## 2. Get a WhatsApp key for each shop number (CallMeBot)
Do this on **each** phone (+263 71 951 5630 and +263 78 280 7245):
1. Open https://www.callmebot.com/blog/free-api-whatsapp-messages/ and save the
   CallMeBot WhatsApp number shown there in your contacts.
2. Send it this message on WhatsApp: `I allow callmebot to send me messages`
3. You'll get a reply with your **apikey**.
4. Paste each key into `SHOP_PHONES` in the script, next to the right number.

## 3. Turn it on
1. Click the save icon.
2. In the function dropdown at the top, pick **setup**, then click **Run**.
3. Google asks for permission: **Review permissions → your account → Advanced →
   Go to project (unsafe) → Allow**. (It's your own script; Google shows this for every new script.)
4. Both phones should get a WhatsApp message saying the bookings are connected.

## 4. Publish it as a web app
1. Click **Deploy → New deployment**.
2. Click the gear next to "Select type" and choose **Web app**.
3. Set **Execute as: Me** and **Who has access: Anyone**.
4. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
5. Send that URL to Claude (or paste it into `BACKEND_URL` in `demo/reezy-demo.html` and `portal.html`,
   run `sh build-site.sh`, then commit and push).

## Later changes to the script
After editing the script, use **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**.
The URL stays the same.

## Notes
- Bookings are in the **Bookings** tab of the sheet. Barbers can also open the sheet in the Google Sheets app.
- Reminders are checked every 5 minutes, so they arrive between 10 and 15 minutes before a booking.
- CallMeBot is a free third-party service. If it stops working, the site still saves bookings and the
  portal still shows them; only the WhatsApp alerts stop.
