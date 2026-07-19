import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../services/firebase-admin.js';

// Extend Express Request to include auth info
declare global {
  
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: { uid: string };
    }
  }
}

/**
 * Protects the Tournament Operations Console API by verifying Firebase ID
 * tokens and ensuring the user has the 'admin' custom claim.
 */
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';

  if (!token) {
    res.status(401).json({
      error: {
        code: 'unauthorized',
        message: 'Admin access required.',
      },
    });
    return;
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);

    // Check for admin custom claim
    if (decodedToken.admin !== true) {
      res.status(403).json({
        error: {
            code: 'forbidden',
            message: 'Forbidden: Admin claim required'
        }
      });
      return;
    }

    req.auth = { uid: decodedToken.uid };
    next();
  } catch {
    res.status(401).json({
      error: {
        code: 'unauthorized',
        message: 'Invalid token.',
      },
    });
    return;
  }
};