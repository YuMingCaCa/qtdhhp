// Import các hàm cần thiết từ Firebase SDK
import { auth, db, appId } from './portal-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, addDoc, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- ĐỊNH NGHĨA ĐƯỜNG DẪN DỮ LIỆU ---
const basePath = `artifacts/${appId}/public/data`;
const usersCol = collection(db, `${basePath}/users`);
const schedulesCol = collection(db, `${basePath}/practice_schedules`);
// Collections for management data
const roomsCol = collection(db, `${basePath}/practice_rooms`);
const timeSlotsCol = collection(db, `${basePath}/practice_timeslots`);
const classNamesCol = collection(db, `${basePath}/practice_classnames`);
const lecturersCol = collection(db, `${basePath}/practice_lecturers`);


// --- GLOBAL STATE ---
let currentUserInfo = null;
let allRooms = [];
let allTimeSlots = [];
let allClassNames = [];
let allLecturers = [];
let weekSchedules = [];
let currentWeekStartDate = null;
let selectedRoomId = null;
let scheduleListener = null; // To hold the unsubscribe function for the schedule listener
let datePickerInstance = null;
let printLecturerDatePickerInstance = null; // Date picker for lecturer printing
let selectedBookings = new Set();

// --- UI ELEMENTS ---
const mainContent = document.getElementById('practice-schedule-module');
const datePickerInput = document.getElementById('date-picker');
const roomSelector = document.getElementById('room-selector');
const scheduleContainer = document.getElementById('schedule-container');
const massActionToolbar = document.getElementById('mass-action-toolbar');
const selectionCounter = document.getElementById('selection-counter');
const massDeleteBtn = document.getElementById('mass-delete-btn');

// --- HELPER FUNCTIONS ---
const showAlert = (message) => {
    document.getElementById('alert-message').textContent = message;
    document.getElementById('alert-modal').style.display = 'flex';
};

const showConfirm = (message) => {
    return new Promise((resolve) => {
        document.getElementById('confirm-message').textContent = message;
        const confirmModal = document.getElementById('confirm-modal');
        const yesBtn = document.getElementById('confirm-btn-yes');
        const noBtn = document.getElementById('confirm-btn-no');
        
        const handleYes = () => {
            closeModal('confirm-modal');
            resolve(true);
            yesBtn.removeEventListener('click', handleYes);
            noBtn.removeEventListener('click', handleNo);
        };
        const handleNo = () => {
            closeModal('confirm-modal');
            resolve(false);
            yesBtn.removeEventListener('click', handleYes);
            noBtn.removeEventListener('click', handleNo);
        };
        
        yesBtn.addEventListener('click', handleYes);
        noBtn.addEventListener('click', handleNo);
        
        confirmModal.style.display = 'flex';
    });
};

window.closeModal = (modalId) => {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
};

window.clearForm = (formId) => {
    const form = document.getElementById(formId);
    if(form) {
        form.reset();
        // also clear any hidden id fields
        const hiddenInput = form.querySelector('input[type="hidden"]');
        if (hiddenInput) hiddenInput.value = '';
    }
}

const formatDateToDDMMYYYY = (d) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
const formatDateToYYYYMMDD = (d) => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;


// --- DATE & WEEK LOGIC ---
function getWeekInfo(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1; // Monday is 0, Sunday is 6
    const startDate = new Date(new Date(d).setDate(d.getDate() - day));
    const year = startDate.getFullYear();
    const oneJan = new Date(year, 0, 1);
    const numberOfDays = Math.floor((startDate - oneJan) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil((numberOfDays + oneJan.getDay() + 1) / 7);
    
    const weekDates = [];
    for(let i=0; i<7; i++){
        const dayDate = new Date(startDate);
        dayDate.setDate(startDate.getDate() + i);
        weekDates.push(dayDate);
    }

    return { startDate, weekNumber, weekDates };
}

function updateDatePickerDisplay() {
    const { startDate, weekNumber } = getWeekInfo(currentWeekStartDate);
    const endDate = new Date(new Date(startDate).setDate(startDate.getDate() + 6));
    const display_text = `Tuần ${weekNumber} (${formatDateToDDMMYYYY(startDate)} - ${formatDateToDDMMYYYY(endDate)})`;
    if(datePickerInstance) {
        datePickerInstance.set('defaultDate', currentWeekStartDate);
        datePickerInput.value = display_text;
    }
}

function setWeek(date) {
    currentWeekStartDate = new Date(date);
    updateDatePickerDisplay();
    listenForSchedules();
}

// --- MANAGEMENT MODAL TABS ---
window.openTab = (evt, tabName) => {
    let i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tab-button");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";
}

// --- UI RENDERING ---
function updateUIForRole() {
    const isAdmin = currentUserInfo && currentUserInfo.role === 'admin';
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? 'block' : 'none'; // Use 'block' for divs
    });
}

function renderRoomSelector() {
    const currentVal = roomSelector.value;
    roomSelector.innerHTML = `
        <option value="">-- Vui lòng chọn phòng --</option>
        <option value="all">-- Hiển thị tất cả phòng --</option>
    `;
    allRooms.forEach(room => {
        const option = document.createElement('option');
        option.value = room.id;
        option.textContent = room.name;
        roomSelector.appendChild(option);
    });
    if (currentVal && (allRooms.some(r => r.id === currentVal) || currentVal === 'all')) {
        roomSelector.value = currentVal;
    } else if (allRooms.length > 0) {
        roomSelector.value = allRooms[0].id;
        selectedRoomId = allRooms[0].id;
    } else {
        roomSelector.value = 'all';
        selectedRoomId = 'all';
    }
}

function renderSchedule() {
    if (!selectedRoomId) {
        scheduleContainer.innerHTML = `<p class="text-center text-gray-500 p-8">Vui lòng chọn một phòng để xem lịch.</p>`;
        return;
    }

    if (selectedRoomId === 'all') {
        renderAllRoomsSchedule();
    } else {
        renderSingleRoomSchedule();
    }
}

