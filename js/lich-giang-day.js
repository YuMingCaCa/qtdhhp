// File: js/lich-giang-day.js
// Logic for the "Teaching Schedule" module.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, doc, setDoc, getDocs, updateDoc, deleteDoc, query, where, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

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
let hocKyCol, monHocCol, lopHocPhanCol, lopChinhQuyCol, nganhHocCol, phongHocCol, thoiKhoaBieuCol;
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
        phongHocCol = collection(db, `${basePath}/schedule_PhongHoc`);
        lopHocPhanCol = collection(db, `${basePath}/schedule_LopHocPhan`);
        lopChinhQuyCol = collection(db, `${basePath}/schedule_LopChinhQuy`);
        nganhHocCol = collection(db, `${basePath}/schedule_NganhHoc`);
        thoiKhoaBieuCol = collection(db, `${basePath}/schedule_ThoiKhoaBieu`);
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
let rooms = [];
let courseSections = [];
let departments = [];
let lecturers = [];
let officialClasses = [];
let majors = [];
let schedules = [];

// --- NEW: Searchable Select Component Logic ---

/**
 * Initializes a container to be a searchable select dropdown.
 * @param {string} containerId - The ID of the div container for the select component.
 * @param {Array} options - The array of data objects.
 * @param {object} config - Configuration object { valueField, labelField, placeholder, onSelectionChange }
 */
