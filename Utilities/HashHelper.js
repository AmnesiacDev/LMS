import bcrypt from "bcryptjs";
import { parseSaltRounds } from "../Configs/validateEnv.js";

async function hashPasswordHelper(plainPassword) {
  const saltRounds = parseSaltRounds(process.env.SALT_ROUNDS);
  return bcrypt.hash(plainPassword, saltRounds);
}

async function ComparePasswordHelper(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

export { hashPasswordHelper, ComparePasswordHelper };
