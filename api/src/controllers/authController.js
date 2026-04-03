const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const userModel = require("../models/userModel");
const env = require("../config/env");
const logger = require("../middleware/logger");

const SALT_ROUNDS = 12;
const ALLOWED_ROLES = ["admin", "developer", "viewer"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function register(req, res) {
  const { email, password, role = "viewer" } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email is required" });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }
  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "password is required" });
  }
  if (password.length < 8) {
    return res
      .status(400)
      .json({ error: "password must be at least 8 characters" });
  }
  if (!ALLOWED_ROLES.includes(role)) {
    return res
      .status(400)
      .json({ error: `role must be one of: ${ALLOWED_ROLES.join(", ")}` });
  }

  try {
    const existing = await userModel.findByEmail(email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const roleRecord = await userModel.findRoleByName(role);
    if (!roleRecord) {
      return res.status(400).json({ error: "Role not found" });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await userModel.create({
      email: email.toLowerCase(),
      passwordHash,
      roleId: roleRecord.id,
    });

    logger.info("User registered", {
      userId: user.id,
      email: user.email,
      role,
    });

    return res.status(201).json({
      message: "User registered successfully",
      user: { id: user.id, email: user.email, role },
    });
  } catch (err) {
    logger.error("Registration failed", { error: err.message });
    return res.status(500).json({ error: "Internal server error" });
  }
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email is required" });
  }
  if (!password || typeof password !== "string") {
    return res.status(400).json({ error: "password is required" });
  }

  try {
    const user = await userModel.findByEmail(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      env.jwtSecret,
      { expiresIn: env.jwtExpiresIn },
    );

    logger.info("User logged in", { userId: user.id, email: user.email });

    return res.json({ token, expiresIn: env.jwtExpiresIn });
  } catch (err) {
    logger.error("Login failed", { error: err.message });
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { register, login };
