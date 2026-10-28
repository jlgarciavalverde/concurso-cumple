# Requisitos

[← Documentación](README.md) · [README del proyecto](../README.md)

## Actores

| Actor | Dispositivo | Qué hace |
|---|---|---|
| Presentador | Su móvil (`/presentador`, con PIN) | Dirige la partida: pruebas, turnos, puntos, vista de la TV y sonido. |
| Equipo (5) | Un móvil por equipo (`/`) | Responde, pulsa y ve su marcador. |
| TV | Portátil conectado a la tele (`/tv`) | Enseña preguntas, cuenta atrás, marcador, podio y QR. Nadie la toca. |
| Organizador | Ordenador (`/admin`, con PIN) | Prepara preguntas, música, fotos y la lista de invitados. |
| Invitado | Su móvil (`/votar`) | Vota el mejor disfraz. |

## Requisitos funcionales

| ID | Requisito |
|---|---|
| RF-01 | Los equipos entran escaneando el QR de la TV, sin instalar nada. |
| RF-02 | Tipos de prueba: test, adivinar (lista o rosco), precio justo, canción, tarjetas (palabra prohibida o dibujo), manual (medida con cronómetro) y juego externo (Kahoot). |
| RF-03 | Cada prueba reparte 10/5/3/1 puntos por puesto (el quinto, 0). Los empates comparten puesto. Una prueba puede agrupar varias subpruebas y repartir sobre la suma. En el test se da 1 punto por acierto, con un plus opcional por rapidez. |
| RF-04 | El presentador revisa y corrige los puntos antes de confirmar cada prueba. |
| RF-05 | El presentador puede deshacer su última acción y hacer ajustes de bonus o penalización. |
| RF-06 | El pulsador da la vez a quien pulsó antes, compensando la latencia de cada móvil hasta 150 ms. |
| RF-07 | La TV reproduce las canciones (MP3 o Spotify Premium) sin enseñar el título. |
| RF-08 | Para el Kahoot del cumpleañero, la TV enseña un QR de acceso y el presentador apunta los puestos. |
| RF-09 | Votación de disfraces: un voto por invitado, no a sí mismo, revelación 3º-2º-1º y desempate. |
| RF-10 | Desde `/admin` se edita el contenido y se suben MP3 (con segundo de inicio) y fotos. |
| RF-11 | El presentador ve la latencia de cada equipo y si la TV está sin sonido, y puede recargar la TV. |

## Requisitos no funcionales

| ID | Categoría | Requisito |
|---|---|---|
| RNF-01 | Resiliencia | La partida se guarda en disco tras cada cambio. Si el servidor se reinicia, las pantallas vuelven solas al mismo punto. |
| RNF-02 | Resiliencia | Si un móvil pierde la red, ve «Reconectando…» y lo que responda se envía al volver si aún hay tiempo. |
| RNF-03 | Equidad | Nadie ve las respuestas de los demás equipos hasta el momento de revelar. |
| RNF-04 | Seguridad | `/presentador` y `/admin` piden PIN. Los tokens de Spotify se guardan con permisos 600. |
| RNF-05 | Compatibilidad | Funciona en Chrome y en Safari de iPhone (e2e en los dos). |
| RNF-06 | Usabilidad | Los móviles se usan sin explicación: botones grandes y un solo paso por pantalla. |
