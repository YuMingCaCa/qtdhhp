// Import các hàm cần thiết từ Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- CẤU HÌNH FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCJcTMUwO-w7V0YsGUKWeaW-zl42Ww7fxo",
  authDomain: "qlylaodongbdhhp.firebaseapp.com",
  projectId: "qlylaodongbdhhp",
  storageBucket: "qlylaodongbdhhp.appspot.com",
  messagingSenderId: "462439202995",
  appId: "1:462439202995:web:06bc11042efb9b99d4f0c6"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// --- ĐỊNH NGHĨA ĐƯỜNG DẪN DỮ LIỆU ---
const appId = firebaseConfig.projectId || 'hpu-workload-tracker-app';
const basePath = `artifacts/${appId}/public/data`;
const usersCol = collection(db, `${basePath}/users`);
const departmentsCol = collection(db, `${basePath}/departments`);
const weeklyTasksCol = collection(db, `${basePath}/weekly_tasks`);
const weeklyInfoCol = collection(db, `${basePath}/weekly_info`);
const monthlyInfoCol = collection(db, `${basePath}/monthly_info`);

// --- LẤY CÁC PHẦN TỬ GIAO DIỆN ---
const mainContent = document.getElementById('weekly-task-module-content');
const weekSelector = document.getElementById('week-selector');
const departmentSelector = document.getElementById('department-selector');
const scheduleTitle = document.getElementById('schedule-title');
const scheduleBody = document.getElementById('schedule-body');
const keyTasksSection = document.getElementById('key-tasks-section');
const notesSection = document.getElementById('notes-section');
const departmentHeadTitle = document.getElementById('department-head-title');
const departmentHeadName = document.getElementById('department-head-name');
const addTaskBtn = document.getElementById('add-task-btn');
const printScheduleBtn = document.getElementById('print-schedule-btn');
const manageDepartmentsBtn = document.getElementById('manage-departments-btn');
const manageWeekInfoBtn = document.getElementById('manage-week-info-btn');
const manageMonthlyInfoBtn = document.getElementById('manage-monthly-info-btn');

// Modal công việc
const taskModal = document.getElementById('task-modal');
const taskModalTitle = document.getElementById('task-modal-title');
const closeTaskModalBtn = document.getElementById('close-task-modal');
const taskForm = document.getElementById('task-form');
const taskIdInput = document.getElementById('task-id');
const taskDateInput = document.getElementById('task-date');
const taskStartTimeInput = document.getElementById('task-start-time');
const taskEndTimeInput = document.getElementById('task-end-time');
const taskContentInput = document.getElementById('task-content');
const taskLocationInput = document.getElementById('task-location');

// Modal Khoa
const departmentModal = document.getElementById('department-modal');
const departmentForm = document.getElementById('department-form');
const departmentIdInput = document.getElementById('department-id');
const departmentNameInput = document.getElementById('department-name');
const departmentHeadTitleInput = document.getElementById('department-head-title-input');
const departmentHeadNameInput = document.getElementById('department-head-name-input');
const departmentsListBody = document.getElementById('departments-list-body');

// Modal Thông tin Tuần
const weekInfoModal = document.getElementById('week-info-modal');
const weekInfoForm = document.getElementById('week-info-form');
const keyTasksInput = document.getElementById('key-tasks-input');
const notesInput = document.getElementById('notes-input');

// Modal Công tác Tháng
const monthlyInfoModal = document.getElementById('monthly-info-modal');
const monthlyInfoForm = document.getElementById('monthly-info-form');
const monthSelector = document.getElementById('month-selector');
const monthlyKeyTasksInput = document.getElementById('monthly-key-tasks-input');
const printMonthlyReportBtn = document.getElementById('print-monthly-report-btn');

// Modal thông báo
const alertModal = document.getElementById('alert-modal');
const alertMessage = document.getElementById('alert-message');
const alertOkBtn = document.getElementById('alert-ok-btn');
const confirmModal = document.getElementById('confirm-modal');
const confirmMessage = document.getElementById('confirm-message');
const confirmBtnYes = document.getElementById('confirm-btn-yes');
const confirmBtnNo = document.getElementById('confirm-btn-no');

let currentUserInfo = null;
let currentUnsubscribeTasks = null;
let currentUnsubscribeDepartments = null;
let currentUnsubscribeWeekInfo = null;
let allDepartments = [];
let currentWeekInfo = {};

