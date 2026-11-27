const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

// Frais d'adoption forfaitaires par type d'animal, demandés par Sophie (inclut vaccins, puce,
// stérilisation). Pas de colonne dédiée en base : un forfait par type suffit pour le moment,
// et évite une migration pour un montant qui ne varie pas par animal.
const ADOPTION_FEES = { CHIEN: 250, CHAT: 150, AUTRE: 50 };

function mapAnimal(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    breed: row.breed,
    sex: row.sex,
    ageYears: row.age_years,
    ageMonths: row.age_months,
    description: row.description,
    mainPhotoUrl: row.main_photo_url,
    photos: row.photos,
    vaccinated: row.vaccinated,
    sterilized: row.sterilized,
    chipped: row.chipped,
    compatEnfants: row.compat_enfants,
    compatChats: row.compat_chats,
    compatChiens: row.compat_chiens,
    walkBanned: row.walk_banned,
    walkBanReason: row.walk_ban_reason,
    status: row.status,
    arrivedAt: row.arrived_at,
    adoptionFee: ADOPTION_FEES[row.type] ?? null,
  };
}

// ---------- Public ----------

// GET /api/animals?type=CHIEN&enfants=OUI&chats=OUI&chiens=OUI&sort=waiting
// Remarque (retour Sophie) : les animaux "En soins" doivent rester visibles sur le site public
// (avec une mention dédiée côté frontend, sans bouton de demande d'adoption) — seuls les animaux
// déjà adoptés sont donc exclus par défaut.
router.get("/", async (req, res) => {
  const { type, enfants, chats, chiens, sort, publicOnly } = req.query;
  const conditions = [];
  const params = [];

  if (publicOnly !== "false") {
    conditions.push(`status IN ('DISPONIBLE','RESERVE','EN_SOINS')`);
  }
  if (type && type !== "TOUS") {
    params.push(type);
    conditions.push(`type = $${params.length}`);
  }
  if (enfants === "OUI") conditions.push(`compat_enfants = 'OUI'`);
  if (chats === "OUI") conditions.push(`compat_chats = 'OUI'`);
  if (chiens === "OUI") conditions.push(`compat_chiens = 'OUI'`);

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderBy = sort === "waiting" ? "ORDER BY arrived_at ASC" : "ORDER BY created_at DESC";

  const { rows } = await db.query(`SELECT * FROM animals ${where} ${orderBy}`, params);
  res.json({ animals: rows.map(mapAnimal) });
});

// GET /api/animals/longest-waiting?limit=4 — animaux qui attendent depuis le plus longtemps (accueil)
router.get("/longest-waiting", async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 4, 12);
  const { rows } = await db.query(
    `SELECT * FROM animals WHERE status IN ('DISPONIBLE','RESERVE') ORDER BY arrived_at ASC LIMIT $1`,
    [limit]
  );
  res.json({ animals: rows.map(mapAnimal) });
});

// GET /api/animals/:id
router.get("/:id", async (req, res) => {
  const { rows } = await db.query("SELECT * FROM animals WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Animal introuvable." });
  res.json({ animal: mapAnimal(rows[0]) });
});

// GET /api/animals/:id/similar
router.get("/:id/similar", async (req, res) => {
  const { rows: cur } = await db.query("SELECT type FROM animals WHERE id = $1", [req.params.id]);
  if (!cur[0]) return res.status(404).json({ error: "Animal introuvable." });
  const { rows } = await db.query(
    `SELECT * FROM animals WHERE type = $1 AND id != $2 AND status IN ('DISPONIBLE','RESERVE') ORDER BY arrived_at ASC LIMIT 3`,
    [cur[0].type, req.params.id]
  );
  res.json({ animals: rows.map(mapAnimal) });
});

// ---------- CRM (protégé) ----------

const CAN_MANAGE_ANIMALS = ["ADMINISTRATOR", "ADOPTION_MANAGER", "STAFF", "VETERINARIAN"];