function renderSingleRoomSchedule() {
    const { weekDates } = getWeekInfo(currentWeekStartDate);
    const table = document.createElement('table');
    table.className = 'schedule-table';
    const daysOfWeek = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

    let thead = '<thead><tr>';
    weekDates.forEach((date, index) => {
        thead += `<th>
            <div class="day-header">${daysOfWeek[index]}</div>
            <div class="date-header">${formatDateToDDMMYYYY(date)}</div>
        </th>`;
    });
    thead += '</tr></thead>';
    table.innerHTML = thead;

    let tbody = '<tbody><tr>';
    weekDates.forEach(date => {
        const dateString = formatDateToYYYYMMDD(date);
        const dayBookings = weekSchedules
            .filter(s => s.date === dateString && s.roomId === selectedRoomId)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

        let bookingsHtml = dayBookings.map(booking => `
            <div class="schedule-booking flex items-center gap-2 p-1 ${booking.seriesId ? 'border-l-yellow-400' : 'border-l-blue-500'}">
                <input type="checkbox" value="${booking.id}" onchange="window.handleBookingSelection(event)" class="form-checkbox h-5 w-5 text-blue-600 rounded flex-shrink-0" ${selectedBookings.has(booking.id) ? 'checked' : ''}>
                <div class="flex-grow booking-details p-1 rounded" onclick="window.showBookingDetails('${booking.id}')">
                    <p class="font-bold truncate">${booking.startTime} - ${booking.endTime}</p>
                    <p class="truncate">${booking.className}</p>
                    <p class="truncate text-xs">${booking.lecturerName}</p>
                </div>
            </div>
        `).join('');

        tbody += `<td class="h-[200px]">
            <div class="booking-container">
                <button class="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-3 rounded-md mb-2 text-sm" onclick="window.openBookingModal('${dateString}', '${selectedRoomId}')">
                    <i class="fas fa-plus-circle mr-1"></i> Đăng ký
                </button>
                ${bookingsHtml}
            </div>
        </td>`;
    });
    tbody += '</tr></tbody>';
    table.innerHTML += tbody;

    scheduleContainer.innerHTML = '';
    scheduleContainer.appendChild(table);
}

function renderAllRoomsSchedule() {
    const { weekDates } = getWeekInfo(currentWeekStartDate);
    const table = document.createElement('table');
    table.className = 'schedule-table all-rooms-table';
    const daysOfWeek = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

    let thead = '<thead><tr><th>Phòng</th>';
    weekDates.forEach((date, index) => {
        thead += `<th>
            <div class="day-header">${daysOfWeek[index]}</div>
            <div class="date-header">${formatDateToDDMMYYYY(date)}</div>
        </th>`;
    });
    thead += '</tr></thead>';
    table.innerHTML = thead;

    let tbody = '<tbody>';
    allRooms.forEach(room => {
        tbody += `<tr><td class="room-name-cell">${room.name}</td>`;
        weekDates.forEach(date => {
            const dateString = formatDateToYYYYMMDD(date);
            const dayBookings = weekSchedules
                .filter(s => s.date === dateString && s.roomId === room.id)
                .sort((a, b) => a.startTime.localeCompare(b.startTime));
            
            let bookingsHtml = dayBookings.map(booking => `
                 <div class="schedule-booking flex items-center gap-2 p-1 ${booking.seriesId ? 'border-l-yellow-400' : 'border-l-blue-500'}">
                    <input type="checkbox" value="${booking.id}" onchange="window.handleBookingSelection(event)" class="form-checkbox h-5 w-5 text-blue-600 rounded flex-shrink-0" ${selectedBookings.has(booking.id) ? 'checked' : ''}>
                    <div class="flex-grow booking-details p-1 rounded" onclick="window.showBookingDetails('${booking.id}')">
                        <p class="font-bold truncate">${booking.startTime} - ${booking.endTime}</p>
                        <p class="truncate">${booking.className}</p>
                        <p class="truncate text-xs">${booking.lecturerName}</p>
                    </div>
                </div>
            `).join('');

            tbody += `<td><div class="booking-container">${bookingsHtml}</div></td>`;
        });
        tbody += '</tr>';
    });
    tbody += '</tbody>';
    table.innerHTML += tbody;
    
    scheduleContainer.innerHTML = '';
    scheduleContainer.appendChild(table);
}