// --- HÀM TIỆN ÍCH ---
const showAlert = (message) => {
    alertMessage.textContent = message;
    alertModal.style.display = 'flex';
};

const showConfirm = (message) => {
    return new Promise((resolve) => {
        confirmMessage.textContent = message;
        confirmModal.style.display = 'flex';
        confirmBtnYes.onclick = () => { closeModal('confirm-modal'); resolve(true); };
        confirmBtnNo.onclick = () => { closeModal('confirm-modal'); resolve(false); };
    });
};

const getWeekInfo = (date) => {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setHours(0, 0, 0, 0);
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const startDate = new Date(d.setDate(d.getDate() - day));
    const endDate = new Date(new Date(startDate).setDate(startDate.getDate() + 6));
    const year = startDate.getFullYear();
    const oneJan = new Date(year, 0, 1);
    const numberOfDays = Math.floor((startDate - oneJan) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
    return { year, weekNumber, startDate, endDate };
};

const formatDate = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};

const closeModal = (modalId) => {
    document.getElementById(modalId).style.display = 'none';
};

// --- PHÂN QUYỀN ---
function updateUIForRole() {
    const isAdmin = currentUserInfo && currentUserInfo.role === 'admin';
    const adminElements = document.querySelectorAll('.admin-only');
    
    adminElements.forEach(el => {
        el.style.display = isAdmin ? '' : 'none'; // Use '' to revert to default display
    });
}

