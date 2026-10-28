# Connecting the custom domain (.co.zw)

The site stays hosted free on GitHub Pages. Connecting a domain only changes the address people see.
After it's done, the old `elpatronzw.github.io/REEZY_Fxdes` link redirects to the new domain automatically.

Example domain below: `reezyfxdes.co.zw`. Swap in the real one.

## 1. Buy the domain
- Buy it from a ZISPA-accredited .co.zw registrar. They may ask for business details.
- Make sure the registrar lets you edit **DNS records** (A and CNAME records).

## 2. Tell Claude the domain
Claude adds a `CNAME` file with the domain to the repo, rebuilds the site so links and previews use the
new address, and pushes it.

## 3. Add DNS records at the registrar
| Type  | Name / Host | Value                 |
|-------|-------------|-----------------------|
| A     | @           | 185.199.108.153       |
| A     | @           | 185.199.109.153       |
| A     | @           | 185.199.110.153       |
| A     | @           | 185.199.111.153       |
| CNAME | www         | elpatronzw.github.io  |

Remove any other A records for `@` (for example a "parking page" the registrar adds).

## 4. Switch it on in GitHub
1. Go to https://github.com/Elpatronzw/REEZY_Fxdes/settings/pages
2. Under **Custom domain**, type `reezyfxdes.co.zw` and click **Save**.
3. Wait for the green "DNS check successful". DNS changes can take a few hours to spread.
4. Tick **Enforce HTTPS**. The padlock certificate can take up to 24 hours to appear.

## After it's live
- Booking site: `https://reezyfxdes.co.zw`
- Barbers' portal: `https://reezyfxdes.co.zw/portal.html`
- The Google Sheet backend doesn't need any changes.
- Update the link you share with clients (WhatsApp status, Instagram bio, Notepad file).
