#!/bin/sh
# Abre la TV del concurso a pantalla completa y con sonido, sin tener que tocar nada en la TV.
# Doble clic en el Mac conectado a la tele. Para salir: Cmd+Q.
#
#   concurso-tv.command [URL]   (por defecto https://concurso.redgarverde.com/tv)
URL="${1:-https://concurso.redgarverde.com/tv}"
for APP in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
           "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
           "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"; do
  [ -x "$APP" ] && break
done
[ -x "$APP" ] || { echo "No encuentro Chrome (ni Brave/Edge). Instala Google Chrome."; read -r _; exit 1; }

# Perfil aparte: abre su propia ventana aunque el navegador ya esté abierto, y sin pestañas restauradas
nohup "$APP" \
  --user-data-dir="$HOME/.concurso-tv" \
  --kiosk \
  --autoplay-policy=no-user-gesture-required \
  --no-first-run --no-default-browser-check \
  --noerrdialogs --disable-session-crashed-bubble --disable-infobars \
  --disable-features=Translate,MediaRouter \
  "$URL" >/dev/null 2>&1 &
sleep 1
# Cierra la ventana de Terminal que abre el doble clic
osascript -e 'tell application "Terminal" to close (every window whose name contains "oncurso")' >/dev/null 2>&1 &
exit 0
