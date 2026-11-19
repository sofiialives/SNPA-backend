const jwt = require("jsonwebtoken");

const SECRET = process.env.JWT_SECRET || "dev-secret";

function sign(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email, firstName: user.first_name, lastName: user.last_name },
    SECRET,
    { expiresIn: "7d" }
  );
}

function verify(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { sign, verify };
