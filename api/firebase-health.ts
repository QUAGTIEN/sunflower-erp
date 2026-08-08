import { getFirebaseAdminServices } from '../server/firebaseAdmin.js';

export default {
  fetch(): Response {
    const configured = {
      projectId: Boolean(process.env.FIREBASE_PROJECT_ID?.trim()),
      clientEmail: Boolean(process.env.FIREBASE_CLIENT_EMAIL?.trim()),
      privateKey: Boolean(process.env.FIREBASE_PRIVATE_KEY?.trim())
    };

    try {
      getFirebaseAdminServices();
      return Response.json({ ok: true, configured, initialized: true });
    } catch (error) {
      return Response.json({
        ok: false,
        configured,
        initialized: false,
        error: error instanceof Error ? error.message : 'Unknown Firebase Admin initialization error'
      }, { status: 500 });
    }
  }
};
