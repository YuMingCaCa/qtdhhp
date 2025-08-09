// File: js/schedule-logic.js
// Handles all logic for the Teaching Schedule Management page, including Firebase integration.

import { auth, db, appId } from './portal-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Global Variables ---
let currentUserId = null;
let currentUserRole = 'viewer';
let schedulesColPath = '';
let settingsDocPath = '';
let signatories = [];
let allSchedulesCache = null; 
let isCacheLoaded = false;

// --- DOM Elements ---
const addWeekBtn = document.getElementById('add-week-btn');
const exportPdfBtn = document.getElementById('export-pdf-btn');
const saveDataBtn = document.getElementById('save-data-btn');
const generateScheduleBtn = document.getElementById('generate-schedule-btn');
const scheduleBody = document.getElementById('schedule-details-body');
const loader = document.getElementById('loader');
const authOverlay = document.getElementById('auth-overlay');

const schedulesSearchInput = document.getElementById('schedules-search-input');
const schedulesSearchResults = document.getElementById('schedules-search-results');
const selectedScheduleIdInput = document.getElementById('selected-schedule-id');

const manageSignaturesBtn = document.getElementById('manage-signatures-btn');
const signatoryModal = document.getElementById('signatory-modal');
const closeSignatoryModalBtn = document.getElementById('close-signatory-modal');
const signatoryForm = document.getElementById('signatory-form');
const signatoryIdInput = document.getElementById('signatory-id');
const signatoryNameInput = document.getElementById('signatory-name');
const signatoryTitleInput = document.getElementById('signatory-title');
const signatoriesListBody = document.getElementById('signatories-list-body');
const facultyHeadSelect = document.getElementById('faculty-head-select');
const departmentHeadSelect = document.getElementById('department-head-select');

const adminFilterSection = document.getElementById('admin-filter-section');
const lecturerSearchInput = document.getElementById('lecturer-search-input');
const scheduleCountInfo = document.getElementById('schedule-count-info');
const lecturerSchedulesList = document.getElementById('lecturer-schedules-list');

const newScheduleBtn = document.getElementById('new-schedule-btn');
const deleteScheduleBtn = document.getElementById('delete-schedule-btn');
const saveAsNewBtn = document.getElementById('save-as-new-btn');


// --- Initial State ---
let weekCounter = 0;

// --- Functions ---

/**
 * Sets the current date for the 'Ngày lập' field.
 */
function setInitialDate() {
    const dateField = document.getElementById('ngay-lap');
    if (!dateField.value) {
        const today = new Date();
        dateField.value = today.toISOString().split('T')[0];
    }
}

/**
 * Clears all rows from the schedule table.
 */
function clearTable() {
    scheduleBody.innerHTML = '';
    weekCounter = 0;
}

/**
 * Populates the entire form from a data object.
 * @param {object} data - The schedule data object from Firebase.
 */
function populateForm(data) {
    clearTable();
    if (data.general) {
        for (const key in data.general) {
            const element = document.getElementById(key.replace(/_/g, '-'));
            if (element) {
                element.value = data.general[key];
            }
        }
    }

    if (data.details && Array.isArray(data.details)) {
        data.details.forEach(rowData => {
            addWeekRow(rowData);
        });
    }
    setInitialDate();
    updateUIPermissions();
}

/**
 * Adds a new row to the schedule details table.
 * @param {object} [data={}] - Optional data to pre-fill the row.
 */
