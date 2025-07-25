// File: js/dang-ky-lich-thuc-hanh.js
// Handles all logic for the interactive practice room booking system.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore, collection, onSnapshot, addDoc, doc, getDoc,
    updateDoc, deleteDoc, query, where, writeBatch
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- GLOBAL STATE & CONSTANTS ---
let db, auth;
let roomsCol, bookingsCol, usersCol, lecturersCol;

const state = {
    currentUser: null, // { uid, email, role, lecturerName }
    currentDate: new Date(),
    rooms: [],
    bookings: [],
    selectedRoomId: null,
};

const SHIFTS = {
    "Sáng": ["Ca 1 (7h00 - 9h15)", "Ca 2 (9h15 - 11h30)"],
    "Chiều": ["Ca 3 (13h00 - 15h15)", "Ca 4 (15h15 - 17h30)"],
    "Tối": ["Ca 5 (18h00 - 19h45)", "Ca 6 (19h45 - 21h30)"]
};

// --- UI ELEMENTS ---
const loadingIndicator = document.getElementById('loading-indicator');
const scheduleGridTable = document.getElementById('schedule-grid-table');
const scheduleGridBody = document.getElementById('schedule-grid-body');
const weekTitleEl = document.getElementById('week-title');
const weekDatesEl = document.getElementById('week-dates');
const roomFilter = document.getElementById('room-filter');

// Modals
const bookingModal = document.getElementById('booking-modal');
const roomManagementModal = document.getElementById('room-management-modal');


// --- HELPER FUNCTIONS ---

/**
 * Sets a loading state on a button, disabling it and showing a spinner.
 * @param {HTMLButtonElement} button The button to modify.
 * @param {boolean} isLoading Whether to show the loading state.
 */
function setButtonLoading(button, isLoading) {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.dataset.originalHtml = button.innerHTML;
        button.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Đang lưu...`;
    } else {
        button.disabled = false;
        if (button.dataset.originalHtml) {
            button.innerHTML = button.dataset.originalHtml;
        }
    }
}

/**
 * Gets the start (Monday) and end (Sunday) dates of the week for a given date.
 * @param {Date} date The date within the desired week.
 * @returns {{start: Date, end: Date}} An object with the start and end dates.
 */
function getWeekRange(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diffToMonday = d.getDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(d.setDate(diffToMonday));
    start.setHours(0, 0, 0, 0);
    const end = new Date(new Date(start).setDate(start.getDate() + 6));
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

/**
 * Formats a date object to 'dd/mm/yyyy'.
 * @param {Date} date The date to format.
 * @returns {string} The formatted date string.
 */
function formatDate(date) {
    if (!date) return '';
    const d = new Date(date.valueOf()); // Clone to avoid mutation
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
}

/**
 * Formats a date object to 'yyyy-mm-dd' for input fields.
 * @param {Date} date The date to format.
 * @returns {string} The formatted date string.
 */
function formatDateForInput(date) {
    if (!date) return '';
    const d = new Date(date.valueOf()); // Clone to avoid mutation
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${year}-${month}-${day}`;
}

/**
 * Parses a 'YYYY-MM-DD' string into a Date object, avoiding timezone issues.
 * @param {string} dateString The date string to parse.
 * @returns {Date}
 */
function parseDateString(dateString) {
    const parts = dateString.split('-');
    // Month is 0-indexed in JavaScript Date constructor
    return new Date(parts[0], parts[1] - 1, parts[2]);
}


/**
 * Shows a custom alert using a modal.
 * @param {string} message The message to display.
 * @param {boolean} isSuccess If true, shows a success style.
 */
function showAlert(message, isSuccess = false) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content max-w-sm">
             <h3 class="text-lg font-bold mb-4 ${isSuccess ? 'text-green-600' : 'text-red-600'}">${isSuccess ? 'Thành công' : 'Thông báo'}</h3>
            <p class="mb-6">${message}</p>
            <div class="flex justify-end">
                <button class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg">OK</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.querySelector('button').onclick = () => {
        document.body.removeChild(modal);
    };
}

