import { getApp, getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";

// Replace the following with your app's Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyDZH8e6GfRy9HM1bolhHcd8z2YEsFO1vrk",
  authDomain: "ubapp-440f2.firebaseapp.com",
  projectId: "ubapp-440f2",
  storageBucket: "ubapp-440f2.firebasestorage.app",
  messagingSenderId: "63410120475",
  appId: "1:63410120475:web:84508dbbc899d1445e95be",
  measurementId: "G-JBDQ3GHNMK",
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const messaging = async () => {
  const supported = await isSupported();
  return supported ? getMessaging(app) : null;
};

export const fetchToken = async () => {
  try {
    const fcmMessaging = await messaging();
    if (fcmMessaging) {
      const token = await getToken(fcmMessaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_FCM_VAPID_KEY,
      });
      return token;
    }
    return null;
  } catch (err) {
    console.error("An error occurred while fetching the token:", err);
    return null;
  }
};

export { app, messaging };
