// File: js/quan-ly-lao-dong-a.js
// Logic for the Workload 'A' (Teaching Hours) Calculation module.
// REFACTORED to optimize Firestore reads by fetching data on demand with queries.

// Import Firebase modules
import { auth, db, appId } from './portal-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, doc, getDoc, addDoc, updateDoc, deleteDoc, writeBatch, query, where, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

/**
 * Injects all necessary CSS styles into the document's head.
 */
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        body { font-family: 'Inter', sans-serif; }
        .modal {
            display: none; position: fixed; z-index: 50;
            left: 0; top: 0; width: 100%; height: 100%;
            overflow: auto; background-color: rgba(0,0,0,0.5);
            -webkit-animation-name: fadeIn; -webkit-animation-duration: 0.4s;
            animation-name: fadeIn; animation-duration: 0.4s
        }
        .modal-content {
            background-color: #fefefe; margin: 5% auto; padding: 24px;
            border: 1px solid #888; width: 90%;
            border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            -webkit-animation-name: slideIn; -webkit-animation-duration: 0.4s;
            animation-name: slideIn; animation-duration: 0.4s
        }
        @-webkit-keyframes slideIn { from {top: -300px; opacity: 0} to {top: 0; opacity: 1} }
        @keyframes slideIn { from {margin-top: -5%; opacity: 0} to {margin-top: 5%; opacity: 1} }
        @-webkit-keyframes fadeIn { from {opacity: 0} to {opacity: 1} }
        @keyframes fadeIn { from {opacity: 0} to {opacity: 1} }
        .close-button {
            color: #aaa; float: right; font-size: 28px; font-weight: bold;
        }
        .close-button:hover, .close-button:focus {
            color: black; text-decoration: none; cursor: pointer;
        }
    `;
    document.head.appendChild(style);
}

// Global state object
let state = {
    currentUser: null,
    departments: [],
    lecturers: [],
    semesters: [],
    curriculumSubjects: [],
    teachingClasses: [],
    // These will now hold only the data for the selected view
    assignments: [],
    guidanceTasks: [],
    managementData: [],
    customYears: [],
    selectedDepartmentId: 'all',
    selectedYear: null,
};

// Firebase variables
let usersCol, departmentsCol, lecturersCol, semestersCol, assignmentsCol, curriculumSubjectsCol, teachingClassesCol, settingsCol, guidanceCol, managementCol;

// OPTIMIZATION: Array to hold unsubscribe functions for dynamic listeners
let dynamicUnsubscribes = [];

// --- Custom Alert/Confirm Modal Logic ---
function showAlert(message, isSuccess = false) {
    const modal = document.getElementById('alert-modal');
    const title = document.getElementById('alert-title');
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

// --- UI Rendering ---
function render() {
    renderDepartmentSelect();
    renderYearSelect();
    renderLecturerTable();
}

function updateUIForRole() {
    if (!state.currentUser) return;
    const isAdmin = state.currentUser.role === 'admin';
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? 'flex' : 'none';
    });
    const roleBadge = document.getElementById('user-role-badge');
    if (isAdmin) {
        roleBadge.textContent = 'Admin';
        roleBadge.className = 'ml-2 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-green-100 text-green-800';
    } else {
        roleBadge.textContent = 'Viewer';
        roleBadge.className = 'ml-2 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-800';
    }
}

function renderDepartmentSelect() {
    const select = document.getElementById('department-select');
    select.innerHTML = '<option value="all">-- Tất cả các Khoa --</option>';
    state.departments.forEach(dep => {
        select.innerHTML += `<option value="${dep.id}">${dep.name}</option>`;
    });
    select.value = state.selectedDepartmentId;
}

function getYearsForSelect() {
    const yearsFromSemesters = new Set(state.semesters.map(s => s.namHoc));
    const customYearsSet = new Set(state.customYears);
    const allYears = new Set([...yearsFromSemesters, ...customYearsSet]);
    return Array.from(allYears).sort().reverse();
}

function renderYearSelect() {
    const select = document.getElementById('year-select');
    const currentVal = select.value;
    const years = getYearsForSelect();

    select.innerHTML = '<option value="">-- Chọn năm học --</option>';
    years.forEach(year => {
        select.innerHTML += `<option value="${year}">Năm học ${year}</option>`;
    });

    if (state.selectedYear) {
        select.value = state.selectedYear;
    } else if (currentVal && years.includes(currentVal)) {
        select.value = currentVal;
    } else if (years.length > 0) {
        state.selectedYear = years[0];
        select.value = state.selectedYear;
    }
}

// ... (The rest of the UI functions like getStudentCountCoefficient, calculateStandardHours, etc. remain the same)
/**
 * Calculates the class coefficient based on student count.
 * @param {number} studentCount The number of students in the class.
 * @returns {number} The calculated coefficient.
 */
function getStudentCountCoefficient(studentCount) {
    if (studentCount <= 40) return 1.0;
    if (studentCount <= 60) return 1.1;
    if (studentCount <= 80) return 1.2;
    if (studentCount <= 100) return 1.4;
    if (studentCount <= 120) return 1.5;
    if (studentCount <= 150) return 1.6;
    return 1.7;
}

/**
 * Calculates standard hours based on assignment data from the modal form.
 * New Formula: Standard Hours = (Total Periods * Class Coefficient) + (Practice Periods * Number of Groups)
 * @returns {number} The calculated standard hours.
 */
function calculateStandardHours() {
    // Get all period inputs
    const periodsTheory = parseFloat(document.getElementById('periods-theory').value) || 0;
    const periodsExercise = parseFloat(document.getElementById('periods-exercise').value) || 0;
    const periodsDiscussion = parseFloat(document.getElementById('periods-discussion').value) || 0;
    const periodsPractice = parseFloat(document.getElementById('periods-practice').value) || 0;
    
    // Get student count and calculate class coefficient
    const studentCount = parseInt(document.getElementById('assignment-student-count').value) || 0;
    const classCoefficient = getStudentCountCoefficient(studentCount);

    // Calculate total periods
    const totalPeriods = periodsTheory + periodsExercise + periodsDiscussion + periodsPractice;

    // Calculate number of practice groups (max 20 students per group)
    const numGroups = studentCount > 0 ? Math.ceil(studentCount / 20) : 0;

    // Apply the new formula
    const part1 = totalPeriods * classCoefficient;
    const part2 = periodsPractice * numGroups;
    
    const finalHours = part1 + part2;

    // Return the result, rounded to two decimal places
    return Math.round(finalHours * 100) / 100;
}


function updateCalculatedHoursDisplay() {
    const studentCountInput = document.getElementById('assignment-student-count');
    const coefficientInput = document.getElementById('assignment-coefficient');
    
    const studentCount = parseInt(studentCountInput.value) || 0;
    coefficientInput.value = getStudentCountCoefficient(studentCount);

    const hours = calculateStandardHours();
    document.getElementById('calculated-hours-display').textContent = hours;
}


function renderLecturerTable() {
    const tableBody = document.getElementById('lecturers-table-body');
    const departmentTitle = document.getElementById('department-title');
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-6 text-gray-500"><i class="fas fa-spinner fa-spin mr-2"></i>Đang tải dữ liệu...</td></tr>';

    if (!state.selectedYear) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-gray-500">Vui lòng chọn một năm học để xem dữ liệu.</td></tr>`;
        return;
    }

    let filteredLecturers = state.lecturers;
    if (state.selectedDepartmentId !== 'all') {
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
    
    tableBody.innerHTML = ''; // Clear loading message
    
    const mainSemesterIdsInYear = state.semesters
        .filter(s => s.namHoc === state.selectedYear && (s.hocKy === '1' || s.hocKy === '2'))
        .map(s => s.id);

    // The data in state.assignments and state.guidanceTasks is already filtered by year
    const lecturersWithHours = filteredLecturers.map(lecturer => {
        const teachingHours = state.assignments
            .filter(a => a.lecturerId === lecturer.id && mainSemesterIdsInYear.includes(a.semesterId))
            .reduce((sum, a) => sum + a.calculatedStandardHours, 0);
        
        const guidanceHours = state.guidanceTasks
            .filter(t => t.lecturerId === lecturer.id) // Already filtered by year
            .reduce((sum, t) => sum + t.calculatedHours, 0);

        return { lecturer, totalHours: teachingHours + guidanceHours };
    });

    lecturersWithHours.sort((a, b) => b.totalHours - a.totalHours);

    if (lecturersWithHours.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center p-6 text-gray-500">Không có dữ liệu giảng dạy cho lựa chọn hiện tại.</td></tr>`;
        return;
    }

    lecturersWithHours.forEach((item, index) => {
        const { lecturer, totalHours } = item;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap">${index + 1}</td>
            <td class="px-6 py-4 whitespace-nowrap font-medium text-gray-900">${lecturer.name}</td>
            <td class="px-6 py-4 whitespace-nowrap text-gray-500">${lecturer.code}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center font-bold text-lg text-indigo-600">${Math.round(totalHours)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                <button class="text-blue-600 hover:text-blue-800" onclick="showDetails('${lecturer.id}')">Xem chi tiết</button>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

// --- Global Functions (for inline onclick) ---
window.openModal = (modalId) => document.getElementById(modalId).style.display = 'block';
window.closeModal = (modalId) => document.getElementById(modalId).style.display = 'none';
window.onclick = (event) => {
    if (event.target.classList.contains('modal')) event.target.style.display = "none";
};

// ... (showDetails, editAssignment, deleteAssignment remain largely the same, as they operate on the filtered state data)
window.showDetails = (lecturerId) => {
    const lecturer = state.lecturers.find(l => l.id === lecturerId);
    if (!lecturer || !state.selectedYear) return;

    const semestersInYear = state.semesters.filter(s => s.namHoc === state.selectedYear);
    const semesterIdsInYear = semestersInYear.map(s => s.id);

    const assignmentsForLecturer = state.assignments
        .filter(a => a.lecturerId === lecturerId && semesterIdsInYear.includes(a.semesterId))
        .sort((a, b) => {
            const semA = state.semesters.find(s => s.id === a.semesterId)?.hocKy || 0;
            const semB = state.semesters.find(s => s.id === b.semesterId)?.hocKy || 0;
            if (semA !== semB) return semA - semB;
            return a.subjectName.localeCompare(b.subjectName);
        });
    
    const guidanceForLecturer = state.guidanceTasks
        .filter(t => t.lecturerId === lecturerId && t.academicYear === state.selectedYear)
        .sort((a, b) => a.content.localeCompare(b.content));

    document.getElementById('details-title').textContent = `Chi tiết giờ giảng dạy năm học ${state.selectedYear} - ${lecturer.name}`;
    const contentDiv = document.getElementById('details-content');
    contentDiv.innerHTML = '';

    if (assignmentsForLecturer.length === 0 && guidanceForLecturer.length === 0) {
        contentDiv.innerHTML = '<p class="text-gray-500 p-4">Không có phân công nào cho giảng viên này trong năm học đã chọn.</p>';
    } else {
        const list = document.createElement('ul');
        list.className = 'divide-y divide-gray-200';
        
        assignmentsForLecturer.forEach(a => {
            const item = document.createElement('li');
            item.className = 'py-3 px-2 flex justify-between items-start';
            const isAdmin = state.currentUser.role === 'admin';
            const semesterName = state.semesters.find(s => s.id === a.semesterId)?.tenHocKy || 'N/A';
            
            item.innerHTML = `
                <div>
                    <p class="text-sm font-medium text-gray-800">${a.subjectName} - Lớp ${a.className}</p>
                    <p class="text-xs text-gray-500">${semesterName}</p>
                    <p class="text-sm text-gray-500">
                        Sĩ số: ${a.studentCount} | Hệ số: ${a.coefficient} | LT: ${a.periodsTheory}, BT: ${a.periodsExercise}, TL: ${a.periodsDiscussion}, TH: ${a.periodsPractice}
                    </p>
                </div>
                <div class="text-right flex-shrink-0 pl-4">
                    <p class="text-md font-bold text-green-600">${a.calculatedStandardHours} giờ</p>
                    ${isAdmin ? `
                    <div class="text-xs mt-1">
                        <button class="text-blue-500 hover:underline" onclick="editAssignment('${a.id}')">Sửa</button> | 
                        <button class="text-red-500 hover:underline" onclick="deleteAssignment('${a.id}')">Xóa</button>
                    </div>
                    ` : ''}
                </div>
            `;
            list.appendChild(item);
        });

        if (guidanceForLecturer.length > 0) {
             const guidanceHeader = document.createElement('li');
             guidanceHeader.innerHTML = `<h4 class="font-bold text-md mt-4 p-2 bg-gray-100">Hướng dẫn Tốt nghiệp & Thực tập</h4>`;
             list.appendChild(guidanceHeader);
        }

        guidanceForLecturer.forEach(t => {
            const item = document.createElement('li');
            item.className = 'py-3 px-2 flex justify-between items-start';
            const isAdmin = state.currentUser.role === 'admin';
            item.innerHTML = `
                <div>
                    <p class="text-sm font-medium text-gray-800">${t.type}: ${t.content}</p>
                     <p class="text-sm text-gray-500">
                        Số SV: ${t.studentCount} | Số TC: ${t.credits}
                    </p>
                </div>
                <div class="text-right flex-shrink-0 pl-4">
                    <p class="text-md font-bold text-green-600">${t.calculatedHours} giờ</p>
                    ${isAdmin ? `
                    <div class="text-xs mt-1">
                        <button class="text-blue-500 hover:underline" onclick="editGuidanceTask('${t.id}')">Sửa</button> | 
                        <button class="text-red-500 hover:underline" onclick="deleteGuidanceTask('${t.id}')">Xóa</button>
                    </div>
                    ` : ''}
                </div>
            `;
            list.appendChild(item);
        });

        contentDiv.appendChild(list);
    }
    openModal('details-modal');
};

window.editAssignment = (assignmentId) => {
    const assignment = state.assignments.find(a => a.id === assignmentId);
    if (!assignment) return;
    
    closeModal('details-modal');
    openModal('assignment-modal');
    
    document.getElementById('assignment-modal-title').textContent = 'Chỉnh sửa Phân công Giảng dạy';
    document.getElementById('assignment-id').value = assignment.id;
    
    // Set the selected year based on the assignment being edited
    const semesterOfAssignment = state.semesters.find(s => s.id === assignment.semesterId);
    if (semesterOfAssignment) {
        state.selectedYear = semesterOfAssignment.namHoc;
    }
    // Repopulate semester dropdown based on the correct year
    const semesterSelect = document.getElementById('assignment-semester');
    const semestersInYear = state.semesters.filter(s => s.namHoc === state.selectedYear);
    semesterSelect.innerHTML = '<option value="">-- Chọn học kỳ --</option>';
    semestersInYear.forEach(s => semesterSelect.innerHTML += `<option value="${s.id}">${s.tenHocKy}</option>`);
    semesterSelect.value = assignment.semesterId;
    
    const departmentSelect = document.getElementById('assignment-department');
    departmentSelect.value = assignment.departmentId;
    departmentSelect.dispatchEvent(new Event('change')); 
    
    setTimeout(() => {
        document.getElementById('assignment-subject').value = assignment.subjectId;
        document.getElementById('assignment-subject').dispatchEvent(new Event('change'));
        document.getElementById('assignment-lecturer').value = assignment.lecturerId;
        
        // Repopulate classes for editing, including the currently assigned one
        populateAvailableClasses(assignment.classId);
        document.getElementById('assignment-class').value = assignment.classId;
        document.getElementById('assignment-class').dispatchEvent(new Event('change'));
    }, 150);
};

window.deleteAssignment = (assignmentId) => {
    if (confirm('Bạn có chắc chắn muốn xóa phân công này không?')) {
        deleteDoc(doc(assignmentsCol, assignmentId))
            .then(() => {
                showAlert('Xóa phân công thành công!', true);
                closeModal('details-modal');
            })
            .catch(error => showAlert(`Lỗi khi xóa: ${error.message}`));
    }
};

// --- Firebase Initialization and Auth State ---
let baseListenersAttached = false;
function attachBaseListeners() {
    if (baseListenersAttached) return;

    const snapshotErrorHandler = (name) => (error) => showAlert(`Lỗi tải dữ liệu ${name}: ${error.message}`);
    
    // Listen to collections that are relatively small and static
    const collectionsToLoad = [
        { name: 'departments', col: departmentsCol, state: state.departments, sort: (a, b) => a.name.localeCompare(b.name) },
        { name: 'lecturers', col: lecturersCol, state: state.lecturers, sort: (a, b) => a.name.localeCompare(b.name) },
        { name: 'semesters', col: semestersCol, state: state.semesters, sort: (a, b) => b.namHoc.localeCompare(a.namHoc) || b.hocKy - a.hocKy },
        { name: 'curriculumSubjects', col: curriculumSubjectsCol, state: state.curriculumSubjects, sort: (a, b) => a.subjectName.localeCompare(b.subjectName) },
        { name: 'teachingClasses', col: teachingClassesCol, state: state.teachingClasses, sort: (a, b) => a.className.localeCompare(b.className) },
    ];

    collectionsToLoad.forEach(c => {
        onSnapshot(c.col, (snapshot) => {
            c.state.length = 0;
            snapshot.docs.forEach(doc => c.state.push({ id: doc.id, ...doc.data() }));
            if (c.sort) c.state.sort(c.sort);
            
            if (c.name === 'semesters') renderYearSelect();
            if (c.name === 'departments') renderDepartmentSelect();
            // Re-render table if lecturers list changes
            if (c.name === 'lecturers') renderLecturerTable();
        }, snapshotErrorHandler(c.name));
    });

    onSnapshot(doc(settingsCol, 'appSettings'), (docSnapshot) => {
        if (docSnapshot.exists()) {
            const settingsData = docSnapshot.data();
            state.customYears = settingsData.customYears || [];
        } else {
            state.customYears = [];
        }
        renderYearSelect();
    }, snapshotErrorHandler('Cài đặt'));

    baseListenersAttached = true;
}

// OPTIMIZATION: Function to detach old listeners
function detachDynamicListeners() {
    dynamicUnsubscribes.forEach(unsub => unsub());
    dynamicUnsubscribes = [];
}

// OPTIMIZATION: Function to fetch data based on filters
function fetchDataForView() {
    detachDynamicListeners();

    // Clear old data
    state.assignments = [];
    state.guidanceTasks = [];
    state.managementData = [];

    if (!state.selectedYear) {
        renderLecturerTable(); // Render empty state
        return;
    }

    const snapshotErrorHandler = (name) => (error) => showAlert(`Lỗi tải dữ liệu ${name}: ${error.message}`);
    
    // --- Build Queries based on selectedYear ---
    const academicYear = state.selectedYear;
    const semesterIdsInYear = state.semesters
        .filter(s => s.namHoc === academicYear)
        .map(s => s.id);

    if (semesterIdsInYear.length > 0) {
        // Query for Assignments
        const assignmentsQuery = query(assignmentsCol, where("semesterId", "in", semesterIdsInYear));
        const unsubAssignments = onSnapshot(assignmentsQuery, (snapshot) => {
            state.assignments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderLecturerTable();
        }, snapshotErrorHandler('Phân công'));
        dynamicUnsubscribes.push(unsubAssignments);
    }

    // Query for Guidance Tasks
    const guidanceQuery = query(guidanceCol, where("academicYear", "==", academicYear));
    const unsubGuidance = onSnapshot(guidanceQuery, (snapshot) => {
        state.guidanceTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderGuidanceList(); // Also update guidance modal if open
        renderLecturerTable();
    }, snapshotErrorHandler('Hướng dẫn'));
    dynamicUnsubscribes.push(unsubGuidance);

    // Query for Management Data
    const managementQuery = query(managementCol, where("academicYear", "==", academicYear));
    const unsubManagement = onSnapshot(managementQuery, (snapshot) => {
        state.managementData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderManagementList(); // Also update management modal if open
        renderLecturerTable();
    }, snapshotErrorHandler('Định mức'));
    dynamicUnsubscribes.push(unsubManagement);
    
    // Initial render in case there's no data
    renderLecturerTable();
}


async function initializeFirebase() {
    try {
        const basePath = `artifacts/${appId}/public/data`;
        
        usersCol = collection(db, `${basePath}/users`);
        departmentsCol = collection(db, `${basePath}/departments`);
        lecturersCol = collection(db, `${basePath}/lecturers`);
        semestersCol = collection(db, `${basePath}/schedule_HocKy`);
        assignmentsCol = collection(db, `${basePath}/workloadA_Assignments`);
        curriculumSubjectsCol = collection(db, `${basePath}/curriculum_subjects`);
        teachingClassesCol = collection(db, `${basePath}/teaching_classes`);
        settingsCol = collection(db, `${basePath}/settings`);
        guidanceCol = collection(db, `${basePath}/workloadA_Guidance`);
        managementCol = collection(db, `${basePath}/workloadA_Management`);

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userDoc = await getDoc(doc(usersCol, user.uid));
                state.currentUser = userDoc.exists() ? { uid: user.uid, ...userDoc.data() } : { uid: user.uid, email: user.email, role: 'viewer' };
                
                document.getElementById('user-email').textContent = state.currentUser.email;
                document.getElementById('app-content').classList.remove('hidden');

                updateUIForRole();
                attachBaseListeners(); // Attach listeners for static data
                
                // Set initial year and fetch data
                if (getYearsForSelect().length > 0) {
                    state.selectedYear = getYearsForSelect()[0];
                    document.getElementById('year-select').value = state.selectedYear;
                }
                fetchDataForView();

            } else {
                window.location.href = 'index.html';
            }
        });
    } catch (error) {
        console.error("Firebase initialization error:", error);
        showAlert(`Lỗi khởi tạo Firebase: ${error.message}`);
    }
}

