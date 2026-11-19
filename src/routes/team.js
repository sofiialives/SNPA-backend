const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { sendMail } = require("../utils/mailer");

const router = express.Router();

// Liste des bénévoles actifs — utile pour les écrans Promenades (réservation pour un bénévole)
router.get("/volunteers", requireAuth, requireRole("ADMINISTRATOR", "STAFF", "ADOPTION_MANAGER"), async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, first_name, last_name, email FROM users WHERE role = 'VOLUNTEER' AND status = 'ACTIVE' ORDER BY first_name`
  );
  res.json({ volunteers: rows });
});

// Liste courte du personnel pouvant être désigné responsable d'une demande.
router.get("/staff", requireAuth, requireRole("ADMINISTRATOR", "ADOPTION_MANAGER", "STAFF"), async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, first_name, last_name, role FROM users
     WHERE role IN ('ADMINISTRATOR','ADOPTION_MANAGER','STAFF') AND status = 'ACTIVE' ORDER BY first_name`
  );
  res.json({ staff: rows });
});

router.get("/", requireAuth, requireRole("ADMINISTRATOR"), async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, first_name, last_name, email, phone, role, status, created_at FROM users ORDER BY created_at`
  );
  res.json({ users: rows });
});

// Bénévoles en attente de validation (vue dédiée, utile pour le dashboard admin)
router.get("/pending", requireAuth, requireRole("ADMINISTRATOR"), async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, first_name, last_name, email, phone, created_at FROM users WHERE status = 'PENDING' ORDER BY created_at`
  );
  res.json({ users: rows });
});

// POST /api/team/invite — invite un salarié (compte créé, mot de passe provisoire envoyé par email simulé)
router.post("/invite", requireAuth, requireRole("ADMINISTRATOR"), async (req, res) => {
  const { firstName, lastName, email, role } = req.body || {};
  if (!firstName || !lastName || !email || !role) return res.status(400).json({ error: "Champs requis manquants." });

  const existing = await db.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase().trim()]);
  if (existing.rows.length) return res.status(409).json({ error: "Un compte existe déjà avec cet email." });

  const tempPassword = crypto.randomBytes(4).toString("hex");
  const hash = await bcrypt.hash(tempPassword, 10);
  const { rows } = await db.query(
    `INSERT INTO users (first_name, last_name, email, password_hash, role, status)
     VALUES ($1,$2,$3,$4,$5,'INVITED') RETURNING id, email, role, status`,
    [firstName, lastName, email.toLowerCase().trim(), hash, role]
  );

  await sendMail({
    to: email,
    subject: "SNPA — invitation à rejoindre le CRM",
    body: `Bonjour ${firstName},\n\nVous avez été invité(e) à rejoindre le CRM du refuge SNPA en tant que ${role}.\nMot de passe provisoire : ${tempPassword}\n\nConnectez-vous puis changez ce mot de passe dès que possible.`,
  });

  res.status(201).json({ user: rows[0] });
});

// PATCH /api/team/:id/approve — valide un compte bénévole en attente
router.patch("/:id/approve", requireAuth, requireRole("ADMINISTRATOR"), async (req, res) => {
  const { rows } = await db.query(
    `UPDATE users SET status = 'ACTIVE' WHERE id = $1 AND status = 'PENDING' RETURNING id, email, first_name`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Compte introuvable ou déjà validé." });
  await sendMail({
    to: rows[0].email,
    subject: "SNPA — votre compte bénévole a été validé",
    body: `Bonjour ${rows[0].first_name},\n\nVotre compte bénévole a été validé par l'administrateur du refuge. Vous pouvez maintenant vous connecter et réserver des promenades.`,
  });
  res.json({ user: rows[0] });
});

router.patch("/:id/role", requireAuth, requireRole("ADMINISTRATOR"), async (req, res) => {
  const { role } = req.body || {};
  const { rows } = await db.query(`UPDATE users SET role = $1 WHERE id = $2 RETURNING id, role`, [role, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Utilisateur introuvable." });
  res.json({ user: rows[0] });
});

router.delete("/:id", requireAuth, requireRole("ADMINISTRATOR"), async (req, res) => {
  await db.query("DELETE FROM users WHERE id = $1", [req.params.id]);
  res.status(204).end();
});

module.exports = router;
