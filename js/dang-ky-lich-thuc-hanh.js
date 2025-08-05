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
const roomsCol = collection(db, `${basePath}/practice_rooms`);
const schedulesCol = collection(db, `${basePath}/practice_schedules`);

// --- GLOBAL STATE ---
let currentUserInfo = null;
let allRooms = [];
let weekSchedules = [];
let currentWeekStartDate = null;
let selectedRoomId = null;
let scheduleListener = null; // To hold the unsubscribe function for the schedule listener

// --- UI ELEMENTS ---
const mainContent = document.getElementById('practice-schedule-module');
const weekDisplay = document.getElementById('week-display');
const roomSelector = document.getElementById('room-selector');
const scheduleContainer = document.getElementById('schedule-container');

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
    document.getElementById(modalId).style.display = 'none';
};

const formatDateToDDMMYYYY = (d) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
const formatDateToYYYYMMDD = (d) => `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;


// --- DATE & WEEK LOGIC ---
function getWeekInfo(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay() === 0 ? 6 : d.getDay() - 1; // Monday is 0, Sunday is 6
    const startDate = new Date(d.setDate(d.getDate() - day));
    const endDate = new Date(new Date(startDate).getTime() + 6 * 24 * 60 * 60 * 1000);
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

    return { startDate, endDate, weekNumber, weekDates };
}

function updateWeekDisplay() {
    const { startDate, endDate, weekNumber } = getWeekInfo(currentWeekStartDate);
    weekDisplay.innerHTML = `
        <span class="font-bold">Tuần ${weekNumber}</span>
        <span class="text-xs text-gray-500">${formatDateToDDMMYYYY(startDate)} - ${formatDateToDDMMYYYY(endDate)}</span>
    `;
}

function changeWeek(offset) {
    currentWeekStartDate.setDate(currentWeekStartDate.getDate() + offset * 7);
    updateWeekDisplay();
    listenForSchedules();
}

// --- UI RENDERING ---
function updateUIForRole() {
    const isAdmin = currentUserInfo && currentUserInfo.role === 'admin';
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? 'flex' : 'none';
    });
}

function renderRoomSelector() {
    const currentVal = roomSelector.value;
    roomSelector.innerHTML = '<option value="">-- Vui lòng chọn phòng --</option>';
    allRooms.forEach(room => {
        const option = document.createElement('option');
        option.value = room.id;
        option.textContent = room.name;
        roomSelector.appendChild(option);
    });
    if (currentVal && allRooms.some(r => r.id === currentVal)) {
        roomSelector.value = currentVal;
    } else if (allRooms.length > 0) {
        roomSelector.value = allRooms[0].id;
        selectedRoomId = allRooms[0].id;
    }
}

function renderSchedule() {
    scheduleContainer.innerHTML = '';
    if (!selectedRoomId) {
        scheduleContainer.innerHTML = `<p class="text-center text-gray-500 p-8">Vui lòng chọn một phòng để xem lịch hoặc thêm phòng mới trong mục Quản lý.</p>`;
        return;
    }

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
            .filter(s => s.date === dateString)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

        let bookingsHtml = dayBookings.map(booking => `
            <div class="schedule-booking" onclick="window.showBookingDetails('${booking.id}')">
                <p class="font-bold truncate">${booking.startTime} - ${booking.endTime}</p>
                <p class="truncate">${booking.className}</p>
                <p class="truncate text-xs">${booking.lecturerName}</p>
            </div>
        `).join('');

        tbody += `<td>
            <div class="booking-container">
                <button class="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-3 rounded-md mb-2 text-sm" onclick="window.openBookingModal('${dateString}')">
                    <i class="fas fa-plus-circle mr-1"></i> Đăng ký
                </button>
                ${bookingsHtml}
            </div>
        </td>`;
    });
    tbody += '</tr></tbody>';
    table.innerHTML += tbody;

    scheduleContainer.appendChild(table);
}

function renderRoomManagementList() {
    const container = document.getElementById('rooms-list-container');
    container.innerHTML = '';
    if (allRooms.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 p-4">Chưa có phòng nào.</p>';
        return;
    }
    const list = document.createElement('ul');
    list.className = 'divide-y divide-gray-200';
    allRooms.forEach(room => {
        const item = document.createElement('li');
        item.className = 'py-3 flex justify-between items-center';
        item.innerHTML = `
            <div>
                <p class="font-medium text-gray-800">${room.name}</p>
                <p class="text-sm text-gray-500">${room.description}</p>
            </div>
            <div class="flex gap-3">
                <button class="text-blue-500 hover:text-blue-700" onclick="window.editRoom('${room.id}')"><i class="fas fa-edit"></i></button>
                <button class="text-red-500 hover:text-red-700" onclick="window.deleteRoom('${room.id}')"><i class="fas fa-trash"></i></button>
            </div>
        `;
        list.appendChild(item);
    });
    container.appendChild(list);
}

// --- DATA LOGIC ---
async function listenForRooms() {
    onSnapshot(query(roomsCol), (snapshot) => {
        allRooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.name.localeCompare(b.name));
        renderRoomSelector();
        renderRoomManagementList();
        if (selectedRoomId === null && allRooms.length > 0) {
            selectedRoomId = allRooms[0].id;
        }
        listenForSchedules(); // Reload schedules when rooms change
    });
}

function listenForSchedules() {
    if (scheduleListener) {
        scheduleListener(); // Unsubscribe from the old listener
    }
    if (!selectedRoomId) {
        weekSchedules = [];
        renderSchedule();
        return;
    }
    
    scheduleContainer.innerHTML = `<div class="text-center p-8"><i class="fas fa-spinner fa-spin fa-2x text-blue-500"></i><p class="mt-2">Đang tải lịch...</p></div>`;

    const { startDate } = getWeekInfo(currentWeekStartDate);
    const weekId = formatDateToYYYYMMDD(startDate);

    const q = query(schedulesCol, where("weekId", "==", weekId), where("roomId", "==", selectedRoomId));
    scheduleListener = onSnapshot(q, (snapshot) => {
        weekSchedules = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderSchedule();
    });
}

// --- EVENT HANDLERS & ACTIONS ---
function handleRoomFormSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('room-id').value;
    const name = document.getElementById('room-name').value.trim();
    const description = document.getElementById('room-description').value.trim();
    if (!name) {
        showAlert("Tên phòng không được để trống.");
        return;
    }
    const data = { name, description };
    if (id) {
        updateDoc(doc(roomsCol, id), data).then(() => {
            showAlert("Cập nhật phòng thành công!");
            clearRoomForm();
        });
    } else {
        addDoc(roomsCol, data).then(() => {
            showAlert("Lưu phòng thành công!");
            clearRoomForm();
        });
    }
}

function clearRoomForm() {
    document.getElementById('room-form').reset();
    document.getElementById('room-id').value = '';
}

window.editRoom = (id) => {
    const room = allRooms.find(r => r.id === id);
    if (room) {
        document.getElementById('room-id').value = room.id;
        document.getElementById('room-name').value = room.name;
        document.getElementById('room-description').value = room.description;
    }
};

window.deleteRoom = async (id) => {
    if (await showConfirm("Bạn có chắc muốn xóa phòng này? Tất cả lịch đã đăng ký trong phòng này cũng sẽ bị xóa.")) {
        await deleteDoc(doc(roomsCol, id));
        showAlert("Đã xóa phòng.");
    }
};

window.openBookingModal = (dateString) => {
    const date = new Date(dateString);
    const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const dayName = days[date.getUTCDay()];

    document.getElementById('booking-info').textContent = `Phòng: ${allRooms.find(r => r.id === selectedRoomId)?.name} - Ngày: ${dayName}, ${formatDateToDDMMYYYY(date)}`;
    document.getElementById('booking-date').value = dateString;
    document.getElementById('booking-form').reset();
    window.closeModal('booking-details-modal');
    window.closeModal('manage-rooms-modal');
    document.getElementById('booking-modal').style.display = 'flex';
};

async function handleBookingFormSubmit(e) {
    e.preventDefault();
    const { startDate } = getWeekInfo(currentWeekStartDate);
    const weekId = formatDateToYYYYMMDD(startDate);
    
    const newStartTime = document.getElementById('booking-start-time').value;
    const newEndTime = document.getElementById('booking-end-time').value;
    const date = document.getElementById('booking-date').value;

    // Validation
    if (!newStartTime || !newEndTime) {
        showAlert("Vui lòng chọn cả thời gian bắt đầu và kết thúc.");
        return;
    }
    if (newStartTime >= newEndTime) {
        showAlert("Thời gian kết thúc phải sau thời gian bắt đầu.");
        return;
    }

    // Conflict Check
    const bookingsForDay = weekSchedules.filter(s => s.date === date);
    const isConflict = bookingsForDay.some(existingBooking => 
        (newStartTime < existingBooking.endTime) && (newEndTime > existingBooking.startTime)
    );

    if (isConflict) {
        showAlert("Lịch bị trùng! Vui lòng chọn một khung giờ khác.");
        return;
    }

    const data = {
        roomId: selectedRoomId,
        weekId: weekId,
        date: date,
        startTime: newStartTime,
        endTime: newEndTime,
        className: document.getElementById('booking-class-name').value,
        lecturerName: document.getElementById('booking-lecturer-name').value,
        content: document.getElementById('booking-content').value,
        bookedByUid: currentUserInfo.uid,
        bookedByEmail: currentUserInfo.email,
        createdAt: new Date()
    };
    
    await addDoc(schedulesCol, data);
    showAlert("Đăng ký lịch thành công!");
    closeModal('booking-modal');
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
    `;

    const deleteBtn = document.getElementById('delete-booking-btn');
    deleteBtn.dataset.id = bookingId;
    
    if (currentUserInfo.role === 'admin' || currentUserInfo.uid === booking.bookedByUid) {
        deleteBtn.style.display = 'block';
    } else {
        deleteBtn.style.display = 'none';
    }

    window.closeModal('booking-modal');
    window.closeModal('manage-rooms-modal');
    document.getElementById('booking-details-modal').style.display = 'flex';
};

