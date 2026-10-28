import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import firebaseConfig from '../firebase-applet-config.json';

const isFirebaseConfigured = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.apiKey !== '';

let app: any = null;
let db: any = null;
let auth: any = null;
let appCheck: any = null;

if (isFirebaseConfigured) {
  try {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    db = initializeFirestore(app, {
      experimentalForceLongPolling: true
    }, firebaseConfig.firestoreDatabaseId);
    auth = getAuth(app);

    // Initialize App Check if site key is configured
    const recaptchaSiteKey = (import.meta as any).env?.VITE_RECAPTCHA_SITE_KEY || (window as any).VITE_RECAPTCHA_SITE_KEY;
    if (recaptchaSiteKey && typeof window !== 'undefined') {
      try {
        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(recaptchaSiteKey),
          isTokenAutoRefreshEnabled: true,
        });
        console.log('Firebase App Check successfully initialized with reCAPTCHA v3.');
      } catch (appCheckErr) {
        console.warn('App Check initialization failed or skipped:', appCheckErr);
      }
    }
  } catch (error) {
    console.error('Failed to initialize Firebase SDK:', error);
  }
}

export { db, auth, appCheck, isFirebaseConfigured };

// Mandatory Custom Error Handlers structure requested by instructions
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentAuth = auth;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentAuth?.currentUser?.uid || null,
      email: currentAuth?.currentUser?.email || null,
      emailVerified: currentAuth?.currentUser?.emailVerified || null,
      isAnonymous: currentAuth?.currentUser?.isAnonymous || null,
      tenantId: currentAuth?.currentUser?.tenantId || null,
      providerInfo: currentAuth?.currentUser?.providerData?.map((p: any) => ({
        providerId: p.providerId,
        email: p.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error Raised: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
