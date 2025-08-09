// File: js/giao-trinh.js
// Logic for the Syllabus and Teaching Material Management module.
// FIXED: Corrected the storageBucket name in the firebaseConfig object.
// UPGRADED: Replaced window.confirm with a custom modal for better UX.
// ROBUSTNESS: Rewrote renderDocumentsList to prevent DOM-related errors.
// FEATURE: Added check to prevent uploading files with duplicate names for the same subject.
// NEW FEATURE: Added subject management with Excel import functionality.
// NEW FEATURE: Added manual subject addition and Excel template download.
// NEW FEATURE: Added subject code field and multi-select delete for subjects.
// NEW FEATURE: Display count of current subjects in the subject management table.
// SIMPLIFICATION: Removed faculty selection from main view/upload UI.
// NEW FEATURE: Added search functionality for subjects.
// NEW FEATURE: Added 20MB file size limit for uploads.
// NEW FEATURE: Made subject management section collapsible and added a filter for its table.
// NEW FEATURE: Implemented autocomplete search UI for subject selection.
// NEW FEATURE: Added real-time storage usage display.
// NEW FEATURE: Added a collapsible accordion view for ALL uploaded documents, grouped by subject.

// Import Firebase modules
import { auth, db, storage, appId } from './portal-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, query, where, doc, serverTimestamp, getDoc, setDoc, increment, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

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
            border: 1px solid #888; width: 90%; max-width: 500px;
            border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
            -webkit-animation-name: slideIn; -webkit-animation-duration: 0.4s;
            animation-name: slideIn; animation-duration: 0.4s
        }
        @-webkit-keyframes slideIn { from {top: -300px; opacity: 0} to {margin-top: 5%; opacity: 1} }
        @keyframes slideIn { from {margin-top: -5%; opacity: 0} to {margin-top: 5%; opacity: 1} }
        @-webkit-keyframes fadeIn { from {opacity: 0} to {opacity: 1} }
        @keyframes fadeIn { from {opacity: 0} to {opacity: 1} }
        .rotate-180 {
            transform: rotate(180deg);
        }
    `;
    document.head.appendChild(style);
}

// Global state
let state = {
    currentUser: null,
    faculties: [],
    subjects: [],
    documents: [],
    allDocuments: [], // NEW: To store all documents for the accordion view
    selectedSubjectId: null,
    selectedSubjectIdsToDelete: new Set(),
};

// Firebase variables
let facultiesCol, curriculumSubjectsCol, syllabusCol, storageMetadataCol;
let documentsUnsubscribe = null; // To detach listener when changing subjects
let subjectsUnsubscribe = null; // To detach listener for subjects table

// --- Helper Functions ---
function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

// --- Custom Modal Logic ---
function showAlert(message) {
    const modal = document.getElementById('alert-modal');
    document.getElementById('alert-message').textContent = message;
    modal.style.display = 'block';
    document.getElementById('alert-ok-btn').onclick = () => modal.style.display = 'none';
}

function showConfirm(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const messageEl = document.getElementById('confirm-message');
        const yesBtn = document.getElementById('confirm-btn-yes');
        const noBtn = document.getElementById('confirm-btn-no');

        messageEl.textContent = message;
        modal.style.display = 'block';

        const handleYes = () => {
            modal.style.display = 'none';
            yesBtn.removeEventListener('click', handleYes);
            noBtn.removeEventListener('click', handleNo);
            resolve(true);
        };

        const handleNo = () => {
            modal.style.display = 'none';
            yesBtn.removeEventListener('click', handleYes);
            noBtn.removeEventListener('click', handleNo);
            resolve(false);
        };

        yesBtn.addEventListener('click', handleYes);
        noBtn.addEventListener('click', handleNo);
    });
}


function setButtonLoading(button, isLoading, originalText = 'Tải lên') {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Đang xử lý...`;
    } else {
        button.disabled = false;
        button.innerHTML = originalText;
    }
}

// --- UI Rendering ---
function updateUIForRole() {
    if (!state.currentUser) return;
    const isAdmin = state.currentUser.role === 'admin';
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? 'block' : 'none';
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

function renderSearchResultsList(filterText, resultsContainer) {
    resultsContainer.innerHTML = '';
    resultsContainer.classList.remove('hidden');

    const lowercasedFilter = filterText.toLowerCase().trim();
    const filteredSubjects = lowercasedFilter ? state.subjects.filter(subject =>
        subject.subjectName.toLowerCase().includes(lowercasedFilter) ||
        (subject.subjectCode && subject.subjectCode.toLowerCase().includes(lowercasedFilter))
    ) : [...state.subjects];

    const sortedSubjects = filteredSubjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName));

    if (sortedSubjects.length === 0) {
        resultsContainer.innerHTML = `<div class="p-3 text-gray-500 text-sm">Không có kết quả</div>`;
        return;
    }

    sortedSubjects.forEach(subject => {
        const item = document.createElement('div');
        item.className = 'p-3 hover:bg-orange-100 cursor-pointer text-sm';
        item.textContent = `${subject.subjectName} (${subject.subjectCode})`;
        item.dataset.subjectId = subject.id;
        item.dataset.subjectName = `${subject.subjectName} (${subject.subjectCode})`;
        resultsContainer.appendChild(item);
    });
}

