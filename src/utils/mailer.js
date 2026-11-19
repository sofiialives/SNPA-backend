// Mailer "à blanc" pour la version de démonstration : aucun SMTP n'est configuré,
// les emails sont simplement journalisés en console et conservés en mémoire
// (consultables via GET /api/dev/outbox) pour pouvoir tester le flux sans vraie boîte mail.
// Pour brancher un vrai envoi (ex. Resend, Postmark, SMTP) : remplacer le corps de sendMail.

const outbox = [];

async function sendMail({ to, subject, body }) {
  const entry = { to, subject, body, sentAt: new Date().toISOString() };
  outbox.push(entry);
  if (outbox.length > 200) outbox.shift();
  console.log(`\n--- [EMAIL SIMULÉ] ---\nÀ : ${to}\nObjet : ${subject}\n${body}\n----------------------\n`);
  return entry;
}

function getOutbox() {
  return outbox.slice().reverse();
}

module.exports = { sendMail, getOutbox };