// --- QUẢN LÝ KHOA ---
const renderDepartmentsList = (departments) => {
    departmentsListBody.innerHTML = '';
    departments.forEach(dept => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-4 py-2">${dept.name}</td>
            <td class="px-4 py-2">${dept.headName || ''}</td>
            <td class="px-4 py-2 text-center">
                <button data-id="${dept.id}" class="edit-dept-btn text-blue-500 hover:text-blue-700"><i class="fas fa-edit"></i></button>
                <button data-id="${dept.id}" class="delete-dept-btn text-red-500 hover:text-red-700 ml-2"><i class="fas fa-trash"></i></button>
            </td>
        `;
        departmentsListBody.appendChild(row);
    });
};

const populateDepartmentSelector = (departments) => {
    const currentValue = departmentSelector.value;
    departmentSelector.innerHTML = '<option value="general">Lịch chung toàn khoa</option>';
    departments.forEach(dept => {
        const option = document.createElement('option');
        option.value = dept.id;
        option.textContent = dept.name;
        departmentSelector.appendChild(option);
    });
    if (currentValue) departmentSelector.value = currentValue;
};

const handleDepartmentFormSubmit = async (e) => {
    e.preventDefault();
    const id = departmentIdInput.value;
    const name = departmentNameInput.value.trim();
    const headTitle = departmentHeadTitleInput.value.trim();
    const headName = departmentHeadNameInput.value.trim();
    if (!name) return;
    
    const data = { name, headTitle, headName };

    try {
        if (id) await updateDoc(doc(departmentsCol, id), data);
        else await addDoc(departmentsCol, data);
        showAlert(id ? 'Cập nhật khoa thành công!' : 'Thêm khoa thành công!');
        departmentForm.reset();
        departmentIdInput.value = '';
    } catch (error) {
        console.error("Error saving department:", error);
        showAlert('Lỗi khi lưu thông tin khoa.');
    }
};

const deleteDepartment = async (id) => {
    if (await showConfirm('Bạn có chắc muốn xóa khoa này?')) {
        try {
            await deleteDoc(doc(departmentsCol, id));
            showAlert('Xóa khoa thành công.');
        } catch (error) {
            console.error("Error deleting department:", error);
            showAlert('Lỗi khi xóa khoa.');
        }
    }
};

const loadDepartments = () => {
    if (currentUnsubscribeDepartments) currentUnsubscribeDepartments();
    const q = query(departmentsCol);
    currentUnsubscribeDepartments = onSnapshot(q, (snapshot) => {
        allDepartments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a,b) => a.name.localeCompare(b.name));
        renderDepartmentsList(allDepartments);
        populateDepartmentSelector(allDepartments);
    });
};

// --- QUẢN LÝ CÔNG VIỆC & LỊCH TRÌNH ---
const renderSchedule = (tasks, weekInfo, weekMetadata) => {
    scheduleBody.innerHTML = '';
    keyTasksSection.innerHTML = '';
    notesSection.innerHTML = '';
    
    const isAdmin = currentUserInfo && currentUserInfo.role === 'admin';
    const selectedDeptId = departmentSelector.value;
    if (selectedDeptId !== 'general') {
        const dept = allDepartments.find(d => d.id === selectedDeptId);
        departmentHeadTitle.textContent = dept?.headTitle || 'TRƯỞNG ĐƠN VỊ';
        departmentHeadName.textContent = dept?.headName || '';
    } else {
        departmentHeadTitle.textContent = 'TRƯỞNG KHOA';
        departmentHeadName.textContent = 'PGS.TS Lê Đắc Nhường';
    }
    
    scheduleTitle.textContent = `LỊCH CÔNG TÁC TUẦN ${weekInfo.weekNumber} (Từ ngày ${formatDate(weekInfo.startDate)} đến ngày ${formatDate(weekInfo.endDate)})`;
    
    if (weekMetadata.keyTasks) {
        const formattedTasks = weekMetadata.keyTasks.split('\n').map(line => {
            line = line.trim();
            if (line.startsWith('-')) return `<li>${line.substring(1).trim()}</li>`;
            return line ? `<p>${line}</p>` : '';
        }).join('');
        keyTasksSection.innerHTML = `<h3 class="font-bold text-lg mb-2">Công tác trọng tâm:</h3><div class="prose prose-sm max-w-none">${formattedTasks.includes('<li>') ? `<ul>${formattedTasks}</ul>` : formattedTasks}</div>`;
    }

    const daysOfWeek = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    for (let i = 0; i < 7; i++) {
        const currentDate = new Date(weekInfo.startDate);
        currentDate.setDate(weekInfo.startDate.getDate() + i);
        const dayOfWeekIndex = currentDate.getDay();
        const dayName = daysOfWeek[dayOfWeekIndex];
        const dateString = formatDate(currentDate);
        
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const isoDateString = `${year}-${month}-${day}`;
        
        const tasksForDay = tasks.filter(task => task.date === isoDateString);
        
        const dutyLeader = weekMetadata.dutyLeaders?.[dayOfWeekIndex] || '';
        const dutyLeaderHtml = dutyLeader ? `<br><i class="text-sm font-normal">(Trực: ${dutyLeader})</i>` : '';
        const dayCellContent = `${dayName}<br>${dateString}${dutyLeaderHtml}`;

        const actionCellHtml = isAdmin ? `
            <td class="p-4 text-center align-top no-print">
                <button data-id="{TASK_ID}" class="edit-task-btn text-blue-500 hover:text-blue-700"><i class="fas fa-edit"></i></button>
                <button data-id="{TASK_ID}" class="delete-task-btn text-red-500 hover:text-red-700 ml-2"><i class="fas fa-trash"></i></button>
            </td>` : '';

        if (tasksForDay.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="p-4 font-semibold text-center align-top h-20">${dayCellContent}</td>
                <td class="p-4 text-left align-top"></td>
                <td class="p-4 text-center align-top"></td>
                ${isAdmin ? '<td class="p-4 text-center align-top no-print"></td>' : ''}
            `;
            scheduleBody.appendChild(row);
        } else {
            tasksForDay.forEach((task, index) => {
                const row = document.createElement('tr');
                let dayCellHtml = '';
                if (index === 0) {
                    dayCellHtml = `<td class="p-4 font-semibold text-center align-top" rowspan="${tasksForDay.length}">${dayCellContent}</td>`;
                }

                let timeString = '';
                if (task.startTime) timeString = `<strong>${task.startTime.replace(':', 'h')}${task.endTime ? ` - ${task.endTime.replace(':', 'h')}` : ''}:</strong> `;

                const contentHtml = task.content
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\n/g, '<br>');

                row.innerHTML = `
                    ${dayCellHtml}
                    <td class="p-4 text-left align-top">${timeString}${contentHtml}</td>
                    <td class="p-4 text-center align-top">${task.location}</td>
                    ${actionCellHtml.replace(/{TASK_ID}/g, task.id)}
                `;
                scheduleBody.appendChild(row);
            });
        }
    }

    if (weekMetadata.notes) {
        const formattedNotes = weekMetadata.notes.split('\n').map(line => line.trim() ? `<li>${line}</li>` : '').join('');
        notesSection.innerHTML = `<h3 class="font-bold">Ghi chú:</h3><ul class="list-disc list-inside">${formattedNotes}</ul>`;
    }
};