function renderSubjectsTable(filterText = '') {
    const tableBody = document.getElementById('subjects-table-body');
    tableBody.innerHTML = '';
    state.selectedSubjectIdsToDelete.clear();
    updateDeleteSelectedButtonState();

    const subjectsTitleElement = document.getElementById('subjects-table-title');
    
    const lowercasedFilter = filterText.toLowerCase().trim();
    const filteredSubjects = lowercasedFilter ? state.subjects.filter(subject => 
        subject.subjectName.toLowerCase().includes(lowercasedFilter) || 
        (subject.subjectCode && subject.subjectCode.toLowerCase().includes(lowercasedFilter))
    ) : state.subjects;

    if (subjectsTitleElement) {
        subjectsTitleElement.textContent = `Danh sách môn học hiện có (${filteredSubjects.length} / ${state.subjects.length} môn):`;
    }

    if (filteredSubjects.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-gray-500">Không tìm thấy môn học nào.</td></tr>`;
        document.getElementById('select-all-subjects').checked = false;
        document.getElementById('select-all-subjects').disabled = true;
        return;
    }

    document.getElementById('select-all-subjects').disabled = false;

    const sortedSubjects = [...filteredSubjects].sort((a, b) => a.subjectName.localeCompare(b.subjectName));

    sortedSubjects.forEach(subject => {
        const facultyName = state.faculties.find(f => f.id === subject.facultyId)?.facultyName || 'Không rõ';
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50';
        row.innerHTML = `
            <td class="py-2 px-4 border-b"><input type="checkbox" class="subject-checkbox form-checkbox h-4 w-4 text-blue-600 rounded" data-subject-id="${subject.id}"></td>
            <td class="py-2 px-4 border-b text-sm text-gray-800">${subject.subjectName}</td>
            <td class="py-2 px-4 border-b text-sm text-gray-600">${subject.subjectCode || 'N/A'}</td>
            <td class="py-2 px-4 border-b text-sm text-gray-600">${facultyName}</td>
            <td class="py-2 px-4 border-b text-sm"><button data-subject-id="${subject.id}" class="delete-subject-btn bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded-lg text-xs flex items-center gap-1"><i class="fas fa-trash"></i> Xóa</button></td>
        `;
        tableBody.appendChild(row);
    });

    document.querySelectorAll('.delete-subject-btn').forEach(button => button.addEventListener('click', (e) => handleDeleteSubject([e.currentTarget.dataset.subjectId])));
    document.querySelectorAll('.subject-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const subjectId = e.target.dataset.subjectId;
            if (e.target.checked) state.selectedSubjectIdsToDelete.add(subjectId);
            else state.selectedSubjectIdsToDelete.delete(subjectId);
            updateDeleteSelectedButtonState();
            updateSelectAllCheckboxState();
        });
    });
    document.getElementById('select-all-subjects').addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll('.subject-checkbox').forEach(checkbox => {
            checkbox.checked = isChecked;
            const subjectId = checkbox.dataset.subjectId;
            if (isChecked) state.selectedSubjectIdsToDelete.add(subjectId);
            else state.selectedSubjectIdsToDelete.delete(subjectId);
        });
        updateDeleteSelectedButtonState();
    });
}

function updateDeleteSelectedButtonState() {
    const deleteSelectedBtn = document.getElementById('delete-selected-subjects-btn');
    if (deleteSelectedBtn) deleteSelectedBtn.disabled = state.selectedSubjectIdsToDelete.size === 0;
}

function updateSelectAllCheckboxState() {
    const selectAllCheckbox = document.getElementById('select-all-subjects');
    const allCheckboxes = document.querySelectorAll('.subject-checkbox');
    if (allCheckboxes.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        return;
    }
    const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
    const anyChecked = Array.from(allCheckboxes).some(cb => cb.checked);

    if (allChecked) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else if (anyChecked) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }
}