async function deleteBooking() {
    const bookingId = this.dataset.id;
    if (await showConfirm("Bạn có chắc muốn hủy lịch đăng ký này?")) {
        await deleteDoc(doc(schedulesCol, bookingId));
        showAlert("Đã hủy lịch thành công.");
        closeModal('booking-details-modal');
    }
}

// --- PRINTING LOGIC ---
function generatePrintableView() {
    if (!selectedRoomId) {
        showAlert("Vui lòng chọn một phòng để in lịch.");
        return;
    }
    const currentRoom = allRooms.find(r => r.id === selectedRoomId);
    if (!currentRoom) {
        showAlert("Không tìm thấy thông tin phòng.");
        return;
    }

    const { weekNumber, weekDates, startDate } = getWeekInfo(currentWeekStartDate);
    const roomName = currentRoom.name;
    const daysOfWeek = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

    let tableBodyHtml = '';
    weekDates.forEach((date) => {
        const dateString = formatDateToYYYYMMDD(date);
        const dayBookings = weekSchedules
            .filter(s => s.date === dateString)
            .sort((a, b) => a.startTime.localeCompare(b.startTime));

        let bookingsHtml = dayBookings.map(booking => `
            <div class="schedule-booking">
                <p class="font-bold">${booking.startTime} - ${booking.endTime}</p>
                <p>${booking.className}</p>
                <p class="text-xs">${booking.lecturerName}</p>
                <p class="text-xs" style="font-style: italic;">ND: ${booking.content || ''}</p>
            </div>
        `).join('');

        tableBodyHtml += `<td>
            <div class="booking-container">
                ${bookingsHtml || ''}
            </div>
        </td>`;
    });

    const printHtml = `
        <!DOCTYPE html>
        <html lang="vi">
        <head>
            <meta charset="UTF-8">
            <title>Lịch thực hành tuần ${weekNumber} - ${roomName}</title>
            <style>
                body { font-family: 'Times New Roman', Times, serif; font-size: 12pt; margin: 0; }
                .page { padding: 2cm; width: 29.7cm; min-height: 21cm; box-sizing: border-box; page-break-after: always; margin: 0 auto; }
                .print-header { display: flex; justify-content: space-between; align-items: center; text-align: center; font-weight: bold; }
                .print-header .school-info { flex: 1; text-align: left; }
                .print-header .school-info img { height: 60px; vertical-align: middle; margin-right: 10px; }
                .print-header .school-info p { margin: 0; font-size: 13pt; }
                .print-header .motto { flex: 1; text-align: center; }
                .print-header .motto hr { width: 50%; margin: 2px auto; border-top: 1px solid black; }
                .title { text-align: center; font-weight: bold; font-size: 16pt; margin: 30px 0; }
                .schedule-table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 11pt; }
                .schedule-table th, .schedule-table td { border: 1px solid black; text-align: center; padding: 5px; vertical-align: top; }
                .schedule-table th { font-weight: bold; }
                .schedule-table td { height: 150px; }
                .booking-container { height: 100%; overflow: hidden; display: flex; flex-direction: column; gap: 4px; }
                .schedule-booking { border: 1px solid #ccc; padding: 4px; border-radius: 4px; font-size: 10pt; text-align: left; margin-bottom: 2px; }
                .schedule-booking .font-bold { font-weight: bold; }
                .footer-container { display: flex; justify-content: space-around; margin-top: 50px; text-align: center; font-weight: bold; }
                .signature-block { width: 30%; }
                .signature-block p { margin-top: 60px; }
                .print-button { position: fixed; top: 10px; right: 10px; padding: 8px 12px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; z-index: 1000; }
                @media print {
                    .print-button { display: none; }
                    .page { padding: 1.5cm; }
                }
            </style>
        </head>
        <body>
            <button class="print-button" onclick="window.print()">In Lịch</button>
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

                <h1 class="title">LỊCH THỰC HÀNH PHÒNG MÁY<br>Tuần ${weekNumber} (Phòng: ${roomName})</h1>

                <table class="schedule-table">
                    <thead>
                        <tr>
                            ${daysOfWeek.map((day, index) => `<th>${day}<br>${formatDateToDDMMYYYY(weekDates[index])}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            ${tableBodyHtml}
                        </tr>
                    </tbody>
                </table>

                <div class="footer-container">
                    <div class="signature-block">
                        <h4 contenteditable="true">BAN CHỦ NHIỆM KHOA</h4>
                        <p contenteditable="true">      </p>
                    </div>
                    <div class="signature-block">
                        <h4 contenteditable="true">TỔ BỘ MÔN</h4>
                    </div>
                    <div class="signature-block">
                        <h4 contenteditable="true">NGƯỜI LẬP</h4>
                        
                    </div>
                </div>
                 <p style="text-align: right; font-style: italic; margin-top: 10px;">Hải Phòng, ngày ${startDate.getDate()} tháng ${startDate.getMonth() + 1} năm ${startDate.getFullYear()}</p>
            </div>
        </body>
        </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printHtml);
    printWindow.document.close();
}