// --- RENDER MANAGEMENT LISTS ---
const renderList = (containerId, items, nameProp, descriptionProp, editFn, deleteFn) => {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    if (items.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 p-4">Chưa có dữ liệu.</p>';
        return;
    }
    const list = document.createElement('ul');
    list.className = 'divide-y divide-gray-200';
    items.forEach(item => {
        const itemEl = document.createElement('li');
        itemEl.className = 'py-3 flex justify-between items-center';
        itemEl.innerHTML = `
            <div>
                <p class="font-medium text-gray-800">${item[nameProp]}</p>
                ${descriptionProp && item[descriptionProp] ? `<p class="text-sm text-gray-500">${item[descriptionProp]}</p>` : ''}
            </div>
            <div class="flex gap-3">
                <button class="text-blue-500 hover:text-blue-700" onclick="${editFn}('${item.id}')"><i class="fas fa-edit"></i></button>
                <button class="text-red-500 hover:text-red-700" onclick="${deleteFn}('${item.id}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
        list.appendChild(itemEl);
    });
    container.appendChild(list);
};

// --- DATA LISTENERS ---
const createListener = (col, stateArray, renderFn) => {
    onSnapshot(query(col), (snapshot) => {
        stateArray.length = 0; // Clear the array
        snapshot.docs.forEach(doc => stateArray.push({ id: doc.id, ...doc.data() }));
        // Sort logic
        if (stateArray.length > 0 && stateArray[0].startTime) { // TimeSlots
             stateArray.sort((a, b) => a.startTime.localeCompare(b.startTime));
        } else if (stateArray.length > 0 && stateArray[0].name) { // Rooms
             stateArray.sort((a, b) => a.name.localeCompare(b.name));
        } else if (stateArray.length > 0 && stateArray[0].value) { // Others
             stateArray.sort((a, b) => a.value.localeCompare(b.value));
        }
        if (renderFn) renderFn();
    });
};

function listenForSchedules() {
    if (scheduleListener) scheduleListener(); 
    
    selectedBookings.clear();
    updateMassActionUI();

    if (!selectedRoomId) {
        weekSchedules = [];
        renderSchedule();
        return;
    }
    
    scheduleContainer.innerHTML = `<div class="text-center p-8"><i class="fas fa-spinner fa-spin fa-2x text-blue-500"></i><p class="mt-2">Đang tải lịch...</p></div>`;

    const { startDate } = getWeekInfo(currentWeekStartDate);
    const weekId = formatDateToYYYYMMDD(startDate);

    let q = selectedRoomId === 'all'
        ? query(schedulesCol, where("weekId", "==", weekId))
        : query(schedulesCol, where("weekId", "==", weekId), where("roomId", "==", selectedRoomId));

    scheduleListener = onSnapshot(q, (snapshot) => {
        weekSchedules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderSchedule();
    }, (error) => {
        console.error("Error listening to schedules: ", error);
        scheduleContainer.innerHTML = `<p class="text-center text-red-500 p-8">Lỗi khi tải dữ liệu. Vui lòng thử lại.</p>`;
    });
}

// --- CRUD ACTIONS ---
const handleFormSubmit = async (e, col, idField, data) => {
    e.preventDefault();
    const id = document.getElementById(idField).value;
    try {
        if (id) {
            await updateDoc(doc(col, id), data);
            showAlert("Cập nhật thành công!");
        } else {
            await addDoc(col, data);
            showAlert("Lưu thành công!");
        }
        clearForm(e.target.id);
    } catch (error) {
        console.error("Error saving document: ", error);
        showAlert("Đã xảy ra lỗi khi lưu.");
    }
};

const deleteItem = async (id, col, itemName) => {
    if (await showConfirm(`Bạn có chắc muốn xóa ${itemName} này?`)) {
        try {
            await deleteDoc(doc(col, id));
            showAlert(`Đã xóa ${itemName}.`);
        } catch (error) {
            console.error(`Error deleting ${itemName}: `, error);
            showAlert(`Lỗi khi xóa ${itemName}.`);
        }
    }
};

// --- ROOMS ---
window.editRoom = (id) => {
    const item = allRooms.find(r => r.id === id);
    if (item) {
        document.getElementById('room-id').value = item.id;
        document.getElementById('room-name').value = item.name;
        document.getElementById('room-description').value = item.description;
    }
};
window.deleteRoom = (id) => deleteItem(id, roomsCol, 'phòng');

// --- TIMESLOTS ---
window.editTimeSlot = (id) => {
    const item = allTimeSlots.find(r => r.id === id);
    if (item) {
        document.getElementById('timeslot-id').value = item.id;
        document.getElementById('timeslot-start').value = item.startTime;
        document.getElementById('timeslot-end').value = item.endTime;
    }
};
window.deleteTimeSlot = (id) => deleteItem(id, timeSlotsCol, 'khung giờ');

// --- GENERIC (Classes, Lecturers) ---
const editGenericItem = (id, items, idField, valueField, valueProp) => {
    const item = items.find(i => i.id === id);
    if (item) {
        document.getElementById(idField).value = item.id;
        document.getElementById(valueField).value = item[valueProp];
    }
};
window.editClassName = (id) => editGenericItem(id, allClassNames, 'class-id', 'class-name', 'value');
window.deleteClassName = (id) => deleteItem(id, classNamesCol, 'lớp học phần');
window.editLecturer = (id) => editGenericItem(id, allLecturers, 'lecturer-id', 'lecturer-name', 'value');
window.deleteLecturer = (id) => deleteItem(id, lecturersCol, 'giảng viên');


// --- BOOKING MODAL & SUBMISSION ---
window.openBookingModal = (dateString, roomId) => {
    const room = allRooms.find(r => r.id === roomId);
    if (!room) {
        showAlert("Phòng không hợp lệ.");
        return;
    }
    const date = new Date(dateString);
    const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const dayName = days[date.getUTCDay()];

    document.getElementById('booking-info').textContent = `Phòng: ${room.name} - Ngày: ${dayName}, ${formatDateToDDMMYYYY(date)}`;
    document.getElementById('booking-date').value = dateString;
    document.getElementById('booking-room-id').value = roomId;
    document.getElementById('booking-form').reset();

    // Populate dropdowns
    const populateSelect = (selectId, items, valueProp, textProp) => {
        const select = document.getElementById(selectId);
        select.innerHTML = `<option value="">-- Chọn --</option>`;
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item[valueProp];
            option.textContent = textProp ? item[textProp] : item[valueProp];
            select.appendChild(option);
        });
    };
    
    const timeSlotSelect = document.getElementById('booking-timeslot');
    timeSlotSelect.innerHTML = `<option value="">-- Chọn --</option>`;
    allTimeSlots.forEach(slot => {
        const option = document.createElement('option');
        option.value = `${slot.startTime}|${slot.endTime}`;
        option.textContent = `${slot.startTime} - ${slot.endTime}`;
        timeSlotSelect.appendChild(option);
    });

    populateSelect('booking-class-name', allClassNames, 'value');
    populateSelect('booking-lecturer-name', allLecturers, 'value');

    closeModal('booking-details-modal');
    closeModal('management-modal');
    document.getElementById('booking-modal').style.display = 'flex';
};

async function handleBookingFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i> Đang xử lý...`;

    const bookingRoomId = document.getElementById('booking-room-id').value;
    const timeSlotValue = document.getElementById('booking-timeslot').value;
    const className = document.getElementById('booking-class-name').value;
    const lecturerName = document.getElementById('booking-lecturer-name').value;
    const content = document.getElementById('booking-content').value;
    const repeatType = document.getElementById('booking-repeat-type').value;
    const repeatCount = parseInt(document.getElementById('booking-repeat-count').value) || 1;
    
    if (!timeSlotValue || !className || !lecturerName || !content) {
        showAlert("Vui lòng điền đầy đủ thông tin.");
        submitButton.disabled = false;
        submitButton.innerHTML = `<i class="fas fa-check-circle mr-2"></i> Xác nhận Đăng ký`;
        return;
    }

    const [newStartTime, newEndTime] = timeSlotValue.split('|');
    const originalDate = new Date(document.getElementById('booking-date').value);
    const seriesId = repeatType !== 'none' ? Date.now().toString() : null;
    
    const bookingsToCreate = [];
    let createdCount = 0;
    let weekOffset = 0;

    while (createdCount < repeatCount) {
        const targetDate = new Date(originalDate);
        targetDate.setDate(targetDate.getDate() + weekOffset * 7);

        const { weekNumber } = getWeekInfo(targetDate);
        const dateString = formatDateToYYYYMMDD(targetDate);

        let shouldBook = false;
        if (repeatType === 'none' || repeatType === 'weekly') {
            shouldBook = true;
        } else if (repeatType === 'even' && weekNumber % 2 === 0) {
            shouldBook = true;
        } else if (repeatType === 'odd' && weekNumber % 2 !== 0) {
            shouldBook = true;
        }
        
        if (shouldBook) {
            // Check for conflicts
            const q = query(schedulesCol, where("date", "==", dateString), where("roomId", "==", bookingRoomId));
            const querySnapshot = await getDocs(q);
            const bookingsForDay = querySnapshot.docs.map(doc => doc.data());
            const isConflict = bookingsForDay.some(existingBooking =>
                (newStartTime < existingBooking.endTime) && (newEndTime > existingBooking.startTime)
            );

            if (isConflict) {
                showAlert(`Lịch bị trùng vào ngày ${formatDateToDDMMYYYY(targetDate)}. Vui lòng chọn khung giờ khác. Đã dừng đăng ký.`);
                submitButton.disabled = false;
                submitButton.innerHTML = `<i class="fas fa-check-circle mr-2"></i> Xác nhận Đăng ký`;
                return;
            }

            const { startDate: weekStartDate } = getWeekInfo(targetDate);
            const weekId = formatDateToYYYYMMDD(weekStartDate);

            const bookingData = {
                roomId: bookingRoomId,
                weekId: weekId,
                date: dateString,
                startTime: newStartTime,
                endTime: newEndTime,
                className,
                lecturerName,
                content,
                bookedByUid: currentUserInfo.uid,
                bookedByEmail: currentUserInfo.email,
                createdAt: new Date()
            };
            if(seriesId) bookingData.seriesId = seriesId;

            bookingsToCreate.push(bookingData);
            createdCount++;
        }
        
        weekOffset++;
        if (weekOffset > 100) { // Safety break to prevent infinite loops
            showAlert("Không thể tìm thấy đủ tuần hợp lệ trong 100 tuần tới. Vui lòng kiểm tra lại.");
            break;
        }
    }

    // Write data using a batch
    try {
        const batch = writeBatch(db);
        bookingsToCreate.forEach(booking => {
            const docRef = doc(collection(db, schedulesCol.path));
            batch.set(docRef, booking);
        });
        await batch.commit();
        
        showAlert(`Đăng ký thành công ${bookingsToCreate.length} lịch!`);
        closeModal('booking-modal');
    } catch (error) {
        console.error("Error creating bookings: ", error);
        showAlert("Đã xảy ra lỗi trong quá trình đăng ký.");
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = `<i class="fas fa-check-circle mr-2"></i> Xác nhận Đăng ký`;
    }
}


window.showBookingDetails = (bookingId) => {
    const booking = weekSchedules.find(s => s.id === bookingId);
    if (!booking) return;

    const date = new Date(booking.date);
    const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const dayName = days[date.getUTCDay()];
    const room = allRooms.find(r => r.id === booking.roomId);

    document.getElementById('booking-details-content').innerHTML = `
        <p><strong>Phòng:</strong> ${room?.name || 'N/A'}</p>
        <p><strong>Ngày:</strong> ${dayName}, ${formatDateToDDMMYYYY(date)}</p>
        <p><strong>Thời gian:</strong> ${booking.startTime} - ${booking.endTime}</p>
        <p><strong>Lớp học phần:</strong> ${booking.className}</p>
        <p><strong>Giảng viên:</strong> ${booking.lecturerName}</p>
        <p><strong>Nội dung:</strong> ${booking.content}</p>
        <p class="text-sm text-gray-500 mt-2">Đăng ký bởi: ${booking.bookedByEmail}</p>
        ${booking.seriesId ? '<p class="text-sm text-yellow-600 mt-2"><i class="fas fa-sync-alt"></i> Lịch này thuộc một chuỗi lặp lại.</p>' : ''}
    `;

    const deleteBtn = document.getElementById('delete-booking-btn');
    deleteBtn.dataset.id = bookingId;
    
    if (currentUserInfo.role === 'admin' || currentUserInfo.uid === booking.bookedByUid) {
        deleteBtn.style.display = 'block';
    } else {
        deleteBtn.style.display = 'none';
    }

    closeModal('booking-modal');
    closeModal('management-modal');
    document.getElementById('booking-details-modal').style.display = 'flex';
};

// --- DELETE LOGIC ---

async function handleDeleteRequest() {
    const bookingId = this.dataset.id;
    closeModal('booking-details-modal');

    try {
        const bookingDocRef = doc(schedulesCol, bookingId);
        const bookingDoc = await getDoc(bookingDocRef);

        if (!bookingDoc.exists()) {
            showAlert("Không tìm thấy lịch để xóa hoặc lịch đã bị xóa.");
            return;
        }
        
        const bookingData = bookingDoc.data();

        if (bookingData.seriesId) {
            const modal = document.getElementById('delete-series-confirm-modal');
            document.getElementById('delete-series-btn-one').onclick = () => performDeleteSingleBooking(bookingId);
            document.getElementById('delete-series-btn-future').onclick = () => performDeleteFutureBookings(bookingData.seriesId, bookingData.date);
            modal.style.display = 'flex';
        } else {
            if (await showConfirm("Bạn có chắc muốn hủy lịch đăng ký này?")) {
                performDeleteSingleBooking(bookingId, false);
            }
        }
    } catch (error) {
        console.error("Error fetching booking for deletion:", error);
        showAlert("Đã xảy ra lỗi khi chuẩn bị xóa lịch.");
    }
}

async function performDeleteSingleBooking(bookingId, closeModalFirst = true) {
    if (closeModalFirst) closeModal('delete-series-confirm-modal');
    try {
        await deleteDoc(doc(schedulesCol, bookingId));
        showAlert("Đã hủy lịch thành công.");
    } catch (error) {
        showAlert("Lỗi khi hủy lịch.");
        console.error("Error deleting single booking:", error);
    }
}

async function performDeleteFutureBookings(seriesId, fromDate) {
    closeModal('delete-series-confirm-modal');
    try {
        const q = query(schedulesCol, where("seriesId", "==", seriesId), where("date", ">=", fromDate));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            showAlert("Không tìm thấy lịch lặp lại nào trong tương lai để xóa.");
            return;
        }

        const batch = writeBatch(db);
        snapshot.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        showAlert(`Đã hủy thành công ${snapshot.docs.length} lịch lặp lại.`);
    } catch (error) {
        showAlert("Lỗi khi hủy chuỗi lịch.");
        console.error("Error deleting future bookings:", error);
    }
}

// --- MASS ACTIONS ---
window.handleBookingSelection = (event) => {
    const bookingId = event.target.value;
    if (event.target.checked) {
        selectedBookings.add(bookingId);
    } else {
        selectedBookings.delete(bookingId);
    }
    updateMassActionUI();
};

function updateMassActionUI() {
    if (selectedBookings.size > 0) {
        selectionCounter.textContent = `Đã chọn: ${selectedBookings.size}`;
        massActionToolbar.classList.remove('hidden');
    } else {
        massActionToolbar.classList.add('hidden');
    }
}

async function handleMassDelete() {
    if (selectedBookings.size === 0) {
        showAlert("Vui lòng chọn ít nhất một lịch để xóa.");
        return;
    }

    if (await showConfirm(`Bạn có chắc muốn xóa ${selectedBookings.size} lịch đã chọn?`)) {
        try {
            const batch = writeBatch(db);
            selectedBookings.forEach(bookingId => {
                batch.delete(doc(schedulesCol, bookingId));
            });
            await batch.commit();
            showAlert(`Đã xóa thành công ${selectedBookings.size} lịch.`);
            selectedBookings.clear();
            updateMassActionUI();
        } catch (error) {
            console.error("Error during mass deletion: ", error);
            showAlert("Đã xảy ra lỗi khi xóa hàng loạt.");
        }
    }
}


// --- PRINTING LOGIC ---
function openPrintOptionsModal() {
    const currentRoomNameSpan = document.getElementById('print-current-room-name');
    const printCurrentRadio = document.getElementById('print-current');
    
    // Setup for printing by room
    if (selectedRoomId && selectedRoomId !== 'all') {
        const currentRoom = allRooms.find(r => r.id === selectedRoomId);
        currentRoomNameSpan.textContent = currentRoom ? currentRoom.name : 'N/A';
        printCurrentRadio.disabled = false;
        printCurrentRadio.checked = true;
    } else {
        currentRoomNameSpan.textContent = '(Không có phòng nào được chọn)';
        printCurrentRadio.disabled = true;
        document.getElementById('print-all').checked = true;
    }
    
    document.getElementById('print-room-selection-list').style.display = 'none';
    document.querySelectorAll('input[name="print-option"]').forEach(radio => {
        if(radio.checked) {
            const event = new Event('change');
            radio.dispatchEvent(event);
        }
    });
    renderPrintRoomSelectionList();

    // Setup for printing by lecturer (admin only)
    if (currentUserInfo && currentUserInfo.role === 'admin') {
        const lecturerSelect = document.getElementById('print-lecturer-select');
        lecturerSelect.innerHTML = '<option value="">-- Chọn giảng viên --</option>';
        allLecturers.forEach(lecturer => {
            lecturerSelect.innerHTML += `<option value="${lecturer.value}">${lecturer.value}</option>`;
        });

        if (!printLecturerDatePickerInstance) {
            printLecturerDatePickerInstance = flatpickr("#print-lecturer-start-week", {
                weekNumbers: true,
                defaultDate: currentWeekStartDate,
                 onChange: (selectedDates, dateStr, instance) => {
                    const { startDate, weekNumber } = getWeekInfo(selectedDates[0]);
                    const endDate = new Date(new Date(startDate).setDate(startDate.getDate() + 6));
                    instance.input.value = `Tuần ${weekNumber} (${formatDateToDDMMYYYY(startDate)})`;
                },
                onReady: (selectedDates, dateStr, instance) => {
                     const { startDate, weekNumber } = getWeekInfo(instance.now);
                     instance.input.value = `Tuần ${weekNumber} (${formatDateToDDMMYYYY(startDate)})`;
                }
            });
        }
        printLecturerDatePickerInstance.set('defaultDate', currentWeekStartDate);
    }

    document.getElementById('print-options-modal').style.display = 'flex';
}

function renderPrintRoomSelectionList() {
    const container = document.getElementById('print-room-selection-list');
    container.innerHTML = '';
    allRooms.forEach(room => {
        container.innerHTML += `
            <div>
                <input type="checkbox" id="print-room-${room.id}" value="${room.id}" class="mr-2 print-room-checkbox">
                <label for="print-room-${room.id}">${room.name}</label>
            </div>
        `;
    });
}

async function generatePrintableViewByRoom() {
    const printOption = document.querySelector('input[name="print-option"]:checked').value;
    let roomsToPrint = [];

    if (printOption === 'current') {
        if (!selectedRoomId || selectedRoomId === 'all') {
            showAlert("Vui lòng chọn một phòng cụ thể để in.");
            return;
        }
        const currentRoom = allRooms.find(r => r.id === selectedRoomId);
        if (currentRoom) roomsToPrint.push(currentRoom);
    } else if (printOption === 'all') {
        roomsToPrint = [...allRooms];
    } else if (printOption === 'multiple') {
        const selectedCheckboxes = document.querySelectorAll('#print-room-selection-list input:checked');
        if (selectedCheckboxes.length === 0) {
            showAlert("Vui lòng chọn ít nhất một phòng để in.");
            return;
        }
        selectedCheckboxes.forEach(cb => {
            const room = allRooms.find(r => r.id === cb.value);
            if (room) roomsToPrint.push(room);
        });
    }

    if (roomsToPrint.length === 0) {
        showAlert("Không có phòng nào hợp lệ được chọn để in.");
        return;
    }

    const { weekNumber, weekDates, startDate } = getWeekInfo(currentWeekStartDate);
    const endDate = new Date(new Date(startDate).setDate(startDate.getDate() + 6));
    const daysOfWeek = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];
    
    let contentHtml = '';

    if (printOption === 'all' || printOption === 'multiple') {
        let tableHeaderHtml = `<thead><tr><th class="room-name-cell">Phòng</th>`;
        weekDates.forEach((date, index) => {
            tableHeaderHtml += `<th>${daysOfWeek[index]}<br>${formatDateToDDMMYYYY(date)}</th>`;
        });
        tableHeaderHtml += '</tr></thead>';

        let tableBodyHtml = '<tbody>';
        roomsToPrint.forEach(room => {
            tableBodyHtml += `<tr><td class="room-name-cell">${room.name}</td>`;
            weekDates.forEach(date => {
                const dateString = formatDateToYYYYMMDD(date);
                const dayBookings = weekSchedules
                    .filter(s => s.date === dateString && s.roomId === room.id)
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));
                let bookingsHtml = dayBookings.map(booking => `
                    <div class="schedule-booking">
                        <p class="font-bold">${booking.startTime} - ${booking.endTime}</p>
                        <p>${booking.className}</p>
                        <p class="text-xs">${booking.lecturerName}</p>
                        <p class="text-xs" style="font-style: italic;">ND: ${booking.content || ''}</p>
                    </div>
                `).join('');
                tableBodyHtml += `<td><div class="booking-container">${bookingsHtml || ''}</div></td>`;
            });
            tableBodyHtml += '</tr>';
        });
        tableBodyHtml += '</tbody>';

        const pageDate = startDate;
        const formattedPageDate = `ngày ${pageDate.getDate()} tháng ${pageDate.getMonth() + 1} năm ${pageDate.getFullYear()}`;

        contentHtml = `
            <div class="page">
                <div class="print-header">
                    <div class="school-info">
                        <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRjTnSBGofmGpcMY_uEoXhgAB-FeeLjVslu1A&s" alt="Logo HPU">
                        <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQpzh7trviplRC5G2r75APp6H3wcTnXVixU-Q&s" alt="Logo FIT">
                    </div>
                    <div class="motto">
                        <p><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong></p>
                        <p><strong>Độc lập - Tự do - Hạnh phúc</strong></p>
                        <hr>
                    </div>
                </div>
                <h1 class="title">LỊCH THỰC HÀNH CÁC PHÒNG MÁY<br>
                    Tuần ${weekNumber} (từ ngày ${formatDateToDDMMYYYY(startDate)} đến ngày ${formatDateToDDMMYYYY(endDate)})
                </h1>
                <p style="text-align: right; font-style: italic; margin-bottom: 15px;">Hải Phòng, ${formattedPageDate}</p>
                <table class="schedule-table all-rooms-print">${tableHeaderHtml}${tableBodyHtml}</table>
                <div class="footer-container">
                    <div class="signature-block"><h4 contenteditable="true">BAN CHỦ NHIỆM KHOA</h4><p contenteditable="true"></p></div>
                    <div class="signature-block"><h4 contenteditable="true">TỔ BỘ MÔN</h4><p contenteditable="true"></p></div>
                    <div class="signature-block"><h4 contenteditable="true">NGƯỜI LẬP</h4><p contenteditable="true"></p></div>
                </div>
            </div>
        `;
    } else { 
        roomsToPrint.forEach(room => {
            let tableBodyHtml = '';
            weekDates.forEach((date) => {
                const dateString = formatDateToYYYYMMDD(date);
                const dayBookings = weekSchedules
                    .filter(s => s.date === dateString && s.roomId === room.id)
                    .sort((a, b) => a.startTime.localeCompare(b.startTime));
                let bookingsHtml = dayBookings.map(booking => `
                    <div class="schedule-booking">
                        <p class="font-bold">${booking.startTime} - ${booking.endTime}</p>
                        <p>${booking.className}</p>
                        <p class="text-xs">${booking.lecturerName}</p>
                        <p class="text-xs" style="font-style: italic;">ND: ${booking.content || ''}</p>
                    </div>
                `).join('');
                tableBodyHtml += `<td><div class="booking-container">${bookingsHtml || ''}</div></td>`;
            });

            const pageDate = startDate;
            const formattedPageDate = `ngày ${pageDate.getDate()} tháng ${pageDate.getMonth() + 1} năm ${pageDate.getFullYear()}`;

            contentHtml += `
            <div class="page">
                <div class="print-header">
                    <div class="school-info">
                        <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRjTnSBGofmGpcMY_uEoXhgAB-FeeLjVslu1A&s" alt="Logo HPU">
                        <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQpzh7trviplRC5G2r75APp6H3wcTnXVixU-Q&s" alt="Logo FIT">
                    </div>
                    <div class="motto">
                        <p><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong></p>
                        <p><strong>Độc lập - Tự do - Hạnh phúc</strong></p>
                        <hr>
                    </div>
                </div>
                <h1 class="title">LỊCH THỰC HÀNH PHÒNG MÁY<br>
                    Phòng: ${room.name}<br>
                    Tuần ${weekNumber} (từ ngày ${formatDateToDDMMYYYY(startDate)} đến ngày ${formatDateToDDMMYYYY(endDate)})
                </h1>
                <p style="text-align: right; font-style: italic; margin-bottom: 15px;">Hải Phòng, ${formattedPageDate}</p>
                <table class="schedule-table">
                    <thead><tr>${daysOfWeek.map((day, index) => `<th>${day}<br>${formatDateToDDMMYYYY(weekDates[index])}</th>`).join('')}</tr></thead>
                    <tbody><tr>${tableBodyHtml}</tr></tbody>
                </table>
                <div class="footer-container">
                    <div class="signature-block"><h4 contenteditable="true">BAN CHỦ NHIỆM KHOA</h4><p contenteditable="true"></p></div>
                    <div class="signature-block"><h4 contenteditable="true">TỔ BỘ MÔN</h4><p contenteditable="true"></p></div>
                    <div class="signature-block"><h4 contenteditable="true">NGƯỜI LẬP</h4><p contenteditable="true"></p></div>
                </div>
            </div>`;
        });
    }

    openPrintWindow(contentHtml, `Lịch thực hành tuần ${weekNumber}`);
    closeModal('print-options-modal');
}

