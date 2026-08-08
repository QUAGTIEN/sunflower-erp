import { getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export default {
  fetch(): Response {
    return Response.json({
      ok: true,
      loaded: {
        app: typeof getApps === 'function',
        auth: typeof getAuth === 'function',
        firestore: typeof getFirestore === 'function'
      }
    });
  }
};
