import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDOzZFutecINLLtVgA-UowpkSRxdNYJ47A",
  authDomain: "jojo-ada6a.firebaseapp.com",
  databaseURL: "https://jojo-ada6a-default-rtdb.firebaseio.com",
  projectId: "jojo-ada6a",
  storageBucket: "jojo-ada6a.firebasestorage.app",
  messagingSenderId: "508991891297",
  appId: "1:508991891297:android:24e61acfe59ee162050720"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Helper to sign in anonymously
export const loginAnonymously = async () => {
  try {
    const userCredential = await signInAnonymously(auth);
    return userCredential.user;
  } catch (error) {
    console.error("Firebase Auth Error:", error);
    return null;
  }
};
