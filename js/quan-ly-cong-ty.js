// File: js/quan-ly-cong-ty.js
// Logic for the company profile management page.

import { db } from './portal-config.js';
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const companyForm = document.getElementById('company-form');
const userId = sessionStorage.getItem('userUID');
const companiesColPath = `artifacts/${db.app.options.projectId}/public/data/companies`;

async function loadCompanyProfile() {
    if (!userId) {
        alert("Không thể xác thực người dùng. Vui lòng đăng nhập lại.");
        window.location.href = '/';
        return;
    }

    try {
        const docRef = doc(db, companiesColPath, userId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            document.getElementById('company-name').value = data.name || '';
            document.getElementById('company-logo').value = data.logoUrl || '';
            document.getElementById('company-website').value = data.website || '';
            document.getElementById('company-address').value = data.address || '';
            document.getElementById('company-contact').value = data.contactInfo || '';
            document.getElementById('company-description').value = data.description || '';
        }
    } catch (error) {
        console.error("Error loading company profile:", error);
        alert("Đã xảy ra lỗi khi tải hồ sơ công ty.");
    }
}

async function saveCompanyProfile(e) {
    e.preventDefault();
    const saveBtn = document.getElementById('save-company-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Đang lưu...`;

    const profileData = {
        name: document.getElementById('company-name').value,
        logoUrl: document.getElementById('company-logo').value,
        website: document.getElementById('company-website').value,
        address: document.getElementById('company-address').value,
        contactInfo: document.getElementById('company-contact').value,
        description: document.getElementById('company-description').value,
        ownerId: userId,
        updatedAt: new Date()
    };

    try {
        await setDoc(doc(db, companiesColPath, userId), profileData);
        alert('Lưu thông tin công ty thành công!');
    } catch (error) {
        console.error("Error saving company profile: ", error);
        alert('Đã xảy ra lỗi khi lưu thông tin.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="fas fa-save mr-2"></i>Lưu thông tin`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadCompanyProfile();
    companyForm.addEventListener('submit', saveCompanyProfile);
});
