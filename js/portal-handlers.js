// File: js/portal-handlers.js
// Module này chứa các hàm xử lý sự kiện (event handlers).

import * as Firestore from './portal-firestore.js';
import * as UI from './portal-ui.js';
import { signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";


let allJobs = [];
let userApplications = [];

export async function refreshAndRenderJobs() {
    UI.showLoading(document.getElementById('job-listings'));
    UI.resetJobDetails();
    try {
        const userId = sessionStorage.getItem('userUID');
        // Lấy danh sách việc làm và danh sách đã ứng tuyển cùng lúc
        const [jobs, applications] = await Promise.all([
            Firestore.fetchJobs(),
            Firestore.fetchUserApplications(userId)
        ]);
        
        allJobs = jobs.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        userApplications = applications;

        UI.renderJobListings(allJobs, handleJobClick);
    } catch (error) {
        console.error("Error refreshing jobs:", error);
        alert("Không thể tải danh sách việc làm.");
    }
}

function handleJobClick(jobId) {
    const job = allJobs.find(j => j.id === jobId);
    // Kiểm tra xem người dùng đã ứng tuyển vào công việc này chưa
    const hasApplied = userApplications.some(app => app.jobId === jobId);
    UI.renderJobDetails(job, hasApplied);
    document.querySelectorAll('.job-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.jobId === jobId);
    });
}

async function handleJobFormSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Đang lưu...`;
    const editingId = e.target.dataset.editingId;
    const jobData = {
        title: document.getElementById('job-title').value,
        company: document.getElementById('job-company').value,
        location: document.getElementById('job-location').value,
        type: document.getElementById('job-type').value,
        description: document.getElementById('job-description').value,
        benefits: document.getElementById('job-benefits').value,
        requirements: document.getElementById('job-requirements').value.split('\n').filter(line => line.trim() !== ''),
        tags: document.getElementById('job-tags').value.split(',').map(tag => tag.trim()).filter(tag => tag),
        contactInfo: document.getElementById('job-contact').value,
        expiryDate: document.getElementById('job-expiry').value,
        postedBy: sessionStorage.getItem('userEmail'),
    };
    try {
        await Firestore.saveJob(jobData, editingId);
        UI.closePostJobModal();
        await refreshAndRenderJobs();
        alert(editingId ? 'Cập nhật thành công!' : 'Đăng tin thành công!');
    } catch (error) {
        console.error("Error saving job:", error);
        alert("Lỗi khi lưu tin tuyển dụng.");
    } finally {
        submitBtn.disabled = false;
    }
}

async function handleDeleteJob(jobId) {
    if (!confirm('Bạn có chắc chắn muốn xóa tin tuyển dụng này không?')) return;
    try {
        await Firestore.deleteJob(jobId);
        await refreshAndRenderJobs();
        alert('Xóa tin thành công.');
    } catch (error) {
        console.error("Error deleting job:", error);
        alert('Lỗi khi xóa tin tuyển dụng.');
    }
}

async function handleDisplayUsers() {
    UI.toggleUserManagementModal(true);
    UI.showLoading(document.getElementById('user-list-container'));
    try {
        const users = await Firestore.fetchUsers();
        UI.displayUsersInModal(users);
    } catch (error) {
        console.error("Error fetching users:", error);
        alert("Không thể tải danh sách người dùng.");
    }
}

async function handleRoleChange(e) {
    const target = e.target;
    if (!target.classList.contains('role-change-btn')) return;
    const userId = target.dataset.userid;
    const newRole = target.dataset.newrole;
    if (!confirm('Bạn có chắc chắn muốn thay đổi vai trò của người dùng này không?')) return;
    try {
        await Firestore.updateUserRole(userId, newRole);
        await handleDisplayUsers(); // Refresh the user list
        alert('Cập nhật vai trò thành công!');
    } catch (error) {
        console.error("Error updating role:", error);
        alert('Lỗi khi cập nhật vai trò.');
    }
}

function handleFilter() {
    const keyword = document.getElementById('search-keyword').value.toLowerCase();
    const selectedTypes = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
    const location = document.getElementById('location').value;
    const filteredJobs = allJobs.filter(job => {
        const matchesKeyword = keyword ? 
            (job.title?.toLowerCase().includes(keyword) || 
             job.company?.toLowerCase().includes(keyword) ||
             (job.tags || []).some(tag => tag.toLowerCase().includes(keyword)))
            : true;
        const matchesType = selectedTypes.length > 0 ? selectedTypes.includes(job.type) : true;
        const matchesLocation = location !== 'Tất cả địa điểm' ? job.location === location : true;
        return matchesKeyword && matchesType && matchesLocation;
    });
    UI.renderJobListings(filteredJobs, handleJobClick);
    UI.resetJobDetails();
}

async function handleApplyForJob(jobId) {
    const userId = sessionStorage.getItem('userUID');
    const userEmail = sessionStorage.getItem('userEmail');
    if (!userId) {
        alert('Không thể xác định người dùng. Vui lòng đăng nhập lại.');
        return;
    }

    // 1. Kiểm tra xem người dùng đã có hồ sơ chưa
    const profileExists = await Firestore.checkUserProfileExists(userId);

    if (!profileExists) {
        if (confirm("Bạn chưa có hồ sơ (CV). Bạn có muốn tạo hồ sơ ngay bây giờ không?")) {
            // Chuyển hướng đến trang tạo hồ sơ
            window.location.href = '/quan-ly-ho-so';
        }
        return; // Dừng việc ứng tuyển nếu chưa có hồ sơ
    }

    // 2. Nếu đã có hồ sơ, tiến hành ứng tuyển
    try {
        await Firestore.applyForJob(jobId, userId, userEmail);
        alert('Nộp hồ sơ thành công!');
        // Cập nhật lại danh sách đã ứng tuyển và hiển thị lại chi tiết
        userApplications = await Firestore.fetchUserApplications(userId);
        handleJobClick(jobId);
    } catch (error) {
        console.error("Error applying for job:", error);
        alert('Đã xảy ra lỗi khi nộp hồ sơ.');
    }
}

export function initializeEventListeners(auth) {
    document.getElementById('logout-btn').addEventListener('click', () => {
        signOut(auth).then(() => {
            sessionStorage.clear();
            window.location.href = '/';
        }).catch(error => console.error('Sign out error', error));
    });
    document.getElementById('post-job-btn').addEventListener('click', () => UI.openPostJobModal(null, allJobs));
    document.getElementById('close-modal-btn').addEventListener('click', UI.closePostJobModal);
    document.getElementById('job-form').addEventListener('submit', handleJobFormSubmit);
    document.getElementById('manage-users-btn').addEventListener('click', handleDisplayUsers);
    document.getElementById('close-user-modal-btn').addEventListener('click', () => UI.toggleUserManagementModal(false));
    document.getElementById('user-list-container').addEventListener('click', handleRoleChange);
    document.getElementById('job-details').addEventListener('click', (e) => {
        const editBtn = e.target.closest('#edit-job-btn');
        const deleteBtn = e.target.closest('#delete-job-btn');
        const applyBtn = e.target.closest('#apply-btn');
        if (editBtn) UI.openPostJobModal(editBtn.dataset.jobid, allJobs);
        if (deleteBtn) handleDeleteJob(deleteBtn.dataset.jobid);
        if (applyBtn) handleApplyForJob(applyBtn.dataset.jobid);
    });
    document.getElementById('filter-btn').addEventListener('click', handleFilter);
}