const loadAndRenderSchedule = () => {
    if (!weekSelector.value) return;
    const [year, week] = weekSelector.value.split('-W');
    const firstDayOfYear = new Date(Date.UTC(year, 0, 1));
    const days = (week - 1) * 7;
    const date = new Date(firstDayOfYear.getTime() + days * 86400000);
    const weekInfo = getWeekInfo(date);
    const selectedDeptId = departmentSelector.value;

    if (currentUnsubscribeTasks) currentUnsubscribeTasks();
    if (currentUnsubscribeWeekInfo) currentUnsubscribeWeekInfo();

    const weekInfoDocId = `${weekInfo.year}-W${String(weekInfo.weekNumber).padStart(2, '0')}_${selectedDeptId}`;
    const weekInfoDocRef = doc(weeklyInfoCol, weekInfoDocId);

    currentUnsubscribeWeekInfo = onSnapshot(weekInfoDocRef, (docSnap) => {
        currentWeekInfo = docSnap.exists() ? docSnap.data() : {};
        
        const q = query(weeklyTasksCol, where('year', '==', weekInfo.year), where('weekNumber', '==', weekInfo.weekNumber), where('departmentId', '==', selectedDeptId));
        currentUnsubscribeTasks = onSnapshot(q, (querySnapshot) => {
            let tasks = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            tasks.sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
            renderSchedule(tasks, weekInfo, currentWeekInfo);
        });
    });
};

const handleTaskFormSubmit = async (e) => {
    e.preventDefault();
    const id = taskIdInput.value;
    const dateString = taskDateInput.value;

    if (!dateString) {
        showAlert("Vui lòng chọn một ngày.");
        return;
    }

    const parts = dateString.split('-').map(part => parseInt(part, 10));
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    
    const weekInfo = getWeekInfo(date);
    
    const taskData = {
        date: dateString,
        startTime: taskStartTimeInput.value || null,
        endTime: taskEndTimeInput.value || null,
        content: taskContentInput.value.trim(),
        location: taskLocationInput.value.trim(),
        year: weekInfo.year,
        weekNumber: weekInfo.weekNumber,
        departmentId: departmentSelector.value,
    };

    try {
        if (id) await updateDoc(doc(weeklyTasksCol, id), taskData);
        else await addDoc(weeklyTasksCol, taskData);
        showAlert(id ? 'Cập nhật thành công!' : 'Thêm thành công!');
        closeModal('task-modal');
    } catch (error) {
        console.error("Error saving task:", error);
        showAlert('Lỗi khi lưu công việc.');
    }
};

const openTaskModal = async (taskId = null) => {
    taskForm.reset();
    if (taskId) {
        const docRef = doc(weeklyTasksCol, taskId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const task = docSnap.data();
            taskModalTitle.textContent = 'Chỉnh sửa công việc';
            taskIdInput.value = taskId;
            taskDateInput.value = task.date;
            taskStartTimeInput.value = task.startTime || '';
            taskEndTimeInput.value = task.endTime || '';
            taskContentInput.value = task.content;
            taskLocationInput.value = task.location;
        } else {
            showAlert("Không tìm thấy công việc này!");
            return;
        }
    } else {
        taskModalTitle.textContent = 'Thêm công việc mới';
        taskIdInput.value = '';
    }
    taskModal.style.display = 'flex';
};

const deleteTask = async (id) => {
    if (await showConfirm('Bạn có chắc muốn xóa công việc này?')) {
        try {
            await deleteDoc(doc(weeklyTasksCol, id));
            showAlert('Đã xóa công việc.');
        } catch (error) {
            console.error("Error deleting task:", error);
            showAlert('Lỗi khi xóa công việc.');
        }
    }
};

// --- QUẢN LÝ THÔNG TIN TUẦN ---
const openWeekInfoModal = () => {
    weekInfoForm.reset();
    keyTasksInput.value = currentWeekInfo.keyTasks || '';
    notesInput.value = currentWeekInfo.notes || '';
    // Sunday is 0, Monday is 1, ..., Saturday is 6
    for (let i = 0; i <= 6; i++) {
        const input = document.getElementById(`duty-leader-${i}`);
        if(input) {
            input.value = currentWeekInfo.dutyLeaders?.[i] || '';
        }
    }
    weekInfoModal.style.display = 'flex';
};