/**
 * Shows a custom confirmation dialog.
 * @param {string} message The confirmation message.
 * @returns {Promise<boolean>} A promise that resolves to true if confirmed, false otherwise.
 */
function showConfirm(message) {
    return new Promise(resolve => {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'block';
        modal.innerHTML = `
            <div class="modal-content max-w-sm">
                <h3 class="text-lg font-bold mb-4">Xác nhận</h3>
                <p class="mb-6">${message}</p>
                <div class="flex justify-end gap-3">
                    <button id="confirm-no" class="bg-gray-200 hover:bg-gray-300 text-black font-bold py-2 px-4 rounded-lg">Hủy</button>
                    <button id="confirm-yes" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg">Xác nhận</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const cleanup = () => document.body.removeChild(modal);

        modal.querySelector('#confirm-yes').onclick = () => {
            cleanup();
            resolve(true);
        };
        modal.querySelector('#confirm-no').onclick = () => {
            cleanup();
            resolve(false);
        };
    });
}


// --- RENDER FUNCTIONS ---

/**
 * Updates the week title and date range display in the header.
 */
function updateWeekDisplay() {
    const { start, end } = getWeekRange(state.currentDate);
    const startOfYear = new Date(start.getFullYear(), 0, 1);
    const pastDaysOfYear = (start - startOfYear) / 86400000;
    const weekNumber = Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7);

    weekTitleEl.textContent = `Tuần ${weekNumber}`;
    weekDatesEl.textContent = `${formatDate(start)} - ${formatDate(end)}`;
    renderScheduleGrid();
}

/**
 * Renders the main schedule grid structure and populates it with bookings.
 */
function renderScheduleGrid() {
    scheduleGridBody.innerHTML = '';
    loadingIndicator.style.display = 'none';
    scheduleGridTable.classList.remove('hidden');

    const { start } = getWeekRange(state.currentDate);
    const currentRoom = state.rooms.find(r => r.id === state.selectedRoomId);

    if (!currentRoom) {
        scheduleGridBody.innerHTML = `<tr><td colspan="8" class="text-center p-8 text-gray-500">Vui lòng chọn một phòng để xem lịch hoặc thêm phòng mới trong mục Quản lý.</td></tr>`;
        return;
    }
     if (currentRoom.status !== 'active') {
        scheduleGridBody.innerHTML = `<tr><td colspan="8" class="text-center p-8 text-orange-600 bg-orange-50">Phòng <strong>${currentRoom.name}</strong> đang trong trạng thái bảo trì và không thể đăng ký.</td></tr>`;
        return;
    }


    Object.entries(SHIFTS).forEach(([session, shifts]) => {
        shifts.forEach((shift, shiftIndex) => {
            const row = document.createElement('tr');
            if (shiftIndex === 0) {
                row.innerHTML = `<td class="time-slot align-middle" rowspan="${shifts.length}">${session}</td>`;
            }
            
            for (let i = 0; i < 7; i++) {
                const dayDate = new Date(start);
                dayDate.setDate(start.getDate() + i);
                const dateStr = formatDateForInput(dayDate);

                const slotCell = document.createElement('td');
                slotCell.className = 'book-slot';
                slotCell.dataset.date = dateStr;
                slotCell.dataset.session = session;
                slotCell.dataset.shift = shift;
                
                const booking = state.bookings.find(b => 
                    b.roomId === state.selectedRoomId &&
                    b.date === dateStr &&
                    b.session === session &&
                    b.shift === shift
                );

                if (booking) {
                    slotCell.dataset.bookingId = booking.id;
                    const statusClasses = {
                        pending: 'slot-pending',
                        approved: 'slot-approved',
                        rejected: 'slot-rejected'
                    };
                    slotCell.classList.add(statusClasses[booking.status] || '');
                    slotCell.innerHTML = `
                        <div class="p-1 text-xs">
                            <p class="font-bold truncate">${booking.subject}</p>
                            <p class="truncate">${booking.lecturerName}</p>
                            <p class="truncate">${booking.className}</p>
                        </div>
                    `;
                }
                row.appendChild(slotCell);
            }
            scheduleGridBody.appendChild(row);
        });
    });
}


/**
 * Populates the room filter dropdown.
 */
function populateRoomFilter() {
    const currentSelectedId = roomFilter.value;
    roomFilter.innerHTML = '';
    if (state.rooms.length === 0) {
        roomFilter.innerHTML = '<option value="">Chưa có phòng nào</option>';
        state.selectedRoomId = null;
        renderScheduleGrid();
        return;
    }
    
    state.rooms
        .forEach(room => {
            const option = document.createElement('option');
            option.value = room.id;
            option.textContent = `${room.name}`;
            if (room.status !== 'active') {
                option.textContent += ` (Bảo trì)`;
            }
            roomFilter.appendChild(option);
        });
    
    if (currentSelectedId && state.rooms.some(r => r.id === currentSelectedId)) {
        roomFilter.value = currentSelectedId;
        state.selectedRoomId = currentSelectedId;
    } else {
        const firstRoom = state.rooms[0];
        state.selectedRoomId = firstRoom ? firstRoom.id : null;
        roomFilter.value = state.selectedRoomId;
    }
    
    renderScheduleGrid();
}


// --- MODAL HANDLING ---

/**
 * Opens the booking modal for either a new booking or viewing an existing one.
 * @param {HTMLElement} slotCell The grid cell that was clicked.
 */
function openBookingModal(slotCell) {
    const bookingId = slotCell.dataset.bookingId;
    const booking = bookingId ? state.bookings.find(b => b.id === bookingId) : null;
    
    const form = document.getElementById('booking-form');
    const details = document.getElementById('booking-details');
    form.reset();
    
    document.getElementById('user-actions').style.display = 'none';
    document.getElementById('admin-actions').style.display = 'none';
    document.getElementById('delete-booking-btn').style.display = 'none';
    document.getElementById('submit-booking-btn').style.display = 'none';

    if (booking) {
        // --- View Existing Booking ---
        form.style.display = 'none';
        details.style.display = 'block';
        document.getElementById('booking-modal-title').textContent = 'Chi tiết Lịch thực hành';

        const statusMap = {
            pending: { text: 'Chờ duyệt', bg: 'bg-yellow-100', text_color: 'text-yellow-800' },
            approved: { text: 'Đã duyệt', bg: 'bg-green-100', text_color: 'text-green-800' },
            rejected: { text: 'Bị từ chối', bg: 'bg-red-100', text_color: 'text-red-800' }
        };
        const statusInfo = statusMap[booking.status] || { text: booking.status, bg: 'bg-gray-100', text_color: 'text-gray-800' };
        document.getElementById('details-status-badge').className = `p-3 rounded-lg ${statusInfo.bg} ${statusInfo.text_color}`;
        document.getElementById('details-status').textContent = statusInfo.text;
        
        document.getElementById('details-room').textContent = state.rooms.find(r => r.id === booking.roomId)?.name || 'N/A';
        document.getElementById('details-time').textContent = `${booking.shift}, ${booking.session}, ${formatDate(parseDateString(booking.date))}`;
        document.getElementById('details-lecturer').textContent = booking.lecturerName;
        document.getElementById('details-class-name').textContent = booking.className;
        document.getElementById('details-subject').textContent = booking.subject;
        document.getElementById('details-notes').textContent = booking.notes || 'Không có';
        document.getElementById('details-booking-id').textContent = booking.id;
        
        const isAdmin = state.currentUser.role === 'admin';
        const isOwner = state.currentUser.uid === booking.lecturerUid;

        if (isAdmin && booking.status === 'pending') {
            document.getElementById('admin-actions').style.display = 'flex';
            document.getElementById('approve-booking-btn').dataset.id = booking.id;
            document.getElementById('reject-booking-btn').dataset.id = booking.id;
        }
        
        if (isAdmin || (isOwner && (booking.status === 'pending' || booking.status === 'rejected'))) {
             document.getElementById('user-actions').style.display = 'flex';
             document.getElementById('delete-booking-btn').style.display = 'block';
             document.getElementById('delete-booking-btn').dataset.id = booking.id;
        }

    } else {
        // --- Create New Booking ---
        const room = state.rooms.find(r => r.id === state.selectedRoomId);
        if (!room || room.status !== 'active') {
            showAlert('Phòng này hiện không hoạt động hoặc đang bảo trì, không thể đăng ký.');
            return;
        }

        form.style.display = 'block';
        details.style.display = 'none';
        document.getElementById('booking-modal-title').textContent = 'Đăng ký Lịch thực hành';

        document.getElementById('form-room-name').textContent = room?.name || 'N/A';
        document.getElementById('form-slot-time').textContent = `${slotCell.dataset.shift}, ${slotCell.dataset.session}, ${formatDate(parseDateString(slotCell.dataset.date))}`;
        document.getElementById('slot-date').value = slotCell.dataset.date;
        document.getElementById('slot-session').value = slotCell.dataset.session;
        document.getElementById('slot-shift').value = slotCell.dataset.shift;
        document.getElementById('booking-lecturer').value = state.currentUser.lecturerName || state.currentUser.email;
        
        document.getElementById('user-actions').style.display = 'flex';
        document.getElementById('submit-booking-btn').style.display = 'block';
    }
    
    bookingModal.style.display = 'block';
}

/**
 * Opens the room management modal (for admins).
 */
function openRoomManagementModal() {
    document.getElementById('room-form').reset();
    document.getElementById('room-id').value = '';
    renderRoomsListInModal();
    roomManagementModal.style.display = 'block';
}

/**
 * Renders the list of rooms inside the management modal.
 */
function renderRoomsListInModal() {
    const container = document.getElementById('rooms-list-container');
    container.innerHTML = '';
    
    if (state.rooms.length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500 py-4">Chưa có phòng nào.</p>`;
        return;
    }

    const list = document.createElement('ul');
    list.className = 'divide-y divide-gray-200';
    state.rooms.forEach(room => {
        const item = document.createElement('li');
        item.className = 'py-3 flex justify-between items-center';
        item.innerHTML = `
            <div>
                <p class="font-medium">${room.name} <span class="text-xs font-normal text-gray-500">(${room.status})</span></p>
                <p class="text-sm text-gray-600">${room.description || ''}</p>
            </div>
            <div class="flex gap-3">
                <button data-id="${room.id}" class="edit-room-btn text-blue-600 hover:text-blue-800"><i class="fas fa-edit"></i></button>
                <button data-id="${room.id}" class="delete-room-btn text-red-600 hover:text-red-800"><i class="fas fa-trash"></i></button>
            </div>
        `;
        list.appendChild(item);
    });
    container.appendChild(list);
}


// --- FIREBASE CRUD & LOGIC ---

/**
 * Handles the submission of the booking form.
 */
async function handleBookingSubmit(e) {
    e.preventDefault();
    const bookingData = {
        roomId: state.selectedRoomId,
        date: document.getElementById('slot-date').value,
        session: document.getElementById('slot-session').value,
        shift: document.getElementById('slot-shift').value,
        lecturerUid: state.currentUser.uid,
        lecturerName: document.getElementById('booking-lecturer').value,
        className: document.getElementById('booking-class-name').value,
        subject: document.getElementById('booking-subject').value,
        notes: document.getElementById('booking-notes').value,
        status: 'pending', // Always pending initially
        createdAt: new Date(),
    };

    try {
        await addDoc(bookingsCol, bookingData);
        showAlert('Gửi đăng ký thành công! Vui lòng chờ duyệt.', true);
        bookingModal.style.display = 'none';
    } catch (error) {
        console.error("Error creating booking:", error);
        showAlert('Đã xảy ra lỗi khi gửi đăng ký.');
    }
}

/**
 * Updates a booking's status (approve/reject).
 * @param {string} bookingId The ID of the booking document.
 * @param {'approved' | 'rejected'} status The new status.
 */
async function updateBookingStatus(bookingId, status) {
    try {
        await updateDoc(doc(bookingsCol, bookingId), { status });
        showAlert(`Đã ${status === 'approved' ? 'duyệt' : 'từ chối'} lịch đăng ký.`, true);
        bookingModal.style.display = 'none';
    } catch (error) {
        console.error("Error updating status:", error);
        showAlert('Lỗi khi cập nhật trạng thái.');
    }
}

/**
 * Deletes a booking.
 * @param {string} bookingId The ID of the booking to delete.
 */
async function deleteBooking(bookingId) {
    const confirmed = await showConfirm('Bạn có chắc muốn xóa/hủy đăng ký này?');
    if (!confirmed) return;
    try {
        await deleteDoc(doc(bookingsCol, bookingId));
        showAlert('Đã xóa đăng ký thành công.', true);
        bookingModal.style.display = 'none';
    } catch (error) {
        console.error("Error deleting booking:", error);
        showAlert('Lỗi khi xóa đăng ký.');
    }
}

/**
 * Handles submission of the room management form (add/edit).
 */
async function handleRoomFormSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    setButtonLoading(btn, true);

    const id = document.getElementById('room-id').value;
    const roomData = {
        name: document.getElementById('room-name').value.trim(),
        description: document.getElementById('room-description').value.trim(),
        status: document.getElementById('room-status').value,
    };

    if (!roomData.name) {
        showAlert('Tên phòng không được để trống.');
        setButtonLoading(btn, false);
        return;
    }

    try {
        if (id) {
            await updateDoc(doc(roomsCol, id), roomData);
        } else {
            await addDoc(roomsCol, roomData);
        }
        document.getElementById('room-form').reset();
        document.getElementById('room-id').value = '';
        showAlert('Lưu phòng thành công!', true);
    } catch (error) {
        console.error("Error saving room:", error);
        showAlert("Lỗi khi lưu thông tin phòng.");
    } finally {
        setButtonLoading(btn, false);
    }
}

