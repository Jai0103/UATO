"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBQPxEa19PLjLNhvcSrgrchph-0O7jV68c",
  authDomain: "aga-flight-management-staging.firebaseapp.com",
  projectId: "aga-flight-management-staging",
  storageBucket: "aga-flight-management-staging.firebasestorage.app",
  messagingSenderId: "569433487611",
  appId: "1:569433487611:web:9350ba1b911cb4ec0ad85e"
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
