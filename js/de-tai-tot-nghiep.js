// File: js/de-tai-tot-nghiep.js
// Logic for the "Graduation Thesis Management" module.
// UPDATED: Added functionality for students to register for approved topics and import topics from Excel.

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
let topicsCol, lecturersCol, departmentsCol, usersCol, settingsCol;
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
let academicYears = [];

// --- UI Rendering & Logic ---

function updateUIForRole() {
    if (!currentUserInfo) return;
    const isAdmin = currentUserInfo.role === 'admin';
    
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? 'flex' : 'none';
    });
    document.getElementById('admin-topic-section').style.display = isAdmin ? 'block' : 'none';
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
                <div class="mt-2 text-xs text-gray-500">
                    <span class="font-semibold text-blue-600">SV:</span> ${topic.studentName} - 
                    <span class="font-semibold text-blue-600">MSV:</span> ${topic.studentId || 'N/A'} - 
                    <span class="font-semibold text-blue-600">Lớp:</span> ${topic.studentClass || 'N/A'}
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
            <td class="px-6 py-4 whitespace-nowrap text-center">
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

    // Initially populate lecturers for "All Departments"
    updateLecturerFilterDropdown('all');
}

// Function to update lecturer filter based on department
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
        document.getElementById('student-register-form').reset();
        openModal('student-register-modal');
    }
};

