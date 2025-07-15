// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    onSnapshot,
    addDoc,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    writeBatch,
    query,
    where,
    deleteField 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Injects all necessary CSS styles into the document's head.
 * This ensures the application is styled correctly without relying on an external CSS file.
 */
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        body {
            font-family: 'Inter', sans-serif;
        }
        .modal {
            display: none;
            position: fixed;
            z-index: 50;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0,0,0,0.5);
            -webkit-animation-name: fadeIn;
            -webkit-animation-duration: 0.4s;
            animation-name: fadeIn;
            animation-duration: 0.4s
        }
        .modal-content {
            background-color: #fefefe;
            margin: 5% auto;
            padding: 24px;
            border: 1px solid #888;
            width: 90%;
            max-width: 800px;
            border-radius: 12px;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            -webkit-animation-name: slideIn;
            -webkit-animation-duration: 0.4s;
            animation-name: slideIn;
            animation-duration: 0.4s
        }
        @-webkit-keyframes slideIn {
            from {top: -300px; opacity: 0}
            to {top: 0; opacity: 1}
        }
        @keyframes slideIn {
            from {margin-top: -5%; opacity: 0}
            to {margin-top: 5%; opacity: 1}
        }
        @-webkit-keyframes fadeIn {
            from {opacity: 0}
            to {opacity: 1}
        }
        @keyframes fadeIn {
            from {opacity: 0}
            to {opacity: 1}
        }
        .close-button {
            color: #aaa;
            float: right;
            font-size: 28px;
            font-weight: bold;
        }
        .close-button:hover,
        .close-button:focus {
            color: black;
            text-decoration: none;
            cursor: pointer;
        }
        .tab-button.active {
            border-color: #2563eb;
            color: #2563eb;
            background-color: #eff6ff;
        }
        .dropdown {
            position: relative;
            display: inline-block;
        }
        .dropdown-content {
            display: none;
            position: absolute;
            right: 0;
            background-color: #f9f9f9;
            min-width: 220px;
            box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
            z-index: 10;
            border-radius: 8px;
            overflow: hidden;
        }
        .dropdown-content button {
            color: black;
            padding: 12px 16px;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 10px;
            width: 100%;
            text-align: left;
            font-weight: 500;
        }
        .dropdown-content button:hover {background-color: #e5e7eb}
        .dropdown:hover .dropdown-content {display: block;}
    `;
    document.head.appendChild(style);
}

// Default data for seeding
const DEFAULT_TASKS = [
    { name: "Tham gia các cuộc họp và sinh hoạt chuyên môn", unit: "buổi", hours: 6 },
    { name: "Tham gia hội thảo khoa học trong Trường", unit: "buổi", hours: 12 },
    { name: "Tham gia hội thảo khoa học ngoài Trường", unit: "buổi", hours: 20 },
    { name: "Tham gia thi THPT", unit: "nhiệm vụ", hours: 50 },
    { name: "Nghiên cứu trình bày chuyên đề mới", unit: "chuyên đề", hours: 45 },
    { name: "Dự giờ và đánh giá giảng viên khác", unit: "tiết", hours: 5 },
    { name: "Tham gia hoạt động phục vụ cộng đồng", unit: "hoạt động", hours: 12 },
    { name: "Tự học nâng cao Tin học, chuyên môn", unit: "khoá học", hours: 50 },
    { name: "Tự học nâng cao trình độ Ngoại ngữ", unit: "khoá học", hours: 100 },
    { name: "Hướng dẫn giảng viên tập sự, thử việc", unit: "nhiệm vụ", hours: 100 },
    { name: "Rà soát, chỉnh sửa chương trình đào tạo", unit: "buổi", hours: 12 },
    { name: "Thực hiện các nhiệm vụ khác được phân công", unit: "nhiệm vụ", hours: 12 },
    { name: "Đưa sinh viên đi trải nghiệm doanh nghiệp", unit: "ngày", hours: 15 }
];

// Global state object
let state = {
    currentUser: null, // { uid, email, role }
    departments: [],
    lecturers: [],
    entries: [],
    tasks: [],
    customYears: [],
    prioritySchedulerUID: null, // UID of the priority user
    selectedDepartmentId: null,
    selectedYear: null,
    currentLecturerIdForDetails: null, // To keep track of whose details are open
    foundEntriesToDelete: [], // For the bulk delete tool
    foundEntriesToEdit: [], // For the bulk edit tool
    statsEntries: [], // For the statistics tool
    statsSelectedLecturer: null, // For the statistics tool
    statsSelectedYear: null, // For the statistics tool
};

// Firebase variables
let db, auth;
let usersCol, departmentsCol, lecturersCol, tasksCol, entriesCol, settingsCol;
const SETTINGS_DOC_ID = 'appSettings';

// UI Elements
const loginPage = document.getElementById('login-page');
const moduleSelectionPage = document.getElementById('module-selection-page');
const appContent = document.getElementById('app-content');
const loginFormContainer = document.getElementById('login-form').parentElement;
const registerFormContainer = document.getElementById('register-form-container');

// --- Page Navigation Logic ---
/**
 * Reliably shows a single main page container and hides all others.
 * This prevents race conditions where multiple pages might be visible.
 * @param {string} pageIdToShow The ID of the page element to display ('login-page', 'module-selection-page', 'app-content').
 */
function showPage(pageIdToShow) {
    const pages = [loginPage, moduleSelectionPage, appContent];
    pages.forEach(page => {
        if (page.id === pageIdToShow) {
            page.classList.remove('hidden');
        } else {
            page.classList.add('hidden');
        }
    });
}

// --- Custom Alert/Confirm Modal Logic ---
function showAlert(message, isSuccess = false) {
    const modal = document.getElementById('alert-modal');
    const title = document.getElementById('alert-title');
    document.getElementById('alert-message').textContent = message;

    if (isSuccess) {
        title.textContent = "Thành công";
        title.className = "text-lg font-bold mb-4 text-green-600";
    } else {
        title.textContent = "Lỗi";
        title.className = "text-lg font-bold mb-4 text-red-600";
    }

    modal.style.display = 'block';
    document.getElementById('alert-ok-btn').onclick = () => {
        modal.style.display = 'none';
    };
}

function showConfirm(message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-message').textContent = message;
    const yesBtn = document.getElementById('confirm-btn-yes');
    const noBtn = document.getElementById('confirm-btn-no');

    const newYesBtn = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(newYesBtn, yesBtn);

    const close = () => modal.style.display = 'none';
    const confirmAndClose = () => {
        onConfirm();
        close();
    };
    newYesBtn.onclick = confirmAndClose;
    noBtn.onclick = close;
    modal.style.display = 'block';
}

function setButtonLoading(button, isLoading) {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        if (!button.dataset.originalHtml) {
            button.dataset.originalHtml = button.innerHTML;
        }
        button.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Đang xử lý...`;
    } else {
        button.disabled = false;
        if (button.dataset.originalHtml) {
            button.innerHTML = button.dataset.originalHtml;
            delete button.dataset.originalHtml;
        }
    }
}


// --- Date & Year Logic ---
/**
 * Formats a date string (e.g., 'YYYY-MM-DD') into 'dd/mm/yyyy' format.
 * Handles potential timezone issues by creating a UTC date object.
 * @param {string} dateString The date string from Firestore or input.
 * @returns {string} The formatted date string 'dd/mm/yyyy'.
 */
function formatDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return '';

    // Create a date object assuming UTC to avoid timezone shifts from local time.
    const date = new Date(dateString + 'T00:00:00Z');

    const day = String(date.getUTCDate()).padStart(2, '0');
    const month = String(date.getUTCMonth() + 1).padStart(2, '0'); // Months are 0-indexed
    const year = date.getUTCFullYear();

    if (isNaN(year)) return ''; // Return empty for invalid dates

    return `${day}/${month}/${year}`;
}

function getAcademicYear(date) {
    if (!date) return null;
    const d = new Date(date);
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-11
    if (month >= 7) { // Academic year starts in August (month 7)
        return `${year}-${year + 1}`;
    } else {
        return `${year - 1}-${year}`;
    }
}

function getCurrentAcademicYear() {
    return getAcademicYear(new Date());
}

function getYearsForSelect() {
    const yearsFromEntries = new Set(state.entries.map(e => e.academicYear || getAcademicYear(e.date)).filter(y => y));
    const customYearsSet = new Set(state.customYears);
    const allYears = new Set([ ...yearsFromEntries, ...customYearsSet, getCurrentAcademicYear() ]);
    return Array.from(allYears).sort().reverse();
}

// --- UI Rendering ---
function render() {
    renderDepartmentSelect();
    renderYearSelect();
    renderLecturerTable();
    renderDepartmentsList();
    renderLecturersList();
    renderTasksList();
}

function updateUIForRole() {
    if (!state.currentUser) return;
    const isAdmin = state.currentUser.role === 'admin';
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? 'block' : 'none';
    });

    // Hide/show priority-only buttons
    const isPriorityUser = state.currentUser.uid === state.prioritySchedulerUID;
    document.querySelectorAll('.priority-only').forEach(el => {
        el.style.display = isPriorityUser ? 'block' : 'none';
    });


    const roleBadge = document.getElementById('user-role-badge');
    if (isAdmin) {
        roleBadge.textContent = 'Admin';
        if (isPriorityUser) {
            roleBadge.textContent += ' (Ưu tiên)';
        }
        roleBadge.className = 'ml-2 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-green-100 text-green-800';
    } else {
        roleBadge.textContent = 'Viewer';
        roleBadge.className = 'ml-2 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-800';
    }
}

