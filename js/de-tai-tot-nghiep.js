// File: js/de-tai-tot-nghiep.js
// Logic for the "Graduation Thesis Management" module.
// UPDATED: Added 'notes' and 'studentCount' to internship locations and created a new detailed print format.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, getDoc, setDoc, getDocs, updateDoc, deleteDoc, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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

function getCurrentAcademicYear() {
    const d = new Date();
    const year = d.getFullYear();
    const month = d.getMonth();
    return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

// --- Firebase Initialization ---
let db, auth;
let topicsCol, lecturersCol, departmentsCol, usersCol, settingsCol, studentsCol, internshipLocationsCol;
let currentUserInfo = null;

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
        
        topicsCol = collection(db, `${basePath}/thesis_topics`);
        lecturersCol = collection(db, `${basePath}/lecturers`);
        departmentsCol = collection(db, `${basePath}/departments`);
        usersCol = collection(db, `${basePath}/users`);
        settingsCol = collection(db, `${basePath}/settings`);
        studentsCol = collection(db, `${basePath}/students`);
        internshipLocationsCol = collection(db, `${basePath}/internship_locations`);
        
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userDoc = await getDocs(query(usersCol, where("email", "==", user.email)));
                if (!userDoc.empty) {
                    currentUserInfo = { uid: user.uid, ...userDoc.docs[0].data() };
                } else {
                    currentUserInfo = { uid: user.uid, email: user.email, role: 'viewer' };
                }
                
                document.getElementById('thesis-module-content').classList.remove('hidden');
                setupOnSnapshotListeners();
                addEventListeners();
                updateUIForRole();
            } else {
                window.location.href = 'index.html';
            }
        });

    } catch (error) {
        console.error("Firebase initialization error in thesis module:", error);
        showAlert("Không thể kết nối đến cơ sở dữ liệu cho module Quản lý Đề tài.");
    }
}

// --- Global State ---
let allTopics = [];
let allLecturers = [];
let allDepartments = [];
let allStudents = [];
let allInternshipLocations = [];
let academicYears = [];

// --- UI Rendering & Logic ---

function updateUIForRole() {
    if (!currentUserInfo) return;
    const isAdmin = currentUserInfo.role === 'admin';

    document.querySelectorAll('.admin-only').forEach(el => {
        if (el.id === 'import-menu-dropdown' || el.id === 'print-menu-dropdown') {
            if (!isAdmin) {
                el.style.display = 'none';
            }
            return; 
        }

        if (el.classList.contains('relative')) {
             el.style.display = isAdmin ? 'inline-block' : 'none';
        } 
        else if (el.tagName === 'BUTTON') {
             el.style.display = isAdmin ? 'flex' : 'none';
        }
        else if (el.tagName === 'FIELDSET') {
            el.style.display = isAdmin ? 'block' : 'none';
            el.disabled = !isAdmin;
        }
        else {
            el.style.display = isAdmin ? 'block' : 'none';
        }
    });
}


function getStatusBadge(status) {
    switch (status) {
        case 'pending': return `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Chờ duyệt</span>`;
        case 'approved': return `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Đã duyệt</span>`;
        case 'taken': return `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">Đã có SV</span>`;
        case 'rejected': return `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Bị từ chối</span>`;
        default: return `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Không rõ</span>`;
    }
}

