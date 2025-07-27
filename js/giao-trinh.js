// File: js/giao-trinh.js
// Logic for the Syllabus and Teaching Material Management module.
// FIXED: Corrected the storageBucket name in the firebaseConfig object.
// UPGRADED: Replaced window.confirm with a custom modal for better UX.
// ROBUSTNESS: Rewrote renderDocumentsList to prevent DOM-related errors.
// FEATURE: Added check to prevent uploading files with duplicate names for the same subject.

// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, onSnapshot, addDoc, deleteDoc, query, where, doc, serverTimestamp, getDoc, setDoc, increment, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

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
        @-webkit-keyframes slideIn { from {top: -300px; opacity: 0} to {top: 0; opacity: 1} }
        @keyframes slideIn { from {margin-top: -5%; opacity: 0} to {margin-top: 5%; opacity: 1} }
        @-webkit-keyframes fadeIn { from {opacity: 0} to {opacity: 1} }
        @keyframes fadeIn { from {opacity: 0} to {opacity: 1} }
    `;
    document.head.appendChild(style);
}

// Global state
let state = {
    currentUser: null,
    subjects: [],
    documents: [],
    selectedSubjectId: null,
};

// Firebase variables
let db, auth, storage;
let curriculumSubjectsCol, syllabusCol, storageMetadataCol;
let documentsUnsubscribe = null; // To detach listener when changing subjects

// --- Custom Modal Logic ---
function showAlert(message) {
    const modal = document.getElementById('alert-modal');
    document.getElementById('alert-message').textContent = message;
    modal.style.display = 'block';
    document.getElementById('alert-ok-btn').onclick = () => modal.style.display = 'none';
}

/**
 * Shows a confirmation modal and returns a Promise that resolves on user action.
 * @param {string} message The confirmation message.
 * @returns {Promise<boolean>} A promise that resolves to true if 'Yes' is clicked, false otherwise.
 */
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

function renderSubjectSelects() {
    const uploadSelect = document.getElementById('upload-subject-select');
    const viewSelect = document.getElementById('view-subject-select');
    
    // Sort subjects by name
    const sortedSubjects = [...state.subjects].sort((a, b) => a.subjectName.localeCompare(b.subjectName));

    const defaultOption = '<option value="">-- Chọn môn học --</option>';
    uploadSelect.innerHTML = defaultOption;
    viewSelect.innerHTML = defaultOption;

    sortedSubjects.forEach(subject => {
        const option = `<option value="${subject.id}">${subject.subjectName}</option>`;
        uploadSelect.innerHTML += option;
        viewSelect.innerHTML += option;
    });
}

function renderDocumentsList() {
    const listContainer = document.getElementById('documents-list');
    const documentsTitle = document.getElementById('documents-title');
    
    // Set the title based on the selected subject
    const subject = state.subjects.find(s => s.id === state.selectedSubjectId);
    documentsTitle.textContent = subject ? `Tài liệu môn: ${subject.subjectName}` : 'Danh sách tài liệu';

    // Always clear the list container first
    listContainer.innerHTML = '';

    // Case 1: No subject selected
    if (!state.selectedSubjectId) {
        listContainer.innerHTML = `<p class="text-center text-gray-500 py-8">Vui lòng chọn một môn học để xem tài liệu.</p>`;
        return;
    }

    // Case 2: Subject selected, but no documents found
    if (state.documents.length === 0) {
        listContainer.innerHTML = `<p class="text-center text-gray-500 py-8">Chưa có tài liệu nào cho môn học này.</p>`;
        return;
    }

    // Case 3: Subject selected and documents exist
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
            if (uploadedDate < fiveYearsAgo) {
                isOld = true;
            }
        }

        let fileIcon = 'fa-file';
        if (docData.fileType?.startsWith('image/')) fileIcon = 'fa-file-image';
        if (docData.fileType === 'application/pdf') fileIcon = 'fa-file-pdf';
        if (docData.fileType?.includes('word')) fileIcon = 'fa-file-word';
        if (docData.fileType?.includes('excel') || docData.fileType?.includes('spreadsheet')) fileIcon = 'fa-file-excel';


        docElement.innerHTML = `
            <div class="flex-grow">
                <p class="font-semibold text-gray-800 flex items-center">
                    <i class="fas ${fileIcon} mr-3 text-gray-500"></i>
                    ${docData.fileName}
                </p>
                <p class="text-xs text-gray-500 mt-1">
                    Ngày tải lên: ${dateString}
                    ${isOld ? `<span class="ml-3 text-red-600 font-bold"><i class="fas fa-exclamation-triangle mr-1"></i>Tài liệu cũ (trên 5 năm)</span>` : ''}
                </p>
            </div>
            <div class="flex items-center gap-3 flex-shrink-0">
                <a href="${docData.downloadURL}" target="_blank" class="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg text-sm flex items-center gap-2">
                    <i class="fas fa-download"></i> Tải về
                </a>
                ${isAdmin ? `<button data-doc-id="${docData.id}" data-file-path="${docData.filePath}" class="delete-btn bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg text-sm flex items-center gap-2">
                    <i class="fas fa-trash"></i> Xóa
                </button>` : ''}
            </div>
        `;
        listContainer.appendChild(docElement);
    });
    
    // Add event listeners for the new delete buttons
    document.querySelectorAll('.delete-btn').forEach(button => {
        button.addEventListener('click', handleDelete);
    });
}


// --- Firebase Initialization and Auth State ---
async function initializeFirebase() {
    const firebaseConfig = {
      apiKey: "AIzaSyCJcTMUwO-w7V0YsGUKWeaW-zl42Ww7fxo",
      authDomain: "qlylaodongbdhhp.firebaseapp.com",
      projectId: "qlylaodongbdhhp",
      storageBucket: "qlylaodongbdhhp.firebasestorage.app",
      messagingSenderId: "462439202995",
      appId: "1:462439202995:web:06bc11042efb9b99d4f0c6"
    };

    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        storage = getStorage(app);

        const appId = firebaseConfig.projectId || 'hpu-workload-tracker-app';
        const basePath = `artifacts/${appId}/public/data`;
        
        curriculumSubjectsCol = collection(db, `${basePath}/curriculum_subjects`);
        syllabusCol = collection(db, `${basePath}/syllabus`);
        // Collection to store metadata like total storage size
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
    onSnapshot(curriculumSubjectsCol, (snapshot) => {
        state.subjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderSubjectSelects();
    }, (error) => {
        console.error("Error fetching subjects: ", error);
        showAlert("Không thể tải danh sách môn học.");
    });
}

function fetchDocumentsForSubject(subjectId) {
    if (documentsUnsubscribe) {
        documentsUnsubscribe();
    }
    
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
// =======================================================
// ============ NÂNG CẤP HÀM UPLOAD VỚI LOGIC MỚI ========
// =======================================================
async function handleUpload(event) {
    event.preventDefault();
    const subjectId = document.getElementById('upload-subject-select').value;
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
    const FREE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024; // 5GB
    
    setButtonLoading(uploadBtn, true, `<i class="fas fa-upload"></i> Tải lên`);

    try {
        // --- DUPLICATE FILE NAME CHECK ---
        const q = query(syllabusCol, where("subjectId", "==", subjectId), where("fileName", "==", file.name));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            showAlert(`Tên tệp "${file.name}" đã tồn tại trong môn học này. Vui lòng đổi tên tệp hoặc xóa tệp cũ.`);
            setButtonLoading(uploadBtn, false, `<i class="fas fa-upload"></i> Tải lên`);
            return;
        }

        // --- QUOTA CHECK ---
        const storageMetadataRef = doc(storageMetadataCol, 'main_bucket');
        const metadataDoc = await getDoc(storageMetadataRef);
        const currentTotalSize = metadataDoc.exists() ? metadataDoc.data().totalSizeInBytes : 0;

        if (currentTotalSize + fileSize > FREE_QUOTA_BYTES) {
            showAlert('Dung lượng lưu trữ đã đầy (vượt quá 5GB miễn phí). Vui lòng xóa bớt tài liệu cũ trước khi tải lên file mới.');
            setButtonLoading(uploadBtn, false, `<i class="fas fa-upload"></i> Tải lên`);
            return;
        }

        // --- UPLOAD PROCESS ---
        const filePath = `giao_trinh/${subjectId}/${Date.now()}_${file.name}`;
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
                
                // Save metadata to Firestore, including the file size
                await addDoc(syllabusCol, {
                    subjectId: subjectId,
                    fileName: file.name,
                    fileType: file.type,
                    filePath: filePath,
                    downloadURL: downloadURL,
                    fileSize: fileSize, // <-- Store file size
                    uploadedAt: serverTimestamp(),
                    uploaderUid: state.currentUser.uid,
                    uploaderEmail: state.currentUser.email,
                });

                // Update total storage size
                await setDoc(storageMetadataRef, { 
                    totalSizeInBytes: increment(fileSize) 
                }, { merge: true });

                showAlert("Tải lên tài liệu thành công!");
                setButtonLoading(uploadBtn, false, `<i class="fas fa-upload"></i> Tải lên`);
                progressBarContainer.style.display = 'none';
                document.getElementById('upload-form').reset();
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

    // Use the custom confirmation modal
    const confirmed = await showConfirm('Bạn có chắc chắn muốn xóa tài liệu này không? Hành động này không thể hoàn tác.');

    if (!confirmed) {
        return; // User cancelled the action
    }

    // Set loading state on the button
    setButtonLoading(button, true, originalButtonHtml);

    try {
        // Get the document first to retrieve the file size
        const docRef = doc(syllabusCol, docId);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            throw new Error("Không tìm thấy thông tin tài liệu trong database.");
        }
        const fileSize = docSnap.data().fileSize || 0;

        // 1. Delete the file from Firebase Storage
        const fileRef = ref(storage, filePath);
        await deleteObject(fileRef);

        // 2. Delete the document from Firestore
        await deleteDoc(docRef);
        
        // 3. Decrement the total storage size
        if (fileSize > 0) {
            const storageMetadataRef = doc(storageMetadataCol, 'main_bucket');
            await setDoc(storageMetadataRef, { 
                totalSizeInBytes: increment(-fileSize) 
            }, { merge: true });
        }

        showAlert("Xóa tài liệu thành công!");
        // The document will be removed from the UI automatically by the onSnapshot listener
    } catch (error) {
        console.error("Error deleting document:", error);
        showAlert(`Xóa thất bại: ${error.message}.`);
        // Restore button state on error
        setButtonLoading(button, false, originalButtonHtml);
    }
}


function addEventListeners() {
    document.getElementById('view-subject-select').addEventListener('change', (e) => {
        fetchDocumentsForSubject(e.target.value);
    });

    document.getElementById('upload-form').addEventListener('submit', handleUpload);
}


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    injectStyles();
    initializeFirebase();
    addEventListeners();
});