function renderDocumentsList() {
    const listContainer = document.getElementById('documents-list');
    const documentsTitle = document.getElementById('documents-title');
    const subject = state.subjects.find(s => s.id === state.selectedSubjectId);
    documentsTitle.textContent = subject ? `Tài liệu môn: ${subject.subjectName} (${subject.subjectCode})` : 'Danh sách tài liệu';

    listContainer.innerHTML = '';

    if (!state.selectedSubjectId) {
        listContainer.innerHTML = `<p class="text-center text-gray-500 py-8">Vui lòng chọn một môn học để xem tài liệu.</p>`;
        return;
    }
    if (state.documents.length === 0) {
        listContainer.innerHTML = `<p class="text-center text-gray-500 py-8">Chưa có tài liệu nào cho môn học này.</p>`;
        return;
    }

    const isAdmin = state.currentUser?.role === 'admin';
    state.documents.forEach(docData => {
        const docElement = document.createElement('div');
        docElement.className = 'p-4 bg-gray-50 rounded-lg border flex flex-col md:flex-row justify-between items-start md:items-center gap-3';

        const uploadedDate = docData.uploadedAt?.toDate();
        let dateString = 'Không rõ ngày';
        let isOld = false;
        if (uploadedDate) {
            dateString = uploadedDate.toLocaleDateString('vi-VN');
            const fiveYearsAgo = new Date();
            fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
            if (uploadedDate < fiveYearsAgo) isOld = true;
        }

        let fileIcon = 'fa-file';
        if (docData.fileType?.startsWith('image/')) fileIcon = 'fa-file-image';
        if (docData.fileType === 'application/pdf') fileIcon = 'fa-file-pdf';
        if (docData.fileType?.includes('word')) fileIcon = 'fa-file-word';
        if (docData.fileType?.includes('excel')) fileIcon = 'fa-file-excel';

        docElement.innerHTML = `
            <div class="flex-grow">
                <p class="font-semibold text-gray-800 flex items-center"><i class="fas ${fileIcon} mr-3 text-gray-500"></i>${docData.fileName}</p>
                <p class="text-xs text-gray-500 mt-1">Ngày tải lên: ${dateString}${isOld ? `<span class="ml-3 text-red-600 font-bold"><i class="fas fa-exclamation-triangle mr-1"></i>Tài liệu cũ (trên 5 năm)</span>` : ''}</p>
            </div>
            <div class="flex items-center gap-3 flex-shrink-0">
                <a href="${docData.downloadURL}" target="_blank" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg text-sm flex items-center gap-2"><i class="fas fa-download"></i> Tải về</a>
                ${isAdmin ? `<button data-doc-id="${docData.id}" data-file-path="${docData.filePath}" class="delete-btn bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg text-sm flex items-center gap-2"><i class="fas fa-trash"></i> Xóa</button>` : ''}
            </div>
        `;
        listContainer.appendChild(docElement);
    });
    
    document.querySelectorAll('.delete-btn').forEach(button => button.addEventListener('click', handleDelete));
}

// NEW: Renders the accordion list of all documents
function renderAllDocumentsAccordion() {
    const accordionContainer = document.getElementById('all-documents-accordion');
    if (!accordionContainer) return;

    accordionContainer.innerHTML = '';

    if (state.allDocuments.length === 0) {
        accordionContainer.innerHTML = `<p class="text-center text-gray-500 py-4">Chưa có tài liệu nào được tải lên hệ thống.</p>`;
        return;
    }

    // Group documents by subjectId
    const docsBySubject = state.allDocuments.reduce((acc, doc) => {
        const subjectId = doc.subjectId;
        if (!acc[subjectId]) {
            acc[subjectId] = [];
        }
        acc[subjectId].push(doc);
        return acc;
    }, {});

    const isAdmin = state.currentUser?.role === 'admin';

    // Sort subjects by name before rendering
    const sortedSubjectIds = Object.keys(docsBySubject).sort((a, b) => {
        const subjectA = state.subjects.find(s => s.id === a)?.subjectName || '';
        const subjectB = state.subjects.find(s => s.id === b)?.subjectName || '';
        return subjectA.localeCompare(subjectB);
    });

    for (const subjectId of sortedSubjectIds) {
        const subject = state.subjects.find(s => s.id === subjectId);
        if (!subject) continue; // Skip if subject info is not available yet

        const documents = docsBySubject[subjectId];
        const accordionItem = document.createElement('div');
        accordionItem.className = 'border border-gray-200 rounded-lg overflow-hidden';

        const headerButton = document.createElement('button');
        headerButton.className = 'w-full flex justify-between items-center p-3 bg-gray-50 hover:bg-gray-100 focus:outline-none text-left transition-colors';
        headerButton.innerHTML = `
            <span class="font-semibold text-gray-700">${subject.subjectName} (${subject.subjectCode})</span>
            <div class="flex items-center gap-4">
                <span class="text-sm bg-blue-100 text-blue-800 font-medium me-2 px-2.5 py-0.5 rounded">${documents.length} file(s)</span>
                <i class="fas fa-chevron-down transition-transform"></i>
            </div>
        `;

        const contentPanel = document.createElement('div');
        contentPanel.className = 'hidden p-3 bg-white';
        contentPanel.innerHTML = '<div class="space-y-3"></div>';
        const contentContainer = contentPanel.querySelector('.space-y-3');

        documents.forEach(docData => {
            const docElement = document.createElement('div');
            docElement.className = 'p-3 bg-gray-50 rounded-md border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2';
            
            const uploadedDate = docData.uploadedAt?.toDate();
            const dateString = uploadedDate ? uploadedDate.toLocaleDateString('vi-VN') : 'Không rõ ngày';
            let fileIcon = 'fa-file';
            if (docData.fileType?.startsWith('image/')) fileIcon = 'fa-file-image';
            if (docData.fileType === 'application/pdf') fileIcon = 'fa-file-pdf';
            if (docData.fileType?.includes('word')) fileIcon = 'fa-file-word';
            if (docData.fileType?.includes('excel')) fileIcon = 'fa-file-excel';

            docElement.innerHTML = `
                <div class="flex-grow">
                    <p class="font-medium text-gray-800 flex items-center text-sm"><i class="fas ${fileIcon} mr-2 text-gray-500"></i>${docData.fileName}</p>
                    <p class="text-xs text-gray-500 mt-1">Ngày tải lên: ${dateString} | Kích thước: ${formatBytes(docData.fileSize)}</p>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    <a href="${docData.downloadURL}" target="_blank" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-3 rounded-lg text-xs flex items-center gap-1.5"><i class="fas fa-download"></i> Tải về</a>
                    ${isAdmin ? `<button data-doc-id="${docData.id}" data-file-path="${docData.filePath}" class="delete-btn bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-3 rounded-lg text-xs flex items-center gap-1.5"><i class="fas fa-trash"></i> Xóa</button>` : ''}
                </div>
            `;
            contentContainer.appendChild(docElement);
        });

        accordionItem.appendChild(headerButton);
        accordionItem.appendChild(contentPanel);
        accordionContainer.appendChild(accordionItem);

        headerButton.addEventListener('click', () => {
            contentPanel.classList.toggle('hidden');
            headerButton.querySelector('i').classList.toggle('rotate-180');
        });
    }
    
    // Re-attach event listeners for the new delete buttons
    accordionContainer.querySelectorAll('.delete-btn').forEach(button => button.addEventListener('click', handleDelete));
}


