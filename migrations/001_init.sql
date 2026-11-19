-- SNPA — schéma initial
-- Convention : enums modélisés en TEXT + CHECK (portable, simple à lire/modifier)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  phone          TEXT,
  password_hash  TEXT,
  role           TEXT NOT NULL CHECK (role IN ('ADMINISTRATOR','VETERINARIAN','ADOPTION_MANAGER','STAFF','VOLUNTEER')),
  status         TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','INVITED','PENDING')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE animals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('CHIEN','CHAT','AUTRE')),
  breed            TEXT,
  sex              TEXT NOT NULL CHECK (sex IN ('MALE','FEMELLE')),
  age_years        INT NOT NULL DEFAULT 0,
  age_months       INT NOT NULL DEFAULT 0,
  description      TEXT NOT NULL DEFAULT '',
  main_photo_url   TEXT,
  photos           TEXT[] NOT NULL DEFAULT '{}',
  vaccinated       BOOLEAN NOT NULL DEFAULT false,
  sterilized       BOOLEAN NOT NULL DEFAULT false,
  chipped          BOOLEAN NOT NULL DEFAULT false,
  compat_enfants   TEXT NOT NULL DEFAULT 'INCONNU' CHECK (compat_enfants IN ('OUI','NON','INCONNU')),
  compat_chats     TEXT NOT NULL DEFAULT 'INCONNU' CHECK (compat_chats IN ('OUI','NON','INCONNU')),
  compat_chiens    TEXT NOT NULL DEFAULT 'INCONNU' CHECK (compat_chiens IN ('OUI','NON','INCONNU')),
  walk_banned      BOOLEAN NOT NULL DEFAULT false,
  walk_ban_reason  TEXT,
  status           TEXT NOT NULL DEFAULT 'DISPONIBLE' CHECK (status IN ('DISPONIBLE','RESERVE','ADOPTE','EN_SOINS')),
  arrived_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE adoption_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id          UUID NOT NULL REFERENCES animals(id),
  family_first_name  TEXT NOT NULL,
  family_last_name   TEXT NOT NULL,
  email              TEXT NOT NULL,
  phone              TEXT NOT NULL,
  address            TEXT,
  motivation         TEXT NOT NULL DEFAULT '',
  has_children       BOOLEAN NOT NULL DEFAULT false,
  children_ages      TEXT,
  has_garden         BOOLEAN NOT NULL DEFAULT false,
  other_animals      TEXT,
  daily_alone_hours  TEXT,
  experience         TEXT,
  status             TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW','UNDER_REVIEW','MEETING_SCHEDULED','APPROVED','REJECTED','ADOPTED')),
  magic_token        TEXT NOT NULL UNIQUE,
  responsible_id     UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE meetings (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adoption_request_id  UUID NOT NULL UNIQUE REFERENCES adoption_requests(id),
  date                 DATE NOT NULL,
  slot                 TEXT NOT NULL,
  duration_min         INT NOT NULL DEFAULT 30,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE walks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id     UUID NOT NULL REFERENCES animals(id),
  volunteer_id  UUID NOT NULL REFERENCES users(id),
  date          DATE NOT NULL,
  slot          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','IN_PROGRESS','DONE','CANCELED')),
  started_at    TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE medical_records (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  animal_id              UUID NOT NULL REFERENCES animals(id),
  author_id              UUID NOT NULL REFERENCES users(id),
  diagnostic             TEXT NOT NULL,
  description            TEXT NOT NULL DEFAULT '',
  walk_ban_activated     BOOLEAN NOT NULL DEFAULT false,
  walk_ban_lifted        BOOLEAN NOT NULL DEFAULT false,
  vaccine_reminder_date  DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_animals_status ON animals(status);
CREATE INDEX idx_requests_animal ON adoption_requests(animal_id);
CREATE INDEX idx_requests_email ON adoption_requests(email);
CREATE INDEX idx_walks_animal_date ON walks(animal_id, date);
CREATE INDEX idx_walks_volunteer_date ON walks(volunteer_id, date);
CREATE INDEX idx_medical_animal ON medical_records(animal_id);