const handleWeekInfoFormSubmit = async (e) => {
    e.preventDefault();
    if (!weekSelector.value) { showAlert("Vui lòng chọn một tuần."); return; }
    const [year, week] = weekSelector.value.split('-W');
    const selectedDeptId = departmentSelector.value;
    const weekInfoDocId = `${year}-W${String(parseInt(week)).padStart(2, '0')}_${selectedDeptId}`;
    
    const dutyLeaders = {};
    // Sunday is 0, Monday is 1, ..., Saturday is 6
    for (let i = 0; i <= 6; i++) {
        const leaderName = document.getElementById(`duty-leader-${i}`).value.trim();
        if (leaderName) dutyLeaders[i] = leaderName;
    }

    const data = {
        keyTasks: keyTasksInput.value.trim(),
        notes: notesInput.value.trim(),
        dutyLeaders: dutyLeaders
    };

    try {
        await setDoc(doc(weeklyInfoCol, weekInfoDocId), data, { merge: true });
        showAlert("Cập nhật thông tin tuần thành công!");
        closeModal('week-info-modal');
    } catch (error) {
        console.error("Error saving week info:", error);
        showAlert("Lỗi khi lưu thông tin tuần.");
    }
};

// --- QUẢN LÝ CÔNG TÁC THÁNG ---
const loadMonthlyInfo = async () => {
    const monthValue = monthSelector.value;
    const selectedDeptId = departmentSelector.value;
    if (!monthValue || !selectedDeptId) {
        monthlyKeyTasksInput.value = '';
        return;
    }

    const docId = `${monthValue}_${selectedDeptId}`;
    const docRef = doc(monthlyInfoCol, docId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        monthlyKeyTasksInput.value = docSnap.data().content || '';
    } else {
        monthlyKeyTasksInput.value = '';
    }
};

const openMonthlyInfoModal = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    monthSelector.value = `${year}-${month}`;
    loadMonthlyInfo();
    monthlyInfoModal.style.display = 'flex';
};

const handleMonthlyInfoFormSubmit = async (e) => {
    e.preventDefault();
    const monthValue = monthSelector.value;
    const selectedDeptId = departmentSelector.value;
    if (!monthValue || !selectedDeptId) {
        showAlert("Vui lòng chọn tháng và khoa.");
        return;
    }
    const docId = `${monthValue}_${selectedDeptId}`;
    const content = monthlyKeyTasksInput.value.trim();

    try {
        await setDoc(doc(monthlyInfoCol, docId), { content });
        showAlert("Lưu công tác tháng thành công!");
        closeModal('monthly-info-modal');
    } catch (error) {
        console.error("Error saving monthly info:", error);
        showAlert("Lỗi khi lưu công tác tháng.");
    }
};

