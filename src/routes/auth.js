const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { sign } = require("../utils/jwt");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// POST /api/auth/login — connexion salarié ou bénévole validé
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "Email et mot de passe requis." });

  const { rows } = await db.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
  const user = rows[0];
  if (!user || !user.password_hash) return res.status(401).json({ error: "Identifiants incorrects." });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Identifiants incorrects." });

  if (user.status === "PENDING") {
    return res.status(403).json({ error: "Votre compte bénévole n'a pas encore été validé par l'administrateur du refuge." });
  }

  const token = sign(user);
  res.json({
    token,
    user: {
      id: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      role: user.role,
      status: user.status,
    },
  });
});

// POST /api/auth/register-volunteer — auto-inscription bénévole, compte en attente de validation
router.post("/register-volunteer", async (req, res) => {
  const { firstName, lastName, email, phone, password } = req.body || {};
  if (!firstName || !lastName || !email || !phone || !password) {
    return res.status(400).json({ error: "Tous les champs sont requis." });
  }
  const existing = await db.query("SELECT id FROM users WHERE email = $1", [email.toLowerCase().trim()]);
  if (existing.rows.length) return res.status(409).json({ error: "Un compte existe déjà avec cet email." });

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    `INSERT INTO users (first_name, last_name, email, phone, password_hash, role, status)
     VALUES ($1,$2,$3,$4,$5,'VOLUNTEER','PENDING') RETURNING id, email, status`,
    [firstName, lastName, email.toLowerCase().trim(), phone, hash]
  );
  res.status(201).json({
    message: "Votre inscription a été envoyée. L'administrateur du refuge doit valider votre compte avant que vous puissiez réserver des promenades.",
    user: rows[0],
  });
});

// GET /api/auth/me
router.get("/me", requireAuth, async (req, res) => {
  const { rows } = await db.query("SELECT id, first_name, last_name, email, role, status FROM users WHERE id = $1", [req.user.sub]);
  if (!rows[0]) return res.status(404).json({ error: "Utilisateur introuvable." });
  res.json({ user: rows[0] });
});

module.exports = router;
