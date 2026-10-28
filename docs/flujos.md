# Flujos principales

[← Documentación](README.md) · [README del proyecto](../README.md)

## Ciclo de una prueba

```mermaid
stateDiagram-v2
  [*] --> intro: el presentador elige la prueba
  intro --> jugando: Empezar
  jugando --> jugando: respuestas, pulsador, turnos
  jugando --> revelar: se acaba el tiempo o el presentador pasa
  revelar --> resultado: Resultado
  resultado --> resultado: el presentador corrige puntos
  resultado --> intro: Confirmar y pasar a la siguiente prueba
  resultado --> [*]: última prueba → podio
```

## Una pregunta tipo test

```mermaid
sequenceDiagram
  actor P as Presentador
  participant S as Servidor (juego.ts)
  participant TV
  participant E as Móviles de los equipos

  P->>S: host: empezar
  S->>TV: publico {fase: jugando, pregunta, cuenta atrás}
  S->>E: equipo {opciones}
  E->>S: equipo: responder {valor} (con marca de tiempo)
  S->>P: host {quién ha respondido}
  Note over S: se acaba el tiempo
  S->>TV: publico {fase: revelar, correcta}
  S->>S: puntosTest (aciertos + plus por rapidez)
  S->>TV: publico {fase: resultado, marcador}
  P->>S: host: confirmar
  S->>S: guarda estado.json
```

## Pulsador justo

```mermaid
sequenceDiagram
  participant E1 as Equipo A (40 ms)
  participant E2 as Equipo B (120 ms)
  participant S as Servidor

  loop latido
    S->>E1: latido (con ack)
    E1-->>S: ack → ida y vuelta / 2, media móvil
    S->>E2: latido (con ack)
    E2-->>S: ack
  end
  E2->>S: pulsar (llega en t=1000, latencia 120)
  E1->>S: pulsar (llega en t=1010, latencia 40)
  Note over S: pulsadoEn = llegada − min(latencia, 150)<br/>A: 970 · B: 880
  S->>S: espera la ventana de 150 ms y elige el menor
  S-->>E2: tienes el turno
```

## Votación de disfraces

```mermaid
flowchart TD
  A[Presentador: abrir votación] --> B[La TV enseña el QR de /votar]
  B --> C[Cada invitado elige su nombre y vota a otro]
  C --> D[Presentador: cerrar]
  D --> E{¿Empate en cabeza?}
  E -- no --> F[Revelar 3º → 2º → ganador]
  E -- sí --> G[Desempatar: votación solo entre los empatados] --> C
```

## Reconexión

```mermaid
sequenceDiagram
  participant M as Móvil
  participant S as Servidor
  M--xS: se cae la wifi
  M->>M: banda «Reconectando…» y guarda la respuesta
  M->>S: reconecta (Socket.IO) con el código de la partida y su equipo
  S-->>M: vista actual del equipo
  M->>S: envía lo pendiente
  alt aún hay tiempo
    S-->>M: aceptada
  else
    S-->>M: «No llegó a tiempo»
  end
```
