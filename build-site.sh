#!/bin/sh
# Builds index.html (the public website) from demo/reezy-demo.html (the Claude demo page),
# so both always match. Run after editing the demo:  sh build-site.sh
cd "$(dirname "$0")"
SRC=demo/reezy-demo.html

# The site's public address. With a custom domain, the CNAME file holds it (e.g. reezyfxdes.co.zw).
if [ -s CNAME ]; then
  SITE="https://$(tr -d ' \r\n' < CNAME)/"
else
  SITE="https://elpatronzw.github.io/REEZY_Fxdes/"
fi
DESC="Book your cut at Reezy Fxdes / VIP Classic Barbershop. Open daily 6:30am – 10:30pm in Senga, KMP Bluetuckshops. Pick a free time and confirm on WhatsApp."

{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  printf '<meta name="description" content="%s">\n' "$DESC"
  printf '<link rel="canonical" href="%s">\n' "$SITE"
  printf '<meta property="og:title" content="Reezy Fxdes / VIP Classic Barbershop">\n'
  printf '<meta property="og:description" content="%s">\n' "$DESC"
  printf '<meta property="og:image" content="%sassets/logo.jpeg">\n' "$SITE"
  printf '<meta property="og:url" content="%s">\n<meta property="og:type" content="website">\n' "$SITE"
  printf '<link rel="icon" href="assets/logo.jpeg">\n'
  # Everything up to and including </style> goes in <head>, the rest in <body>
  awk '{print} /<\/style>/{exit}' "$SRC"
  printf '</head>\n<body>\n'
  awk 'f{print} /<\/style>/{f=1}' "$SRC"
  printf '</body>\n</html>\n'
} > index.html

# Help search engines find the booking page (the portal stays out of search)
printf 'User-agent: *\nDisallow: /portal.html\nSitemap: %ssitemap.xml\n' "$SITE" > robots.txt
printf '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>%s</loc></url>\n</urlset>\n' "$SITE" > sitemap.xml

echo "Built index.html for $SITE"