function addWeekRow(data = {}) {
    weekCounter++;
    const row = document.createElement('tr');
    row.classList.add('text-center', 'bg-white');
    row.innerHTML = `
        <td class="border p-1"><input type="text" class="form-input table-input" data-field="tuan" value="${data.tuan || 'Tuần ' + weekCounter}"></td>
        <td class="border p-1">
            <div class="flex flex-col gap-1">
                <input type="text" placeholder="Từ: dd/mm/yyyy" class="form-input table-input" data-field="tuNgay" value="${data.tuNgay || ''}">
                <input type="text" placeholder="Đến: dd/mm/yyyy" class="form-input table-input" data-field="denNgay" value="${data.denNgay || ''}">
            </div>
        </td>
        <td class="border p-1">
            <div class="flex flex-col gap-1">
                <input type="text" placeholder="Thứ" class="form-input table-input" data-field="thu" value="${data.thu || ''}">
                <input type="text" placeholder="Ngày/Tháng" class="form-input table-input" data-field="ngayGiangDay" value="${data.ngayGiangDay || ''}">
            </div>
        </td>
        <td class="border p-1"><textarea class="form-input table-input h-24" data-field="lyThuyet_tenBai">${data.lyThuyet_tenBai || ''}</textarea></td>
        <td class="border p-1"><input type="text" class="form-input table-input" data-field="lyThuyet_soTiet" value="${data.lyThuyet_soTiet || ''}"></td>
        <td class="border p-1"><textarea class="form-input table-input h-24" data-field="thucHanh_tenBai">${data.thucHanh_tenBai || ''}</textarea></td>
        <td class="border p-1"><input type="text" class="form-input table-input" data-field="thucHanh_soTiet" value="${data.thucHanh_soTiet || ''}"></td>
        <td class="border p-1"><input type="text" class="form-input table-input" data-field="ghiChu" value="${data.ghiChu || ''}"></td>
        <td class="border p-1">
            <button type="button" class="btn btn-danger btn-sm delete-row-btn">
                <i class="fas fa-trash-alt"></i>
            </button>
        </td>
    `;
    scheduleBody.appendChild(row);

    row.querySelector('.delete-row-btn').addEventListener('click', () => {
        row.remove();
    });
}

/**
 * Gathers all data from the form into a structured object.
 * @returns {object} The complete schedule data.
 */
function getScheduleData() {
    const data = {
        general: {},
        details: []
    };
    document.querySelectorAll('#schedule-form .bg-gray-50 [id]').forEach(el => {
        data.general[el.id.replace(/-/g, '_')] = el.value;
    });
    scheduleBody.querySelectorAll('tr').forEach(row => {
        const rowData = {};
        row.querySelectorAll('[data-field]').forEach(input => {
            rowData[input.dataset.field] = input.value;
        });
        data.details.push(rowData);
    });
    return data;
}

/**
 * Generates schedule rows based on auto-generation form inputs.
 */
function generateScheduleRows() {
    const startDateValue = document.getElementById('auto-start-date').value;
    if (!startDateValue) {
        alert('Vui lòng chọn ngày bắt đầu.');
        return;
    }
    const startDate = new Date(startDateValue);
    const dayOfWeek = parseInt(document.getElementById('auto-day-of-week').value, 10);
    const numWeeks = parseInt(document.getElementById('auto-num-weeks').value, 10);

    if (isNaN(startDate.getTime()) || isNaN(dayOfWeek) || isNaN(numWeeks)) {
        alert('Vui lòng điền đầy đủ thông tin ngày bắt đầu, thứ và số tuần.');
        return;
    }
    
    clearTable();

    let currentDate = new Date(startDate);
    while (currentDate.getDay() !== dayOfWeek) {
        currentDate.setDate(currentDate.getDate() + 1);
    }

    for (let i = 0; i < numWeeks; i++) {
        const weekStartDate = new Date(currentDate);
        weekStartDate.setDate(weekStartDate.getDate() - (currentDate.getDay() - 1 + 7) % 7);
        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setDate(weekEndDate.getDate() + 6);

        const rowData = {
            tuan: `Tuần ${i + 1}`,
            tuNgay: weekStartDate.toLocaleDateString('vi-VN'),
            denNgay: weekEndDate.toLocaleDateString('vi-VN'),
            thu: `Thứ ${dayOfWeek === 0 ? 'CN' : dayOfWeek + 1}`,
            ngayGiangDay: currentDate.toLocaleDateString('vi-VN'),
        };
        addWeekRow(rowData);
        
        currentDate.setDate(currentDate.getDate() + 7);
    }
}

/**
 * [NEW] Re-calculates and updates the dates in the details table without clearing other content.
 */
