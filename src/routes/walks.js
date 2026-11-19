const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const MAX_WALKS_PER_VOLUNTEER_PER_DAY = 2;
const SLOTS = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];

// GET /api/walks?date=YYYY-MM-DD — grille animal x créneau pour une journée
router.get("/", requireAuth, async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  const { rows: animals } = await db.query(
    `SELECT id, name, type, walk_banned, walk_ban_reason FROM animals WHERE status != 'ADOPTE' ORDER BY name`
  );
  const { rows: walks } = await db.query(
    `SELECT w.*, u.first_name || ' ' || u.last_name AS volunteer_name
     FROM walks w JOIN users u ON u.id = w.volunteer_id
     WHERE w.date = $1`,
    [date]
  );

  const grid = animals.map((a) => ({
    animalId: a.id,
    animalName: a.name,
    type: a.type,
    walkBanned: a.walk_banned,
    walkBanReason: a.walk_ban_reason,
    slots: SLOTS.map((slot) => {
      const w = walks.find((x) => x.animal_id === a.id && x.slot === slot);
      return w
        ? { slot, booked: true, walkId: w.id, volunteerName: w.volunteer_name, status: w.status, startedAt: w.started_at, endedAt: w.ended_at }
        : { slot, booked: false };
    }),
  }));

  res.json({ date, slots: SLOTS, animals: grid });
});

// GET /api/walks/not-walked — animaux non sortis depuis plusieurs jours
router.get("/not-walked", requireAuth, async (req, res) => {
  const days = parseInt(req.query.days, 10) || 2;
  const { rows } = await db.query(
    `SELECT a.id, a.name, a.type, a.walk_banned,
            (SELECT max(w.date) FROM walks w WHERE w.animal_id = a.id AND w.status = 'DONE') AS last_walk
     FROM animals a
     WHERE a.status != 'ADOPTE' AND a.walk_banned = false
     ORDER BY last_walk ASC NULLS FIRST`
  );
  const today = new Date();
  const flagged = rows.filter((r) => {
    if (!r.last_walk) return true;
    const diffDays = Math.floor((today - new Date(r.last_walk)) / 86400000);
    return diffDays >= days;
  });
  res.json({ days, animals: flagged });
});

// POST /api/walks { animalId, date, slot } — réservation par un bénévole (ou staff pour le compte d'un bénévole)
router.post("/", requireAuth, async (req, res) => {
  const { animalId, date, slot, volunteerId } = req.body || {};
  if (!animalId || !date || !slot) return res.status(400).json({ error: "Champs requis manquants." });
  if (!SLOTS.includes(slot)) return res.status(400).json({ error: "Créneau invalide." });

  const actingVolunteerId = req.user.role === "VOLUNTEER" ? req.user.sub : volunteerId;
  if (!actingVolunteerId) return res.status(400).json({ error: "Bénévole requis." });

  const { rows: animalRows } = await db.query("SELECT * FROM animals WHERE id = $1", [animalId]);
  const animal = animalRows[0];
  if (!animal) return res.status(404).json({ error: "Animal introuvable." });
  if (animal.walk_banned) {
    return res.status(409).json({ error: `Promenade interdite pour cet animal${animal.walk_ban_reason ? " : " + animal.walk_ban_reason : "."}` });
  }

  const { rows: slotTaken } = await db.query(
    `SELECT id FROM walks WHERE animal_id = $1 AND date = $2 AND slot = $3 AND status != 'CANCELED'`,
    [animalId, date, slot]
  );
  if (slotTaken.length) return res.status(409).json({ error: "Ce créneau est déjà réservé pour cet animal." });

  const { rows: countRows } = await db.query(
    `SELECT count(*)::int AS n FROM walks WHERE volunteer_id = $1 AND date = $2 AND status != 'CANCELED'`,
    [actingVolunteerId, date]
  );
  if (countRows[0].n >= MAX_WALKS_PER_VOLUNTEER_PER_DAY) {
    return res.status(409).json({ error: `Un bénévole ne peut pas faire plus de ${MAX_WALKS_PER_VOLUNTEER_PER_DAY} promenades par jour.` });
  }

  const { rows } = await db.query(
    `INSERT INTO walks (animal_id, volunteer_id, date, slot, status) VALUES ($1,$2,$3,$4,'RESERVED') RETURNING *`,
    [animalId, actingVolunteerId, date, slot]
  );
  res.status(201).json({ walk: rows[0] });
});

// PATCH /api/walks/:id/start — le bénévole part avec l'animal
router.patch("/:id/start", requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `UPDATE walks SET status = 'IN_PROGRESS', started_at = now() WHERE id = $1 AND status = 'RESERVED' RETURNING *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(409).json({ error: "Impossible de démarrer cette promenade (déjà démarrée, terminée, ou introuvable)." });
  res.json({ walk: rows[0] });
});

// PATCH /api/walks/:id/end — le bénévole est rentré
router.patch("/:id/end", requireAuth, async (req, res) => {
  const { rows } = await db.query(
    `UPDATE walks SET status = 'DONE', ended_at = now() WHERE id = $1 AND status = 'IN_PROGRESS' RETURNING *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(409).json({ error: "Impossible de clôturer cette promenade (non démarrée, déjà terminée, ou introuvable)." });
  res.json({ walk: rows[0] });
});

router.delete("/:id", requireAuth, async (req, res) => {
  await db.query(`UPDATE walks SET status = 'CANCELED' WHERE id = $1`, [req.params.id]);
  res.status(204).end();
});

module.exports = router;
