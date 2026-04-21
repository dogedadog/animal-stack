// Firebase setup. Exposes the SDK on window.AS_firebase and dispatches
// 'as-firebase-ready' when the module finishes loading so regular <script>s can
// wait on it. Config is public — real security goes in Realtime Database rules.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getDatabase, ref, onValue, off, set, update, push, get, child,
  remove, onDisconnect, query, orderByChild, equalTo, serverTimestamp, limitToLast,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBKzwu2CtFqGolI-lWdm6-9LPJ57Su4D1o",
  authDomain: "brainrot-stack.firebaseapp.com",
  databaseURL: "https://brainrot-stack-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "brainrot-stack",
  storageBucket: "brainrot-stack.firebasestorage.app",
  messagingSenderId: "737182870682",
  appId: "1:737182870682:web:43361191a3d06941f3c323",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

window.AS_firebase = {
  app, db,
  ref, onValue, off, set, update, push, get, child,
  remove, onDisconnect, query, orderByChild, equalTo, serverTimestamp, limitToLast,
};
window.dispatchEvent(new Event('as-firebase-ready'));
