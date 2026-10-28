# Guía del día

[← Documentación](README.md) · [README del proyecto](../README.md)

Para quien presenta y organiza el concurso.

## Pantallas

| Ruta | Dónde | Para qué |
|---|---|---|
| `/tv` | Portátil conectado a la TV | Doble clic en **`tools/concurso-tv.command`** (copia en el Escritorio: «Concurso TV»). Abre Chrome a pantalla completa y con sonido permitido. En la TV no hay que tocar nada (para salir: Cmd+Q). |
| `/presentador` | Tu móvil o portátil (con PIN) | Lo maneja todo: pruebas, puntos, vista de la TV, sonido y volumen de la TV y «Recargar TV». Avisa si la TV está sin sonido. |
| `/` | Móviles de los equipos | Escanean el QR de la TV. |
| `/admin` | Ordenador (con PIN) | Editar preguntas y subir MP3 y fotos. Lo marcado con ✏️ está por rellenar. |
| `/votar` | Móviles de los invitados | Votación de disfraces. |

## Antes del día

1. En `/admin`, rellena el Kahoot, las mezclas de olor y sabor y los productos del precio justo, y sube los MP3 (con el segundo de inicio).
2. Ensaya con la TV y 2 móviles, una pregunta de cada prueba. Después, «Opciones avanzadas → Reiniciar partida».

## Durante

- Cada prueba acaba en «Resultados»: revisa los puntos (se pueden cambiar) y pulsa **Confirmar**.
- ↩️ **Deshacer** deshace la última acción del presentador. Los ajustes ± del marcador sirven para bonus y penalizaciones.
- **Palabra prohibida o dibujo**: la tarjeta sale en el móvil del presentador. Pásaselo a quien explica.
- Si se cae algo, recarga: la partida está guardada y sigue donde estaba.

### Kahoot del cumpleañero

Él lanza su Kahoot en directo desde la app de Kahoot. El presentador escribe en su panel el PIN que le sale, y la TV lo enseña con un QR que entra directo. Cada equipo entra con su nombre y, al acabar, el presentador apunta el puesto de cada equipo (1º → 10 puntos…).

### Concurso de disfraces (al final)

La lista de invitados se prepara en `/admin`. En el panel, «Votación de disfraces» → **Abrir**: la TV enseña un QR (`/votar`) y cada invitado elige su nombre y vota (un voto por persona, no a sí mismo). Después, **Cerrar** → **Revelar** (3º, 2º y ganador). Si hay empate, **Desempatar** abre una votación solo entre los empatados.

## Si algo falla

| Problema | Qué pasa |
|---|---|
| Un móvil se queda sin red | Sale una banda roja «Reconectando…». Lo que respondan sin red se envía solo al volver si aún hay tiempo; si no, verán «No llegó a tiempo». |
| Se reinicia el servidor | La partida está guardada: la TV, el panel y los móviles vuelven solos donde estaban. |
| Dudas con el pulsador | Gana quien pulsó antes de verdad, no quien tiene mejor red: se compensa la latencia de cada móvil hasta 150 ms. El panel enseña la latencia de cada equipo, en rojo si pasa de 150 ms. |
| Partida nueva tras el ensayo | «Opciones avanzadas → Reiniciar partida» (o `POST /api/admin/reiniciar` con el PIN). |