async function generatePrintableViewByLecturer() {
    const lecturerName = document.getElementById('print-lecturer-select').value;
    const numWeeks = parseInt(document.getElementById('print-lecturer-num-weeks').value) || 1;
    const selectedStartDate = printLecturerDatePickerInstance.selectedDates[0];

    if (!lecturerName) {
        showAlert("Vui lòng chọn một giảng viên để in lịch.");
        return;
    }
    if (!selectedStartDate) {
        showAlert("Vui lòng chọn tuần bắt đầu.");
        return;
    }

    showAlert("Đang chuẩn bị dữ liệu in, vui lòng chờ...");

    try {
        let allBookings = [];
        let currentWeekStart = getWeekInfo(selectedStartDate).startDate;

        for (let i = 0; i < numWeeks; i++) {
            const weekId = formatDateToYYYYMMDD(currentWeekStart);
            const q = query(schedulesCol, where("weekId", "==", weekId), where("lecturerName", "==", lecturerName));
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach(doc => {
                allBookings.push({ id: doc.id, ...doc.data() });
            });
            // Move to the next week
            currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        }

        if (allBookings.length === 0) {
            showAlert(`Không tìm thấy lịch thực hành nào cho giảng viên "${lecturerName}" trong ${numWeeks} tuần đã chọn.`);
            return;
        }

        // Sort bookings by date and time
        allBookings.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

        // Group bookings by week
        const bookingsByWeek = allBookings.reduce((acc, booking) => {
            const weekInfo = getWeekInfo(new Date(booking.date));
            const weekKey = `Tuần ${weekInfo.weekNumber} (từ ${formatDateToDDMMYYYY(weekInfo.startDate)} đến ${formatDateToDDMMYYYY(new Date(new Date(weekInfo.startDate).setDate(weekInfo.startDate.getDate() + 6)))})`;
            if (!acc[weekKey]) {
                acc[weekKey] = [];
            }
            acc[weekKey].push(booking);
            return acc;
        }, {});

        const daysOfWeek = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
        let contentHtml = '';
        const pageDate = new Date();
        const formattedPageDate = `ngày ${pageDate.getDate()} tháng ${pageDate.getMonth() + 1} năm ${pageDate.getFullYear()}`;

        for (const weekKey in bookingsByWeek) {
            const weekBookings = bookingsByWeek[weekKey];
            let tableBodyHtml = '';
            weekBookings.forEach(booking => {
                const date = new Date(booking.date);
                const room = allRooms.find(r => r.id === booking.roomId);
                tableBodyHtml += `
                    <tr>
                        <td>${daysOfWeek[date.getUTCDay()]}</td>
                        <td>${formatDateToDDMMYYYY(date)}</td>
                        <td>${booking.startTime} - ${booking.endTime}</td>
                        <td>${room?.name || 'N/A'}</td>
                        <td>${booking.className}</td>
                        <td>${booking.content}</td>
                    </tr>
                `;
            });

            contentHtml += `
                <div class="page">
                    <div class="print-header">
                        <div class="school-info">
                             <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRjTnSBGofmGpcMY_uEoXhgAB-FeeLjVslu1A&s" alt="Logo HPU">
                             <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQpzh7trviplRC5G2r75APp6H3wcTnXVixU-Q&s" alt="Logo FIT">
                        </div>
                        <div class="motto">
                            <p><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong></p>
                            <p><strong>Độc lập - Tự do - Hạnh phúc</strong></p>
                            <hr>
                        </div>
                    </div>
                    <h1 class="title">LỊCH GIẢNG DẠY THỰC HÀNH<br>
                        Giảng viên: ${lecturerName}<br>
                        ${weekKey}
                    </h1>
                    <p style="text-align: right; font-style: italic; margin-bottom: 15px;">Hải Phòng, ${formattedPageDate}</p>
                    <table class="schedule-table lecturer-print">
                        <thead>
                            <tr>
                                <th>Thứ</th>
                                <th>Ngày</th>
                                <th>Thời gian</th>
                                <th>Phòng</th>
                                <th>Lớp học phần</th>
                                <th>Nội dung</th>
                            </tr>
                        </thead>
                        <tbody>${tableBodyHtml}</tbody>
                    </table>
                    <div class="footer-container">
                        <div class="signature-block"><h4 contenteditable="true">BAN CHỦ NHIỆM KHOA</h4><p contenteditable="true"></p></div>
                        <div class="signature-block"><h4 contenteditable="true">TỔ BỘ MÔN</h4><p contenteditable="true"></p></div>
                        <div class="signature-block"><h4 contenteditable="true">NGƯỜI LẬP</h4><p contenteditable="true"></p></div>
                    </div>
                </div>
            `;
        }

        openPrintWindow(contentHtml, `Lịch giảng dạy của ${lecturerName}`);
        closeModal('print-options-modal');
        closeModal('alert-modal'); // Close the "loading" alert

    } catch (error) {
        console.error("Error generating lecturer print view:", error);
        showAlert("Đã có lỗi xảy ra khi tạo bản in. Vui lòng thử lại.");
    }
}


