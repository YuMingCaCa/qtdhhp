// File: js/quan-ly-de-thi.js
// Logic for the "Exam Bank Management" module.
// UPDATED: Implemented pagination to handle large datasets and prevent browser freezing.
// OPTIMIZED: Changed DOM manipulation in render functions to improve performance.
// FIXED: Aligned Firebase Storage path with the "giao-trinh" module for consistency.
// FIXED: Pointed to the correct 'curriculum_subjects' collection for subject data consistency.

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, collection, onSnapshot, addDoc, doc, setDoc, getDoc, 
    updateDoc, deleteDoc, query, where, Timestamp, orderBy, limit, startAfter, getDocs,getCountFromServer
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyCJcTMUwO-w7V0YsGUKWeaW-zl42Ww7fxo",
  authDomain: "qlylaodongbdhhp.firebaseapp.com",
  projectId: "qlylaodongbdhhp",
  storageBucket: "qlylaodongbdhhp.appspot.com",
  messagingSenderId: "462439202995",
  appId: "1:462439202995:web:06bc11042efb9b99d4f0c6"
};

// --- Firebase Services & State ---
let db, auth, storage;
let examsCol, subjectsCol;
let currentUser = null;
let allSubjects = [];
let displayedExams = [];
let lastVisibleDoc = null; // Last document of the current page
let firstVisibleDoc = null; // First document of the current page
let currentPage = 1;
const EXAMS_PER_PAGE = 15;
let totalExamsCount = 0;
let isFetching = false; // Prevents multiple fetches at once

// --- Helper Functions ---
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
        // FIXED: Point to the correct collection used by the 'giao-trinh' module
        subjectsCol = collection(db, `${basePath}/curriculum_subjects`);

        onAuthStateChanged(auth, (user) => {
            if (user) {
                currentUser = user;
                document.getElementById('auth-overlay').style.display = 'none';
                document.getElementById('main-content').classList.remove('hidden');
                loadInitialData();
            } else {
                currentUser = null;
                document.getElementById('auth-overlay').style.display = 'flex';
                document.getElementById('main-content').classList.add('hidden');
            }
        });

    } catch (error) {
        console.error("Firebase initialization error:", error);
        showAlert("Không thể kết nối đến cơ sở dữ liệu. Vui lòng tải lại trang.");
    }
}

// --- Data Loading and Rendering ---
function loadInitialData() {
    // Load subjects for filters and forms (this list is usually small)
    onSnapshot(query(subjectsCol), (snapshot) => {
        allSubjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Use subjectName for sorting as it's the correct field from curriculum_subjects
        allSubjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
        populateSubjectDropdowns(allSubjects);
    }, error => {
        console.error("Error loading subjects:", error);
        showAlert("Lỗi tải danh sách môn học.");
    });

    // Load the first page of exams
    fetchExams();
}

// OPTIMIZED: Build HTML string first, then set innerHTML once to improve performance.
function populateSubjectDropdowns(subjects) {
    const filterSelect = document.getElementById('filter-subject');
    const modalSelect = document.getElementById('exam-subject');

    const currentFilterValue = filterSelect.value;
    const currentModalValue = modalSelect.value;

    let filterHtml = '<option value="all">Tất cả môn học</option>';
    let modalHtml = '<option value="">-- Chọn môn học --</option>';

    subjects.forEach(subject => {
        // Use subjectName as it's the correct field
        const optionHtml = `<option value="${subject.id}">${subject.subjectName}</option>`;
        filterHtml += optionHtml;
        modalHtml += optionHtml;
    });
    
    filterSelect.innerHTML = filterHtml;
    modalSelect.innerHTML = modalHtml;

    filterSelect.value = currentFilterValue;
    modalSelect.value = currentModalValue;
}

// --- NEW: Pagination and Data Fetching Logic ---
function buildQuery() {
    const subjectFilter = document.getElementById('filter-subject').value;
    const yearFilter = document.getElementById('filter-year').value.trim();
    
    let q = query(examsCol);

    if (subjectFilter !== 'all') {
        q = query(q, where("subjectId", "==", subjectFilter));
    }
    if (yearFilter) {
        q = query(q, where("academicYear", "==", yearFilter));
    }
    return q;
}