async function deleteRoomAndBookings(roomId) {
    const confirmed = await showConfirm(`Bạn có chắc muốn xóa phòng này? MỌI lịch đã đăng ký trong phòng cũng sẽ bị xóa vĩnh viễn.`);
    if (!confirmed) return;

    try {
        const batch = writeBatch(db);
        
        batch.delete(doc(roomsCol, roomId));

        const bookingsQuery = query(bookingsCol, where("roomId", "==", roomId));
        const bookingsSnapshot = await getDocs(bookingsQuery);
        bookingsSnapshot.forEach(bookingDoc => {
            batch.delete(bookingDoc.ref);
        });

        await batch.commit();
        showAlert('Đã xóa phòng và các lịch liên quan thành công.', true);
    } catch (error) {
        console.error("Error deleting room and bookings:", error);
        showAlert('Đã xảy ra lỗi khi xóa phòng.');
    }
}


// --- INITIALIZATION & EVENT LISTENERS ---

/**
 * Sets up all event listeners for the page.
 */
function addEventListeners() {
    // Week Navigation
    document.getElementById('prev-week-btn').addEventListener('click', () => {
        state.currentDate.setDate(state.currentDate.getDate() - 7);
        updateWeekDisplay();
    });
    document.getElementById('next-week-btn').addEventListener('click', () => {
        state.currentDate.setDate(state.currentDate.getDate() + 7);
        updateWeekDisplay();
    });

    // Room Filter
    roomFilter.addEventListener('change', (e) => {
        state.selectedRoomId = e.target.value;
        renderScheduleGrid();
    });

    // Open Modals
    document.getElementById('manage-rooms-btn').addEventListener('click', openRoomManagementModal);
    scheduleGridBody.addEventListener('click', (e) => {
        const slotCell = e.target.closest('.book-slot');
        if (slotCell) {
            openBookingModal(slotCell);
        }
    });

    // Booking Modal Actions
    document.getElementById('close-booking-modal-btn').addEventListener('click', () => bookingModal.style.display = 'none');
    document.getElementById('booking-form').addEventListener('submit', handleBookingSubmit);
    document.getElementById('delete-booking-btn').addEventListener('click', (e) => deleteBooking(e.target.dataset.id));
    
    // Admin Actions in Booking Modal
    document.getElementById('approve-booking-btn').addEventListener('click', (e) => updateBookingStatus(e.target.dataset.id, 'approved'));
    document.getElementById('reject-booking-btn').addEventListener('click', (e) => updateBookingStatus(e.target.dataset.id, 'rejected'));

    // Room Management Modal Actions
    document.getElementById('close-room-modal-btn').addEventListener('click', () => roomManagementModal.style.display = 'none');
    document.getElementById('room-form').addEventListener('submit', handleRoomFormSubmit);
    document.getElementById('rooms-list-container').addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-room-btn');
        if (editBtn) {
            const room = state.rooms.find(r => r.id === editBtn.dataset.id);
            if(room) {
                 document.getElementById('room-id').value = room.id;
                 document.getElementById('room-name').value = room.name;
                 document.getElementById('room-description').value = room.description;
                 document.getElementById('room-status').value = room.status;
            }
        }
        const deleteBtn = e.target.closest('.delete-room-btn');
        if (deleteBtn) {
            deleteRoomAndBookings(deleteBtn.dataset.id);
        }
    });
}

