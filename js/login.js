// File: js/login.js
// Handles logic for the main index.html page (Login and Module Selection).
// TỐI ƯU HÓA: Chỉ đọc quyền người dùng một lần và lưu vào sessionStorage.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    linkWithCredential
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";


// --- UI Elements ---
const loginPage = document.getElementById('login-page');
const moduleSelectionPage = document.getElementById('module-selection-page');
const loginFormContainer = document.getElementById('login-form').parentElement;
const registerFormContainer = document.getElementById('register-form-container');

// --- Firebase variables ---
let auth;
let db;
let usersColPath;

/**
 * Injects all necessary CSS styles into the document's head.
 */
function injectStyles() {
    // ... (Không thay đổi)
    const style = document.createElement('style');
    style.textContent = `
        body {
            font-family: 'Inter', sans-serif;
        }
        .modal {
            display: none;
            position: fixed;
            z-index: 50;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0,0,0,0.5);
            -webkit-animation-name: fadeIn;
            -webkit-animation-duration: 0.4s;
            animation-name: fadeIn;
            animation-duration: 0.4s
        }
        .modal-content {
            background-color: #fefefe;
            margin: 5% auto;
            padding: 24px;
            border: 1px solid #888;
            width: 90%;
            max-width: 800px;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            -webkit-animation-name: slideIn;
            -webkit-animation-duration: 0.4s;
            animation-name: slideIn;
            animation-duration: 0.4s
        }
        @-webkit-keyframes slideIn {
            from {top: -300px; opacity: 0}
            to {top: 0; opacity: 1}
        }
        @keyframes slideIn {
            from {margin-top: -5%; opacity: 0}
            to {margin-top: 5%; opacity: 1}
        }
        @-webkit-keyframes fadeIn {
            from {opacity: 0}
            to {opacity: 1}
        }
        @keyframes fadeIn {
            from {opacity: 0}
            to {opacity: 1}
        }
        .close-button {
            color: #aaa;
            float: right;
            font-size: 28px;
            font-weight: bold;
        }
        .close-button:hover,
        .close-button:focus {
            color: black;
            text-decoration: none;
            cursor: pointer;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Shows a specific page (login or module selection) and hides the other.
 * @param {string} pageIdToShow The ID of the element to show.
 */
function showPage(pageIdToShow) {
    const pages = [loginPage, moduleSelectionPage];
    pages.forEach(page => {
        if (page && page.id === pageIdToShow) {
            page.classList.remove('hidden');
        } else if (page) {
            page.classList.add('hidden');
        }
    });
}

/**
 * Displays a simple alert message in a modal.
 * @param {string} message The message to display.
 */
function showAlert(message) {
    // ... (Không thay đổi)
    const modal = document.getElementById('alert-modal');
    document.getElementById('alert-message').textContent = message;
    document.getElementById('alert-title').textContent = "Thông báo";
    modal.style.display = 'block';
    document.getElementById('alert-ok-btn').onclick = () => {
        modal.style.display = 'none';
    };
}

/**
 * Sets the loading state for a button, disabling it and showing a spinner.
 * @param {HTMLButtonElement} button The button element.
 * @param {boolean} isLoading Whether the button should be in a loading state.
 */
function setButtonLoading(button, isLoading) {
    // ... (Không thay đổi)
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.dataset.originalHtml = button.innerHTML;
        button.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Đang xử lý...`;
    } else {
        button.disabled = false;
        if (button.dataset.originalHtml) {
            button.innerHTML = button.dataset.originalHtml;
        }
    }
}

/**
 * Initializes Firebase and sets up authentication state listeners.
 */
async function initializeFirebase() {
    const firebaseConfig = {
      apiKey: "AIzaSyCJcTMUwO-w7V0YsGUKWeaW-zl42Ww7fxo",
      authDomain: "qlylaodongbdhhp.firebaseapp.com",
      projectId: "qlylaodongbdhhp",
      storageBucket: "qlylaodongbdhhp.appspot.com",
      messagingSenderId: "462439202995",
      appId: "1:462439202995:web:06bc11042efb9b99d4f0c6"
    };

    try {
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);

        const appId = firebaseConfig.projectId || 'hpu-workload-tracker-app';
        usersColPath = `artifacts/${appId}/public/data/users`;

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // TỐI ƯU HÓA: Đây là nơi duy nhất chúng ta đọc thông tin người dùng từ Firestore
                const userDocRef = doc(db, usersColPath, user.uid);
                const userDoc = await getDoc(userDocRef);

                let userRole = 'viewer'; // Mặc định là viewer
                if (userDoc.exists()) {
                    userRole = userDoc.data().role || 'viewer';
                }

                // TỐI ƯU HÓA: Lưu thông tin vào sessionStorage để các trang khác sử dụng
                sessionStorage.setItem('userRole', userRole);
                sessionStorage.setItem('userEmail', user.email);
                sessionStorage.setItem('userUID', user.uid);

                // User is logged in, show module selection page
                document.getElementById('user-email-module-page').textContent = user.email;
                showPage('module-selection-page');
            } else {
                // User is logged out, show login page
                // TỐI ƯU HÓA: Xóa thông tin đã lưu khi đăng xuất
                sessionStorage.clear();
                showPage('login-page');
            }
        });

    } catch (error) {
        console.error("Firebase initialization error:", error);
        showAlert(`Lỗi khởi tạo Firebase: ${error.message}`);
    }
}

