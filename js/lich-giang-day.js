// File: js/lich-giang-day.js
// Logic for the "Teaching Schedule" module.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, setDoc, getDocs, updateDoc, deleteDoc, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Style and Modal Injection ---
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .modal { display: none; position: fixed; z-index: 50; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.5); -webkit-animation-name: fadeIn; -webkit-animation-duration: 0.4s; animation-name: fadeIn; animation-duration: 0.4s; }
        .modal-content { background-color: #fefefe; margin: 5% auto; padding: 24px; border: 1px solid #888; width: 90%; max-width: 800px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); -webkit-animation-name: slideIn; -webkit-animation-duration: 0.4s; animation-name: slideIn; animation-duration: 0.4s; }
        @-webkit-keyframes slideIn { from {top: -300px; opacity: 0} to {top: 0; opacity: 1} }
        @keyframes slideIn { from {margin-top: -5%; opacity: 0} to {margin-top: 5%; opacity: 1} }
        @-webkit-keyframes fadeIn { from {opacity: 0} to {opacity: 1} }
        @keyframes fadeIn { from {opacity: 0} to {opacity: 1} }
        .close-button { color: #aaa; float: right; font-size: 28px; font-weight: bold; }
        .close-button:hover, .close-button:focus { color: black; text-decoration: none; cursor: pointer; }
    `;
    document.head.appendChild(style);
}

// --- Global Helper Functions ---
function showAlert(message, isSuccess = false) {
    const modal = document.getElementById('alert-modal');
    const title = document.getElementById('alert-title');
    document.getElementById('alert-message').textContent = message;
    title.textContent = isSuccess ? "Thành công" : "Lỗi";
    title.className = `text-lg font-bold mb-4 ${isSuccess ? 'text-green-600' : 'text-red-600'}`;
    modal.style.display = 'block';
    document.getElementById('alert-ok-btn').onclick = () => modal.style.display = 'none';
}

function showConfirm(message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-message').textContent = message;
    const yesBtn = document.getElementById('confirm-btn-yes');
    const noBtn = document.getElementById('confirm-btn-no');
    const newYesBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);
    const close = () => modal.style.display = 'none';
    newYesBtn.onclick = () => { onConfirm(); close(); };
    noBtn.onclick = close;
    modal.style.display = 'block';
}

function setButtonLoading(button, isLoading) {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.dataset.originalHtml = button.innerHTML;
        button.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Đang xử lý...`;
    } else {
        button.disabled = false;
        if (button.dataset.originalHtml) {
            button.innerHTML = button.dataset.originalHtml;
        }
    }
}

// --- Firebase Initialization ---
let db, auth;
let hocKyCol, monHocCol, lopHocPhanCol;
let departmentsCol, lecturersCol;

async function initializeFirebase() {
    const firebaseConfig = {
      apiKey: "AIzaSyCJcTMUwO-w7V0YsGUKWeaW-zl42Ww7fxo",
      authDomain: "qlylaodongbdhhp.firebaseapp.com",
      projectId: "qlylaodongbdhhp",
      storageBucket: "qlylaodongbdhhp.appspot.com",
      messagingSenderId: "462439202995",
      appId: "1:462439202995:web:06bc11042efb9b99d4f0c6"
    };
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        const appId = firebaseConfig.projectId || 'hpu-workload-tracker-app';
        const basePath = `artifacts/${appId}/public/data`; 
        
        hocKyCol = collection(db, `${basePath}/schedule_HocKy`);
        monHocCol = collection(db, `${basePath}/schedule_MonHoc`);
        lopHocPhanCol = collection(db, `${basePath}/schedule_LopHocPhan`);
        departmentsCol = collection(db, `${basePath}/departments`);
        lecturersCol = collection(db, `${basePath}/lecturers`);
        
        onAuthStateChanged(auth, (user) => {
            if (user) {
                document.getElementById('schedule-module-content').classList.remove('hidden');
                setupOnSnapshotListeners();
                addEventListeners();
                populateYearSelect();
                updateSemesterName();
            } else {
                console.log("User not authenticated. Redirecting to login page.");
                window.location.href = 'index.html';
            }
        });

    } catch (error) {
        console.error("Firebase initialization error in scheduling module:", error);
        showAlert("Không thể kết nối đến cơ sở dữ liệu cho module xếp lịch.");
    }
}

// --- Global State for Shared Data ---
let semesters = [];
let subjects = [];
let courseSections = [];
let departments = [];
let lecturers = [];