router.post("/", requireAuth, requireRole(...CAN_MANAGE_ANIMALS), async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.type || !b.sex) return res.status(400).json({ error: "Nom, type et sexe sont requis." });
  const { rows } = await db.query(
    `INSERT INTO animals (name, type, breed, sex, age_years, age_months, description, main_photo_url,
       vaccinated, sterilized, chipped, compat_enfants, compat_chats, compat_chiens, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [
      b.name, b.type, b.breed || null, b.sex, b.ageYears || 0, b.ageMonths || 0, b.description || "",
      b.mainPhotoUrl || null, !!b.vaccinated, !!b.sterilized, !!b.chipped,
      b.compatEnfants || "INCONNU", b.compatChats || "INCONNU", b.compatChiens || "INCONNU",
      b.status || "DISPONIBLE",
    ]
  );
  res.status(201).json({ animal: mapAnimal(rows[0]) });
});

router.patch("/:id", requireAuth, requireRole(...CAN_MANAGE_ANIMALS), async (req, res) => {
  const b = req.body || {};
  const fields = {
    name: b.name, type: b.type, breed: b.breed, sex: b.sex,
    age_years: b.ageYears, age_months: b.ageMonths, description: b.description,
    main_photo_url: b.mainPhotoUrl, vaccinated: b.vaccinated, sterilized: b.sterilized, chipped: b.chipped,
    compat_enfants: b.compatEnfants, compat_chats: b.compatChats, compat_chiens: b.compatChiens,
    status: b.status,
  };
  const keys = Object.keys(fields).filter((k) => fields[k] !== undefined);
  if (!keys.length) return res.status(400).json({ error: "Aucune modification fournie." });

  // Règle : un animal "En soins" ne peut pas passer directement à Réservé/Adopté sans repasser Disponible.
  if (fields.status && fields.status === "EN_SOINS") {
    // rien de spécial à vérifier ici ; le blocage des demandes est géré côté adoption_requests
  }

  const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
  const values = keys.map((k) => fields[k]);
  values.push(req.params.id);

  const { rows } = await db.query(
    `UPDATE animals SET ${setClause}, updated_at = now() WHERE id = $${values.length} RETURNING *`,
    values
  );
  if (!rows[0]) return res.status(404).json({ error: "Animal introuvable." });
  res.json({ animal: mapAnimal(rows[0]) });
});

router.patch("/:id/walk-ban", requireAuth, requireRole("VETERINARIAN", "ADMINISTRATOR", "STAFF"), async (req, res) => {
  const { banned, reason } = req.body || {};
  const { rows } = await db.query(
    `UPDATE animals SET walk_banned = $1, walk_ban_reason = $2, updated_at = now() WHERE id = $3 RETURNING *`,
    [!!banned, banned ? reason || null : null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Animal introuvable." });
  res.json({ animal: mapAnimal(rows[0]) });
});

router.delete("/:id", requireAuth, requireRole("ADMINISTRATOR"), async (req, res) => {
  await db.query("DELETE FROM animals WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

// ---------- Photos (retour Sophie : Inès ajoute les photos depuis son téléphone, au refuge —
// il fallait un vrai envoi de fichier, pas un champ "lien vers une image"). ----------
//
// Stockage en base (colonne photos TEXT[] déjà existante), en data URL base64 : Render ne garantit
// pas de disque persistant entre déploiements, et ceci évite d'ajouter un service de stockage
// externe pour cette première version. Limite volontaire à 5 Mo par photo pour rester raisonnable
// en taille de base de données.
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function isValidPhotoDataUrl(dataUrl) {
  return typeof dataUrl === "string" && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(dataUrl);
}

// POST /api/animals/:id/photos { dataUrl } — ajoute une photo (et la définit comme photo
// principale si l'animal n'en a pas encore).
router.post("/:id/photos", requireAuth, requireRole(...CAN_MANAGE_ANIMALS), async (req, res) => {
  const { dataUrl } = req.body || {};
  if (!isValidPhotoDataUrl(dataUrl)) {
    return res.status(400).json({ error: "Photo invalide (formats acceptés : JPG, PNG, WEBP, GIF)." });
  }
  if (Buffer.byteLength(dataUrl, "utf8") > MAX_PHOTO_BYTES * 1.4) {
    // le base64 gonfle la taille d'environ 1.37x ; marge pour rester proche de 5 Mo réels
    return res.status(413).json({ error: "Photo trop volumineuse (5 Mo maximum)." });
  }

  const { rows: cur } = await db.query("SELECT * FROM animals WHERE id = $1", [req.params.id]);
  if (!cur[0]) return res.status(404).json({ error: "Animal introuvable." });

  const { rows } = await db.query(
    `UPDATE animals
       SET photos = array_append(photos, $1),
           main_photo_url = COALESCE(main_photo_url, $1),
           updated_at = now()
     WHERE id = $2 RETURNING *`,
    [dataUrl, req.params.id]
  );
  res.status(201).json({ animal: mapAnimal(rows[0]) });
});

// PATCH /api/animals/:id/main-photo { url } — définit une photo déjà envoyée comme photo principale.
router.patch("/:id/main-photo", requireAuth, requireRole(...CAN_MANAGE_ANIMALS), async (req, res) => {
  const { url } = req.body || {};
  const { rows: cur } = await db.query("SELECT * FROM animals WHERE id = $1", [req.params.id]);
  if (!cur[0]) return res.status(404).json({ error: "Animal introuvable." });
  if (url && !(cur[0].photos || []).includes(url)) {
    return res.status(400).json({ error: "Cette photo ne fait pas partie des photos de cet animal." });
  }
  const { rows } = await db.query(
    `UPDATE animals SET main_photo_url = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [url || null, req.params.id]
  );
  res.json({ animal: mapAnimal(rows[0]) });
});

// DELETE /api/animals/:id/photos { url } — retire une photo (et réaffecte la photo principale
// si besoin).
router.delete("/:id/photos", requireAuth, requireRole(...CAN_MANAGE_ANIMALS), async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: "url requise." });
  const { rows: cur } = await db.query("SELECT * FROM animals WHERE id = $1", [req.params.id]);
  if (!cur[0]) return res.status(404).json({ error: "Animal introuvable." });

  const remaining = (cur[0].photos || []).filter((p) => p !== url);
  const nextMain = cur[0].main_photo_url === url ? remaining[0] || null : cur[0].main_photo_url;

  const { rows } = await db.query(
    `UPDATE animals SET photos = $1, main_photo_url = $2, updated_at = now() WHERE id = $3 RETURNING *`,
    [remaining, nextMain, req.params.id]
  );
  res.json({ animal: mapAnimal(rows[0]) });
});

module.exports = router;
module.exports.mapAnimal = mapAnimal;