/**
 * Initializes Firebase and sets up authentication and data listeners.
 */
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

        roomsCol = collection(db, `${basePath}/practiceRooms`);
        bookingsCol = collection(db, `${basePath}/practiceBookings`);
        usersCol = collection(db, `${basePath}/users`);
        lecturersCol = collection(db, `${basePath}/lecturers`); // To get lecturer's name

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userDoc = await getDoc(doc(usersCol, user.uid));
                const lecturerDocs = await getDocs(query(lecturersCol, where("linkedUid", "==", user.uid)));
                
                let lecturerName = user.email;
                if (!lecturerDocs.empty) {
                    lecturerName = lecturerDocs.docs[0].data().name;
                }

                state.currentUser = userDoc.exists() 
                    ? { uid: user.uid, lecturerName, ...userDoc.data() } 
                    : { uid: user.uid, email: user.email, role: 'viewer', lecturerName };
                
                // Show admin-only elements
                document.querySelectorAll('.admin-only').forEach(el => {
                    el.style.display = state.currentUser.role === 'admin' ? 'block' : 'none';
                });

                setupOnSnapshotListeners();
            } else {
                window.location.href = 'index.html';
            }
        });

    } catch (error) {
        console.error("Firebase initialization error:", error);
        loadingIndicator.innerHTML = `<p class="text-red-500">Lỗi kết nối. Vui lòng tải lại trang.</p>`;
    }
}

