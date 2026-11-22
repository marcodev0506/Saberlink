# Saberlink

Plataforma de cursos con certificados PDF/QR. Monorepo:

- `frontend/` — Vue 3 + Vite
- `backend/` — API Node.js (Express): auth y roles (RRHH, Experto, Trabajador), gestión de cursos, progreso y certificados
- `workers/ia-worker` — consume `ia.jobs`: PDF → guion + exámenes (JSON) vía Ollama local
- `workers/voice-worker` — consume `voice.jobs`: guion → `.mp3` vía ElevenLabs → storage local
- PostgreSQL 16 (JSONB: usuarios/roles, cursos/lecciones, banco de preguntas, acreditaciones)
- RabbitMQ como cola de tareas

## Levantar con Docker

```bash
cp .env.example .env   # completa ELEVENLABS_API_KEY si usarás TTS
docker compose up --build
```

- Frontend: http://localhost:5173
- API: http://localhost:3000 (`/health`, `POST /api/jobs/guion`, `POST /api/jobs/voz`)
- RabbitMQ UI: http://localhost:15672 (saberlink/saberlink)

Ollama corre fuera del compose por defecto; instálalo localmente o descomenta el servicio `ollama` en `docker-compose.yml`.
