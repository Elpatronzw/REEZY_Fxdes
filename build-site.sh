#!/bin/sh
# Builds index.html (the public website) from demo/reezy-demo.html (the Claude demo page),
# so both always match. Run after editing the demo:  sh build-site.sh
cd "$(dirname "$0")"
SRC=demo/reezy-demo.html
SITE="https://elpatronzw.github.io/REEZY_Fxdes/"
DESC="Book your cut at Reezy Fxdes / VIP Classic Barbershop. Open daily 6:30am – 10:30pm in Senga, KMP Bluetuckshops. Pick a free time and confirm on WhatsApp."
{
  printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  printf '<meta name="description" content="%s">\n' "$DESC"
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
echo "Built index.html"
