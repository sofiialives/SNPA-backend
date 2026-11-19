// Données de démonstration : 3 comptes salariés (Sophie/Inès/Karim), 2 bénévoles,
// quelques animaux, une demande d'adoption d'exemple.
// Usage : node scripts/seed.js
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { nanoid } = require("nanoid");
const { Pool } = require("pg");

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log("Nettoyage des données existantes...");
  await pool.query(`
    TRUNCATE medical_records, walks, meetings, adoption_requests, animals, users RESTART IDENTITY CASCADE;
  `);

  const pw = await bcrypt.hash("snpa2026", 10);

  console.log("Création des comptes...");
  const { rows: users } = await pool.query(
    `INSERT INTO users (first_name, last_name, email, phone, password_hash, role, status)
     VALUES
       ('Sophie', 'Morin', 'sophie@snpa-refuge.fr', '0600000001', $1, 'ADMINISTRATOR', 'ACTIVE'),
       ('Inès', 'Benali', 'ines@snpa-refuge.fr', '0600000002', $1, 'STAFF', 'ACTIVE'),
       ('Karim', 'Djebbar', 'karim@snpa-refuge.fr', '0600000003', $1, 'ADOPTION_MANAGER', 'ACTIVE'),
       ('Lucie', 'Petit', 'lucie.benevole@example.com', '0600000004', $1, 'VOLUNTEER', 'ACTIVE'),
       ('Marc', 'Durand', 'marc.benevole@example.com', '0600000005', $1, 'VOLUNTEER', 'PENDING')
     RETURNING id, email, role`,
    [pw]
  );
  console.table(users);

  const sophie = users.find((u) => u.role === "ADMINISTRATOR");
  const lucie = users.find((u) => u.email === "lucie.benevole@example.com");

  console.log("Création des animaux...");
  const animalsData = [
    ["Rex", "CHIEN", "Labrador", "MALE", 2, 0, "Rex est un labrador joueur et très affectueux, idéal pour une famille active. Il adore les balades et les jeux de balle.", "OUI", "NON", "OUI", false, null, "DISPONIBLE", 40],
    ["Mimi", "CHAT", "Européen", "FEMELLE", 1, 0, "Mimi est une chatte curieuse et câline, parfaite pour un appartement calme.", "OUI", "OUI", "INCONNU", false, null, "DISPONIBLE", 10],
    ["Bonny", "CHIEN", "Croisé", "FEMELLE", 4, 0, "Bonny se remet d'une opération. Patte arrière en convalescence, sorties interdites pour l'instant.", "OUI", "NON", "NON", true, "Convalescence post-opératoire — interdiction posée par le vétérinaire", "EN_SOINS", 25],
    ["Jack", "CHIEN", "Border Collie", "MALE", 3, 0, "Jack est un border collie énergique qui a besoin d'un foyer avec beaucoup d'espace et d'activité.", "NON", "NON", "OUI", false, null, "DISPONIBLE", 60],
    ["Luna", "CHAT", "Siamois", "FEMELLE", 3, 0, "Luna est une chatte indépendante mais douce une fois en confiance.", "OUI", "OUI", "OUI", false, null, "RESERVE", 5],
    ["Milo", "AUTRE", "Lapin nain", "MALE", 1, 0, "Milo est un lapin nain très sociable, s'entend bien avec les enfants calmes.", "OUI", "INCONNU", "INCONNU", false, null, "DISPONIBLE", 15],
  ];

  const animalIds = {};
  for (const a of animalsData) {
    const [
      name, type, breed, sex, ageYears, ageMonths, description,
      compatEnfants, compatChats, compatChiens, walkBanned, walkBanReason, status, daysAgo,
    ] = a;
    const { rows } = await pool.query(
      `INSERT INTO animals
        (name, type, breed, sex, age_years, age_months, description, vaccinated, sterilized, chipped,
         compat_enfants, compat_chats, compat_chiens, walk_banned, walk_ban_reason, status, arrived_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,true,true,$8,$9,$10,$11,$12,$13, now() - ($14 || ' days')::interval)
       RETURNING id, name`,
      [name, type, breed, sex, ageYears, ageMonths, description, compatEnfants, compatChats, compatChiens, walkBanned, walkBanReason, status, daysAgo]
    );
    animalIds[name] = rows[0].id;
  }
  console.log("Animaux créés :", Object.keys(animalIds).join(", "));

  console.log("Dossier médical d'exemple (Bonny, interdiction de sortie)...");
  await pool.query(
    `INSERT INTO medical_records (animal_id, author_id, diagnostic, description, walk_ban_activated, vaccine_reminder_date)
     VALUES ($1, $2, 'Opération patte arrière', 'Suites opératoires normales. Repos strict recommandé 3 semaines.', true, (now() + interval '20 days')::date)`,
    [animalIds["Bonny"], sophie.id]
  );

  console.log("Demande d'adoption d'exemple (Rex)...");
  const token = nanoid(24);
  await pool.query(
    `INSERT INTO adoption_requests
      (animal_id, family_first_name, family_last_name, email, phone, address, motivation,
       has_children, children_ages, has_garden, other_animals, daily_alone_hours, experience,
       status, magic_token)
     VALUES ($1,'Claire','Fabre','claire.fabre@example.com','0611223344','12 rue des Lilas, Rouen',
       'Nous cherchons un compagnon actif pour nos sorties en forêt le week-end.',
       true, '8 et 11 ans', true, 'Aucun autre animal', '4-5h en semaine', 'Nous avons déjà eu un chien pendant 10 ans.',
       'NEW', $2)`,
    [animalIds["Rex"], token]
  );
  console.log("Lien de suivi famille (exemple) : /suivi/" + token);

  console.log("Créneau de promenade réservé (exemple, Jack, bénévole Lucie)...");
  await pool.query(
    `INSERT INTO walks (animal_id, volunteer_id, date, slot, status)
     VALUES ($1, $2, CURRENT_DATE, '11:00', 'RESERVED')`,
    [animalIds["Jack"], lucie.id]
  );

  await pool.end();
  console.log("\nSeed terminé. Comptes de démonstration (mot de passe : snpa2026) :");
  console.log("  sophie@snpa-refuge.fr        — Administrator");
  console.log("  ines@snpa-refuge.fr          — Staff");
  console.log("  karim@snpa-refuge.fr         — Adoption Manager");
  console.log("  lucie.benevole@example.com   — Volunteer (actif)");
  console.log("  marc.benevole@example.com    — Volunteer (en attente de validation)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
