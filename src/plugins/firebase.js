// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
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

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
export  {firebaseApp} 