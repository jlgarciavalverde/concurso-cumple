# Arquitectura

[← Documentación](README.md) · [README del proyecto](../README.md)

Una sola app de Node que sirve cuatro pantallas y las mantiene sincronizadas en tiempo real con Socket.IO. El servidor tiene la única fuente de verdad (la partida) y cada pantalla recibe solo la vista que le toca.

## Pantallas y servidor

```mermaid
flowchart LR
  subgraph salon["En el salón"]
    tv["/tv<br/>portátil + TV<br/>pregunta, marcador, QR, música"]
    host["/presentador<br/>móvil del presentador (PIN)<br/>lo maneja todo"]
    eq["/ (x5)<br/>un móvil por equipo<br/>responde y pulsa"]
    votar["/votar<br/>móviles de los invitados<br/>disfraces"]
  end
  admin["/admin (PIN)<br/>preguntas, MP3, fotos"]

  subgraph srv["Servidor Node 22 (Docker)"]
    io["Socket.IO<br/>salas: host · tv · eq:id · lobby"]
    juego["juego.ts<br/>máquina de estados de la partida"]
    punt["shared/puntuacion.ts<br/>reparto 10/5/3/1, test, precio"]
    rest["Fastify REST<br/>/api/admin/* · /health"]
    spot["spotify.ts<br/>OAuth + reproductor de la TV"]
    files[("data/<br/>contenido.json · estado.json · media/")]
  end

  host -- "acciones (host)" --> io
  eq -- "respuestas y pulsador (equipo)" --> io
  votar -- "votar" --> io
  io --> juego --> punt
  juego -- "publico / host / equipo" --> io
  io --> tv
  io --> host
  io --> eq
  admin -- HTTP --> rest --> files
  juego -- "guarda cada cambio" --> files
  spot <--> spotify[(API de Spotify)]
  tv -. "Web Playback SDK" .-> spotify
```

| Pieza | Archivo | Qué hace |
|---|---|---|
| Servidor | `server/index.ts` | Fastify (REST, estáticos y subidas) y Socket.IO. Autentica al presentador por PIN y guarda el estado en disco con escritura atómica (archivo temporal + `rename`). |
| Partida | `server/juego.ts` | La máquina de estados: pruebas, turnos, cronómetros, respuestas, revisión, deshacer y votación. Genera las vistas `Publico`, `VistaHost` y `VistaEquipo`. |
| Puntuación | `shared/puntuacion.ts` | Reparto por puestos con empates, test con plus por rapidez, precio justo «sin pasarse» y compensación de latencia del pulsador. |
| Tipos | `shared/tipos.ts` | El contrato entre servidor y pantallas. |
| Validación | `server/validar.ts` | Comprueba el contenido que llega desde `/admin`. |
| Spotify | `server/spotify.ts` | OAuth con la cuenta Premium y control del reproductor que corre en la TV. |

## Modelo de la partida

```mermaid
classDiagram
  class Contenido {
    titulo
    tabla: number[] 10/5/3/1
    equipos: Equipo[]
    pruebas: Prueba[]
    disfraces: participantes
  }
  class Prueba {
    titulo
    emoji
    agrupar: bool
    subs: Sub[]
  }
  class Sub {
    <<union>>
    test
    adivinar
    precio
    cancion
    tarjetas
    manual
    externo (Kahoot)
  }
  class Estado {
    prueba / sub / item actuales
    vivo: Vivo
    marcador
    ajustes: Ajuste[]
    historial (deshacer)
    votacion: Votacion
    codigo de acceso
  }
  class Vivo {
    fase: intro | jugando | revelar | resultado
    respuestas por equipo
    cronómetro
  }
  Contenido "1" o-- "*" Prueba
  Prueba "1" o-- "*" Sub
  Estado --> Vivo
  Estado ..> Contenido : lee
```

El contenido (`contenido.json`) es lo que se prepara antes. El estado (`estado.json`) es la partida en curso: si el servidor se reinicia, todo sigue donde estaba.

## Despliegue

```mermaid
flowchart LR
  movil((Móviles y TV)) --> cf["Cloudflare<br/>concurso.redgarverde.com"] --> tunnel["cloudflared"]
  subgraph vps["VPS casero"]
    tunnel --> app["concurso-cumple<br/>Docker"]
    app --> data[("~/servicios/concurso/data")]
  end
  mac["Mac: tools/deploy.mjs X.Y.Z"] -- "docker save | ssh (LAN o Tailscale)" --> vps
```

## Decisiones

| Decisión | Por qué |
|---|---|
| Servidor con autoridad y vistas por rol | Ningún equipo ve las respuestas ajenas antes de tiempo, y la TV nunca enseña lo que solo debe ver el presentador. |
| Socket.IO | Reconexión automática y salas por rol. Los móviles con mala wifi vuelven solos. |
| JSON en disco en lugar de base de datos | Es una partida de una noche: dos archivos, legibles y fáciles de restaurar. |
| Pulsador con compensación de latencia (máx. 150 ms) | Gana quien pulsa antes de verdad, no quien tiene mejor red. El tope evita trampas retrasando los pings. |
| Deshacer en el presentador | Un error en directo se arregla con un toque, sin reiniciar nada. |