function renderTopicsList() {
    const listBody = document.getElementById('topics-list-body');
    listBody.innerHTML = '';

    const depFilter = document.getElementById('filter-department').value;
    const lecFilter = document.getElementById('filter-lecturer').value;
    const statusFilter = document.getElementById('filter-status').value;
    const isAdmin = currentUserInfo.role === 'admin';

    const filteredTopics = allTopics.filter(topic => {
        if (depFilter !== 'all' && topic.departmentId !== depFilter) return false;
        if (lecFilter !== 'all' && topic.lecturerId !== lecFilter) return false;
        if (statusFilter !== 'all' && topic.status !== statusFilter) return false;
        return true;
    });

    if (filteredTopics.length === 0) {
        listBody.innerHTML = `<tr><td colspan="4" class="text-center p-6 text-gray-500">Không có đề tài nào phù hợp với bộ lọc.</td></tr>`;
        return;
    }

    filteredTopics.forEach(topic => {
        const row = document.createElement('tr');
        const lecturer = allLecturers.find(l => l.id === topic.lecturerId);
        
        let studentInfoHtml = '';
        if (topic.status === 'taken' && topic.studentName) {
            studentInfoHtml = `
                <div class="mt-2 text-xs text-gray-500 space-y-1">
                    <div><span class="font-semibold text-blue-600">SV:</span> ${topic.studentName}</div>
                    <div><span class="font-semibold text-blue-600">MSV:</span> ${topic.studentId || 'N/A'} - <span class="font-semibold text-blue-600">Lớp:</span> ${topic.studentClass || 'N/A'}</div>
                    <div><span class="font-semibold text-purple-600">Nơi TT:</span> ${topic.internshipLocation || 'Chưa cập nhật'}</div>
                </div>`;
        }
        
        let actionButtonHtml = '';
        if (isAdmin) {
            actionButtonHtml = `
                <button class="text-indigo-600 hover:text-indigo-900 mr-3" onclick="window.editTopic('${topic.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="text-red-600 hover:text-red-900" onclick="window.deleteTopic('${topic.id}')" title="Xóa"><i class="fas fa-trash"></i></button>
            `;
        } else {
            if (topic.status === 'approved') {
                 actionButtonHtml = `<button class="bg-green-500 hover:bg-green-600 text-white font-bold py-1 px-3 rounded-full text-xs" onclick="window.openRegisterModal('${topic.id}')">Đăng ký</button>`;
            } else if (topic.status === 'taken') {
                if (topic.registeredByUid === currentUserInfo.uid) {
                    actionButtonHtml = `<span class="text-xs text-gray-500 italic">Bạn đã đăng ký</span>`;
                } else {
                    actionButtonHtml = `<span class="text-xs text-gray-500 italic">Đã có người ĐK</span>`;
                }
            } else {
                actionButtonHtml = `<span class="text-gray-400 cursor-not-allowed" title="Không thể đăng ký đề tài này"><i class="fas fa-ban"></i></span>`;
            }
        }

        row.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold text-gray-900">${topic.name}</div>
                <div class="text-sm text-gray-500 truncate">${topic.description}</div>
                ${studentInfoHtml}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">${lecturer ? lecturer.name : 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center">${getStatusBadge(topic.status)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center no-print">
                ${actionButtonHtml}
            </td>
        `;
        listBody.appendChild(row);
    });
}

function populateFilterDropdowns() {
    const depSelect = document.getElementById('filter-department');
    
    depSelect.innerHTML = '<option value="all">Tất cả Khoa</option>';
    allDepartments.forEach(dep => {
        depSelect.innerHTML += `<option value="${dep.id}">${dep.name}</option>`;
    });

    updateLecturerFilterDropdown('all');
}

function updateLecturerFilterDropdown(departmentId) {
    const lecSelect = document.getElementById('filter-lecturer');
    lecSelect.innerHTML = '<option value="all">Tất cả Giảng viên</option>';

    let lecturersToList = allLecturers;
    if (departmentId && departmentId !== 'all') {
        lecturersToList = allLecturers.filter(l => l.departmentId === departmentId);
    }

    lecturersToList.forEach(lec => {
        lecSelect.innerHTML += `<option value="${lec.id}">${lec.name}</option>`;
    });
}

function populateModalDropdowns() {
    const yearSelect = document.getElementById('topic-year-select');
    const depSelect = document.getElementById('topic-department-select');

    yearSelect.innerHTML = '';
    academicYears.forEach(year => {
        yearSelect.innerHTML += `<option value="${year}">Năm học ${year}</option>`;
    });
    yearSelect.value = getCurrentAcademicYear();

    depSelect.innerHTML = '<option value="">-- Chọn Khoa --</option>';
    allDepartments.forEach(dep => {
        depSelect.innerHTML += `<option value="${dep.id}">${dep.name}</option>`;
    });
}

function updateLecturerDropdownInModal(departmentId) {
    const lecSelect = document.getElementById('topic-lecturer-select');
    lecSelect.innerHTML = '<option value="">-- Chọn giảng viên --</option>';
    const filteredLecturers = allLecturers.filter(l => l.departmentId === departmentId);
    filteredLecturers.forEach(lec => {
        lecSelect.innerHTML += `<option value="${lec.id}">${lec.name}</option>`;
    });
}

function clearTopicForm() {
    const form = document.getElementById('topic-form');
    form.reset();
    document.getElementById('topic-id').value = '';
    document.getElementById('topic-modal-title').textContent = 'Đề xuất Đề tài mới';
    updateLecturerDropdownInModal('');
}

// --- CRUD Functions (exposed to window for onclick) ---
window.editTopic = (id) => {
    const topic = allTopics.find(t => t.id === id);
    if (topic) {
        populateModalDropdowns();
        document.getElementById('topic-id').value = topic.id;
        document.getElementById('topic-name').value = topic.name;
        document.getElementById('topic-description').value = topic.description;
        document.getElementById('topic-year-select').value = topic.academicYear || '';
        document.getElementById('topic-department-select').value = topic.departmentId || '';
        
        updateLecturerDropdownInModal(topic.departmentId);
        document.getElementById('topic-lecturer-select').value = topic.lecturerId;
        document.getElementById('topic-status-select').value = topic.status;
        
        document.getElementById('topic-modal-title').textContent = 'Chỉnh sửa Đề tài';
        openModal('topic-modal');
    }
};

window.deleteTopic = (id) => {
    showConfirm('Bạn có chắc muốn xóa đề tài này? Hành động này không thể hoàn tác.', async () => {
        try {
            await deleteDoc(doc(topicsCol, id));
            showAlert('Xóa đề tài thành công!', true);
        } catch (error) {
            showAlert(`Lỗi khi xóa đề tài: ${error.message}`);
            console.error("Error deleting topic: ", error);
        }
    });
};

window.openRegisterModal = (id) => {
    const topic = allTopics.find(t => t.id === id);
    if (topic) {
        document.getElementById('register-topic-id').value = id;
        document.getElementById('register-topic-name').textContent = topic.name;
        
        const locationSelect = document.getElementById('student-internship-location');
        locationSelect.innerHTML = '<option value="">-- Chọn cơ sở thực tập --</option>';
        allInternshipLocations.forEach(loc => {
            locationSelect.innerHTML += `<option value="${loc.name}">${loc.name}</option>`;
        });

        document.getElementById('student-register-form').reset();
        openModal('student-register-modal');
    }
};

// --- Import/Export & Print Functions ---
function downloadTemplateForTopics() {
    const headers = ["tenDeTai", "moTa", "tenKhoa", "maGiangVien"];
    const filename = "Mau_Import_DeTai.xlsx";
    const ws = XLSX.utils.json_to_sheet([{}], { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, filename);
}

function downloadTemplateForStudents() {
    const headers = ["maSV", "hoTen", "ngaySinh", "lop", "tenKhoa", "khoaHoc"];
    const filename = "Mau_Import_SinhVien.xlsx";
    const ws = XLSX.utils.json_to_sheet([{}], { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, filename);
}

function downloadTemplateForInternshipLocations() {
    // UPDATED: Added new fields to the template
    const headers = ["tenCoSo", "diaChi", "soDienThoai", "ghiChu", "soSinhVien"];
    const filename = "Mau_Import_CoSoThucTap.xlsx";
    const ws = XLSX.utils.json_to_sheet([{}], { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, filename);
}

async function handleTopicImport() {
    const btn = document.getElementById('start-import-btn');
    setButtonLoading(btn, true);
    const fileInput = document.getElementById('import-file-input');
    const logContainer = document.getElementById('import-log');
    const resultsContainer = document.getElementById('import-results-container');
    resultsContainer.classList.remove('hidden');
    logContainer.innerHTML = 'Bắt đầu...<br>';
    if (!fileInput.files || fileInput.files.length === 0) {
        showAlert("Vui lòng chọn file.");
        setButtonLoading(btn, false);
        return;
    }
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if (jsonData.length === 0) {
                logContainer.innerHTML += '<span class="text-red-500">Lỗi: File trống.</span><br>';
                setButtonLoading(btn, false);
                return;
            }
            logContainer.innerHTML += `Đã đọc ${jsonData.length} dòng. Đang xử lý...<br>`;
            const batch = writeBatch(db);
            let successCount = 0, errorCount = 0;
            const currentYear = getCurrentAcademicYear();
            for (const [index, row] of jsonData.entries()) {
                try {
                    const tenDeTai = String(row.tenDeTai || '').trim();
                    const moTa = String(row.moTa || '').trim();
                    const tenKhoa = String(row.tenKhoa || '').trim().toLowerCase();
                    const maGiangVien = String(row.maGiangVien || '').trim().toLowerCase();
                    if (!tenDeTai || !tenKhoa || !maGiangVien) throw new Error("Thiếu Tên đề tài, Tên khoa, hoặc Mã GV.");
                    const department = allDepartments.find(d => d.name.toLowerCase() === tenKhoa);
                    if (!department) throw new Error(`Không tìm thấy khoa "${row.tenKhoa}"`);
                    const lecturer = allLecturers.find(l => l.code.toLowerCase() === maGiangVien);
                    if (!lecturer) throw new Error(`Không tìm thấy GV có mã "${row.maGiangVien}"`);
                    if (lecturer.departmentId !== department.id) throw new Error(`GV "${lecturer.name}" không thuộc khoa "${department.name}"`);
                    const newTopicData = { name: tenDeTai, description: moTa, academicYear: currentYear, departmentId: department.id, lecturerId: lecturer.id, status: 'pending', proposerUid: currentUserInfo.uid, createdAt: new Date().toISOString(), lastUpdated: new Date().toISOString() };
                    batch.set(doc(topicsCol), newTopicData);
                    successCount++;
                } catch (rowError) {
                    errorCount++;
                    logContainer.innerHTML += `<span class="text-orange-500">- Dòng ${index + 2}: Lỗi - ${rowError.message}</span><br>`;
                }
            }
            if (successCount > 0) await batch.commit();
            logContainer.innerHTML += `<hr class="my-2"><strong class="text-green-600">Hoàn thành!</strong><br><span>- Thành công: ${successCount}.</span><br><span>- Lỗi: ${errorCount}.</span><br>`;
        } catch (error) {
            logContainer.innerHTML += `<span class="text-red-500">Lỗi nghiêm trọng: ${error.message}</span><br>`;
        } finally {
            setButtonLoading(btn, false);
            fileInput.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

async function handleStudentImport() {
    const btn = document.getElementById('start-student-import-btn');
    setButtonLoading(btn, true);
    const fileInput = document.getElementById('import-student-file-input');
    const logContainer = document.getElementById('import-student-log');
    const resultsContainer = document.getElementById('import-student-results-container');
    resultsContainer.classList.remove('hidden');
    logContainer.innerHTML = 'Bắt đầu...<br>';
    if (!fileInput.files || fileInput.files.length === 0) {
        showAlert("Vui lòng chọn file.");
        setButtonLoading(btn, false);
        return;
    }
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if (jsonData.length === 0) {
                logContainer.innerHTML += '<span class="text-red-500">Lỗi: File trống.</span><br>';
                setButtonLoading(btn, false);
                return;
            }
            logContainer.innerHTML += `Đã đọc ${jsonData.length} dòng. Đang xử lý...<br>`;
            const batch = writeBatch(db);
            let successCount = 0, updateCount = 0, errorCount = 0;
            for (const [index, row] of jsonData.entries()) {
                try {
                    const studentId = String(row.maSV || '').trim();
                    const studentName = String(row.hoTen || '').trim();
                    const dateOfBirth = String(row.ngaySinh || '').trim();
                    const studentClass = String(row.lop || '').trim();
                    const departmentName = String(row.tenKhoa || '').trim().toLowerCase();
                    const course = String(row.khoaHoc || '').trim();
                    if (!studentId || !studentName || !departmentName) throw new Error("Thiếu Mã SV, Họ tên, hoặc Tên Khoa.");
                    const department = allDepartments.find(d => d.name.toLowerCase() === departmentName);
                    if (!department) throw new Error(`Không tìm thấy khoa "${row.tenKhoa}"`);
                    const studentData = { studentId, name: studentName, dateOfBirth, class: studentClass, departmentId: department.id, course, lastUpdated: new Date().toISOString() };
                    const existingDocs = await getDocs(query(studentsCol, where("studentId", "==", studentId)));
                    if (!existingDocs.empty) {
                        batch.update(existingDocs.docs[0].ref, studentData);
                        updateCount++;
                    } else {
                        batch.set(doc(studentsCol), studentData);
                        successCount++;
                    }
                } catch (rowError) {
                    errorCount++;
                    logContainer.innerHTML += `<span class="text-orange-500">- Dòng ${index + 2}: Lỗi - ${rowError.message}</span><br>`;
                }
            }
            if (successCount > 0 || updateCount > 0) await batch.commit();
            logContainer.innerHTML += `<hr class="my-2"><strong class="text-green-600">Hoàn thành!</strong><br><span>- Thêm mới: ${successCount}.</span><br><span class="text-blue-600">- Cập nhật: ${updateCount}.</span><br><span>- Lỗi: ${errorCount}.</span><br>`;
        } catch (error) {
            logContainer.innerHTML += `<span class="text-red-500">Lỗi nghiêm trọng: ${error.message}</span><br>`;
        } finally {
            setButtonLoading(btn, false);
            fileInput.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

async function handleInternshipLocationImport() {
    const btn = document.getElementById('start-location-import-btn');
    setButtonLoading(btn, true);
    const fileInput = document.getElementById('import-location-file-input');
    const logContainer = document.getElementById('import-location-log');
    const resultsContainer = document.getElementById('import-location-results-container');
    resultsContainer.classList.remove('hidden');
    logContainer.innerHTML = 'Bắt đầu...<br>';
    if (!fileInput.files || fileInput.files.length === 0) {
        showAlert("Vui lòng chọn file.");
        setButtonLoading(btn, false);
        return;
    }
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            if (jsonData.length === 0) {
                logContainer.innerHTML += '<span class="text-red-500">Lỗi: File trống.</span><br>';
                setButtonLoading(btn, false);
                return;
            }
            logContainer.innerHTML += `Đã đọc ${jsonData.length} dòng. Đang xử lý...<br>`;
            const batch = writeBatch(db);
            let successCount = 0, updateCount = 0, errorCount = 0;
            for (const [index, row] of jsonData.entries()) {
                try {
                    const name = String(row.tenCoSo || '').trim();
                    const address = String(row.diaChi || '').trim();
                    const phone = String(row.soDienThoai || '').trim();
                    // UPDATED: Read new fields
                    const notes = String(row.ghiChu || '').trim();
                    const studentCount = parseInt(row.soSinhVien || 0, 10);

                    if (!name) throw new Error("Thiếu Tên cơ sở.");

                    const locationData = { name, address, phone, notes, studentCount };
                    const existingDocs = await getDocs(query(internshipLocationsCol, where("name", "==", name)));
                    if (!existingDocs.empty) {
                        batch.update(existingDocs.docs[0].ref, locationData);
                        updateCount++;
                    } else {
                        batch.set(doc(internshipLocationsCol), locationData);
                        successCount++;
                    }
                } catch (rowError) {
                    errorCount++;
                    logContainer.innerHTML += `<span class="text-orange-500">- Dòng ${index + 2}: Lỗi - ${rowError.message}</span><br>`;
                }
            }
            if (successCount > 0 || updateCount > 0) await batch.commit();
            logContainer.innerHTML += `<hr class="my-2"><strong class="text-green-600">Hoàn thành!</strong><br><span>- Thêm mới: ${successCount}.</span><br><span class="text-blue-600">- Cập nhật: ${updateCount}.</span><br><span>- Lỗi: ${errorCount}.</span><br>`;
        } catch (error) {
            logContainer.innerHTML += `<span class="text-red-500">Lỗi nghiêm trọng: ${error.message}</span><br>`;
        } finally {
            setButtonLoading(btn, false);
            fileInput.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

function generatePrintableList() {
    const yearFilter = document.getElementById('print-year-select').value;
    const depFilter = document.getElementById('print-department-select').value;
    const filteredTopics = allTopics.filter(t => (yearFilter && t.academicYear === yearFilter) && (depFilter === 'all' || t.departmentId === depFilter) && t.status === 'taken');
    if (filteredTopics.length === 0) {
        showAlert("Không có dữ liệu phù hợp để in.");
        return;
    }
    const departmentName = depFilter === 'all' ? 'Toàn trường' : allDepartments.find(d => d.id === depFilter)?.name || 'Không rõ';
    const title = `Danh sách Đề tài Tốt nghiệp và Nơi thực tập - Năm học ${yearFilter} - Khoa ${departmentName}`;
    let tableBodyHtml = filteredTopics.map((topic, index) => {
        const lecturer = allLecturers.find(l => l.id === topic.lecturerId);
        return `<tr><td style="text-align: center;">${index + 1}</td><td>${topic.name}</td><td>${lecturer ? lecturer.name : 'N/A'}</td><td>${topic.studentName || 'N/A'}</td><td style="text-align: center;">${topic.studentId || 'N/A'}</td><td style="text-align: center;">${topic.studentClass || 'N/A'}</td><td>${topic.internshipLocation || 'N/A'}</td></tr>`;
    }).join('');
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<html><head><title>${title}</title><style>body{font-family:'Times New Roman',serif;font-size:12pt}table{width:100%;border-collapse:collapse}th,td{border:1px solid black;padding:8px}th{font-weight:bold;text-align:center}.print-header{text-align:center;margin-bottom:20px}@media print{.no-print{display:none}}</style></head><body><div class="print-header"><h2>TRƯỜNG ĐẠI HỌC HẢI PHÒNG</h2><h3>${title.toUpperCase()}</h3></div><table><thead><tr><th>STT</th><th>Tên Đề tài</th><th>GVHD</th><th>Sinh viên</th><th>MSV</th><th>Lớp</th><th>Nơi thực tập</th></tr></thead><tbody>${tableBodyHtml}</tbody></table><button onclick="window.print()" class="no-print" style="margin-top:20px;padding:10px 20px;">In</button></body></html>`);
    printWindow.document.close();
}

function generateInternshipPrintableList() {
    const yearFilter = document.getElementById('print-year-select').value;
    const depFilter = document.getElementById('print-department-select').value;

    const filteredTopics = allTopics.filter(topic =>
        (yearFilter && topic.academicYear === yearFilter) &&
        (depFilter === 'all' || topic.departmentId === depFilter) &&
        topic.status === 'taken'
    );

    if (filteredTopics.length === 0) {
        showAlert("Không có dữ liệu phù hợp để in.");
        return;
    }

    const groupedByLocation = {};
    filteredTopics.forEach(topic => {
        const locationName = topic.internshipLocation || "Chưa xác định";
        if (!groupedByLocation[locationName]) {
            groupedByLocation[locationName] = [];
        }
        groupedByLocation[locationName].push(topic);
    });

    const departmentName = depFilter === 'all' ? 'Toàn trường' : allDepartments.find(d => d.id === depFilter)?.name || 'Không rõ';
    const title = `Danh sách Sinh viên Thực tập Tốt nghiệp - Năm học ${yearFilter} - Khoa ${departmentName}`;

    let tableBodyHtml = '';
    let stt = 1;
    for (const locationName in groupedByLocation) {
        const topicsInLocation = groupedByLocation[locationName];
        const locationDetails = allInternshipLocations.find(loc => loc.name === locationName) || {};
        
        topicsInLocation.forEach((topic, index) => {
            const student = allStudents.find(s => s.studentId === topic.studentId) || {};
            tableBodyHtml += `
                <tr>
                    <td style="text-align: center;">${stt++}</td>
                    <td>${topic.studentName || ''}</td>
                    <td style="text-align: center;">${student.dateOfBirth || ''}</td>
                    <td style="text-align: center;">${topic.studentClass || ''}</td>
                    ${index === 0 ? `<td rowspan="${topicsInLocation.length}">${locationName}</td>` : ''}
                    ${index === 0 ? `<td rowspan="${topicsInLocation.length}">${locationDetails.address || ''}</td>` : ''}
                    ${index === 0 ? `<td rowspan="${topicsInLocation.length}" style="text-align: center;">${locationDetails.phone || ''}</td>` : ''}
                </tr>
            `;
        });
    }

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<html><head><title>${title}</title><style>body{font-family:'Times New Roman',serif;font-size:12pt}table{width:100%;border-collapse:collapse}th,td{border:1px solid black;padding:8px;vertical-align:middle}th{font-weight:bold;text-align:center}.print-header{text-align:center;margin-bottom:20px}@media print{.no-print{display:none}}</style></head><body><div class="print-header"><h2>TRƯỜNG ĐẠI HỌC HẢI PHÒNG</h2><h3>${title.toUpperCase()}</h3></div><table><thead><tr><th rowspan="2">STT</th><th rowspan="2">Họ và tên</th><th rowspan="2">Ngày sinh</th><th rowspan="2">Lớp</th><th colspan="3">Cơ sở thực tập</th></tr><tr><th>Tên cơ sở TT</th><th>Địa chỉ cơ sở TT</th><th>Số ĐT</th></tr></thead><tbody>${tableBodyHtml}</tbody></table><button onclick="window.print()" class="no-print" style="margin-top:20px;padding:10px 20px;">In</button></body></html>`);
    printWindow.document.close();
}

// NEW: Generate detailed print list for internship locations
function generateDetailedInternshipPrintableList() {
    if (allInternshipLocations.length === 0) {
        showAlert("Không có dữ liệu cơ sở thực tập để in.");
        return;
    }
    const title = `Danh sách Cơ sở Thực tập Tốt nghiệp`;
    let tableBodyHtml = allInternshipLocations.map((loc, index) => `
        <tr>
            <td style="text-align: center;">${index + 1}</td>
            <td>${loc.name || ''}</td>
            <td>${loc.address || ''}</td>
            <td style="text-align: center;">${loc.phone || ''}</td>
            <td>${loc.notes || ''}</td>
            <td style="text-align: center;">${loc.studentCount || 0}</td>
        </tr>
    `).join('');

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<html><head><title>${title}</title><style>body{font-family:'Times New Roman',serif;font-size:12pt}table{width:100%;border-collapse:collapse}th,td{border:1px solid black;padding:8px;vertical-align:middle}th{font-weight:bold;text-align:center}.print-header{text-align:center;margin-bottom:20px}@media print{.no-print{display:none}}</style></head><body><div class="print-header"><h2>TRƯỜNG ĐẠI HỌC HẢI PHÒNG</h2><h3>${title.toUpperCase()}</h3></div><table><thead><tr><th>STT</th><th>Tên cơ sở thực tập</th><th>Địa chỉ</th><th>Điện thoại liên hệ</th><th>Ghi chú</th><th>Số sinh viên</th></tr></thead><tbody>${tableBodyHtml}</tbody></table><button onclick="window.print()" class="no-print" style="margin-top:20px;padding:10px 20px;">In</button></body></html>`);
    printWindow.document.close();
}


// --- Event Listeners ---
function addEventListeners() {
    document.getElementById('add-topic-btn').addEventListener('click', () => {
        clearTopicForm();
        populateModalDropdowns();
        openModal('topic-modal');
    });

    document.getElementById('topic-department-select').addEventListener('change', (e) => {
        updateLecturerDropdownInModal(e.target.value);
    });

    document.getElementById('topic-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('topic-id').value;
        const isAdmin = currentUserInfo.role === 'admin';
        const departmentId = document.getElementById('topic-department-select').value;
        const selfLecturer = allLecturers.find(l => l.code && currentUserInfo.email && l.code.toLowerCase() === currentUserInfo.email.split('@')[0].toLowerCase());
        const data = { name: document.getElementById('topic-name').value.trim(), description: document.getElementById('topic-description').value.trim(), academicYear: document.getElementById('topic-year-select').value, departmentId: departmentId, lecturerId: isAdmin ? document.getElementById('topic-lecturer-select').value : (selfLecturer ? selfLecturer.id : null), status: isAdmin ? document.getElementById('topic-status-select').value : 'pending', proposerUid: id ? allTopics.find(t=>t.id === id).proposerUid : currentUserInfo.uid, lastUpdated: new Date().toISOString() };
        if (!data.name || !data.academicYear || !data.departmentId) { showAlert("Vui lòng điền các trường bắt buộc."); return; }
        if (isAdmin && !data.lecturerId) { showAlert("Admin phải chọn giảng viên."); return; }
        if (!isAdmin && !data.lecturerId) { showAlert("Không thể xác định giảng viên đề xuất."); return; }
        try {
            if (id) {
                await updateDoc(doc(topicsCol, id), data);
                showAlert('Cập nhật thành công!', true);
            } else {
                data.createdAt = new Date().toISOString();
                await addDoc(topicsCol, data);
                showAlert('Đề xuất thành công!', true);
            }
            closeModal('topic-modal');
        } catch (error) { showAlert(`Lỗi: ${error.message}`); }
    });

    document.getElementById('student-register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const topicId = document.getElementById('register-topic-id').value;
        const studentName = document.getElementById('student-name').value.trim();
        const studentId = document.getElementById('student-id-input').value.trim();
        const studentClass = document.getElementById('student-class-input').value.trim();
        const internshipLocation = document.getElementById('student-internship-location').value;
        if (!studentName || !studentId || !studentClass || !internshipLocation) { showAlert("Vui lòng điền đầy đủ thông tin."); return; }
        const topic = allTopics.find(t => t.id === topicId);
        const lecturer = allLecturers.find(l => l.id === topic.lecturerId);
        if (lecturer) {
            const quota = lecturer.supervisionQuota || 5; 
            const currentTakenTopics = allTopics.filter(t => t.lecturerId === lecturer.id && t.status === 'taken').length;
            if (currentTakenTopics >= quota) { showAlert(`Giảng viên ${lecturer.name} đã đạt chỉ tiêu (${quota} SV).`); return; }
        }
        const updateData = { status: 'taken', studentName, studentId, studentClass, internshipLocation, registeredByUid: currentUserInfo.uid, registeredAt: new Date().toISOString() };
        try {
            await updateDoc(doc(topicsCol, topicId), updateData);
            showAlert('Đăng ký thành công!', true);
            closeModal('student-register-modal');
        } catch (error) { showAlert(`Lỗi: ${error.message}`); }
    });

    // Dropdown Menu Logic
    const printMenuBtn = document.getElementById('print-menu-btn');
    const printMenuDropdown = document.getElementById('print-menu-dropdown');
    const importMenuBtn = document.getElementById('import-menu-btn');
    const importMenuDropdown = document.getElementById('import-menu-dropdown');

    const setupDropdown = (btn, dropdown) => {
        btn.addEventListener('click', () => dropdown.classList.toggle('hidden'));
        window.addEventListener('click', (e) => {
            if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
    };
    setupDropdown(printMenuBtn, printMenuDropdown);
    setupDropdown(importMenuBtn, importMenuDropdown);

    // Import Listeners
    document.getElementById('import-topics-btn').addEventListener('click', (e) => { e.preventDefault(); openModal('import-data-modal'); importMenuDropdown.classList.add('hidden'); });
    document.getElementById('download-template-btn').addEventListener('click', downloadTemplateForTopics);
    document.getElementById('start-import-btn').addEventListener('click', handleTopicImport);
    
    document.getElementById('import-students-btn').addEventListener('click', (e) => { e.preventDefault(); openModal('import-students-modal'); importMenuDropdown.classList.add('hidden'); });
    document.getElementById('download-student-template-btn').addEventListener('click', downloadTemplateForStudents);
    document.getElementById('start-student-import-btn').addEventListener('click', handleStudentImport);

    document.getElementById('import-locations-btn').addEventListener('click', (e) => { e.preventDefault(); openModal('import-locations-modal'); importMenuDropdown.classList.add('hidden'); });
    document.getElementById('download-location-template-btn').addEventListener('click', downloadTemplateForInternshipLocations);
    document.getElementById('start-location-import-btn').addEventListener('click', handleInternshipLocationImport);

    // Filter listeners
    document.getElementById('filter-department').addEventListener('change', () => {
        updateLecturerFilterDropdown(document.getElementById('filter-department').value);
        renderTopicsList();
    });
    document.getElementById('filter-lecturer').addEventListener('change', renderTopicsList);
    document.getElementById('filter-status').addEventListener('change', renderTopicsList);

    // Print listeners
    const setupPrintModal = () => {
        const yearSelect = document.getElementById('print-year-select');
        const depSelect = document.getElementById('print-department-select');
        yearSelect.innerHTML = academicYears.map(y => `<option value="${y}" ${y === getCurrentAcademicYear() ? 'selected' : ''}>Năm học ${y}</option>`).join('');
        depSelect.innerHTML = '<option value="all">Tất cả Khoa</option>' + allDepartments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        openModal('print-modal');
    };
    
    document.getElementById('print-list-btn').addEventListener('click', (e) => {
        e.preventDefault();
        setupPrintModal();
        printMenuDropdown.classList.add('hidden');
        document.getElementById('print-form').onsubmit = (ev) => {
            ev.preventDefault();
            generatePrintableList();
            closeModal('print-modal');
        };
    });
    
    document.getElementById('print-location-list-btn').addEventListener('click', (e) => {
        e.preventDefault();
        setupPrintModal();
        printMenuDropdown.classList.add('hidden');
        document.getElementById('print-form').onsubmit = (ev) => {
            ev.preventDefault();
            generateInternshipPrintableList();
            closeModal('print-modal');
        };
    });

    document.getElementById('print-detailed-location-list-btn').addEventListener('click', (e) => {
        e.preventDefault();
        printMenuDropdown.classList.add('hidden');
        generateDetailedInternshipPrintableList();
    });
}

// --- Data Snapshot Listeners ---
function setupOnSnapshotListeners() {
    onSnapshot(doc(settingsCol, 'appSettings'), (docSnapshot) => {
        const customYears = docSnapshot.exists() ? (docSnapshot.data().customYears || []) : [];
        academicYears = Array.from(new Set([getCurrentAcademicYear(), ...customYears])).sort().reverse();
    }, (error) => console.error("Error listening to settings:", error));

    onSnapshot(query(departmentsCol), (snapshot) => {
        allDepartments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.name.localeCompare(b.name));
        populateFilterDropdowns();
        renderTopicsList();
    }, (error) => console.error("Error listening to departments:", error));

    onSnapshot(query(lecturersCol), (snapshot) => {
        allLecturers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.name.localeCompare(b.name));
        populateFilterDropdowns();
        renderTopicsList();
    }, (error) => console.error("Error listening to lecturers:", error));

    onSnapshot(query(topicsCol), (snapshot) => {
        allTopics = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        renderTopicsList();
    }, (error) => console.error("Error listening to topics:", error));

    onSnapshot(query(studentsCol), (snapshot) => {
        allStudents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }, (error) => console.error("Error listening to students:", error));

    onSnapshot(query(internshipLocationsCol), (snapshot) => {
        allInternshipLocations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.name.localeCompare(b.name));
    }, (error) => console.error("Error listening to internship locations:", error));
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
    console.log('Trang Quản lý Đề tài Tốt nghiệp đang được tải và kiểm tra đăng nhập...');
    initializeFirebase();
});