function openPrintWindow(contentHtml, title) {
     const printHtml = `
        <!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8">
        <title>${title}</title>
        <style>
            body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; margin: 0; }
            .page { padding: 2cm; width: 29.7cm; min-height: 20.9cm; box-sizing: border-box; page-break-after: always; margin: 0 auto; display: flex; flex-direction: column; }
            .page:last-child { page-break-after: auto; }
            .print-header { display: flex; justify-content: space-between; align-items: center; text-align: center; font-weight: bold; }
            .print-header .school-info { flex: 1; text-align: left; }
            .print-header .school-info img { height: 60px; vertical-align: middle; margin-right: 10px; }
            .print-header .motto { flex: 1; text-align: center; }
            .print-header .motto hr { width: 50%; margin: 2px auto; border-top: 1px solid black; }
            .title { text-align: center; font-weight: bold; font-size: 16pt; margin: 20px 0; line-height: 1.4; }
            .schedule-table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 11pt; }
            .schedule-table th, .schedule-table td { border: 1px solid black; text-align: center; padding: 5px; vertical-align: top; }
            .schedule-table th { font-weight: bold; }
            .schedule-table.all-rooms-print .room-name-cell { font-weight: bold; text-align: left; padding-left: 8px; vertical-align: middle; width: 12%;}
            .schedule-table.lecturer-print td { text-align: left; padding-left: 8px; }
            .booking-container { min-height: 100px; height: 100%; overflow: hidden; display: flex; flex-direction: column; gap: 4px; }
            .schedule-booking { border: 1px solid #ccc; padding: 4px; border-radius: 4px; font-size: 10pt; text-align: left; margin-bottom: 2px; }
            .schedule-booking .font-bold { font-weight: bold; }
            .footer-container { display: flex; justify-content: space-around; margin-top: auto; padding-top: 30px; text-align: center; font-weight: bold; width: 100%; }
            .signature-block { width: 30%; }
            .signature-block p { margin-top: 60px; }
            .print-button { position: fixed; top: 10px; right: 10px; padding: 8px 12px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; z-index: 1000; }
            @media print { .print-button { display: none; } .page { padding: 1.5cm; height: auto; min-height: 0;} }
        </style></head><body>
        <button class="print-button" onclick="window.print()">In Lịch</button>
        ${contentHtml}
        </body></html>`;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printHtml);
    printWindow.document.close();
}


