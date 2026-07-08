import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAOb2MRA4OOEeB77Oe1cN73QwRuRrH3TDM",
  authDomain: "nandurilabs-beta.firebaseapp.com",
  projectId: "nandurilabs-beta",
  storageBucket: "nandurilabs-beta.firebasestorage.app",
  messagingSenderId: "1055054519541",
  appId: "1:1055054519541:web:f268359247a228385ef9bc",
  measurementId: "G-HYB48EVQFZ"
};

// Initialize Firebase only if it hasn't been initialized yet
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});
