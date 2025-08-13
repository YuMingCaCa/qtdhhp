// File: js/de-tai-tot-nghiep.js
// Logic for the "Graduation Thesis Management" module.
// OPTIMIZED: Fetches all topics for a department/year, then applies client-side filtering and pagination.
// This fixes pagination errors when filtering and avoids complex Firestore indexes.
// ADDED: Search functionality for lecturer and department filters.
// ADDED: Default filter to "Khoa Công nghệ Thông tin".

import { auth, db, appId } from './portal-config.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, collection, onSnapshot, addDoc, doc, getDoc, setDoc, getDocs, 
    updateDoc, deleteDoc, query, where, writeBatch, orderBy, limit, startAfter, getCountFromServer 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
let topicsCol, lecturersCol, departmentsCol, usersCol, settingsCol, studentsCol, internshipLocationsCol;
let currentUserInfo = null;

async function initializeFirebase() {
    try {
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
                const userDocById = await getDoc(doc(usersCol, user.uid));
                if(userDocById.exists()){
                   currentUserInfo = { uid: user.uid, ...userDocById.data() };
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
let allTopicsForDept = []; // Holds all topics for the selected year and department
let allLecturers = [];
let allDepartments = [];
let allStudents = [];
let allInternshipLocations = [];
let academicYears = [];
let selectedYear = null;
let selectedDepartmentId = null; 
let selectedLecturerId = null; 
let localFilteredTopics = []; // For client-side filtering result

// --- Pagination State ---
let currentPage = 1;
const TOPICS_PER_PAGE = 15;


// --- UI Rendering & Logic ---

function updateUIForRole() {
    if (!currentUserInfo) return;
    const isAdmin = currentUserInfo.role === 'admin';

    document.querySelectorAll('.admin-only').forEach(el => {
        if (el.id === 'import-menu-dropdown' || el.id === 'print-menu-dropdown' || el.id === 'manage-menu-dropdown') {
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

function renderTopicsList(topicsToRender) {
    const listBody = document.getElementById('topics-list-body');
    listBody.innerHTML = '';
    const isAdmin = currentUserInfo.role === 'admin';

    if (topicsToRender.length === 0) {
        listBody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-gray-500">Không có đề tài nào phù hợp.</td></tr>`;
        return;
    }

    topicsToRender.forEach(topic => {
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
        
        const checkboxHtml = isAdmin && topic.status === 'pending'
            ? `<input type="checkbox" class="topic-checkbox" data-topic-id="${topic.id}">`
            : '';

        row.innerHTML = `
            <td class="px-2 py-4 text-center no-print">${checkboxHtml}</td>
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

function populateInitialFilters() {
    const yearSelect = document.getElementById('filter-year');
    yearSelect.innerHTML = '';
    academicYears.forEach(year => {
        yearSelect.innerHTML += `<option value="${year}">Năm học ${year}</option>`;
    });
    yearSelect.value = getCurrentAcademicYear();
    selectedYear = yearSelect.value;
    
    // Set default to CNTT
    const defaultDept = allDepartments.find(d => d.name.toLowerCase() === "công nghệ thông tin");
    if (defaultDept) {
        selectedDepartmentId = defaultDept.id;
        document.getElementById('search-department-input').value = defaultDept.name;
    }
}

function populateModalDropdowns() {
    const yearSelect = document.getElementById('topic-year-select');
    const depSelect = document.getElementById('topic-department-select');

    yearSelect.innerHTML = '';
    academicYears.forEach(year => {
        yearSelect.innerHTML += `<option value="${year}">Năm học ${year}</option>`;
    });
    yearSelect.value = selectedYear || getCurrentAcademicYear();

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
    // Find topic in the master list for the department, not just the currently rendered page
    const topic = allTopicsForDept.find(t => t.id === id);
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
            fetchTopicsForDepartment(); // Refresh data from server
        } catch (error) {
            showAlert(`Lỗi khi xóa đề tài: ${error.message}`);
            console.error("Error deleting topic: ", error);
        }
    });
};

window.openRegisterModal = (id) => {
    const topic = allTopicsForDept.find(t => t.id === id);
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
    const sampleData = [{
        tenDeTai: "Xây dựng Website bán hàng sử dụng ReactJS",
        moTa: "Nghiên cứu và áp dụng thư viện ReactJS để xây dựng giao diện người dùng cho một trang web thương mại điện tử.",
        tenKhoa: "Công nghệ Thông tin",
        maGiangVien: "GV001"
    }, {
        tenDeTai: "Phân tích dữ liệu điểm thi THPT Quốc gia",
        moTa: "Sử dụng Python và các thư viện như Pandas, Matplotlib để phân tích và trực quan hóa dữ liệu điểm thi.",
        tenKhoa: "Công nghệ Thông tin",
        maGiangVien: "GV002"
    }];
    const filename = "Mau_Import_DeTai.xlsx";
    const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, filename);
}

function downloadTemplateForStudents() {
    const headers = ["maSV", "hoTen", "ngaySinh", "lop", "tenKhoa", "khoaHoc"];
    const sampleData = [{
        maSV: "2131480123",
        hoTen: "Nguyễn Văn An",
        ngaySinh: "2003-10-20",
        lop: "CNTT1-K14",
        tenKhoa: "Công nghệ Thông tin",
        khoaHoc: "K14"
    }, {
        maSV: "2131480124",
        hoTen: "Trần Thị Bình",
        ngaySinh: "2003-05-15",
        lop: "CNTT2-K14",
        tenKhoa: "Công nghệ Thông tin",
        khoaHoc: "K14"
    }];
    const filename = "Mau_Import_SinhVien.xlsx";
    const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, filename);
}

function downloadTemplateForInternshipLocations() {
    const headers = ["tenCoSo", "diaChi", "soDienThoai", "ghiChu", "soSinhVien"];
    const sampleData = [{
        tenCoSo: "Công ty Phần mềm Sao Mai",
        diaChi: "Số 1 Lê Hồng Phong, Ngô Quyền, Hải Phòng",
        soDienThoai: "0912345678",
        ghiChu: "Liên hệ chị Lan phòng nhân sự",
        soSinhVien: 5
    }, {
        tenCoSo: "Tập đoàn Công nghệ HPT",
        diaChi: "Khu Công nghệ cao Hòa Lạc, Hà Nội",
        soDienThoai: "0987654321",
        ghiChu: "",
        soSinhVien: 10
    }];
    const filename = "Mau_Import_CoSoThucTap.xlsx";
    const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
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
            const currentYear = selectedYear || getCurrentAcademicYear();
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
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
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
                    let dateOfBirth = row.ngaySinh;
                    if (dateOfBirth instanceof Date) {
                        // Keep it as a Date object, Firestore will convert to Timestamp
                    } else if (typeof dateOfBirth === 'string') {
                        dateOfBirth = new Date(dateOfBirth);
                    } else {
                        dateOfBirth = null;
                    }

                    const studentClass = String(row.lop || '').trim();
                    const departmentName = String(row.tenKhoa || '').trim().toLowerCase();
                    const course = String(row.khoaHoc || '').trim();
                    if (!studentId || !studentName || !departmentName) throw new Error("Thiếu Mã SV, Họ tên, hoặc Tên Khoa.");
                    const department = allDepartments.find(d => d.name.toLowerCase() === departmentName);
                    if (!department) throw new Error(`Không tìm thấy khoa "${row.tenKhoa}"`);
                    const studentData = { 
                        studentId, 
                        name: studentName, 
                        dateOfBirth: dateOfBirth ? dateOfBirth.toISOString().split('T')[0] : null, // Store as YYYY-MM-DD string
                        class: studentClass, 
                        departmentId: department.id, 
                        course, 
                        lastUpdated: new Date().toISOString() 
                    };
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
    const classFilter = document.getElementById('print-class-select').value;
    const locationFilter = document.getElementById('print-location-select').value;

    let filteredTopics = allTopics.filter(t => 
        t.status === 'taken' &&
        (yearFilter && t.academicYear === yearFilter)
    );

    if (depFilter !== 'all') {
        filteredTopics = filteredTopics.filter(topic => topic.departmentId === depFilter);
    }
    if (classFilter !== 'all') {
        filteredTopics = filteredTopics.filter(topic => topic.studentClass === classFilter);
    }
    if (locationFilter !== 'all') {
        filteredTopics = filteredTopics.filter(topic => topic.internshipLocation === locationFilter);
    }

    if (filteredTopics.length === 0) {
        showAlert("Không có dữ liệu phù hợp để in.");
        return;
    }

    const departmentName = depFilter === 'all' ? 'Toàn trường' : allDepartments.find(d => d.id === depFilter)?.name || 'Không rõ';
    const className = classFilter === 'all' ? '' : ` - Lớp ${classFilter}`;
    const locationNameTitle = locationFilter === 'all' ? '' : ` - ${locationFilter}`;
    const title = `Danh sách Đề tài Tốt nghiệp - Năm học ${yearFilter} - Khoa ${departmentName}${className}${locationNameTitle}`;
    
    let tableBodyHtml = filteredTopics.map((topic, index) => {
        const lecturer = allLecturers.find(l => l.id === topic.lecturerId);
        return `<tr><td style="text-align: center;">${index + 1}</td><td>${topic.name}</td><td>${lecturer ? lecturer.name : 'N/A'}</td><td>${topic.studentName || 'N/A'}</td><td style="text-align: center;">${topic.studentId || 'N/A'}</td><td style="text-align: center;">${topic.studentClass || 'N/A'}</td><td>${topic.internshipLocation || 'N/A'}</td></tr>`;
    }).join('');
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`<html><head><title>${title}</title><style>body{font-family:'Times New Roman',serif;font-size:12pt}table{width:100%;border-collapse:collapse}th,td{border:1px solid black;padding:8px}th{font-weight:bold;text-align:center}.print-header{text-align:center;margin-bottom:20px}@media print{.no-print{display:none}}</style></head><body><div class="print-header"><h2>TRƯỜNG ĐẠI HỌC HẢI PHÒNG</h2><h3>${title.toUpperCase()}</h3></div><table><thead><tr><th>STT</th><th>Tên Đề tài</th><th>GVHD</th><th>Sinh viên</th><th>MSV</th><th>Lớp</th><th>Nơi thực tập</th></tr></thead><tbody>${tableBodyHtml}</tbody></table><button onclick="window.print()" class="no-print" style="margin-top:20px;padding:10px 20px;">In</button></body></html>`);
    printWindow.document.close();
}

// UPDATED: This function now handles advanced filtering
function generateInternshipPrintableList() {
    const yearFilter = document.getElementById('print-year-select').value;
    const depFilter = document.getElementById('print-department-select').value;
    const classFilter = document.getElementById('print-class-select').value;
    const locationFilter = document.getElementById('print-location-select').value;

    let filteredTopics = allTopics.filter(topic =>
        topic.status === 'taken' &&
        (yearFilter && topic.academicYear === yearFilter)
    );

    if (depFilter !== 'all') {
        filteredTopics = filteredTopics.filter(topic => topic.departmentId === depFilter);
    }
    if (classFilter !== 'all') {
        filteredTopics = filteredTopics.filter(topic => topic.studentClass === classFilter);
    }
    if (locationFilter !== 'all') {
        filteredTopics = filteredTopics.filter(topic => topic.internshipLocation === locationFilter);
    }

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
    const className = classFilter === 'all' ? '' : ` - Lớp ${classFilter}`;
    const locationNameTitle = locationFilter === 'all' ? '' : ` - ${locationFilter}`;
    const title = `Danh sách Sinh viên Thực tập Tốt nghiệp - Năm học ${yearFilter} - Khoa ${departmentName}${className}${locationNameTitle}`;

    let tableBodyHtml = '';
    let stt = 1;
    const sortedLocations = Object.keys(groupedByLocation).sort();

    for (const locationName of sortedLocations) {
        const topicsInLocation = groupedByLocation[locationName];
        const locationDetails = allInternshipLocations.find(loc => loc.name === locationName) || {};
        
        topicsInLocation.sort((a, b) => {
            if (a.studentClass < b.studentClass) return -1;
            if (a.studentClass > b.studentClass) return 1;
            return (a.studentName || '').localeCompare(b.studentName || '');
        });

        topicsInLocation.forEach((topic, index) => {
            const student = allStudents.find(s => s.studentId === topic.studentId) || {};
            const dob = student.dateOfBirth ? new Date(student.dateOfBirth).toLocaleDateString('vi-VN') : '';
            tableBodyHtml += `
                <tr>
                    <td style="text-align: center;">${stt++}</td>
                    <td>${topic.studentName || ''}</td>
                    <td style="text-align: center;">${dob}</td>
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

// --- NEW: Function to populate class filter in print modal ---
function populatePrintClassFilter(departmentId) {
    const classSelect = document.getElementById('print-class-select');
    classSelect.innerHTML = '<option value="all">Tất cả Lớp</option>';

    if (allStudents.length === 0) return;

    let relevantStudents = allStudents;
    if (departmentId !== 'all') {
        relevantStudents = allStudents.filter(s => s.departmentId === departmentId);
    }

    const classes = [...new Set(relevantStudents.map(s => s.class))].sort();
    classSelect.innerHTML += classes.map(c => `<option value="${c}">${c}</option>`).join('');
}


// --- Event Listeners ---
function addEventListeners() {
    console.log("Adding event listeners for thesis module..."); // Debugging line

    document.getElementById('add-topic-btn').addEventListener('click', () => {
        clearTopicForm();
        populateModalDropdowns();
        openModal('topic-modal');
    });

    document.getElementById('assignment-btn').addEventListener('click', () => {
        const studentSelect = document.getElementById('assignment-student-select');
        const topicSelect = document.getElementById('assignment-topic-select');
        const locationSelect = document.getElementById('assignment-location-select');

        const assignedStudentIds = new Set(allTopics.filter(t => t.status === 'taken').map(t => t.studentId));
        const unassignedStudents = allStudents.filter(s => !assignedStudentIds.has(s.studentId));
        const approvedTopics = allTopics.filter(t => t.status === 'approved');

        if (unassignedStudents.length === 0) {
            showAlert("Không có sinh viên nào để phân công. Vui lòng import danh sách sinh viên hoặc kiểm tra lại vì tất cả sinh viên có thể đã được phân công.");
            return;
        }
        if (approvedTopics.length === 0) {
            showAlert("Không có đề tài nào đã được duyệt và sẵn sàng để phân công. Vui lòng duyệt một số đề tài trước.");
            return;
        }
        if (allInternshipLocations.length === 0) {
            showAlert("Chưa có cơ sở thực tập nào trong hệ thống. Vui lòng import danh sách cơ sở thực tập trước.");
            return;
        }

        studentSelect.innerHTML = '<option value="">-- Chọn Sinh viên --</option>' + 
            unassignedStudents.map(s => `<option value="${s.id}">${s.name} (${s.studentId})</option>`).join('');

        topicSelect.innerHTML = '<option value="">-- Chọn Đề tài --</option>' +
            approvedTopics.map(t => `<option value="${t.id}">${t.name}</option>`).join('');

        locationSelect.innerHTML = '<option value="">-- Chọn Cơ sở TT --</option>' +
            allInternshipLocations.map(l => `<option value="${l.name}">${l.name}</option>`).join('');
        
        openModal('assignment-modal');
    });

    document.getElementById('assignment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const studentId = document.getElementById('assignment-student-select').value;
        const topicId = document.getElementById('assignment-topic-select').value;
        const location = document.getElementById('assignment-location-select').value;

        if (!studentId || !topicId || !location) {
            showAlert("Vui lòng chọn đầy đủ thông tin.");
            return;
        }

        const student = allStudents.find(s => s.id === studentId);
        const topic = allTopics.find(t => t.id === topicId);
        const lecturer = allLecturers.find(l => l.id === topic.lecturerId);

        if (lecturer) {
            const quota = lecturer.supervisionQuota || 5;
            const currentTakenTopics = allTopics.filter(t => t.lecturerId === lecturer.id && t.status === 'taken').length;
            if (currentTakenTopics >= quota) {
                showAlert(`Giảng viên ${lecturer.name} đã đạt chỉ tiêu (${quota} SV). Không thể phân công.`);
                return;
            }
        }

        const updateData = {
            status: 'taken',
            studentName: student.name,
            studentId: student.studentId,
            studentClass: student.class,
            internshipLocation: location,
            registeredByUid: currentUserInfo.uid,
            registeredAt: new Date().toISOString()
        };

        try {
            await updateDoc(doc(topicsCol, topicId), updateData);
            showAlert('Phân công sinh viên thành công!', true);
            closeModal('assignment-modal');
        } catch (error) {
            showAlert(`Lỗi khi phân công: ${error.message}`);
        }
    });

    document.getElementById('bulk-assignment-btn').addEventListener('click', () => {
        const locationSelect = document.getElementById('bulk-assignment-location-select');
        const deptFilter = document.getElementById('bulk-assign-filter-department');

        if (allInternshipLocations.length === 0) {
            showAlert("Chưa có cơ sở thực tập nào trong hệ thống. Vui lòng import danh sách cơ sở thực tập trước.");
            return;
        }
        
        deptFilter.innerHTML = '<option value="all">Tất cả Khoa</option>' + 
            allDepartments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        
        locationSelect.innerHTML = '<option value="">-- Chọn Cơ sở TT --</option>' +
            allInternshipLocations.map(l => `<option value="${l.name}">${l.name}</option>`).join('');
        
        populateBulkAssignFilters();
        
        openModal('bulk-assignment-modal');
    });

    document.getElementById('bulk-assignment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const selectedStudentIds = Array.from(document.querySelectorAll('#bulk-assignment-student-list input:checked')).map(cb => cb.value);
        const selectedTopicIds = Array.from(document.querySelectorAll('#bulk-assignment-topic-list input:checked')).map(cb => cb.value);
        const location = document.getElementById('bulk-assignment-location-select').value;

        if (selectedStudentIds.length === 0 || selectedTopicIds.length === 0 || !location) {
            showAlert("Vui lòng chọn sinh viên, đề tài và cơ sở thực tập.");
            return;
        }
        if (selectedStudentIds.length !== selectedTopicIds.length) {
            showAlert("Số lượng sinh viên và đề tài được chọn phải bằng nhau.");
            return;
        }
        
        const lecturerAssignmentCounts = {};
        for(const topicId of selectedTopicIds) {
            const topic = allTopics.find(t => t.id === topicId);
            lecturerAssignmentCounts[topic.lecturerId] = (lecturerAssignmentCounts[topic.lecturerId] || 0) + 1;
        }

        for(const lecturerId in lecturerAssignmentCounts) {
            const lecturer = allLecturers.find(l => l.id === lecturerId);
            const quota = lecturer.supervisionQuota || 5;
            const currentTakenTopics = allTopics.filter(t => t.lecturerId === lecturer.id && t.status === 'taken').length;
            if(currentTakenTopics + lecturerAssignmentCounts[lecturerId] > quota) {
                showAlert(`Giảng viên ${lecturer.name} sẽ vượt quá chỉ tiêu (${quota} SV) với phân công này.`);
                return;
            }
        }

        showConfirm(`Bạn có chắc muốn phân công ${selectedStudentIds.length} sinh viên vào ${selectedTopicIds.length} đề tài?`, async () => {
            const batch = writeBatch(db);
            for(let i = 0; i < selectedStudentIds.length; i++) {
                const student = allStudents.find(s => s.id === selectedStudentIds[i]);
                const topicId = selectedTopicIds[i];
                const updateData = {
                    status: 'taken',
                    studentName: student.name,
                    studentId: student.studentId,
                    studentClass: student.class,
                    internshipLocation: location,
                    registeredByUid: currentUserInfo.uid,
                    registeredAt: new Date().toISOString()
                };
                batch.update(doc(topicsCol, topicId), updateData);
            }
            try {
                await batch.commit();
                showAlert('Phân công hàng loạt thành công!', true);
                closeModal('bulk-assignment-modal');
            } catch (error) {
                showAlert(`Lỗi khi phân công: ${error.message}`);
            }
        });
    });


    document.getElementById('topic-department-select').addEventListener('change', (e) => {
        updateLecturerDropdownInModal(e.target.value);
    });

    document.getElementById('topic-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('topic-id').value;
        const isAdmin = currentUserInfo.role === 'admin';
        const departmentId = document.getElementById('topic-department-select').value;
        
        const selfLecturer = allLecturers.find(l => l.linkedUid === currentUserInfo.uid);

        const data = {
            name: document.getElementById('topic-name').value.trim(),
            description: document.getElementById('topic-description').value.trim(),
            academicYear: document.getElementById('topic-year-select').value,
            departmentId: departmentId,
            lecturerId: isAdmin ? document.getElementById('topic-lecturer-select').value : (selfLecturer ? selfLecturer.id : null),
            status: isAdmin ? document.getElementById('topic-status-select').value : 'pending',
            proposerUid: id ? allTopics.find(t=>t.id === id).proposerUid : currentUserInfo.uid,
            lastUpdated: new Date().toISOString()
        };

        if (!data.name || !data.academicYear || !data.departmentId) {
            showAlert("Vui lòng điền các trường bắt buộc.");
            return;
        }
        if (isAdmin && !data.lecturerId) {
            showAlert("Admin phải chọn giảng viên.");
            return;
        }
        if (!isAdmin && !data.lecturerId) {
            showAlert("Không thể xác định giảng viên đề xuất. Vui lòng kiểm tra xem tài khoản của bạn đã được gán cho một giảng viên trong mục 'Quản lý Người dùng' chưa.");
            return;
        }
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
            fetchTopicsForDepartment(); // Refresh data
        } catch (error) {
            showAlert(`Lỗi: ${error.message}`);
        }
    });

    document.getElementById('student-register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const topicId = document.getElementById('register-topic-id').value;
        const studentName = document.getElementById('student-name').value.trim();
        const studentId = document.getElementById('student-id-input').value.trim();
        const studentClass = document.getElementById('student-class-input').value.trim();
        const internshipLocation = document.getElementById('student-internship-location').value;
        if (!studentName || !studentId || !studentClass || !internshipLocation) { showAlert("Vui lòng điền đầy đủ thông tin."); return; }
        const topic = allTopicsForDept.find(t => t.id === topicId);
        const lecturer = allLecturers.find(l => l.id === topic.lecturerId);
        if (lecturer) {
            const quota = lecturer.supervisionQuota || 5; 
            const currentTakenTopics = allTopicsForDept.filter(t => t.lecturerId === lecturer.id && t.status === 'taken').length;
            if (currentTakenTopics >= quota) { showAlert(`Giảng viên ${lecturer.name} đã đạt chỉ tiêu (${quota} SV).`); return; }
        }
        const updateData = { status: 'taken', studentName, studentId, studentClass, internshipLocation, registeredByUid: currentUserInfo.uid, registeredAt: new Date().toISOString() };
        try {
            await updateDoc(doc(topicsCol, topicId), updateData);
            showAlert('Đăng ký thành công!', true);
            closeModal('student-register-modal');
            fetchTopicsForDepartment(); // Refresh data
        } catch (error) { showAlert(`Lỗi: ${error.message}`); }
    });

    // Dropdown Menu Logic
    const printMenuBtn = document.getElementById('print-menu-btn');
    const printMenuDropdown = document.getElementById('print-menu-dropdown');
    const importMenuBtn = document.getElementById('import-menu-btn');
    const importMenuDropdown = document.getElementById('import-menu-dropdown');
    const manageMenuBtn = document.getElementById('manage-menu-btn');
    const manageMenuDropdown = document.getElementById('manage-menu-dropdown');

    const setupDropdown = (btn, dropdown) => {
        if(!btn || !dropdown) return;
        btn.addEventListener('click', () => dropdown.classList.toggle('hidden'));
        window.addEventListener('click', (e) => {
            if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
    };
    setupDropdown(printMenuBtn, printMenuDropdown);
    setupDropdown(importMenuBtn, importMenuDropdown);
    setupDropdown(manageMenuBtn, manageMenuDropdown);

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
    document.getElementById('filter-year').addEventListener('change', (e) => {
        selectedYear = e.target.value;
        fetchTopicsForDepartment();
    });
    document.getElementById('filter-status').addEventListener('change', () => applyFiltersAndRenderPage(1));


    // --- UPDATED: Search-based Filter Listeners ---
    const deptInput = document.getElementById('search-department-input');
    const deptResults = document.getElementById('department-results');
    deptInput.addEventListener('input', () => {
        const searchTerm = deptInput.value.toLowerCase();
        if (!searchTerm) {
            selectedDepartmentId = null;
            deptResults.classList.add('hidden');
            fetchTopicsForDepartment();
            return;
        }
        const filteredDepts = allDepartments.filter(d => d.name.toLowerCase().includes(searchTerm));
        deptResults.innerHTML = '';
        if (filteredDepts.length > 0) {
            filteredDepts.forEach(d => {
                const div = document.createElement('div');
                div.textContent = d.name;
                div.className = 'p-2 hover:bg-gray-100 cursor-pointer';
                div.onclick = () => {
                    deptInput.value = d.name;
                    selectedDepartmentId = d.id;
                    deptResults.classList.add('hidden');
                    fetchTopicsForDepartment();
                };
                deptResults.appendChild(div);
            });
            deptResults.classList.remove('hidden');
        } else {
            deptResults.classList.add('hidden');
        }
    });
    
    const lecInput = document.getElementById('search-lecturer-input');
    const lecResults = document.getElementById('lecturer-results');
    lecInput.addEventListener('input', () => {
        const searchTerm = lecInput.value.toLowerCase();
        if (!searchTerm) {
            selectedLecturerId = null;
            lecResults.classList.add('hidden');
            applyFiltersAndRenderPage(1);
            return;
        }
        const filteredLecs = allLecturers.filter(l => l.name.toLowerCase().includes(searchTerm) && (selectedDepartmentId ? l.departmentId === selectedDepartmentId : true));
        lecResults.innerHTML = '';
        if (filteredLecs.length > 0) {
            filteredLecs.forEach(l => {
                const div = document.createElement('div');
                div.textContent = l.name;
                div.className = 'p-2 hover:bg-gray-100 cursor-pointer';
                div.onclick = () => {
                    lecInput.value = l.name;
                    selectedLecturerId = l.id;
                    lecResults.classList.add('hidden');
                    applyFiltersAndRenderPage(1);
                };
                lecResults.appendChild(div);
            });
            lecResults.classList.remove('hidden');
        } else {
            lecResults.classList.add('hidden');
        }
    });

    // Add a general click listener to hide search results
    window.addEventListener('click', (e) => {
        if (!deptInput.contains(e.target)) deptResults.classList.add('hidden');
        if (!lecInput.contains(e.target)) lecResults.classList.add('hidden');
    });


    // --- UPDATED: Print listeners ---
    const setupPrintModal = (isAdvanced = false) => {
        const yearSelect = document.getElementById('print-year-select');
        const depSelect = document.getElementById('print-department-select');
        const classContainer = document.getElementById('print-class-filter-container');
        const locationContainer = document.getElementById('print-location-filter-container');
        const locationSelect = document.getElementById('print-location-select');

        // Populate Year and Department always
        yearSelect.innerHTML = academicYears.map(y => `<option value="${y}" ${y === selectedYear ? 'selected' : ''}>Năm học ${y}</option>`).join('');
        depSelect.innerHTML = '<option value="all">Tất cả Khoa</option>' + allDepartments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');

        if (isAdvanced) {
            // Show and populate advanced filters
            classContainer.classList.remove('hidden');
            locationContainer.classList.remove('hidden');
            locationSelect.innerHTML = '<option value="all">Tất cả Cơ sở TT</option>' + allInternshipLocations.map(l => `<option value="${l.name}">${l.name}</option>`).join('');
            
            // Populate class filter based on department and set up listener
            populatePrintClassFilter(depSelect.value);
            depSelect.onchange = () => populatePrintClassFilter(depSelect.value);
        } else {
            // Hide advanced filters for basic print
            classContainer.classList.add('hidden');
            locationContainer.classList.add('hidden');
            depSelect.onchange = null; // Remove listener
        }
        openModal('print-modal');
    };
    
    document.getElementById('print-list-btn').addEventListener('click', (e) => {
        e.preventDefault();
        setupPrintModal(true); // UPDATED: Always show advanced modal
        printMenuDropdown.classList.add('hidden');
        document.getElementById('print-form').onsubmit = (ev) => {
            ev.preventDefault();
            generatePrintableList(); // This function is now updated
            closeModal('print-modal');
        };
    });
    
    document.getElementById('print-location-list-btn').addEventListener('click', (e) => {
        e.preventDefault();
        setupPrintModal(true); // Advanced modal with class/location
        printMenuDropdown.classList.add('hidden');
        document.getElementById('print-form').onsubmit = (ev) => {
            ev.preventDefault();
            generateInternshipPrintableList(); // This function is now updated to handle more filters
            closeModal('print-modal');
        };
    });

    document.getElementById('print-detailed-location-list-btn').addEventListener('click', (e) => {
        e.preventDefault();
        printMenuDropdown.classList.add('hidden');
        generateDetailedInternshipPrintableList();
    });
    // --- END UPDATED Print listeners ---


    // Bulk Approval Listeners
    document.getElementById('topics-list-body').addEventListener('change', (e) => {
        if (e.target.classList.contains('topic-checkbox')) {
            const anyChecked = Array.from(document.querySelectorAll('.topic-checkbox:checked')).length > 0;
            document.getElementById('bulk-approve-container').style.display = anyChecked ? 'block' : 'none';
        }
    });

    document.getElementById('select-all-topics-checkbox').addEventListener('change', (e) => {
        document.querySelectorAll('.topic-checkbox').forEach(cb => cb.checked = e.target.checked);
        document.getElementById('bulk-approve-container').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('bulk-approve-btn').addEventListener('click', async () => {
        const selectedIds = Array.from(document.querySelectorAll('.topic-checkbox:checked')).map(cb => cb.dataset.topicId);
        if (selectedIds.length === 0) {
            showAlert("Vui lòng chọn ít nhất một đề tài để duyệt.");
            return;
        }
        showConfirm(`Bạn có chắc muốn duyệt ${selectedIds.length} đề tài đã chọn?`, async () => {
            const batch = writeBatch(db);
            selectedIds.forEach(id => {
                batch.update(doc(topicsCol, id), { status: 'approved' });
            });
            try {
                await batch.commit();
                showAlert('Duyệt hàng loạt thành công!', true);
                fetchTopicsForDepartment(); // Refresh page
            } catch (error) {
                showAlert(`Lỗi khi duyệt: ${error.message}`);
            }
        });
    });

    // Bulk Assignment Filter Listeners
    ['bulk-assign-filter-department', 'bulk-assign-filter-course', 'bulk-assign-filter-class'].forEach(id => {
        document.getElementById(id).addEventListener('change', populateBulkAssignFilters);
    });

    // Bulk Assignment Select All Listeners
    document.getElementById('select-all-students-bulk').addEventListener('change', (e) => {
        document.querySelectorAll('#bulk-assignment-student-list input').forEach(cb => cb.checked = e.target.checked);
        updateSelectedCounts();
    });
    document.getElementById('select-all-topics-bulk').addEventListener('change', (e) => {
        document.querySelectorAll('#bulk-assignment-topic-list input').forEach(cb => cb.checked = e.target.checked);
        updateSelectedCounts();
    });
    document.getElementById('bulk-assignment-student-list').addEventListener('change', updateSelectedCounts);
    document.getElementById('bulk-assignment-topic-list').addEventListener('change', updateSelectedCounts);
    
    // --- NEW: Management Modal Listeners ---
    document.getElementById('manage-students-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        // OPTIMIZED: Load students only when the modal is opened
        await loadAllStudents();
        openManageStudentsModal();
        manageMenuDropdown.classList.add('hidden');
    });

    document.getElementById('manage-locations-btn').addEventListener('click', (e) => {
        e.preventDefault();
        openManageLocationsModal();
        manageMenuDropdown.classList.add('hidden');
    });

    document.getElementById('student-management-form').addEventListener('submit', handleStudentFormSubmit);
    document.getElementById('clear-student-management-form-btn').addEventListener('click', clearStudentManagementForm);
    document.getElementById('location-management-form').addEventListener('submit', handleLocationFormSubmit);
    document.getElementById('clear-location-management-form-btn').addEventListener('click', clearLocationManagementForm);
    
    // --- NEW: Pagination Listeners ---
    document.getElementById('next-page-btn').addEventListener('click', () => {
        applyFiltersAndRenderPage(currentPage + 1);
    });
    document.getElementById('prev-page-btn').addEventListener('click', () => {
        applyFiltersAndRenderPage(currentPage - 1);
    });
}

// --- NEW: Data Management Functions ---

// Student Management
function openManageStudentsModal() {
    const depSelect = document.getElementById('student-management-department');
    depSelect.innerHTML = '<option value="">-- Chọn Khoa --</option>' + allDepartments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    clearStudentManagementForm();
    renderStudentsForManagement();
    openModal('manage-students-modal');
}

function renderStudentsForManagement() {
    const listBody = document.getElementById('students-management-list-body');
    listBody.innerHTML = '';
    allStudents.sort((a,b) => a.name.localeCompare(b.name)).forEach(student => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-4 py-2">${student.name}</td>
            <td class="px-4 py-2">${student.studentId}</td>
            <td class="px-4 py-2">${student.class}</td>
            <td class="px-4 py-2 text-center">
                <button class="text-blue-600 hover:text-blue-900 mr-3" onclick="window.editStudentForManagement('${student.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="text-red-600 hover:text-red-900" onclick="window.deleteStudentForManagement('${student.id}')" title="Xóa"><i class="fas fa-trash"></i></button>
            </td>
        `;
        listBody.appendChild(row);
    });
}

function clearStudentManagementForm() {
    document.getElementById('student-management-form').reset();
    document.getElementById('student-management-id').value = '';
}

async function handleStudentFormSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    setButtonLoading(btn, true);

    const id = document.getElementById('student-management-id').value;
    const data = {
        name: document.getElementById('student-management-name').value.trim(),
        studentId: document.getElementById('student-management-code').value.trim(),
        dateOfBirth: document.getElementById('student-management-dob').value,
        class: document.getElementById('student-management-class').value.trim(),
        course: document.getElementById('student-management-course').value.trim(),
        departmentId: document.getElementById('student-management-department').value,
        lastUpdated: new Date().toISOString()
    };

    if (!data.name || !data.studentId || !data.class || !data.departmentId) {
        showAlert("Vui lòng điền đầy đủ các trường bắt buộc.");
        setButtonLoading(btn, false);
        return;
    }

    try {
        if (id) {
            await updateDoc(doc(studentsCol, id), data);
            showAlert('Cập nhật sinh viên thành công!', true);
        } else {
            const q = query(studentsCol, where("studentId", "==", data.studentId));
            const existing = await getDocs(q);
            if (!existing.empty) {
                showAlert(`Lỗi: Mã sinh viên ${data.studentId} đã tồn tại.`);
            } else {
                await addDoc(studentsCol, data);
                showAlert('Thêm sinh viên thành công!', true);
            }
        }
        clearStudentManagementForm();
    } catch (error) {
        showAlert(`Lỗi khi lưu sinh viên: ${error.message}`);
    } finally {
        setButtonLoading(btn, false);
    }
}

window.editStudentForManagement = (id) => {
    const student = allStudents.find(s => s.id === id);
    if (student) {
        document.getElementById('student-management-id').value = student.id;
        document.getElementById('student-management-name').value = student.name;
        document.getElementById('student-management-code').value = student.studentId;
        document.getElementById('student-management-dob').value = student.dateOfBirth || '';
        document.getElementById('student-management-class').value = student.class;
        document.getElementById('student-management-course').value = student.course;
        document.getElementById('student-management-department').value = student.departmentId;
    }
}

window.deleteStudentForManagement = (id) => {
    const student = allStudents.find(s => s.id === id);
    const isAssigned = allTopicsForDept.some(t => t.studentId === student.studentId);
    if (isAssigned) {
        showAlert("Không thể xóa sinh viên đã được phân công đề tài. Vui lòng hủy phân công trước.");
        return;
    }
    showConfirm(`Bạn có chắc muốn xóa sinh viên ${student.name}?`, async () => {
        try {
            await deleteDoc(doc(studentsCol, id));
            showAlert('Xóa sinh viên thành công!', true);
        } catch (error) {
            showAlert(`Lỗi khi xóa: ${error.message}`);
        }
    });
}

// Location Management
function openManageLocationsModal() {
    clearLocationManagementForm();
    renderLocationsForManagement();
    openModal('manage-locations-modal');
}

function renderLocationsForManagement() {
    const listBody = document.getElementById('locations-management-list-body');
    listBody.innerHTML = '';
    allInternshipLocations.forEach(loc => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-4 py-2">${loc.name}</td>
            <td class="px-4 py-2">${loc.address}</td>
            <td class="px-4 py-2 text-center">${loc.studentCount}</td>
            <td class="px-4 py-2 text-center">
                <button class="text-blue-600 hover:text-blue-900 mr-3" onclick="window.editLocationForManagement('${loc.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="text-red-600 hover:text-red-900" onclick="window.deleteLocationForManagement('${loc.id}')" title="Xóa"><i class="fas fa-trash"></i></button>
            </td>
        `;
        listBody.appendChild(row);
    });
}

function clearLocationManagementForm() {
    document.getElementById('location-management-form').reset();
    document.getElementById('location-management-id').value = '';
}

async function handleLocationFormSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    setButtonLoading(btn, true);

    const id = document.getElementById('location-management-id').value;
    const data = {
        name: document.getElementById('location-management-name').value.trim(),
        address: document.getElementById('location-management-address').value.trim(),
        phone: document.getElementById('location-management-phone').value.trim(),
        notes: document.getElementById('location-management-notes').value.trim(),
        studentCount: parseInt(document.getElementById('location-management-count').value, 10) || 0,
    };

    if (!data.name) {
        showAlert("Vui lòng nhập Tên cơ sở.");
        setButtonLoading(btn, false);
        return;
    }

    try {
        if (id) {
            await updateDoc(doc(internshipLocationsCol, id), data);
            showAlert('Cập nhật cơ sở thành công!', true);
        } else {
            await addDoc(internshipLocationsCol, data);
            showAlert('Thêm cơ sở thành công!', true);
        }
        clearLocationManagementForm();
    } catch (error) {
        showAlert(`Lỗi khi lưu cơ sở: ${error.message}`);
    } finally {
        setButtonLoading(btn, false);
    }
}

window.editLocationForManagement = (id) => {
    const loc = allInternshipLocations.find(l => l.id === id);
    if (loc) {
        document.getElementById('location-management-id').value = loc.id;
        document.getElementById('location-management-name').value = loc.name;
        document.getElementById('location-management-address').value = loc.address || '';
        document.getElementById('location-management-phone').value = loc.phone || '';
        document.getElementById('location-management-notes').value = loc.notes || '';
        document.getElementById('location-management-count').value = loc.studentCount || 0;
    }
}

window.deleteLocationForManagement = (id) => {
    const loc = allInternshipLocations.find(l => l.id === id);
    showConfirm(`Bạn có chắc muốn xóa cơ sở ${loc.name}?`, async () => {
        try {
            await deleteDoc(doc(internshipLocationsCol, id));
            showAlert('Xóa cơ sở thành công!', true);
        } catch (error) {
            showAlert(`Lỗi khi xóa: ${error.message}`);
        }
    });
}


// --- OPTIMIZED: Data Loading & Filtering Logic ---
async function fetchTopicsForDepartment() {
    const listBody = document.getElementById('topics-list-body');
    listBody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải dữ liệu...</td></tr>`;

    try {
        let constraints = [where("academicYear", "==", selectedYear)];
        if (selectedDepartmentId) {
            constraints.push(where("departmentId", "==", selectedDepartmentId));
        }
        
        const q = query(topicsCol, ...constraints, orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        allTopicsForDept = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        applyFiltersAndRenderPage(1); // Apply filters and render the first page

    } catch (error) {
        console.error(`Error loading topics:`, error);
        showAlert(`Lỗi khi tải dữ liệu đề tài: ${error.message}`);
        listBody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-red-500">Lỗi tải dữ liệu.</td></tr>`;
    }
}

function applyFiltersAndRenderPage(page = 1) {
    currentPage = page;
    const statusFilter = document.getElementById('filter-status').value;

    let filteredTopics = allTopicsForDept;
    if (selectedLecturerId) {
        filteredTopics = filteredTopics.filter(topic => topic.lecturerId === selectedLecturerId);
    }
    if (statusFilter !== 'all') {
        filteredTopics = filteredTopics.filter(topic => topic.status === statusFilter);
    }
    
    localFilteredTopics = filteredTopics;
    
    const startIndex = (currentPage - 1) * TOPICS_PER_PAGE;
    const endIndex = startIndex + TOPICS_PER_PAGE;
    const topicsToRender = localFilteredTopics.slice(startIndex, endIndex);

    renderTopicsList(topicsToRender);
    updatePaginationControls();
}


function updatePaginationControls() {
    const pageInfo = document.getElementById('page-info');
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    
    const totalTopics = localFilteredTopics.length;
    const totalPages = Math.ceil(totalTopics / TOPICS_PER_PAGE);

    pageInfo.textContent = `Trang ${currentPage} / ${totalPages || 1}`;
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage >= totalPages;
}

async function loadAllStudents() {
    if (allStudents.length > 0) return; // Don't reload if already loaded
    try {
        const snapshot = await getDocs(query(studentsCol));
        allStudents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error loading students:", error);
        showAlert("Không thể tải danh sách sinh viên.");
    }
}

// --- Data Snapshot Listeners ---
function setupOnSnapshotListeners() {
    onSnapshot(doc(settingsCol, 'appSettings'), (docSnapshot) => {
        const customYears = docSnapshot.exists() ? (docSnapshot.data().customYears || []) : [];
        academicYears = Array.from(new Set([getCurrentAcademicYear(), ...customYears])).sort().reverse();
        populateInitialFilters();
        fetchTopicsForDepartment(); 
    }, (error) => console.error("Error listening to settings:", error));

    onSnapshot(query(departmentsCol), (snapshot) => {
        allDepartments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.name.localeCompare(b.name));
        populateInitialFilters();
    }, (error) => console.error("Error listening to departments:", error));

    onSnapshot(query(lecturersCol), (snapshot) => {
        allLecturers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.name.localeCompare(b.name));
    }, (error) => console.error("Error listening to lecturers:", error));

    onSnapshot(query(internshipLocationsCol), (snapshot) => {
        allInternshipLocations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.name.localeCompare(b.name));
        if(document.getElementById('manage-locations-modal').style.display === 'block') {
            renderLocationsForManagement();
        }
    }, (error) => console.error("Error listening to internship locations:", error));
    
    onSnapshot(query(studentsCol), (snapshot) => {
        allStudents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
         if(document.getElementById('manage-students-modal').style.display === 'block') {
            renderStudentsForManagement();
        }
    }, (error) => console.error("Error listening to students:", error));
}

// --- NEW Bulk Assignment Helper Functions ---
function populateBulkAssignFilters() {
    const deptFilter = document.getElementById('bulk-assign-filter-department').value;
    const courseFilter = document.getElementById('bulk-assign-filter-course');
    const classFilter = document.getElementById('bulk-assign-filter-class');
    
    const assignedStudentIds = new Set(allTopicsForDept.filter(t => t.status === 'taken').map(t => t.studentId));
    let availableStudents = allStudents.filter(s => !assignedStudentIds.has(s.studentId));
    
    if (deptFilter !== 'all') {
        availableStudents = availableStudents.filter(s => s.departmentId === deptFilter);
    }

    // Populate Course filter
    const courses = [...new Set(availableStudents.map(s => s.course).filter(Boolean))].sort();
    const currentCourse = courseFilter.value;
    courseFilter.innerHTML = '<option value="all">Tất cả Khóa học</option>' + courses.map(c => `<option value="${c}">${c}</option>`).join('');
    courseFilter.value = currentCourse;
    
    if (courseFilter.value !== 'all') {
        availableStudents = availableStudents.filter(s => s.course === courseFilter.value);
    }

    // Populate Class filter
    const classes = [...new Set(availableStudents.map(s => s.class).filter(Boolean))].sort();
    const currentClass = classFilter.value;
    classFilter.innerHTML = '<option value="all">Tất cả Lớp</option>' + classes.map(c => `<option value="${c}">${c}</option>`).join('');
    classFilter.value = currentClass;

    populateBulkAssignLists();
}

function populateBulkAssignLists() {
    const deptFilter = document.getElementById('bulk-assign-filter-department').value;
    const courseFilter = document.getElementById('bulk-assign-filter-course').value;
    const classFilter = document.getElementById('bulk-assign-filter-class').value;
    const studentListDiv = document.getElementById('bulk-assignment-student-list');
    const topicListDiv = document.getElementById('bulk-assignment-topic-list');

    const assignedStudentIds = new Set(allTopicsForDept.filter(t => t.status === 'taken').map(t => t.studentId));
    let filteredStudents = allStudents.filter(s => !assignedStudentIds.has(s.studentId));
    
    if (deptFilter !== 'all') filteredStudents = filteredStudents.filter(s => s.departmentId === deptFilter);
    if (courseFilter !== 'all') filteredStudents = filteredStudents.filter(s => s.course === courseFilter);
    if (classFilter !== 'all') filteredStudents = filteredStudents.filter(s => s.class === classFilter);

    studentListDiv.innerHTML = filteredStudents.map(s => `<div><input type="checkbox" id="student-${s.id}" value="${s.id}"><label for="student-${s.id}" class="ml-2">${s.name} (${s.studentId})</label></div>`).join('');

    const approvedTopics = allTopicsForDept.filter(t => t.status === 'approved');
    topicListDiv.innerHTML = approvedTopics.map(t => `<div><input type="checkbox" id="topic-${t.id}" value="${t.id}"><label for="topic-${t.id}" class="ml-2">${t.name}</label></div>`).join('');

    updateSelectedCounts();
}

function updateSelectedCounts() {
    const studentCount = document.querySelectorAll('#bulk-assignment-student-list input:checked').length;
    const topicCount = document.querySelectorAll('#bulk-assignment-topic-list input:checked').length;
    document.getElementById('selected-students-count').textContent = studentCount;
    document.getElementById('selected-topics-count').textContent = topicCount;
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
