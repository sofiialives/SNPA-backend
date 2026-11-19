const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const CAN_MANAGE = ["ADMINISTRATOR", "ADOPTION_MANAGER", "STAFF"];

// Rencontres uniquement le samedi, par créneaux de 30 min, 2 familles max par créneau.
const SLOTS = ["10:00", "10:30", "11:00", "11:30", "14:00", "14:30", "15:00", "15:30", "16:00"];
const MAX_PER_SLOT = 2;

function isSaturday(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.getUTCDay() === 6;
}

// GET /api/meetings?date=YYYY-MM-DD (doit être un samedi) — grille d'occupation
router.get("/", requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  const { date } = req.query;
  if (!date || !isSaturday(date)) {
    return res.status(400).json({ error: "Merci de fournir une date de samedi (les rencontres n'ont lieu que le samedi)." });
  }
  const { rows } = await db.query(
    `SELECT m.*, a.family_first_name, a.family_last_name, an.name AS animal_name
     FROM meetings m
     JOIN adoption_requests a ON a.id = m.adoption_request_id
     JOIN animals an ON an.id = a.animal_id
     WHERE m.date = $1
     ORDER BY m.slot`,
    [date]
  );
  const grid = SLOTS.map((slot) => ({
    slot,
    bookings: rows
      .filter((r) => r.slot === slot)
      .map((r) => ({
        id: r.id,
        adoptionRequestId: r.adoption_request_id,
        family: `${r.family_first_name} ${r.family_last_name}`,
        animal: r.animal_name,
      })),
    full: rows.filter((r) => r.slot === slot).length >= MAX_PER_SLOT,
  }));
  res.json({ date, slots: grid, maxPerSlot: MAX_PER_SLOT });
});

// POST /api/meetings { adoptionRequestId, date, slot }
router.post("/", requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  const { adoptionRequestId, date, slot } = req.body || {};
  if (!adoptionRequestId || !date || !slot) return res.status(400).json({ error: "Champs requis manquants." });
  if (!isSaturday(date)) return res.status(400).json({ error: "Les rencontres ne peuvent être programmées que le samedi." });
  if (!SLOTS.includes(slot)) return res.status(400).json({ error: "Créneau invalide." });

  const { rows: reqRows } = await db.query("SELECT * FROM adoption_requests WHERE id = $1", [adoptionRequestId]);
  const request = reqRows[0];
  if (!request) return res.status(404).json({ error: "Demande introuvable." });
  if (request.status !== "UNDER_REVIEW") {
    return res.status(409).json({ error: "Seule une demande 'En cours d'examen' peut se voir programmer une rencontre." });
  }

  const { rows: countRows } = await db.query(
    `SELECT count(*)::int AS n FROM meetings WHERE date = $1 AND slot = $2`,
    [date, slot]
  );
  if (countRows[0].n >= MAX_PER_SLOT) {
    return res.status(409).json({ error: "Ce créneau est déjà complet (2 familles maximum)." });
  }

  const { rows } = await db.query(
    `INSERT INTO meetings (adoption_request_id, date, slot) VALUES ($1,$2,$3) RETURNING *`,
    [adoptionRequestId, date, slot]
  );
  await db.query(`UPDATE adoption_requests SET status = 'MEETING_SCHEDULED', updated_at = now() WHERE id = $1`, [adoptionRequestId]);

  res.status(201).json({ meeting: rows[0] });
});

router.delete("/:id", requireAuth, requireRole(...CAN_MANAGE), async (req, res) => {
  await db.query("DELETE FROM meetings WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