function renderDepartmentSelect() {
    const select = document.getElementById('department-select');
    const currentVal = select.value;
    select.innerHTML = '<option value="all">-- Tất cả các Khoa --</option>';
    state.departments.forEach(dep => {
        const option = document.createElement('option');
        option.value = dep.id;
        option.textContent = dep.name;
        select.appendChild(option);
    });
    select.value = currentVal;
}

function renderYearSelect() {
    const select = document.getElementById('year-select');
    const sortedYears = getYearsForSelect();
    select.innerHTML = '';
    sortedYears.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `Năm học ${year}`;
        option.selected = year === state.selectedYear;
        select.appendChild(option);
    });
}

function renderLecturerTable() {
    const tableBody = document.getElementById('lecturers-table-body');
    const departmentTitle = document.getElementById('department-title');
    tableBody.innerHTML = '';

    // Filter lecturers based on the selected department
    let filteredLecturers = state.lecturers;
    if (state.selectedDepartmentId && state.selectedDepartmentId !== 'all') {
        filteredLecturers = state.lecturers.filter(l => l.departmentId === state.selectedDepartmentId);
        const dep = state.departments.find(d => d.id === state.selectedDepartmentId);
        departmentTitle.textContent = `Khoa ${dep ? dep.name : ''}`;
    } else {
        departmentTitle.textContent = 'Toàn trường';
    }

    if (filteredLecturers.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-gray-500">Chưa có giảng viên nào trong khoa này.</td></tr>`;
        return;
    }

    // Create an array with lecturers and their total hours
    const lecturersWithHours = filteredLecturers.map(lecturer => {
        const totalHours = state.entries
            .filter(e => e.lecturerId === lecturer.id && (e.academicYear ? e.academicYear === state.selectedYear : getAcademicYear(e.date) === state.selectedYear))
            .reduce((sum, e) => sum + e.hours, 0);
        return { lecturer, totalHours };
    });

    // Sort the array by totalHours in descending order
    lecturersWithHours.sort((a, b) => b.totalHours - a.totalHours);

    // Render the sorted list
    lecturersWithHours.forEach((item, index) => {
        const { lecturer, totalHours } = item;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">${index + 1}</td>
            <td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900">${lecturer.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500">${lecturer.code}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center font-bold text-lg text-red-600">${totalHours}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <button class="text-blue-600 hover:text-blue-800" onclick="showDetails('${lecturer.id}')">Xem chi tiết</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function renderDepartmentsList() {
    const listBody = document.getElementById('departments-list-body');
    listBody.innerHTML = '';
    state.departments.forEach(dep => {
        const row = document.createElement('tr');
        row.className = "border-b";
        row.innerHTML = `
            <td class="px-4 py-2">${dep.name}</td>
            <td class="px-4 py-2 text-center">
                <button class="text-blue-500 mr-2" onclick="editDepartment('${dep.id}')"><i class="fas fa-edit"></i></button>
                <button class="text-red-500" onclick="deleteDepartment('${dep.id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        listBody.appendChild(row);
    });
}

function renderLecturersList() {
    const listBody = document.getElementById('lecturers-list-body');
    const formDepSelect = document.getElementById('lecturer-department');
    const filterDepSelect = document.getElementById('filter-lecturer-by-department');

    // Populate the department dropdown inside the form for adding/editing a lecturer
    const currentFormDepVal = formDepSelect.value;
    formDepSelect.innerHTML = '<option value="">-- Chọn Khoa --</option>';
    state.departments.forEach(dep => {
        const option = document.createElement('option');
        option.value = dep.id;
        option.textContent = dep.name;
        formDepSelect.appendChild(option);
    });
    formDepSelect.value = currentFormDepVal;

    // Filter the list of lecturers based on the filter dropdown
    const selectedFilterDepId = filterDepSelect.value;
    let filteredLecturers = state.lecturers;
    if (selectedFilterDepId && selectedFilterDepId !== 'all') {
        filteredLecturers = state.lecturers.filter(l => l.departmentId === selectedFilterDepId);
    }

    // Render the filtered list into the table
    listBody.innerHTML = '';
    if (filteredLecturers.length === 0) {
        listBody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-gray-500">Không có giảng viên nào trong khoa được chọn.</td></tr>`;
        return;
    }
    
    filteredLecturers.forEach(lecturer => {
        const department = state.departments.find(d => d.id === lecturer.departmentId);
        const row = document.createElement('tr');
        row.className = "border-b";
        
        const isLinkedToCurrentUser = lecturer.linkedUid === state.currentUser.uid;
        const isLinkedToAnotherUser = lecturer.linkedUid && lecturer.linkedUid !== state.currentUser.uid;
        
        let linkButtonHtml = '';
        if (isLinkedToCurrentUser) {
            linkButtonHtml = `<button class="text-red-500 hover:text-red-700" title="Hủy liên kết tài khoản này" onclick="window.unlinkLecturer('${lecturer.id}')"><i class="fas fa-unlink fa-lg"></i></button>`;
        } else if (isLinkedToAnotherUser) {
            linkButtonHtml = `<span class="text-gray-400" title="Đã liên kết với tài khoản khác"><i class="fas fa-lock fa-lg"></i></span>`;
        } else {
            linkButtonHtml = `<button class="text-blue-500 hover:text-blue-700" title="Gắn giảng viên này vào tài khoản của bạn" onclick="window.linkLecturerToCurrentUser('${lecturer.id}')"><i class="fas fa-link fa-lg"></i></button>`;
        }

        row.innerHTML = `
            <td class="px-4 py-2">${lecturer.name}</td>
            <td class="px-4 py-2">${lecturer.code}</td>
            <td class="px-4 py-2">${department?.name || 'Chưa phân khoa'}</td>
            <td class="px-4 py-2 text-center">
                <button class="text-blue-500 mr-2" onclick="editLecturer('${lecturer.id}')"><i class="fas fa-edit"></i></button>
                <button class="text-red-500" onclick="deleteLecturer('${lecturer.id}')"><i class="fas fa-trash"></i></button>
            </td>
            <td class="px-4 py-2 text-center">
                ${linkButtonHtml}
            </td>
        `;
        listBody.appendChild(row);
    });
}

function renderTasksList() {
    const listBody = document.getElementById('tasks-list-body');
    listBody.innerHTML = '';
    state.tasks.forEach(task => {
        const row = document.createElement('tr');
        row.className = "border-b";
        row.innerHTML = `
            <td class="px-4 py-2">${task.name}</td>
            <td class="px-4 py-2">${task.unit}</td>
            <td class="px-4 py-2 text-center font-semibold">${task.hours}</td>
            <td class="px-4 py-2 text-center">
                <button class="text-blue-500 mr-2" onclick="editTask('${task.id}')"><i class="fas fa-edit"></i></button>
                <button class="text-red-500" onclick="deleteTask('${task.id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        listBody.appendChild(row);
    });
}

function renderLecturerChecklistInModal(departmentId) {
    const checklist = document.getElementById('lecturer-checklist');
    checklist.innerHTML = '';
    const lecturersInDept = state.lecturers.filter(l => l.departmentId === departmentId);
    document.getElementById('select-all-lecturers').checked = false;

    if (lecturersInDept.length > 0) {
        lecturersInDept.forEach(lecturer => {
            const div = document.createElement('div');
            div.className = 'flex items-center';
            div.innerHTML = `
                <input type="checkbox" id="lecturer-${lecturer.id}" name="lecturer" value="${lecturer.id}" class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 lecturer-checkbox">
                <label for="lecturer-${lecturer.id}" class="ml-2 text-sm text-gray-700">${lecturer.name}</label>
            `;
            checklist.appendChild(div);
        });
    } else {
        checklist.innerHTML = '<p class="text-gray-500 text-sm">Không có giảng viên nào trong khoa được chọn.</p>';
    }
}

function renderBulkAddModal() {
    const modalDepSelect = document.getElementById('bulk-add-department-select');
    modalDepSelect.innerHTML = '';
    state.departments.forEach(dep => {
        const option = document.createElement('option');
        option.value = dep.id;
        option.textContent = dep.name;
        modalDepSelect.appendChild(option);
    });
    if (state.selectedDepartmentId && state.selectedDepartmentId !== 'all') {
         modalDepSelect.value = state.selectedDepartmentId;
    }

    const modalYearSelect = document.getElementById('bulk-add-year-select');
    modalYearSelect.innerHTML = '';
    getYearsForSelect().forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `Năm học ${year}`;
        modalYearSelect.appendChild(option);
    });
    modalYearSelect.value = state.selectedYear;

    renderLecturerChecklistInModal(modalDepSelect.value);

    const taskSelect = document.getElementById('task-select');
    taskSelect.innerHTML = '';
    state.tasks.forEach(task => {
        const option = document.createElement('option');
        option.value = task.id;
        option.textContent = task.name;
        taskSelect.appendChild(option);
    });

    const today = new Date().toISOString().split('T')[0];
    document.getElementById('entry-date').value = today;
    document.getElementById('custom-entry-date').value = today;
    document.getElementById('end-date').value = '';
    document.getElementById('custom-end-date').value = '';
    document.getElementById('start-time').value = '';
    document.getElementById('end-time').value = '';
    document.getElementById('custom-start-time').value = '';
    document.getElementById('custom-end-time').value = '';
    document.getElementById('predefined-notes').value = '';
    document.getElementById('custom-notes').value = '';

    updateCalculatedHours();
}

function updateCalculatedHours() {
    const taskId = document.getElementById('task-select').value;
    const quantity = document.getElementById('task-quantity').value;
    const task = state.tasks.find(t => t.id === taskId);
    if (task && quantity > 0) {
        const total = task.hours * quantity;
        document.getElementById('calculated-hours').textContent = `${total} giờ`;
    } else {
        document.getElementById('calculated-hours').textContent = `0 giờ`;
    }
}

function clearTaskForm() {
    document.getElementById('task-form').reset();
    document.getElementById('task-id').value = '';
}

async function renderUsersList() {
    const listBody = document.getElementById('users-list-body');
    listBody.innerHTML = '<tr><td colspan="3" class="text-center p-4">Đang tải...</td></tr>';
    try {
        const usersSnapshot = await getDocs(usersCol);
        listBody.innerHTML = '';
        if (usersSnapshot.empty) {
            listBody.innerHTML = '<tr><td colspan="3" class="text-center p-4">Không có người dùng nào.</td></tr>';
            return;
        }
        usersSnapshot.forEach(userDoc => {
            const userData = userDoc.data();
            const isCurrentUser = state.currentUser.uid === userDoc.id;
            const isPriorityUser = userDoc.id === state.prioritySchedulerUID; // Check if this is the priority user
            const isDisabled = isCurrentUser || isPriorityUser; // Disable if it's the current user OR the priority user

            const row = document.createElement('tr');
            row.className = "border-b";
            row.innerHTML = `
                <td class="px-4 py-2">${userData.email} ${isPriorityUser ? '<span class="text-xs font-bold text-teal-600 ml-2">(Ưu tiên)</span>' : ''}</td>
                <td class="px-4 py-2">
                    <select data-uid="${userDoc.id}" class="role-select p-1 border rounded-md w-full" ${isDisabled ? 'disabled' : ''}>
                        <option value="viewer" ${userData.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                        <option value="admin" ${userData.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                </td>
                <td class="px-4 py-2 text-center">
                    <div class="flex justify-center items-center gap-2">
                        <button data-uid="${userDoc.id}" class="save-role-btn bg-green-500 hover:bg-green-600 text-white text-xs py-1 px-2 rounded" ${isDisabled ? 'disabled' : ''}>Lưu</button>
                        <button data-email="${userData.email}" class="reset-password-btn bg-blue-500 hover:bg-blue-600 text-white text-xs py-1 px-2 rounded" ${isDisabled ? 'disabled' : ''}>Reset Pass</button>
                        <button data-uid="${userDoc.id}" class="delete-user-btn bg-red-500 hover:bg-red-600 text-white text-xs py-1 px-2 rounded" ${isDisabled ? 'disabled' : ''}>Xóa</button>
                    </div>
                </td>
            `;
            listBody.appendChild(row);
        });
    } catch (error) {
        listBody.innerHTML = `<tr><td colspan="3" class="text-center p-4 text-red-500">Lỗi tải danh sách người dùng.</td></tr>`;
        console.error("Error rendering users list:", error);
    }
}

function renderResultsList(listDiv, entries) {
    listDiv.innerHTML = '';
    if (entries.length > 0) {
        const list = document.createElement('ul');
        list.className = 'divide-y divide-gray-200';
        entries.forEach(entry => {
            const lecturer = state.lecturers.find(l => l.id === entry.lecturerId);
            const item = document.createElement('li');
            item.className = 'py-2 text-sm';
            item.innerHTML = `<b>${lecturer ? lecturer.name : 'N/A'}</b>: ${entry.description} (${formatDate(entry.date)}) - <i>${entry.hours} giờ</i>`;
            list.appendChild(item);
        });
        listDiv.appendChild(list);
    }
}

// --- REPORT GENERATION FUNCTIONS ---

function generateLecturerReportHtml() {
    const lecturer = state.statsSelectedLecturer;
    const entries = state.statsEntries;
    const year = state.statsSelectedYear;

    if (!lecturer || !entries || !year) {
        throw new Error("Không có đủ thông tin để tạo báo cáo. Vui lòng nhấn 'Xem thống kê' trước.");
    }

    const department = state.departments.find(d => d.id === lecturer.departmentId);
    if (!department) {
        throw new Error(`Không thể tìm thấy khoa cho giảng viên ${lecturer.name}.`);
    }

    const totalHours = entries.reduce((sum, e) => sum + e.hours, 0);
    const now = new Date();

    const entriesHtml = entries.map((entry, index) => `
        <tr>
            <td style="text-align: center;">${index + 1}</td>
            <td>${entry.description}</td>
            <td style="text-align: center;">${formatDate(entry.date)}</td>
            <td style="text-align: center;">${entry.hours}</td>
            <td>${entry.notes || ''}</td>
        </tr>
    `).join('');

    return `
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <title>Báo cáo giờ lao động - ${lecturer.name} - ${year}</title>
            <style>
                body { font-family: 'Times New Roman', Times, serif; font-size: 13pt; margin: 0; background-color: #f0f4f8; display: flex; justify-content: center; padding: 20px; }
                .page { background: white; padding: 2.5cm; width: 21cm; min-height: 29.7cm; box-shadow: 0 0 0.5cm rgba(0,0,0,0.5); }
                table { width: 100%; border-collapse: collapse; border: 1px solid black; font-size: 13pt; margin-top: 20px; }
                th, td { border: 1px solid black; padding: 8px; vertical-align: top; }
                th { font-weight: bold; text-align: center; }
                .header-container { display: flex; justify-content: space-between; text-align: center; }
                .header-container p { margin: 0; }
                .header-container hr { width: 50%; margin: 4px auto; border-top: 1px solid black; }
                .report-title { text-align: center; font-weight: bold; font-size: 16pt; margin-top: 40px; margin-bottom: 20px; }
                .info-p { font-size: 14pt; margin-bottom: 15px; }
                .info-p span { font-weight: bold; }
                .footer-container { display: flex; justify-content: flex-end; margin-top: 50px; }
                .footer-container div { text-align: center; width: 50%; }
                .print-btn-container { text-align: center; margin-bottom: 20px; }
                @media print {
                    body { background-color: white; padding: 0; }
                    .print-btn-container { display: none; }
                    .page { box-shadow: none; margin: 0; padding: 0; }
                }
            </style>
        </head>
        <body>
            <div class="page">
                 <div class="print-btn-container">
                    <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        <i class="fas fa-print"></i> In ra PDF / Lưu file
                    </button>
                </div>
                <div class="header-container">
                    <div>
                        <p style="text-transform: uppercase;">TRƯỜNG ĐẠI HỌC HẢI PHÒNG</p>
                        <p style="text-transform: uppercase; font-weight: bold;">${department.name}</p>
                        <hr>
                    </div>
                    <div>
                        <p style="font-weight: bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                        <p style="font-weight: bold;">Độc lập - Tự do - Hạnh phúc</p>
                        <hr>
                    </div>
                </div>

                <h2 class="report-title">
                    BẢNG TỔNG HỢP GIỜ LAO ĐỘNG KHÁC<br>
                    NĂM HỌC ${year}
                </h2>

                <p class="info-p">Họ và tên giảng viên: <span>${lecturer.name}</span></p>
                <p class="info-p">Mã giảng viên: <span>${lecturer.code}</span></p>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 5%;">STT</th>
                            <th style="width: 45%;">Nội dung công việc</th>
                            <th style="width: 20%;">Thời gian thực hiện</th>
                            <th style="width: 10%;">Số giờ</th>
                            <th>Ghi chú</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${entriesHtml}
                        <tr>
                            <td colspan="3" style="text-align: right; font-weight: bold;">Tổng cộng</td>
                            <td style="text-align: center; font-weight: bold;">${totalHours}</td>
                            <td></td>
                        </tr>
                    </tbody>
                </table>

                <div class="footer-container">
                    <div>
                        <p>Hải Phòng, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}</p>
                        <p style="font-weight: bold; margin-top: 15px;">Người lập biểu</p>
                        <p style="font-style: italic; margin-top: 5px; margin-bottom: 80px;">(Ký và ghi rõ họ tên)</p>
                        <p style="font-weight: bold;">${lecturer.name}</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
}

function generateDepartmentReportHtml() {
    const depId = document.getElementById('stats-department-select').value;
    const year = document.getElementById('stats-year-select').value;

    if (!depId) { throw new Error('Vui lòng chọn một khoa để xuất báo cáo.'); }
    if (!year) { throw new Error('Vui lòng chọn năm học để xuất báo cáo.'); }

    const department = state.departments.find(d => d.id === depId);
    const lecturersInDep = state.lecturers.filter(l => l.departmentId === depId);

    const lecturersWithHours = lecturersInDep.map(lecturer => {
        const totalHours = state.entries
            .filter(entry => entry.lecturerId === lecturer.id && (entry.academicYear ? entry.academicYear === year : getAcademicYear(entry.date) === year))
            .reduce((sum, entry) => sum + entry.hours, 0);
        return { lecturer, totalHours };
    });
    
    // Sắp xếp danh sách giảng viên theo tổng số giờ giảm dần
    lecturersWithHours.sort((a, b) => b.totalHours - a.totalHours);

    const grandTotalHours = lecturersWithHours.reduce((sum, item) => sum + item.totalHours, 0);
    const now = new Date();

    const tableBodyHtml = lecturersWithHours.length > 0 ?
        lecturersWithHours.map((item, index) => `
            <tr>
                <td style="text-align: center;">${index + 1}</td>
                <td>${item.lecturer.name}</td>
                <td style="text-align: center;">${item.lecturer.code}</td>
                <td style="text-align: center;">${item.totalHours}</td>
                <td></td>
            </tr>
        `).join('') +
        `<tr>
            <td colspan="3" style="text-align: right; font-weight: bold;">TỔNG CỘNG</td>
            <td style="text-align: center; font-weight: bold;">${grandTotalHours}</td>
            <td></td>
        </tr>`
        : '<tr><td colspan="5" style="text-align: center; padding: 20px; font-style: italic;">Không có dữ liệu giờ lao động cho khoa trong năm học này.</td></tr>';

    return `
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <title>Báo cáo tổng hợp - ${department.name} - ${year}</title>
            <style>
                body { font-family: 'Times New Roman', Times, serif; font-size: 13pt; margin: 0; background-color: #f0f4f8; display: flex; justify-content: center; padding: 20px; }
                .page { background: white; padding: 2.5cm; width: 21cm; min-height: 29.7cm; box-shadow: 0 0 0.5cm rgba(0,0,0,0.5); }
                table { width: 100%; border-collapse: collapse; border: 1px solid black; font-size: 13pt; margin-top: 20px; }
                th, td { border: 1px solid black; padding: 8px; text-align: left; vertical-align: top;}
                th { font-weight: bold; text-align: center; }
                .header-container { display: flex; justify-content: space-between; text-align: center; }
                .header-container p { margin: 0; }
                .header-container hr { width: 50%; margin: 4px auto; border-top: 1px solid black; }
                .report-title { text-align: center; font-weight: bold; font-size: 16pt; margin-top: 40px; margin-bottom: 20px; }
                .footer-container { display: flex; justify-content: space-between; margin-top: 50px; }
                .footer-container div { text-align: center; flex-basis: 50%; }
                .print-btn-container { text-align: center; margin-bottom: 20px; }
                @media print {
                    body { background-color: white; padding: 0; }
                    .print-btn-container { display: none; }
                    .page { box-shadow: none; margin: 0; padding: 0; }
                }
            </style>
        </head>
        <body>
            <div class="page">
                <div class="print-btn-container">
                    <button onclick="window.print()" style="padding: 10px 20px; font-size: 16px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        <i class="fas fa-print"></i> In ra PDF / Lưu file
                    </button>
                </div>
                <div class="header-container">
                    <div>
                        <p style="text-transform: uppercase;">TRƯỜNG ĐẠI HỌC HẢI PHÒNG</p>
                        <p style="text-transform: uppercase; font-weight: bold;">${department.name}</p>
                        <hr>
                    </div>
                    <div>
                        <p style="font-weight: bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p>
                        <p style="font-weight: bold;">Độc lập - Tự do - Hạnh phúc</p>
                        <hr>
                    </div>
                </div>

                <h2 class="report-title">
                    BẢNG TỔNG HỢP GIỜ LAO ĐỘNG KHÁC<br>
                    NĂM HỌC ${year}
                </h2>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 5%;">STT</th>
                            <th style="width: 35%;">Họ và Tên</th>
                            <th style="width: 20%;">Mã Giảng viên</th>
                            <th style="width: 20%;">Tổng giờ quy đổi</th>
                            <th style="width: 20%;">Ký nhận</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableBodyHtml}
                    </tbody>
                </table>

                <div class="footer-container">
                    <div>
                        <p style="font-weight: bold;">TRƯỞNG KHOA</p>
                        <p style="font-style: italic; margin-top: 5px;">(Ký và ghi rõ họ tên)</p>
                    </div>
                    <div>
                        <p>Hải Phòng, ngày ${now.getDate()} tháng ${now.getMonth() + 1} năm ${now.getFullYear()}</p>
                        <p style="font-weight: bold; margin-top: 15px;">NGƯỜI LẬP BIỂU</p>
                        <p style="font-style: italic; margin-top: 5px;">(Ký và ghi rõ họ tên)</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
    `;
}


// --- Global Functions (for inline onclick) ---
window.openModal = (modalId) => document.getElementById(modalId).style.display = 'block';
window.closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    modal.style.display = 'none';
}
window.onclick = (event) => {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = "none";
    }
};

window.switchTab = (tabName) => {
    const predefinedForm = document.getElementById('predefined-task-form');
    const customForm = document.getElementById('custom-task-form');
    const predefinedInputs = predefinedForm.querySelectorAll('select, input, textarea');
    const customInputs = customForm.querySelectorAll('textarea, input');

    if (tabName === 'predefined') {
        predefinedForm.style.display = 'grid';
        customForm.style.display = 'none';
        predefinedInputs.forEach(input => input.disabled = false);
        customInputs.forEach(input => input.disabled = true);
    } else {
        predefinedForm.style.display = 'none';
        customForm.style.display = 'grid';
        predefinedInputs.forEach(input => input.disabled = true);
        customInputs.forEach(input => input.disabled = false);
    }

    document.getElementById('tab-predefined').classList.toggle('active', tabName === 'predefined');
    document.getElementById('tab-custom').classList.toggle('active', tabName === 'custom');
};

window.showDetails = (lecturerId) => {
    state.currentLecturerIdForDetails = lecturerId;
    const lecturer = state.lecturers.find(l => l.id === lecturerId);
    const lecturerEntries = state.entries
        .filter(e => e.lecturerId === lecturerId && (e.academicYear ? e.academicYear === state.selectedYear : getAcademicYear(e.date) === state.selectedYear))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    document.getElementById('details-title').textContent = `Chi tiết giờ LĐ (${state.selectedYear}) - ${lecturer.name}`;
    const contentDiv = document.getElementById('details-content');
    contentDiv.innerHTML = '';

    const detailsControls = document.getElementById('details-controls');
    if (lecturerEntries.length > 0 && state.currentUser.role === 'admin') {
        detailsControls.style.display = 'flex';
    } else {
        detailsControls.style.display = 'none';
    }
    document.getElementById('select-all-entries').checked = false;

    if (lecturerEntries.length === 0) {
        contentDiv.innerHTML = '<p class="text-gray-500 p-4">Chưa có giờ lao động nào được ghi nhận trong năm học này.</p>';
    } else {
        const list = document.createElement('ul');
        list.className = 'divide-y divide-gray-200';
        lecturerEntries.forEach(entry => {
            const item = document.createElement('li');
            item.className = 'py-3 px-2 flex items-center gap-3';

            const controlsHtml = state.currentUser.role === 'admin' ?
                `<div class="flex items-center gap-2">
                    <input type="checkbox" data-entry-id="${entry.id}" class="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 entry-checkbox">
                    <button onclick="openEditEntryModal('${entry.id}')" class="text-blue-500 hover:text-blue-700" title="Sửa mục này"><i class="fas fa-edit"></i></button>
                 </div>` : '';

            let dateInfo = formatDate(entry.date);
            if (entry.endDate && entry.endDate !== entry.date) {
                dateInfo = `Từ ${dateInfo} đến ${formatDate(entry.endDate)}`;
            }

            let timeInfo = '';
            if (entry.startTime && entry.endTime) {
                timeInfo = ` - Từ ${entry.startTime} đến ${entry.endTime}`;
            } else if (entry.startTime) {
                timeInfo = ` - Bắt đầu lúc ${entry.startTime}`;
            }

            let notesInfo = '';
            if (entry.notes) {
                notesInfo = `<p class="text-sm text-gray-600 italic mt-1 pl-2 border-l-2 border-gray-300">Ghi chú: ${entry.notes}</p>`;
            }

            item.innerHTML = `
                ${controlsHtml}
                <div class="flex-grow">
                    <p class="text-sm font-medium text-gray-800">${entry.description}</p>
                    <p class="text-sm text-gray-500">${dateInfo}${timeInfo}</p>
                    ${notesInfo}
                </div>
                <div class="text-right">
                    <p class="text-md font-bold text-green-600">${entry.hours} giờ</p>
                </div>
            `;
            list.appendChild(item);
        });
        contentDiv.appendChild(list);
    }
    openModal('details-modal');
};

window.openEditEntryModal = (entryId) => {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry) {
        showAlert("Không tìm thấy mục cần sửa.");
        return;
    }

    document.getElementById('edit-entry-id').value = entry.id;
    document.getElementById('edit-entry-description').value = entry.description;
    document.getElementById('edit-entry-hours').value = entry.hours;
    document.getElementById('edit-entry-date').value = entry.date;
    document.getElementById('edit-entry-end-date').value = entry.endDate || '';
    document.getElementById('edit-entry-start-time').value = entry.startTime || '';
    document.getElementById('edit-entry-end-time').value = entry.endTime || '';
    document.getElementById('edit-entry-notes').value = entry.notes || '';

    const descTextarea = document.getElementById('edit-entry-description');
    if (entry.description.startsWith('Nhiệm vụ khác:')) {
        descTextarea.readOnly = false;
        descTextarea.classList.remove('bg-gray-100');
    } else {
        descTextarea.readOnly = true;
        descTextarea.classList.add('bg-gray-100');
    }


    openModal('edit-entry-modal');
};

window.editDepartment = (id) => {
    const dep = state.departments.find(d => d.id === id);
    document.getElementById('department-id').value = dep.id;
    document.getElementById('department-name').value = dep.name;
};

window.deleteDepartment = (id) => {
    showConfirm('Bạn có chắc muốn xóa khoa này? Việc này sẽ xóa tất cả giảng viên và giờ lao động liên quan.', async () => {
        const batch = writeBatch(db);
        const lecturerQuery = query(lecturersCol, where("departmentId", "==", id));
        const lecturerSnapshot = await getDocs(lecturerQuery);
        const lecturerIds = lecturerSnapshot.docs.map(d => d.id);
        lecturerSnapshot.forEach(doc => batch.delete(doc.ref));
        if (lecturerIds.length > 0) {
            const entryQuery = query(entriesCol, where("lecturerId", "in", lecturerIds));
            const entrySnapshot = await getDocs(entryQuery);
            entrySnapshot.forEach(doc => batch.delete(doc.ref));
        }
        batch.delete(doc(departmentsCol, id));
        await batch.commit();
    });
};

window.editLecturer = (id) => {
    const lecturer = state.lecturers.find(l => l.id === id);
    document.getElementById('lecturer-id').value = lecturer.id;
    document.getElementById('lecturer-name').value = lecturer.name;
    document.getElementById('lecturer-code').value = lecturer.code;
    document.getElementById('lecturer-department').value = lecturer.departmentId;
    document.getElementById('lecturer-phone').value = lecturer.soDienThoai || '';
};

window.deleteLecturer = (id) => {
    showConfirm('Bạn có chắc muốn xóa giảng viên này? Mọi giờ lao động của họ cũng sẽ bị xóa.', async () => {
        const batch = writeBatch(db);
        batch.delete(doc(lecturersCol, id));
        const entryQuery = query(entriesCol, where("lecturerId", "==", id));
        const entrySnapshot = await getDocs(entryQuery);
        entrySnapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    });
};

window.editTask = (id) => {
    const task = state.tasks.find(t => t.id === id);
    if (task) {
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-name').value = task.name;
        document.getElementById('task-unit').value = task.unit;
        document.getElementById('task-hours').value = task.hours;
    }
};
window.deleteTask = (id) => {
    showConfirm('Bạn có chắc muốn xóa nhiệm vụ này?', async () => {
        await deleteDoc(doc(tasksCol, id));
    });
};

// NEW: Function to link a lecturer record to the current user's account
window.linkLecturerToCurrentUser = async (lecturerId) => {
    const lecturerToLink = state.lecturers.find(l => l.id === lecturerId);
    if (!lecturerToLink) {
        showAlert("Không tìm thấy giảng viên để liên kết.");
        return;
    }

    const currentlyLinkedLecturer = state.lecturers.find(l => l.linkedUid === state.currentUser.uid);
    if (currentlyLinkedLecturer) {
        showAlert(`Tài khoản của bạn đã được liên kết với giảng viên "${currentlyLinkedLecturer.name}". Vui lòng hủy liên kết trước.`);
        return;
    }

    showConfirm(`Bạn có chắc muốn liên kết tài khoản của mình với giảng viên "${lecturerToLink.name}"?`, async () => {
        try {
            await updateDoc(doc(lecturersCol, lecturerId), {
                linkedUid: state.currentUser.uid
            });
            showAlert("Liên kết tài khoản thành công!", true);
        } catch (error) {
            console.error("Error linking lecturer:", error);
            showAlert(`Lỗi khi liên kết tài khoản: ${error.message}`);
        }
    });
};

// NEW: Function to unlink a lecturer
window.unlinkLecturer = async (lecturerId) => {
    const lecturerToUnlink = state.lecturers.find(l => l.id === lecturerId);
    if (!lecturerToUnlink) {
        showAlert("Không tìm thấy giảng viên.");
        return;
    }

    showConfirm(`Bạn có chắc muốn hủy liên kết tài khoản khỏi giảng viên "${lecturerToUnlink.name}"?`, async () => {
        try {
            await updateDoc(doc(lecturersCol, lecturerId), {
                linkedUid: deleteField()
            });
            showAlert("Hủy liên kết thành công!", true);
        } catch (error) {
            console.error("Error unlinking lecturer:", error);
            showAlert(`Lỗi khi hủy liên kết: ${error.message}`);
        }
    });
};

// --- Inactivity Logout Logic ---
let inactivityTimer;
const activityEvents = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'];

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        showAlert('Bạn đã không hoạt động trong 10 phút và sẽ được tự động đăng xuất.');
        setTimeout(() => {
            if (auth.currentUser) {
                signOut(auth);
            }
        }, 3000);
    }, 600000); // 10 minutes in milliseconds
}

function setupInactivityListeners() {
    activityEvents.forEach(event => {
        window.addEventListener(event, resetInactivityTimer, true);
    });
}

function clearInactivityListeners() {
     activityEvents.forEach(event => {
        window.removeEventListener(event, resetInactivityTimer, true);
    });
    clearTimeout(inactivityTimer);
}

// --- NEW: DUPLICATE CLEANUP LOGIC ---
async function cleanupDuplicateLecturers(btn) {
    setButtonLoading(btn, true);
    try {
        const allLecturersSnapshot = await getDocs(lecturersCol);
        const allLecturers = allLecturersSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));

        const lecturerGroups = new Map();
        allLecturers.forEach(lecturer => {
            if (!lecturer.code) return; // Skip lecturers without a code
            const code = lecturer.code.trim().toLowerCase();
            if (!lecturerGroups.has(code)) {
                lecturerGroups.set(code, []);
            }
            lecturerGroups.get(code).push(lecturer);
        });

        const duplicatesToProcess = [];
        for (const [code, group] of lecturerGroups.entries()) {
            if (group.length > 1) {
                // Sort by name to have a consistent master, or just pick the first one
                group.sort((a, b) => a.name.localeCompare(b.name));
                const master = group[0];
                const duplicates = group.slice(1);
                duplicatesToProcess.push({ master, duplicates });
            }
        }

        if (duplicatesToProcess.length === 0) {
            showAlert("Không tìm thấy giảng viên nào bị trùng lặp.", true);
            setButtonLoading(btn, false);
            return;
        }

        const batch = writeBatch(db);
        let entriesToUpdateCount = 0;
        let lecturersToDeleteCount = 0;

        for (const group of duplicatesToProcess) {
            const masterId = group.master.id;
            const duplicateIds = group.duplicates.map(d => d.id);
            
            // Find all entries associated with duplicate lecturer IDs
            const entriesQuery = query(entriesCol, where('lecturerId', 'in', duplicateIds));
            const entriesSnapshot = await getDocs(entriesQuery);
            
            entriesSnapshot.forEach(entryDoc => {
                batch.update(entryDoc.ref, { lecturerId: masterId });
                entriesToUpdateCount++;
            });

            // Schedule duplicates for deletion
            duplicateIds.forEach(id => {
                batch.delete(doc(lecturersCol, id));
                lecturersToDeleteCount++;
            });
        }

        await batch.commit();
        showAlert(`Dọn dẹp hoàn tất! Đã hợp nhất ${lecturersToDeleteCount} bản ghi giảng viên trùng lặp và cập nhật ${entriesToUpdateCount} mục giờ lao động liên quan.`, true);

    } catch (error) {
        console.error("Error cleaning up duplicates:", error);
        showAlert(`Đã xảy ra lỗi khi dọn dẹp: ${error.message}`);
    } finally {
        setButtonLoading(btn, false);
    }
}


