import bcrypt from "bcryptjs";

/**
 * Password hashing with bcrypt.
 *  - cost 12 is the current OWASP recommendation for compute/accommodating
 *    future hardware without being agonizingly slow on commodity CPUs;
 *  - bcrypt truncates at 72 bytes — the login contract rejects longer inputs
 *    defensively so a silently-truncating value can never authenticate.
 */

const SALT_ROUNDS = 12;
export const MAX_PASSWORD_LENGTH = 72;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false; // malformed hash can never match
  }
}

/** Guard every password-boundary with this before hashing comparisons. */
export function isPasswordLengthAllowed(plain: string): boolean {
  return plain.length >= 8 && plain.length <= MAX_PASSWORD_LENGTH;
}