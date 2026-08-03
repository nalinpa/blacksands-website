import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC3RqOh9GBn-Pl_S2NVobHaUwaQdtap9Mo",
  authDomain: "blacksands-a37aa.firebaseapp.com",
  projectId: "blacksands-a37aa",
  storageBucket: "blacksands-a37aa.firebasestorage.app",
  messagingSenderId: "380028594691",
  appId: "1:380028594691:web:af4e8e3df7ad54bdcbbc36",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
