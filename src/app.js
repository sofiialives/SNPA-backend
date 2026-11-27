const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { getOutbox } = require("./utils/mailer");
const { requireAuth, requireRole } = require("./middleware/auth");

const authRoutes = require("./routes/auth");
const animalsRoutes = require("./routes/animals");
const adoptionRequestsRoutes = require("./routes/adoptionRequests");
const meetingsRoutes = require("./routes/meetings");
const walksRoutes = require("./routes/walks");
const medicalRecordsRoutes = require("./routes/medicalRecords");
const statsRoutes = require("./routes/stats");
const teamRoutes = require("./routes/team");
const contactRoutes = require("./routes/contact");

const app = express();
app.use(cors());
// Limite par défaut d'express.json() (100kb) trop basse pour les photos envoyées en base64
// (retour Sophie : upload de photos depuis la fiche animal) — 8mb laisse de la marge au-delà
// de la limite de 5 Mo appliquée par photo côté route (le base64 gonfle la taille d'~1.37x).
app.use(express.json({ limit: "8mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Boîte de réception de démo : affiche les emails "envoyés" par l'app (aucun SMTP n'est branché
// pour le moment). Réservée à l'administrateur·rice : ces emails contiennent les liens de suivi
// personnels des familles (jetons magiques), qui ne doivent pas être accessibles sans connexion.
app.get("/api/dev/outbox", requireAuth, requireRole("ADMINISTRATOR"), (req, res) => res.json({ emails: getOutbox() }));

app.use("/api/auth", authRoutes);
app.use("/api/animals", animalsRoutes);
app.use("/api/adoption-requests", adoptionRequestsRoutes);
app.use("/api/meetings", meetingsRoutes);
app.use("/api/walks", walksRoutes);
app.use("/api/medical-records", medicalRecordsRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/team", teamRoutes);
app.use("/api/contact", contactRoutes);

app.use((req, res) => res.status(404).json({ error: "Route introuvable." }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erreur serveur." });
});

module.exports = app;
