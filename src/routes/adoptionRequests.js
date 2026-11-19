const express = require("express");
const { nanoid } = require("nanoid");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { sendMail } = require("../utils/mailer");

const router = express.Router();

const ACTIVE_STATUSES = ["NEW", "UNDER_REVIEW", "MEETING_SCHEDULED", "APPROVED"];

function mapRequest(row) {
  return {
    id: row.id,
    animalId: row.animal_id,
    animalName: row.animal_name,
    familyFirstName: row.family_first_name,
    familyLastName: row.family_last_name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    motivation: row.motivation,
    hasChildren: row.has_children,
    childrenAges: row.children_ages,
    hasGarden: row.has_garden,
    otherAnimals: row.other_animals,
    dailyAloneHours: row.daily_alone_hours,
    experience: row.experience,
    status: row.status,
    responsibleId: row.responsible_id,
    responsibleName: row.responsible_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    meeting: row.meeting_date
      ? { date: row.meeting_date, slot: row.meeting_slot, durationMin: row.meeting_duration }
      : null,
  };
}

const SELECT_BASE = `
  SELECT r.*, a.name AS animal_name,
         u.first_name || ' ' || u.last_name AS responsible_name,
         m.date AS meeting_date, m.slot AS meeting_slot, m.duration_min AS meeting_duration
  FROM adoption_requests r
  JOIN animals a ON a.id = r.animal_id
  LEFT JOIN users u ON u.id = r.responsible_id
  LEFT JOIN meetings m ON m.adoption_request_id = r.id
`;

// ---------- Public : déposer une demande ----------
router.post("/", async (req, res) => {
  const b = req.body || {};
  const required = ["animalId", "familyFirstName", "familyLastName", "email", "phone", "motivation"];
  for (const f of required) {
    if (!b[f]) return res.status(400).json({ error: `Le champ ${f} est requis.` });
  }

  const { rows: animalRows } = await db.query("SELECT * FROM animals WHERE id = $1", [b.animalId]);
  const animal = animalRows[0];
  if (!animal) return res.status(404).json({ error: "Animal introuvable." });
  if (animal.status === "EN_SOINS") {
    return res.status(409).json({ error: "Cet animal est actuellement en soins : aucune demande d'adoption ne peut être déposée pour lui." });
  }
  if (animal.status === "ADOPTE") {
    return res.status(409).json({ error: "Cet animal a déjà été adopté." });
  }

  const email = b.email.toLowerCase().trim();

  // Règle Sophie : max 2 demandes en cours par famille à la fois.
  const { rows: activeForFamily } = await db.query(
    `SELECT id FROM adoption_requests WHERE email = $1 AND status = ANY($2)`,
    [email, ACTIVE_STATUSES]
  );
  if (activeForFamily.length >= 2) {
    return res.status(409).json({
      error: "Vous avez déjà deux demandes d'adoption en cours. Merci d'attendre leur traitement avant d'en déposer une nouvelle.",
    });
  }

  // Règle : une seule demande active par animal et par famille.
  const { rows: activeForAnimal } = await db.query(
    `SELECT id FROM adoption_requests WHERE email = $1 AND animal_id = $2 AND status = ANY($3)`,
    [email, b.animalId, ACTIVE_STATUSES]
  );
  if (activeForAnimal.length) {
    return res.status(409).json({ error: "Vous avez déjà une demande en cours pour cet animal." });
  }

  const token = nanoid(24);
  const { rows } = await db.query(
    `INSERT INTO adoption_requests
      (animal_id, family_first_name, family_last_name, email, phone, address, motivation,
       has_children, children_ages, has_garden, other_animals, daily_alone_hours, experience,
       status, magic_token)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'NEW',$14) RETURNING id`,
    [
      b.animalId, b.familyFirstName, b.familyLastName, email, b.phone, b.address || null, b.motivation,
      !!b.hasChildren, b.childrenAges || null, !!b.hasGarden, b.otherAnimals || null,
      b.dailyAloneHours || null, b.experience || null, token,
    ]
  );

  await sendMail({
    to: email,
    subject: `SNPA — votre demande d'adoption pour ${animal.name}`,
    body: `Bonjour ${b.familyFirstName},\n\nNous avons bien reçu votre demande d'adoption pour ${animal.name}.\nVous pouvez suivre son avancement à tout moment ici :\n${process.env.FRONTEND_URL || "http://localhost:3000"}/suivi/${token}\n\nL'équipe du refuge SNPA`,
  });

  res.status(201).json({ id: rows[0].id, trackingToken: token });
});