/**
 * Adds all necessary event listeners for the page.
 */
function addEventListeners() {
    // Auth form switching
    // ... (Không thay đổi)
    document.getElementById('show-register-link').addEventListener('click', (e) => {
        e.preventDefault();
        loginFormContainer.classList.add('hidden');
        registerFormContainer.classList.remove('hidden');
    });
    document.getElementById('show-login-link').addEventListener('click', (e) => {
        e.preventDefault();
        registerFormContainer.classList.add('hidden');
        loginFormContainer.classList.remove('hidden');
    });

    // --- Google Sign-in event listener ---
    document.getElementById('google-signin-btn').addEventListener('click', async () => {
        const btn = document.getElementById('google-signin-btn');
        setButtonLoading(btn, true);
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            const email = user.email;

            if (email.endsWith('@dhhp.edu.vn')) {
                // TỐI ƯU HÓA: Chỉ cần kiểm tra, không cần đọc lại.
                // onAuthStateChanged sẽ tự động xử lý việc đọc và lưu role.
                const userDocRef = doc(db, usersColPath, user.uid);
                const userDoc = await getDoc(userDocRef);
                if (!userDoc.exists()) {
                    await setDoc(userDocRef, {
                        email: user.email,
                        role: 'viewer',
                        createdAt: new Date()
                    });
                }
            } else {
                await signOut(auth);
                showAlert('Vui lòng sử dụng tài khoản email của trường (@dhhp.edu.vn) để đăng nhập.');
            }
        } catch (error) {
            // ... (Phần xử lý lỗi account-exists-with-different-credential không thay đổi)
            if (error.code === 'auth/account-exists-with-different-credential') {
                const pendingCred = error.credential;
                const email = error.customData.email;
                
                const password = prompt(
                    `Tài khoản với email ${email} đã tồn tại với phương thức đăng nhập bằng mật khẩu.\n` +
                    `Vui lòng nhập mật khẩu của bạn để liên kết hai phương thức đăng nhập này.`
                );

                if (password) {
                    try {
                        const userCredential = await signInWithEmailAndPassword(auth, email, password);
                        await linkWithCredential(userCredential.user, pendingCred);
                        showAlert('Tài khoản Google đã được liên kết thành công! Từ giờ bạn có thể đăng nhập bằng cả hai cách.');
                    } catch (linkError) {
                        console.error("Linking error:", linkError);
                        showAlert('Liên kết thất bại. Mật khẩu không đúng hoặc đã có lỗi xảy ra.');
                    }
                } else {
                    showAlert('Quá trình liên kết đã bị hủy.');
                }
            } else if (error.code !== 'auth/popup-closed-by-user') {
                console.error("Google Sign-in Error:", error);
                 showAlert(`Lỗi đăng nhập bằng Google: ${error.message}`);
            }
        } finally {
            setButtonLoading(btn, false);
        }
    });


    // Auth actions (Email/Password)
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try {
            // TỐI ƯU HÓA: Chỉ cần đăng nhập, onAuthStateChanged sẽ xử lý phần còn lại
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            showAlert("Sai email hoặc mật khẩu. Vui lòng thử lại.");
        } finally {
            setButtonLoading(btn, false);
        }
    });

    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // TỐI ƯU HÓA: Tạo document cho người dùng mới, onAuthStateChanged sẽ xử lý phần còn lại
            const userDocRef = doc(db, usersColPath, user.uid);
            await setDoc(userDocRef, {
                email: user.email,
                role: 'viewer',
                createdAt: new Date()
            });

        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                showAlert('Email này đã được đăng ký. Vui lòng đăng nhập hoặc sử dụng email khác.');
            } else {
                showAlert(error.message);
            }
        } finally {
            setButtonLoading(btn, false);
        }
    });

    document.getElementById('logout-btn-module-page').addEventListener('click', () => {
        signOut(auth);
    });
}

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    addEventListeners();
    initializeFirebase();
});
