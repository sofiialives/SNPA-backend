// Exécute tous les fichiers .sql de /migrations, dans l'ordre, un par un.
// Usage : node scripts/migrate.js
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { Pool } = require("pg");

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const dir = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  for (const file of files) {
    const { rows } = await pool.query("SELECT 1 FROM _migrations WHERE name = $1", [file]);
    if (rows.length) {
      console.log(`- ${file} déjà appliquée`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    console.log(`→ Application de ${file}...`);
    await pool.query(sql);
    await pool.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
    console.log(`✓ ${file} appliquée`);
  }

  await pool.end();
  console.log("Migrations terminées.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
