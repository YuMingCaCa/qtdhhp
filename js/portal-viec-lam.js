// File: js/portal-viec-lam.js
// Đây là tệp chính (entry point) của module Cổng thông tin Việc làm.
// Nhiệm vụ: Khởi tạo Firebase, xác thực người dùng và gắn các trình xử lý sự kiện.

import { auth } from './portal-config.js';
import { initializeEventListeners, refreshAndRenderJobs } from './portal-handlers.js';

/**
 * Initializes the page, sets up event listeners and loads initial data.
 */
async function initializePage() {
    const userEmail = sessionStorage.getItem('userEmail');
    const userRole = sessionStorage.getItem('userRole');

    if (!userEmail) {
        alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        window.location.href = '/';
        return;
    }

    // Hiển thị thông tin người dùng và các nút chức năng dựa trên vai trò
    document.getElementById('user-email-display').textContent = userEmail;
    if (userRole === 'business' || userRole === 'admin') {
        document.getElementById('post-job-btn').classList.remove('hidden');
        document.getElementById('company-profile-btn').classList.remove('hidden');
        document.getElementById('recruitment-management-btn').classList.remove('hidden');
    }
    if (userRole === 'admin') {
        document.getElementById('admin-panel').classList.remove('hidden');
    }
    if (userRole === 'viewer') {
        document.getElementById('my-profile-btn').classList.remove('hidden');
    }

    // Gắn tất cả các trình xử lý sự kiện
    initializeEventListeners(auth);

    // Tải và hiển thị danh sách việc làm ban đầu
    await refreshAndRenderJobs();
}

// --- Entry Point ---
document.addEventListener('DOMContentLoaded', initializePage);