// --- Semester (Học kỳ) Management ---
function populateYearSelect() {
    const yearSelect = document.getElementById('semester-year-select');
    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = ''; 

    const prevAcademicYear = `${currentYear - 1}-${currentYear}`;
    const prevOption = document.createElement('option');
    prevOption.value = prevAcademicYear;
    prevOption.textContent = prevAcademicYear;
    yearSelect.appendChild(prevOption);

    const currentAcademicYear = `${currentYear}-${currentYear + 1}`;
    const currentOption = document.createElement('option');
    currentOption.value = currentAcademicYear;
    currentOption.textContent = currentAcademicYear;
    yearSelect.appendChild(currentOption);

    yearSelect.value = currentAcademicYear;
}

function updateSemesterName() {
    const yearSelect = document.getElementById('semester-year-select');
    const termSelect = document.getElementById('semester-term-select');
    const nameInput = document.getElementById('semester-name');

    const year = yearSelect.value;
    const termText = termSelect.options[termSelect.selectedIndex].text;

    if (year && termText) {
        nameInput.value = `${termText} Năm học ${year}`;
    }
}

function renderSemestersList() {
    const listBody = document.getElementById('semesters-list-body');
    listBody.innerHTML = '';
    semesters.forEach(semester => {
        const row = document.createElement('tr');
        row.className = "border-b";
        const formattedDate = new Date(semester.ngayBatDau).toLocaleDateString('vi-VN');
        row.innerHTML = `
            <td class="px-4 py-2">${semester.tenHocKy}</td>
            <td class="px-4 py-2">${semester.namHoc}</td>
            <td class="px-4 py-2 text-center">${formattedDate}</td>
            <td class="px-4 py-2 text-center">
                <button class="text-blue-500 mr-2" onclick="window.editSemester('${semester.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="text-red-500" onclick="window.deleteSemester('${semester.id}')" title="Xóa"><i class="fas fa-trash"></i></button>
            </td>
        `;
        listBody.appendChild(row);
    });
}

function clearSemesterForm() {
    const form = document.getElementById('semester-form');
    form.reset();
    document.getElementById('semester-id').value = '';
    populateYearSelect();
    updateSemesterName();
}

window.editSemester = (id) => {
    const semester = semesters.find(s => s.id === id);
    if (semester) {
        document.getElementById('semester-id').value = semester.id;
        document.getElementById('semester-year-select').value = semester.namHoc;
        document.getElementById('semester-term-select').value = semester.hocKy;
        document.getElementById('semester-start-date').value = semester.ngayBatDau;
        document.getElementById('semester-weeks').value = semester.soTuanHoc;
        updateSemesterName();
    }
};

window.deleteSemester = (id) => {
    showConfirm('Bạn có chắc muốn xóa học kỳ này?', async () => {
        try {
            await deleteDoc(doc(hocKyCol, id));
            showAlert('Xóa học kỳ thành công!', true);
        } catch (error) {
            showAlert(`Lỗi khi xóa học kỳ: ${error.message}`);
        }
    });
};

// --- Subject (Môn học) Management ---
function renderSubjectsList() {
    const listBody = document.getElementById('subjects-list-body');
    listBody.innerHTML = '';
    subjects.forEach(subject => {
        const row = document.createElement('tr');
        row.className = "border-b";
        row.innerHTML = `
            <td class="px-4 py-2">${subject.tenMonHoc}</td>
            <td class="px-4 py-2">${subject.maHocPhan}</td>
            <td class="px-4 py-2 text-center">${subject.soTinChi}</td>
            <td class="px-4 py-2 text-center">
                <button class="text-blue-500 mr-2" onclick="window.editSubject('${subject.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="text-red-500" onclick="window.deleteSubject('${subject.id}')" title="Xóa"><i class="fas fa-trash"></i></button>
            </td>
        `;
        listBody.appendChild(row);
    });
}

function clearSubjectForm() {
    document.getElementById('subject-form').reset();
    document.getElementById('subject-id').value = '';
}

window.editSubject = (id) => {
    const subject = subjects.find(s => s.id === id);
    if (subject) {
        document.getElementById('subject-id').value = subject.id;
        document.getElementById('subject-name').value = subject.tenMonHoc;
        document.getElementById('subject-code').value = subject.maHocPhan;
        document.getElementById('subject-credits').value = subject.soTinChi;
    }
};

window.deleteSubject = (id) => {
    showConfirm('Bạn có chắc muốn xóa môn học này?', async () => {
        try {
            await deleteDoc(doc(monHocCol, id));
            showAlert('Xóa môn học thành công!', true);
        } catch (error) {
            showAlert(`Lỗi khi xóa môn học: ${error.message}`);
        }
    });
};