// --- Firebase Initialization and Auth State ---
let dataListenersAttached = false;
function setupOnSnapshotListeners() {
    if (dataListenersAttached) return;
    dataListenersAttached = true;

    const snapshotErrorHandler = (collectionName) => (error) => {
        console.error(`Lỗi khi tải dữ liệu ${collectionName}: `, error);
        showAlert(`Không thể tải dữ liệu cho mục "${collectionName}". Vui lòng kiểm tra kết nối mạng và làm mới trang.`);
    };

    onSnapshot(departmentsCol, (snapshot) => {
        state.departments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        render();
    }, snapshotErrorHandler('Khoa'));

    onSnapshot(lecturersCol, (snapshot) => {
        state.lecturers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        render();
    }, snapshotErrorHandler('Giảng viên'));

    onSnapshot(entriesCol, (snapshot) => {
        state.entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (document.getElementById('details-modal').style.display === 'block' && state.currentLecturerIdForDetails) {
            showDetails(state.currentLecturerIdForDetails);
        }
        renderLecturerTable();
    }, snapshotErrorHandler('Giờ lao động'));

    onSnapshot(tasksCol, (snapshot) => {
        if (snapshot.empty && state.currentUser.role === 'admin') {
            const batch = writeBatch(db);
            DEFAULT_TASKS.forEach(task => {
                const newDocRef = doc(collection(db, tasksCol.path));
                batch.set(newDocRef, task);
            });
            batch.commit();
        } else {
            state.tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }
        render();
    }, snapshotErrorHandler('Nhiệm vụ'));

    onSnapshot(doc(settingsCol, SETTINGS_DOC_ID), (docSnapshot) => {
        if (docSnapshot.exists()) {
            const settingsData = docSnapshot.data();
            state.customYears = settingsData.customYears || [];
            state.prioritySchedulerUID = settingsData.prioritySchedulerUID || null;
        } else if (state.currentUser.role === 'admin') {
            setDoc(doc(settingsCol, SETTINGS_DOC_ID), { customYears: [], prioritySchedulerUID: null });
        }
        renderYearSelect();
        updateUIForRole(); // Update UI after getting priority user info
    }, snapshotErrorHandler('Cài đặt'));
}

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

        usersCol = collection(db, `${basePath}/users`);
        departmentsCol = collection(db, `${basePath}/departments`);
        lecturersCol = collection(db, `${basePath}/lecturers`);
        tasksCol = collection(db, `${basePath}/tasks`);
        entriesCol = collection(db, `${basePath}/entries`);
        settingsCol = collection(db, `${basePath}/settings`);

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userDocRef = doc(db, usersCol.path, user.uid);
                let userDoc = await getDoc(userDocRef);

                if (!userDoc.exists()) {
                    const allUsersSnapshot = await getDocs(usersCol);
                    const isFirstUser = allUsersSnapshot.empty;
                    const newUserRole = isFirstUser ? 'admin' : 'viewer';

                    await setDoc(userDocRef, {
                        email: user.email,
                        role: newUserRole,
                        createdAt: new Date()
                    });
                    userDoc = await getDoc(userDocRef);
                }

                state.currentUser = { uid: user.uid, ...userDoc.data() };
                
                // Set priority user if not set
                const settingsDocRef = doc(settingsCol, SETTINGS_DOC_ID);
                const settingsDoc = await getDoc(settingsDocRef);
                if (!settingsDoc.exists() || !settingsDoc.data().prioritySchedulerUID) {
                    if (state.currentUser.role === 'admin') {
                        await setDoc(settingsDocRef, { prioritySchedulerUID: user.uid }, { merge: true });
                        state.prioritySchedulerUID = user.uid;
                    }
                } else {
                    state.prioritySchedulerUID = settingsDoc.data().prioritySchedulerUID;
                }

                document.getElementById('user-email').textContent = state.currentUser.email;
                document.getElementById('user-email-module-page').textContent = state.currentUser.email;

                showPage('module-selection-page');

                updateUIForRole();
                setupOnSnapshotListeners();
                resetInactivityTimer();
                setupInactivityListeners();
            } else {
                state.currentUser = null;
                showPage('login-page');
                dataListenersAttached = false;
                clearInactivityListeners();
            }
        });

    } catch (error)
    {
        console.error("Firebase initialization error:", error);
        showAlert(`Lỗi khởi tạo Firebase: ${error.message}`);
    }
}

