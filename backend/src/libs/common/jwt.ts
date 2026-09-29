import jwt from 'jsonwebtoken';

export interface JwtPayload {
  uid: number;
  phone: string;
  nickname: string;
}

const SECRET = process.env.JWT_SECRET ?? 'robotaxi-demo-secret-local-only';
const TTL = '12h';

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: TTL });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export function bearer(header?: string): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1] : null;
}
