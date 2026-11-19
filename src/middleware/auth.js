const { verify } = require("../utils/jwt");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentification requise." });
  try {
    req.user = verify(token);
    next();
  } catch {
    return res.status(401).json({ error: "Session invalide ou expirée." });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Authentification requise." });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Accès refusé pour votre rôle." });
    }
    next();
  };
}

// Rôles considérés "staff" (par opposition aux bénévoles) pour les écrans d'équipe.
const STAFF_ROLES = ["ADMINISTRATOR", "VETERINARIAN", "ADOPTION_MANAGER", "STAFF"];

module.exports = { requireAuth, requireRole, STAFF_ROLES };