// --- Event Handlers ---
function addEventListeners() {
    // Auth form switching
    document.getElementById('show-register-link').addEventListener('click', (e) => {
        e.preventDefault();
        loginFormContainer.classList.add('hidden');
        registerFormContainer.classList.remove('hidden');
    });
    document.getElementById('show-login-link').addEventListener('click', (e) => {
        e.preventDefault();
        registerFormContainer.classList.add('hidden');
        loginFormContainer.classList.remove('hidden');
    });

    // Auth actions
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            showAlert(error.message);
        } finally {
            setButtonLoading(btn, false);
        }
    });
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;
        try {
            await createUserWithEmailAndPassword(auth, email, password);
        } catch (error) {
            showAlert(error.message);
        } finally {
            setButtonLoading(btn, false);
        }
    });
    document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));
    document.getElementById('logout-btn-module-page').addEventListener('click', () => signOut(auth));
    
    // Module Navigation
    document.getElementById('module-workload').addEventListener('click', () => {
        showPage('app-content');
    });
    document.getElementById('back-to-modules-btn').addEventListener('click', () => {
        showPage('module-selection-page');
    });

    // Change Password
    document.getElementById('change-password-btn').addEventListener('click', () => {
        openModal('change-password-modal');
    });

    document.getElementById('change-password-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);

        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmNewPassword = document.getElementById('confirm-new-password').value;

        if (newPassword.length < 6) {
            showAlert('Mật khẩu mới phải có ít nhất 6 ký tự.');
            setButtonLoading(btn, false);
            return;
        }

        if (newPassword !== confirmNewPassword) {
            showAlert('Mật khẩu mới và mật khẩu xác nhận không khớp.');
            setButtonLoading(btn, false);
            return;
        }

        const user = auth.currentUser;
        if (!user) {
            setButtonLoading(btn, false);
            return;
        }

        try {
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPassword);
            showAlert('Đổi mật khẩu thành công!', true);
            closeModal('change-password-modal');
            e.target.reset();
        } catch (error) {
            console.error("Password change error:", error);
            if (error.code === 'auth/wrong-password') {
                showAlert('Mật khẩu hiện tại không đúng. Vui lòng thử lại.');
            } else {
                showAlert(`Đã xảy ra lỗi: ${error.message}`);
            }
        } finally {
            setButtonLoading(btn, false);
        }
    });

    // User Management
    document.getElementById('manage-users-btn').addEventListener('click', async () => {
        await renderUsersList();
        openModal('manage-users-modal');
    });

    document.getElementById('users-list-body').addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        const uid = target.dataset.uid;
        const email = target.dataset.email;

        if (target.classList.contains('save-role-btn')) {
            if (uid === state.prioritySchedulerUID) {
                showAlert('Không thể thay đổi vai trò của người dùng ưu tiên.');
                const selectEl = document.querySelector(`.role-select[data-uid="${uid}"]`);
                selectEl.value = 'admin'; // Revert change
                return;
            }
            const selectEl = document.querySelector(`.role-select[data-uid="${uid}"]`);
            const newRole = selectEl.value;
            setButtonLoading(target, true);
            try {
                await updateDoc(doc(usersCol, uid), { role: newRole });
                showAlert('Cập nhật vai trò thành công!', true);
            } catch (error) {
                showAlert(`Lỗi cập nhật vai trò: ${error.message}`);
            } finally {
                setButtonLoading(target, false);
            }
        }
        if (target.classList.contains('reset-password-btn')) {
            showConfirm(`Bạn có chắc muốn gửi email reset mật khẩu cho ${email}?`, async () => {
                setButtonLoading(target, true);
                try {
                    await sendPasswordResetEmail(auth, email);
                    showAlert(`Đã gửi email reset mật khẩu tới ${email}.`, true);
                } catch (error) {
                     showAlert(`Lỗi gửi email: ${error.message}`);
                } finally {
                    setButtonLoading(target, false);
                }
            });
        }
        if (target.classList.contains('delete-user-btn')) {
            showConfirm('Bạn có chắc muốn xóa người dùng này khỏi hệ thống?', async () => {
                setButtonLoading(target, true);
                try {
                    await deleteDoc(doc(usersCol, uid));
                    showAlert('Đã xóa người dùng khỏi danh sách.', true);
                    await renderUsersList();
                } catch (error) {
                    showAlert(`Lỗi xóa người dùng: ${error.message}`);
                } finally {
                    setButtonLoading(target, false);
                }
            });
        }
    });


    // Department & Year select
    document.getElementById('department-select').addEventListener('change', (e) => {
        state.selectedDepartmentId = e.target.value;
        renderLecturerTable();
    });
    document.getElementById('year-select').addEventListener('change', (e) => {
        state.selectedYear = e.target.value;
        renderLecturerTable();
    });

    // Modal buttons
    document.getElementById('manage-tasks-btn').addEventListener('click', () => openModal('manage-tasks-modal'));
    
    document.getElementById('manage-lecturers-btn').addEventListener('click', () => {
        const filterSelect = document.getElementById('filter-lecturer-by-department');
        filterSelect.innerHTML = '<option value="all">-- Tất cả các Khoa --</option>';
        state.departments.forEach(dep => {
            filterSelect.innerHTML += `<option value="${dep.id}">${dep.name}</option>`;
        });
        renderLecturersList(); 
        openModal('manage-lecturers-modal');
    });

    document.getElementById('filter-lecturer-by-department').addEventListener('change', renderLecturersList);

    document.getElementById('manage-departments-btn').addEventListener('click', () => openModal('manage-departments-modal'));

    document.getElementById('add-year-btn').addEventListener('click', () => {
        const input = document.getElementById('new-year-input');
        const currentYear = new Date().getFullYear();
        input.value = '';
        input.placeholder = `${currentYear}-${currentYear + 1}`;
        openModal('add-year-modal');
    });

    // Details Modal Actions
    document.getElementById('select-all-entries').addEventListener('change', (e) => {
        document.querySelectorAll('.entry-checkbox').forEach(cb => {
            cb.checked = e.target.checked;
        });
    });

    document.getElementById('delete-selected-entries-btn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        const selectedIds = Array.from(document.querySelectorAll('.entry-checkbox:checked'))
                                 .map(cb => cb.dataset.entryId);
        if (selectedIds.length === 0) {
            showAlert('Vui lòng chọn ít nhất một mục để xóa.');
            return;
        }

        showConfirm(`Bạn có chắc muốn xóa ${selectedIds.length} mục đã chọn?`, async () => {
            setButtonLoading(btn, true);
            try {
                const batch = writeBatch(db);
                selectedIds.forEach(id => {
                    batch.delete(doc(entriesCol, id));
                });
                await batch.commit();
                showAlert('Đã xóa các mục đã chọn thành công!', true);
            } catch (error) {
                showAlert(`Lỗi khi xóa: ${error.message}`);
            } finally {
                setButtonLoading(btn, false);
            }
        });
    });


    document.getElementById('add-entry-btn').addEventListener('click', () => {
        if (state.departments.length === 0) {
            showAlert('Vui lòng thêm ít nhất một Khoa trước khi thêm giờ lao động.'); return;
        }
        if (!state.selectedDepartmentId || state.selectedDepartmentId === 'all') {
            showAlert('Vui lòng chọn một Khoa cụ thể từ trang chính trước khi thêm giờ lao động.'); return;
        }
        if (state.tasks.length === 0) {
            showAlert('Không có nhiệm vụ nào được định nghĩa. Vui lòng vào mục "Quản lý Nhiệm vụ" để thêm.'); return;
        }
        renderBulkAddModal();
        switchTab('predefined');
        openModal('bulk-add-modal');
    });

    document.getElementById('add-year-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const newYear = document.getElementById('new-year-input').value.trim();
        if (newYear) {
            if (!/^\d{4}-\d{4}$/.test(newYear)) { showAlert("Định dạng năm học không hợp lệ."); setButtonLoading(btn, false); return; }
            const [start, end] = newYear.split('-').map(Number);
            if (end !== start + 1) { showAlert("Năm học không hợp lệ."); setButtonLoading(btn, false); return; }
            if (!state.customYears.includes(newYear)) {
                const newYears = [...state.customYears, newYear];
                try {
                    await setDoc(doc(settingsCol, SETTINGS_DOC_ID), { customYears: newYears });
                    state.selectedYear = newYear;
                    closeModal('add-year-modal');
                } catch(error) {
                    showAlert(`Lỗi thêm năm học: ${error.message}`);
                } finally {
                    setButtonLoading(btn, false);
                }
            } else { showAlert("Năm học này đã tồn tại."); setButtonLoading(btn, false); }
        } else {
            setButtonLoading(btn, false);
        }
    });

    document.getElementById('bulk-add-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);

        const selectedLecturerIds = Array.from(document.querySelectorAll('.lecturer-checkbox:checked')).map(cb => cb.value);
        if (selectedLecturerIds.length === 0) {
            showAlert('Vui lòng chọn ít nhất một giảng viên.');
            setButtonLoading(btn, false);
            return;
        }

        const academicYear = document.getElementById('bulk-add-year-select').value;
        const activeTab = document.querySelector('.tab-button.active').id;
        let description, hours, date, endDate, startTime, endTime, notes;

        try {
            if (activeTab === 'tab-predefined') {
                const taskId = document.getElementById('task-select').value;
                const quantity = parseInt(document.getElementById('task-quantity').value, 10);
                const task = state.tasks.find(t => t.id === taskId);
                date = document.getElementById('entry-date').value;
                endDate = document.getElementById('end-date').value || null;
                startTime = document.getElementById('start-time').value || null;
                endTime = document.getElementById('end-time').value || null;
                notes = document.getElementById('predefined-notes').value.trim();

                if (!task || !date || isNaN(quantity) || quantity <= 0) {
                    showAlert('Vui lòng điền đầy đủ thông tin cho nhiệm vụ có sẵn.');
                    throw new Error("Invalid predefined task data");
                }
                description = task.name;
                hours = task.hours * quantity;
            } else {
                description = `Nhiệm vụ khác: ${document.getElementById('custom-task-description').value.trim()}`;
                hours = parseFloat(document.getElementById('custom-task-hours').value);
                date = document.getElementById('custom-entry-date').value;
                endDate = document.getElementById('custom-end-date').value || null;
                startTime = document.getElementById('custom-start-time').value || null;
                endTime = document.getElementById('custom-end-time').value || null;
                notes = document.getElementById('custom-notes').value.trim();

                if (!description.replace('Nhiệm vụ khác:', '').trim() || !date || isNaN(hours) || hours <= 0) {
                    showAlert('Vui lòng điền đầy đủ và hợp lệ các thông tin cho nhiệm vụ khác.');
                    throw new Error("Invalid custom task data");
                }
            }

            const batch = writeBatch(db);
            selectedLecturerIds.forEach(lecturerId => {
                const newEntryRef = doc(entriesCol);
                batch.set(newEntryRef, { lecturerId, description, hours, date, endDate, startTime, endTime, notes, academicYear });
            });

            await batch.commit();
            closeModal('bulk-add-modal');
            showAlert('Đã thêm giờ lao động thành công!', true);

        } catch (error) {
            console.error("Error adding entries:", error);
            if (!error.message.includes("Invalid")) {
                showAlert(`Đã xảy ra lỗi khi lưu: ${error.message}`);
            }
        } finally {
            setButtonLoading(btn, false);
        }
    });

    // Edit Entry Form
    document.getElementById('edit-entry-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const entryId = document.getElementById('edit-entry-id').value;
        const updatedData = {
            description: document.getElementById('edit-entry-description').value,
            hours: parseFloat(document.getElementById('edit-entry-hours').value),
            date: document.getElementById('edit-entry-date').value,
            endDate: document.getElementById('edit-entry-end-date').value || null,
            startTime: document.getElementById('edit-entry-start-time').value || null,
            endTime: document.getElementById('edit-entry-end-time').value || null,
            notes: document.getElementById('edit-entry-notes').value.trim(),
        };

        updatedData.academicYear = getAcademicYear(updatedData.date);

        if (isNaN(updatedData.hours) || !updatedData.date) {
            showAlert('Vui lòng điền đầy đủ các trường bắt buộc (Số giờ, Ngày bắt đầu).');
            setButtonLoading(btn, false);
            return;
        }

        try {
            await updateDoc(doc(entriesCol, entryId), updatedData);
            showAlert('Cập nhật thành công!', true);
            closeModal('edit-entry-modal');
        } catch (error) {
            showAlert(`Lỗi cập nhật: ${error.message}`);
            console.error("Error updating entry:", error);
        } finally {
            setButtonLoading(btn, false);
        }
    });

    // Common search logic for bulk tools
    function findEntriesForBulkAction(depId, year, descriptionText, date) {
         if (!depId && !year && !descriptionText && !date) {
            showAlert('Vui lòng nhập ít nhất một tiêu chí tìm kiếm.');
            return [];
        }
        let lecturerIdsInDep = [];
        if (depId && depId !== 'all') {
            lecturerIdsInDep = state.lecturers.filter(l => l.departmentId === depId).map(l => l.id);
            if (lecturerIdsInDep.length === 0) {
                showAlert('Khoa được chọn không có giảng viên nào.');
                return [];
            }
        }
        return state.entries.filter(entry => {
            if (depId && depId !== 'all' && !lecturerIdsInDep.includes(entry.lecturerId)) return false;
            if (year && year !== 'all') {
                const entryYear = entry.academicYear || getAcademicYear(entry.date);
                if (entryYear !== year) return false;
            }
            if (date && entry.date !== date) return false;
            if (descriptionText) {
                const entryDesc = entry.description.toLowerCase();
                const entryNotes = (entry.notes || '').toLowerCase();
                if (!entryDesc.includes(descriptionText) && !entryNotes.includes(descriptionText)) return false;
            }
            return true;
        });
    }

    // Bulk Delete Tool Logic
    document.getElementById('bulk-delete-tool-btn').addEventListener('click', () => {
        const depSelect = document.getElementById('bulk-delete-department');
        depSelect.innerHTML = '<option value="all">-- Tất cả các Khoa --</option>';
        state.departments.forEach(dep => { depSelect.innerHTML += `<option value="${dep.id}">${dep.name}</option>`; });
        const yearSelect = document.getElementById('bulk-delete-year');
        yearSelect.innerHTML = '<option value="all">-- Tất cả các Năm học --</option>';
        getYearsForSelect().forEach(year => { yearSelect.innerHTML += `<option value="${year}">${year}</option>`; });
        document.getElementById('bulk-delete-description').value = '';
        document.getElementById('bulk-delete-date').value = '';
        document.getElementById('bulk-delete-results-container').classList.add('hidden');
        state.foundEntriesToDelete = [];
        openModal('bulk-delete-modal');
    });

    document.getElementById('find-entries-to-delete-btn').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        setButtonLoading(btn, true);

        setTimeout(() => {
            try {
                const depId = document.getElementById('bulk-delete-department').value;
                const year = document.getElementById('bulk-delete-year').value;
                const descriptionText = document.getElementById('bulk-delete-description').value.trim().toLowerCase();
                const date = document.getElementById('bulk-delete-date').value;

                const filteredEntries = findEntriesForBulkAction(depId, year, descriptionText, date);
                state.foundEntriesToDelete = filteredEntries;

                const resultsContainer = document.getElementById('bulk-delete-results-container');
                const summaryDiv = document.getElementById('bulk-delete-results-summary');
                const listDiv = document.getElementById('bulk-delete-results-list');

                summaryDiv.textContent = `Tìm thấy ${filteredEntries.length} mục phù hợp.`;
                renderResultsList(listDiv, filteredEntries);

                if (filteredEntries.length > 0) {
                    resultsContainer.classList.remove('hidden');
                } else {
                    resultsContainer.classList.add('hidden');
                }
            } catch(error) {
                showAlert(`Lỗi khi tìm kiếm: ${error.message}`);
            } finally {
                setButtonLoading(btn, false);
            }
        }, 10);
    });

    document.getElementById('confirm-bulk-delete-btn').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        if (state.foundEntriesToDelete.length === 0) { showAlert('Không có mục nào để xóa.'); return; }
        showConfirm(`Bạn có chắc chắn muốn xóa vĩnh viễn ${state.foundEntriesToDelete.length} mục đã tìm thấy? Hành động này KHÔNG THỂ hoàn tác.`, async () => {
            setButtonLoading(btn, true);
            try {
                const batch = writeBatch(db);
                state.foundEntriesToDelete.forEach(entry => { batch.delete(doc(entriesCol, entry.id)); });
                await batch.commit();
                showAlert('Xóa hàng loạt thành công!', true);
                closeModal('bulk-delete-modal');
            } catch (error) {
                 showAlert(`Lỗi khi xóa: ${error.message}`);
            } finally {
                setButtonLoading(btn, false);
            }
        });
    });

    // Bulk Edit Tool Logic
    document.getElementById('bulk-edit-tool-btn').addEventListener('click', () => {
        const depSelect = document.getElementById('bulk-edit-department');
        depSelect.innerHTML = '<option value="all">-- Tất cả các Khoa --</option>';
        state.departments.forEach(dep => { depSelect.innerHTML += `<option value="${dep.id}">${dep.name}</option>`; });
        const yearSelect = document.getElementById('bulk-edit-year');
        yearSelect.innerHTML = '<option value="all">-- Tất cả các Năm học --</option>';
        getYearsForSelect().forEach(year => { yearSelect.innerHTML += `<option value="${year}">${year}</option>`; });
        document.getElementById('bulk-edit-description').value = '';
        document.getElementById('bulk-edit-date').value = '';
        document.getElementById('bulk-edit-results-container').classList.add('hidden');
        document.getElementById('bulk-edit-new-date').value = '';
        document.getElementById('bulk-edit-new-end-date').value = '';
        document.getElementById('bulk-edit-new-notes').value = '';
        state.foundEntriesToEdit = [];
        openModal('bulk-edit-modal');
    });

    document.getElementById('find-entries-to-edit-btn').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        setButtonLoading(btn, true);
        setTimeout(() => {
            try {
                const depId = document.getElementById('bulk-edit-department').value;
                const year = document.getElementById('bulk-edit-year').value;
                const descriptionText = document.getElementById('bulk-edit-description').value.trim().toLowerCase();
                const date = document.getElementById('bulk-edit-date').value;

                const filteredEntries = findEntriesForBulkAction(depId, year, descriptionText, date);
                state.foundEntriesToEdit = filteredEntries;

                const resultsContainer = document.getElementById('bulk-edit-results-container');
                const summaryDiv = document.getElementById('bulk-edit-results-summary');
                const listDiv = document.getElementById('bulk-edit-results-list');

                summaryDiv.textContent = `Tìm thấy ${filteredEntries.length} mục phù hợp. Vui lòng nhập các thay đổi bên dưới.`;
                renderResultsList(listDiv, filteredEntries);

                if (filteredEntries.length > 0) {
                    resultsContainer.classList.remove('hidden');
                } else {
                    resultsContainer.classList.add('hidden');
                }
            } catch(error) {
                showAlert(`Lỗi khi tìm kiếm: ${error.message}`);
            } finally {
                setButtonLoading(btn, false);
            }
        }, 10);
    });

    document.getElementById('confirm-bulk-edit-btn').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        if (state.foundEntriesToEdit.length === 0) { showAlert('Không có mục nào để sửa.'); return; }

        const newDate = document.getElementById('bulk-edit-new-date').value;
        const newEndDate = document.getElementById('bulk-edit-new-end-date').value;
        const newNotes = document.getElementById('bulk-edit-new-notes').value;

        const updateData = {};
        if (newDate) updateData.date = newDate;
        if (newEndDate) updateData.endDate = newEndDate;
        if (document.getElementById('bulk-edit-new-notes').value !== '') {
            updateData.notes = newNotes;
        }

        if (Object.keys(updateData).length === 0) {
            showAlert('Bạn chưa nhập thông tin nào để thay đổi.');
            return;
        }

        showConfirm(`Bạn có chắc muốn áp dụng các thay đổi này cho ${state.foundEntriesToEdit.length} mục đã tìm thấy?`, async () => {
            setButtonLoading(btn, true);
            try {
                const batch = writeBatch(db);
                state.foundEntriesToEdit.forEach(entry => {
                    batch.update(doc(entriesCol, entry.id), updateData);
                });
                await batch.commit();
                showAlert('Sửa hàng loạt thành công!', true);
                closeModal('bulk-edit-modal');
            } catch (error) {
                showAlert(`Lỗi khi sửa: ${error.message}`);
            } finally {
                setButtonLoading(btn, false);
            }
        });
    });

    // NEW: Cleanup Duplicates Button
    document.getElementById('cleanup-duplicates-btn').addEventListener('click', (e) => {
        showConfirm(
            'Bạn có chắc muốn chạy công cụ dọn dẹp dữ liệu giảng viên trùng lặp? Hành động này sẽ hợp nhất các giảng viên có cùng MÃ GIẢNG VIÊN và không thể hoàn tác.',
            () => cleanupDuplicateLecturers(e.currentTarget)
        );
    });


    // Other forms
    document.getElementById('department-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const id = document.getElementById('department-id').value;
        const name = document.getElementById('department-name').value.trim();
        if (!name) { setButtonLoading(btn, false); return; }
        try {
            if (id) {
                await updateDoc(doc(departmentsCol, id), { name });
            } else {
                await addDoc(departmentsCol, { name });
            }
            e.target.reset();
            document.getElementById('department-id').value = '';
        } catch (error) {
            showAlert(`Lỗi lưu khoa: ${error.message}`);
        } finally {
            setButtonLoading(btn, false);
        }
    });

    document.getElementById('lecturer-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const id = document.getElementById('lecturer-id').value;
        const name = document.getElementById('lecturer-name').value.trim();
        const code = document.getElementById('lecturer-code').value.trim();
        const departmentId = document.getElementById('lecturer-department').value;
        const soDienThoai = document.getElementById('lecturer-phone').value.trim();
        if (!name || !code || !departmentId) { showAlert("Vui lòng điền đầy đủ thông tin bắt buộc."); setButtonLoading(btn, false); return; }
        const data = { name, code, departmentId, soDienThoai };
        try {
            if (id) {
                await updateDoc(doc(lecturersCol, id), data);
            } else {
                await addDoc(lecturersCol, data);
            }
            e.target.reset();
            document.getElementById('lecturer-id').value = '';
        } catch (error) {
            showAlert(`Lỗi lưu giảng viên: ${error.message}`);
        } finally {
            setButtonLoading(btn, false);
        }
    });

    document.getElementById('task-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const id = document.getElementById('task-id').value;
        const name = document.getElementById('task-name').value.trim();
        const unit = document.getElementById('task-unit').value.trim();
        const hours = parseFloat(document.getElementById('task-hours').value);
        if (!name || !unit || isNaN(hours) || hours < 0) { showAlert("Vui lòng điền đầy đủ thông tin."); setButtonLoading(btn, false); return; }
        const data = { name, unit, hours };
        try {
            if (id) {
                await updateDoc(doc(tasksCol, id), data);
            } else {
                await addDoc(tasksCol, data);
            }
            clearTaskForm();
        } catch (error) {
            showAlert(`Lỗi lưu nhiệm vụ: ${error.message}`);
        } finally {
            setButtonLoading(btn, false);
        }
    });

    document.getElementById('task-select').addEventListener('change', updateCalculatedHours);
    document.getElementById('task-quantity').addEventListener('input', updateCalculatedHours);
    document.getElementById('bulk-add-department-select').addEventListener('change', (e) => renderLecturerChecklistInModal(e.target.value));
    document.getElementById('select-all-lecturers').addEventListener('change', (e) => {
        document.querySelectorAll('.lecturer-checkbox').forEach(checkbox => checkbox.checked = e.target.checked);
    });
    document.getElementById('clear-task-form-btn').addEventListener('click', clearTaskForm);
}

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    injectStyles(); // Inject styles on load
    state.selectedYear = getCurrentAcademicYear();
    addEventListeners();
    initializeFirebase();
});
