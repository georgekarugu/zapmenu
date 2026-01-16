import type { Router } from "express";
import {
  validateAdminEmail,
  createAdminVerification,
  verifyAdminPasscode,
  findOrCreateGuest,
} from "../helpers/auth.helper.js";
import { generateAdminToken, generateGuestToken } from "../helpers/jwt.helper.js";
import { authenticateAdmin, authenticateGuest } from "../middleware/auth.middleware.js";

/**
 * Admin Authentication Routes
 */
export function setupAdminAuthRoutes(router: Router) {
  /**
   * POST /auth/admin/request-verification
   * Step 1: Admin provides email, system generates MFA passcode
   */
  router.post("/admin/request-verification", async (req, res) => {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      // Validate admin email exists
      const validation = await validateAdminEmail(email);
      if (!validation.success) {
        return res.status(404).json({ error: validation.message });
      }

      // Generate MFA passcode
      const verification = await createAdminVerification(validation.adminId!);

      if (!verification.success) {
        return res.status(500).json({ error: verification.message });
      }

      // In production, send passcode via SMS/Email
      // For development, return it in response (remove in production!)
      res.json({
        message: "Verification code sent",
        // TODO: Remove passcode from response in production
        passcode: verification.passcode,
        expiresAt: verification.expiresAt,
      });
    } catch (error) {
      console.error("Admin verification request error:", error);
      res.status(500).json({ error: "Failed to request verification" });
    }
  });

  /**
   * POST /auth/admin/verify
   * Step 2: Admin provides email and passcode, receives JWT token
   */
  router.post("/admin/verify", async (req, res) => {
    try {
      const { email, passcode } = req.body;

      if (!email || !passcode) {
        return res.status(400).json({ error: "Email and passcode are required" });
      }

      // Verify passcode
      const verification = await verifyAdminPasscode(email, passcode);

      if (!verification.success) {
        return res.status(401).json({ error: verification.message });
      }

      // Generate JWT token
      const token = generateAdminToken({
        adminId: verification.adminId!,
        hotelId: verification.hotelId!,
        email,
        type: "admin",
      });

      res.json({
        message: "Authentication successful",
        token,
        adminId: verification.adminId,
        hotelId: verification.hotelId,
      });
    } catch (error) {
      console.error("Admin verification error:", error);
      res.status(500).json({ error: "Failed to verify passcode" });
    }
  });

  /**
   * GET /auth/admin/me
   * Get current admin profile (protected route)
   */
  router.get("/admin/me", authenticateAdmin, async (req, res) => {
    try {
      res.json({
        admin: {
          id: req.admin!.id,
          name: req.admin!.name,
          email: req.admin!.email,
          phone: req.admin!.phone,
          hotelId: req.admin!.hotelId,
        },
      });
    } catch (error) {
      console.error("Get admin profile error:", error);
      res.status(500).json({ error: "Failed to get admin profile" });
    }
  });
}

/**
 * Guest Authentication Routes
 */
export function setupGuestAuthRoutes(router: Router) {
  /**
   * POST /auth/guest/login
   * Guest login/registration - creates guest if doesn't exist
   */
  router.post("/guest/login", async (req, res) => {
    try {
      const { email, name } = req.body;

      if (!email || !name) {
        return res.status(400).json({ error: "Email and name are required" });
      }

      // Find or create guest
      const result = await findOrCreateGuest(email, name);

      if (!result.success) {
        return res.status(500).json({ error: result.message });
      }

      // Generate JWT token
      const token = generateGuestToken({
        guestId: result.guestId!,
        email,
        type: "guest",
      });

      res.json({
        message: "Authentication successful",
        token,
        guestId: result.guestId,
      });
    } catch (error) {
      console.error("Guest login error:", error);
      res.status(500).json({ error: "Failed to authenticate guest" });
    }
  });

  /**
   * GET /auth/guest/me
   * Get current guest profile (protected route)
   */
  router.get("/guest/me", authenticateGuest, async (req, res) => {
    try {
      res.json({
        guest: {
          id: req.guest!.id,
          name: req.guest!.name,
          email: req.guest!.email,
        },
      });
    } catch (error) {
      console.error("Get guest profile error:", error);
      res.status(500).json({ error: "Failed to get guest profile" });
    }
  });
}

/**
 * Combined setup function for Express router
 */
export function setupAuthRoutes(router: Router) {
  setupAdminAuthRoutes(router);
  setupGuestAuthRoutes(router);
}
