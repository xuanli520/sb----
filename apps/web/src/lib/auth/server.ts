import { jwtVerify } from 'jose';
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from './constants';

function requireJwtSecret(): string {
  const secret =
    process.env.AUTH__JWT_SECRET ||
    process.env.AUTH_JWT_SECRET ||
    process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
}

function getJwtAlgorithm(): string {
  return (
    process.env.AUTH__JWT_ALGORITHM ||
    process.env.AUTH_JWT_ALGORITHM ||
    process.env.JWT_ALGORITHM ||
    'HS256'
  );
}

const JWT_SECRET = new TextEncoder().encode(requireJwtSecret());

export async function verifyAccessCookieToken(token: string | null | undefined): Promise<boolean> {
  if (!token) {
    return false;
  }

  try {
    await jwtVerify(token, JWT_SECRET, {
      algorithms: [getJwtAlgorithm()],
    });
    return true;
  } catch {
    return false;
  }
}
