// File: js/quan-ly-de-thi.js
// Logic for the "Exam Bank Management" module.
// UPDATED: Implemented pagination to handle large datasets and prevent browser freezing.
// OPTIMIZED: Changed DOM manipulation in render functions to improve performance.
// FIXED: Aligned Firebase Storage path with the "giao-trinh" module for consistency.
// FIXED: Pointed to the correct 'curriculum_subjects' collection for subject data consistency.
// FIXED: Corrected the storageBucket name in firebaseConfig to match the actual project bucket.
// FEATURE: Replaced year text input with a dropdown select.
// FEATURE: Implemented searchable subject filter.
// FEATURE: Added storage usage display and 20MB file upload limit.
// FIXED: Accurately decrement storage size on file deletion.
// SECURITY FIX: Added role-based access control to hide admin functions from viewers.
// SECURITY FIX: Download buttons are now only visible to admins.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, collection, onSnapshot, addDoc, doc, setDoc, getDoc, 
    updateDoc, deleteDoc, query, where, Timestamp, orderBy, limit, startAfter, getDocs, getCountFromServer, increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyCJcTMUwO-w7V0YsGUKWeaW-zl42Ww7fxo",
  authDomain: "qlylaodongbdhhp.firebaseapp.com",
  projectId: "qlylaodongbdhhp",
  storageBucket: "qlylaodongbdhhp.firebasestorage.app",
  messagingSenderId: "462439202995",
  appId: "1:462439202995:web:06bc11042efb9b99d4f0c6"
};

// --- Firebase Services & State ---
let db, auth, storage;
let examsCol, subjectsCol, storageMetadataCol;
let currentUser = null;
let currentUserRole = 'viewer'; // Default to viewer
let allSubjects = [];
let displayedExams = [];
let lastVisibleDoc = null; 
let currentPage = 1;
const EXAMS_PER_PAGE = 15;
let totalExamsCount = 0;
let isFetching = false; 

// --- Helper Functions ---
function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

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

