// File: js/de-tai-tot-nghiep.js
// Logic for the "Graduation Thesis Management" module.

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

// --- Firebase Initialization ---
let db, auth;
let topicsCol, lecturersCol, departmentsCol, usersCol;
let currentUserInfo = null;

async function initializeFirebase() {
    // IMPORTANT: Replace with your actual Firebase config
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
        
        // Collections for this module
        topicsCol = collection(db, `${basePath}/thesis_topics`);
        
        // Shared collections from other modules
        lecturersCol = collection(db, `${basePath}/lecturers`);
        departmentsCol = collection(db, `${basePath}/departments`);
        usersCol = collection(db, `${basePath}/users`);
        
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                // Get user role
                const userDoc = await getDocs(query(usersCol, where("email", "==", user.email)));
                if (!userDoc.empty) {
                    currentUserInfo = { uid: user.uid, ...userDoc.docs[0].data() };
                } else {
                    // Fallback for safety, default to viewer
                    currentUserInfo = { uid: user.uid, email: user.email, role: 'viewer' };
                }
                
                document.getElementById('thesis-module-content').classList.remove('hidden');
                setupOnSnapshotListeners();
                addEventListeners();
                updateUIForRole();
            } else {
                console.log("User not authenticated. Redirecting to login page.");
                // Redirect to login if not authenticated
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

// --- UI Rendering & Logic ---

function updateUIForRole() {
    if (!currentUserInfo) return;
    const isAdmin = currentUserInfo.role === 'admin';
    
    // Show/hide admin-only sections in modals and main page
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? 'block' : 'none';
    });
    document.getElementById('admin-topic-section').style.display = isAdmin ? 'block' : 'none';
}

function getStatusBadge(status) {
    switch (status) {
        case 'pending':
            return `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">Chờ duyệt</span>`;
        case 'approved':
            return `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Đã duyệt</span>`;
        case 'taken':
            return `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">Đã có SV</span>`;
        case 'rejected':
             return `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">Bị từ chối</span>`;
        default:
            return `<span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Không rõ</span>`;
    }
}

function renderTopicsList() {
    const listBody = document.getElementById('topics-list-body');
    listBody.innerHTML = '';

    // Apply filters
    const depFilter = document.getElementById('filter-department').value;
    const lecFilter = document.getElementById('filter-lecturer').value;
    const statusFilter = document.getElementById('filter-status').value;

    const filteredTopics = allTopics.filter(topic => {
        const lecturer = allLecturers.find(l => l.id === topic.lecturerId);
        if (depFilter !== 'all' && (!lecturer || lecturer.departmentId !== depFilter)) return false;
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
        
        // Determine if current user can edit/delete
        const canEdit = currentUserInfo.role === 'admin' || currentUserInfo.uid === topic.proposerUid;

        row.innerHTML = `
            <td class="px-6 py-4">
                <div class="font-bold text-gray-900">${topic.name}</div>
                <div class="text-sm text-gray-500 truncate">${topic.description}</div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap">${lecturer ? lecturer.name : 'N/A'}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center">${getStatusBadge(topic.status)}</td>
            <td class="px-6 py-4 whitespace-nowrap text-center">
                ${canEdit ? `
                <button class="text-indigo-600 hover:text-indigo-900 mr-3" onclick="window.editTopic('${topic.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="text-red-600 hover:text-red-900" onclick="window.deleteTopic('${topic.id}')" title="Xóa"><i class="fas fa-trash"></i></button>
                ` : `
                <span class="text-gray-400 cursor-not-allowed" title="Bạn không có quyền sửa/xóa"><i class="fas fa-lock"></i></span>
                `}
            </td>
        `;
        listBody.appendChild(row);
    });
}