/**
 * Sets up the real-time listeners for all necessary collections.
 */
function setupOnSnapshotListeners() {
    // Listen for rooms
    onSnapshot(roomsCol, (snapshot) => {
        try {
            state.rooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.name.localeCompare(b.name));
            populateRoomFilter();
            if (roomManagementModal.style.display === 'block') {
                renderRoomsListInModal();
            }
        } catch (e) {
            console.error("Error inside rooms onSnapshot callback:", e);
            showAlert("Đã xảy ra lỗi khi cập nhật danh sách phòng.");
        }
    }, (error) => {
        console.error("Error fetching rooms:", error);
        showAlert("Lỗi khi tải danh sách phòng từ cơ sở dữ liệu.");
    });

    // Listen for bookings
    onSnapshot(bookingsCol, (snapshot) => {
        try {
            state.bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderScheduleGrid(); // Re-render the grid whenever bookings change
        } catch (e) {
            console.error("Error inside bookings onSnapshot callback:", e);
            showAlert("Đã xảy ra lỗi khi cập nhật lịch đăng ký.");
        }
    }, (error) => {
        console.error("Error fetching bookings:", error);
        showAlert("Lỗi khi tải lịch đăng ký từ cơ sở dữ liệu.");
    });
}

// --- KICK-OFF ---
document.addEventListener('DOMContentLoaded', () => {
    addEventListeners();
    initializeFirebase();
});
