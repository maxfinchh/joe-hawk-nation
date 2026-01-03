// firebaseConfig.js
import { initializeApp } from '@firebase/app';
import {
  initializeAuth,
  getReactNativePersistence,
  getAuth,
} from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyCqjUinZL-V_mkd-f93ri-JgGaV6z8HD6k",
    authDomain: "joe-hawk-nation.firebaseapp.com",
    projectId: "joe-hawk-nation",
    storageBucket: "joe-hawk-nation.firebasestorage.app",
    messagingSenderId: "388338632823",
    appId: "1:388338632823:web:71490288d742f90e679e72"
  };

const app = initializeApp(firebaseConfig);

const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});

const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };