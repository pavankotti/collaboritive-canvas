/**
 * AuthService — issues and validates ephemeral JWT tokens for socket identity.
 *
 * Players don't register with a password. Instead, on first connection they
 * provide a name and receive a signed JWT. The token is stored in localStorage
 * on the client and sent with every socket handshake so the server can
 * re-identify the player on reconnect.
 */

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? 'skribblcanvas-dev-secret-change-in-prod';
const EXPIRES_IN = '30d';

export interface TokenPayload {
  /** The cuid() user id */
  userId: string;
  name: string;
  color: string;
}

export class AuthService {
  /** Create a signed JWT for the given player. */
  static issue(payload: TokenPayload): string {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: EXPIRES_IN });
  }

  /**
   * Verify and decode a JWT.
   * Returns the payload on success, or `null` if the token is invalid / expired.
   */
  static verify(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload & jwt.JwtPayload;
      return { userId: decoded.userId, name: decoded.name, color: decoded.color };
    } catch {
      return null;
    }
  }
}
