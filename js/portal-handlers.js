// File: js/portal-handlers.js
// Module này chứa các hàm xử lý sự kiện (event handlers).

import * as Firestore from './portal-firestore.js';
import * as UI from './portal-ui.js';
import { signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";


let allJobs = [];
let userApplications = [];
let allCompanies = {}; // Map để lưu trữ thông tin các công ty

export async function refreshAndRenderJobs() {
    UI.showLoading(document.getElementById('job-listings'));
    UI.resetJobDetails();
    try {
        const userId = sessionStorage.getItem('userUID');
        const [jobs, applications, companies] = await Promise.all([
            Firestore.fetchJobs(),
            Firestore.fetchUserApplications(userId),
            Firestore.fetchAllCompanies()
        ]);
        
        allJobs = jobs.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        userApplications = applications;
        allCompanies = companies;

        UI.renderJobListings(allJobs, allCompanies, handleJobClick);
    } catch (error) {
        console.error("Error refreshing jobs:", error);
        alert("Không thể tải danh sách việc làm.");
    }
}

function handleJobClick(jobId) {
    const job = allJobs.find(j => j.id === jobId);
    const company = allCompanies[job.ownerId];
    const hasApplied = userApplications.some(app => app.jobId === jobId);
    UI.renderJobDetails(job, company, hasApplied);
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
        ownerId: sessionStorage.getItem('userUID') // Thêm ID của người đăng
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
        const matchesLocation = location !== 'Tất cả địa điểm' ? (job.location || '').includes(location) : true;
        return matchesKeyword && matchesType && matchesLocation;
    });
    UI.renderJobListings(filteredJobs, allCompanies, handleJobClick);
    UI.resetJobDetails();
}

async function handleApplyForJob(jobId) {
    const userId = sessionStorage.getItem('userUID');
    const userEmail = sessionStorage.getItem('userEmail');
    if (!userId) {
        alert('Không thể xác định người dùng. Vui lòng đăng nhập lại.');
        return;
    }

    const profileExists = await Firestore.checkUserProfileExists(userId);

    if (!profileExists) {
        if (confirm("Bạn chưa có hồ sơ (CV). Bạn có muốn tạo hồ sơ ngay bây giờ không?")) {
            window.location.href = '/quan-ly-ho-so';
        }
        return;
    }

    try {
        await Firestore.applyForJob(jobId, userId, userEmail);
        alert('Nộp hồ sơ thành công!');
        userApplications = await Firestore.fetchUserApplications(userId);
        handleJobClick(jobId);
    } catch (error) {
        console.error("Error applying for job:", error);
        alert('Đã xảy ra lỗi khi nộp hồ sơ.');
    }
}

async function handleViewApplicants(jobId) {
    UI.toggleApplicantsModal(true);
    UI.showLoading(document.getElementById('applicant-list-container'));
    try {
        const applicants = await Firestore.fetchApplicantsForJob(jobId);
        UI.displayApplicantsInModal(applicants);
    } catch (error) {
        console.error("Error fetching applicants:", error);
        alert("Không thể tải danh sách ứng viên.");
    }
}

function handleViewCv(userId) {
    window.open(`/xem-ho-so?id=${userId}`, '_blank');
}

async function handleStatusChange(e) {
    const selectElement = e.target;
    if (!selectElement.classList.contains('status-select')) return;

    const applicationId = selectElement.dataset.appid;
    const newStatus = selectElement.value;

    try {
        await Firestore.updateApplicationStatus(applicationId, newStatus);
    } catch (error) {
        console.error("Error updating status:", error);
        alert("Lỗi khi cập nhật trạng thái.");
    }
}

async function handleNoteChange(e) {
    const textarea = e.target;
    if (!textarea.classList.contains('note-textarea')) return;

    const applicationId = textarea.dataset.appid;
    const newNote = textarea.value;

    try {
        await Firestore.updateApplicationNote(applicationId, newNote);
    } catch (error) {
        console.error("Error updating note:", error);
        alert("Lỗi khi lưu ghi chú.");
    }
}

export function initializeEventListeners(auth) {
    document.getElementById('logout-btn').addEventListener('click', () => {
        signOut(auth).then(() => {
            sessionStorage.clear();
            window.location.href = '/';
        }).catch(error => console.error('Sign out error', error));
    });
    document.getElementById('post-job-btn').addEventListener('click', async () => {
        const userId = sessionStorage.getItem('userUID');
        const companyProfile = await Firestore.fetchCompanyProfile(userId);
        UI.openPostJobModal(null, allJobs, companyProfile);
    });
    document.getElementById('close-modal-btn').addEventListener('click', UI.closePostJobModal);
    document.getElementById('job-form').addEventListener('submit', handleJobFormSubmit);
    document.getElementById('manage-users-btn').addEventListener('click', handleDisplayUsers);
    document.getElementById('close-user-modal-btn').addEventListener('click', () => UI.toggleUserManagementModal(false));
    document.getElementById('user-list-container').addEventListener('click', handleRoleChange);
    
    const applicantListContainer = document.getElementById('applicant-list-container');
    applicantListContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('view-cv-btn')) {
            handleViewCv(e.target.dataset.userid);
        }
    });
    applicantListContainer.addEventListener('change', handleStatusChange);
    applicantListContainer.addEventListener('focusout', handleNoteChange); // Lưu ghi chú khi người dùng click ra ngoài

    document.getElementById('close-applicants-modal-btn').addEventListener('click', () => UI.toggleApplicantsModal(false));

    document.getElementById('job-details').addEventListener('click', (e) => {
        const editBtn = e.target.closest('#edit-job-btn');
        const deleteBtn = e.target.closest('#delete-job-btn');
        const applyBtn = e.target.closest('#apply-btn');
        const viewApplicantsBtn = e.target.closest('#view-applicants-btn');

        if (editBtn) {
            const userId = sessionStorage.getItem('userUID');
            Firestore.fetchCompanyProfile(userId).then(companyProfile => {
                UI.openPostJobModal(editBtn.dataset.jobid, allJobs, companyProfile);
            });
        }
        if (deleteBtn) handleDeleteJob(deleteBtn.dataset.jobid);
        if (applyBtn) handleApplyForJob(applyBtn.dataset.jobid);
        if (viewApplicantsBtn) handleViewApplicants(viewApplicantsBtn.dataset.jobid);
    });
    document.getElementById('filter-btn').addEventListener('click', handleFilter);
}
