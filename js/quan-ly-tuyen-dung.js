// File: js/quan-ly-tuyen-dung.js
// Logic for the recruitment management page for businesses.

import { db } from './portal-config.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import * as UI from './portal-ui.js'; // Re-use UI functions
import * as Firestore from './portal-firestore.js'; // Re-use Firestore functions

const postedJobsList = document.getElementById('posted-jobs-list');
const paginationControls = document.getElementById('pagination-controls');
const userId = sessionStorage.getItem('userUID');

let allPostedJobs = [];
let allApplications = [];
let currentJobApplicants = [];
let currentPage = 1;
const jobsPerPage = 5; // Số tin đăng trên mỗi trang

function renderPaginationControls() {
    paginationControls.innerHTML = '';
    const totalPages = Math.ceil(allPostedJobs.length / jobsPerPage);

    if (totalPages <= 1) return; // Không hiển thị nếu chỉ có 1 trang

    // Nút "Trang trước"
    const prevButton = document.createElement('button');
    prevButton.innerHTML = `<i class="fas fa-chevron-left"></i>`;
    prevButton.className = 'px-4 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-100';
    prevButton.disabled = currentPage === 1;
    prevButton.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderCurrentPageJobs();
        }
    });
    paginationControls.appendChild(prevButton);

    // Các nút số trang
    for (let i = 1; i <= totalPages; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        pageButton.className = `px-4 py-2 text-sm font-medium border border-gray-300 rounded-md ${currentPage === i ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`;
        pageButton.addEventListener('click', () => {
            currentPage = i;
            renderCurrentPageJobs();
        });
        paginationControls.appendChild(pageButton);
    }

    // Nút "Trang sau"
    const nextButton = document.createElement('button');
    nextButton.innerHTML = `<i class="fas fa-chevron-right"></i>`;
    nextButton.className = 'px-4 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-100';
    nextButton.disabled = currentPage === totalPages;
    nextButton.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderCurrentPageJobs();
        }
    });
    paginationControls.appendChild(nextButton);
}

function renderCurrentPageJobs() {
    postedJobsList.innerHTML = '';
    const startIndex = (currentPage - 1) * jobsPerPage;
    const endIndex = startIndex + jobsPerPage;
    const jobsToRender = allPostedJobs.slice(startIndex, endIndex);

    if (jobsToRender.length === 0) {
        postedJobsList.innerHTML = `<p class="text-gray-500 text-center py-8">Bạn chưa đăng tin tuyển dụng nào.</p>`;
        return;
    }

    jobsToRender.forEach(job => {
        const applicantCount = allApplications.filter(app => app.jobId === job.id).length;
        const jobElement = document.createElement('div');
        jobElement.className = 'p-4 border rounded-lg flex justify-between items-center';
        jobElement.innerHTML = `
            <div>
                <p class="font-bold text-lg text-blue-700">${job.title}</p>
                <p class="text-sm text-gray-600">${job.company}</p>
            </div>
            <div class="text-right">
                 <p class="text-sm text-gray-500">${applicantCount} ứng viên</p>
                 <button data-jobid="${job.id}" class="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-800 view-applicants-btn">Xem danh sách</button>
            </div>
        `;
        postedJobsList.appendChild(jobElement);
    });

    renderPaginationControls();
}


async function loadPostedJobs() {
    if (!userId) {
        alert("Không thể xác thực người dùng. Vui lòng đăng nhập lại.");
        window.location.href = '/';
        return;
    }

    UI.showLoading(postedJobsList);

    try {
        const jobs = await Firestore.fetchJobsByOwner(userId);
        const applicationsSnapshot = await getDocs(collection(db, `artifacts/${db.app.options.projectId}/public/data/applications`));
        allApplications = applicationsSnapshot.docs.map(doc => doc.data());
        allPostedJobs = jobs.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

        currentPage = 1;
        renderCurrentPageJobs();

    } catch (error) {
        console.error("Error loading posted jobs:", error);
        postedJobsList.innerHTML = `<p class="text-red-500 text-center py-8">Đã xảy ra lỗi khi tải tin đã đăng.</p>`;
    }
}

function applyApplicantFilters() {
    const statusFilter = document.getElementById('filter-status').value;
    const dateSort = document.getElementById('sort-date').value;

    let filtered = [...currentJobApplicants];

    if (statusFilter !== 'Tất cả trạng thái') {
        filtered = filtered.filter(app => app.status === statusFilter);
    }

    filtered.sort((a, b) => {
        const timeA = a.appliedAt?.toMillis() || 0;
        const timeB = b.appliedAt?.toMillis() || 0;
        return dateSort === 'newest' ? timeB - timeA : timeA - timeB;
    });

    UI.rerenderApplicantsTable(filtered);
}

async function handleViewApplicants(jobId) {
    UI.toggleApplicantsModal(true);
    UI.showLoading(document.getElementById('applicant-list-container'));
    try {
        currentJobApplicants = await Firestore.fetchApplicantsForJob(jobId);
        UI.displayApplicantsInModal(currentJobApplicants);
        // Gắn sự kiện cho các control mới được tạo
        document.getElementById('filter-status').addEventListener('change', applyApplicantFilters);
        document.getElementById('sort-date').addEventListener('change', applyApplicantFilters);
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
        const applicant = currentJobApplicants.find(app => app.id === applicationId);
        if (applicant) {
            applicant.status = newStatus;
        }
    } catch (error) {
        console.error("Error updating status:", error);
        alert("Lỗi khi cập nhật trạng thái.");
    }
}


document.addEventListener('DOMContentLoaded', () => {
    loadPostedJobs();

    postedJobsList.addEventListener('click', (e) => {
        if (e.target.classList.contains('view-applicants-btn')) {
            handleViewApplicants(e.target.dataset.jobid);
        }
    });

    const applicantsModal = document.getElementById('view-applicants-modal');
    applicantsModal.addEventListener('click', (e) => {
        if (e.target.id === 'close-applicants-modal-btn' || e.target.closest('#close-applicants-modal-btn')) {
            UI.toggleApplicantsModal(false);
        } else if (e.target.classList.contains('view-cv-btn')) {
            handleViewCv(e.target.dataset.userid);
        }
    });
    applicantsModal.addEventListener('change', handleStatusChange);
});
