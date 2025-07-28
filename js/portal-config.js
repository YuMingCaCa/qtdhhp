// File: js/portal-config.js
// Module này chứa cấu hình và khởi tạo Firebase,
// sau đó xuất (export) các đối tượng cần thiết cho các module khác sử dụng.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = {
    apiKey: "AIzaSyCJcTMUwO-w7V0YsGUKWeaW-zl42Ww7fxo",
    authDomain: "qlylaodongbdhhp.firebaseapp.com",
    projectId: "qlylaodongbdhhp",
    storageBucket: "qlylaodongbdhhp.firebasestorage.app",
    messagingSenderId: "462439202995",
    appId: "1:462439202995:web:06bc11042efb9b99d4f0c6"
};

// --- Initialize Firebase and export instances ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = firebaseConfig.projectId;

export { db, auth, appId };
