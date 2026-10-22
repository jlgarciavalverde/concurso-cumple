# Concurso del Cumple

App para el concurso: TV + presentador + un móvil por equipo. 4 equipos; cada prueba reparte 10/5/3/1 (cultura general: 1 punto por acierto).

| Ruta | Para |
|---|---|
| `/tv` | Portátil conectado a la TV: doble clic en **`tools/concurso-tv.command`** (copia en el Escritorio: «Concurso TV»). Abre Chrome a pantalla completa y con sonido permitido; en la TV no hay que tocar nada (salir: Cmd+Q). |
| `/presentador` | Tu móvil/portátil (PIN). Lo maneja todo: pruebas, puntos, vista de la TV, sonido/volumen de la TV y «Recargar TV». Avisa si la TV está sin sonido. |
| `/` | Móviles de los equipos: escanean el QR de la TV. |
| `/admin` | Editar preguntas, subir MP3 y fotos (PIN). Lo marcado con ✏️ está por rellenar. |

## Antes del día
1. `/admin`: rellena el Kahoot, las mezclas de olor/sabor, los productos del precio justo y sube los MP3 (con el segundo de inicio).
2. Ensayo: TV + 2 móviles, una pregunta de cada prueba. Luego «Opciones avanzadas → Reiniciar partida».

## Durante
- Cada prueba acaba en «Resultados»: revisa los puntos (se pueden cambiar) y pulsa **Confirmar**.
- ↩️ Deshacer deshace la última acción del presentador. Ajustes ± del marcador para bonus/penalizaciones.
- Palabra prohibida / dibujo: la tarjeta sale en el móvil del presentador; pásaselo a quien explica.
- Si se cae algo, recarga: la partida se guarda en `data/estado.json` y sigue donde estaba.

## Si algo falla el día
- **Un móvil se queda sin red:** sale una banda roja «Reconectando…». Lo que respondan sin red se envía solo al volver (si aún hay tiempo; si no, verán «No llegó a tiempo»).
- **Se reinicia el servidor:** la partida está guardada; TV, panel y móviles vuelven solos donde estaban.
- **Pulsador:** gana quien pulsó antes de verdad, no quien tiene mejor red (se compensa la latencia de cada móvil, hasta 150 ms). En el panel se ve la latencia de cada equipo; si alguno pasa de 150 ms sale en rojo.
- **Partida nueva tras el ensayo:** «Opciones avanzadas → Reiniciar partida» (o `POST /api/admin/reiniciar` con el PIN).

## Desarrollo
`pnpm dev` (servidor :3000 + Vite :5173, PIN 1234) · `pnpm test` · `pnpm build && pnpm e2e` (Chrome y Safari/iPhone; `--project=chromium` o `--project=safari`) · `node tools/deploy.mjs X.Y.Z`