// --- Firebase Initialization and Auth State ---
async function initializeFirebase() {
    try {
        const basePath = `artifacts/${appId}/public/data`;
        
        facultiesCol = collection(db, `${basePath}/faculties`);
        curriculumSubjectsCol = collection(db, `${basePath}/curriculum_subjects`);
        syllabusCol = collection(db, `${basePath}/syllabus`);
        storageMetadataCol = collection(db, `${basePath}/storage_metadata`);

        onAuthStateChanged(auth, (user) => {
            if (user) {
                const role = sessionStorage.getItem('userRole');
                const email = sessionStorage.getItem('userEmail');

                if (role && email) {
                    state.currentUser = { uid: user.uid, email, role };
                    document.getElementById('user-email').textContent = state.currentUser.email;
                    document.getElementById('app-content').classList.remove('hidden');
                    updateUIForRole();
                    fetchInitialData();
                } else {
                    window.location.href = '/';
                }
            } else {
                window.location.href = '/';
            }
        });
    } catch (error) {
        console.error("Firebase initialization error:", error);
        showAlert(`Lỗi khởi tạo Firebase: ${error.message}`);
    }
}

// --- Data Fetching ---
function fetchInitialData() {
    onSnapshot(facultiesCol, (snapshot) => {
        state.faculties = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        fetchSubjects();
    }, (error) => {
        console.error("Error fetching faculties: ", error);
        showAlert("Không thể tải danh sách khoa.");
    });
    
    listenToStorageUsage();
    fetchAllDocuments(); // NEW: Fetch all documents on initial load
}

function listenToStorageUsage() {
    const storageMetadataRef = doc(storageMetadataCol, 'main_bucket');
    onSnapshot(storageMetadataRef, (docSnap) => {
        const usedStorageEl = document.getElementById('used-storage');
        const totalStorageEl = document.getElementById('total-storage');
        const remainingStorageEl = document.getElementById('remaining-storage');
        const storageProgressBar = document.getElementById('storage-progress-bar');
        
        const FREE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5GB
        let usedBytes = 0;

        if (docSnap.exists()) {
            usedBytes = docSnap.data().totalSizeInBytes || 0;
        }

        const remainingBytes = FREE_QUOTA_BYTES - usedBytes;
        const percentageUsed = (usedBytes / FREE_QUOTA_BYTES) * 100;

        usedStorageEl.textContent = formatBytes(usedBytes);
        totalStorageEl.textContent = formatBytes(FREE_QUOTA_BYTES);
        remainingStorageEl.textContent = formatBytes(remainingBytes);
        storageProgressBar.style.width = `${percentageUsed}%`;

        if (percentageUsed > 90) {
            storageProgressBar.classList.remove('bg-green-600', 'bg-yellow-500');
            storageProgressBar.classList.add('bg-red-600');
        } else if (percentageUsed > 70) {
            storageProgressBar.classList.remove('bg-green-600', 'bg-red-600');
            storageProgressBar.classList.add('bg-yellow-500');
        } else {
            storageProgressBar.classList.remove('bg-yellow-500', 'bg-red-600');
            storageProgressBar.classList.add('bg-green-600');
        }
    }, (error) => {
        console.error("Error listening to storage metadata:", error);
    });
}


