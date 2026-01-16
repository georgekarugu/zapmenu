import jwt from "jsonwebtoken";
import type { AdminAuthPayload, GuestAuthPayload, AuthPayload } from "./auth.helper.js";

// Get JWT secret from environment variable
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d"; // Default 7 days

/**
 * Generates a JWT token for an admin
 */
export function generateAdminToken(payload: AdminAuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: "zapmenu",
    subject: `admin:${payload.adminId}`,
  });
}

/**
 * Generates a JWT token for a guest
 */
export function generateGuestToken(payload: GuestAuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: "zapmenu",
    subject: `guest:${payload.guestId}`,
  });
}

/**
 * Verifies and decodes a JWT token
 * Returns the payload if valid, null otherwise
 */
export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: "zapmenu",
    }) as AuthPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      console.error("JWT verification error:", error.message);
    } else if (error instanceof jwt.TokenExpiredError) {
      console.error("JWT token expired:", error.expiredAt);
    } else if (error instanceof jwt.NotBeforeError) {
      console.error("JWT token not active:", error.date);
    }
    return null;
  }
}

/**
 * Decodes a JWT token without verification (for debugging only)
 */
export function decodeToken(token: string): AuthPayload | null {
  try {
    return jwt.decode(token) as AuthPayload | null;
  } catch (error) {
    console.error("JWT decode error:", error);
    return null;
  }
}

/**
 * Extracts token from Authorization header
 * Supports: "Bearer <token>" or just "<token>"
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) return null;

  // Check for Bearer token format
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  // Return as-is if no Bearer prefix
  return authHeader;
}
