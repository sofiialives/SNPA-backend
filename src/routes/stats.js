const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
// Note : pas de "charge par employé" — retiré explicitement par la cliente
// ("nous sommes trois, et je ne veux pas surveiller mon équipe").

router.get("/", requireAuth, requireRole("ADMINISTRATOR", "ADOPTION_MANAGER", "STAFF"), async (req, res) => {
  const months = parseInt(req.query.months, 10) || 12;

  const { rows: totals } = await db.query(
    `SELECT
       (SELECT count(*)::int FROM adoption_requests WHERE status = 'ADOPTED') AS adoptions_total,
       (SELECT count(*)::int FROM adoption_requests WHERE status = 'REJECTED') AS rejected_total,
       (SELECT count(*)::int FROM animals WHERE status != 'ADOPTE') AS animals_total,
       (SELECT avg(EXTRACT(DAY FROM (updated_at - created_at)))::int FROM adoption_requests WHERE status = 'ADOPTED') AS avg_days_to_adopt`
  );

  const { rows: byMonth } = await db.query(
    `SELECT to_char(date_trunc('month', updated_at), 'YYYY-MM') AS month, count(*)::int AS count
     FROM adoption_requests
     WHERE status = 'ADOPTED' AND updated_at >= now() - ($1 || ' months')::interval
     GROUP BY 1 ORDER BY 1`,
    [months]
  );

  const { rows: byType } = await db.query(
    `SELECT type, count(*)::int AS count FROM animals WHERE status != 'ADOPTE' GROUP BY type`
  );

  res.json({
    adoptionsTotal: totals[0].adoptions_total,
    rejectedTotal: totals[0].rejected_total,
    animalsTotal: totals[0].animals_total,
    avgDaysToAdopt: totals[0].avg_days_to_adopt,
    adoptionsByMonth: byMonth,
    animalsByType: byType,
  });
});

module.exports = router;
