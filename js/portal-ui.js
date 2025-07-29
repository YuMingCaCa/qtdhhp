// File: js/portal-ui.js
// Module này chứa tất cả các hàm cập nhật giao diện người dùng (DOM manipulation).

// --- Helper Functions ---

function formatDate(dateInput) {
    if (!dateInput) return 'N/A';
    let date;
    if (dateInput.seconds) {
        date = new Date(dateInput.seconds * 1000);
    } else {
        date = new Date(dateInput);
        date.setDate(date.getDate() + 1);
    }
    return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function timeAgo(timestamp) {
    if (!timestamp) return 'gần đây';
    const now = new Date();
    const past = new Date(timestamp.seconds * 1000);
    const seconds = Math.floor((now - past) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " năm trước";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " tháng trước";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " ngày trước";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " giờ trước";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " phút trước";
    return "Vừa xong";
}

// --- Main UI Functions ---

export function renderJobListings(jobs, companies, onJobClick) {
    const jobListingsContainer = document.getElementById('job-listings');
    jobListingsContainer.innerHTML = '';
    if (!jobs || jobs.length === 0) {
        jobListingsContainer.innerHTML = `<div class="bg-white p-6 rounded-lg text-center text-gray-500"><i class="fas fa-search-minus fa-2x mb-3"></i><p>Hiện tại chưa có tin tuyển dụng nào.</p></div>`;
        return;
    }
    jobs.forEach(job => {
        const company = companies[job.ownerId];
        const logoUrl = company?.logoUrl || 'https://placehold.co/40x40/E2E8F0/4A5568?text=...';
        const isExpired = job.expiryDate && new Date(job.expiryDate) < new Date();
        const cardClass = isExpired ? 'opacity-60' : 'hover:shadow-md';
        const jobCard = document.createElement('div');
        jobCard.className = `job-card bg-white p-5 rounded-lg shadow-sm cursor-pointer border-2 border-transparent ${cardClass}`;
        jobCard.dataset.jobId = job.id;
        jobCard.innerHTML = `
            <div class="flex items-start gap-4">
                <img src="${logoUrl}" alt="Company Logo" class="h-10 w-10 rounded-md object-cover border" onerror="this.onerror=null;this.src='https://placehold.co/40x40/E2E8F0/4A5568?text=...';">
                <div class="flex-grow">
                    <div class="flex justify-between items-start">
                         <h3 class="font-bold text-lg text-blue-700 mb-1">${job.title || 'Chưa có tiêu đề'}</h3>
                        ${isExpired ? '<span class="text-xs font-bold py-1 px-2 rounded-full bg-red-200 text-red-700">Hết hạn</span>' : ''}
                    </div>
                    <p class="text-gray-800 text-sm"><span class="font-semibold text-gray-600">Công ty:</span> ${job.company || 'Chưa có tên công ty'}</p>
                </div>
            </div>
            <p class="text-gray-600 text-sm mt-2"><i class="fas fa-map-marker-alt mr-1 text-gray-400"></i> <span class="font-semibold">Địa điểm:</span> ${job.location || 'Chưa rõ địa điểm'}</p>
            <div class="flex justify-between items-center mt-3">
                <span class="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-green-600 bg-green-200">${job.type || 'Chưa rõ loại hình'}</span>
                <span class="text-xs text-gray-500">Đăng ${timeAgo(job.createdAt)}</span>
            </div>
        `;
        jobCard.addEventListener('click', () => onJobClick(job.id));
        jobListingsContainer.appendChild(jobCard);
    });
}

export function renderJobDetails(job, company, hasApplied) {
    const jobDetailsContainer = document.getElementById('job-details');
    if (!job) {
        jobDetailsContainer.innerHTML = `<p>Không tìm thấy thông tin chi tiết.</p>`;
        return;
    }
    const logoUrl = company?.logoUrl || 'https://placehold.co/80x80/E2E8F0/4A5568?text=...';
    const isExpired = job.expiryDate && new Date(job.expiryDate) < new Date();
    const requirementsList = Array.isArray(job.requirements) ? job.requirements.map(req => `<li>${req}</li>`).join('') : '<li>Chưa cập nhật yêu cầu.</li>';
    const tagsList = Array.isArray(job.tags) ? job.tags.map(tag => `<span class="bg-gray-200 text-gray-800 text-sm font-medium px-3 py-1 rounded-full">${tag}</span>`).join('') : '';
    
    const userEmail = sessionStorage.getItem('userEmail');
    const userRole = sessionStorage.getItem('userRole');
    let managementButtons = '';
    if (userEmail === job.postedBy || userRole === 'admin') {
        managementButtons = `
            <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <button id="view-applicants-btn" data-jobid="${job.id}" class="col-span-2 lg:col-span-3 w-full bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition-colors"><i class="fas fa-users mr-2"></i>Xem ứng viên</button>
                <button id="edit-job-btn" data-jobid="${job.id}" class="bg-yellow-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-yellow-600 transition-colors"><i class="fas fa-edit mr-2"></i>Sửa</button>
                <button id="delete-job-btn" data-jobid="${job.id}" class="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors"><i class="fas fa-trash-alt mr-2"></i>Xóa</button>
            </div>
        `;
    }

    let applyButton = '';
    if (userRole === 'viewer') {
        if (isExpired) {
            applyButton = `<button class="w-full mt-6 bg-gray-400 text-white font-bold py-3 px-4 rounded-lg cursor-not-allowed" disabled><i class="fas fa-times-circle mr-2"></i>Đã hết hạn</button>`;
        } else if (hasApplied) {
            applyButton = `<button class="w-full mt-6 bg-green-600 text-white font-bold py-3 px-4 rounded-lg cursor-not-allowed" disabled><i class="fas fa-check-circle mr-2"></i>Đã ứng tuyển</button>`;
        } else {
            applyButton = `<button id="apply-btn" data-jobid="${job.id}" class="w-full mt-6 bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors text-lg"><i class="fas fa-paper-plane mr-2"></i>Nộp hồ sơ ngay</button>`;
        }
    }

    jobDetailsContainer.innerHTML = `
        <div id="job-details-content">
            ${managementButtons}
            <div class="mt-4">
                <span class="text-sm font-medium text-gray-500">Chức danh tuyển dụng</span>
                <h2 class="text-2xl font-bold text-gray-800">${job.title || 'Chưa có tiêu đề'}</h2>
            </div>
            <div class="flex items-center gap-4 mt-2">
                <img src="${logoUrl}" alt="Company Logo" class="h-16 w-16 rounded-lg object-cover border" onerror="this.onerror=null;this.src='https://placehold.co/80x80/E2E8F0/4A5568?text=...';">
                <div>
                    <span class="text-sm font-medium text-gray-500">Công ty</span>
                    <h3 class="text-xl font-semibold text-blue-700">${job.company || 'Chưa có tên công ty'}</h3>
                    ${company?.website ? `<a href="${company.website}" target="_blank" class="text-sm text-blue-500 hover:underline">Xem website <i class="fas fa-external-link-alt ml-1"></i></a>` : ''}
                </div>
            </div>
            <div class="mt-2">
                <span class="text-sm font-medium text-gray-500">Địa điểm</span>
                <p class="text-gray-700 mt-1"><i class="fas fa-map-marker-alt mr-2 text-gray-400"></i>${job.location || 'Chưa rõ địa điểm'}</p>
            </div>
            <div class="mt-4 text-sm text-gray-500 flex justify-between">
                <span>Đăng ngày: <span class="font-semibold text-gray-700">${formatDate(job.createdAt)}</span></span>
                <span>Hết hạn: <span class="font-semibold text-red-600">${formatDate(job.expiryDate)}</span></span>
            </div>
            ${applyButton}
            <div class="mt-6 border-t pt-4">
                <h4 class="font-bold text-gray-800 mb-2">Thông tin liên hệ</h4>
                <p class="text-gray-600">${job.contactInfo || 'Chưa cập nhật.'}</p>
            </div>
            <div class="mt-4">
                <h4 class="font-bold text-gray-800 mb-2">Mô tả công việc</h4>
                <p class="text-gray-600 whitespace-pre-line">${job.description || 'Chưa có mô tả.'}</p>
            </div>
            <div class="mt-4">
                <h4 class="font-bold text-gray-800 mb-2">Yêu cầu ứng viên</h4>
                <ul class="list-disc list-inside text-gray-600 space-y-1">${requirementsList}</ul>
            </div>
            <div class="mt-4">
                <h4 class="font-bold text-gray-800 mb-2">Quyền lợi</h4>
                <p class="text-gray-600 whitespace-pre-line">${job.benefits || 'Chưa cập nhật quyền lợi.'}</p>
            </div>
            <div class="mt-4">
                <h4 class="font-bold text-gray-800 mb-3">Kỹ năng</h4>
                <div class="flex flex-wrap gap-2">${tagsList}</div>
            </div>
        </div>
    `;
}

export function openPostJobModal(jobId = null, allJobs, companyProfile) {
    const jobForm = document.getElementById('job-form');
    const modalTitle = document.getElementById('modal-title');
    jobForm.reset();
    delete jobForm.dataset.editingId;
    if (jobId) {
        modalTitle.textContent = 'Chỉnh sửa tin tuyển dụng';
        jobForm.dataset.editingId = jobId;
        const job = allJobs.find(j => j.id === jobId);
        if (job) {
            document.getElementById('job-title').value = job.title || '';
            document.getElementById('job-company').value = job.company || '';
            document.getElementById('job-location').value = job.location || '';
            document.getElementById('job-type').value = job.type || 'Internship';
            document.getElementById('job-tags').value = (job.tags || []).join(', ');
            document.getElementById('job-contact').value = job.contactInfo || '';
            document.getElementById('job-expiry').value = job.expiryDate || '';
            document.getElementById('job-description').value = job.description || '';
            document.getElementById('job-requirements').value = (job.requirements || []).join('\n');
            document.getElementById('job-benefits').value = job.benefits || '';
            document.getElementById('submit-job-btn').textContent = 'Lưu thay đổi';
        }
    } else {
        modalTitle.textContent = 'Đăng tin tuyển dụng mới';
        document.getElementById('submit-job-btn').textContent = 'Đăng tin';
        if (companyProfile) {
            document.getElementById('job-company').value = companyProfile.name || '';
            document.getElementById('job-location').value = companyProfile.address || '';
            document.getElementById('job-contact').value = companyProfile.contactInfo || '';
        }
    }
    document.getElementById('post-job-modal').classList.remove('hidden');
}

export function closePostJobModal() {
    document.getElementById('post-job-modal').classList.add('hidden');
}

export function toggleUserManagementModal(show) {
    document.getElementById('user-management-modal').classList.toggle('hidden', !show);
}

export function toggleApplicantsModal(show) {
    document.getElementById('view-applicants-modal').classList.toggle('hidden', !show);
}

export function displayApplicantsInModal(applicants) {
    const applicantListContainer = document.getElementById('applicant-list-container');
    if (applicants.length === 0) {
        applicantListContainer.innerHTML = `<p class="text-center text-gray-500 py-8">Chưa có ứng viên nào cho vị trí này.</p>`;
        return;
    }

    const statusOptions = ['Đã nộp', 'Đã xem', 'Mời phỏng vấn', 'Trúng tuyển', 'Không trúng tuyển'];

    applicantListContainer.innerHTML = `
        <table class="w-full text-sm text-left text-gray-500">
            <thead class="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                    <th scope="col" class="px-4 py-3">Ứng viên</th>
                    <th scope="col" class="px-4 py-3">Trạng thái</th>
                    <th scope="col" class="px-4 py-3">Ghi chú</th>
                    <th scope="col" class="px-4 py-3 text-center">Hành động</th>
                </tr>
            </thead>
            <tbody>
                ${applicants.map(app => `
                    <tr class="bg-white border-b">
                        <td class="px-4 py-4">
                            <p class="font-medium text-gray-900 whitespace-nowrap">${app.userEmail}</p>
                            <p class="text-xs text-gray-500">Nộp ngày: ${formatDate(app.appliedAt)}</p>
                        </td>
                        <td class="px-4 py-4">
                            <select data-appid="${app.id}" class="status-select bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5">
                                ${statusOptions.map(opt => `<option value="${opt}" ${app.status === opt ? 'selected' : ''}>${opt}</option>`).join('')}
                            </select>
                        </td>
                        <td class="px-4 py-4">
                            <textarea data-appid="${app.id}" class="note-textarea w-full text-sm p-2 border rounded-md" rows="2" placeholder="Thêm ghi chú...">${app.notes || ''}</textarea>
                        </td>
                        <td class="px-4 py-4 text-center">
                            <button data-userid="${app.userId}" class="font-medium text-blue-600 hover:underline view-cv-btn">Xem CV</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

export function displayUsersInModal(users) {
    const userListContainer = document.getElementById('user-list-container');
    userListContainer.innerHTML = `
        <table class="w-full text-sm text-left text-gray-500">
            <thead class="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                    <th scope="col" class="px-6 py-3">Email</th>
                    <th scope="col" class="px-6 py-3">Vai trò hiện tại</th>
                    <th scope="col" class="px-6 py-3 text-center">Hành động</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(createUserRow).join('')}
            </tbody>
        </table>
    `;
}

function createUserRow(user) {
    let actionButton = '';
    const role = user.role || 'viewer';
    if (role === 'admin') {
        actionButton = `<span class="text-gray-400">Không thể thay đổi</span>`;
    } else if (role === 'business') {
        actionButton = `<button data-userid="${user.id}" data-newrole="viewer" class="font-medium text-yellow-600 hover:underline role-change-btn">Hạ cấp về Sinh viên</button>`;
    } else {
        actionButton = `<button data-userid="${user.id}" data-newrole="business" class="font-medium text-green-600 hover:underline role-change-btn">Nâng cấp lên Doanh nghiệp</button>`;
    }
    return `
        <tr class="bg-white border-b">
            <th scope="row" class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">${user.email}</th>
            <td class="px-6 py-4">${role}</td>
            <td class="px-6 py-4 text-center">${actionButton}</td>
        </tr>
    `;
}

export function showLoading(container) {
    if (container) {
        container.innerHTML = `<div class="text-center p-10"><i class="fas fa-spinner fa-spin fa-2x"></i></div>`;
    }
}

export function resetJobDetails() {
    const jobDetailsContainer = document.getElementById('job-details');
    if (jobDetailsContainer) {
        jobDetailsContainer.innerHTML = `<div class="text-center p-10 text-gray-500"><i class="fas fa-hand-pointer fa-3x mb-4"></i><p>Chọn một việc làm để xem chi tiết</p></div>`;
    }
}