// ---------- Public : suivi par lien magique ----------
router.get("/track/:token", async (req, res) => {
  const { rows } = await db.query(`${SELECT_BASE} WHERE r.magic_token = $1`, [req.params.token]);
  if (!rows[0]) return res.status(404).json({ error: "Lien de suivi invalide." });
  const row = rows[0];
  res.json({
    status: row.status,
    animalName: row.animal_name,
    familyFirstName: row.family_first_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    meeting: row.meeting_date ? { date: row.meeting_date, slot: row.meeting_slot } : null,
  });
});

// ---------- CRM ----------
const CAN_MANAGE = ["ADMINISTRATOR", "ADOPTION_MANAGER", "STAFF"];

router.get("/", requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  const { status } = req.query;
  const params = [];
  let where = "";
  if (status && status !== "TOUS") {
    params.push(status);
    where = `WHERE r.status = $1`;
  }
  const { rows } = await db.query(`${SELECT_BASE} ${where} ORDER BY r.created_at DESC`, params);
  res.json({ requests: rows.map(mapRequest) });
});

router.get("/:id", requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  const { rows } = await db.query(`${SELECT_BASE} WHERE r.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Demande introuvable." });
  res.json({ request: mapRequest(rows[0]) });
});

const NEXT_STATUSES = {
  NEW: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["MEETING_SCHEDULED", "REJECTED"],
  MEETING_SCHEDULED: ["APPROVED", "REJECTED"],
  APPROVED: ["ADOPTED", "REJECTED"],
  REJECTED: [],
  ADOPTED: [],
};

router.patch("/:id/status", requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  const { status } = req.body || {};
  const { rows: cur } = await db.query("SELECT * FROM adoption_requests WHERE id = $1", [req.params.id]);
  if (!cur[0]) return res.status(404).json({ error: "Demande introuvable." });

  const allowed = NEXT_STATUSES[cur[0].status] || [];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: `Transition ${cur[0].status} → ${status} non autorisée.` });
  }

  const { rows } = await db.query(
    `UPDATE adoption_requests SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [status, req.params.id]
  );

  // Effets de bord sur l'animal
  if (status === "APPROVED") {
    await db.query(`UPDATE animals SET status = 'RESERVE', updated_at = now() WHERE id = $1`, [cur[0].animal_id]);
  }
  if (status === "ADOPTED") {
    await db.query(`UPDATE animals SET status = 'ADOPTE', updated_at = now() WHERE id = $1`, [cur[0].animal_id]);
  }
  if (status === "REJECTED" && cur[0].status === "APPROVED") {
    // L'animal redevient disponible si une approbation est annulée.
    await db.query(`UPDATE animals SET status = 'DISPONIBLE', updated_at = now() WHERE id = $1`, [cur[0].animal_id]);
  }

  await sendMail({
    to: rows[0].email,
    subject: `SNPA — mise à jour de votre demande d'adoption`,
    body: `Bonjour ${rows[0].family_first_name},\n\nLe statut de votre demande a changé : ${status}.\nSuivez votre dossier ici : ${process.env.FRONTEND_URL || "http://localhost:3000"}/suivi/${rows[0].magic_token}\n\nL'équipe du refuge SNPA`,
  });

  res.json({ request: mapRequest({ ...rows[0] }) });
});

router.patch("/:id/responsible", requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  const { responsibleId } = req.body || {};
  const { rows } = await db.query(
    `UPDATE adoption_requests SET responsible_id = $1, updated_at = now() WHERE id = $2 RETURNING *`,
    [responsibleId || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Demande introuvable." });
  res.json({ request: mapRequest(rows[0]) });
});

module.exports = router;