function fetchSubjects() {
    if (subjectsUnsubscribe) subjectsUnsubscribe();
    subjectsUnsubscribe = onSnapshot(curriculumSubjectsCol, (snapshot) => {
        state.subjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderSubjectsTable(); 
        renderAllDocumentsAccordion(); // Re-render accordion in case subject names were not ready before
    }, (error) => {
        console.error("Error fetching subjects: ", error);
        showAlert("Không thể tải danh sách môn học.");
    });
}

// NEW: Fetches all documents from the syllabus collection
function fetchAllDocuments() {
    onSnapshot(syllabusCol, (snapshot) => {
        state.allDocuments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderAllDocumentsAccordion();
    }, (error) => {
        console.error("Error fetching all documents: ", error);
        showAlert("Không thể tải danh sách tất cả tài liệu.");
    });
}

function fetchDocumentsForSubject(subjectId) {
    if (documentsUnsubscribe) documentsUnsubscribe();
    state.selectedSubjectId = subjectId;
    if (!subjectId) {
        state.documents = [];
        renderDocumentsList();
        return;
    }
    const q = query(syllabusCol, where("subjectId", "==", subjectId));
    documentsUnsubscribe = onSnapshot(q, (snapshot) => {
        state.documents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderDocumentsList();
    }, (error) => {
        console.error("Error fetching documents: ", error);
        showAlert("Không thể tải danh sách tài liệu cho môn học này.");
    });
}

// --- Event Handlers ---
async function handleUpload(event) {
    event.preventDefault();
    const subjectId = document.getElementById('upload-subject-id').value;
    const fileInput = document.getElementById('file-input');
    const uploadBtn = document.getElementById('upload-btn');
    const progressBarContainer = document.getElementById('upload-progress-bar');
    const progressBar = document.getElementById('upload-progress');

    if (!subjectId) {
        showAlert("Vui lòng chọn môn học trước khi tải lên.");
        return;
    }
    if (fileInput.files.length === 0) {
        showAlert("Vui lòng chọn một file để tải lên.");
        return;
    }

    const file = fileInput.files[0];
    const fileSize = file.size;
    const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
    const FREE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5GB

    if (fileSize > MAX_FILE_SIZE_BYTES) {
        showAlert('Kích thước tệp không được vượt quá 20MB.');
        fileInput.value = '';
        return;
    }
    
    setButtonLoading(uploadBtn, true, `<i class="fas fa-upload"></i> Tải lên`);

    try {
        const selectedSubject = state.subjects.find(s => s.id === subjectId);
        if (!selectedSubject) {
            showAlert("Môn học đã chọn không hợp lệ.");
            setButtonLoading(uploadBtn, false, `<i class="fas fa-upload"></i> Tải lên`);
            return;
        }
        const facultyId = selectedSubject.facultyId || 'unknown_faculty';

        const q = query(syllabusCol, where("subjectId", "==", subjectId), where("fileName", "==", file.name));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            showAlert(`Tên tệp "${file.name}" đã tồn tại trong môn học này. Vui lòng đổi tên tệp hoặc xóa tệp cũ.`);
            setButtonLoading(uploadBtn, false, `<i class="fas fa-upload"></i> Tải lên`);
            return;
        }

        const storageMetadataRef = doc(storageMetadataCol, 'main_bucket');
        const metadataDoc = await getDoc(storageMetadataRef);
        const currentTotalSize = metadataDoc.exists() ? metadataDoc.data().totalSizeInBytes : 0;

        if (currentTotalSize + fileSize > FREE_QUOTA_BYTES) {
            showAlert('Dung lượng lưu trữ đã đầy (vượt quá 5GB miễn phí). Vui lòng xóa bớt tài liệu cũ trước khi tải lên file mới.');
            setButtonLoading(uploadBtn, false, `<i class="fas fa-upload"></i> Tải lên`);
            return;
        }

        const filePath = `giao_trinh/${facultyId}/${subjectId}/${Date.now()}_${file.name}`;
        const storageRef = ref(storage, filePath);

        progressBarContainer.style.display = 'block';
        progressBar.style.width = '0%';

        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed', 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                progressBar.style.width = progress + '%';
            }, 
            (error) => {
                console.error("Upload failed:", error);
                showAlert(`Tải lên thất bại: ${error.message}`);
                setButtonLoading(uploadBtn, false, `<i class="fas fa-upload"></i> Tải lên`);
                progressBarContainer.style.display = 'none';
            }, 
            async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                
                await addDoc(syllabusCol, {
                    facultyId, subjectId,
                    fileName: file.name, fileType: file.type, filePath, downloadURL, fileSize,
                    uploadedAt: serverTimestamp(),
                    uploaderUid: state.currentUser.uid, uploaderEmail: state.currentUser.email,
                });

                await setDoc(storageMetadataRef, { totalSizeInBytes: increment(fileSize) }, { merge: true });

                showAlert("Tải lên tài liệu thành công!");
                setButtonLoading(uploadBtn, false, `<i class="fas fa-upload"></i> Tải lên`);
                progressBarContainer.style.display = 'none';
                document.getElementById('upload-form').reset();
                document.getElementById('upload-subject-id').value = '';
            }
        );
    } catch (error) {
        console.error("Error during upload pre-check:", error);
        showAlert("Đã có lỗi xảy ra khi kiểm tra tệp. Vui lòng thử lại.");
        setButtonLoading(uploadBtn, false, `<i class="fas fa-upload"></i> Tải lên`);
    }
}