function initSearchableSelect(containerId, options, config) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { valueField, labelField, placeholder, onSelectionChange } = config;

    // Create elements
    container.innerHTML = `
        <input type="text" class="searchable-select-input" placeholder="${placeholder || 'Tìm kiếm...'}">
        <input type="hidden" class="searchable-select-value">
        <div class="searchable-select-dropdown"></div>
    `;

    const input = container.querySelector('.searchable-select-input');
    const hiddenInput = container.querySelector('.searchable-select-value');
    const dropdown = container.querySelector('.searchable-select-dropdown');

    // Function to render dropdown options
    const renderOptions = (filter = '') => {
        dropdown.innerHTML = '';
        const filteredOptions = options.filter(option => 
            option[labelField].toLowerCase().includes(filter.toLowerCase())
        );

        if (filteredOptions.length === 0) {
            dropdown.innerHTML = `<div class="searchable-select-option text-gray-500">Không có kết quả</div>`;
        } else {
            filteredOptions.forEach(option => {
                const optionEl = document.createElement('div');
                optionEl.className = 'searchable-select-option';
                optionEl.textContent = option[labelField];
                optionEl.dataset.value = option[valueField];
                
                if (option[valueField] === hiddenInput.value) {
                    optionEl.classList.add('selected');
                }

                optionEl.addEventListener('click', () => {
                    input.value = option[labelField];
                    hiddenInput.value = option[valueField];
                    dropdown.style.display = 'none';
                    if (onSelectionChange) {
                        onSelectionChange(option[valueField]);
                    }
                });
                dropdown.appendChild(optionEl);
            });
        }
    };
    
    // Event Listeners
    input.addEventListener('focus', () => {
        renderOptions(input.value);
        dropdown.style.display = 'block';
    });

    input.addEventListener('input', () => {
        renderOptions(input.value);
        hiddenInput.value = ''; // Clear selection if user types
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Public method to update options
    container.updateOptions = (newOptions) => {
        options = newOptions;
    };
    
    // Public method to set value
    container.setValue = (value) => {
        const selectedOption = options.find(opt => opt[valueField] === value);
        if (selectedOption) {
            input.value = selectedOption[labelField];
            hiddenInput.value = value;
        } else {
            input.value = '';
            hiddenInput.value = '';
        }
    };
    
    // Public method to clear
    container.clear = () => {
        input.value = '';
        hiddenInput.value = '';
        if (onSelectionChange) {
            onSelectionChange('');
        }
    };
}


// --- Schedule Grid Rendering ---

function renderScheduleTable() {
    const container = document.getElementById('schedule-container');
    container.innerHTML = '';

    const table = document.createElement('table');
    table.className = 'schedule-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const headers = ['Ca', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    headers.forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const shifts = ['Sáng (1-5)', 'Chiều (6-10)', 'Tối (11-15)'];
    shifts.forEach((shiftName, index) => {
        const row = document.createElement('tr');
        
        const shiftCell = document.createElement('td');
        shiftCell.className = 'shift-label';
        shiftCell.textContent = shiftName;
        row.appendChild(shiftCell);

        for (let day = 2; day <= 7; day++) {
            const dayCell = document.createElement('td');
            dayCell.dataset.day = day;
            dayCell.dataset.shift = index + 1;
            row.appendChild(dayCell);
        }
        tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);
}

function displayScheduleForClass(classId) {
    const table = document.querySelector('.schedule-table');
    if (!table) {
        renderScheduleTable();
    }
    
    const scheduleTitle = document.getElementById('schedule-title');
    
    document.querySelectorAll('.schedule-block').forEach(block => block.remove());

    const selectedClass = officialClasses.find(oc => oc.id === classId);
    if (!selectedClass) {
        scheduleTitle.textContent = 'Vui lòng chọn một lớp';
        return;
    }
    scheduleTitle.textContent = `Thời khóa biểu lớp: ${selectedClass.maLopCQ}`;

    const sectionsForClass = courseSections.filter(cs => cs.lopChinhQuyId === classId);
    if (sectionsForClass.length === 0) return;

    sectionsForClass.forEach(section => {
        const schedulesForSection = schedules.filter(s => s.lopHocPhanId === section.id);

        schedulesForSection.forEach(scheduleInfo => {
            const subject = subjects.find(s => s.id === section.monHocId);
            const lecturer = lecturers.find(l => l.id === section.giangVienId);
            const room = rooms.find(r => r.id === scheduleInfo.phongHocId);

            if (!subject || !lecturer || !room || !scheduleInfo) return;

            const startPeriod = scheduleInfo.tietBatDau;
            const endPeriod = startPeriod + scheduleInfo.soTiet - 1;

            let shiftIndex;
            if (startPeriod >= 1 && startPeriod <= 5) shiftIndex = 1;
            else if (startPeriod >= 6 && startPeriod <= 10) shiftIndex = 2;
            else if (startPeriod >= 11 && startPeriod <= 15) shiftIndex = 3;
            else return;

            const targetCell = document.querySelector(`td[data-day='${scheduleInfo.thu}'][data-shift='${shiftIndex}']`);
            if (!targetCell) return;

            const block = document.createElement('div');
            block.className = 'schedule-block';
            block.dataset.scheduleId = scheduleInfo.id;
            block.onclick = () => window.openScheduleActionModal(scheduleInfo.id);
            
            block.innerHTML = `
                <p class="font-bold">${subject.tenMonHoc}</p>
                <p><strong>Phòng:</strong> ${room.tenPhong}</p>
                <p><strong>Tiết:</strong> ${startPeriod} - ${endPeriod}</p>
                <p><strong>GV:</strong> ${lecturer.name}</p>
            `;
            
            targetCell.appendChild(block);
        });
    });
}

function populateClassSelect() {
    const select = document.getElementById('class-schedule-select');
    const currentValue = select.value;
    select.innerHTML = '<option value="">-- Chọn lớp để xem TKB --</option>';
    officialClasses.forEach(oc => {
        const option = document.createElement('option');
        option.value = oc.id;
        option.textContent = oc.maLopCQ;
        select.appendChild(option);
    });
    select.value = currentValue;
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
            <td class="p-2 w-10 text-center"><input type="checkbox" class="semester-checkbox" data-id="${semester.id}"></td>
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
function populateSubjectFilters() {
    const filterDepSelect = document.getElementById('filter-subject-by-department');
    const formDepSelect = document.getElementById('subject-department-select');

    filterDepSelect.innerHTML = '<option value="all">Tất cả Khoa</option>';
    formDepSelect.innerHTML = '<option value="">-- Chọn Khoa --</option>';

    departments.forEach(dep => {
        const optionHtml = `<option value="${dep.id}">${dep.name}</option>`;
        filterDepSelect.innerHTML += optionHtml;
        formDepSelect.innerHTML += optionHtml;
    });
}

function renderSubjectsList() {
    const listBody = document.getElementById('subjects-list-body');
    listBody.innerHTML = '';

    const departmentFilter = document.getElementById('filter-subject-by-department').value;

    let filteredSubjects = subjects;
    if (departmentFilter !== 'all') {
        filteredSubjects = subjects.filter(s => s.departmentId === departmentFilter);
    }

    filteredSubjects.forEach(subject => {
        const department = departments.find(d => d.id === subject.departmentId);
        const row = document.createElement('tr');
        row.className = "border-b";
        row.innerHTML = `
            <td class="p-2 w-10 text-center"><input type="checkbox" class="subject-checkbox" data-id="${subject.id}"></td>
            <td class="px-4 py-2">${subject.tenMonHoc}</td>
            <td class="px-4 py-2">${subject.maHocPhan}</td>
            <td class="px-4 py-2">${department ? department.name : '<i class="text-gray-400">Chưa phân loại</i>'}</td>
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
        document.getElementById('subject-department-select').value = subject.departmentId || "";
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
            <td class="p-2 w-10 text-center"><input type="checkbox" class="room-checkbox" data-id="${room.id}"></td>
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
            <td class="p-2 w-10 text-center"><input type="checkbox" class="major-checkbox" data-id="${major.id}"></td>
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


// --- Official Class (Lớp Chính Quy) Management (UPDATED) ---
function renderOfficialClassesList() {
    const listBody = document.getElementById('official-classes-list-body');
    listBody.innerHTML = '';
    officialClasses.forEach(oc => {
        const department = departments.find(d => d.id === oc.departmentId);
        const row = document.createElement('tr');
        row.className = "border-b";
        row.innerHTML = `
            <td class="p-2 w-10 text-center"><input type="checkbox" class="official-class-checkbox" data-id="${oc.id}"></td>
            <td class="px-4 py-2">${oc.maLopCQ}</td>
            <td class="px-4 py-2">${department ? department.name : 'N/A'}</td>
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
        document.getElementById('oc-department-select').value = oc.departmentId;
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
    // This function will now initialize the searchable selects
    initSearchableSelect('cs-semester-select-container', semesters, {
        valueField: 'id',
        labelField: 'tenHocKy',
        placeholder: 'Tìm học kỳ...'
    });

    initSearchableSelect('cs-official-class-select-container', officialClasses, {
        valueField: 'id',
        labelField: 'maLopCQ',
        placeholder: 'Tìm lớp chính quy...',
        onSelectionChange: (selectedClassId) => {
            updateCourseSectionCode();
            const subjectContainer = document.getElementById('cs-subject-select-container');
            const officialClass = officialClasses.find(oc => oc.id === selectedClassId);
            if (officialClass && officialClass.departmentId) {
                const filteredSubjects = subjects.filter(s => s.departmentId === officialClass.departmentId);
                subjectContainer.updateOptions(filteredSubjects);
            } else {
                subjectContainer.updateOptions([]);
            }
            subjectContainer.clear();
        }
    });

    initSearchableSelect('cs-subject-select-container', [], { // Initially empty
        valueField: 'id',
        labelField: 'tenMonHoc',
        placeholder: 'Tìm môn học...',
        onSelectionChange: updateCourseSectionCode
    });
    
    initSearchableSelect('cs-department-select-container', departments, {
        valueField: 'id',
        labelField: 'name',
        placeholder: 'Tìm khoa...',
        onSelectionChange: (selectedDepId) => {
            const lecturerContainer = document.getElementById('cs-lecturer-select-container');
            if (selectedDepId) {
                const filteredLecturers = lecturers.filter(l => l.departmentId === selectedDepId);
                lecturerContainer.updateOptions(filteredLecturers);
            } else {
                lecturerContainer.updateOptions([]);
            }
            lecturerContainer.clear();
        }
    });

    initSearchableSelect('cs-lecturer-select-container', [], { // Initially empty
        valueField: 'id',
        labelField: 'name',
        placeholder: 'Tìm giảng viên...'
    });
}

function updateCourseSectionCode() {
    const subjectId = document.querySelector('#cs-subject-select-container .searchable-select-value').value;
    const officialClassId = document.querySelector('#cs-official-class-select-container .searchable-select-value').value;
    const codeInput = document.getElementById('cs-code');

    const selectedSubject = subjects.find(s => s.id === subjectId);
    const selectedOC = officialClasses.find(oc => oc.id === officialClassId);

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
            <td class="p-2 w-10 text-center"><input type="checkbox" class="course-section-checkbox" data-id="${cs.id}"></td>
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
    
    // Clear all searchable selects
    document.getElementById('cs-semester-select-container').clear();
    document.getElementById('cs-official-class-select-container').clear();
    document.getElementById('cs-subject-select-container').clear();
    document.getElementById('cs-department-select-container').clear();
    document.getElementById('cs-lecturer-select-container').clear();
}

window.editCourseSection = (id) => {
    const cs = courseSections.find(c => c.id === id);
    if(cs) {
        const lecturer = lecturers.find(l => l.id === cs.giangVienId);
        const departmentId = lecturer ? lecturer.departmentId : '';

        document.getElementById('course-section-id').value = cs.id;
        
        // Set values for searchable selects
        document.getElementById('cs-semester-select-container').setValue(cs.hocKyId);
        document.getElementById('cs-official-class-select-container').setValue(cs.lopChinhQuyId);
        
        // Trigger updates for dependent dropdowns
        const officialClass = officialClasses.find(oc => oc.id === cs.lopChinhQuyId);
        if (officialClass && officialClass.departmentId) {
            const subjectContainer = document.getElementById('cs-subject-select-container');
            const filteredSubjects = subjects.filter(s => s.departmentId === officialClass.departmentId);
            subjectContainer.updateOptions(filteredSubjects);
            subjectContainer.setValue(cs.monHocId);
        }

        document.getElementById('cs-code').value = cs.maLopHP;

        const departmentContainer = document.getElementById('cs-department-select-container');
        departmentContainer.setValue(departmentId);
        if (departmentId) {
            const lecturerContainer = document.getElementById('cs-lecturer-select-container');
            const filteredLecturers = lecturers.filter(l => l.departmentId === departmentId);
            lecturerContainer.updateOptions(filteredLecturers);
            lecturerContainer.setValue(cs.giangVienId);
        }
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

// --- "The Brain": Constraint Checking Logic ---
function isOverlapping(start1, end1, start2, end2) {
    return Math.max(start1, start2) <= Math.min(end1, end2);
}

function checkLecturerConflict(lecturerId, day, startPeriod, numPeriods, excludeScheduleId = null, scheduleList = schedules) {
    const endPeriod = startPeriod + numPeriods - 1;
    const lecturerSchedules = scheduleList.filter(s => {
        if (s.id === excludeScheduleId) return false;
        const section = courseSections.find(cs => cs.id === s.lopHocPhanId);
        return section && section.giangVienId === lecturerId;
    });

    for (const s of lecturerSchedules) {
        if (s.thu === day && isOverlapping(startPeriod, endPeriod, s.tietBatDau, s.tietBatDau + s.soTiet - 1)) {
            const conflictingSection = courseSections.find(cs => cs.id === s.lopHocPhanId);
            const conflictingClass = officialClasses.find(oc => oc.id === conflictingSection?.lopChinhQuyId);
            return `Giảng viên đã có lịch dạy lớp ${conflictingClass?.maLopCQ || 'khác'} vào thời gian này.`;
        }
    }
    return null;
}

function checkRoomConflict(roomId, day, startPeriod, numPeriods, excludeScheduleId = null, scheduleList = schedules) {
    const endPeriod = startPeriod + numPeriods - 1;
    const roomSchedules = scheduleList.filter(s => s.id !== excludeScheduleId && s.phongHocId === roomId);

    for (const s of roomSchedules) {
        if (s.thu === day && isOverlapping(startPeriod, endPeriod, s.tietBatDau, s.tietBatDau + s.soTiet - 1)) {
            const conflictingSection = courseSections.find(cs => cs.id === s.lopHocPhanId);
            const conflictingClass = officialClasses.find(oc => oc.id === conflictingSection?.lopChinhQuyId);
            return `Phòng học đã được lớp ${conflictingClass?.maLopCQ || 'khác'} sử dụng.`;
        }
    }
    return null;
}

function checkClassConflict(officialClassId, day, startPeriod, numPeriods, excludeScheduleId = null, scheduleList = schedules) {
    const endPeriod = startPeriod + numPeriods - 1;
    const sectionsInClass = courseSections.filter(cs => cs.lopChinhQuyId === officialClassId);
    const sectionIdsInClass = sectionsInClass.map(cs => cs.id);
    const classSchedules = scheduleList.filter(s => s.id !== excludeScheduleId && sectionIdsInClass.includes(s.lopHocPhanId));

    for (const s of classSchedules) {
        if (s.thu === day && isOverlapping(startPeriod, endPeriod, s.tietBatDau, s.tietBatDau + s.soTiet - 1)) {
            const conflictingSection = courseSections.find(cs => cs.id === s.lopHocPhanId);
            const conflictingSubject = subjects.find(sub => sub.id === conflictingSection?.monHocId);
            return `Lớp đã có lịch học môn ${conflictingSubject?.tenMonHoc || 'khác'} vào thời gian này.`;
        }
    }
    return null;
}


// --- Manual & Auto Scheduling Logic ---
function populateManualScheduleModal() {
    const sectionSelect = document.getElementById('ms-section-select');
    sectionSelect.innerHTML = '<option value="">-- Chọn Lớp học phần --</option>';
    
    courseSections.forEach(cs => {
        const subject = subjects.find(s => s.id === cs.monHocId);
        const officialClass = officialClasses.find(oc => oc.id === cs.lopChinhQuyId);
        if (subject && officialClass) {
            sectionSelect.innerHTML += `<option value="${cs.id}">${cs.maLopHP} (${subject.tenMonHoc} - Lớp ${officialClass.maLopCQ})</option>`;
        }
    });

    const roomSelect = document.getElementById('ms-room-select');
    roomSelect.innerHTML = '<option value="">-- Chọn Phòng học --</option>';
    rooms.forEach(room => {
        roomSelect.innerHTML += `<option value="${room.id}">${room.tenPhong} (${room.loaiPhong} - Sức chứa: ${room.sucChua})</option>`;
    });

    document.getElementById('ms-schedule-id').value = '';
}

async function runAutoScheduler(btn) {
    setButtonLoading(btn, true);
    
    let unscheduledSections = courseSections
        .filter(cs => !schedules.some(s => s.lopHocPhanId === cs.id))
        .map(cs => {
            const officialClass = officialClasses.find(oc => oc.id === cs.lopChinhQuyId);
            return { ...cs, siSo: officialClass?.siSo || 0 };
        });

    if (unscheduledSections.length === 0) {
        showAlert("Tất cả các lớp học phần đã được xếp lịch.", true);
        setButtonLoading(btn, false);
        return;
    }

    // Reverted to simple sorting by class size
    unscheduledSections.sort((a, b) => b.siSo - a.siSo);

    const successLog = [];
    const failureLog = [];
    const batch = writeBatch(db);
    const tempSchedules = [...schedules]; 

    for (const section of unscheduledSections) {
        let scheduled = false;
        const subject = subjects.find(s => s.id === section.monHocId);
        if (!subject) {
            failureLog.push(`- <strong>${section.maLopHP}</strong>: Lỗi - Không tìm thấy thông tin môn học.`);
            continue;
        }
        const numPeriods = subject.soTinChi ? (subject.soTinChi || 3) : 3;

        mainLoop:
        for (let day = 2; day <= 7; day++) {
            for (let startPeriod = 1; startPeriod <= 15 - numPeriods + 1; startPeriod++) {
                
                const endPeriod = startPeriod + numPeriods - 1;
                const isCrossingMorningAfternoon = (startPeriod <= 5 && endPeriod > 5);
                const isCrossingAfternoonEvening = (startPeriod <= 10 && endPeriod > 10);
                if (isCrossingMorningAfternoon || isCrossingAfternoonEvening) {
                    continue; 
                }

                for (const room of rooms) {
                    // Constraint 1: Room Capacity
                    if (room.sucChua < section.siSo) continue;

                    // Constraints 2, 3, 4: Time Conflicts
                    const lecturerConflict = checkLecturerConflict(section.giangVienId, day, startPeriod, numPeriods, null, tempSchedules);
                    const roomConflict = checkRoomConflict(room.id, day, startPeriod, numPeriods, null, tempSchedules);
                    const classConflict = checkClassConflict(section.lopChinhQuyId, day, startPeriod, numPeriods, null, tempSchedules);

                    if (!lecturerConflict && !roomConflict && !classConflict) {
                        const scheduleData = {
                            lopHocPhanId: section.id,
                            phongHocId: room.id,
                            thu: day,
                            tietBatDau: startPeriod,
                            soTiet: numPeriods
                        };
                        const newScheduleRef = doc(thoiKhoaBieuCol);
                        batch.set(newScheduleRef, scheduleData);
                        
                        tempSchedules.push({ id: newScheduleRef.id, ...scheduleData });

                        successLog.push(`- <strong>${section.maLopHP}</strong>: Xếp thành công vào Thứ ${day}, Tiết ${startPeriod}-${endPeriod}, Phòng ${room.tenPhong}`);
                        scheduled = true;
                        break mainLoop;
                    }
                }
            }
        }
        if (!scheduled) {
            failureLog.push(`- <strong>${section.maLopHP}</strong>: Không tìm được lịch trống phù hợp (đã xét các ràng buộc).`);
        }
    }

    try {
        await batch.commit();
        document.getElementById('auto-schedule-success').innerHTML = successLog.length > 0 ? successLog.join('<br>') : "Không có lớp nào được xếp thành công.";
        document.getElementById('auto-schedule-failed').innerHTML = failureLog.length > 0 ? failureLog.join('<br>') : "Tất cả các lớp đều được xếp thành công.";
        openModal('auto-schedule-results-modal');
    } catch (error) {
        console.error("Error committing auto-schedule batch:", error);
        showAlert("Đã xảy ra lỗi khi lưu kết quả xếp lịch tự động.");
    } finally {
        setButtonLoading(btn, false);
    }
}

// --- Conflict Check Tool ---
function runConflictCheck() {
    const conflicts = {
        lecturer: [],
        room: [],
        class: []
    };

    const checkedPairs = new Set();

    for (let i = 0; i < schedules.length; i++) {
        for (let j = i + 1; j < schedules.length; j++) {
            const s1 = schedules[i];
            const s2 = schedules[j];

            // Only check schedules on the same day
            if (s1.thu !== s2.thu) continue;
            
            // Check for time overlap
            const s1_start = s1.tietBatDau;
            const s1_end = s1.tietBatDau + s1.soTiet - 1;
            const s2_start = s2.tietBatDau;
            const s2_end = s2.tietBatDau + s2.soTiet - 1;

            if (!isOverlapping(s1_start, s1_end, s2_start, s2_end)) continue;

            // If overlapping, check for resource conflicts
            const section1 = courseSections.find(cs => cs.id === s1.lopHocPhanId);
            const section2 = courseSections.find(cs => cs.id === s2.lopHocPhanId);

            if (!section1 || !section2) continue;

            // 1. Lecturer conflict
            if (section1.giangVienId === section2.giangVienId) {
                conflicts.lecturer.push({ s1, s2, section1, section2 });
            }
            // 2. Room conflict
            if (s1.phongHocId === s2.phongHocId) {
                conflicts.room.push({ s1, s2, section1, section2 });
            }
            // 3. Class conflict
            if (section1.lopChinhQuyId === section2.lopChinhQuyId) {
                conflicts.class.push({ s1, s2, section1, section2 });
            }
        }
    }
    
    displayConflictResults(conflicts);
}

function displayConflictResults(conflicts) {
    const container = document.getElementById('conflict-results-container');
    container.innerHTML = '';
    let hasConflicts = false;

    const createConflictEntry = (title, conflictList, type) => {
        if (conflictList.length === 0) return;
        hasConflicts = true;

        const details = document.createElement('details');
        details.className = 'bg-white p-4 rounded-lg shadow';
        details.open = true;
        
        const summary = document.createElement('summary');
        summary.className = 'font-bold text-lg cursor-pointer text-red-700';
        summary.innerHTML = `<i class="fas fa-exclamation-triangle mr-2"></i>${title} (${conflictList.length} cặp xung đột)`;
        details.appendChild(summary);

        const list = document.createElement('div');
        list.className = 'mt-4 space-y-3 pl-5';
        
        conflictList.forEach(({ s1, s2, section1, section2 }) => {
            const item = document.createElement('div');
            item.className = 'p-3 border-l-4 border-red-500 bg-red-50 rounded';
            
            const subject1 = subjects.find(s => s.id === section1.monHocId)?.tenMonHoc || 'N/A';
            const class1 = officialClasses.find(oc => oc.id === section1.lopChinhQuyId)?.maLopCQ || 'N/A';
            const subject2 = subjects.find(s => s.id === section2.monHocId)?.tenMonHoc || 'N/A';
            const class2 = officialClasses.find(oc => oc.id === section2.lopChinhQuyId)?.maLopCQ || 'N/A';
            const lecturer = lecturers.find(l => l.id === section1.giangVienId)?.name || 'N/A';
            const room = rooms.find(r => r.id === s1.phongHocId)?.tenPhong || 'N/A';

            let conflictSourceInfo = '';
            if (type === 'lecturer') conflictSourceInfo = `<strong>Giảng viên:</strong> ${lecturer}`;
            if (type === 'room') conflictSourceInfo = `<strong>Phòng:</strong> ${room}`;
            if (type === 'class') conflictSourceInfo = `<strong>Lớp:</strong> ${class1}`;

            item.innerHTML = `
                <p class="font-semibold">${conflictSourceInfo} - Trùng lịch vào Thứ ${s1.thu}, Tiết ${Math.max(s1.tietBatDau, s2.tietBatDau)}-${Math.min(s1.tietBatDau + s1.soTiet - 1, s2.tietBatDau + s2.soTiet - 1)}</p>
                <ul class="list-disc list-inside text-sm mt-2 space-y-1">
                    <li><strong>${subject1}</strong> (Lớp ${class1})</li>
                    <li><strong>${subject2}</strong> (Lớp ${class2})</li>
                </ul>
            `;
            list.appendChild(item);
        });
        
        details.appendChild(list);
        container.appendChild(details);
    };

    createConflictEntry('Xung đột Giảng viên', conflicts.lecturer, 'lecturer');
    createConflictEntry('Xung đột Phòng học', conflicts.room, 'room');
    createConflictEntry('Xung đột Lớp học', conflicts.class, 'class');

    if (!hasConflicts) {
        container.innerHTML = `
            <div class="p-4 rounded-lg bg-green-100 text-green-800 text-center">
                <i class="fas fa-check-circle fa-2x mb-2"></i>
                <p class="font-bold text-lg">Hệ thống không tìm thấy xung đột nào trong thời khóa biểu hiện tại.</p>
            </div>
        `;
    }

    openModal('conflict-check-modal');
}


// --- Direct schedule actions ---
window.openScheduleActionModal = (scheduleId) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) return;

    const section = courseSections.find(cs => cs.id === schedule.lopHocPhanId);
    const subject = subjects.find(s => s.id === section?.monHocId);
    const room = rooms.find(r => r.id === schedule.phongHocId);

    const detailsDiv = document.getElementById('schedule-action-details');
    detailsDiv.innerHTML = `
        <p><strong>Môn học:</strong> ${subject?.tenMonHoc || 'N/A'}</p>
        <p><strong>Phòng:</strong> ${room?.tenPhong || 'N/A'}</p>
        <p><strong>Thời gian:</strong> Thứ ${schedule.thu}, Tiết ${schedule.tietBatDau} - ${schedule.tietBatDau + schedule.soTiet - 1}</p>
    `;

    const editBtn = document.getElementById('schedule-action-edit-btn');
    const deleteBtn = document.getElementById('schedule-action-delete-btn');

    editBtn.onclick = () => {
        closeModal('schedule-action-modal');
        openEditScheduleModal(scheduleId);
    };
    deleteBtn.onclick = () => {
        closeModal('schedule-action-modal');
        deleteSchedule(scheduleId);
    };

    openModal('schedule-action-modal');
};

window.openEditScheduleModal = (scheduleId) => {
    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) {
        showAlert("Không tìm thấy lịch học để sửa.");
        return;
    }
    
    populateManualScheduleModal();
    
    document.getElementById('ms-schedule-id').value = schedule.id;
    document.getElementById('ms-section-select').value = schedule.lopHocPhanId;
    document.getElementById('ms-day-select').value = schedule.thu;
    document.getElementById('ms-start-period').value = schedule.tietBatDau;
    document.getElementById('ms-num-periods').value = schedule.soTiet;
    document.getElementById('ms-room-select').value = schedule.phongHocId;
    document.getElementById('ms-section-select').disabled = true;

    openModal('manual-schedule-modal');
};

window.deleteSchedule = (scheduleId) => {
    showConfirm("Bạn có chắc muốn xóa mục lịch này?", async () => {
        try {
            await deleteDoc(doc(thoiKhoaBieuCol, scheduleId));
            showAlert("Xóa lịch học thành công!", true);
        } catch (error) {
            showAlert(`Lỗi khi xóa lịch học: ${error.message}`);
        }
    });
};

// --- Print and Statistics Logic ---
function populatePrintModalDropdowns() {
    const semesterSelect = document.getElementById('print-semester-select');
    const departmentSelect = document.getElementById('print-department-select');
    const lecturerSelect = document.getElementById('print-lecturer-select');

    semesterSelect.innerHTML = '<option value="">-- Chọn học kỳ --</option>';
    semesters.forEach(s => {
        semesterSelect.innerHTML += `<option value="${s.id}">${s.tenHocKy}</option>`;
    });

    departmentSelect.innerHTML = '<option value="all">-- Toàn trường --</option>';
    departments.forEach(d => {
        departmentSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
    });

    lecturerSelect.innerHTML = '<option value="">-- Chọn giảng viên --</option>';
    lecturers.forEach(l => {
        lecturerSelect.innerHTML += `<option value="${l.id}">${l.name}</option>`;
    });
}

function generatePrintableSchedule(options) {
    const { semesterId, viewType, filterId, groupBy } = options;

    const selectedSemester = semesters.find(s => s.id === semesterId);
    if (!selectedSemester) {
        showAlert("Vui lòng chọn một học kỳ hợp lệ.");
        return;
    }

    const sectionsInSemester = courseSections.filter(cs => cs.hocKyId === semesterId);
    if (sectionsInSemester.length === 0) {
        showAlert("Không có lớp học phần nào được phân công trong học kỳ đã chọn.");
        return;
    }

    let finalSections = [];
    let title = `Thời khóa biểu ${selectedSemester.tenHocKy}`;

    if (viewType === 'lecturer') {
        title += ` - Giảng viên: ${lecturers.find(l => l.id === filterId)?.name || 'N/A'}`;
        finalSections = sectionsInSemester.filter(cs => cs.giangVienId === filterId);
    } else { // viewType is 'department'
        if (filterId === 'all') {
            title += ` - Toàn trường`;
            finalSections = sectionsInSemester;
        } else {
            const department = departments.find(d => d.id === filterId);
            title += ` - Khoa: ${department?.name || 'N/A'}`;
            const lecturersInDept = lecturers.filter(l => l.departmentId === filterId);
            const lecturerIdsInDept = lecturersInDept.map(l => l.id);
            finalSections = sectionsInSemester.filter(cs => lecturerIdsInDept.includes(cs.giangVienId));
        }
    }
    
    const sectionIds = finalSections.map(cs => cs.id);
    const relevantSchedules = schedules.filter(s => sectionIds.includes(s.lopHocPhanId));

    if (relevantSchedules.length === 0) {
        showAlert("Không có dữ liệu lịch học nào cho lựa chọn của bạn.");
        return;
    }

    let tableBodyHtml = '';
    const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    let tableHeaderHtml = '';

    if (viewType === 'lecturer') {
        tableHeaderHtml = `<th>Ca</th>${days.map(d => `<th>${d}</th>`).join('')}`;
        const shifts = { Sáng: [], Chiều: [], Tối: [] };
        relevantSchedules.forEach(s => {
            if (s.tietBatDau <= 5) shifts.Sáng.push(s);
            else if (s.tietBatDau <= 10) shifts.Chiều.push(s);
            else shifts.Tối.push(s);
        });

        Object.keys(shifts).forEach(shiftName => {
            tableBodyHtml += `<tr><td class="row-header">${shiftName}</td>`;
            for (let day = 2; day <= 7; day++) {
                let cellHtml = '';
                const schedulesInCell = shifts[shiftName].filter(s => s.thu === day);
                schedulesInCell.forEach(s => {
                    const section = finalSections.find(cs => cs.id === s.lopHocPhanId);
                    const subject = subjects.find(sub => sub.id === section?.monHocId);
                    const room = rooms.find(r => r.id === s.phongHocId);
                    const oClass = officialClasses.find(oc => oc.id === section?.lopChinhQuyId);
                    cellHtml += `
                        <div class="print-schedule-item">
                            <p><strong>${subject?.tenMonHoc || 'N/A'}</strong></p>
                            <p>Lớp: ${oClass?.maLopCQ || 'N/A'}</p>
                            <p>Phòng: ${room?.tenPhong || 'N/A'}</p>
                            <p>Tiết: ${s.tietBatDau}-${s.tietBatDau + s.soTiet - 1}</p>
                        </div>
                    `;
                });
                tableBodyHtml += `<td>${cellHtml}</td>`;
            }
            tableBodyHtml += '</tr>';
        });
    } else { // 'department' or 'all'
        if (groupBy === 'class') {
            tableHeaderHtml = `<th>Lớp</th>${days.map(d => `<th>${d}</th>`).join('')}`;
            const relevantOfficialClassIds = new Set(finalSections.map(fs => fs.lopChinhQuyId));
            const classesWithSchedules = officialClasses
                .filter(oc => relevantOfficialClassIds.has(oc.id))
                .sort((a, b) => a.maLopCQ.localeCompare(b.maLopCQ));

            classesWithSchedules.forEach(oClass => {
                tableBodyHtml += `<tr><td class="row-header">${oClass.maLopCQ}</td>`;
                for (let day = 2; day <= 7; day++) {
                    let cellHtml = '';
                    const sectionsForThisClass = finalSections.filter(fs => fs.lopChinhQuyId === oClass.id);
                    const sectionIdsForThisClass = sectionsForThisClass.map(s => s.id);
                    const schedulesInCell = relevantSchedules.filter(s => sectionIdsForThisClass.includes(s.lopHocPhanId) && s.thu === day);
                    schedulesInCell.sort((a, b) => a.tietBatDau - b.tietBatDau);

                    schedulesInCell.forEach(s => {
                        const section = finalSections.find(cs => cs.id === s.lopHocPhanId);
                        const subject = subjects.find(sub => sub.id === section?.monHocId);
                        const lecturer = lecturers.find(l => l.id === section?.giangVienId);
                        const room = rooms.find(r => r.id === s.phongHocId);
                        const phoneHtml = lecturer?.soDienThoai ? `<p>SĐT: ${lecturer.soDienThoai}</p>` : '';
                        cellHtml += `
                            <div class="print-schedule-item">
                                <p><strong>${subject?.tenMonHoc || 'N/A'}</strong></p>
                                <p>GV: ${lecturer?.name || 'N/A'}</p>
                                ${phoneHtml}
                                <p>Phòng: ${room?.tenPhong || 'N/A'}</p>
                                <p>Tiết: ${s.tietBatDau}-${s.tietBatDau + s.soTiet - 1}</p>
                            </div>
                        `;
                    });
                    tableBodyHtml += `<td>${cellHtml}</td>`;
                }
                tableBodyHtml += '</tr>';
            });
        } else { // Default to groupBy === 'room'
            tableHeaderHtml = `<th>Phòng</th>${days.map(d => `<th>${d}</th>`).join('')}`;
            const roomsWithSchedules = rooms
                .filter(r => relevantSchedules.some(s => s.phongHocId === r.id))
                .sort((a, b) => a.tenPhong.localeCompare(b.tenPhong));

            roomsWithSchedules.forEach(room => {
                tableBodyHtml += `<tr><td class="row-header">${room.tenPhong}</td>`;
                for (let day = 2; day <= 7; day++) {
                    let cellHtml = '';
                    const schedulesInCell = relevantSchedules.filter(s => s.phongHocId === room.id && s.thu === day);
                    schedulesInCell.sort((a, b) => a.tietBatDau - b.tietBatDau);

                    schedulesInCell.forEach(s => {
                        const section = finalSections.find(cs => cs.id === s.lopHocPhanId);
                        const subject = subjects.find(sub => sub.id === section?.monHocId);
                        const lecturer = lecturers.find(l => l.id === section?.giangVienId);
                        const oClass = officialClasses.find(oc => oc.id === section?.lopChinhQuyId);
                        const phoneHtml = lecturer?.soDienThoai ? `<p>SĐT: ${lecturer.soDienThoai}</p>` : '';
                        cellHtml += `
                            <div class="print-schedule-item">
                                <p><strong>${subject?.tenMonHoc || 'N/A'}</strong></p>
                                <p>Lớp: ${oClass?.maLopCQ || 'N/A'}</p>
                                <p>GV: ${lecturer?.name || 'N/A'}</p>
                                ${phoneHtml}
                                <p>Tiết: ${s.tietBatDau}-${s.tietBatDau + s.soTiet - 1}</p>
                            </div>
                        `;
                    });
                    tableBodyHtml += `<td>${cellHtml}</td>`;
                }
                tableBodyHtml += '</tr>';
            });
        }
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        showAlert("Không thể mở tab mới. Vui lòng kiểm tra và tắt trình chặn cửa sổ bật lên (pop-up blocker) của trình duyệt và thử lại.");
        return;
    }
    printWindow.document.write(`
        <html>
            <head>
                <title>${title}</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    table { width: 100%; border-collapse: collapse; font-size: 12px; }
                    th, td { border: 1px solid #ccc; padding: 8px; text-align: center; vertical-align: top; min-height: 80px; }
                    th { background-color: #f2f2f2; }
                    .print-schedule-item { border: 1px solid #eee; border-left: 3px solid #007bff; background: #f8f9fa; padding: 5px; margin-bottom: 5px; text-align: left; }
                    .print-schedule-item p { margin: 2px 0; font-size: 11px; }
                    .row-header { font-weight: bold; }
                    .print-header { text-align: center; margin-bottom: 20px; }
                    .print-button { padding: 10px 20px; font-size: 16px; cursor: pointer; background: #28a745; color: white; border: none; border-radius: 5px; margin-bottom: 20px; }
                    @media print { .print-button { display: none; } }
                </style>
            </head>
            <body>
                <div class="print-header">
                    <h2>THỜI KHÓA BIỂU GIẢNG DẠY</h2>
                    <h3>${title}</h3>
                </div>
                <button onclick="window.print()" class="print-button">In Lịch</button>
                <table>
                    <thead><tr>${tableHeaderHtml}</tr></thead>
                    <tbody>${tableBodyHtml}</tbody>
                </table>
            </body>
        </html>
    `);
    printWindow.document.close();
}


// --- Import Logic (UPDATED) ---

// Function to download a template Excel file
function downloadTemplate() {
    const type = document.getElementById('import-type-select').value;
    let headers, filename;

    switch (type) {
        case 'subjects':
            headers = ["tenMonHoc", "maHocPhan", "soTinChi", "tenKhoa"];
            filename = "Mau_Import_MonHoc.xlsx";
            break;
        case 'rooms':
            headers = ["tenPhong", "sucChua", "loaiPhong"];
            filename = "Mau_Import_PhongHoc.xlsx";
            break;
        case 'majors':
             headers = ["tenNganh", "tenKhoa"];
            filename = "Mau_Import_NganhHoc.xlsx";
            break;
        case 'lecturers':
            headers = ["tenGiangVien", "maGiangVien", "soDienThoai", "tenKhoa"];
            filename = "Mau_Import_GiangVien.xlsx";
            break;
        case 'officialClasses':
            headers = ["maLopCQ", "siSo", "tenKhoa"]; // CHANGED
            filename = "Mau_Import_LopChinhQuy.xlsx";
            break;
        case 'courseSections':
            headers = ["tenHocKy", "maHocPhan", "maLopCQ", "maGiangVien"];
            filename = "Mau_Import_PhanCong.xlsx";
            break;
        default:
            showAlert("Loại dữ liệu không hợp lệ.");
            return;
    }

    const ws = XLSX.utils.json_to_sheet([{}], { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, filename);
}

// Main function to handle file import
async function handleFileImport() {
    const btn = document.getElementById('start-import-btn');
    setButtonLoading(btn, true);

    const fileInput = document.getElementById('import-file-input');
    const type = document.getElementById('import-type-select').value;
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

            logContainer.innerHTML += `Đã đọc ${jsonData.length} dòng từ file.<br>Đang xử lý và ghi vào cơ sở dữ liệu...<br>`;

            const batch = writeBatch(db);
            let successCount = 0;
            let updateCount = 0;
            let errorCount = 0;

            // Process data based on type
            for (const [index, row] of jsonData.entries()) {
                try {
                    let docData;
                    let collectionRef;
                    let uniqueField;
                    let uniqueValue;
                    let queryRef;

                    switch (type) {
                        case 'subjects':
                            collectionRef = monHocCol;
                            uniqueField = "maHocPhan";
                            const departmentNameForSubject = String(row.tenKhoa || '').trim().toLowerCase();
                            const departmentForSubject = departments.find(d => d.name.toLowerCase() === departmentNameForSubject);
                            if (!departmentForSubject) throw new Error(`Không tìm thấy khoa "${row.tenKhoa}"`);
                            docData = {
                                tenMonHoc: String(row.tenMonHoc || '').trim(),
                                maHocPhan: String(row.maHocPhan || '').trim(),
                                soTinChi: parseFloat(row.soTinChi || 0),
                                departmentId: departmentForSubject.id
                            };
                            if (!docData.tenMonHoc || !docData.maHocPhan) throw new Error("Thiếu tên môn học hoặc mã học phần.");
                            uniqueValue = docData.maHocPhan;
                            break;
                        case 'rooms':
                             collectionRef = phongHocCol;
                             uniqueField = "tenPhong";
                             docData = {
                                tenPhong: String(row.tenPhong || '').trim(),
                                sucChua: parseInt(row.sucChua || 0, 10),
                                loaiPhong: String(row.loaiPhong || 'Lý thuyết').trim()
                             };
                             if (!docData.tenPhong) throw new Error("Thiếu tên phòng.");
                             uniqueValue = docData.tenPhong;
                             break;
                        case 'majors':
                            collectionRef = nganhHocCol;
                            uniqueField = "tenNganh";
                            const departmentNameFromExcel = String(row.tenKhoa || '').trim().toLowerCase();
                            const departmentForMajor = departments.find(d => d.name.toLowerCase() === departmentNameFromExcel);
                            if (!departmentForMajor) throw new Error(`Không tìm thấy khoa "${row.tenKhoa}"`);
                            docData = {
                                tenNganh: String(row.tenNganh || '').trim(),
                                departmentId: departmentForMajor.id
                            };
                            if (!docData.tenNganh) throw new Error("Thiếu tên ngành.");
                            uniqueValue = docData.tenNganh;
                            break;
                        case 'lecturers':
                            collectionRef = lecturersCol;
                            uniqueField = "code";
                            const depName = String(row.tenKhoa || '').trim().toLowerCase();
                            const dept = departments.find(d => d.name.toLowerCase() === depName);
                            if (!dept) throw new Error(`Không tìm thấy khoa "${row.tenKhoa}"`);
                            docData = {
                                name: String(row.tenGiangVien || '').trim(),
                                code: String(row.maGiangVien || '').trim(),
                                soDienThoai: String(row.soDienThoai || '').trim(),
                                departmentId: dept.id
                            };
                            if (!docData.name || !docData.code) throw new Error("Thiếu tên hoặc mã giảng viên.");
                            uniqueValue = docData.code;
                            break;
                        case 'officialClasses':
                            collectionRef = lopChinhQuyCol;
                            uniqueField = "maLopCQ";
                            const departmentNameForClass = String(row.tenKhoa || '').trim().toLowerCase();
                            const departmentForClass = departments.find(d => d.name.toLowerCase() === departmentNameForClass);
                            if (!departmentForClass) throw new Error(`Không tìm thấy khoa "${row.tenKhoa}"`);
                            docData = {
                                maLopCQ: String(row.maLopCQ || '').trim(),
                                siSo: parseInt(row.siSo || 0, 10),
                                departmentId: departmentForClass.id
                            };
                            if (!docData.maLopCQ) throw new Error("Thiếu mã lớp chính quy.");
                            uniqueValue = docData.maLopCQ;
                            break;
                        case 'courseSections':
                            collectionRef = lopHocPhanCol;
                            const semester = semesters.find(s => s.tenHocKy.toLowerCase() === String(row.tenHocKy || '').trim().toLowerCase());
                            const subject = subjects.find(s => s.maHocPhan.toLowerCase() === String(row.maHocPhan || '').trim().toLowerCase());
                            const officialClass = officialClasses.find(oc => oc.maLopCQ.toLowerCase() === String(row.maLopCQ || '').trim().toLowerCase());
                            const lecturer = lecturers.find(l => l.code.toLowerCase() === String(row.maGiangVien || '').trim().toLowerCase());

                            if (!semester) throw new Error(`Không tìm thấy học kỳ "${row.tenHocKy}"`);
                            if (!subject) throw new Error(`Không tìm thấy môn học có mã "${row.maHocPhan}"`);
                            if (!officialClass) throw new Error(`Không tìm thấy lớp chính quy có mã "${row.maLopCQ}"`);
                            if (!lecturer) throw new Error(`Không tìm thấy giảng viên có mã "${row.maGiangVien}"`);

                            docData = {
                                hocKyId: semester.id,
                                monHocId: subject.id,
                                lopChinhQuyId: officialClass.id,
                                giangVienId: lecturer.id,
                                maLopHP: `${subject.maHocPhan}-${officialClass.maLopCQ}`
                            };
                            uniqueField = "maLopHP";
                            uniqueValue = docData.maLopHP;
                            break;
                        default:
                            throw new Error("Loại import không hợp lệ.");
                    }
                    
                    // Check for existing document
                    queryRef = query(collectionRef, where(uniqueField, "==", uniqueValue));
                    const existingDocs = await getDocs(queryRef);

                    if (!existingDocs.empty) {
                        const docId = existingDocs.docs[0].id;
                        batch.update(doc(collectionRef, docId), docData);
                        updateCount++;
                    } else {
                        const newDocRef = doc(collectionRef);
                        batch.set(newDocRef, docData);
                        successCount++;
                    }

                } catch (rowError) {
                    errorCount++;
                    logContainer.innerHTML += `<span class="text-orange-500">- Dòng ${index + 2}: Lỗi - ${rowError.message}</span><br>`;
                }
            }

            if (successCount > 0 || updateCount > 0) {
                await batch.commit();
            }
            
            logContainer.innerHTML += `<hr class="my-2">`;
            logContainer.innerHTML += `<strong class="text-green-600">Hoàn thành!</strong><br>`;
            logContainer.innerHTML += `<span>- Thêm mới thành công: ${successCount} mục.</span><br>`;
            logContainer.innerHTML += `<span class="text-blue-600">- Cập nhật mục đã có: ${updateCount} mục.</span><br>`;
            logContainer.innerHTML += `<span>- Bị lỗi: ${errorCount} mục.</span><br>`;

        } catch (error) {
            console.error("Import error:", error);
            logContainer.innerHTML += `<span class="text-red-500">Đã xảy ra lỗi nghiêm trọng: ${error.message}</span><br>`;
        } finally {
            setButtonLoading(btn, false);
            fileInput.value = ''; // Reset file input
        }
    };

    reader.onerror = () => {
        logContainer.innerHTML += `<span class="text-red-500">Lỗi khi đọc file.</span><br>`;
        setButtonLoading(btn, false);
    };

    reader.readAsArrayBuffer(file);
}


// --- Event Listeners and Initial Setup ---
function addEventListeners() {
    // Schedule view listener
    document.getElementById('class-schedule-select').addEventListener('change', (e) => {
        displayScheduleForClass(e.target.value);
    });

    // Manual Schedule Modal Listener
    document.getElementById('manual-schedule-btn').addEventListener('click', () => {
        populateManualScheduleModal();
        document.getElementById('ms-section-select').disabled = false;
        document.getElementById('manual-schedule-form').reset();
        document.getElementById('ms-schedule-id').value = '';
        window.openModal('manual-schedule-modal');
    });

    // Auto Schedule Button Listener
    document.getElementById('auto-schedule-btn').addEventListener('click', (e) => {
        showConfirm("Bạn có chắc muốn chạy xếp lịch tự động cho tất cả các lớp chưa có lịch?", () => {
             runAutoScheduler(e.currentTarget);
        });
    });
    
    // Conflict Check Button Listener
    document.getElementById('conflict-check-btn').addEventListener('click', () => {
        runConflictCheck();
    });

    // Manual Schedule Form Submission
    document.getElementById('manual-schedule-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);

        try {
            const scheduleId = document.getElementById('ms-schedule-id').value;
            const sectionId = document.getElementById('ms-section-select').value;
            const day = parseInt(document.getElementById('ms-day-select').value, 10);
            const startPeriod = parseInt(document.getElementById('ms-start-period').value, 10);
            const numPeriods = parseInt(document.getElementById('ms-num-periods').value, 10);
            const roomId = document.getElementById('ms-room-select').value;

            if (!sectionId || !roomId || isNaN(day) || isNaN(startPeriod) || isNaN(numPeriods)) {
                showAlert("Vui lòng điền đầy đủ thông tin.");
                setButtonLoading(btn, false);
                return;
            }
            
            const endPeriod = startPeriod + numPeriods - 1;
            if (endPeriod > 15) {
                 showAlert("Lịch học không thể vượt quá tiết 15.");
                 setButtonLoading(btn, false);
                 return;
            }
            const isCrossingMorningAfternoon = (startPeriod <= 5 && endPeriod > 5);
            const isCrossingAfternoonEvening = (startPeriod <= 10 && endPeriod > 10);
            if (isCrossingMorningAfternoon || isCrossingAfternoonEvening) {
                showAlert("Lịch học không được vắt ngang qua các ca Sáng-Chiều hoặc Chiều-Tối.");
                setButtonLoading(btn, false);
                return;
            }

            const section = courseSections.find(cs => cs.id === sectionId);
            if (!section) {
                showAlert("Lớp học phần không hợp lệ.");
                setButtonLoading(btn, false);
                return;
            }
            
            let conflictError;
            conflictError = checkLecturerConflict(section.giangVienId, day, startPeriod, numPeriods, scheduleId);
            if (conflictError) { showAlert(conflictError); setButtonLoading(btn, false); return; }

            conflictError = checkRoomConflict(roomId, day, startPeriod, numPeriods, scheduleId);
            if (conflictError) { showAlert(conflictError); setButtonLoading(btn, false); return; }
            
            conflictError = checkClassConflict(section.lopChinhQuyId, day, startPeriod, numPeriods, scheduleId);
            if (conflictError) { showAlert(conflictError); setButtonLoading(btn, false); return; }

            const scheduleData = {
                lopHocPhanId: sectionId,
                phongHocId: roomId,
                thu: day,
                tietBatDau: startPeriod,
                soTiet: numPeriods
            };

            if (scheduleId) {
                await updateDoc(doc(thoiKhoaBieuCol, scheduleId), scheduleData);
                showAlert("Cập nhật lịch học thành công!", true);
            } else {
                await addDoc(thoiKhoaBieuCol, scheduleData);
                showAlert("Xếp lịch thành công!", true);
            }
            
            closeModal('manual-schedule-modal');
            e.target.reset();
            document.getElementById('ms-section-select').disabled = false;

        } catch (error) {
            console.error("Error saving manual schedule:", error);
            showAlert(`Đã xảy ra lỗi khi lưu: ${error.message}`);
        } finally {
            setButtonLoading(btn, false);
        }
    });

    // Print Modal Listeners
    document.getElementById('print-schedule-btn').addEventListener('click', () => {
        populatePrintModalDropdowns();
        // Trigger change event to set initial visibility
        document.querySelector('input[name="print-view-type"]:checked').dispatchEvent(new Event('change'));
        openModal('print-options-modal');
    });

    document.querySelectorAll('input[name="print-view-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const isDepartmentView = e.target.value === 'department';
            document.getElementById('department-view-options').style.display = isDepartmentView ? 'block' : 'none';
            document.getElementById('lecturer-view-options').style.display = !isDepartmentView ? 'block' : 'none';
        });
    });

    document.getElementById('print-options-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const semesterId = document.getElementById('print-semester-select').value;
        const viewType = document.querySelector('input[name="print-view-type"]:checked').value;
        let filterId;
        let groupBy = 'room'; // Default value

        if (viewType === 'department') {
            filterId = document.getElementById('print-department-select').value;
            groupBy = document.querySelector('input[name="department-group-by"]:checked').value;
        } else {
            filterId = document.getElementById('print-lecturer-select').value;
        }

        if (!semesterId) {
            showAlert("Vui lòng chọn học kỳ.");
            return;
        }
        if (viewType === 'lecturer' && !filterId) {
            showAlert("Vui lòng chọn giảng viên.");
            return;
        }

        generatePrintableSchedule({ semesterId, viewType, filterId, groupBy });
        closeModal('print-options-modal');
    });

    // Import Modal Listeners
    document.getElementById('import-data-btn').addEventListener('click', () => {
        document.getElementById('import-file-input').value = '';
        document.getElementById('import-log').innerHTML = '';
        document.getElementById('import-results-container').classList.add('hidden');
        openModal('import-data-modal');
    });
    document.getElementById('download-template-btn').addEventListener('click', downloadTemplate);
    document.getElementById('start-import-btn').addEventListener('click', handleFileImport);


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
        populateSubjectFilters();
        renderSubjectsList();
        window.openModal('manage-subjects-modal');
    });
    document.getElementById('filter-subject-by-department').addEventListener('change', renderSubjectsList);
    document.getElementById('subject-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const id = document.getElementById('subject-id').value;
        const data = {
            tenMonHoc: document.getElementById('subject-name').value.trim(),
            maHocPhan: document.getElementById('subject-code').value.trim(),
            soTinChi: parseFloat(document.getElementById('subject-credits').value),
            departmentId: document.getElementById('subject-department-select').value,
        };
        if (!data.departmentId) {
            showAlert("Vui lòng chọn Khoa cho môn học.");
            setButtonLoading(btn, false);
            return;
        }
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


    // Official Class listeners (UPDATED)
    document.getElementById('manage-official-classes-btn').addEventListener('click', () => {
        const departmentSelect = document.getElementById('oc-department-select');
        departmentSelect.innerHTML = '<option value="">-- Chọn Khoa --</option>';
        departments.forEach(d => {
            departmentSelect.innerHTML += `<option value="${d.id}">${d.name}</option>`;
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
            departmentId: document.getElementById('oc-department-select').value,
        };
        try {
            if (id) { await updateDoc(doc(lopChinhQuyCol, id), data); } else { await addDoc(lopChinhQuyCol, data); }
            clearOfficialClassForm();
        } catch (error) { showAlert(`Lỗi khi lưu lớp: ${error.message}`); } finally { setButtonLoading(btn, false); }
    });
    document.getElementById('clear-oc-form-btn').addEventListener('click', clearOfficialClassForm);


    // Course Section listeners
    document.getElementById('manage-course-sections-btn').addEventListener('click', () => {
        populateDropdownsForCSModal(); // Initialize first
        clearCourseSectionForm();      // Then clear
        window.openModal('manage-course-sections-modal');
    });
    
    document.getElementById('course-section-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(btn, true);
        const id = document.getElementById('course-section-id').value;
        const data = {
            hocKyId: document.querySelector('#cs-semester-select-container .searchable-select-value').value,
            monHocId: document.querySelector('#cs-subject-select-container .searchable-select-value').value,
            lopChinhQuyId: document.querySelector('#cs-official-class-select-container .searchable-select-value').value,
            maLopHP: document.getElementById('cs-code').value.trim(),
            giangVienId: document.querySelector('#cs-lecturer-select-container .searchable-select-value').value,
        };
        // Basic validation
        if (!data.hocKyId || !data.monHocId || !data.lopChinhQuyId || !data.giangVienId) {
            showAlert("Vui lòng điền đầy đủ tất cả các trường phân công.");
            setButtonLoading(btn, false);
            return;
        }
        try {
            if (id) { await updateDoc(doc(lopHocPhanCol, id), data); } else { await addDoc(lopHocPhanCol, data); }
            closeModal('manage-course-sections-modal');
            clearCourseSectionForm();
        } catch (error) { showAlert(`Lỗi khi lưu phân công: ${error.message}`); } finally { setButtonLoading(btn, false); }
    });
    document.getElementById('clear-cs-form-btn').addEventListener('click', clearCourseSectionForm);

    // --- Bulk Delete Logic for Modals ---
    function setupBulkDelete(modalId, selectAllId, checkboxClass, deleteBtnId, collectionRef, itemName) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        const selectAllCheckbox = document.getElementById(selectAllId);
        const deleteBtn = document.getElementById(deleteBtnId);

        // Event delegation for checkboxes
        modal.addEventListener('change', (e) => {
            if (e.target.matches(`.${checkboxClass}, #${selectAllId}`)) {
                const checkboxes = modal.querySelectorAll(`.${checkboxClass}`);
                if (e.target.id === selectAllId) {
                    checkboxes.forEach(cb => cb.checked = e.target.checked);
                }
                
                const anyChecked = Array.from(checkboxes).some(cb => cb.checked);
                deleteBtn.classList.toggle('hidden', !anyChecked);
            }
        });

        // Delete button click
        deleteBtn.addEventListener('click', () => {
            const selectedIds = Array.from(modal.querySelectorAll(`.${checkboxClass}:checked`)).map(cb => cb.dataset.id);

            if (selectedIds.length === 0) {
                showAlert('Vui lòng chọn ít nhất một mục để xóa.');
                return;
            }

            showConfirm(`Bạn có chắc muốn xóa vĩnh viễn ${selectedIds.length} ${itemName} đã chọn?`, async () => {
                setButtonLoading(deleteBtn, true);
                try {
                    const batch = writeBatch(db);
                    selectedIds.forEach(id => {
                        batch.delete(doc(collectionRef, id));
                    });
                    await batch.commit();
                    showAlert(`Đã xóa ${selectedIds.length} ${itemName} thành công!`, true);
                    deleteBtn.classList.add('hidden');
                } catch (error) {
                    console.error(`Error bulk deleting ${itemName}:`, error);
                    showAlert(`Lỗi khi xóa hàng loạt: ${error.message}`);
                } finally {
                    setButtonLoading(deleteBtn, false);
                }
            });
        });
    }

    setupBulkDelete('manage-semesters-modal', 'select-all-semesters', 'semester-checkbox', 'delete-selected-semesters-btn', hocKyCol, 'học kỳ');
    setupBulkDelete('manage-majors-modal', 'select-all-majors', 'major-checkbox', 'delete-selected-majors-btn', nganhHocCol, 'ngành học');
    setupBulkDelete('manage-subjects-modal', 'select-all-subjects', 'subject-checkbox', 'delete-selected-subjects-btn', monHocCol, 'môn học');
    setupBulkDelete('manage-rooms-modal', 'select-all-rooms', 'room-checkbox', 'delete-selected-rooms-btn', phongHocCol, 'phòng học');
    setupBulkDelete('manage-official-classes-modal', 'select-all-official-classes', 'official-class-checkbox', 'delete-selected-official-classes-btn', lopChinhQuyCol, 'lớp chính quy');
    setupBulkDelete('manage-course-sections-modal', 'select-all-course-sections', 'course-section-checkbox', 'delete-selected-course-sections-btn', lopHocPhanCol, 'phân công');
}