function resyncScheduleDates() {
    const startDateValue = document.getElementById('auto-start-date').value;
    if (!startDateValue) return; // Don't do anything if there's no start date

    const startDate = new Date(startDateValue);
    const dayOfWeek = parseInt(document.getElementById('auto-day-of-week').value, 10);

    if (isNaN(startDate.getTime())) return;

    const rows = scheduleBody.querySelectorAll('tr');
    if (rows.length === 0) return; // No rows to update

    let currentDate = new Date(startDate);
    while (currentDate.getDay() !== dayOfWeek) {
        currentDate.setDate(currentDate.getDate() + 1);
    }

    rows.forEach((row, index) => {
        const teachingDate = new Date(currentDate);
        teachingDate.setDate(teachingDate.getDate() + (index * 7));

        const weekStartDate = new Date(teachingDate);
        weekStartDate.setDate(weekStartDate.getDate() - (teachingDate.getDay() - 1 + 7) % 7);
        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setDate(weekEndDate.getDate() + 6);

        // Find the input fields within the current row
        const tuNgayInput = row.querySelector('[data-field="tuNgay"]');
        const denNgayInput = row.querySelector('[data-field="denNgay"]');
        const thuInput = row.querySelector('[data-field="thu"]');
        const ngayGiangDayInput = row.querySelector('[data-field="ngayGiangDay"]');

        if (tuNgayInput) tuNgayInput.value = weekStartDate.toLocaleDateString('vi-VN');
        if (denNgayInput) denNgayInput.value = weekEndDate.toLocaleDateString('vi-VN');
        if (thuInput) thuInput.value = `Thứ ${dayOfWeek === 0 ? 'CN' : dayOfWeek + 1}`;
        if (ngayGiangDayInput) ngayGiangDayInput.value = teachingDate.toLocaleDateString('vi-VN');
    });
}


/**
 * Saves the current schedule data to Firebase.
 */
async function saveScheduleData() {
    if (!currentUserId) {
        alert('Bạn phải đăng nhập để lưu dữ liệu.');
        return;
    }

    let scheduleId = selectedScheduleIdInput.value;
    const isNewSchedule = !scheduleId;

    if (!isNewSchedule && currentUserRole === 'viewer') {
        const currentSchedule = allSchedulesCache.find(s => s.id === scheduleId);
        if (currentSchedule && currentSchedule.ownerId !== currentUserId) {
            alert('Bạn không có quyền chỉnh sửa lịch trình của người khác.');
            return;
        }
    }

    if (isNewSchedule) {
        const hocPhan = document.getElementById('hoc-phan').value || 'LichMoi';
        const lop = document.getElementById('lop').value || 'LopMoi';
        const defaultName = `${hocPhan.replace(/\s/g, '_')}-${lop.replace(/\s/g, '_')}-${Date.now()}`;
        
        scheduleId = prompt("Nhập tên để lưu lịch trình MỚI (ví dụ: 'ATTT-K24-HK2'):", defaultName);
        if (!scheduleId) {
            alert('Đã hủy lưu.');
            return;
        }
    }

    loader.style.display = 'block';
    const dataToSave = getScheduleData();
    dataToSave.ownerId = currentUserId;
    dataToSave.lecturerName = dataToSave.general.giang_vien;

    try {
        const scheduleDocRef = doc(db, schedulesColPath, scheduleId);
        await setDoc(scheduleDocRef, dataToSave);
        alert(`Đã lưu thành công lịch trình: ${scheduleId}`);
        
        allSchedulesCache = null; 
        await loadAllSchedulesForCache();
        filterAndDisplayLecturerSchedules();

        schedulesSearchInput.value = scheduleId;
        selectedScheduleIdInput.value = scheduleId;
        updateUIPermissions();
    } catch (error) {
        console.error("Error saving data: ", error);
        alert(`Lỗi khi lưu dữ liệu: ${error.message}`);
    } finally {
        loader.style.display = 'none';
    }
}

/**
 * Saves the current form data as a new schedule.
 */
