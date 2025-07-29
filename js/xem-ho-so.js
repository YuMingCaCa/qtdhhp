// File: js/xem-ho-so.js
// Logic for the read-only profile view page.

import { db } from './portal-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const profileContainer = document.getElementById('profile-container');
const loadingSpinner = document.getElementById('loading-spinner');

/**
 * Renders the profile data into the container.
 * @param {Object} data - The profile data from Firestore.
 */
function renderProfile(data) {
    const skillsHtml = (data.skills || []).map(skill => `
        <div class="bg-gray-100 p-3 rounded-lg">
            <p class="font-semibold text-gray-800">${skill.name}</p>
            <p class="text-sm text-gray-600">${skill.level}</p>
        </div>
    `).join('');

    const educationHtml = (data.education || []).map(edu => `
        <div class="border-l-4 border-blue-500 pl-4 py-2">
            <p class="font-bold text-lg text-gray-900">${edu.school}</p>
            <p class="font-medium text-gray-700">${edu.major}</p>
            <p class="text-sm text-gray-500">${edu.year}</p>
        </div>
    `).join('');

    const experienceHtml = (data.experience || []).map(exp => `
         <div class="border-l-4 border-green-500 pl-4 py-2">
            <p class="font-bold text-lg text-gray-900">${exp.company}</p>
            <p class="font-medium text-gray-700">${exp.position}</p>
            <p class="text-sm text-gray-600 mt-2 whitespace-pre-line">${exp.description}</p>
        </div>
    `).join('');

    profileContainer.innerHTML = `
        <div class="max-w-4xl mx-auto bg-white p-8 rounded-xl shadow-lg">
            <!-- Header -->
            <div class="text-center border-b pb-6 mb-8">
                <h1 class="text-4xl font-bold text-gray-800">${data.name || 'Chưa cập nhật'}</h1>
                <p class="text-lg text-gray-600 mt-2">${data.email}</p>
                <div class="flex justify-center gap-6 mt-4 text-gray-700">
                    <span><i class="fas fa-phone-alt mr-2"></i>${data.phone || 'N/A'}</span>
                    <span><i class="fas fa-birthday-cake mr-2"></i>${data.dob || 'N/A'}</span>
                    <span><i class="fas fa-map-marker-alt mr-2"></i>${data.address || 'N/A'}</span>
                </div>
            </div>

            <!-- Summary -->
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-gray-800 mb-4 border-l-4 border-gray-400 pl-3">Giới thiệu</h2>
                <p class="text-gray-700 leading-relaxed">${data.summary || 'Chưa có giới thiệu.'}</p>
            </div>

            <!-- Skills -->
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-gray-800 mb-4 border-l-4 border-gray-400 pl-3">Kỹ năng</h2>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    ${skillsHtml || '<p class="text-gray-500">Chưa cập nhật kỹ năng.</p>'}
                </div>
            </div>

            <!-- Education -->
            <div class="mb-8">
                <h2 class="text-2xl font-bold text-gray-800 mb-4 border-l-4 border-gray-400 pl-3">Học vấn</h2>
                <div class="space-y-6">
                    ${educationHtml || '<p class="text-gray-500">Chưa cập nhật học vấn.</p>'}
                </div>
            </div>

            <!-- Experience -->
            <div>
                <h2 class="text-2xl font-bold text-gray-800 mb-4 border-l-4 border-gray-400 pl-3">Kinh nghiệm</h2>
                <div class="space-y-6">
                    ${experienceHtml || '<p class="text-gray-500">Chưa có kinh nghiệm làm việc.</p>'}
                </div>
            </div>
        </div>
    `;
}

/**
 * Fetches and displays the profile of a specific user.
 */
async function loadProfile() {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get('id');

    if (!userId) {
        profileContainer.innerHTML = `<p class="text-center text-red-500">Không tìm thấy ID người dùng.</p>`;
        return;
    }

    try {
        const profilesColPath = `artifacts/${db.app.options.projectId}/public/data/profiles`;
        const docRef = doc(db, profilesColPath, userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            renderProfile(docSnap.data());
        } else {
            profileContainer.innerHTML = `<p class="text-center text-red-500">Không tìm thấy hồ sơ cho người dùng này.</p>`;
        }
    } catch (error) {
        console.error("Error loading profile:", error);
        profileContainer.innerHTML = `<p class="text-center text-red-500">Đã xảy ra lỗi khi tải hồ sơ.</p>`;
    } finally {
        loadingSpinner.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', loadProfile);
