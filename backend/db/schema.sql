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
  rol           TEXT NOT NULL CHECK (rol IN ('rrhh', 'experto', 'trabajador')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Árbol organizacional genérico: cada empresa define sus propios tipos y niveles
CREATE TABLE IF NOT EXISTS unidades (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES unidades(id) ON DELETE CASCADE,
  nombre        TEXT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'unidad',   -- gerencia, departamento, dirección… lo define la empresa
  orden         INT NOT NULL DEFAULT 0,
  metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS unidades_empresa_idx ON unidades(empresa_id, parent_id);

