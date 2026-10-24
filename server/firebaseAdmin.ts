import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const requiredEnvironmentVariable = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
};

const normalizePrivateKey = (value: string): string => {
  const trimmedValue = value.trim();

  // Vercel environment variables commonly preserve JSON newlines as "\\n".
  // Also tolerate a value pasted with its surrounding JSON quotes.
  if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
    try {
      return JSON.parse(trimmedValue) as string;
    } catch {
      // Fall through to the standard newline normalization below.
    }
  }

  return trimmedValue.replace(/\\n/g, '\n');
};

export const getFirebaseAdminServices = () => {
  const projectId = requiredEnvironmentVariable('FIREBASE_PROJECT_ID');
  const clientEmail = requiredEnvironmentVariable('FIREBASE_CLIENT_EMAIL');
  const privateKey = normalizePrivateKey(requiredEnvironmentVariable('FIREBASE_PRIVATE_KEY'));

  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
      projectId
    });

  return {
    auth: getAuth(app),
    firestore: getFirestore(app)
  };
};
