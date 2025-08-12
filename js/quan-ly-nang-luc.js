// File: js/quan-ly-nang-luc.js
// Logic for the Teaching Capability Management module.

import { auth, db, appId } from './portal-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { collection, onSnapshot, doc, getDoc, setDoc, writeBatch, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Global State ---
const state = {
    currentUser: null,
    departments: [],
    lecturers: [],
    subjects: [],
    // capabilities is now managed by a real-time listener
    selectedDepartmentId: null,
    selectedLecturerId: null,
};

// --- Firebase Collection References ---
let usersCol, departmentsCol, lecturersCol, curriculumSubjectsCol, capabilitiesCol;

// --- UI Utility Functions ---
function showAlert(message, isSuccess = false) {
    const modal = document.getElementById('alert-modal');
    const title = document.getElementById('alert-title');
    if (!modal || !title) return;
    document.getElementById('alert-message').textContent = message;
    title.textContent = isSuccess ? "Thành công" : "Lỗi";
    title.className = `text-lg font-bold mb-4 ${isSuccess ? 'text-green-600' : 'text-red-600'}`;
    modal.style.display = 'block';
    document.getElementById('alert-ok-btn').onclick = () => modal.style.display = 'none';
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

// --- UI Rendering Functions ---
function updateUIForRole() {
    if (!state.currentUser) return;
    const isAdmin = state.currentUser.role === 'admin';
    const appContent = document.getElementById('app-content');
    if (!appContent) return;

    // Hide the entire page if not admin, as this is an admin-only feature
    if (!isAdmin) {
        appContent.innerHTML = `
            <div class="text-center p-10 bg-white rounded-lg shadow-md">
                <h1 class="text-2xl font-bold text-red-600">Không có quyền truy cập</h1>
                <p class="text-gray-600 mt-2">Chức năng này chỉ dành cho Quản trị viên.</p>
                <a href="quan-ly-lao-dong-a.html" class="mt-4 inline-block bg-blue-500 text-white font-bold py-2 px-4 rounded hover:bg-blue-600">Quay lại</a>
            </div>
        `;
        return; // Stop further rendering if not admin
    }
    const roleBadge = document.getElementById('user-role-badge');
    if (roleBadge) {
        roleBadge.textContent = isAdmin ? 'Admin' : 'Viewer';
        roleBadge.className = `ml-2 text-xs font-semibold px-2.5 py-0.5 rounded-full ${isAdmin ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`;
    }
}

function renderDepartmentSelect() {
    const select = document.getElementById('department-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- Chọn một khoa --</option>';
    state.departments.forEach(dep => {
        select.innerHTML += `<option value="${dep.id}">${dep.name}</option>`;
    });
}

function renderLecturerSelect() {
    const select = document.getElementById('lecturer-select');
    if (!select) return;
    select.innerHTML = '<option value="">-- Chọn giảng viên --</option>';
    
    if (!state.selectedDepartmentId) {
        select.disabled = true;
        return;
    }

    const lecturersInDept = state.lecturers.filter(l => l.departmentId === state.selectedDepartmentId);
    lecturersInDept.forEach(lec => {
        select.innerHTML += `<option value="${lec.id}">${lec.name} (${lec.code})</option>`;
    });
    select.disabled = false;
}

async function renderSubjectsList() {
    const container = document.getElementById('subjects-list-container');
    const placeholder = document.getElementById('subjects-placeholder');
    const saveBtn = document.getElementById('save-capabilities-btn');

    if (!container || !placeholder || !saveBtn) {
        return;
    }

    if (!state.selectedLecturerId || !state.selectedDepartmentId) {
        container.innerHTML = '';
        placeholder.classList.remove('hidden');
        placeholder.textContent = 'Vui lòng chọn khoa và giảng viên để xem danh sách học phần.';
        saveBtn.disabled = true;
        return;
    }

    placeholder.classList.add('hidden');
    container.innerHTML = '<div class="text-center text-gray-500 py-16"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải dữ liệu...</div>';

    // Data is now sourced from the real-time listener state
    const assignedSubjectIds = state.capabilities[state.selectedLecturerId] || [];

    const subjectsInDept = state.subjects.filter(s => s.departmentId === state.selectedDepartmentId);
    if (subjectsInDept.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 py-16">Khoa này chưa có học phần nào trong chương trình đào tạo.</p>';
        saveBtn.disabled = true;
        return;
    }

    let listHtml = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">';
    subjectsInDept.forEach(sub => {
        const isChecked = assignedSubjectIds.includes(sub.id);
        listHtml += `
            <label class="flex items-center p-3 bg-white border rounded-lg hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" data-subject-id="${sub.id}" class="h-5 w-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500" ${isChecked ? 'checked' : ''}>
                <span class="ml-3 text-sm text-gray-700">${sub.subjectName} (${sub.subjectCode})</span>
            </label>
        `;
    });
    listHtml += '</div>';

    container.innerHTML = listHtml;
    saveBtn.disabled = false;
}


// --- Data Handling Functions ---
async function saveCapabilities() {
    const btn = document.getElementById('save-capabilities-btn');
    if (!state.selectedLecturerId) {
        showAlert("Vui lòng chọn một giảng viên trước khi lưu.");
        return;
    }
    setButtonLoading(btn, true);

    const checkedBoxes = document.querySelectorAll('#subjects-list-container input[type="checkbox"]:checked');
    const selectedSubjectIds = Array.from(checkedBoxes).map(box => box.dataset.subjectId);

    try {
        const lecturerDocRef = doc(capabilitiesCol, state.selectedLecturerId);
        await setDoc(lecturerDocRef, { subjectIds: selectedSubjectIds });
        showAlert("Cập nhật năng lực giảng dạy thành công!", true);
    } catch (error) {
        console.error("Error saving capabilities: ", error);
        showAlert(`Đã xảy ra lỗi: ${error.message}`);
    } finally {
        setButtonLoading(btn, false);
    }
}

// --- Import Logic ---
function downloadCapabilityTemplate() {
    const filename = "Mau_Import_NangLuc.xlsx";
    const data = [{
        maGiangVien: "0214",
        maHocPhan: "INF101"
    },
    {
        maGiangVien: "0214",
        maHocPhan: "INF205"
    },
    {
        maGiangVien: "0219",
        maHocPhan: "INF101"
    }
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, filename);
}

async function handleCapabilityImport() {
    const btn = document.getElementById('start-import-btn');
    setButtonLoading(btn, true);

    const fileInput = document.getElementById('import-file-input');
    const logContainer = document.getElementById('import-log');
    
    document.getElementById('import-results-container').classList.remove('hidden');
    logContainer.innerHTML = 'Bắt đầu quá trình import...<br>';

    if (!fileInput.files.length) {
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
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

            if (jsonData.length === 0) throw new Error("File không có dữ liệu.");

            logContainer.innerHTML += `Đã đọc ${jsonData.length} dòng từ file. Đang xử lý...<br>`;

            // Step 1: Group subjects by lecturer code
            const capabilitiesMap = new Map();
            for (const row of jsonData) {
                const lecturerCode = String(row.maGiangVien || '').trim();
                const subjectCode = String(row.maHocPhan || '').trim();
                if (!lecturerCode || !subjectCode) continue;

                if (!capabilitiesMap.has(lecturerCode)) {
                    capabilitiesMap.set(lecturerCode, new Set());
                }
                capabilitiesMap.get(lecturerCode).add(subjectCode);
            }

            const batch = writeBatch(db);
            let successCount = 0;
            let errorCount = 0;

            // Step 2: Process each lecturer in the map
            for (const [lecturerCode, subjectCodesSet] of capabilitiesMap.entries()) {
                const lecturer = state.lecturers.find(l => l.code === lecturerCode);
                if (!lecturer) {
                    logContainer.innerHTML += `<span class="text-orange-500">- Lỗi: Không tìm thấy giảng viên có mã "${lecturerCode}".</span><br>`;
                    errorCount++;
                    continue;
                }

                const subjectIds = [];
                let hasError = false;
                for (const subjectCode of subjectCodesSet) {
                    const subject = state.subjects.find(s => s.subjectCode === subjectCode);
                    if (subject) {
                        subjectIds.push(subject.id);
                    } else {
                        logContainer.innerHTML += `<span class="text-orange-500">- Lỗi: Không tìm thấy môn học có mã "${subjectCode}" cho giảng viên ${lecturer.name}.</span><br>`;
                        hasError = true;
                    }
                }

                if (!hasError) {
                    const docRef = doc(capabilitiesCol, lecturer.id);
                    batch.set(docRef, { subjectIds: subjectIds });
                    successCount++;
                } else {
                    errorCount++;
                }
            }

            if (successCount > 0) {
                await batch.commit();
            }
            
            logContainer.innerHTML += `<hr class="my-2"><strong class="text-green-600">Hoàn thành!</strong><br>Cập nhật năng lực cho ${successCount} giảng viên, Lỗi: ${errorCount}.<br>`;

        } catch (error) {
            logContainer.innerHTML += `<span class="text-red-500">Đã xảy ra lỗi nghiêm trọng: ${error.message}</span><br>`;
        } finally {
            setButtonLoading(btn, false);
            fileInput.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

// --- Initialization and Event Listeners ---
function addEventListeners() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => signOut(auth));

    const deptSelect = document.getElementById('department-select');
    if (deptSelect) deptSelect.addEventListener('change', (e) => {
        state.selectedDepartmentId = e.target.value;
        state.selectedLecturerId = null; // Reset lecturer selection
        renderLecturerSelect();
        renderSubjectsList(); // Clear subjects list
    });

    const lecturerSelect = document.getElementById('lecturer-select');
    if(lecturerSelect) lecturerSelect.addEventListener('change', (e) => {
        state.selectedLecturerId = e.target.value;
        renderSubjectsList();
    });

    const saveBtn = document.getElementById('save-capabilities-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveCapabilities);

    // Import Modal Listeners
    const importModalBtn = document.getElementById('open-import-modal-btn');
    if (importModalBtn) importModalBtn.addEventListener('click', () => {
        document.getElementById('import-file-input').value = '';
        document.getElementById('import-log').innerHTML = '';
        document.getElementById('import-results-container').classList.add('hidden');
        document.getElementById('import-modal').style.display = 'block';
    });
    
    const downloadBtn = document.getElementById('download-template-btn');
    if(downloadBtn) downloadBtn.addEventListener('click', downloadCapabilityTemplate);
    
    const startImportBtn = document.getElementById('start-import-btn');
    if(startImportBtn) startImportBtn.addEventListener('click', handleCapabilityImport);
}

function attachBaseListeners() {
    const snapshotErrorHandler = (name) => (error) => console.error(`Error loading ${name}:`, error);
    
    const collectionsToLoad = [
        { name: 'departments', col: departmentsCol, state: state.departments, sort: (a, b) => a.name.localeCompare(b.name) },
        { name: 'lecturers', col: lecturersCol, state: state.lecturers, sort: (a, b) => a.name.localeCompare(b.name) },
        { name: 'subjects', col: curriculumSubjectsCol, state: state.subjects, sort: (a, b) => a.subjectName.localeCompare(b.subjectName) },
    ];

    collectionsToLoad.forEach(c => {
        onSnapshot(c.col, (snapshot) => {
            c.state.length = 0; // Clear previous state
            snapshot.docs.forEach(doc => c.state.push({ id: doc.id, ...doc.data() }));
            if (c.sort) c.state.sort(c.sort);
            
            if (c.name === 'departments') renderDepartmentSelect();
            if (state.selectedDepartmentId && c.name === 'lecturers') renderLecturerSelect();
            if (state.selectedLecturerId && c.name === 'subjects') renderSubjectsList();

        }, snapshotErrorHandler(c.name));
    });

    // *** NEW: Real-time listener for capabilities ***
    onSnapshot(capabilitiesCol, (snapshot) => {
        state.capabilities = {}; // Reset capabilities
        snapshot.docs.forEach(doc => {
            state.capabilities[doc.id] = doc.data().subjectIds || [];
        });
        // If a lecturer is currently selected, refresh their view
        if (state.selectedLecturerId) {
            renderSubjectsList();
        }
    }, snapshotErrorHandler('năng lực giảng dạy'));
}


async function initializeApp() {
    try {
        const basePath = `artifacts/${appId}/public/data`;
        
        // Define collection references
        usersCol = collection(db, `${basePath}/users`);
        departmentsCol = collection(db, `${basePath}/departments`);
        lecturersCol = collection(db, `${basePath}/lecturers`);
        curriculumSubjectsCol = collection(db, `${basePath}/curriculum_subjects`);
        capabilitiesCol = collection(db, `${basePath}/lecturer_capabilities`);

        onAuthStateChanged(auth, async (user) => {
            const appContent = document.getElementById('app-content');
            if (user) {
                const userDoc = await getDoc(doc(usersCol, user.uid));
                state.currentUser = userDoc.exists() ? { uid: user.uid, ...userDoc.data() } : { uid: user.uid, email: user.email, role: 'viewer' };
                
                if (document.getElementById('user-email')) {
                    document.getElementById('user-email').textContent = state.currentUser.email;
                }
                
                appContent.classList.remove('hidden');
                updateUIForRole();

                // Only attach listeners if user is an admin
                if (state.currentUser.role === 'admin') {
                    addEventListeners();
                    attachBaseListeners();
                }

            } else {
                window.location.href = 'index.html';
            }
        });
    } catch (error) {
        console.error("Firebase initialization error:", error);
        document.body.innerHTML = `<div class="text-center p-10">Lỗi khởi tạo. Vui lòng tải lại trang.</div>`;
    }
}

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});
