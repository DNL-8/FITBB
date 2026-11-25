import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const productionAuthDomain = 'app-fitness-rm9t.vercel.app';
const configuredAuthDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || productionAuthDomain;
export const authUsesAppDomain = typeof window !== 'undefined' && window.location.hostname === configuredAuthDomain;

export const app = getApps()[0] ?? initializeApp({
  ...firebaseConfig,
  authDomain: authUsesAppDomain ? configuredAuthDomain : firebaseConfig.authDomain,
});
export const auth = getAuth(app);