function setButtonLoading(button, isLoading, loadingText = "Đang xử lý...") {
    if (!button) return;
    if (isLoading) {
        button.disabled = true;
        button.dataset.originalHtml = button.innerHTML;
        button.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>${loadingText}`;
    } else {
        button.disabled = false;
        if (button.dataset.originalHtml) {
            button.innerHTML = button.dataset.originalHtml;
        }
    }
}

// --- Firebase Initialization ---
function initializeFirebase() {
    try {
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        storage = getStorage(app);

        const appId = firebaseConfig.projectId || 'default-app-id';
        const basePath = `artifacts/${appId}/public/data`; 
        
        examsCol = collection(db, `${basePath}/exams`);
        subjectsCol = collection(db, `${basePath}/curriculum_subjects`);
        storageMetadataCol = collection(db, `${basePath}/storage_metadata`);

        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUser = user;
                currentUserRole = sessionStorage.getItem('userRole') || 'viewer';

                document.getElementById('auth-overlay').style.display = 'none';
                document.getElementById('main-content').classList.remove('hidden');
                loadInitialData();
                updateUIForRole();
            } else {
                currentUser = null;
                currentUserRole = 'viewer';
                document.getElementById('auth-overlay').style.display = 'flex';
                document.getElementById('main-content').classList.add('hidden');
            }
        });

    } catch (error) {
        console.error("Firebase initialization error:", error);
        showAlert("Không thể kết nối đến cơ sở dữ liệu. Vui lòng tải lại trang.");
    }
}

// --- SECURITY: UI Control based on Role ---
function updateUIForRole() {
    const isAdmin = currentUserRole === 'admin';
    const addExamBtn = document.getElementById('add-exam-btn');

    if (addExamBtn) {
        addExamBtn.style.display = isAdmin ? 'inline-flex' : 'none';
    }
    
    if (displayedExams.length > 0) {
        renderExamsList(displayedExams);
    }
}


// --- Data Loading and Rendering ---
function loadInitialData() {
    listenToStorageUsage();
    populateYearFilter();

    onSnapshot(query(subjectsCol), (snapshot) => {
        allSubjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allSubjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
        populateSubjectDropdowns(allSubjects);
        renderSubjectSearchResults('');
    }, error => {
        console.error("Error loading subjects:", error);
        showAlert("Lỗi tải danh sách môn học.");
    });

    fetchExams();
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

function populateYearFilter() {
    const yearSelect = document.getElementById('filter-year');
    const currentYear = new Date().getFullYear();
    let yearHtml = '<option value="all">Tất cả năm học</option>';
    for (let i = 0; i < 5; i++) {
        const year = currentYear - i;
        const academicYear = `${year}-${year + 1}`;
        yearHtml += `<option value="${academicYear}">${academicYear}</option>`;
    }
    yearSelect.innerHTML = yearHtml;
}

function populateSubjectDropdowns(subjects) {
    const modalSelect = document.getElementById('exam-subject');
    const currentModalValue = modalSelect.value;
    let modalHtml = '<option value="">-- Chọn môn học --</option>';
    subjects.forEach(subject => {
        modalHtml += `<option value="${subject.id}">${subject.subjectName}</option>`;
    });
    modalSelect.innerHTML = modalHtml;
    modalSelect.value = currentModalValue;
}

function renderSubjectSearchResults(filterText) {
    const resultsContainer = document.getElementById('filter-subject-results');
    resultsContainer.innerHTML = '';
    
    const lowercasedFilter = filterText.toLowerCase().trim();
    const filteredSubjects = lowercasedFilter 
        ? allSubjects.filter(s => s.subjectName.toLowerCase().includes(lowercasedFilter))
        : [...allSubjects];

    if (filteredSubjects.length === 0) {
        resultsContainer.innerHTML = `<div class="p-3 text-gray-500 text-sm">Không có kết quả</div>`;
        return;
    }

    let resultsHtml = '';
    filteredSubjects.slice(0, 100).forEach(subject => {
        resultsHtml += `<div class="p-3 hover:bg-blue-100 cursor-pointer text-sm" data-subject-id="${subject.id}" data-subject-name="${subject.subjectName}">${subject.subjectName}</div>`;
    });
    resultsContainer.innerHTML = resultsHtml;
}

// --- Pagination and Data Fetching Logic ---
function buildQuery() {
    const subjectId = document.getElementById('filter-subject-id').value;
    const yearFilter = document.getElementById('filter-year').value;
    
    let q = query(examsCol);

    if (subjectId) {
        q = query(q, where("subjectId", "==", subjectId));
    }
    if (yearFilter !== 'all') {
        q = query(q, where("academicYear", "==", yearFilter));
    }
    return q;
}

async function fetchExams(direction = 'first') {
    if (isFetching) return;
    isFetching = true;
    
    let q = buildQuery();
    const countQuery = q;

    q = query(q, orderBy("createdAt", "desc"));

    if (direction === 'next' && lastVisibleDoc) {
        q = query(q, startAfter(lastVisibleDoc));
    }
    
    q = query(q, limit(EXAMS_PER_PAGE));

    try {
        const [documentSnapshots, countSnapshot] = await Promise.all([
            getDocs(q),
            getCountFromServer(countQuery)
        ]);
        
        totalExamsCount = countSnapshot.data().count;

        if (!documentSnapshots.empty) {
            displayedExams = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            lastVisibleDoc = documentSnapshots.docs[documentSnapshots.docs.length - 1];
        } else {
            if (direction === 'first') {
                displayedExams = [];
            }
        }
        
        renderExamsList(displayedExams);
        renderPaginationControls(documentSnapshots.size);

    } catch (error) {
        console.error("Error fetching exams:", error);
        showAlert("Đã xảy ra lỗi khi tải danh sách đề thi. Lỗi này thường xảy ra khi bạn lọc theo nhiều điều kiện mà chưa tạo chỉ mục (index) trong Firestore. Vui lòng kiểm tra console (F12) để xem chi tiết.");
    } finally {
        isFetching = false;
    }
}

function handleFilterChange() {
    currentPage = 1;
    lastVisibleDoc = null;
    fetchExams('first');
}

function renderExamsList(exams) {
    const tbody = document.getElementById('exams-list-body');
    
    if (exams.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-gray-500">Không tìm thấy đề thi nào khớp với bộ lọc.</td></tr>';
        return;
    }

    const isAdmin = currentUserRole === 'admin';
    let tableHtml = '';
    exams.forEach(exam => {
        const createdAt = exam.createdAt ? exam.createdAt.toDate().toLocaleDateString('vi-VN') : 'N/A';
        
        let actionButtons = '<span>-</span>'; // Default for viewers
        if (isAdmin) {
            actionButtons = `
                ${exam.examFileUrl ? `<button class="text-blue-600 hover:text-blue-800 p-1" onclick="window.downloadFile('${exam.examFileUrl}')" title="Tải đề thi"><i class="fas fa-download"></i></button>` : ''}
                ${exam.answerFileUrl ? `<button class="text-green-600 hover:text-green-800 p-1" onclick="window.downloadFile('${exam.answerFileUrl}')" title="Tải đáp án"><i class="fas fa-key"></i></button>` : ''}
                <button class="text-yellow-600 hover:text-yellow-800 p-1" onclick="window.editExam('${exam.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="text-red-600 hover:text-red-800 p-1" onclick="window.deleteExam('${exam.id}')" title="Xóa"><i class="fas fa-trash-alt"></i></button>
            `;
        }
        
        tableHtml += `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-2 font-semibold">${exam.examName || ''}</td>
                <td class="p-2">${exam.subjectName || 'N/A'}</td>
                <td class="p-2 text-center">${exam.academicYear || ''}</td>
                <td class="p-2 text-center">${exam.examFormat || ''}</td>
                <td class="p-2">${exam.createdByUser || ''}</td>
                <td class="p-2 text-center">${createdAt}</td>
                <td class="p-2 text-center whitespace-nowrap">
                    ${actionButtons}
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = tableHtml;
}

function renderPaginationControls(currentSize) {
    const prevBtn = document.getElementById('prev-page-btn');
    const nextBtn = document.getElementById('next-page-btn');
    const pageIndicator = document.getElementById('page-indicator');
    const resultsCount = document.getElementById('results-count');

    pageIndicator.textContent = `Trang ${currentPage}`;
    const startItem = (currentPage - 1) * EXAMS_PER_PAGE + 1;
    const endItem = startItem + currentSize - 1;
    resultsCount.textContent = totalExamsCount > 0 ? `Hiển thị ${startItem}-${endItem} của ${totalExamsCount} kết quả` : "Không có kết quả";

    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = endItem >= totalExamsCount;
}

// --- Modal and Form Logic ---
function openExamModal(examId = null) {
    const modal = document.getElementById('exam-modal');
    const form = document.getElementById('exam-form');
    form.reset();
    document.getElementById('exam-id').value = '';
    document.getElementById('exam-file-name').textContent = 'Nhấn để chọn file (PDF, DOCX)';
    document.getElementById('answer-file-name').textContent = 'Nhấn để chọn file (PDF, DOCX)';
    document.getElementById('exam-file-progress-container').classList.add('hidden');
    document.getElementById('answer-file-progress-container').classList.add('hidden');

    if (examId) {
        document.getElementById('exam-modal-title').textContent = 'Cập nhật Đề thi';
        const exam = displayedExams.find(e => e.id === examId);
        if (exam) {
            document.getElementById('exam-id').value = exam.id;
            document.getElementById('exam-subject').value = exam.subjectId;
            document.getElementById('exam-name').value = exam.examName;
            document.getElementById('exam-academic-year').value = exam.academicYear || '';
            document.getElementById('exam-semester').value = exam.semester || 'I';
            document.getElementById('exam-duration').value = exam.duration || '';
            document.getElementById('exam-format').value = exam.examFormat || 'Tự luận';
            document.getElementById('exam-notes').value = exam.notes || '';
            if (exam.examFileName) {
                document.getElementById('exam-file-name').textContent = exam.examFileName;
            }
            if (exam.answerFileName) {
                document.getElementById('answer-file-name').textContent = exam.answerFileName;
            }
        }
    } else {
        document.getElementById('exam-modal-title').textContent = 'Thêm Đề thi mới';
    }
    modal.style.display = 'block';
}

function closeExamModal() {
    document.getElementById('exam-modal').style.display = 'none';
}

// --- File Upload Logic ---
async function handleFileUpload(file, subjectId, progressBarId, progressContainerId, fileNameId) {
    return new Promise(async (resolve, reject) => {
        if (!file) return resolve(null);
        if (!subjectId) return reject(new Error("Mã môn học là bắt buộc."));

        const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
        if (file.size > MAX_FILE_SIZE) {
            return reject(new Error(`Kích thước file không được vượt quá ${formatBytes(MAX_FILE_SIZE)}.`));
        }

        const storageMetadataRef = doc(storageMetadataCol, 'main_bucket');
        const metadataDoc = await getDoc(storageMetadataRef);
        const currentTotalSize = metadataDoc.exists() ? metadataDoc.data().totalSizeInBytes : 0;
        const FREE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

        if (currentTotalSize + file.size > FREE_QUOTA_BYTES) {
            return reject(new Error('Dung lượng lưu trữ đã đầy. Vui lòng xóa bớt file cũ.'));
        }

        const progressContainer = document.getElementById(progressContainerId);
        const progressBar = document.getElementById(progressBarId);
        progressContainer.classList.remove('hidden');
        progressBar.style.width = '0%';

        const storageRef = ref(storage, `de_thi/${subjectId}/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed', 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                progressBar.style.width = progress + '%';
            }, 
            (error) => {
                console.error("Upload failed:", error);
                progressContainer.classList.add('hidden');
                reject(error);
            }, 
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then(async (downloadURL) => {
                    document.getElementById(fileNameId).textContent = file.name;
                    // Note: We increment size in saveExam AFTER db write succeeds
                    setTimeout(() => progressContainer.classList.add('hidden'), 1000);
                    resolve({ url: downloadURL, name: file.name, path: uploadTask.snapshot.ref.fullPath, size: file.size });
                });
            }
        );
    });
}

// --- CRUD Operations ---
async function saveExam(event) {
    event.preventDefault();
    if (!currentUser) return showAlert("Vui lòng đăng nhập để thực hiện.");

    const saveBtn = document.getElementById('save-exam-btn');
    setButtonLoading(saveBtn, true);

    const examId = document.getElementById('exam-id').value;
    const subjectId = document.getElementById('exam-subject').value;
    const examFile = document.getElementById('exam-file-input').files[0];
    const answerFile = document.getElementById('answer-file-input').files[0];

    if (!subjectId) {
        showAlert("Vui lòng chọn một môn học.");
        return setButtonLoading(saveBtn, false);
    }
    if (!examId && !examFile) {
        showAlert("Vui lòng chọn một file đề thi khi tạo mới.");
        return setButtonLoading(saveBtn, false);
    }

    try {
        const examFileData = await handleFileUpload(examFile, subjectId, 'exam-file-progress-bar', 'exam-file-progress-container', 'exam-file-name');
        const answerFileData = await handleFileUpload(answerFile, subjectId, 'answer-file-progress-bar', 'answer-file-progress-container', 'answer-file-name');

        const selectedSubject = allSubjects.find(s => s.id === subjectId);
        const data = {
            subjectId: subjectId,
            subjectName: selectedSubject?.subjectName || 'N/A',
            examName: document.getElementById('exam-name').value.trim(),
            academicYear: document.getElementById('exam-academic-year').value.trim(),
            semester: document.getElementById('exam-semester').value,
            duration: parseInt(document.getElementById('exam-duration').value, 10) || null,
            examFormat: document.getElementById('exam-format').value,
            notes: document.getElementById('exam-notes').value.trim(),
        };

        if (examFileData) {
            data.examFileUrl = examFileData.url;
            data.examFileName = examFileData.name;
            data.examFilePath = examFileData.path;
            data.examFileSize = examFileData.size;
        }
        if (answerFileData) {
            data.answerFileUrl = answerFileData.url;
            data.answerFileName = answerFileData.name;
            data.answerFilePath = answerFileData.path;
            data.answerFileSize = answerFileData.size;
        }

        const storageMetadataRef = doc(storageMetadataCol, 'main_bucket');

        if (examId) {
            const existingExamRef = doc(examsCol, examId);
            const existingExamSnap = await getDoc(existingExamRef);
            const existingExam = existingExamSnap.data() || {};
            
            await updateDoc(existingExamRef, data);

            const sizeChange = (data.examFileSize || 0) - (existingExam.examFileSize || 0) + 
                               ((data.answerFileSize || 0) - (existingExam.answerFileSize || 0));
            if (sizeChange !== 0) {
                await setDoc(storageMetadataRef, { totalSizeInBytes: increment(sizeChange) }, { merge: true });
            }

            showAlert("Cập nhật đề thi thành công!", true);
        } else {
            data.createdByUser = currentUser.email;
            data.createdAt = Timestamp.now();
            await addDoc(examsCol, data);
            
            const totalUploadedSize = (data.examFileSize || 0) + (data.answerFileSize || 0);
            if (totalUploadedSize > 0) {
                await setDoc(storageMetadataRef, { totalSizeInBytes: increment(totalUploadedSize) }, { merge: true });
            }
            showAlert("Thêm đề thi mới thành công!", true);
        }
        closeExamModal();
        handleFilterChange();
    } catch (error) {
        showAlert(`Lưu đề thi thất bại: ${error.message}`);
    } finally {
        setButtonLoading(saveBtn, false);
    }
}

window.editExam = (examId) => openExamModal(examId);

window.deleteExam = (examId) => {
    showConfirm("Bạn có chắc chắn muốn xóa đề thi này? Hành động này không thể hoàn tác và sẽ xóa cả file đính kèm.", async () => {
        try {
            const examRef = doc(examsCol, examId);
            const examSnap = await getDoc(examRef);
            if (!examSnap.exists()) return showAlert("Không tìm thấy đề thi để xóa.");
            
            const exam = examSnap.data();
            const totalSizeDeleted = (exam.examFileSize || 0) + (exam.answerFileSize || 0);

            if (exam.examFilePath) {
                try { await deleteObject(ref(storage, exam.examFilePath)); } catch (e) { console.warn("File not found"); }
            }
            if (exam.answerFilePath) {
                try { await deleteObject(ref(storage, exam.answerFilePath)); } catch (e) { console.warn("File not found"); }
            }
            
            await deleteDoc(examRef);

            if (totalSizeDeleted > 0) {
                const storageMetadataRef = doc(storageMetadataCol, 'main_bucket');
                await setDoc(storageMetadataRef, { totalSizeInBytes: increment(-totalSizeDeleted) }, { merge: true });
            }

            showAlert("Xóa đề thi thành công!", true);
            handleFilterChange();
        } catch (error) {
            showAlert(`Xóa thất bại: ${error.message}`);
        }
    });
};

window.downloadFile = (url) => window.open(url, '_blank');

// --- Event Listeners ---
function addEventListeners() {
    document.getElementById('add-exam-btn').addEventListener('click', () => openExamModal());
    document.getElementById('close-exam-modal').addEventListener('click', closeExamModal);
    document.getElementById('cancel-exam-btn').addEventListener('click', closeExamModal);
    document.getElementById('exam-form').addEventListener('submit', saveExam);
    document.getElementById('filter-year').addEventListener('change', handleFilterChange);
    
    // Searchable Subject Filter Listeners
    const subjectFilterInput = document.getElementById('filter-subject-input');
    const subjectFilterResults = document.getElementById('filter-subject-results');
    const subjectFilterId = document.getElementById('filter-subject-id');

    subjectFilterInput.addEventListener('input', () => renderSubjectSearchResults(subjectFilterInput.value));
    subjectFilterInput.addEventListener('focus', () => subjectFilterResults.classList.remove('hidden'));
    document.addEventListener('click', (e) => {
        if (!subjectFilterInput.parentElement.contains(e.target)) {
            subjectFilterResults.classList.add('hidden');
        }
    });
    subjectFilterResults.addEventListener('click', (e) => {
        if (e.target.dataset.subjectId) {
            const { subjectId, subjectName } = e.target.dataset;
            subjectFilterInput.value = subjectName;
            subjectFilterId.value = subjectId;
            subjectFilterResults.classList.add('hidden');
            handleFilterChange();
        }
    });
     subjectFilterInput.addEventListener('change', () => {
        if (subjectFilterInput.value === '') {
            subjectFilterId.value = '';
            handleFilterChange();
        }
    });

    // Pagination
    document.getElementById('next-page-btn').addEventListener('click', () => {
        if (!isFetching) {
            currentPage++;
            fetchExams('next');
        }
    });
    document.getElementById('prev-page-btn').addEventListener('click', () => {
        if (!isFetching && currentPage > 1) {
            currentPage = 1; 
            lastVisibleDoc = null;
            fetchExams('first');
        }
    });
    
    // File input custom UI
    document.getElementById('exam-file-input').addEventListener('change', (e) => {
        const fileNameDisplay = document.getElementById('exam-file-name');
        fileNameDisplay.textContent = e.target.files.length > 0 ? e.target.files[0].name : 'Nhấn để chọn file (PDF, DOCX)';
    });
    document.getElementById('answer-file-input').addEventListener('change', (e) => {
        const fileNameDisplay = document.getElementById('answer-file-name');
        fileNameDisplay.textContent = e.target.files.length > 0 ? e.target.files[0].name : 'Nhấn để chọn file (PDF, DOCX)';
    });
}

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();
    addEventListeners();
});
