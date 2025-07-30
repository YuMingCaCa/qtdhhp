// File: js/tim-kiem-ho-so.js
// Logic for the CV Bank / student profile search page.

import * as Firestore from './portal-firestore.js';

const cvGrid = document.getElementById('cv-grid');
const searchInput = document.getElementById('cv-search-input');
let allProfiles = []; // Cache profiles to avoid re-fetching

function renderProfiles(profiles) {
    if (!cvGrid) return;
    cvGrid.innerHTML = '';

    if (profiles.length === 0) {
        cvGrid.innerHTML = `<p class="text-gray-500 col-span-full text-center py-10">Không tìm thấy hồ sơ nào phù hợp.</p>`;
        return;
    }

    profiles.forEach(profile => {
        const major = profile.education?.[0]?.major || 'Chưa cập nhật chuyên ngành';
        const skills = (profile.skills || []).slice(0, 3).map(skill => 
            `<span class="bg-gray-200 text-gray-800 text-xs font-medium px-2.5 py-0.5 rounded-full">${skill.name}</span>`
        ).join('');

        const card = document.createElement('a');
        card.href = `/xem-ho-so?id=${profile.id}`;
        card.target = '_blank';
        card.className = 'bg-white p-6 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-300 flex flex-col';
        card.innerHTML = `
            <div class="flex-grow">
                <h3 class="text-xl font-bold text-blue-700">${profile.name || 'Chưa có tên'}</h3>
                <p class="text-sm text-gray-600 mt-1">${major}</p>
                <p class="text-sm text-gray-500 mt-4 font-semibold">Kỹ năng nổi bật:</p>
                <div class="flex flex-wrap gap-2 mt-2">
                    ${skills || '<span class="text-xs text-gray-400">Chưa cập nhật</span>'}
                </div>
            </div>
            <div class="mt-6 pt-4 border-t text-right">
                <span class="text-sm font-medium text-blue-600">Xem chi tiết <i class="fas fa-arrow-right ml-1"></i></span>
            </div>
        `;
        cvGrid.appendChild(card);
    });
}

function handleSearch() {
    const keyword = searchInput.value.toLowerCase();
    const filteredProfiles = allProfiles.filter(profile => {
        const matchesName = profile.name?.toLowerCase().includes(keyword);
        const matchesSkills = (profile.skills || []).some(skill => skill.name.toLowerCase().includes(keyword));
        return matchesName || matchesSkills;
    });
    renderProfiles(filteredProfiles);
}

async function initializePage() {
    const userRole = sessionStorage.getItem('userRole');
    if (userRole !== 'admin' && userRole !== 'business') {
        alert("Bạn không có quyền truy cập trang này.");
        window.location.href = '/portal-viec-lam';
        return;
    }
    
    cvGrid.innerHTML = `<p class="text-gray-500 col-span-full text-center py-10"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải danh sách hồ sơ...</p>`;
    
    try {
        allProfiles = await Firestore.fetchAllProfiles();
        renderProfiles(allProfiles);
    } catch (error) {
        console.error("Error loading profiles:", error);
        cvGrid.innerHTML = `<p class="text-red-500 col-span-full text-center py-10">Đã xảy ra lỗi khi tải hồ sơ.</p>`;
    }

    searchInput.addEventListener('input', handleSearch);
}

document.addEventListener('DOMContentLoaded', initializePage);
