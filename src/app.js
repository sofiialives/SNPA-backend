const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { getOutbox } = require("./utils/mailer");

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
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ ok: true }));

// Boîte de réception de démo : affiche les emails "envoyés" par l'app (aucun SMTP n'est branché).
app.get("/api/dev/outbox", (req, res) => res.json({ emails: getOutbox() }));

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
