import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { 
    initializeFirestore, 
    persistentLocalCache,
    persistentMultipleTabManager 
} from "firebase/firestore";

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

let analytics = null;
if (typeof window !== "undefined" && !window.location.hostname.includes("localhost")) {
    isSupported().then((supported) => {
        if (supported) {
            try {
                analytics = getAnalytics(app);
            } catch (err) {
                console.warn("Firebase Analytics failed to initialize:", err);
            }
        }
    }).catch((err) => {
        console.warn("Firebase Analytics isSupported check failed:", err);
    });
}

const auth = getAuth(app);

const googleProvider = new GoogleAuthProvider();
// Always show account picker — avoids silent failures on shared machines
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Standardizing Firestore with the new persistent cache API to fix console warnings
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

export { app, analytics, auth, googleProvider, db };