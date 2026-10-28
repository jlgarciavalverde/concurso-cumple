# Operaciones

[← Documentación](README.md) · [README del proyecto](../README.md)

## Desplegar

```sh
node tools/deploy.mjs X.Y.Z
```

Construye la imagen en el Mac, la sube al VPS (`~/servicios/concurso`), guarda una copia de `estado.json` y `contenido.json` antes de actualizar y comprueba `/health`. Desde fuera de casa: `VPS_HOST=joseluis@<ip-tailscale-del-vps>`.

Requisitos: Docker en marcha y la clave SSH cargada (`ssh-add --apple-use-keychain ~/.ssh/id_ed25519` en una terminal normal).

## Variables (`~/servicios/concurso/.env`)

| Variable | Para qué |
|---|---|
| `PIN` | PIN del presentador y de `/admin` |
| `APP_VERSION` | Versión que informa `/health` (la pone el despliegue) |
| `PUBLIC_URL` | URL pública (por defecto `https://concurso.redgarverde.com`) |
| `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` | Opcionales, para las canciones desde Spotify |

## Datos

En `data/`: `contenido.json` (preguntas y pruebas), `estado.json` (la partida en curso) y `media/` (MP3 y fotos). Para empezar de cero basta con «Reiniciar partida», que no borra el contenido.

## Canciones desde Spotify (opcional, cuenta Premium)

1. En https://developer.spotify.com/dashboard → **Create app** (con la cuenta Premium). Redirect URI: `https://concurso.redgarverde.com/api/spotify/callback`. Marca «Web API» y «Web Playback SDK».
2. Pon el Client ID y el secret en `~/servicios/concurso/.env` (ver `deploy/.env.example`) y ejecuta `docker compose up -d`.
3. En `/admin` → una ronda de canciones → «Conectar con Spotify» → pega el enlace de una lista **tuya** → «Cargar canciones».
4. El día, con la TV abierta con el lanzador: en el panel, «Autorizar la TV para Spotify». La TV suena como un reproductor de Spotify, sin enseñar el título.