async function fetchExams(direction = 'first') {
    if (isFetching) return;
    isFetching = true;
    
    let q = buildQuery();
    const countQuery = q; // Query for counting total results with filters

    // Add ordering and pagination clauses
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
            firstVisibleDoc = documentSnapshots.docs[0];
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
        showAlert("Đã xảy ra lỗi khi tải danh sách đề thi.");
    } finally {
        isFetching = false;
    }
}

function handleFilterChange() {
    currentPage = 1;
    lastVisibleDoc = null;
    firstVisibleDoc = null;
    fetchExams('first');
}

// OPTIMIZED: Build HTML string first, then set innerHTML once to improve performance.
function renderExamsList(exams) {
    const tbody = document.getElementById('exams-list-body');
    
    if (exams.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-gray-500">Không tìm thấy đề thi nào khớp với bộ lọc.</td></tr>';
        return;
    }

    let tableHtml = '';
    exams.forEach(exam => {
        const createdAt = exam.createdAt ? exam.createdAt.toDate().toLocaleDateString('vi-VN') : 'N/A';
        const examName = exam.examName || '';
        const subjectName = exam.subjectName || 'N/A';
        const academicYear = exam.academicYear || '';
        const examFormat = exam.examFormat || '';
        const createdByUser = exam.createdByUser || '';

        tableHtml += `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-2 font-semibold">${examName}</td>
                <td class="p-2">${subjectName}</td>
                <td class="p-2 text-center">${academicYear}</td>
                <td class="p-2 text-center">${examFormat}</td>
                <td class="p-2">${createdByUser}</td>
                <td class="p-2 text-center">${createdAt}</td>
                <td class="p-2 text-center whitespace-nowrap">
                    ${exam.examFileUrl ? `<button class="text-blue-600 hover:text-blue-800 p-1" onclick="window.downloadFile('${exam.examFileUrl}')" title="Tải đề thi"><i class="fas fa-download"></i></button>` : ''}
                    ${exam.answerFileUrl ? `<button class="text-green-600 hover:text-green-800 p-1" onclick="window.downloadFile('${exam.answerFileUrl}')" title="Tải đáp án"><i class="fas fa-key"></i></button>` : ''}
                    <button class="text-yellow-600 hover:text-yellow-800 p-1" onclick="window.editExam('${exam.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                    <button class="text-red-600 hover:text-red-800 p-1" onclick="window.deleteExam('${exam.id}')" title="Xóa"><i class="fas fa-trash-alt"></i></button>
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
    const title = document.getElementById('exam-modal-title');
    form.reset();
    document.getElementById('exam-id').value = '';
    
    document.getElementById('exam-file-name').textContent = 'Nhấn để chọn file (PDF, DOCX)';
    document.getElementById('answer-file-name').textContent = 'Nhấn để chọn file (PDF, DOCX)';
    document.getElementById('exam-file-progress-container').classList.add('hidden');
    document.getElementById('answer-file-progress-container').classList.add('hidden');


    if (examId) {
        title.textContent = 'Cập nhật Đề thi';
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
            if(exam.examFileName) {
                document.getElementById('exam-file-name').textContent = exam.examFileName;
            }
            if(exam.answerFileName) {
                document.getElementById('answer-file-name').textContent = exam.answerFileName;
            }
        }
    } else {
        title.textContent = 'Thêm Đề thi mới';
    }
    modal.style.display = 'block';
}

function closeExamModal() {
    document.getElementById('exam-modal').style.display = 'none';
}

// --- File Upload Logic ---
// FIXED: Changed storage path to be consistent and organized.
function handleFileUpload(file, subjectId, progressBarId, progressContainerId, fileNameId) {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve(null);
            return;
        }
        if (!subjectId) {
            reject(new Error("Mã môn học là bắt buộc để tạo đường dẫn file."));
            return;
        }
        const progressContainer = document.getElementById(progressContainerId);
        const progressBar = document.getElementById(progressBarId);
        
        progressContainer.classList.remove('hidden');
        progressBar.style.width = '0%';

        // Create a structured path: de_thi/{subjectId}/{timestamp}_{fileName}
        const storageRef = ref(storage, `de_thi/${subjectId}/${Date.now()}_${file.name}`);
        const uploadTask = uploadBytesResumable(storageRef, file);

        uploadTask.on('state_changed', 
            (snapshot) => {
                const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
                progressBar.style.width = progress + '%';
            }, 
            (error) => {
                console.error("Upload failed:", error);
                showAlert(`Tải file thất bại: ${error.message}`);
                progressContainer.classList.add('hidden');
                reject(error);
            }, 
            () => {
                getDownloadURL(uploadTask.snapshot.ref).then((downloadURL) => {
                    document.getElementById(fileNameId).textContent = file.name;
                    setTimeout(() => progressContainer.classList.add('hidden'), 1000);
                    resolve({ url: downloadURL, name: file.name, path: uploadTask.snapshot.ref.fullPath });
                });
            }
        );
    });
}

// --- CRUD Operations ---
async function saveExam(event) {
    event.preventDefault();
    if (!currentUser) {
        showAlert("Vui lòng đăng nhập để thực hiện.");
        return;
    }

    const saveBtn = document.getElementById('save-exam-btn');
    setButtonLoading(saveBtn, true);

    const examId = document.getElementById('exam-id').value;
    const subjectId = document.getElementById('exam-subject').value;
    const examFile = document.getElementById('exam-file-input').files[0];
    const answerFile = document.getElementById('answer-file-input').files[0];

    if (!subjectId) {
        showAlert("Vui lòng chọn một môn học.");
        setButtonLoading(saveBtn, false);
        return;
    }
    
    if (!examId && !examFile) {
        showAlert("Vui lòng chọn một file đề thi khi tạo mới.");
        setButtonLoading(saveBtn, false);
        return;
    }

    try {
        // FIXED: Pass subjectId to handleFileUpload
        const examFileData = await handleFileUpload(examFile, subjectId, 'exam-file-progress-bar', 'exam-file-progress-container', 'exam-file-name');
        const answerFileData = await handleFileUpload(answerFile, subjectId, 'answer-file-progress-bar', 'answer-file-progress-container', 'answer-file-name');

        const selectedSubject = allSubjects.find(s => s.id === subjectId);
        const data = {
            subjectId: subjectId,
            // Use subjectName as it's the correct field
            subjectName: selectedSubject?.subjectName || 'N/A',
            examName: document.getElementById('exam-name').value.trim(),
            academicYear: document.getElementById('exam-academic-year').value.trim(),
            semester: document.getElementById('exam-semester').value,
            duration: parseInt(document.getElementById('exam-duration').value, 10) || null,
            examFormat: document.getElementById('exam-format').value,
            notes: document.getElementById('exam-notes').value.trim(),
        };

        if (examId) { // --- UPDATE ---
            const existingExam = displayedExams.find(e => e.id === examId);
            if (examFileData) {
                if (existingExam && existingExam.examFilePath) {
                    try { await deleteObject(ref(storage, existingExam.examFilePath)); } catch (e) { console.warn("Old exam file not found, skipping delete:", e); }
                }
                data.examFileUrl = examFileData.url;
                data.examFileName = examFileData.name;
                data.examFilePath = examFileData.path;
            }
            if (answerFileData) {
                if (existingExam && existingExam.answerFilePath) {
                    try { await deleteObject(ref(storage, existingExam.answerFilePath)); } catch (e) { console.warn("Old answer file not found, skipping delete:", e); }
                }
                data.answerFileUrl = answerFileData.url;
                data.answerFileName = answerFileData.name;
                data.answerFilePath = answerFileData.path;
            }

            await updateDoc(doc(examsCol, examId), data);
            showAlert("Cập nhật đề thi thành công!", true);

        } else { // --- CREATE ---
            data.createdByUser = currentUser.email;
            data.createdByUid = currentUser.uid;
            data.createdAt = Timestamp.now();
            
            if (examFileData) {
                data.examFileUrl = examFileData.url;
                data.examFileName = examFileData.name;
                data.examFilePath = examFileData.path;
            }
            if (answerFileData) {
                data.answerFileUrl = answerFileData.url;
                data.answerFileName = answerFileData.name;
                data.answerFilePath = answerFileData.path;
            }
            
            await addDoc(examsCol, data);
            showAlert("Thêm đề thi mới thành công!", true);
        }

        closeExamModal();
        handleFilterChange(); // Refresh list to show changes

    } catch (error) {
        console.error("Error saving exam:", error);
        showAlert(`Lưu đề thi thất bại: ${error.message}`);
    } finally {
        setButtonLoading(saveBtn, false);
    }
}

window.editExam = (examId) => {
    openExamModal(examId);
};

window.deleteExam = (examId) => {
    showConfirm("Bạn có chắc chắn muốn xóa đề thi này? Hành động này không thể hoàn tác và sẽ xóa cả file đính kèm.", async () => {
        try {
            const examRef = doc(examsCol, examId);
            const examSnap = await getDoc(examRef);
            if (!examSnap.exists()) {
                showAlert("Không tìm thấy đề thi để xóa.");
                return;
            }
            const exam = examSnap.data();

            if (exam.examFilePath) {
                try { await deleteObject(ref(storage, exam.examFilePath)); } catch (e) { console.warn("Exam file not found, skipping delete:", e); }
            }
            if (exam.answerFilePath) {
                try { await deleteObject(ref(storage, exam.answerFilePath)); } catch (e) { console.warn("Answer file not found, skipping delete:", e); }
            }

            await deleteDoc(examRef);
            showAlert("Xóa đề thi thành công!", true);
            handleFilterChange(); // Refresh list

        } catch (error) {
            console.error("Error deleting exam:", error);
            showAlert(`Xóa thất bại: ${error.message}`);
        }
    });
};

window.downloadFile = (url) => {
    window.open(url, '_blank');
};


// --- Event Listeners ---
function addEventListeners() {
    // Modal controls
    document.getElementById('add-exam-btn').addEventListener('click', () => openExamModal());
    document.getElementById('close-exam-modal').addEventListener('click', closeExamModal);
    document.getElementById('cancel-exam-btn').addEventListener('click', closeExamModal);
    
    // Form submission
    document.getElementById('exam-form').addEventListener('submit', saveExam);

    // Filters
    document.getElementById('filter-subject').addEventListener('change', handleFilterChange);
    document.getElementById('filter-year').addEventListener('input', handleFilterChange);
    
    // Pagination
    document.getElementById('next-page-btn').addEventListener('click', () => {
        if (!isFetching) {
            currentPage++;
            fetchExams('next');
        }
    });
    document.getElementById('prev-page-btn').addEventListener('click', () => {
        if (!isFetching && currentPage > 1) {
            currentPage--;
            // This simplified "previous" logic requires re-fetching from the start.
            // A more robust solution would store page cursors.
            lastVisibleDoc = null; 
            fetchExams('first'); 
        }
    });
    
    // File input custom UI
    document.getElementById('exam-file-input').addEventListener('change', (e) => {
        const fileNameDisplay = document.getElementById('exam-file-name');
        if (e.target.files.length > 0) {
            fileNameDisplay.textContent = e.target.files[0].name;
        } else {
            fileNameDisplay.textContent = 'Nhấn để chọn file (PDF, DOCX)';
        }
    });
    document.getElementById('answer-file-input').addEventListener('change', (e) => {
        const fileNameDisplay = document.getElementById('answer-file-name');
        if (e.target.files.length > 0) {
            fileNameDisplay.textContent = e.target.files[0].name;
        } else {
            fileNameDisplay.textContent = 'Nhấn để chọn file (PDF, DOCX)';
        }
    });
}

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
    initializeFirebase();
    addEventListeners();
});