async function handleDelete(event) {
    const button = event.currentTarget;
    const docId = button.dataset.docId;
    const filePath = button.dataset.filePath;
    const originalButtonHtml = button.innerHTML;

    if (!await showConfirm('Bạn có chắc chắn muốn xóa tài liệu này không? Hành động này không thể hoàn tác.')) return;

    setButtonLoading(button, true, originalButtonHtml);

    try {
        const docRef = doc(syllabusCol, docId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) throw new Error("Không tìm thấy thông tin tài liệu trong database.");
        
        const fileSize = docSnap.data().fileSize || 0;
        const fileRef = ref(storage, filePath);
        await deleteObject(fileRef);
        await deleteDoc(docRef);
        
        if (fileSize > 0) {
            const storageMetadataRef = doc(storageMetadataCol, 'main_bucket');
            await setDoc(storageMetadataRef, { totalSizeInBytes: increment(-fileSize) }, { merge: true });
        }
        showAlert("Xóa tài liệu thành công!");
    } catch (error) {
        console.error("Error deleting document:", error);
        showAlert(`Xóa thất bại: ${error.message}.`);
        setButtonLoading(button, false, originalButtonHtml);
    }
}

async function handleImportSubjects() {
    const fileInput = document.getElementById('subject-excel-input');
    const importBtn = document.getElementById('import-subjects-btn');
    setButtonLoading(importBtn, true, `<i class="fas fa-file-excel"></i> Nhập môn học`);

    if (fileInput.files.length === 0) {
        showAlert("Vui lòng chọn một tệp Excel để nhập.");
        setButtonLoading(importBtn, false, `<i class="fas fa-file-excel"></i> Nhập môn học`);
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
            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            const headers = json.length > 0 ? json[0].map(h => h?.toString().trim().toLowerCase()) : [];
            const subjectNameColIndex = headers.indexOf('tên môn học');
            const subjectCodeColIndex = headers.indexOf('mã môn học');
            const facultyNameColIndex = headers.indexOf('tên khoa');

            if (subjectNameColIndex === -1 || subjectCodeColIndex === -1 || facultyNameColIndex === -1) {
                showAlert("Tệp Excel không đúng định dạng. Cần có 3 cột: 'Tên môn học', 'Mã môn học' và 'Tên khoa'.");
                setButtonLoading(importBtn, false, `<i class="fas fa-file-excel"></i> Nhập môn học`);
                return;
            }

            const subjectsToImport = [];
            for (let i = 1; i < json.length; i++) {
                const row = json[i];
                const subjectName = row[subjectNameColIndex]?.toString().trim();
                const subjectCode = row[subjectCodeColIndex]?.toString().trim();
                const facultyName = row[facultyNameColIndex]?.toString().trim();
                if (subjectName && subjectCode && facultyName) subjectsToImport.push({ subjectName, subjectCode, facultyName });
            }

            if (subjectsToImport.length === 0) {
                showAlert("Không tìm thấy dữ liệu môn học hợp lệ trong tệp Excel.");
                setButtonLoading(importBtn, false, `<i class="fas fa-file-excel"></i> Nhập môn học`);
                return;
            }

            let importedCount = 0;
            let skippedCount = 0;

            for (const { subjectName, subjectCode, facultyName } of subjectsToImport) {
                try {
                    let facultyDoc = state.faculties.find(f => f.facultyName.toLowerCase() === facultyName.toLowerCase());
                    let facultyId;

                    if (!facultyDoc) {
                        const newFacultyRef = await addDoc(facultiesCol, { facultyName });
                        facultyId = newFacultyRef.id;
                        state.faculties.push({ id: facultyId, facultyName });
                    } else {
                        facultyId = facultyDoc.id;
                    }

                    const q = query(curriculumSubjectsCol, where("subjectCode", "==", subjectCode), where("facultyId", "==", facultyId));
                    if ((await getDocs(q)).empty) {
                        await addDoc(curriculumSubjectsCol, { subjectName, subjectCode, facultyId, createdAt: serverTimestamp() });
                        importedCount++;
                    } else {
                        skippedCount++;
                    }
                } catch (innerError) {
                    console.error(`Error processing subject ${subjectName} (${subjectCode}) from faculty ${facultyName}:`, innerError);
                }
            }
            showAlert(`Nhập môn học thành công! Đã thêm: ${importedCount}, Đã bỏ qua (tồn tại): ${skippedCount}.`);
            fileInput.value = '';
        } catch (error) {
            console.error("Error processing Excel file:", error);
            showAlert(`Lỗi khi đọc tệp Excel: ${error.message}`);
        } finally {
            setButtonLoading(importBtn, false, `<i class="fas fa-file-excel"></i> Nhập môn học`);
        }
    };
    reader.onerror = (error) => {
        console.error("File reader error:", error);
        showAlert(`Lỗi đọc tệp: ${error.message}`);
        setButtonLoading(importBtn, false, `<i class="fas fa-file-excel"></i> Nhập môn học`);
    };
    reader.readAsArrayBuffer(file);
}