// --- INITIALIZATION ---
function addEventListeners() {
    // Initialize Flatpickr
    flatpickr.localize(flatpickr.l10ns.vn);
    datePickerInstance = flatpickr(datePickerInput, {
        weekNumbers: true,
        onChange: (selectedDates) => {
            if (selectedDates.length > 0) setWeek(selectedDates[0]);
        },
        onReady: () => updateDatePickerDisplay()
    });

    roomSelector.addEventListener('change', (e) => {
        selectedRoomId = e.target.value;
        listenForSchedules();
    });
    
    document.getElementById('manage-data-btn').addEventListener('click', () => {
        document.getElementById('management-modal').style.display = 'flex';
    });

    // Form Submissions
    document.getElementById('room-form').addEventListener('submit', (e) => handleFormSubmit(e, roomsCol, 'room-id', { name: e.target.elements['room-name'].value, description: e.target.elements['room-description'].value }));
    document.getElementById('timeslot-form').addEventListener('submit', (e) => handleFormSubmit(e, timeSlotsCol, 'timeslot-id', { startTime: e.target.elements['timeslot-start'].value, endTime: e.target.elements['timeslot-end'].value }));
    document.getElementById('class-form').addEventListener('submit', (e) => handleFormSubmit(e, classNamesCol, 'class-id', { value: e.target.elements['class-name'].value }));
    document.getElementById('lecturer-form').addEventListener('submit', (e) => handleFormSubmit(e, lecturersCol, 'lecturer-id', { value: e.target.elements['lecturer-name'].value }));
    
    document.getElementById('booking-form').addEventListener('submit', handleBookingFormSubmit);
    document.getElementById('delete-booking-btn').addEventListener('click', handleDeleteRequest);
    document.getElementById('alert-ok-btn').addEventListener('click', () => closeModal('alert-modal'));
    document.getElementById('delete-series-btn-cancel').addEventListener('click', () => closeModal('delete-series-confirm-modal'));
    
    // Mass Action Listener
    massDeleteBtn.addEventListener('click', handleMassDelete);

    // Print Listeners
    document.getElementById('print-schedule-btn').addEventListener('click', openPrintOptionsModal);
    document.getElementById('confirm-print-by-room-btn').addEventListener('click', generatePrintableViewByRoom);
    document.getElementById('confirm-print-by-lecturer-btn').addEventListener('click', generatePrintableViewByLecturer);
    
    document.querySelectorAll('input[name="print-option"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.getElementById('print-room-selection-list').style.display = e.target.value === 'multiple' ? 'block' : 'none';
        });
    });
}