// --- PRINTING LOGIC ---
const generateMonthlyReport = () => {
    const monthValue = monthSelector.value;
    const selectedDeptId = departmentSelector.value;
    if (!monthValue || selectedDeptId === 'general') {
        showAlert("Vui lòng chọn một tháng và một khoa cụ thể để in báo cáo.");
        return;
    }

    const [year, month] = monthValue.split('-');
    const department = allDepartments.find(d => d.id === selectedDeptId);
    const content = monthlyKeyTasksInput.value;

    if (!department) {
        showAlert("Không tìm thấy thông tin khoa.");
        return;
    }

    let contentHtml = '';
    let inList = false;
    content.split('\n').forEach(line => {
        line = line.trim();
        if (!line) return;

        if (line.startsWith('-') || line.startsWith('*') || line.startsWith('+')) {
            if (!inList) {
                contentHtml += '<ul>';
                inList = true;
            }
            contentHtml += `<li>${line.substring(1).trim()}</li>`;
        } else {
            if (inList) {
                contentHtml += '</ul>';
                inList = false;
            }
            contentHtml += `<p><strong>${line}</strong></p>`;
        }
    });
    if (inList) {
        contentHtml += '</ul>';
    }

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html><head><title>Công tác trọng tâm tháng ${month}/${year}</title>
        <style>
            @page { size: A4; margin: 2cm; }
            body { font-family: 'Times New Roman', Times, serif; font-size: 13pt; line-height: 1.5; }
            .header-table { width: 100%; border-collapse: collapse; }
            .header-left { text-align: center; vertical-align: top; width: 50%; }
            .header-right { text-align: center; vertical-align: top; width: 50%; }
            .underline { border-bottom: 1px solid black; display: inline-block; padding-bottom: 1px; width: 60%; }
            p { margin: 0 0 5px 0; }
            strong { font-weight: bold; }
            ul { list-style-type: none; padding-left: 0; margin: 0 0 10px 0; }
            li { padding-left: 1.5em; text-indent: -1.5em; margin-bottom: 5px; }
            li::before { content: "- "; }
            .main-title { text-align: center; font-size: 14pt; font-weight: bold; margin: 30px 0 20px 0; }
            .footer { display: flex; justify-content: flex-end; margin-top: 50px; }
            .signature { text-align: center; width: 45%; }
        </style>
        </head><body>
        <table class="header-table">
            <tr>
                <td class="header-left">
                    <p>TRƯỜNG ĐẠI HỌC HẢI PHÒNG</p>
                    <p><strong>${department.name.toUpperCase()}</strong></p>
                </td>
                <td class="header-right">
                    <p><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong></p>
                    <p><strong class="underline">Độc lập – Tự do – Hạnh phúc</strong></p>
                </td>
            </tr>
        </table>
        <p style="text-align:right;font-style:italic;margin-top:10px;">Hải Phòng, ngày ${formatDate(new Date())}</p>
        <h1 class="main-title">CÔNG TÁC VÀ NHIỆM VỤ TRỌNG TÂM THÁNG ${month}/${year}</h1>
        <div>${contentHtml}</div>
        <div class="footer">
            <div class="signature">
                <p><strong>${department.headTitle || 'TRƯỞNG ĐƠN VỊ'}</strong></p>
                <p style="margin-top:80px;"><strong>${department.headName || ''}</strong></p>
            </div>
        </div>
        </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
};

const generatePrintableVersion = () => {
    const selectedDeptId = departmentSelector.value;
    const department = allDepartments.find(d => d.id === selectedDeptId) || { name: 'Toàn Khoa', headTitle: 'TRƯỞNG KHOA', headName: 'PGS.TS Lê Đắc Nhường' };
    const departmentName = department.name.toUpperCase();
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) { showAlert("Không thể mở cửa sổ in. Vui lòng tắt trình chặn pop-up."); return; }
    
    const headerHtml = `<div style="display: flex; justify-content: space-between; text-align: center; font-size: 13pt;"><div><p>TRƯỜNG ĐẠI HỌC HẢI PHÒNG</p><p style="font-weight: bold;">${departmentName}</p></div><div><p style="font-weight: bold;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p><p style="font-weight: bold;">Độc lập - Tự do - Hạnh phúc</p></div></div><p style="text-align: right; font-style: italic; font-size: 13pt; margin-top: 10px;">Hải Phòng, ngày ${formatDate(new Date())}</p><h1 style="text-align: center; font-size: 14pt; margin-top: 20px;">${scheduleTitle.textContent}</h1>`;
    const keyTasksHtml = keyTasksSection.innerHTML ? `<div style="font-size: 13pt; margin-top: 20px;">${keyTasksSection.innerHTML}</div>` : '';
    const tableHtml = `<table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13pt;"><thead style="background-color: #f2f2f2;"><tr><th style="border: 1px solid black; padding: 8px; width: 20%;">Thứ/Ngày</th><th style="border: 1px solid black; padding: 8px; width: 60%;">Thời gian - Nội dung</th><th style="border: 1px solid black; padding: 8px; width: 20%;">Địa điểm</th></tr></thead><tbody>${scheduleBody.innerHTML.replace(/<td class="[^"]*no-print[^"]*">.*?<\/td>/g, '')}</tbody></table>`;
    const notesHtml = notesSection.innerHTML ? `<div style="font-size: 13pt; margin-top: 20px;">${notesSection.innerHTML}</div>` : '';
    const footerHtml = `<div style="display: flex; justify-content: flex-end; margin-top: 50px; font-size: 13pt;"><div style="text-align: center; width: 40%;"><p style="font-weight: bold;">${department.headTitle || 'TRƯỞNG ĐƠN VỊ'}</p><p style="margin-top: 80px;">${department.headName || ''}</p></div></div>`;

    printWindow.document.write(`<html><head><title>Lịch công tác tuần</title><style>body{font-family:'Times New Roman',Times,serif}table,th,td{border:1px solid black}td{vertical-align:top;padding:8px}ul{margin:0;padding-left:20px}</style></head><body>${headerHtml}${keyTasksHtml}${tableHtml}${notesHtml}${footerHtml}</body></html>`);
    printWindow.document.close();
    printWindow.print();
};