// --- Import Logic and Report Generation (no changes needed here) ---
// ... (The code for handleFileImport, generateLecturerReportA, etc. is unchanged)
function downloadTemplate() {
    const type = document.getElementById('import-type-select').value;
    let headers, filename;

    if (type === 'curriculum') {
        headers = ["tenKhoa", "maHocPhan", "tenHocPhan", "soTinChi", "soTietLyThuyet", "soTietThaoLuan", "soTietThucHanh"];
        filename = "Mau_Import_ChuongTrinhDaoTao.xlsx";
    } else if (type === 'classes') {
        headers = ["tenLop", "siSo", "namHoc"];
        filename = "Mau_Import_DanhSachLop.xlsx";
    } else { // assignments
        headers = ["tenHocKy", "maGiangVien", "maHocPhan", "tenLopDay"];
        filename = "Mau_Import_PhanCongGiangDay.xlsx";
    }

    const ws = XLSX.utils.json_to_sheet([{}], { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, filename);
}

async function handleFileImport() {
    const btn = document.getElementById('start-import-btn');
    setButtonLoading(btn, true);

    const fileInput = document.getElementById('import-file-input');
    const type = document.getElementById('import-type-select').value;
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

            const batch = writeBatch(db);
            let successCount = 0, errorCount = 0;
            const newLocalData = []; 

            for (const [index, row] of jsonData.entries()) {
                try {
                    if (type === 'curriculum') {
                        const department = state.departments.find(d => d.name.toLowerCase() === String(row.tenKhoa || '').trim().toLowerCase());
                        if (!department) throw new Error(`Không tìm thấy khoa "${row.tenKhoa}"`);
                        
                        const subjectData = {
                            departmentId: department.id,
                            subjectCode: String(row.maHocPhan || '').trim(),
                            subjectName: String(row.tenHocPhan || '').trim(),
                            credits: parseFloat(row.soTinChi || 0),
                            periodsTheory: parseInt(row.soTietLyThuyet || 0),
                            periodsDiscussion: parseInt(row.soTietThaoLuan || 0),
                            periodsPractice: parseInt(row.soTietThucHanh || 0),
                            periodsExercise: 0,
                        };
                        if (!subjectData.subjectCode || !subjectData.subjectName) throw new Error("Thiếu mã hoặc tên học phần.");
                        
                        const q = query(curriculumSubjectsCol, where("subjectCode", "==", subjectData.subjectCode));
                        const existing = await getDocs(q);
                        if (existing.empty) {
                            const newDocRef = doc(curriculumSubjectsCol);
                            batch.set(newDocRef, subjectData);
                        } else {
                            const docRef = existing.docs[0].ref;
                            batch.update(docRef, subjectData);
                        }
                    } else if (type === 'classes') {
                        const classData = {
                            className: String(row.tenLop || '').trim(),
                            studentCount: parseInt(row.siSo || 0),
                            academicYear: String(row.namHoc || '').replace(/Năm học /gi, '').trim(),
                        };
                        if (!classData.className || !classData.academicYear) throw new Error("Thiếu Tên lớp hoặc Năm học.");
                        
                        const q = query(teachingClassesCol, where("className", "==", classData.className), where("academicYear", "==", classData.academicYear));
                        const existing = await getDocs(q);
                        if (existing.empty) {
                            const newDocRef = doc(teachingClassesCol);
                            batch.set(newDocRef, classData);
                        } else {
                            const docRef = existing.docs[0].ref;
                            batch.update(docRef, classData);
                        }
                    } else { // assignments
                        const semester = state.semesters.find(s => s.tenHocKy.toLowerCase() === String(row.tenHocKy || '').trim().toLowerCase());
                        const lecturer = state.lecturers.find(l => l.code.toLowerCase() === String(row.maGiangVien || '').trim().toLowerCase());
                        const subject = state.curriculumSubjects.find(s => s.subjectCode.toLowerCase() === String(row.maHocPhan || '').trim().toLowerCase());
                        const teachingClass = state.teachingClasses.find(c => c.className.toLowerCase() === String(row.tenLopDay || '').trim().toLowerCase() && semester.namHoc === c.academicYear);

                        if (!semester) throw new Error(`Không tìm thấy học kỳ "${row.tenHocKy}"`);
                        if (!lecturer) throw new Error(`Không tìm thấy giảng viên có mã "${row.maGiangVien}"`);
                        if (!subject) throw new Error(`Không tìm thấy môn học có mã "${row.maHocPhan}"`);
                        if (!teachingClass) throw new Error(`Không tìm thấy lớp "${row.tenLopDay}" trong năm học ${semester.namHoc}`);

                        const studentCount = teachingClass.studentCount;
                        const coefficient = getStudentCountCoefficient(studentCount);
                        
                        const totalPeriods = subject.periodsTheory + subject.periodsExercise + subject.periodsDiscussion + subject.periodsPractice;
                        const numGroups = studentCount > 0 ? Math.ceil(studentCount / 20) : 0;
                        const part1 = totalPeriods * coefficient;
                        const part2 = subject.periodsPractice * numGroups;
                        const calculatedStandardHours = Math.round((part1 + part2) * 100) / 100;

                        const assignmentData = {
                            semesterId: semester.id,
                            subjectId: subject.id,
                            subjectName: subject.subjectName,
                            classId: teachingClass.id,
                            className: teachingClass.className,
                            lecturerId: lecturer.id,
                            departmentId: lecturer.departmentId,
                            studentCount: studentCount,
                            coefficient: coefficient,
                            periodsTheory: subject.periodsTheory,
                            periodsExercise: subject.periodsExercise,
                            periodsDiscussion: subject.periodsDiscussion,
                            periodsPractice: subject.periodsPractice,
                            calculatedStandardHours: calculatedStandardHours,
                        };
                        const newDocRef = doc(assignmentsCol);
                        batch.set(newDocRef, assignmentData);
                    }
                    successCount++;
                } catch (rowError) {
                    errorCount++;
                    logContainer.innerHTML += `<span class="text-orange-500">- Dòng ${index + 2}: Lỗi - ${rowError.message}</span><br>`;
                }
            }

            if (successCount > 0) {
                await batch.commit();
            }
            
            logContainer.innerHTML += `<hr class="my-2"><strong class="text-green-600">Hoàn thành!</strong><br>Thành công: ${successCount}, Lỗi: ${errorCount}.<br>`;

        } catch (error) {
            logContainer.innerHTML += `<span class="text-red-500">Đã xảy ra lỗi nghiêm trọng: ${error.message}</span><br>`;
        } finally {
            setButtonLoading(btn, false);
            fileInput.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

function generateLecturerReportA(lecturerId, academicYear, reportType = 'main') {
    const lecturer = state.lecturers.find(l => l.id === lecturerId);
    if (!lecturer) {
        showAlert("Không tìm thấy thông tin giảng viên.");
        return;
    }
    const department = state.departments.find(d => d.id === lecturer.departmentId);
    
    let semestersToInclude = [];
    let reportTitleText = '';
    if (reportType === 'main') {
        semestersToInclude = state.semesters.filter(s => s.namHoc === academicYear && (s.hocKy === '1' || s.hocKy === '2'));
        reportTitleText = '(HỌC KỲ CHÍNH)';
    } else { // 'extra'
        semestersToInclude = state.semesters.filter(s => s.namHoc === academicYear && (s.hocKy === '3' || s.hocKy === '4'));
        reportTitleText = '(HỌC KỲ HÈ & PHỤ)';
    }
    
    const semesterIdsToInclude = semestersToInclude.map(s => s.id);
    const assignments = state.assignments
        .filter(a => a.lecturerId === lecturerId && semesterIdsToInclude.includes(a.semesterId))
        .sort((a, b) => {
            const semA = state.semesters.find(s => s.id === a.semesterId)?.hocKy || 0;
            const semB = state.semesters.find(s => s.id === b.semesterId)?.hocKy || 0;
            if (semA !== semB) return semA - semB;
            return a.subjectName.localeCompare(b.subjectName);
        });

    const guidanceTasks = (reportType === 'main') 
        ? state.guidanceTasks.filter(t => t.lecturerId === lecturerId && t.academicYear === academicYear)
        : [];
    
    const management = (reportType === 'main')
        ? state.managementData.find(m => m.lecturerId === lecturerId && m.academicYear === academicYear)
        : null;

    if (assignments.length === 0 && guidanceTasks.length === 0) {
        showAlert(`Không có dữ liệu giảng dạy cho ${lecturer.name} trong ${reportType === 'main' ? 'học kỳ chính' : 'học kỳ hè/phụ'} của năm học này.`);
        return;
    }

    let totalTeachingHours = 0;
    const teachingRows = assignments.map((a, index) => {
        const numGroups = a.studentCount > 0 ? Math.ceil(a.studentCount / 20) : 0;
        const semester = state.semesters.find(s => s.id === a.semesterId);
        totalTeachingHours += a.calculatedStandardHours;
        return `
            <tr>
                <td style="text-align: center;">${index + 1}</td>
                <td>${a.subjectName}</td>
                <td style="text-align: center;">${semester ? semester.hocKy : ''}</td>
                <td>${a.className}</td>
                <td style="text-align: center;">${a.studentCount}</td>
                <td style="text-align: center;">${numGroups}</td>
                <td style="text-align: center;">${a.periodsTheory}</td>
                <td style="text-align: center;">${a.periodsDiscussion}</td>
                <td style="text-align: center;">${a.periodsPractice}</td>
                <td style="text-align: center;">${a.periodsExercise}</td>
                <td style="text-align: center;">${a.coefficient}</td>
                <td style="text-align: center;">${a.calculatedStandardHours.toFixed(2)}</td>
                <td></td>
            </tr>
        `;
    }).join('');

    let totalGuidanceHours = 0;
    const guidanceRows = guidanceTasks.map((t, index) => {
        totalGuidanceHours += t.calculatedHours;
        const factor = t.type === 'Đồ án tốt nghiệp' ? 2 : 0.8;
        return `
             <tr>
                <td style="text-align: center;">${index + 1}</td>
                <td>${t.type} ${t.content}</td>
                <td style="text-align: center;">${t.studentCount}</td>
                <td style="text-align: center;">${t.credits}</td>
                <td style="text-align: center;">${factor}</td>
                <td style="text-align: center;">${t.calculatedHours.toFixed(2)}</td>
                <td></td>
            </tr>
        `;
    }).join('');

    const guidanceSection = (reportType === 'main' && guidanceTasks.length > 0) ? `
        <p style="font-weight: bold; margin-top: 20px;">B. HƯỚNG DẪN, PHẢN BIỆN ĐỒ ÁN, KHÓA LUẬN TỐT NGHIỆP, THỰC TẬP</p>
        <table>
            <thead>
                <tr>
                    <th>STT</th>
                    <th>Nội dung công việc</th>
                    <th>Số lượng đồ án/khóa luận/ Số nhóm (số SV)</th>
                    <th>Số tín chỉ</th>
                    <th>Giờ chuẩn</th>
                    <th>Tổng giờ chuẩn</th>
                    <th>Ghi chú</th>
                </tr>
            </thead>
            <tbody>
                ${guidanceRows}
                <tr>
                    <td colspan="5" style="text-align: right; font-weight: bold;">Tổng cộng B</td>
                    <td style="text-align: center; font-weight: bold;">${totalGuidanceHours.toFixed(2)}</td>
                    <td></td>
                </tr>
            </tbody>
        </table>
    ` : '';
    
    const standardQuota = management?.standardQuota || 270;
    const reductionHours = management?.reductionHours || 0;
    const reductionReasons = management?.reductionDescription?.split('\n').map((reason, index) => `
        <tr>
            <td style="text-align: center;">${index + 1}</td>
            <td>${reason.trim()}</td>
            <td></td>
            <td></td>
            <td style="text-align: center;">${index === 0 ? reductionHours : ''}</td>
            <td></td>
        </tr>
    `).join('') || `<tr><td style="text-align: center;">1</td><td></td><td></td><td></td><td style="text-align: center;">0</td><td></td></tr>`;

    const reductionSection = (reportType === 'main') ? `
        <p style="font-weight: bold; margin-top: 20px;">D. GIẢM TRỪ GIỜ CHUẨN GIẢNG DẠY</p>
        <table>
             <thead>
                <tr>
                    <th>STT</th>
                    <th>Đối tượng được giảm trừ</th>
                    <th>Định mức</th>
                    <th>Số tháng được hưởng</th>
                    <th>Số giờ giảm trừ</th>
                    <th>Ghi chú</th>
                </tr>
            </thead>
            <tbody>
                ${reductionReasons}
                 <tr>
                    <td colspan="4" style="text-align: right; font-weight: bold;">Tổng cộng</td>
                    <td style="text-align: center; font-weight: bold;">${reductionHours}</td>
                    <td></td>
                </tr>
            </tbody>
        </table>
    ` : '';

    const grandTotal = totalTeachingHours + totalGuidanceHours;
    const surplusDeficit = grandTotal + reductionHours - standardQuota;

    const summarySection = (reportType === 'main') ? `
        <p style="font-weight: bold; margin-top: 20px;">E. TỔNG SỐ GIỜ CHUẨN ĐÃ QUY ĐỔI, GIỜ CHUẨN THỪA/THIẾU</p>
        <table style="width: 50%;">
            <tr>
                <td>1. Tổng số giờ chuẩn đã quy đổi (=A+B)</td>
                <td style="text-align: center; font-weight: bold;">${grandTotal.toFixed(2)}</td>
            </tr>
            <tr>
                <td>2. Số giờ giảm trừ</td>
                <td style="text-align: center; font-weight: bold;">${reductionHours}</td>
            </tr>
            <tr>
                <td>3. Số giờ chuẩn thừa/thiếu so với định mức</td>
                <td style="text-align: center; font-weight: bold;">${surplusDeficit.toFixed(2)}</td>
            </tr>
        </table>
    ` : '';


    const reportHtml = `
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <title>Báo cáo Lao động A - ${lecturer.name} - ${academicYear}</title>
            <style>
                body { font-family: 'Times New Roman', Times, serif; font-size: 13pt; margin: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                th, td { border: 1px solid black; padding: 5px; vertical-align: middle; }
                th { font-weight: bold; text-align: center; }
                .header, .footer { text-align: center; }
                .header p { margin: 0; }
                .title { font-size: 14pt; font-weight: bold; margin: 20px 0; }
                .info p { margin: 5px 0; }
                .print-button { position: fixed; top: 10px; right: 10px; padding: 8px 12px; background-color: #4CAF50; color: white; border: none; border-radius: 5px; cursor: pointer; }
                @media print { .print-button { display: none; } }
            </style>
        </head>
        <body>
            <button class="print-button" onclick="window.print()">In Báo cáo</button>
            <div class="header">
                <p>UBND THÀNH PHỐ HẢI PHÒNG</p>
                <p style="font-weight: bold;">TRƯỜNG ĐẠI HỌC HẢI PHÒNG</p>
                <hr style="width: 150px; border-top: 1px solid black;">
            </div>
            <div class="title">
                <p>BẢNG PHÂN CÔNG GIẢNG DẠY CỦA GIẢNG VIÊN</p>
                <p>NĂM HỌC ${academicYear} ${reportTitleText}</p>
            </div>
            <div class="info">
                <p><b>1. Họ và tên:</b> ${lecturer.name} &nbsp;&nbsp;&nbsp;&nbsp; <b>2. Mã viên chức:</b> ${lecturer.code}</p>
                <p><b>3. Bộ môn/Tổ:</b> ${department?.name || ''} &nbsp;&nbsp;&nbsp;&nbsp; <b>Khoa/Trung tâm:</b> ${department?.name || ''}</p>
                ${reportType === 'main' ? `<p><b>4. Định mức giờ chuẩn phải giảng dạy:</b> ${standardQuota}</p>` : ''}
            </div>
            <p style="font-weight: bold;">A. GIẢNG DẠY</p>
            <table>
                <thead>
                    <tr>
                        <th rowspan="2">STT</th>
                        <th rowspan="2">Tên học phần</th>
                        <th rowspan="2">Học kỳ</th>
                        <th rowspan="2">Lớp</th>
                        <th rowspan="2">Sĩ số</th>
                        <th rowspan="2">Số nhóm TH</th>
                        <th colspan="4">Số tiết</th>
                        <th rowspan="2">Hệ số lớp</th>
                        <th rowspan="2">Số giờ quy đổi</th>
                        <th rowspan="2">Ghi chú</th>
                    </tr>
                    <tr>
                        <th>LT</th>
                        <th>TL</th>
                        <th>TH</th>
                        <th>BT</th>
                    </tr>
                </thead>
                <tbody>
                    ${teachingRows}
                    <tr>
                        <td colspan="11" style="text-align: right; font-weight: bold;">Tổng cộng A</td>
                        <td style="text-align: center; font-weight: bold;">${totalTeachingHours.toFixed(2)}</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>

            ${guidanceSection}
            ${reductionSection}
            ${summarySection}

            <div class="footer" style="margin-top: 50px; display: flex; justify-content: flex-end;">
                 <div style="width: 40%; text-align: center;">
                    <p>Hải Phòng, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}</p>
                    <p style="font-weight: bold; margin-top: 10px;">Giảng viên</p>
                    <p style="font-style: italic;">(Ký và ghi rõ họ tên)</p>
                    <p style="margin-top: 80px; font-weight: bold;">${lecturer.name}</p>
                </div>
            </div>
        </body>
        </html>
    `;

    const reportWindow = window.open('', '_blank');
    reportWindow.document.write(reportHtml);
    reportWindow.document.close();
}


// --- Event Handlers ---
function addEventListeners() {
    document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

    // OPTIMIZATION: These listeners now trigger a data re-fetch
    document.getElementById('department-select').addEventListener('change', (e) => {
        state.selectedDepartmentId = e.target.value;
        renderLecturerTable(); // Re-render immediately with filtered lecturers
    });
    document.getElementById('year-select').addEventListener('change', (e) => {
        state.selectedYear = e.target.value;
        fetchDataForView(); // Fetch new data for the selected year
    });

    document.getElementById('add-assignment-btn').addEventListener('click', () => {
        if (!state.selectedYear) {
            showAlert('Vui lòng chọn một năm học trên trang chính trước khi thêm phân công.');
            return;
        }

        document.getElementById('assignment-form').reset();
        document.getElementById('assignment-id').value = '';
        document.getElementById('assignment-modal-title').textContent = 'Thêm Phân công Giảng dạy mới';
        
        const semesterSelect = document.getElementById('assignment-semester');
        semesterSelect.innerHTML = '<option value="">-- Chọn học kỳ --</option>';
        
        const semestersInYear = state.semesters.filter(s => s.namHoc === state.selectedYear);
        if (semestersInYear.length === 0) {
             showAlert(`Không có học kỳ nào được định nghĩa cho năm học ${state.selectedYear}.`);
             return;
        }
        semestersInYear.forEach(s => semesterSelect.innerHTML += `<option value="${s.id}">${s.tenHocKy}</option>`);
        
        if (semestersInYear.length > 0) {
            semesterSelect.value = semestersInYear[0].id;
        }

        const departmentSelect = document.getElementById('assignment-department');
        departmentSelect.innerHTML = '<option value="">-- Chọn khoa --</option>';
        state.departments.forEach(d => departmentSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`);
        
        document.getElementById('assignment-lecturer').innerHTML = '<option value="">-- Chọn khoa trước --</option>';
        document.getElementById('assignment-lecturer').disabled = true;
        document.getElementById('assignment-subject').innerHTML = '<option value="">-- Chọn khoa trước --</option>';
        document.getElementById('assignment-subject').disabled = true;
        document.getElementById('assignment-class').innerHTML = '<option value="">-- Chọn môn và học kỳ --</option>';
        document.getElementById('assignment-class').disabled = true;

        updateCalculatedHoursDisplay();
        openModal('assignment-modal');
    });
    
    document.getElementById('assignment-department').addEventListener('change', (e) => {
        const departmentId = e.target.value;
        const lecturerSelect = document.getElementById('assignment-lecturer');
        const subjectSelect = document.getElementById('assignment-subject');
        
        lecturerSelect.innerHTML = '<option value="">-- Chọn giảng viên --</option>';
        subjectSelect.innerHTML = '<option value="">-- Chọn học phần --</option>';
        
        if (departmentId) {
            state.lecturers.filter(l => l.departmentId === departmentId).forEach(l => {
                lecturerSelect.innerHTML += `<option value="${l.id}">${l.name}</option>`;
            });
            state.curriculumSubjects.filter(s => s.departmentId === departmentId).forEach(s => {
                subjectSelect.innerHTML += `<option value="${s.id}">${s.subjectName}</option>`;
            });
            lecturerSelect.disabled = false;
            subjectSelect.disabled = false;
        } else {
            lecturerSelect.disabled = true;
            subjectSelect.disabled = true;
        }
    });

    function populateAvailableClasses(classToInclude = null) {
        const classSelect = document.getElementById('assignment-class');
        const semesterId = document.getElementById('assignment-semester').value;
        const subjectId = document.getElementById('assignment-subject').value;
        
        classSelect.innerHTML = '<option value="">-- Chọn lớp --</option>';
        if (!semesterId || !subjectId) {
            classSelect.disabled = true;
            return;
        }

        const selectedSemester = state.semesters.find(s => s.id === semesterId);
        if (!selectedSemester) {
            classSelect.disabled = true;
            return;
        }

        const academicYear = selectedSemester.namHoc;
        const allSemesterIdsInYear = state.semesters
            .filter(s => s.namHoc === academicYear)
            .map(s => s.id);

        const assignedClassIds = new Set(
            state.assignments
                .filter(a => 
                    allSemesterIdsInYear.includes(a.semesterId) && 
                    a.subjectId === subjectId && 
                    a.classId !== classToInclude
                )
                .map(a => a.classId)
        );

        const availableClasses = state.teachingClasses.filter(c => 
            c.academicYear === selectedSemester.namHoc && !assignedClassIds.has(c.id)
        );

        availableClasses.forEach(c => {
            classSelect.innerHTML += `<option value="${c.id}">${c.className}</option>`;
        });
        classSelect.disabled = false;
    }

    document.getElementById('assignment-semester').addEventListener('change', populateAvailableClasses);
    document.getElementById('assignment-subject').addEventListener('change', (e) => {
        const subjectId = e.target.value;
        const subject = state.curriculumSubjects.find(s => s.id === subjectId);
        if (subject) {
            document.getElementById('periods-theory').value = subject.periodsTheory || 0;
            document.getElementById('periods-exercise').value = 0; 
            document.getElementById('periods-discussion').value = subject.periodsDiscussion || 0;
            document.getElementById('periods-practice').value = subject.periodsPractice || 0;
        }
        populateAvailableClasses();
        updateCalculatedHoursDisplay();
    });

    document.getElementById('assignment-class').addEventListener('change', (e) => {
        const classId = e.target.value;
        const teachingClass = state.teachingClasses.find(c => c.id === classId);
        const studentCountInput = document.getElementById('assignment-student-count');
        if (teachingClass) {
            studentCountInput.value = teachingClass.studentCount;
        } else {
            studentCountInput.value = 0;
        }
        updateCalculatedHoursDisplay();
    });
    
    document.getElementById('assignment-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const assignmentId = document.getElementById('assignment-id').value;
        const subjectId = document.getElementById('assignment-subject').value;
        const selectedSubject = state.curriculumSubjects.find(s => s.id === subjectId);
        const classId = document.getElementById('assignment-class').value;
        const selectedClass = state.teachingClasses.find(c => c.id === classId);

        const data = {
            semesterId: document.getElementById('assignment-semester').value,
            subjectId: subjectId,
            subjectName: selectedSubject ? selectedSubject.subjectName : '',
            classId: classId,
            className: selectedClass ? selectedClass.className : '',
            lecturerId: document.getElementById('assignment-lecturer').value,
            departmentId: document.getElementById('assignment-department').value,
            studentCount: parseInt(document.getElementById('assignment-student-count').value) || 0,
            coefficient: parseFloat(document.getElementById('assignment-coefficient').value) || 1.0,
            periodsTheory: parseInt(document.getElementById('periods-theory').value) || 0,
            periodsExercise: parseInt(document.getElementById('periods-exercise').value) || 0,
            periodsDiscussion: parseInt(document.getElementById('periods-discussion').value) || 0,
            periodsPractice: parseInt(document.getElementById('periods-practice').value) || 0,
            calculatedStandardHours: calculateStandardHours(),
        };

        if (!data.semesterId || !data.subjectId || !data.classId || !data.lecturerId || !data.departmentId) {
            showAlert('Vui lòng điền đầy đủ các trường thông tin bắt buộc.');
            return;
        }

        try {
            if (assignmentId) {
                await updateDoc(doc(assignmentsCol, assignmentId), data);
                showAlert('Cập nhật phân công thành công!', true);
            } else {
                await addDoc(assignmentsCol, data);
                showAlert('Thêm phân công mới thành công!', true);
            }
            closeModal('assignment-modal');
        } catch (error) {
            showAlert(`Lỗi khi lưu: ${error.message}`);
        }
    });

    // --- Import Event Listeners ---
    document.getElementById('import-data-btn').addEventListener('click', () => {
        document.getElementById('import-file-input').value = '';
        document.getElementById('import-log').innerHTML = '';
        document.getElementById('import-results-container').classList.add('hidden');
        openModal('import-modal');
    });
    document.getElementById('download-template-btn').addEventListener('click', downloadTemplate);
    document.getElementById('start-import-btn').addEventListener('click', handleFileImport);

    // --- Export Report Listeners ---
    document.getElementById('export-report-btn').addEventListener('click', () => {
        if (!state.selectedYear) {
            showAlert("Vui lòng chọn một năm học để xuất báo cáo.");
            return;
        }
        
        const select = document.getElementById('export-lecturer-select');
        select.innerHTML = '<option value="">-- Chọn giảng viên --</option>';

        let lecturersToDisplay = state.lecturers;
        if (state.selectedDepartmentId !== 'all') {
            lecturersToDisplay = state.lecturers.filter(l => l.departmentId === state.selectedDepartmentId);
        }

        if (lecturersToDisplay.length === 0) {
            showAlert("Không có giảng viên nào trong lựa chọn hiện tại để xuất báo cáo.");
            return;
        }

        lecturersToDisplay.forEach(l => {
            select.innerHTML += `<option value="${l.id}">${l.name} (${l.code})</option>`;
        });

        openModal('export-modal');
    });

    document.getElementById('generate-main-report-btn').addEventListener('click', () => {
        const lecturerId = document.getElementById('export-lecturer-select').value;
        if (!lecturerId) {
            showAlert("Vui lòng chọn một giảng viên.");
            return;
        }
        generateLecturerReportA(lecturerId, state.selectedYear, 'main');
        closeModal('export-modal');
    });

    document.getElementById('generate-extra-report-btn').addEventListener('click', () => {
        const lecturerId = document.getElementById('export-lecturer-select').value;
        if (!lecturerId) {
            showAlert("Vui lòng chọn một giảng viên.");
            return;
        }
        generateLecturerReportA(lecturerId, state.selectedYear, 'extra');
        closeModal('export-modal');
    });
    
    // --- Guidance Task Listeners ---
    document.getElementById('manage-guidance-btn').addEventListener('click', () => {
        document.getElementById('guidance-form').reset();
        document.getElementById('guidance-id').value = '';

        const departmentSelect = document.getElementById('guidance-department');
        departmentSelect.innerHTML = '<option value="all">-- Tất cả các Khoa --</option>';
        state.departments.forEach(d => {
            departmentSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
        });
        
        const lecturerSelect = document.getElementById('guidance-lecturer');
        lecturerSelect.innerHTML = '<option value="">-- Chọn khoa trước --</option>';
        lecturerSelect.disabled = true;

        const yearSelect = document.getElementById('guidance-year');
        yearSelect.innerHTML = '<option value="">-- Chọn năm học --</option>';
        getYearsForSelect().forEach(y => {
            yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
        });
        if (state.selectedYear) {
            yearSelect.value = state.selectedYear;
        }

        renderGuidanceList();
        openModal('guidance-modal');
    });

    document.getElementById('guidance-department').addEventListener('change', (e) => {
        const departmentId = e.target.value;
        const lecturerSelect = document.getElementById('guidance-lecturer');
        lecturerSelect.innerHTML = '<option value="">-- Chọn giảng viên --</option>';
        
        let lecturersToList = state.lecturers;
        if (departmentId !== 'all') {
            lecturersToList = state.lecturers.filter(l => l.departmentId === departmentId);
        }

        lecturersToList.forEach(l => {
            lecturerSelect.innerHTML += `<option value="${l.id}">${l.name}</option>`;
        });
        lecturerSelect.disabled = false;
    });

    document.getElementById('clear-guidance-form-btn').addEventListener('click', () => {
        document.getElementById('guidance-form').reset();
        document.getElementById('guidance-id').value = '';
        document.getElementById('guidance-lecturer').disabled = true;
    });

    document.getElementById('guidance-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);

        const id = document.getElementById('guidance-id').value;
        const type = document.getElementById('guidance-type').value;
        const credits = parseFloat(document.getElementById('guidance-credits').value);
        const studentCount = parseInt(document.getElementById('guidance-students').value, 10);
        
        let calculatedHours = 0;
        if (type === 'Đồ án tốt nghiệp') {
            calculatedHours = credits * studentCount * 2;
        } else { // Thực tập
            calculatedHours = credits * studentCount * 0.8;
        }

        const data = {
            type: type,
            content: document.getElementById('guidance-course').value.trim(),
            credits: credits,
            studentCount: studentCount,
            lecturerId: document.getElementById('guidance-lecturer').value,
            academicYear: document.getElementById('guidance-year').value,
            calculatedHours: calculatedHours
        };

        if (!data.type || !data.content || !data.lecturerId || !data.academicYear || isNaN(data.credits) || isNaN(data.studentCount)) {
            showAlert("Vui lòng điền đầy đủ thông tin.");
            setButtonLoading(btn, false);
            return;
        }

        try {
            if (id) {
                await updateDoc(doc(guidanceCol, id), data);
                showAlert('Cập nhật thành công!', true);
            } else {
                await addDoc(guidanceCol, data);
                showAlert('Thêm mới thành công!', true);
            }
            document.getElementById('guidance-form').reset();
            document.getElementById('guidance-id').value = '';
        } catch (error) {
            showAlert(`Lỗi khi lưu: ${error.message}`);
        } finally {
            setButtonLoading(btn, false);
        }
    });

    // --- Quota & Reduction Listeners ---
    document.getElementById('manage-quota-btn').addEventListener('click', () => {
        document.getElementById('management-form').reset();
        document.getElementById('management-id').value = '';
        
        const deptSelect = document.getElementById('management-department');
        deptSelect.innerHTML = '<option value="">-- Chọn khoa --</option>';
        state.departments.forEach(d => {
            deptSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
        });

        const yearSelect = document.getElementById('management-year');
        yearSelect.innerHTML = '<option value="">-- Chọn năm học --</option>';
        getYearsForSelect().forEach(y => {
            yearSelect.innerHTML += `<option value="${y}">${y}</option>`;
        });
        if (state.selectedYear) yearSelect.value = state.selectedYear;

        document.getElementById('management-lecturer').disabled = true;
        renderManagementList();
        openModal('management-modal');
    });

    document.getElementById('management-department').addEventListener('change', (e) => {
        const deptId = e.target.value;
        const lecturerSelect = document.getElementById('management-lecturer');
        lecturerSelect.innerHTML = '<option value="">-- Chọn giảng viên --</option>';
        if (deptId) {
            state.lecturers.filter(l => l.departmentId === deptId).forEach(l => {
                lecturerSelect.innerHTML += `<option value="${l.id}">${l.name}</option>`;
            });
            lecturerSelect.disabled = false;
        } else {
            lecturerSelect.disabled = true;
        }
    });
    
    document.getElementById('management-lecturer').addEventListener('change', (e) => {
        const lecturerId = e.target.value;
        const academicYear = document.getElementById('management-year').value;
        const departmentId = document.getElementById('management-department').value;
        const existingData = state.managementData.find(m => m.lecturerId === lecturerId && m.academicYear === academicYear);
        
        if (existingData) {
            document.getElementById('management-id').value = existingData.id;
            document.getElementById('management-quota').value = existingData.standardQuota || 270;
            document.getElementById('management-reduction').value = existingData.reductionHours || 0;
            document.getElementById('management-reduction-reason').value = existingData.reductionDescription || '';
        } else {
            document.getElementById('management-id').value = '';
            document.getElementById('management-quota').value = 270;
            document.getElementById('management-reduction').value = 0;
            document.getElementById('management-reduction-reason').value = '';
        }
        // Preserve selections
        document.getElementById('management-department').value = departmentId;
        document.getElementById('management-lecturer').value = lecturerId;
        document.getElementById('management-year').value = academicYear;
    });


    document.getElementById('clear-management-form-btn').addEventListener('click', () => {
        document.getElementById('management-form').reset();
        document.getElementById('management-id').value = '';
        document.getElementById('management-lecturer').disabled = true;
    });

    document.getElementById('management-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);

        const id = document.getElementById('management-id').value;
        const data = {
            lecturerId: document.getElementById('management-lecturer').value,
            academicYear: document.getElementById('management-year').value,
            departmentId: document.getElementById('management-department').value,
            standardQuota: parseFloat(document.getElementById('management-quota').value) || 0,
            reductionHours: parseFloat(document.getElementById('management-reduction').value) || 0,
            reductionDescription: document.getElementById('management-reduction-reason').value.trim(),
        };

        if (!data.lecturerId || !data.academicYear || !data.departmentId) {
            showAlert("Vui lòng chọn Khoa, Giảng viên và Năm học.");
            setButtonLoading(btn, false);
            return;
        }

        try {
            if (id) {
                await updateDoc(doc(managementCol, id), data);
            } else {
                await addDoc(managementCol, data);
            }
            showAlert("Lưu thông tin thành công!", true);
            document.getElementById('management-form').reset();
            document.getElementById('management-id').value = '';
        } catch (error) {
            showAlert(`Lỗi khi lưu: ${error.message}`);
        } finally {
            setButtonLoading(btn, false);
        }
    });
}

function renderGuidanceList() {
    const listBody = document.getElementById('guidance-list-body');
    listBody.innerHTML = '';
    state.guidanceTasks.forEach(task => {
        const lecturer = state.lecturers.find(l => l.id === task.lecturerId);
        const row = document.createElement('tr');
        row.className = 'border-b';
        row.innerHTML = `
            <td class="px-4 py-2">${task.type} ${task.content} (${task.academicYear})</td>
            <td class="px-4 py-2">${lecturer ? lecturer.name : 'N/A'}</td>
            <td class="px-4 py-2 text-center">${task.studentCount}</td>
            <td class="px-4 py-2 text-center font-semibold">${task.calculatedHours.toFixed(2)}</td>
            <td class="px-4 py-2 text-center">
                <button class="text-blue-500 mr-2" onclick="editGuidanceTask('${task.id}')"><i class="fas fa-edit"></i></button>
                <button class="text-red-500" onclick="deleteGuidanceTask('${task.id}')"><i class="fas fa-trash"></i></button>
            </td>
        `;
        listBody.appendChild(row);
    });
}

function renderManagementList() {
    const container = document.getElementById('management-list-container');
    const year = document.getElementById('management-year').value;
    if (!year) {
        container.innerHTML = '';
        return;
    }
    const dataForYear = state.managementData.filter(d => d.academicYear === year);

    if(dataForYear.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 p-4">Chưa có dữ liệu định mức/giảm trừ cho năm học này.</p>';
        return;
    }
    
    let tableHTML = `
        <table class="min-w-full bg-white">
            <thead class="bg-gray-100 sticky top-0">
                <tr>
                    <th class="px-4 py-2 text-left">Giảng viên</th>
                    <th class="px-4 py-2 text-center">Định mức</th>
                    <th class="px-4 py-2 text-center">Giảm trừ</th>
                    <th class="px-4 py-2 text-left">Nội dung giảm trừ</th>
                </tr>
            </thead>
            <tbody>
    `;
    dataForYear.forEach(item => {
        const lecturer = state.lecturers.find(l => l.id === item.lecturerId);
        tableHTML += `
            <tr class="border-b">
                <td class="px-4 py-2">${lecturer ? lecturer.name : 'N/A'}</td>
                <td class="px-4 py-2 text-center">${item.standardQuota}</td>
                <td class="px-4 py-2 text-center">${item.reductionHours}</td>
                <td class="px-4 py-2 whitespace-pre-wrap">${item.reductionDescription}</td>
            </tr>
        `;
    });
    tableHTML += '</tbody></table>';
    container.innerHTML = tableHTML;
}

window.editGuidanceTask = (id) => {
    const task = state.guidanceTasks.find(t => t.id === id);
    if (task) {
        const lecturer = state.lecturers.find(l => l.id === task.lecturerId);
        const departmentId = lecturer ? lecturer.departmentId : 'all';

        document.getElementById('guidance-id').value = task.id;
        document.getElementById('guidance-department').value = departmentId;
        document.getElementById('guidance-department').dispatchEvent(new Event('change'));

        setTimeout(() => {
            document.getElementById('guidance-lecturer').value = task.lecturerId;
        }, 100);

        document.getElementById('guidance-type').value = task.type;
        document.getElementById('guidance-course').value = task.content;
        document.getElementById('guidance-credits').value = task.credits;
        document.getElementById('guidance-students').value = task.studentCount;
        document.getElementById('guidance-year').value = task.academicYear;
    }
};

window.deleteGuidanceTask = (id) => {
    if (confirm("Bạn có chắc muốn xóa mục hướng dẫn này?")) {
        deleteDoc(doc(guidanceCol, id))
            .then(() => showAlert("Xóa thành công!", true))
            .catch(error => showAlert(`Lỗi khi xóa: ${error.message}`));
    }
};


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    addEventListeners();
    initializeFirebase();
});