async function saveScheduleAsNew() {
    if (!currentUserId) {
        alert('Bạn phải đăng nhập để lưu dữ liệu.');
        return;
    }

    const hocPhan = document.getElementById('hoc-phan').value || 'Bansao';
    const lop = document.getElementById('lop').value || 'LopMoi';
    const defaultName = `Bansao_${hocPhan.replace(/\s/g, '_')}-${lop.replace(/\s/g, '_')}-${Date.now()}`;
    
    const newScheduleId = prompt("Nhập tên cho bản sao lịch trình MỚI:", defaultName);
    if (!newScheduleId) {
        alert('Đã hủy lưu.');
        return;
    }

    loader.style.display = 'block';
    const dataToSave = getScheduleData();
    dataToSave.ownerId = currentUserId; // The new owner is the current user
    dataToSave.lecturerName = dataToSave.general.giang_vien;

    try {
        const scheduleDocRef = doc(db, schedulesColPath, newScheduleId);
        await setDoc(scheduleDocRef, dataToSave);
        alert(`Đã sao chép và lưu thành công lịch trình mới: ${newScheduleId}`);
        
        allSchedulesCache = null; 
        await loadAllSchedulesForCache();
        filterAndDisplayLecturerSchedules();

        // Update the UI to reflect the newly created schedule
        schedulesSearchInput.value = newScheduleId;
        selectedScheduleIdInput.value = newScheduleId;
        updateUIPermissions();
    } catch (error) {
        console.error("Error saving as new data: ", error);
        alert(`Lỗi khi lưu dữ liệu: ${error.message}`);
    } finally {
        loader.style.display = 'none';
    }
}


// --- Searchable Schedule & Filter Functions ---

/**
 * Loads all schedules into a local cache ONCE per session.
 */
async function loadAllSchedulesForCache() {
    if (allSchedulesCache !== null) return;

    loader.style.display = 'block';
    try {
        const q = query(collection(db, schedulesColPath));
        const querySnapshot = await getDocs(q);
        allSchedulesCache = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error loading schedule cache:", error);
        allSchedulesCache = [];
    } finally {
        loader.style.display = 'none';
    }
}

/**
 * Filters and displays schedules based on the lecturer search input.
 */
function filterAndDisplayLecturerSchedules() {
    if (allSchedulesCache === null) return;

    const searchTerm = lecturerSearchInput.value.trim().toLowerCase();
    
    let filtered = [];
    if (searchTerm) {
        filtered = allSchedulesCache.filter(schedule => 
            schedule.lecturerName && schedule.lecturerName.toLowerCase().includes(searchTerm)
        );
    }
    
    displayLecturerSchedulesList(filtered);
}


/**
 * Displays the list of schedules in the admin/viewer panel.
 * @param {Array} schedules - The array of schedules to display.
 */
function displayLecturerSchedulesList(schedules) {
    lecturerSchedulesList.innerHTML = '';
    scheduleCountInfo.querySelector('span').textContent = schedules.length;

    if (schedules.length > 0) {
        schedules.forEach(schedule => {
            const item = document.createElement('div');
            item.className = 'lecturer-schedule-item';
            item.textContent = schedule.id;
            item.title = `Click để tải lịch trình: ${schedule.id}`;
            item.addEventListener('click', () => {
                schedulesSearchInput.value = schedule.id;
                selectedScheduleIdInput.value = schedule.id;
                populateForm(schedule);
            });
            lecturerSchedulesList.appendChild(item);
        });
    } else {
        const message = lecturerSearchInput.value ? "Không có lịch trình nào được tìm thấy." : "Gõ tên giảng viên để lọc danh sách.";
        lecturerSchedulesList.innerHTML = `<p class="text-gray-500 italic p-2">${message}</p>`;
    }
}


/**
 * Filters and displays schedules from the currently loaded cache (`allSchedulesCache`).
 */
