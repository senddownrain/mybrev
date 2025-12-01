import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, 
  CACHE_SIZE_UNLIMITED  } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDmdP5MpLLIX0RWuYXbYsDDgPqbLHCi_sM",
  authDomain: "ibreviaryby.firebaseapp.com",
  projectId: "ibreviaryby",
  storageBucket: "ibreviaryby.appspot.com",
  messagingSenderId: "344097781816",
  appId: "1:344097781816:web:d94141222905f629fd8ecd",
  measurementId: "G-GP0WJ4705G",
  databaseUrl:"https://ibreviaryby.firebaseio.com",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
  })
});