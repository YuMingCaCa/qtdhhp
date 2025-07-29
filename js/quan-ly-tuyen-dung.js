// File: js/quan-ly-tuyen-dung.js
// Logic for the recruitment management page for businesses.

import { db } from './portal-config.js';
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import * as UI from './portal-ui.js'; // Re-use UI functions
import * as Firestore from './portal-firestore.js'; // Re-use Firestore functions

const postedJobsList = document.getElementById('posted-jobs-list');
const userId = sessionStorage.getItem('userUID');

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
        const applications = applicationsSnapshot.docs.map(doc => doc.data());

        if (jobs.length === 0) {
            postedJobsList.innerHTML = `<p class="text-gray-500 text-center py-8">Bạn chưa đăng tin tuyển dụng nào.</p>`;
            return;
        }

        postedJobsList.innerHTML = '';
        jobs.forEach(job => {
            const applicantCount = applications.filter(app => app.jobId === job.id).length;
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

    } catch (error) {
        console.error("Error loading posted jobs:", error);
        postedJobsList.innerHTML = `<p class="text-red-500 text-center py-8">Đã xảy ra lỗi khi tải tin đã đăng.</p>`;
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