// --- KHỞI TẠO VÀ GẮN SỰ KIỆN ---
const setupEventListeners = () => {
    weekSelector.addEventListener('change', loadAndRenderSchedule);
    departmentSelector.addEventListener('change', loadAndRenderSchedule);
    printScheduleBtn.addEventListener('click', generatePrintableVersion);
    alertOkBtn.addEventListener('click', () => closeModal('alert-modal'));

    // Chỉ gán sự kiện cho admin
    const isAdmin = currentUserInfo && currentUserInfo.role === 'admin';
    if (isAdmin) {
        addTaskBtn.addEventListener('click', () => openTaskModal(null));
        manageDepartmentsBtn.addEventListener('click', () => { departmentModal.style.display = 'flex'; });
        manageWeekInfoBtn.addEventListener('click', openWeekInfoModal);
        manageMonthlyInfoBtn.addEventListener('click', openMonthlyInfoModal);

        closeTaskModalBtn.addEventListener('click', () => closeModal('task-modal'));
        taskForm.addEventListener('submit', handleTaskFormSubmit);
        
        weekInfoForm.addEventListener('submit', handleWeekInfoFormSubmit);
        document.querySelector('.close-button[onclick="closeModal(\'week-info-modal\')"]').addEventListener('click', () => closeModal('week-info-modal'));

        monthlyInfoForm.addEventListener('submit', handleMonthlyInfoFormSubmit);
        monthSelector.addEventListener('change', loadMonthlyInfo);
        printMonthlyReportBtn.addEventListener('click', generateMonthlyReport);
        document.querySelector('.close-button[onclick="closeModal(\'monthly-info-modal\')"]').addEventListener('click', () => closeModal('monthly-info-modal'));

        departmentForm.addEventListener('submit', handleDepartmentFormSubmit);
        document.querySelector('.close-button[onclick="closeModal(\'department-modal\')"]').addEventListener('click', () => closeModal('department-modal'));
        departmentsListBody.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-dept-btn');
            if (editBtn) {
                const dept = allDepartments.find(d => d.id === editBtn.dataset.id);
                if (dept) {
                    departmentIdInput.value = dept.id;
                    departmentNameInput.value = dept.name;
                    departmentHeadTitleInput.value = dept.headTitle || '';
                    departmentHeadNameInput.value = dept.headName || '';
                }
            }
            const deleteBtn = e.target.closest('.delete-dept-btn');
            if (deleteBtn) deleteDepartment(deleteBtn.dataset.id);
        });

        scheduleBody.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-task-btn');
            if (editBtn) openTaskModal(editBtn.dataset.id);
            const deleteBtn = e.target.closest('.delete-task-btn');
            if (deleteBtn) deleteTask(deleteBtn.dataset.id);
        });
    }
};

const initializePage = () => {
    mainContent.classList.remove('hidden');
    const today = new Date();
    const year = today.getFullYear();
    const week = getWeekInfo(today).weekNumber;
    weekSelector.value = `${year}-W${String(week).padStart(2, '0')}`;
    loadDepartments();
    loadAndRenderSchedule();
    setupEventListeners();
    updateUIForRole(); // Cập nhật giao diện dựa trên vai trò người dùng
};

// --- AUTHENTICATION ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDocRef = doc(usersCol, user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            currentUserInfo = { uid: user.uid, ...userDoc.data() };
        } else {
            // Nếu không có thông tin, mặc định là viewer
            currentUserInfo = { uid: user.uid, email: user.email, role: 'viewer' };
        }
        initializePage();
    } else {
        // Nếu chưa đăng nhập, chuyển về trang chủ
        window.location.href = 'index.html';
    }
});