function downloadExcelTemplate() {
    const ws_data = [["Tên môn học", "Mã môn học", "Tên khoa"], ["Toán cao cấp", "TC001", "Khoa Cơ bản"], ["Lập trình web", "LT002", "Khoa Công nghệ Thông tin"]];
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Môn học");
    XLSX.writeFile(wb, "mau_nhap_mon_hoc.xlsx");
}

async function handleAddSubjectManually(event) {
    event.preventDefault();
    const subjectNameInput = document.getElementById('manual-subject-name');
    const subjectCodeInput = document.getElementById('manual-subject-code');
    const facultyNameInput = document.getElementById('manual-faculty-name');
    const addSubjectBtn = document.getElementById('add-subject-btn');

    const subjectName = subjectNameInput.value.trim();
    const subjectCode = subjectCodeInput.value.trim();
    const facultyName = facultyNameInput.value.trim();

    if (!subjectName || !subjectCode || !facultyName) {
        showAlert("Vui lòng nhập đầy đủ Tên môn học, Mã môn học và Tên khoa.");
        return;
    }

    setButtonLoading(addSubjectBtn, true, `<i class="fas fa-plus-circle"></i> Thêm môn học`);

    try {
        let facultyDoc = state.faculties.find(f => f.facultyName.toLowerCase() === facultyName.toLowerCase());
        let facultyId;

        if (!facultyDoc) {
            const newFacultyRef = await addDoc(facultiesCol, { facultyName });
            facultyId = newFacultyRef.id;
            state.faculties.push({ id: facultyId, facultyName });
        } else {
            facultyId = facultyDoc.id;
        }

        const q = query(curriculumSubjectsCol, where("subjectCode", "==", subjectCode), where("facultyId", "==", facultyId));
        if ((await getDocs(q)).empty) {
            await addDoc(curriculumSubjectsCol, { subjectName, subjectCode, facultyId, createdAt: serverTimestamp() });
            showAlert(`Thêm môn học "${subjectName}" (${subjectCode}) thành công!`);
            subjectNameInput.value = '';
            subjectCodeInput.value = '';
            facultyNameInput.value = '';
        } else {
            showAlert(`Môn học "${subjectName}" (${subjectCode}) thuộc khoa "${facultyName}" đã tồn tại.`);
        }
    } catch (error) {
        console.error("Error adding subject manually:", error);
        showAlert(`Thêm môn học thất bại: ${error.message}.`);
    } finally {
        setButtonLoading(addSubjectBtn, false, `<i class="fas fa-plus-circle"></i> Thêm môn học`);
    }
}

