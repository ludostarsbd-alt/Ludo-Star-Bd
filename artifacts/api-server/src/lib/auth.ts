import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";

/**
 * Extract and validate the Clerk user ID from the request.
 * Returns userId string on success, or sends 401 and returns null.
 */
export function requireAuth(req: Request, res: Response): string | null {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Authentication required. Please log in to continue." });
    return null;
  }
  return userId;
}
