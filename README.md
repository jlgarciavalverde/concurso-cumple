# Concurso del Cumple

App para el concurso: TV + presentador + un móvil por equipo. 4 equipos; cada prueba reparte 10/5/3/1 (cultura general: 1 punto por acierto).

| Ruta | Para |
|---|---|
| `/tv` | Portátil conectado a la TV. Pulsa «Activar pantalla y sonido» (sin ese clic el navegador no deja sonar los MP3). |
| `/presentador` | Tu móvil/portátil (PIN). Elige prueba en el menú y avanza con los botones grandes. |
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

## Desarrollo
`pnpm dev` (servidor :3000 + Vite :5173, PIN 1234) · `pnpm test` · `pnpm build && pnpm e2e` · `node tools/deploy.mjs X.Y.Z`
