// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, 
  CACHE_SIZE_UNLIMITED  } from "firebase/firestore";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
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

/// Инициализация Firebase App
export const firebaseApp = initializeApp(firebaseConfig);
// 🔥 ИНИЦИАЛИЗАЦИЯ FIRESTORE С КЭШИРОВАНИЕМ
// Здесь мы используем ваш правильный синтаксис
export const db = initializeFirestore(firebaseApp, {
  // localCache может быть 'memory', 'none', или 'persistent'
  // persistentLocalCache() - это то, что нам нужно для оффлайна
  localCache: persistentLocalCache({
    // Вы можете настроить размер кэша
    cacheSizeBytes: CACHE_SIZE_UNLIMITED
  })
});
// Если вам нужна аутентификация, ее тоже можно экспортировать отсюда
// import { getAuth } from 'firebase/auth';
// export const auth = getAuth(firebaseApp);
console.log("✅ Firebase и Firestore с оффлайн-кэшем инициализированы.");