function initializePage() {
    mainContent.classList.remove('hidden');
    currentWeekStartDate = new Date();
    addEventListeners();
    updateUIForRole();

    // Start all listeners
    createListener(roomsCol, allRooms, () => {
        renderList('rooms-list-container', allRooms, 'name', 'description', 'editRoom', 'deleteRoom');
        renderRoomSelector();
        if (selectedRoomId === null && allRooms.length > 0) {
            selectedRoomId = allRooms[0].id;
        }
        listenForSchedules(); // Reload schedules when rooms change
    });
    createListener(timeSlotsCol, allTimeSlots, () => {
        const transformedSlots = allTimeSlots.map(s => ({...s, display: `${s.startTime} - ${s.endTime}`}));
        renderList('timeslots-list-container', transformedSlots, 'display', null, 'editTimeSlot', 'deleteTimeSlot');
    });
    createListener(classNamesCol, allClassNames, () => renderList('classes-list-container', allClassNames, 'value', null, 'editClassName', 'deleteClassName'));
    createListener(lecturersCol, allLecturers, () => renderList('lecturers-list-container', allLecturers, 'value', null, 'editLecturer', 'deleteLecturer'));
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(usersCol, user.uid));
        currentUserInfo = userDoc.exists() 
            ? { uid: user.uid, ...userDoc.data() } 
            : { uid: user.uid, email: user.email, role: 'viewer' };
        initializePage();
    } else {
        mainContent.innerHTML = '<p class="text-center text-red-500">Vui lòng đăng nhập để sử dụng chức năng này.</p>';
        mainContent.classList.remove('hidden');
    }
});