function populateFilterDropdowns() {
    const depSelect = document.getElementById('filter-department');
    const lecSelect = document.getElementById('filter-lecturer');
    const topicLecSelect = document.getElementById('topic-lecturer-select');

    depSelect.innerHTML = '<option value="all">Tất cả Khoa</option>';
    allDepartments.forEach(dep => {
        depSelect.innerHTML += `<option value="${dep.id}">${dep.name}</option>`;
    });

    lecSelect.innerHTML = '<option value="all">Tất cả Giảng viên</option>';
    topicLecSelect.innerHTML = '<option value="">-- Chọn giảng viên --</option>';
    allLecturers.forEach(lec => {
        lecSelect.innerHTML += `<option value="${lec.id}">${lec.name}</option>`;
        topicLecSelect.innerHTML += `<option value="${lec.id}">${lec.name}</option>`;
    });
}

function clearTopicForm() {
    const form = document.getElementById('topic-form');
    form.reset();
    document.getElementById('topic-id').value = '';
    document.getElementById('topic-modal-title').textContent = 'Đề xuất Đề tài mới';
}

// --- CRUD Functions (exposed to window for onclick) ---
window.editTopic = (id) => {
    const topic = allTopics.find(t => t.id === id);
    if (topic) {
        document.getElementById('topic-id').value = topic.id;
        document.getElementById('topic-name').value = topic.name;
        document.getElementById('topic-description').value = topic.description;
        
        // For admin
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


// --- Event Listeners ---
function addEventListeners() {
    // Modal buttons
    document.getElementById('add-topic-btn').addEventListener('click', () => {
        clearTopicForm();
        // If not an admin, automatically assign the current user as the lecturer
        if (currentUserInfo.role !== 'admin') {
            const lecturerSelf = allLecturers.find(l => l.code === currentUserInfo.email.split('@')[0]); // Assumption: lecturer code is part of email
            if (lecturerSelf) {
                 document.getElementById('topic-lecturer-select').value = lecturerSelf.id;
            }
        }
        openModal('topic-modal');
    });

    // Form submission
    document.getElementById('topic-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('topic-id').value;
        const isAdmin = currentUserInfo.role === 'admin';

        // Find the lecturer record associated with the current logged-in user
        // This assumes lecturer's 'code' field matches the part of their email before the '@'
        const selfLecturer = allLecturers.find(l => l.code.toLowerCase() === currentUserInfo.email.split('@')[0].toLowerCase());

        const data = {
            name: document.getElementById('topic-name').value.trim(),
            description: document.getElementById('topic-description').value.trim(),
            // If admin is editing, use the dropdown. Otherwise, use the proposer's ID.
            lecturerId: isAdmin ? document.getElementById('topic-lecturer-select').value : (selfLecturer ? selfLecturer.id : null),
            // If admin is editing, use dropdown. If new, set to pending. If editing own, keep original status.
            status: isAdmin ? document.getElementById('topic-status-select').value : 'pending',
            proposerUid: id ? allTopics.find(t=>t.id === id).proposerUid : currentUserInfo.uid, // Keep original proposer
            lastUpdated: new Date().toISOString(),
        };

        if (!data.name || !data.description) {
            showAlert("Vui lòng điền đầy đủ tên và mô tả đề tài.");
            return;
        }
        if (!data.lecturerId) {
            showAlert("Không thể xác định giảng viên. Vui lòng đảm bảo thông tin giảng viên của bạn có trong hệ thống.");
            return;
        }

        try {
            if (id) {
                // Update existing topic
                await updateDoc(doc(topicsCol, id), data);
                showAlert('Cập nhật đề tài thành công!', true);
            } else {
                // Add new topic
                data.createdAt = new Date().toISOString();
                await addDoc(topicsCol, data);
                showAlert('Đề xuất đề tài mới thành công!', true);
            }
            closeModal('topic-modal');
        } catch (error) {
            showAlert(`Lỗi khi lưu đề tài: ${error.message}`);
            console.error("Error saving topic: ", error);
        }
    });

    // Filter listeners
    document.getElementById('filter-department').addEventListener('change', renderTopicsList);
    document.getElementById('filter-lecturer').addEventListener('change', renderTopicsList);
    document.getElementById('filter-status').addEventListener('change', renderTopicsList);
}

// --- Data Snapshot Listeners ---
function setupOnSnapshotListeners() {
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
        allTopics.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')); // Sort by newest first
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