// --- Import/Export Functions ---
function downloadTemplateForTopics() {
    const headers = ["tenDeTai", "moTa", "tenKhoa", "maGiangVien"];
    const filename = "Mau_Import_DeTai.xlsx";
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
    logContainer.innerHTML = 'Bắt đầu quá trình import...<br>';

    if (!fileInput.files || fileInput.files.length === 0) {
        showAlert("Vui lòng chọn một file Excel.");
        setButtonLoading(btn, false);
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                logContainer.innerHTML += '<span class="text-red-500">Lỗi: File không có dữ liệu.</span><br>';
                setButtonLoading(btn, false);
                return;
            }

            logContainer.innerHTML += `Đã đọc ${jsonData.length} dòng từ file. Đang xử lý...<br>`;

            const batch = writeBatch(db);
            let successCount = 0;
            let errorCount = 0;
            const currentYear = getCurrentAcademicYear();

            for (const [index, row] of jsonData.entries()) {
                try {
                    const tenDeTai = String(row.tenDeTai || '').trim();
                    const moTa = String(row.moTa || '').trim();
                    const tenKhoa = String(row.tenKhoa || '').trim().toLowerCase();
                    const maGiangVien = String(row.maGiangVien || '').trim().toLowerCase();

                    if (!tenDeTai || !moTa || !tenKhoa || !maGiangVien) {
                        throw new Error("Thiếu thông tin bắt buộc (Tên đề tài, Mô tả, Tên khoa, Mã GV).");
                    }

                    const department = allDepartments.find(d => d.name.toLowerCase() === tenKhoa);
                    if (!department) throw new Error(`Không tìm thấy khoa "${row.tenKhoa}"`);

                    const lecturer = allLecturers.find(l => l.code.toLowerCase() === maGiangVien);
                    if (!lecturer) throw new Error(`Không tìm thấy giảng viên có mã "${row.maGiangVien}"`);
                    
                    if (lecturer.departmentId !== department.id) {
                         throw new Error(`Giảng viên "${lecturer.name}" không thuộc khoa "${department.name}"`);
                    }

                    const newTopicData = {
                        name: tenDeTai,
                        description: moTa,
                        academicYear: currentYear,
                        departmentId: department.id,
                        lecturerId: lecturer.id,
                        status: 'pending', // Imported topics are pending by default
                        proposerUid: currentUserInfo.uid,
                        createdAt: new Date().toISOString(),
                        lastUpdated: new Date().toISOString(),
                    };

                    const newDocRef = doc(topicsCol);
                    batch.set(newDocRef, newTopicData);
                    successCount++;

                } catch (rowError) {
                    errorCount++;
                    logContainer.innerHTML += `<span class="text-orange-500">- Dòng ${index + 2}: Lỗi - ${rowError.message}</span><br>`;
                }
            }

            if (successCount > 0) {
                await batch.commit();
            }
            
            logContainer.innerHTML += `<hr class="my-2">`;
            logContainer.innerHTML += `<strong class="text-green-600">Hoàn thành!</strong><br>`;
            logContainer.innerHTML += `<span>- Thêm mới thành công: ${successCount} đề tài.</span><br>`;
            logContainer.innerHTML += `<span>- Bị lỗi: ${errorCount} dòng.</span><br>`;

        } catch (error) {
            console.error("Import error:", error);
            logContainer.innerHTML += `<span class="text-red-500">Đã xảy ra lỗi nghiêm trọng: ${error.message}</span><br>`;
        } finally {
            setButtonLoading(btn, false);
            fileInput.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
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

        const data = {
            name: document.getElementById('topic-name').value.trim(),
            description: document.getElementById('topic-description').value.trim(),
            academicYear: document.getElementById('topic-year-select').value,
            departmentId: departmentId,
            lecturerId: isAdmin ? document.getElementById('topic-lecturer-select').value : (selfLecturer ? selfLecturer.id : null),
            status: isAdmin ? document.getElementById('topic-status-select').value : 'pending',
            proposerUid: id ? allTopics.find(t=>t.id === id).proposerUid : currentUserInfo.uid,
            lastUpdated: new Date().toISOString(),
        };

        if (!data.name || !data.description || !data.academicYear || !data.departmentId) {
            showAlert("Vui lòng điền đầy đủ các trường bắt buộc.");
            return;
        }
        if (isAdmin && !data.lecturerId) {
            showAlert("Admin phải chọn một giảng viên hướng dẫn.");
            return;
        }
        if (!isAdmin && !data.lecturerId) {
            showAlert("Không thể xác định giảng viên đề xuất. Vui lòng đảm bảo thông tin giảng viên của bạn (mã GV) có trong hệ thống và khớp với email.");
            return;
        }

        try {
            if (id) {
                await updateDoc(doc(topicsCol, id), data);
                showAlert('Cập nhật đề tài thành công!', true);
            } else {
                data.createdAt = new Date().toISOString();
                await addDoc(topicsCol, data);
                showAlert('Đề xuất đề tài mới thành công!', true);
            }
            closeModal('topic-modal');
        } catch (error) {
            showAlert(`Lỗi khi lưu đề tài: ${error.message}`);
        }
    });

    document.getElementById('student-register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const topicId = document.getElementById('register-topic-id').value;
        const studentName = document.getElementById('student-name').value.trim();
        const studentId = document.getElementById('student-id-input').value.trim();
        const studentClass = document.getElementById('student-class-input').value.trim();

        if (!studentName || !studentId || !studentClass) {
            showAlert("Vui lòng điền đầy đủ thông tin của bạn.");
            return;
        }

        const updateData = {
            status: 'taken',
            studentName,
            studentId,
            studentClass,
            registeredByUid: currentUserInfo.uid,
            registeredAt: new Date().toISOString()
        };

        try {
            await updateDoc(doc(topicsCol, topicId), updateData);
            showAlert('Đăng ký đề tài thành công!', true);
            closeModal('student-register-modal');
        } catch (error) {
            showAlert(`Lỗi khi đăng ký: ${error.message}`);
        }
    });

    // Import listeners
    document.getElementById('import-topics-btn').addEventListener('click', () => {
        document.getElementById('import-file-input').value = '';
        document.getElementById('import-log').innerHTML = '';
        document.getElementById('import-results-container').classList.add('hidden');
        openModal('import-data-modal');
    });
    document.getElementById('download-template-btn').addEventListener('click', downloadTemplateForTopics);
    document.getElementById('start-import-btn').addEventListener('click', handleTopicImport);

    // Filter listeners
    document.getElementById('filter-department').addEventListener('change', () => {
        const selectedDepId = document.getElementById('filter-department').value;
        updateLecturerFilterDropdown(selectedDepId);
        renderTopicsList();
    });
    document.getElementById('filter-lecturer').addEventListener('change', renderTopicsList);
    document.getElementById('filter-status').addEventListener('change', renderTopicsList);
}

// --- Data Snapshot Listeners ---
function setupOnSnapshotListeners() {
    onSnapshot(doc(settingsCol, 'appSettings'), (docSnapshot) => {
        const customYears = docSnapshot.exists() ? (docSnapshot.data().customYears || []) : [];
        const allYears = new Set([getCurrentAcademicYear(), ...customYears]);
        academicYears = Array.from(allYears).sort().reverse();
    }, (error) => console.error("Error listening to settings:", error));

    onSnapshot(query(departmentsCol), (snapshot) => {
        allDepartments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allDepartments.sort((a, b) => a.name.localeCompare(b.name));
        populateFilterDropdowns();
        renderTopicsList();
    }, (error) => console.error("Error listening to departments:", error));

    onSnapshot(query(lecturersCol), (snapshot) => {
        allLecturers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allLecturers.sort((a, b) => a.name.localeCompare(b.name));
        populateFilterDropdowns();
        renderTopicsList();
    }, (error) => console.error("Error listening to lecturers:", error));

    onSnapshot(query(topicsCol), (snapshot) => {
        allTopics = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allTopics.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        renderTopicsList();
    }, (error) => console.error("Error listening to topics:", error));
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
