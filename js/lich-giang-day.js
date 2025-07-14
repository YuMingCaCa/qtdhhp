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
let hocKyCol, monHocCol, lopHocPhanCol, lopChinhQuyCol, nganhHocCol, phongHocCol;
let departmentsCol, lecturersCol;

async function initializeFirebase() {
    // IMPORTANT: Replace with your actual Firebase config
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
        phongHocCol = collection(db, `${basePath}/schedule_PhongHoc`);
        lopHocPhanCol = collection(db, `${basePath}/schedule_LopHocPhan`);
        lopChinhQuyCol = collection(db, `${basePath}/schedule_LopChinhQuy`);
        nganhHocCol = collection(db, `${basePath}/schedule_NganhHoc`);
        departmentsCol = collection(db, `${basePath}/departments`);
        lecturersCol = collection(db, `${basePath}/lecturers`);
        
        onAuthStateChanged(auth, (user) => {
            if (user) {
                document.getElementById('schedule-module-content').classList.remove('hidden');
                setupOnSnapshotListeners();
                addEventListeners();
                populateYearSelect();
                updateSemesterName();
                renderScheduleGrid();
            } else {
                console.log("User not authenticated. Redirecting to login page.");
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
let rooms = [];
let courseSections = [];
let departments = [];
let lecturers = [];
let officialClasses = [];
let majors = [];

// --- Schedule Grid Rendering ---
function renderScheduleGrid() {
    const grid = document.querySelector('.schedule-grid');
    const headers = grid.querySelectorAll('.grid-header');
    grid.innerHTML = '';
    headers.forEach(h => grid.appendChild(h));

    for (let i = 1; i <= 12; i++) {
        const timeCell = document.createElement('div');
        timeCell.classList.add('grid-cell', 'time-slot');
        timeCell.innerHTML = `Tiết ${i}<br>(${i + 6}:00 - ${i + 6}:50)`;
        grid.appendChild(timeCell);

        for (let j = 1; j <= 6; j++) {
            const dayCell = document.createElement('div');
            dayCell.classList.add('grid-cell');
            dayCell.dataset.day = j + 1;
            dayCell.dataset.period = i;
            grid.appendChild(dayCell);
        }
    }
}


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

// --- Subject (Môn học) Management (SIMPLIFIED) ---
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

// --- Room (Phòng học) Management ---
function renderRoomsList() {
    const listBody = document.getElementById('rooms-list-body');
    listBody.innerHTML = '';
    rooms.forEach(room => {
        const row = document.createElement('tr');
        row.className = "border-b";
        row.innerHTML = `
            <td class="px-4 py-2">${room.tenPhong}</td>
            <td class="px-4 py-2 text-center">${room.loaiPhong}</td>
            <td class="px-4 py-2 text-center">${room.sucChua}</td>
            <td class="px-4 py-2 text-center">
                <button class="text-blue-500 mr-2" onclick="window.editRoom('${room.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="text-red-500" onclick="window.deleteRoom('${room.id}')" title="Xóa"><i class="fas fa-trash"></i></button>
            </td>
        `;
        listBody.appendChild(row);
    });
}

function clearRoomForm() {
    document.getElementById('room-form').reset();
    document.getElementById('room-id').value = '';
}

window.editRoom = (id) => {
    const room = rooms.find(r => r.id === id);
    if (room) {
        document.getElementById('room-id').value = room.id;
        document.getElementById('room-name').value = room.tenPhong;
        document.getElementById('room-capacity').value = room.sucChua;
        document.getElementById('room-type').value = room.loaiPhong;
    }
};

window.deleteRoom = (id) => {
    showConfirm('Bạn có chắc muốn xóa phòng học này?', async () => {
        try {
            await deleteDoc(doc(phongHocCol, id));
            showAlert('Xóa phòng học thành công!', true);
        } catch (error) {
            showAlert(`Lỗi khi xóa phòng học: ${error.message}`);
        }
    });
};


// --- Major (Ngành học) Management ---
function renderMajorsList() {
    const listBody = document.getElementById('majors-list-body');
    listBody.innerHTML = '';
    majors.forEach(major => {
        const department = departments.find(d => d.id === major.departmentId);
        const row = document.createElement('tr');
        row.className = "border-b";
        row.innerHTML = `
            <td class="px-4 py-2">${major.tenNganh}</td>
            <td class="px-4 py-2">${department ? department.name : 'N/A'}</td>
            <td class="px-4 py-2 text-center">
                <button class="text-blue-500 mr-2" onclick="window.editMajor('${major.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="text-red-500" onclick="window.deleteMajor('${major.id}')" title="Xóa"><i class="fas fa-trash"></i></button>
            </td>
        `;
        listBody.appendChild(row);
    });
}

function clearMajorForm() {
    document.getElementById('major-form').reset();
    document.getElementById('major-id').value = '';
}

window.editMajor = (id) => {
    const major = majors.find(m => m.id === id);
    if (major) {
        document.getElementById('major-id').value = major.id;
        document.getElementById('major-name').value = major.tenNganh;
        document.getElementById('major-department-select').value = major.departmentId;
    }
};

window.deleteMajor = (id) => {
    showConfirm('Bạn có chắc muốn xóa ngành học này?', async () => {
        try {
            await deleteDoc(doc(nganhHocCol, id));
            showAlert('Xóa ngành học thành công!', true);
        } catch (error) {
            showAlert(`Lỗi khi xóa ngành học: ${error.message}`);
        }
    });
};


// --- Official Class (Lớp Chính Quy) Management ---
function renderOfficialClassesList() {
    const listBody = document.getElementById('official-classes-list-body');
    listBody.innerHTML = '';
    officialClasses.forEach(oc => {
        const major = majors.find(m => m.id === oc.majorId);
        const row = document.createElement('tr');
        row.className = "border-b";
        row.innerHTML = `
            <td class="px-4 py-2">${oc.maLopCQ}</td>
            <td class="px-4 py-2">${major ? major.tenNganh : 'N/A'}</td>
            <td class="px-4 py-2 text-center">${oc.siSo}</td>
            <td class="px-4 py-2 text-center">
                <button class="text-blue-500 mr-2" onclick="window.editOfficialClass('${oc.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="text-red-500" onclick="window.deleteOfficialClass('${oc.id}')" title="Xóa"><i class="fas fa-trash"></i></button>
            </td>
        `;
        listBody.appendChild(row);
    });
}

function clearOfficialClassForm() {
    document.getElementById('official-class-form').reset();
    document.getElementById('official-class-id').value = '';
}

window.editOfficialClass = (id) => {
    const oc = officialClasses.find(c => c.id === id);
    if (oc) {
        document.getElementById('official-class-id').value = oc.id;
        document.getElementById('oc-major-select').value = oc.majorId;
        document.getElementById('oc-code').value = oc.maLopCQ;
        document.getElementById('oc-size').value = oc.siSo;
    }
};

window.deleteOfficialClass = (id) => {
    showConfirm('Bạn có chắc muốn xóa lớp chính quy này?', async () => {
        try {
            await deleteDoc(doc(lopChinhQuyCol, id));
            showAlert('Xóa lớp thành công!', true);
        } catch (error) {
            showAlert(`Lỗi khi xóa lớp: ${error.message}`);
        }
    });
};


// --- Course Section (Lớp học phần) Management ---
function populateDropdownsForCSModal() {
    const semesterSelect = document.getElementById('cs-semester-select');
    const subjectSelect = document.getElementById('cs-subject-select');
    const departmentSelect = document.getElementById('cs-department-select');
    const officialClassSelect = document.getElementById('cs-official-class-select');
    
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
    
    officialClassSelect.innerHTML = '<option value="">-- Chọn lớp --</option>';
    officialClasses.forEach(oc => {
        officialClassSelect.innerHTML += `<option value="${oc.id}" data-size="${oc.siSo}">${oc.maLopCQ}</option>`;
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

function updateCourseSectionCode() {
    const subjectSelect = document.getElementById('cs-subject-select');
    const officialClassSelect = document.getElementById('cs-official-class-select');
    const codeInput = document.getElementById('cs-code');

    const selectedSubject = subjects.find(s => s.id === subjectSelect.value);
    const selectedOC = officialClasses.find(oc => oc.id === officialClassSelect.value);

    if (selectedSubject && selectedOC) {
        codeInput.value = `${selectedSubject.maHocPhan}-${selectedOC.maLopCQ}`;
    } else {
        codeInput.value = '';
    }
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
            <td class="px-4 py-2 font-semibold">${cs.maLopHP}</td>
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
        document.getElementById('cs-official-class-select').value = cs.lopChinhQuyId;
        document.getElementById('cs-code').value = cs.maLopHP;
        
        const departmentSelect = document.getElementById('cs-department-select');
        departmentSelect.value = departmentId;
        departmentSelect.dispatchEvent(new Event('change'));

        setTimeout(() => {
            document.getElementById('cs-lecturer-select').value = cs.giangVienId; 
        }, 100);
    }
};

window.deleteCourseSection = (id) => {
    showConfirm('Bạn có chắc muốn xóa phân công này?', async () => {
        try {
            await deleteDoc(doc(lopHocPhanCol, id));
            showAlert('Xóa phân công thành công!', true);
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

    // Subject listeners (SIMPLIFIED)
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

    // Room listeners
    document.getElementById('manage-rooms-btn').addEventListener('click', () => {
        clearRoomForm();
        window.openModal('manage-rooms-modal');
    });
    document.getElementById('room-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const id = document.getElementById('room-id').value;
        const data = {
            tenPhong: document.getElementById('room-name').value.trim(),
            sucChua: parseInt(document.getElementById('room-capacity').value, 10),
            loaiPhong: document.getElementById('room-type').value,
        };
        try {
            if (id) { await updateDoc(doc(phongHocCol, id), data); } else { await addDoc(phongHocCol, data); }
            clearRoomForm();
        } catch (error) { showAlert(`Lỗi khi lưu phòng học: ${error.message}`); } finally { setButtonLoading(btn, false); }
    });
    document.getElementById('clear-room-form-btn').addEventListener('click', clearRoomForm);


    // Major listeners
    document.getElementById('manage-majors-btn').addEventListener('click', () => {
        const departmentSelect = document.getElementById('major-department-select');
        departmentSelect.innerHTML = '<option value="">-- Chọn Khoa --</option>';
        departments.forEach(d => {
            departmentSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
        });
        clearMajorForm();
        window.openModal('manage-majors-modal');
    });
    document.getElementById('major-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const id = document.getElementById('major-id').value;
        const data = {
            tenNganh: document.getElementById('major-name').value.trim(),
            departmentId: document.getElementById('major-department-select').value,
        };
        try {
            if (id) { await updateDoc(doc(nganhHocCol, id), data); } else { await addDoc(nganhHocCol, data); }
            clearMajorForm();
        } catch (error) { showAlert(`Lỗi khi lưu ngành: ${error.message}`); } finally { setButtonLoading(btn, false); }
    });
    document.getElementById('clear-major-form-btn').addEventListener('click', clearMajorForm);


    // Official Class listeners
    document.getElementById('manage-official-classes-btn').addEventListener('click', () => {
        const majorSelect = document.getElementById('oc-major-select');
        majorSelect.innerHTML = '<option value="">-- Chọn Ngành --</option>';
        majors.forEach(m => {
            majorSelect.innerHTML += `<option value="${m.id}">${m.tenNganh}</option>`;
        });
        clearOfficialClassForm();
        window.openModal('manage-official-classes-modal');
    });
    document.getElementById('official-class-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const id = document.getElementById('official-class-id').value;
        const data = {
            maLopCQ: document.getElementById('oc-code').value.trim(),
            siSo: parseInt(document.getElementById('oc-size').value, 10),
            majorId: document.getElementById('oc-major-select').value,
        };
        try {
            if (id) { await updateDoc(doc(lopChinhQuyCol, id), data); } else { await addDoc(lopChinhQuyCol, data); }
            clearOfficialClassForm();
        } catch (error) { showAlert(`Lỗi khi lưu lớp: ${error.message}`); } finally { setButtonLoading(btn, false); }
    });
    document.getElementById('clear-oc-form-btn').addEventListener('click', clearOfficialClassForm);


    // Course Section listeners
    document.getElementById('manage-course-sections-btn').addEventListener('click', () => {
        clearCourseSectionForm();
        populateDropdownsForCSModal();
        window.openModal('manage-course-sections-modal');
    });
    document.getElementById('cs-department-select').addEventListener('change', (e) => {
        populateLecturersByDepartment(e.target.value);
    });
    document.getElementById('cs-subject-select').addEventListener('change', updateCourseSectionCode);
    document.getElementById('cs-official-class-select').addEventListener('change', updateCourseSectionCode);
    document.getElementById('course-section-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const id = document.getElementById('course-section-id').value;
        const data = {
            hocKyId: document.getElementById('cs-semester-select').value,
            monHocId: document.getElementById('cs-subject-select').value,
            lopChinhQuyId: document.getElementById('cs-official-class-select').value,
            maLopHP: document.getElementById('cs-code').value.trim(),
            giangVienId: document.getElementById('cs-lecturer-select').value,
        };
        try {
            if (id) { await updateDoc(doc(lopHocPhanCol, id), data); } else { await addDoc(lopHocPhanCol, data); }
            clearCourseSectionForm();
        } catch (error) { showAlert(`Lỗi khi lưu phân công: ${error.message}`); } finally { setButtonLoading(btn, false); }
    });
    document.getElementById('clear-cs-form-btn').addEventListener('click', clearCourseSectionForm);
}

// --- Data Snapshot Listeners (FIXED) ---
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
        renderCourseSectionsList(); // Re-render dependent list
    }, (error) => console.error("Error listening to subjects collection:", error));
    
    onSnapshot(phongHocCol, (snapshot) => {
        rooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        rooms.sort((a, b) => a.tenPhong.localeCompare(b.tenPhong));
        renderRoomsList();
    }, (error) => console.error("Error listening to rooms collection:", error));

    onSnapshot(nganhHocCol, (snapshot) => {
        majors = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        majors.sort((a, b) => a.tenNganh.localeCompare(b.tenNganh));
        renderMajorsList();
        renderOfficialClassesList(); // Re-render dependent list
    }, (error) => console.error("Error listening to majors collection:", error));

    onSnapshot(lopChinhQuyCol, (snapshot) => {
        officialClasses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        officialClasses.sort((a, b) => a.maLopCQ.localeCompare(b.maLopCQ));
        renderOfficialClassesList();
        renderCourseSectionsList(); // Re-render dependent list
    }, (error) => console.error("Error listening to official classes collection:", error));

    onSnapshot(lopHocPhanCol, (snapshot) => {
        courseSections = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCourseSectionsList();
    }, (error) => console.error("Error listening to course sections collection:", error));
    
    onSnapshot(departmentsCol, (snapshot) => {
        departments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderMajorsList(); // Re-render dependent list
    }, (error) => console.error("Error listening to departments collection:", error));

    onSnapshot(lecturersCol, (snapshot) => {
        lecturers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCourseSectionsList(); // Re-render dependent list
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
