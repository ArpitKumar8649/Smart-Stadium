import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { env } from '../config/env.js';
import { logger } from '../middleware/logger.js';

let adminAuth: Auth;

if (!getApps().length) {
  try {
    const app = initializeApp({
      projectId: env.FIREBASE_PROJECT_ID || 'demo-project',
    });
    adminAuth = getAuth(app);
    logger.info('Firebase Admin SDK initialized');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize Firebase Admin SDK');
    adminAuth = getAuth();
  }
} else {
  adminAuth = getAuth(getApp());
}

export { adminAuth };
