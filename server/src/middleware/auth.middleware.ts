import type { Request, Response, NextFunction } from "express";
import {
  verifyAdminHotelAccess,
  verifyGuestHotelAccess,
  getAdminById,
  getGuestById,
  type AdminAuthPayload,
  type GuestAuthPayload,
} from "../helpers/auth.helper.js";
import { verifyToken, extractTokenFromHeader } from "../helpers/jwt.helper.js";

// ============================================
// Type Extensions for Express Request
// ============================================

declare global {
  namespace Express {
    interface Request {
      admin?: AdminAuthPayload & { id: number; name: string; phone: string };
      guest?: GuestAuthPayload & { id: number; name: string };
      hotelId?: number;
    }
  }
}

// ============================================
// Authentication Middleware
// ============================================

/**
 * Middleware to authenticate admin requests
 * Expects JWT token in Authorization header with admin payload
 * Sets req.admin and req.hotelId on success
 */
export async function authenticateAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Verify token
    const payload = verifyToken(token);
    if (!payload || payload.type !== "admin") {
      res.status(401).json({ error: "Invalid token or not an admin token" });
      return;
    }

    const adminPayload = payload as AdminAuthPayload;

    // Verify admin exists in database
    const admin = await getAdminById(adminPayload.adminId);
    if (!admin) {
      res.status(401).json({ error: "Admin not found" });
      return;
    }

    // Attach admin info to request
    req.admin = {
      ...adminPayload,
      id: admin.id,
      name: admin.name,
      phone: admin.phone,
    };
    req.hotelId = adminPayload.hotelId;

    next();
  } catch (error) {
    console.error("Admin authentication error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}

/**
 * Middleware to authenticate guest requests
 * Expects JWT token in Authorization header with guest payload
 * Sets req.guest on success
 */
export async function authenticateGuest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Verify token
    const payload = verifyToken(token);
    if (!payload || payload.type !== "guest") {
      res.status(401).json({ error: "Invalid token or not a guest token" });
      return;
    }

    const guestPayload = payload as GuestAuthPayload;

    // Verify guest exists in database
    const guest = await getGuestById(guestPayload.guestId);
    if (!guest) {
      res.status(401).json({ error: "Guest not found" });
      return;
    }

    // Attach guest info to request
    req.guest = {
      ...guestPayload,
      id: guest.id,
      name: guest.name,
    };

    next();
  } catch (error) {
    console.error("Guest authentication error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}

/**
 * Middleware to authenticate either admin or guest
 * Tries admin first, then guest
 */
export async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    if (payload.type === "admin") {
      const adminPayload = payload as AdminAuthPayload;
      const admin = await getAdminById(adminPayload.adminId);
      if (!admin) {
        res.status(401).json({ error: "Admin not found" });
        return;
      }
      req.admin = {
        ...adminPayload,
        id: admin.id,
        name: admin.name,
        phone: admin.phone,
      };
      req.hotelId = adminPayload.hotelId;
    } else if (payload.type === "guest") {
      const guestPayload = payload as GuestAuthPayload;
      const guest = await getGuestById(guestPayload.guestId);
      if (!guest) {
        res.status(401).json({ error: "Guest not found" });
        return;
      }
      req.guest = {
        ...guestPayload,
        id: guest.id,
        name: guest.name,
      };
    } else {
      res.status(401).json({ error: "Invalid token type" });
      return;
    }

    next();
  } catch (error) {
    console.error("User authentication error:", error);
    res.status(500).json({ error: "Authentication failed" });
  }
}

// ============================================
// Authorization Middleware
// ============================================

/**
 * Middleware to ensure the request is from an admin
 * Must be used after authenticateUser or authenticateAdmin
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.admin) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

/**
 * Middleware to ensure the request is from a guest
 * Must be used after authenticateUser or authenticateGuest
 */
export function requireGuest(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.guest) {
    res.status(403).json({ error: "Guest access required" });
    return;
  }
  next();
}

/**
 * Middleware to ensure admin has access to the specified hotel
 * Checks hotelId from route params or body
 * Must be used after authenticateAdmin
 */
export async function authorizeAdminHotel(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.admin) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Get hotelId from params, body, or query
    const hotelId = req.params.hotelId
      ? parseInt(req.params.hotelId, 10)
      : req.body.hotelId
        ? parseInt(req.body.hotelId, 10)
        : req.query.hotelId
          ? parseInt(req.query.hotelId as string, 10)
          : null;

    // If no hotelId specified, use the admin's hotel
    const targetHotelId = hotelId || req.admin.hotelId;

    // Verify admin has access to this hotel
    const hasAccess = await verifyAdminHotelAccess(req.admin.adminId, targetHotelId);
    if (!hasAccess) {
      res.status(403).json({ error: "Access denied to this hotel" });
      return;
    }

    // Set hotelId on request for downstream use
    req.hotelId = targetHotelId;
    next();
  } catch (error) {
    console.error("Hotel authorization error:", error);
    res.status(500).json({ error: "Authorization failed" });
  }
}

/**
 * Middleware to ensure guest has access to the specified hotel
 * Checks hotelId from route params or body
 * Must be used after authenticateGuest
 */
export async function authorizeGuestHotel(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.guest) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Get hotelId from params, body, or query
    const hotelId = req.params.hotelId
      ? parseInt(req.params.hotelId, 10)
      : req.body.hotelId
        ? parseInt(req.body.hotelId, 10)
        : req.query.hotelId
          ? parseInt(req.query.hotelId as string, 10)
          : null;

    if (!hotelId) {
      res.status(400).json({ error: "Hotel ID required" });
      return;
    }

    // Verify guest has access to this hotel (has placed an order)
    const hasAccess = await verifyGuestHotelAccess(req.guest.guestId, hotelId);
    if (!hasAccess) {
      res.status(403).json({ error: "Access denied to this hotel" });
      return;
    }

    req.hotelId = hotelId;
    next();
  } catch (error) {
    console.error("Guest hotel authorization error:", error);
    res.status(500).json({ error: "Authorization failed" });
  }
}

/**
 * Middleware to ensure hotel ID is provided and valid
 * Can be used for public endpoints that need hotel context
 */
export function requireHotelId(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const hotelId = req.params.hotelId
    ? parseInt(req.params.hotelId, 10)
    : req.body.hotelId
      ? parseInt(req.body.hotelId, 10)
      : req.query.hotelId
        ? parseInt(req.query.hotelId as string, 10)
        : null;

  if (!hotelId || isNaN(hotelId)) {
    res.status(400).json({ error: "Valid hotel ID required" });
    return;
  }

  req.hotelId = hotelId;
  next();
}
