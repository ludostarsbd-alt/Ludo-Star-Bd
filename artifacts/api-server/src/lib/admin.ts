/**
 * Admin guard middleware.
 * Only the hardcoded ADMIN_EMAIL may access /api/admin/* routes.
 * Works regardless of how many devices/sessions the admin has open.
 */

import { clerkClient, getAuth } from "@clerk/express";
import type { Request, Response } from "express";

const ADMIN_EMAIL = "th9610610@gmail.com";

/**
 * Verifies the caller is the admin.
 * Returns the Clerk userId on success, sends 401/403 and returns null on failure.
 */
export async function requireAdmin(req: Request, res: Response): Promise<string | null> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required." });
    return null;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const isAdmin = user.emailAddresses.some(
      (e: { emailAddress: string }) => e.emailAddress === ADMIN_EMAIL,
    );
    if (!isAdmin) {
      res.status(403).json({ error: "Admin access only." });
      return null;
    }
    return userId;
  } catch {
    res.status(500).json({ error: "Could not verify identity." });
    return null;
  }
}