// --- Data Snapshot Listeners ---
let isDataReady = {
    semesters: false, subjects: false, rooms: false, courseSections: false,
    departments: false, lecturers: false, officialClasses: false, schedules: false,
    majors: false
};
let initialLoadDone = false;

function checkAllDataReady() {
    if (initialLoadDone) return;
    if (Object.values(isDataReady).every(status => status === true)) {
        initialLoadDone = true;
        console.log("All initial data loaded.");
        
        renderScheduleTable();
        populateClassSelect();
        
        const classSelect = document.getElementById('class-schedule-select');
        if (officialClasses.length > 0) {
            classSelect.value = officialClasses[0].id;
            displayScheduleForClass(officialClasses[0].id);
        }
    }
}

function setupOnSnapshotListeners() {
    const collections = [
        { name: 'semesters', col: hocKyCol, state: semesters, render: renderSemestersList, sort: (a, b) => b.namHoc.localeCompare(a.namHoc) || b.hocKy - a.hocKy },
        { name: 'subjects', col: monHocCol, state: subjects, render: renderSubjectsList, sort: (a, b) => a.tenMonHoc.localeCompare(b.tenMonHoc) },
        { name: 'rooms', col: phongHocCol, state: rooms, render: renderRoomsList, sort: (a, b) => a.tenPhong.localeCompare(b.tenPhong) },
        { name: 'courseSections', col: lopHocPhanCol, state: courseSections, render: renderCourseSectionsList, sort: (a, b) => a.maLopHP.localeCompare(b.maLopHP) },
        { name: 'departments', col: departmentsCol, state: departments, render: renderMajorsList, sort: (a, b) => a.name.localeCompare(b.name) },
        { name: 'lecturers', col: lecturersCol, state: lecturers, render: null, sort: (a, b) => a.name.localeCompare(b.name) },
        { name: 'officialClasses', col: lopChinhQuyCol, state: officialClasses, render: renderOfficialClassesList, sort: (a, b) => a.maLopCQ.localeCompare(b.maLopCQ) },
        { name: 'schedules', col: thoiKhoaBieuCol, state: schedules, render: null, sort: null },
        { name: 'majors', col: nganhHocCol, state: majors, render: renderMajorsList, sort: (a, b) => a.tenNganh.localeCompare(b.tenNganh) }
    ];

    collections.forEach(c => {
        onSnapshot(c.col, (snapshot) => {
            c.state.length = 0;
            snapshot.docs.forEach(doc => c.state.push({ id: doc.id, ...doc.data() }));
            if (c.sort) c.state.sort(c.sort);
            
            if (c.render) c.render();

            // Re-render dependent lists
            if (c.name === 'departments') {
                renderMajorsList();
                renderSubjectsList();
                populateSubjectFilters();
                renderOfficialClassesList(); // Re-render classes when departments change
            }
             if (c.name === 'majors') {
                // No longer the primary driver for class rendering
            }
            if (c.name === 'officialClasses' || c.name === 'subjects' || c.name === 'lecturers' || c.name === 'semesters') {
                renderCourseSectionsList();
            }
            if (c.name === 'officialClasses') {
                populateClassSelect();
            }

            const selectedClassId = document.getElementById('class-schedule-select').value;
            if (selectedClassId) {
                displayScheduleForClass(selectedClassId);
            }

            if (!isDataReady[c.name]) {
                isDataReady[c.name] = true;
                checkAllDataReady();
            }
        }, (error) => console.error(`Error listening to ${c.name}:`, error));
    });
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
    initializeFirebase();
});