async function handleDeleteSubject(subjectIds) {
    if (!Array.isArray(subjectIds) || subjectIds.length === 0) {
        showAlert("Không có môn học nào được chọn để xóa.");
        return;
    }

    const confirmationMessage = subjectIds.length > 1
        ? `Bạn có chắc chắn muốn xóa ${subjectIds.length} môn học đã chọn không? Tất cả tài liệu liên quan cũng sẽ bị xóa.`
        : 'Bạn có chắc chắn muốn xóa môn học này không? Tất cả tài liệu liên quan cũng sẽ bị xóa.';

    if (!await showConfirm(confirmationMessage)) return;

    document.querySelectorAll('.delete-subject-btn').forEach(btn => setButtonLoading(btn, true));
    const deleteSelectedBtn = document.getElementById('delete-selected-subjects-btn');
    if (deleteSelectedBtn) setButtonLoading(deleteSelectedBtn, true, `<i class="fas fa-trash"></i> Xóa các môn đã chọn`);

    let successfulDeletions = 0, failedDeletions = 0;

    for (const subjectId of subjectIds) {
        try {
            const docsToDeleteQuery = query(syllabusCol, where("subjectId", "==", subjectId));
            const docsSnapshot = await getDocs(docsToDeleteQuery);
            let totalFileSizeDeleted = 0;

            for (const docSnap of docsSnapshot.docs) {
                const { filePath, fileSize = 0 } = docSnap.data();
                try {
                    await deleteObject(ref(storage, filePath));
                    totalFileSizeDeleted += fileSize;
                } catch (storageError) {
                    console.warn(`Could not delete file ${filePath} from storage:`, storageError);
                }
                await deleteDoc(doc(syllabusCol, docSnap.id));
            }

            if (totalFileSizeDeleted > 0) {
                await setDoc(doc(storageMetadataCol, 'main_bucket'), { totalSizeInBytes: increment(-totalFileSizeDeleted) }, { merge: true });
            }

            await deleteDoc(doc(curriculumSubjectsCol, subjectId));
            successfulDeletions++;
        } catch (error) {
            console.error(`Error deleting subject ${subjectId}:`, error);
            failedDeletions++;
        }
    }

    document.querySelectorAll('.delete-subject-btn').forEach(btn => setButtonLoading(btn, false, `<i class="fas fa-trash"></i> Xóa`));
    if (deleteSelectedBtn) setButtonLoading(deleteSelectedBtn, false, `<i class="fas fa-trash"></i> Xóa các môn đã chọn`);

    if (successfulDeletions > 0) showAlert(`Xóa thành công ${successfulDeletions} môn học. Thất bại: ${failedDeletions}.`);
    else showAlert(`Không có môn học nào được xóa. Vui lòng kiểm tra lại.`);
    
    state.selectedSubjectIdsToDelete.clear();
    renderSubjectsTable();
}

async function handleDeleteSelectedSubjects() {
    await handleDeleteSubject(Array.from(state.selectedSubjectIdsToDelete));
}

function addEventListeners() {
    const searchInput = document.getElementById('search-subject-input');
    const searchResults = document.getElementById('view-search-results');
    const uploadSearchInput = document.getElementById('upload-search-subject-input');
    const uploadSearchResults = document.getElementById('upload-search-results');
    const uploadSubjectIdInput = document.getElementById('upload-subject-id');

    searchInput.addEventListener('input', () => renderSearchResultsList(searchInput.value, searchResults));
    searchInput.addEventListener('focus', () => renderSearchResultsList(searchInput.value, searchResults));
    searchResults.addEventListener('click', (e) => {
        if (e.target.dataset.subjectId) {
            const { subjectId, subjectName } = e.target.dataset;
            searchInput.value = subjectName;
            searchResults.classList.add('hidden');
            fetchDocumentsForSubject(subjectId);
        }
    });

    uploadSearchInput.addEventListener('input', () => {
        uploadSubjectIdInput.value = '';
        renderSearchResultsList(uploadSearchInput.value, uploadSearchResults);
    });
    uploadSearchInput.addEventListener('focus', () => renderSearchResultsList(uploadSearchInput.value, uploadSearchResults));
    uploadSearchResults.addEventListener('click', (e) => {
        if (e.target.dataset.subjectId) {
            const { subjectId, subjectName } = e.target.dataset;
            uploadSearchInput.value = subjectName;
            uploadSubjectIdInput.value = subjectId;
            uploadSearchResults.classList.add('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.parentElement.contains(e.target)) searchResults.classList.add('hidden');
        if (!uploadSearchInput.parentElement.contains(e.target)) uploadSearchResults.classList.add('hidden');
    });

    document.getElementById('upload-form').addEventListener('submit', handleUpload);
    document.getElementById('import-subjects-btn').addEventListener('click', handleImportSubjects);
    document.getElementById('download-template-btn').addEventListener('click', downloadExcelTemplate);
    document.getElementById('add-subject-form').addEventListener('submit', handleAddSubjectManually);
    document.getElementById('delete-selected-subjects-btn').addEventListener('click', handleDeleteSelectedSubjects);
    
    document.getElementById('toggle-subject-management').addEventListener('click', () => {
        document.getElementById('subject-management-content').classList.toggle('hidden');
        document.getElementById('toggle-subject-icon').classList.toggle('rotate-180');
    });

    // NEW: Event listener for the all-documents panel
    document.getElementById('toggle-all-docs-panel').addEventListener('click', () => {
        document.getElementById('all-documents-accordion').classList.toggle('hidden');
        document.getElementById('toggle-all-docs-icon').classList.toggle('rotate-180');
    });

    document.getElementById('admin-search-subject-input').addEventListener('input', (e) => renderSubjectsTable(e.target.value));
}

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    initializeFirebase();
    addEventListeners();
});