// --- INITIALIZATION ---
function addEventListeners() {
    document.getElementById('prev-week-btn').addEventListener('click', () => changeWeek(-1));
    document.getElementById('next-week-btn').addEventListener('click', () => changeWeek(1));
    document.getElementById('room-selector').addEventListener('change', (e) => {
        selectedRoomId = e.target.value;
        listenForSchedules();
    });
    document.getElementById('manage-rooms-btn').addEventListener('click', () => {
        clearRoomForm();
        document.getElementById('manage-rooms-modal').style.display = 'flex';
    });
    document.getElementById('room-form').addEventListener('submit', handleRoomFormSubmit);
    document.getElementById('clear-room-form-btn').addEventListener('click', clearRoomForm);
    document.getElementById('booking-form').addEventListener('submit', handleBookingFormSubmit);
    document.getElementById('delete-booking-btn').addEventListener('click', deleteBooking);
    document.getElementById('alert-ok-btn').addEventListener('click', () => closeModal('alert-modal'));
    document.getElementById('print-schedule-btn').addEventListener('click', generatePrintableView);
}

function initializePage() {
    mainContent.classList.remove('hidden');
    currentWeekStartDate = new Date();
    updateWeekDisplay();
    updateUIForRole();
    listenForRooms(); // This will trigger the first schedule load
    addEventListeners();
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(usersCol, user.uid));
        if (userDoc.exists()) {
            currentUserInfo = { uid: user.uid, ...userDoc.data() };
        } else {
            // Fallback for users who might not have a doc in the 'users' collection
            currentUserInfo = { uid: user.uid, email: user.email, role: 'viewer' };
        }
        initializePage();
    } else {
        window.location.href = 'index.html';
    }
});