// --- Course Section (Lớp học phần) Management ---
function populateDropdownsForCSModal() {
    const semesterSelect = document.getElementById('cs-semester-select');
    const subjectSelect = document.getElementById('cs-subject-select');
    const departmentSelect = document.getElementById('cs-department-select');
    
    semesterSelect.innerHTML = '<option value="">-- Chọn học kỳ --</option>';
    semesters.forEach(s => {
        semesterSelect.innerHTML += `<option value="${s.id}">${s.tenHocKy}</option>`;
    });

    subjectSelect.innerHTML = '<option value="">-- Chọn môn học --</option>';
    subjects.forEach(s => {
        subjectSelect.innerHTML += `<option value="${s.id}">${s.tenMonHoc} (${s.maHocPhan})</option>`;
    });

    departmentSelect.innerHTML = '<option value="">-- Chọn khoa --</option>';
    departments.forEach(d => {
        departmentSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
    });
}

function populateLecturersByDepartment(departmentId) {
    const lecturerSelect = document.getElementById('cs-lecturer-select');
    lecturerSelect.innerHTML = '<option value="">-- Chọn giảng viên --</option>';
    
    if (!departmentId) {
        lecturerSelect.disabled = true;
        return;
    }

    const filteredLecturers = lecturers.filter(l => l.departmentId === departmentId);
    filteredLecturers.forEach(l => {
        lecturerSelect.innerHTML += `<option value="${l.id}">${l.name} (${l.code})</option>`;
    });
    lecturerSelect.disabled = false;
}

function renderCourseSectionsList() {
    const listBody = document.getElementById('course-sections-list-body');
    listBody.innerHTML = '';
    courseSections.forEach(cs => {
        const subject = subjects.find(s => s.id === cs.monHocId);
        const lecturer = lecturers.find(l => l.id === cs.giangVienId);
        const row = document.createElement('tr');
        row.className = "border-b";
        row.innerHTML = `
            <td class="px-4 py-2 font-semibold">${cs.maLop}</td>
            <td class="px-4 py-2">${subject ? subject.tenMonHoc : 'N/A'}</td>
            <td class="px-4 py-2">${lecturer ? lecturer.name : 'N/A'}</td>
            <td class="px-4 py-2 text-center">
                <button class="text-blue-500 mr-2" onclick="window.editCourseSection('${cs.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="text-red-500" onclick="window.deleteCourseSection('${cs.id}')" title="Xóa"><i class="fas fa-trash"></i></button>
            </td>
        `;
        listBody.appendChild(row);
    });
}

function clearCourseSectionForm() {
    document.getElementById('course-section-form').reset();
    document.getElementById('course-section-id').value = '';
    document.getElementById('cs-lecturer-select').disabled = true;
}

window.editCourseSection = (id) => {
    const cs = courseSections.find(c => c.id === id);
    if(cs) {
        const lecturer = lecturers.find(l => l.id === cs.giangVienId);
        const departmentId = lecturer ? lecturer.departmentId : '';

        document.getElementById('course-section-id').value = cs.id;
        document.getElementById('cs-semester-select').value = cs.hocKyId;
        document.getElementById('cs-subject-select').value = cs.monHocId;
        document.getElementById('cs-code').value = cs.maLop;
        document.getElementById('cs-size').value = cs.siSo;
        
        // Set department and trigger change to populate lecturers
        const departmentSelect = document.getElementById('cs-department-select');
        departmentSelect.value = departmentId;
        departmentSelect.dispatchEvent(new Event('change'));

        // Set lecturer after the list is populated
        document.getElementById('cs-lecturer-select').value = cs.giangVienId; 
    }
};

window.deleteCourseSection = (id) => {
    showConfirm('Bạn có chắc muốn xóa lớp học phần này?', async () => {
        try {
            await deleteDoc(doc(lopHocPhanCol, id));
            showAlert('Xóa lớp học phần thành công!', true);
        } catch (error) {
            showAlert(`Lỗi khi xóa: ${error.message}`);
        }
    });
};


