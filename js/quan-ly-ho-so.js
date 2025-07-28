// File: js/quan-ly-ho-so.js
// Logic for the profile management page.

import { db, auth } from './portal-config.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- UI Elements ---
const profileForm = document.getElementById('profile-form');
const skillsContainer = document.getElementById('skills-container');
const educationContainer = document.getElementById('education-container');
const experienceContainer = document.getElementById('experience-container');
const addSkillBtn = document.getElementById('add-skill-btn');
const addEducationBtn = document.getElementById('add-education-btn');
const addExperienceBtn = document.getElementById('add-experience-btn');

const userId = sessionStorage.getItem('userUID');
const profilesColPath = `artifacts/${db.app.options.projectId}/public/data/profiles`;

// --- Dynamic Element Templates ---

function createSkillElement(skill = { name: '', level: 'Cơ bản' }) {
    const id = Date.now();
    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center gap-4';
    wrapper.innerHTML = `
        <input type="text" value="${skill.name}" placeholder="Tên kỹ năng (VD: JavaScript)" class="flex-grow input-field skill-name">
        <select class="input-field skill-level">
            <option ${skill.level === 'Cơ bản' ? 'selected' : ''}>Cơ bản</option>
            <option ${skill.level === 'Thành thạo' ? 'selected' : ''}>Thành thạo</option>
            <option ${skill.level === 'Chuyên gia' ? 'selected' : ''}>Chuyên gia</option>
        </select>
        <button type="button" class="text-red-500 hover:text-red-700 remove-btn"><i class="fas fa-trash-alt"></i></button>
    `;
    wrapper.querySelector('.remove-btn').addEventListener('click', () => wrapper.remove());
    return wrapper;
}

function createEducationElement(edu = { school: '', major: '', year: '' }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'p-4 border rounded-lg relative';
    wrapper.innerHTML = `
        <button type="button" class="absolute top-2 right-2 text-red-500 hover:text-red-700 remove-btn"><i class="fas fa-trash-alt"></i></button>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label class="block text-sm font-medium text-gray-700">Trường</label>
                <input type="text" value="${edu.school}" placeholder="Đại học Hải Phòng" class="mt-1 w-full input-field edu-school">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">Chuyên ngành</label>
                <input type="text" value="${edu.major}" placeholder="Công nghệ thông tin" class="mt-1 w-full input-field edu-major">
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">Niên khóa</label>
                <input type="text" value="${edu.year}" placeholder="2021 - 2025" class="mt-1 w-full input-field edu-year">
            </div>
        </div>
    `;
    wrapper.querySelector('.remove-btn').addEventListener('click', () => wrapper.remove());
    return wrapper;
}

function createExperienceElement(exp = { company: '', position: '', description: '' }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'p-4 border rounded-lg relative';
    wrapper.innerHTML = `
        <button type="button" class="absolute top-2 right-2 text-red-500 hover:text-red-700 remove-btn"><i class="fas fa-trash-alt"></i></button>
        <div class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Công ty</label>
                    <input type="text" value="${exp.company}" placeholder="Tên công ty" class="mt-1 w-full input-field exp-company">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Vị trí</label>
                    <input type="text" value="${exp.position}" placeholder="Thực tập sinh Web" class="mt-1 w-full input-field exp-position">
                </div>
            </div>
            <div>
                <label class="block text-sm font-medium text-gray-700">Mô tả công việc</label>
                <textarea rows="3" class="w-full input-field exp-description" placeholder="Mô tả các công việc bạn đã làm...">${exp.description}</textarea>
            </div>
        </div>
    `;
    wrapper.querySelector('.remove-btn').addEventListener('click', () => wrapper.remove());
    return wrapper;
}

// --- Data Handling ---

async function loadProfile() {
    if (!userId) {
        alert("Không thể xác thực người dùng. Vui lòng đăng nhập lại.");
        window.location.href = '/';
        return;
    }

    document.getElementById('profile-email').value = sessionStorage.getItem('userEmail');

    const docRef = doc(db, profilesColPath, userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        const data = docSnap.data();
        document.getElementById('profile-name').value = data.name || '';
        document.getElementById('profile-phone').value = data.phone || '';
        document.getElementById('profile-dob').value = data.dob || '';
        document.getElementById('profile-address').value = data.address || '';
        document.getElementById('profile-summary').value = data.summary || '';

        (data.skills || []).forEach(skill => skillsContainer.appendChild(createSkillElement(skill)));
        (data.education || []).forEach(edu => educationContainer.appendChild(createEducationElement(edu)));
        (data.experience || []).forEach(exp => experienceContainer.appendChild(createExperienceElement(exp)));
    } else {
        // Add one empty field for each section to start with
        skillsContainer.appendChild(createSkillElement());
        educationContainer.appendChild(createEducationElement());
    }
}

async function saveProfile(e) {
    e.preventDefault();
    const saveBtn = document.getElementById('save-profile-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Đang lưu...`;

    const skills = Array.from(skillsContainer.children).map(el => ({
        name: el.querySelector('.skill-name').value,
        level: el.querySelector('.skill-level').value
    })).filter(s => s.name);

    const education = Array.from(educationContainer.children).map(el => ({
        school: el.querySelector('.edu-school').value,
        major: el.querySelector('.edu-major').value,
        year: el.querySelector('.edu-year').value
    })).filter(e => e.school);

    const experience = Array.from(experienceContainer.children).map(el => ({
        company: el.querySelector('.exp-company').value,
        position: el.querySelector('.exp-position').value,
        description: el.querySelector('.exp-description').value
    })).filter(e => e.company);

    const profileData = {
        name: document.getElementById('profile-name').value,
        email: document.getElementById('profile-email').value,
        phone: document.getElementById('profile-phone').value,
        dob: document.getElementById('profile-dob').value,
        address: document.getElementById('profile-address').value,
        summary: document.getElementById('profile-summary').value,
        skills,
        education,
        experience,
        updatedAt: new Date()
    };

    try {
        await setDoc(doc(db, profilesColPath, userId), profileData);
        alert('Lưu hồ sơ thành công!');
    } catch (error) {
        console.error("Error saving profile: ", error);
        alert('Đã xảy ra lỗi khi lưu hồ sơ.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="fas fa-save mr-2"></i>Lưu hồ sơ`;
    }
}

// --- Event Listeners ---

document.addEventListener('DOMContentLoaded', loadProfile);
profileForm.addEventListener('submit', saveProfile);
addSkillBtn.addEventListener('click', () => skillsContainer.appendChild(createSkillElement()));
addEducationBtn.addEventListener('click', () => educationContainer.appendChild(createEducationElement()));
addExperienceBtn.addEventListener('click', () => experienceContainer.appendChild(createExperienceElement()));
