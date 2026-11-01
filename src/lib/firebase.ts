import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

/**
 * Local testing only: a build made with NEXT_PUBLIC_HOMEPREP_EMULATORS=1 talks
 * to the Auth and Firestore emulators. Release builds don't set it, so the
 * check is false at build time and production always uses the real services.
 */
const EMULATORS = process.env.NEXT_PUBLIC_HOMEPREP_EMULATORS === "1";

// Initialized lazily so static prerendering never touches the SDK.
function app(): FirebaseApp {
  if (getApps().length) return getApp();
  const created = initializeApp(config);
  if (EMULATORS) {
    connectAuthEmulator(getAuth(created), "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    connectFirestoreEmulator(getFirestore(created), "127.0.0.1", 8085);
  }
  return created;
}

export const auth = (): Auth => getAuth(app());
export const db = (): Firestore => getFirestore(app());