// --- Event Listeners and Initial Setup ---
function addEventListeners() {
    // Semester listeners
    document.getElementById('manage-semesters-btn').addEventListener('click', () => {
        clearSemesterForm();
        window.openModal('manage-semesters-modal');
    });
    document.getElementById('semester-year-select').addEventListener('change', updateSemesterName);
    document.getElementById('semester-term-select').addEventListener('change', updateSemesterName);
    document.getElementById('semester-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const id = document.getElementById('semester-id').value;
        const data = {
            tenHocKy: document.getElementById('semester-name').value.trim(),
            namHoc: document.getElementById('semester-year-select').value,
            hocKy: document.getElementById('semester-term-select').value,
            ngayBatDau: document.getElementById('semester-start-date').value,
            soTuanHoc: parseInt(document.getElementById('semester-weeks').value, 10),
        };
        try {
            if (id) { await updateDoc(doc(hocKyCol, id), data); } else { await addDoc(hocKyCol, data); }
            clearSemesterForm();
        } catch (error) { showAlert(`Lỗi khi lưu học kỳ: ${error.message}`); } finally { setButtonLoading(btn, false); }
    });
    document.getElementById('clear-semester-form-btn').addEventListener('click', clearSemesterForm);

    // Subject listeners
    document.getElementById('manage-subjects-btn').addEventListener('click', () => {
        clearSubjectForm();
        window.openModal('manage-subjects-modal');
    });
    document.getElementById('subject-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const id = document.getElementById('subject-id').value;
        const data = {
            tenMonHoc: document.getElementById('subject-name').value.trim(),
            maHocPhan: document.getElementById('subject-code').value.trim(),
            soTinChi: parseFloat(document.getElementById('subject-credits').value),
        };
        try {
            if (id) { await updateDoc(doc(monHocCol, id), data); } else { await addDoc(monHocCol, data); }
            clearSubjectForm();
        } catch (error) { showAlert(`Lỗi khi lưu môn học: ${error.message}`); } finally { setButtonLoading(btn, false); }
    });
    document.getElementById('clear-subject-form-btn').addEventListener('click', clearSubjectForm);

    // Course Section listeners
    document.getElementById('manage-course-sections-btn').addEventListener('click', () => {
        clearCourseSectionForm();
        populateDropdownsForCSModal();
        window.openModal('manage-course-sections-modal');
    });
    document.getElementById('cs-department-select').addEventListener('change', (e) => {
        populateLecturersByDepartment(e.target.value);
    });
    document.getElementById('course-section-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const id = document.getElementById('course-section-id').value;
        const data = {
            hocKyId: document.getElementById('cs-semester-select').value,
            monHocId: document.getElementById('cs-subject-select').value,
            maLop: document.getElementById('cs-code').value.trim(),
            siSo: parseInt(document.getElementById('cs-size').value, 10),
            giangVienId: document.getElementById('cs-lecturer-select').value,
        };
        try {
            if (id) { await updateDoc(doc(lopHocPhanCol, id), data); } else { await addDoc(lopHocPhanCol, data); }
            clearCourseSectionForm();
        } catch (error) { showAlert(`Lỗi khi lưu lớp học phần: ${error.message}`); } finally { setButtonLoading(btn, false); }
    });
    document.getElementById('clear-cs-form-btn').addEventListener('click', clearCourseSectionForm);
}

function setupOnSnapshotListeners() {
    onSnapshot(hocKyCol, (snapshot) => {
        semesters = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        semesters.sort((a, b) => {
            if (a.namHoc > b.namHoc) return -1;
            if (a.namHoc < b.namHoc) return 1;
            if (a.hocKy > b.hocKy) return -1;
            if (a.hocKy < b.hocKy) return 1;
            return 0;
        });
        renderSemestersList();
    }, (error) => console.error("Error listening to semesters collection:", error));

    onSnapshot(monHocCol, (snapshot) => {
        subjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        subjects.sort((a, b) => a.tenMonHoc.localeCompare(b.tenMonHoc));
        renderSubjectsList();
    }, (error) => console.error("Error listening to subjects collection:", error));

    onSnapshot(lopHocPhanCol, (snapshot) => {
        courseSections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCourseSectionsList();
    }, (error) => console.error("Error listening to course sections collection:", error));
    
    onSnapshot(departmentsCol, (snapshot) => {
        departments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }, (error) => console.error("Error listening to departments collection:", error));

    onSnapshot(lecturersCol, (snapshot) => {
        lecturers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }, (error) => console.error("Error listening to lecturers collection:", error));
}

// --- Global Functions for Modals ---
window.openModal = (modalId) => document.getElementById(modalId).style.display = 'block';
window.closeModal = (modalId) => document.getElementById(modalId).style.display = 'none';
window.onclick = (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
    }
};

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('Trang Sắp xếp Lịch giảng dạy đang được tải và kiểm tra đăng nhập...');
    injectStyles();
    initializeFirebase();
});
