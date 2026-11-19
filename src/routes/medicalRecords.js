const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const CAN_WRITE = ["ADMINISTRATOR", "VETERINARIAN", "STAFF"]; // Inès saisit pour le compte du vétérinaire

// GET /api/medical-records/animal/:animalId — historique, non modifiable
router.get("/animal/:animalId", requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT m.*, u.first_name || ' ' || u.last_name AS author_name
     FROM medical_records m JOIN users u ON u.id = m.author_id
     WHERE m.animal_id = $1 ORDER BY m.created_at DESC`,
    [req.params.animalId]
  );
  res.json({ records: rows });
});

// GET /api/medical-records/vaccine-reminders — rappels de vaccin à venir (30 jours)
router.get("/vaccine-reminders", requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `SELECT m.id, m.vaccine_reminder_date, a.id AS animal_id, a.name AS animal_name
     FROM medical_records m JOIN animals a ON a.id = m.animal_id
     WHERE m.vaccine_reminder_date IS NOT NULL
       AND m.vaccine_reminder_date <= (CURRENT_DATE + interval '30 days')
       AND a.status != 'ADOPTE'
     ORDER BY m.vaccine_reminder_date ASC`
  );
  res.json({ reminders: rows });
});

// POST /api/medical-records — nouvelle entrée (auteur + horodatage automatiques, non modifiables ensuite)
router.post("/", requireAuth, requireRole(...CAN_WRITE), async (req, res) => {
  const b = req.body || {};
  if (!b.animalId || !b.diagnostic) return res.status(400).json({ error: "Animal et diagnostic requis." });

  const { rows } = await db.query(
    `INSERT INTO medical_records (animal_id, author_id, diagnostic, description, walk_ban_activated, walk_ban_lifted, vaccine_reminder_date)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      b.animalId, req.user.sub, b.diagnostic, b.description || "",
      !!b.walkBanActivated, !!b.walkBanLifted, b.vaccineReminderDate || null,
    ]
  );

  if (b.walkBanActivated) {
    await db.query(`UPDATE animals SET walk_banned = true, walk_ban_reason = $1, updated_at = now() WHERE id = $2`, [b.diagnostic, b.animalId]);
  }
  if (b.walkBanLifted) {
    await db.query(`UPDATE animals SET walk_banned = false, walk_ban_reason = NULL, updated_at = now() WHERE id = $1`, [b.animalId]);
  }

  res.status(201).json({ record: rows[0] });
});

module.exports = router;
