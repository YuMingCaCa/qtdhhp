// File: js/login.js
// Handles logic for the main index.html page (Login and Module Selection).

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

// --- UI Elements ---
const loginPage = document.getElementById('login-page');
const moduleSelectionPage = document.getElementById('module-selection-page');
const loginFormContainer = document.getElementById('login-form').parentElement;
const registerFormContainer = document.getElementById('register-form-container');

// --- Firebase variables ---
let auth;

/**
 * Injects all necessary CSS styles into the document's head.
 * This ensures the application is styled correctly without relying on an external CSS file.
 */
function injectStyles() {
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

        onAuthStateChanged(auth, (user) => {
            if (user) {
                // User is logged in, show module selection page
                document.getElementById('user-email-module-page').textContent = user.email;
                showPage('module-selection-page');
            } else {
                // User is logged out, show login page
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

    // Auth actions
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            showAlert(error.message);
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
            await createUserWithEmailAndPassword(auth, email, password);
        } catch (error) {
            showAlert(error.message);
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
    injectStyles(); // Inject styles on page load
    addEventListeners();
    initializeFirebase();
});
