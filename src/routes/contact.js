const express = require("express");
const { sendMail } = require("../utils/mailer");

const router = express.Router();

router.post("/", async (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !email || !message) return res.status(400).json({ error: "Tous les champs sont requis." });

  await sendMail({
    to: "contact@snpa-refuge.fr",
    subject: `Nouveau message du site — ${name}`,
    body: `De : ${name} <${email}>\n\n${message}`,
  });

  res.status(201).json({ ok: true });
});

module.exports = router;
