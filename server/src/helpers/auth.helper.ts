import crypto from "node:crypto";
import { prisma } from "../../lib/prisma.js";

// ============================================
// Types & Interfaces
// ============================================

export interface AdminAuthPayload {
  adminId: number;
  hotelId: number;
  email: string;
  type: "admin";
}

export interface GuestAuthPayload {
  guestId: number;
  email: string;
  type: "guest";
}

export type AuthPayload = AdminAuthPayload | GuestAuthPayload;

export interface MFAVerificationResult {
  success: boolean;
  passcode?: string;
  expiresAt?: Date;
  message: string;
}

export interface VerifyPasscodeResult {
  success: boolean;
  adminId?: number;
  hotelId?: number;
  message: string;
}

// ============================================
// MFA Passcode Management
// ============================================

/**
 * Generates a 6-digit numeric passcode for MFA
 */
function generatePasscode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Creates a new MFA verification passcode for an admin
 * Passcode expires in 10 minutes by default
 */
export async function createAdminVerification(
  adminId: number,
  expirationMinutes: number = 10
): Promise<MFAVerificationResult> {
  try {
    // Check if admin exists
    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
      include: { hotel: true },
    });

    if (!admin) {
      return {
        success: false,
        message: "Admin not found",
      };
    }

    // Generate passcode
    const passcode = generatePasscode();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expirationMinutes);

    // Create verification record
    const verification = await prisma.adminVerification.create({
      data: {
        adminId,
        passcode,
        expiresAt,
        used: false,
      },
    });

    // In a real application, you would send this passcode via SMS/Email
    // For now, we return it in the response (remove in production!)
    return {
      success: true,
      passcode, // TODO: Remove this in production - send via SMS/Email instead
      expiresAt: verification.expiresAt,
      message: "MFA passcode generated successfully",
    };
  } catch (error) {
    console.error("Error creating admin verification:", error);
    return {
      success: false,
      message: "Failed to create verification code",
    };
  }
}

/**
 * Verifies an MFA passcode for an admin login
 */
export async function verifyAdminPasscode(
  email: string,
  passcode: string
): Promise<VerifyPasscodeResult> {
  try {
    // Find admin by email
    const admin = await prisma.admin.findUnique({
      where: { email },
      include: { hotel: true },
    });

    if (!admin) {
      return {
        success: false,
        message: "Admin not found",
      };
    }

    // Find unused, non-expired verification
    const verification = await prisma.adminVerification.findFirst({
      where: {
        adminId: admin.id,
        passcode,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!verification) {
      return {
        success: false,
        message: "Invalid or expired passcode",
      };
    }

    // Mark verification as used
    await prisma.adminVerification.update({
      where: { id: verification.id },
      data: { used: true },
    });

    // Clean up old verification records (optional, for database hygiene)
    await prisma.adminVerification.deleteMany({
      where: {
        adminId: admin.id,
        used: true,
        expiresAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        },
      },
    });

    return {
      success: true,
      adminId: admin.id,
      hotelId: admin.hotelId,
      message: "Passcode verified successfully",
    };
  } catch (error) {
    console.error("Error verifying admin passcode:", error);
    return {
      success: false,
      message: "Failed to verify passcode",
    };
  }
}

/**
 * Finds or creates a guest by email
 * Used for guest login/registration
 */
export async function findOrCreateGuest(
  email: string,
  name: string
): Promise<{ success: boolean; guestId?: number; message: string }> {
  try {
    // Try to find existing guest
    let guest = await prisma.guest.findUnique({
      where: { email },
    });

    // If not found, create new guest
    if (!guest) {
      guest = await prisma.guest.create({
        data: {
          email,
          name,
        },
      });
      return {
        success: true,
        guestId: guest.id,
        message: "Guest created successfully",
      };
    }

    // Update name if provided and different
    if (name && guest.name !== name) {
      guest = await prisma.guest.update({
        where: { id: guest.id },
        data: { name },
      });
    }

    return {
      success: true,
      guestId: guest.id,
      message: "Guest found",
    };
  } catch (error) {
    console.error("Error finding/creating guest:", error);
    return {
      success: false,
      message: "Failed to find or create guest",
    };
  }
}

/**
 * Validates admin credentials (email exists)
 * Used before generating MFA passcode
 */
export async function validateAdminEmail(
  email: string
): Promise<{ success: boolean; adminId?: number; hotelId?: number; message: string }> {
  try {
    const admin = await prisma.admin.findUnique({
      where: { email },
      include: { hotel: true },
    });

    if (!admin) {
      return {
        success: false,
        message: "Admin not found with this email",
      };
    }

    return {
      success: true,
      adminId: admin.id,
      hotelId: admin.hotelId,
      message: "Admin email validated",
    };
  } catch (error) {
    console.error("Error validating admin email:", error);
    return {
      success: false,
      message: "Failed to validate admin email",
    };
  }
}

/**
 * Gets admin details by ID
 */
export async function getAdminById(adminId: number) {
  try {
    return await prisma.admin.findUnique({
      where: { id: adminId },
      include: { hotel: true },
    });
  } catch (error) {
    console.error("Error getting admin by ID:", error);
    return null;
  }
}

/**
 * Gets guest details by ID
 */
export async function getGuestById(guestId: number) {
  try {
    return await prisma.guest.findUnique({
      where: { id: guestId },
    });
  } catch (error) {
    console.error("Error getting guest by ID:", error);
    return null;
  }
}

/**
 * Checks if an admin belongs to a specific hotel
 * Used for authorization
 */
export async function verifyAdminHotelAccess(
  adminId: number,
  hotelId: number
): Promise<boolean> {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
      select: { hotelId: true },
    });

    return admin?.hotelId === hotelId;
  } catch (error) {
    console.error("Error verifying admin hotel access:", error);
    return false;
  }
}

/**
 * Checks if a guest has placed an order at a specific hotel
 * Used for guest authorization when accessing hotel-specific resources
 */
export async function verifyGuestHotelAccess(
  guestId: number,
  hotelId: number
): Promise<boolean> {
  try {
    const order = await prisma.order.findFirst({
      where: {
        guestId,
        hotelId,
      },
      select: { id: true },
    });

    return !!order;
  } catch (error) {
    console.error("Error verifying guest hotel access:", error);
    return false;
  }
}