function filterAndShowSchedules() {
    const searchTerm = schedulesSearchInput.value.toLowerCase();
    schedulesSearchResults.innerHTML = '';

    if (!searchTerm || allSchedulesCache === null) {
        schedulesSearchResults.classList.add('hidden');
        return;
    }

    const filtered = allSchedulesCache.filter(schedule => schedule.id.toLowerCase().includes(searchTerm));

    if (filtered.length > 0) {
        filtered.forEach(schedule => {
            const item = document.createElement('div');
            item.className = 'search-result-item';
            item.textContent = schedule.id;
            item.addEventListener('click', () => {
                schedulesSearchInput.value = schedule.id;
                selectedScheduleIdInput.value = schedule.id;
                schedulesSearchResults.classList.add('hidden');
                populateForm(schedule);
            });
            schedulesSearchResults.appendChild(item);
        });
        schedulesSearchResults.classList.remove('hidden');
    } else {
        schedulesSearchResults.classList.add('hidden');
    }
}


// --- Signatory Management Functions ---

function renderSignatoriesList() {
    signatoriesListBody.innerHTML = '';
    signatories.forEach(person => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-4 py-2">${person.name}</td>
            <td class="px-4 py-2">${person.title}</td>
            <td class="px-4 py-2 text-center">
                <button data-id="${person.id}" class="edit-signatory-btn text-blue-500 hover:text-blue-700"><i class="fas fa-edit"></i></button>
                <button data-id="${person.id}" class="delete-signatory-btn text-red-500 hover:text-red-700 ml-2"><i class="fas fa-trash"></i></button>
            </td>
        `;
        signatoriesListBody.appendChild(row);
    });
}

function populateSignatoryDropdowns() {
    facultyHeadSelect.innerHTML = '<option value="">-- Chọn --</option>';
    departmentHeadSelect.innerHTML = '<option value="">-- Chọn --</option>';
    
    signatories.forEach(person => {
        const option = `<option value="${person.id}">${person.name} (${person.title})</option>`;
        facultyHeadSelect.innerHTML += option;
        departmentHeadSelect.innerHTML += option;
    });
}

async function loadSignatories() {
    try {
        const docRef = doc(db, settingsDocPath);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists() && docSnap.data().signatories) {
            signatories = docSnap.data().signatories;
        } else {
            signatories = [];
        }
        renderSignatoriesList();
        populateSignatoryDropdowns();
    } catch (error) {
        console.error("Error loading signatories: ", error);
    }
}

async function _saveSignatoriesArrayToFirebase() {
    loader.style.display = 'block';
    try {
        await setDoc(doc(db, settingsDocPath), { signatories: signatories });
        await loadSignatories();
    } catch (error) {
        console.error("Error saving signatories array: ", error);
        alert("Lỗi khi lưu danh sách người ký.");
    } finally {
        loader.style.display = 'none';
    }
}

function handleSignatoryFormSubmit(e) {
    e.preventDefault();
    const name = signatoryNameInput.value.trim();
    const title = signatoryTitleInput.value.trim();
    const id = signatoryIdInput.value;

    if (!name || !title) {
        alert("Vui lòng nhập đầy đủ họ tên và chức vụ.");
        return;
    }

    if (id) {
        const index = signatories.findIndex(p => p.id === id);
        if (index > -1) {
            signatories[index] = { ...signatories[index], name, title };
        }
    } else {
        signatories.push({ id: `sig-${Date.now()}`, name, title });
    }

    _saveSignatoriesArrayToFirebase();
    signatoryForm.reset();
    signatoryIdInput.value = '';
}

function deleteSignatory(id) {
    signatories = signatories.filter(p => p.id !== id);
    _saveSignatoriesArrayToFirebase();
}

/**
 * Opens a new window with a printable HTML version of the schedule.
 */
function exportToPrintableHTML() {
    loader.style.display = 'block';

    try {
        const data = getScheduleData();

        const head = `
            <title>In Lịch trình Giảng dạy - ${data.general.hoc_phan || ''}</title>
            <style>
                @page { size: A4; margin: 2cm; }
                body { font-family: 'Times New Roman', Times, serif; font-size: 13pt; line-height: 1.5; }
                .header-table { width: 100%; border-collapse: collapse; text-align: center; margin-bottom: 20px; }
                .header-table td { vertical-align: top; width: 50%; }
                .main-title { text-align: center; font-size: 16pt; font-weight: bold; margin: 20px 0; }
                .info-table { width: 100%; margin-bottom: 20px; font-size: 12pt; }
                .schedule-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11pt; }
                .schedule-table, .schedule-table th, .schedule-table td { border: 1px solid black; }
                .schedule-table th, .schedule-table td { padding: 4px; text-align: left; vertical-align: top; }
                .schedule-table th { text-align: center; font-weight: bold; }
                .footer-table { width: 100%; margin-top: 40px; text-align: center; border: none; font-size: 12pt; }
                .footer-table td { border: none; padding: 5px; }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .font-bold { font-weight: bold; }
                .font-italic { font-style: italic; }
            </style>
        `;

        const headerHtml = `
            <table class="header-table">
                <tr>
                    <td><p>UỶ BAN NHÂN DÂN THÀNH PHỐ HẢI PHÒNG</p><p class="font-bold">TRƯỜNG ĐẠI HỌC HẢI PHÒNG</p></td>
                    <td><p class="font-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</p><p class="font-bold">Độc lập - Tự do - Hạnh phúc</p></td>
                </tr>
            </table>
            <h1 class="main-title">LỊCH TRÌNH GIẢNG DẠY</h1>
        `;

        const infoHtml = `
            <table class="info-table">
                <tr>
                    <td><strong>Học phần:</strong> ${data.general.hoc_phan || ''}</td>
                    <td class="text-right"><strong>Giảng viên:</strong> ${data.general.giang_vien || ''}</td>
                </tr>
                <tr>
                    <td><strong>Ngành:</strong> ${data.general.nganh || ''} &nbsp;&nbsp;&nbsp; <strong>Khoá:</strong> ${data.general.khoa || ''}</td>
                    <td class="text-right"><strong>Lớp:</strong> ${data.general.lop || ''}</td>
                </tr>
                 <tr>
                    <td><strong>Năm học:</strong> ${data.general.nam_hoc || ''}</td>
                    <td class="text-right"><strong>Học kỳ:</strong> ${data.general.hoc_ky || ''}</td>
                </tr>
            </table>
        `;

        const startPeriod = document.getElementById('auto-start-period').value;
        const endPeriod = document.getElementById('auto-end-period').value;
        const periodText = (startPeriod && endPeriod) ? `<br>(Tiết ${startPeriod} - ${endPeriod})` : '';

        let detailsHtml = `
            <table class="schedule-table">
                <thead>
                    <tr>
                        <th rowspan="2" style="width: 18%;">Tuần thứ</th><th rowspan="2" style="width: 18%;">Thứ/Ngày</th>
                        <th colspan="2">Giảng dạy lý thuyết</th><th colspan="2">Nội dung BT, TH, TL, TH</th>
                        <th rowspan="2" style="width: 10%;">Ghi chú</th>
                    </tr>
                    <tr><th>Tên bài</th><th style="width: 8%;">Số tiết</th><th>Tên bài</th><th style="width: 8%;">Số tiết</th></tr>
                </thead>
                <tbody>
        `;
        data.details.forEach(row => {
            const weekDateRange = (row.tuNgay && row.denNgay) ? `<br><span class="font-italic" style="font-size: 10pt;">(Từ ${row.tuNgay}<br>đến ${row.denNgay})</span>` : '';
            detailsHtml += `
                <tr>
                    <td class="text-center">${row.tuan || ''}${weekDateRange}</td>
                    <td class="text-center">${row.thu || ''}<br>${row.ngayGiangDay || ''}${periodText}</td>
                    <td>${(row.lyThuyet_tenBai || '').replace(/\n/g, '<br>')}</td>
                    <td class="text-center">${row.lyThuyet_soTiet || ''}</td>
                    <td>${(row.thucHanh_tenBai || '').replace(/\n/g, '<br>')}</td>
                    <td class="text-center">${row.thucHanh_soTiet || ''}</td>
                    <td>${row.ghiChu || ''}</td>
                </tr>
            `;
        });
        detailsHtml += `</tbody></table>`;
        
        const selectedFacultyHeadId = facultyHeadSelect.value;
        const selectedDeptHeadId = departmentHeadSelect.value;
        const facultyHead = signatories.find(p => p.id === selectedFacultyHeadId) || { name: '', title: 'TRƯỞNG KHOA' };
        const deptHead = signatories.find(p => p.id === selectedDeptHeadId) || { name: '', title: 'TỔ TRƯỞNG' };

        const ngayLap = new Date(data.general.ngay_lap).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const footerHtml = `
            <table class="footer-table">
                <tr>
                    <td></td><td></td>
                    <td class="font-italic">Hải Phòng, ngày ${ngayLap.split('/')[0]} tháng ${ngayLap.split('/')[1]} năm ${ngayLap.split('/')[2]}</td>
                </tr>
                <tr class="font-bold">
                    <td>${facultyHead.title}</td>
                    <td>${deptHead.title}</td>
                    <td>GIẢNG VIÊN</td>
                </tr>
                <tr class="font-bold" style="height: 80px; vertical-align: bottom;">
                     <td>${facultyHead.name}</td>
                     <td>${deptHead.name}</td>
                     <td>${data.general.giang_vien || ''}</td>
                </tr>
            </table>
        `;

        const fullHtml = `
            <!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">${head}</head>
            <body>${headerHtml}${infoHtml}${detailsHtml}${footerHtml}</body></html>
        `;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(fullHtml);
            printWindow.document.close();
            printWindow.focus();
            printWindow.print();
        } else {
            alert("Không thể mở cửa sổ in. Vui lòng cho phép pop-up cho trang web này.");
        }

    } catch (error) {
        console.error("Print Error:", error);
        alert("Đã có lỗi xảy ra khi chuẩn bị trang in.");
    } finally {
        loader.style.display = 'none';
    }
}

// Sets the read/write state of the entire form
function setFormInteractivity(isInteractive) {
    const formElements = document.querySelectorAll('#schedule-form input, #schedule-form textarea, #schedule-form select');
    formElements.forEach(el => {
        el.disabled = !isInteractive;
    });

    const deleteButtons = document.querySelectorAll('.delete-row-btn');
    deleteButtons.forEach(btn => {
        btn.style.display = isInteractive ? '' : 'none';
    });
    
    addWeekBtn.disabled = !isInteractive;
    generateScheduleBtn.disabled = !isInteractive;
}

// Update UI based on user role and ownership
function updateUIPermissions() {
    adminFilterSection.style.display = 'flex';
    
    if (currentUserRole === 'admin') {
        manageSignaturesBtn.classList.remove('hidden');
    } else {
        manageSignaturesBtn.classList.add('hidden');
    }

    let canEdit = false;
    let canDelete = false;
    let canSaveAsNew = false;
    const scheduleId = selectedScheduleIdInput.value;

    if (!scheduleId) { // New schedule
        canEdit = true;
        canDelete = false;
        canSaveAsNew = false;
        saveDataBtn.title = 'Lưu lịch trình mới';
    } else { // Existing schedule
        canSaveAsNew = true;
        const currentSchedule = allSchedulesCache.find(s => s.id === scheduleId);
        if (currentUserRole === 'admin') {
            canEdit = true;
            canDelete = true;
            saveDataBtn.title = 'Lưu với quyền quản trị viên';
            deleteScheduleBtn.title = 'Xóa với quyền quản trị viên';
        } else if (currentSchedule && currentSchedule.ownerId === currentUserId) {
            canEdit = true;
            canDelete = true;
            saveDataBtn.title = 'Lưu thay đổi';
            deleteScheduleBtn.title = 'Xóa lịch trình của bạn';
        } else {
            canEdit = false;
            canDelete = false;
            saveDataBtn.title = 'Bạn không có quyền chỉnh sửa lịch trình của người khác.';
            deleteScheduleBtn.title = 'Bạn không có quyền xóa lịch trình của người khác.';
        }
    }
    
    saveDataBtn.disabled = !canEdit;
    deleteScheduleBtn.disabled = !canDelete;
    saveAsNewBtn.disabled = !canSaveAsNew;
    setFormInteractivity(canEdit);
}

// Function to delete the currently selected schedule
async function deleteSchedule() {
    const scheduleId = selectedScheduleIdInput.value;
    if (!scheduleId) {
        alert("Vui lòng chọn một lịch trình để xóa.");
        return;
    }

    const currentSchedule = allSchedulesCache.find(s => s.id === scheduleId);
    if (currentUserRole === 'viewer' && (!currentSchedule || currentSchedule.ownerId !== currentUserId)) {
        alert('Bạn không có quyền xóa lịch trình này.');
        return;
    }

    if (!confirm(`Bạn có chắc chắn muốn XÓA VĨNH VIỄN lịch trình "${scheduleId}" không? Hành động này không thể hoàn tác.`)) {
        return;
    }

    loader.style.display = 'block';
    try {
        await deleteDoc(doc(db, schedulesColPath, scheduleId));

        allSchedulesCache = allSchedulesCache.filter(s => s.id !== scheduleId);

        alert("Đã xóa lịch trình thành công.");
        resetFormForNewSchedule();
        filterAndDisplayLecturerSchedules();

    } catch (error) {
        console.error("Error deleting schedule:", error);
        alert("Lỗi khi xóa lịch trình.");
    } finally {
        loader.style.display = 'none';
    }
}

// Function to reset the form to a "new" state
function resetFormForNewSchedule() {
    selectedScheduleIdInput.value = '';
    schedulesSearchInput.value = '';
    document.getElementById('schedule-form').reset();
    populateForm({});
}


// --- Event Listeners ---
addWeekBtn.addEventListener('click', () => addWeekRow());
exportPdfBtn.addEventListener('click', exportToPrintableHTML);
saveDataBtn.addEventListener('click', saveScheduleData);
generateScheduleBtn.addEventListener('click', generateScheduleRows);
newScheduleBtn.addEventListener('click', resetFormForNewSchedule);
deleteScheduleBtn.addEventListener('click', deleteSchedule);
saveAsNewBtn.addEventListener('click', saveScheduleAsNew);


schedulesSearchInput.addEventListener('input', filterAndShowSchedules);
schedulesSearchInput.addEventListener('focus', filterAndShowSchedules);
document.addEventListener('click', (e) => {
    if (!e.target.closest('.relative')) {
        schedulesSearchResults.classList.add('hidden');
    }
});

lecturerSearchInput.addEventListener('input', () => {
    filterAndDisplayLecturerSchedules();
});

manageSignaturesBtn.addEventListener('click', () => { signatoryModal.style.display = 'flex'; });
closeSignatoryModalBtn.addEventListener('click', () => { signatoryModal.style.display = 'none'; });
signatoryForm.addEventListener('submit', handleSignatoryFormSubmit);
signatoriesListBody.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-signatory-btn');
    if (editBtn) {
        const person = signatories.find(p => p.id === editBtn.dataset.id);
        if (person) {
            signatoryIdInput.value = person.id;
            signatoryNameInput.value = person.name;
            signatoryTitleInput.value = person.title;
        }
    }
    const deleteBtn = e.target.closest('.delete-signatory-btn');
    if (deleteBtn) {
        if (confirm(`Bạn có chắc muốn xóa người ký này?`)) {
            deleteSignatory(deleteBtn.dataset.id);
        }
    }
});

// [NEW] Add event listeners for the auto-generation fields to trigger date resyncing
const autoGenInputs = [
    document.getElementById('auto-start-date'),
    document.getElementById('auto-day-of-week')
];
autoGenInputs.forEach(input => {
    input.addEventListener('change', resyncScheduleDates);
});


// --- Initial Load ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserId = user.uid;
        
        schedulesColPath = `artifacts/${appId}/public/data/schedules`;
        settingsDocPath = `artifacts/${appId}/public/data/settings/scheduleModule`;
        
        authOverlay.style.display = 'none';
        
        const userDocRef = doc(db, `artifacts/${appId}/public/data/users`, user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists() && userDoc.data().role === 'admin') {
            currentUserRole = 'admin';
        }

        updateUIPermissions();
        await loadSignatories();
        await loadAllSchedulesForCache();
        filterAndDisplayLecturerSchedules();
        
        setInitialDate();

    } else {
        currentUserId = null;
        currentUserRole = 'viewer';
        authOverlay.style.display = 'flex';
    }
});
