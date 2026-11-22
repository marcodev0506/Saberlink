CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS empresas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rif           VARCHAR(12) NOT NULL UNIQUE,
  nombre        TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  email         CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nombre        TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('rrhh', 'gestor_curso', 'trabajador')),
  debe_cambiar_password BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS debe_cambiar_password BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
UPDATE usuarios SET rol = 'gestor_curso' WHERE rol = 'experto';
ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check CHECK (rol IN ('rrhh', 'gestor_curso', 'trabajador'));

-- Árbol organizacional genérico: cada empresa define sus propios tipos y niveles
CREATE TABLE IF NOT EXISTS unidades (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES unidades(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'unidad',   -- gerencia, departamento, dirección… lo define la empresa
  descripcion   TEXT NOT NULL DEFAULT '',          -- descripción del puesto/función
  competencias  JSONB NOT NULL DEFAULT '[]'::jsonb, -- lista de competencias (se enlazan a cursos)
  habilidades   JSONB NOT NULL DEFAULT '[]'::jsonb, -- lista de habilidades
  orden         INT NOT NULL DEFAULT 0,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE unidades ADD COLUMN IF NOT EXISTS descripcion  TEXT NOT NULL DEFAULT '';
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS competencias JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS habilidades  JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS cargo           TEXT NOT NULL DEFAULT '';
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS nombre_apellido TEXT NOT NULL DEFAULT '';
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS ci              TEXT NOT NULL DEFAULT '';
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS correo          TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS unidades_empresa_idx ON unidades(empresa_id, parent_id);

CREATE TABLE IF NOT EXISTS cursos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  titulo        TEXT NOT NULL,
  objetivo      TEXT NOT NULL DEFAULT '',
  facilitador_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  pdf_path      TEXT NOT NULL DEFAULT '',
  guion         TEXT NOT NULL DEFAULT '',
  evaluaciones  JSONB NOT NULL DEFAULT '[]'::jsonb,
  audio_path    TEXT NOT NULL DEFAULT '',
  imagen_path   TEXT NOT NULL DEFAULT '',
  estado        TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','procesando','listo','publicado')),
  competencias  JSONB NOT NULL DEFAULT '[]'::jsonb,
  habilidades   JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cursos_empresa_idx ON cursos(empresa_id);

CREATE TABLE IF NOT EXISTS lecciones (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id   UUID NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  orden      INT NOT NULL DEFAULT 0,
  titulo     TEXT NOT NULL,
  texto      TEXT NOT NULL DEFAULT '',
  audio_path TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lecciones_curso_idx ON lecciones(curso_id, orden);
ALTER TABLE cursos ADD COLUMN IF NOT EXISTS imagen_path TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS intentos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id    UUID NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  respuestas  JSONB NOT NULL DEFAULT '{}'::jsonb,
  puntaje     INT NOT NULL DEFAULT 0,
  total       INT NOT NULL DEFAULT 0,
  aprobado    BOOLEAN NOT NULL DEFAULT false,
  tipo        TEXT NOT NULL DEFAULT 'final' CHECK (tipo IN ('diagnostico','teorica','practica','final')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE intentos ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'final';
ALTER TABLE intentos DROP CONSTRAINT IF EXISTS intentos_tipo_check;
ALTER TABLE intentos ADD CONSTRAINT intentos_tipo_check CHECK (tipo IN ('diagnostico','teorica','practica','final'));

ALTER TABLE cursos ADD COLUMN IF NOT EXISTS habilidades JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS catalogo (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL CHECK (tipo IN ('competencia','habilidad')),
  nombre     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, tipo, nombre)
);

ALTER TABLE cursos ADD COLUMN IF NOT EXISTS duracion TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS certificados (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo     UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  curso_id   UUID NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  puntaje    INT NOT NULL DEFAULT 0,
  total      INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (curso_id, usuario_id)
);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ci TEXT NOT NULL DEFAULT '';
ALTER TABLE unidades ADD COLUMN IF NOT EXISTS usuario_id UUID REFERENCES usuarios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS unidades_usuario_idx ON unidades(usuario_id);

-- Enlaza automáticamente puestos existentes con usuarios de la misma empresa por correo
UPDATE unidades un
SET usuario_id = u.id
FROM usuarios u
WHERE un.usuario_id IS NULL
  AND un.empresa_id = u.empresa_id
  AND un.correo <> ''
  AND LOWER(TRIM(un.correo)) = LOWER(TRIM(u.email));

-- Sincroniza cédula desde el puesto si el usuario aún no la tiene cargada
UPDATE usuarios u
SET ci = un.ci
FROM unidades un
WHERE un.usuario_id = u.id
  AND (u.ci IS NULL OR u.ci = '')
  AND un.ci <> '';

CREATE TABLE IF NOT EXISTS progreso_audio (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  curso_id   UUID NOT NULL REFERENCES cursos(id) ON DELETE CASCADE,
  leccion_id UUID REFERENCES lecciones(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS progreso_audio_uniq ON progreso_audio(curso_id, usuario_id, COALESCE(leccion_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS progreso_audio_user_idx ON progreso_audio(usuario_id, curso_id);
