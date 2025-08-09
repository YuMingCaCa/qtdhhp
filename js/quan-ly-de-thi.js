// File: js/quan-ly-de-thi.js
// Logic for the "Exam Bank Management" module.
// REFACTOR: Separated Assignment/Payment logic from Exam File logic.
// FEATURE: Added new fields to Assignment form and Print Report.
// FEATURE: Upgraded subject selection in Assignment modal to be searchable.
// FEATURE: Added optional payment summary to the print report with more details.
// FEATURE: Added configurable print options (date, signatory, content).

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    getFirestore, collection, onSnapshot, addDoc, doc, setDoc, getDoc, 
    updateDoc, deleteDoc, query, where, Timestamp, orderBy, limit, startAfter, getDocs, getCountFromServer, increment
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { 
    getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject 
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

// --- Constants ---
const PAYMENT_RATES = {
    'de-tu-luan': { text: 'Ra đề tự luận', rate: 60000 },
    'de-dac-thu': { text: 'Ra đề đặc thù', rate: 100000 },
    'de-thuc-hanh': { text: 'Ra đề thực hành, vấn đáp', rate: 25000 },
    'de-trac-nghiem': { text: 'Ra đề trắc nghiệm', rate: 15000 },
    'duyet-de-thi': { text: 'Duyệt đề thi', rate: 20000 },
    'duyet-ngan-hang': { text: 'Duyệt trong ngân hàng đề', rate: 20000 },
    'duyet-tu-luan': { text: 'Duyệt đề tự luận', rate: 20000 },
    'duyet-thuc-hanh': { text: 'Duyệt đề thực hành, vấn đáp', rate: 5000 },
    'duyet-trac-nghiem': { text: 'Duyệt đề trắc nghiệm', rate: 5000 },
};
const ITEMS_PER_PAGE = 15;

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
let examsCol, subjectsCol, storageMetadataCol, examAssignmentsCol;
let currentUser = null;
let currentUserRole = 'viewer';
let allSubjects = [];

// State for Exam Bank
let displayedExams = [];
let lastExamDoc = null; 
let currentExamPage = 1;
let totalExamsCount = 0;
let isFetchingExams = false; 

// State for Assignments
let displayedAssignments = [];
let lastAssignmentDoc = null;
let currentAssignmentPage = 1;
let totalAssignmentsCount = 0;
let isFetchingAssignments = false;

// --- Helper Functions ---
function formatCurrency(value) {
    if (isNaN(value)) return '0';
    return new Intl.NumberFormat('vi-VN').format(value);
}

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
        examAssignmentsCol = collection(db, `${basePath}/exam_assignments`);
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

// --- UI Control & Data Loading ---
function updateUIForRole() {
    const isAdmin = currentUserRole === 'admin';
    document.getElementById('add-exam-btn').style.display = isAdmin ? 'inline-flex' : 'none';
    document.getElementById('add-assignment-btn').style.display = isAdmin ? 'inline-flex' : 'none';
    document.getElementById('print-report-btn').style.display = isAdmin ? 'inline-flex' : 'none';
    
    if (displayedExams.length > 0) renderExamsList(displayedExams);
    if (displayedAssignments.length > 0) renderAssignmentsList(displayedAssignments);
}

function switchView(viewToShow) {
    const assignmentView = document.getElementById('assignment-view');
    const examBankView = document.getElementById('exam-bank-view');
    const showAssignmentsBtn = document.getElementById('show-assignments-btn');
    const showExamBankBtn = document.getElementById('show-exam-bank-btn');

    if (viewToShow === 'assignments') {
        assignmentView.classList.remove('hidden');
        examBankView.classList.add('hidden');
        showAssignmentsBtn.classList.add('active');
        showExamBankBtn.classList.remove('active');
    } else {
        assignmentView.classList.add('hidden');
        examBankView.classList.remove('hidden');
        showAssignmentsBtn.classList.remove('active');
        showExamBankBtn.classList.add('active');
    }
}

function loadInitialData() {
    listenToStorageUsage();
    populateYearFilters();

    onSnapshot(query(subjectsCol), (snapshot) => {
        allSubjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        allSubjects.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
        populateSubjectDropdowns(allSubjects);
        renderSubjectSearchResults('', 'filter-exam-subject-results');
        renderSubjectSearchResults('', 'filter-assignment-subject-results');
        renderSubjectSearchResults('', 'assignment-subject-results'); // For modal
    }, error => console.error("Error loading subjects:", error));

    fetchExams();
    fetchAssignments();
}

function listenToStorageUsage() {
    const storageMetadataRef = doc(storageMetadataCol, 'main_bucket');
    onSnapshot(storageMetadataRef, (docSnap) => {
        const usedStorageEl = document.getElementById('used-storage');
        const totalStorageEl = document.getElementById('total-storage');
        const remainingStorageEl = document.getElementById('remaining-storage');
        const storageProgressBar = document.getElementById('storage-progress-bar');
        
        const FREE_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
        let usedBytes = docSnap.exists() ? docSnap.data().totalSizeInBytes || 0 : 0;
        const remainingBytes = FREE_QUOTA_BYTES - usedBytes;
        const percentageUsed = (usedBytes / FREE_QUOTA_BYTES) * 100;

        usedStorageEl.textContent = formatBytes(usedBytes);
        totalStorageEl.textContent = formatBytes(FREE_QUOTA_BYTES);
        remainingStorageEl.textContent = formatBytes(remainingBytes);
        storageProgressBar.style.width = `${percentageUsed}%`;
        
        if (percentageUsed > 90) storageProgressBar.className = 'bg-red-600 h-2.5 rounded-full transition-all duration-500';
        else if (percentageUsed > 70) storageProgressBar.className = 'bg-yellow-500 h-2.5 rounded-full transition-all duration-500';
        else storageProgressBar.className = 'bg-green-600 h-2.5 rounded-full transition-all duration-500';
    });
}

function populateYearFilters() {
    const yearSelects = [document.getElementById('filter-exam-year'), document.getElementById('filter-assignment-year')];
    const currentYear = new Date().getFullYear();
    let yearHtml = '<option value="all">Tất cả năm học</option>';
    for (let i = 0; i < 5; i++) {
        const year = currentYear - i;
        const academicYear = `${year}-${year + 1}`;
        yearHtml += `<option value="${academicYear}">${academicYear}</option>`;
    }
    yearSelects.forEach(select => select.innerHTML = yearHtml);
}

function populateSubjectDropdowns(subjects) {
    const select = document.getElementById('exam-subject'); // Only for exam file modal
    const currentValue = select.value;
    let modalHtml = '<option value="">-- Chọn môn học --</option>';
    subjects.forEach(subject => {
        modalHtml += `<option value="${subject.id}">${subject.subjectName}</option>`;
    });
    select.innerHTML = modalHtml;
    select.value = currentValue;
}

function renderSubjectSearchResults(filterText, containerId) {
    const resultsContainer = document.getElementById(containerId);
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

// --- Exam Bank Logic ---
async function fetchExams(direction = 'first') {
    if (isFetchingExams) return;
    isFetchingExams = true;
    
    const subjectId = document.getElementById('filter-exam-subject-id').value;
    const yearFilter = document.getElementById('filter-exam-year').value;
    
    let q = query(examsCol);
    if (subjectId) q = query(q, where("subjectId", "==", subjectId));
    if (yearFilter !== 'all') q = query(q, where("academicYear", "==", yearFilter));
    
    const countQuery = q;
    q = query(q, orderBy("createdAt", "desc"));
    if (direction === 'next' && lastExamDoc) q = query(q, startAfter(lastExamDoc));
    q = query(q, limit(ITEMS_PER_PAGE));

    try {
        const [snapshots, countSnap] = await Promise.all([getDocs(q), getCountFromServer(countQuery)]);
        totalExamsCount = countSnap.data().count;
        displayedExams = snapshots.empty ? [] : snapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (!snapshots.empty) lastExamDoc = snapshots.docs[snapshots.docs.length - 1];
        
        renderExamsList(displayedExams);
        renderPaginationControls('exam', snapshots.size);
    } catch (error) {
        console.error("Error fetching exams:", error);
        showAlert("Lỗi tải danh sách file đề thi. Vui lòng kiểm tra chỉ mục (index) trong Firestore.");
    } finally {
        isFetchingExams = false;
    }
}

function renderExamsList(exams) {
    const tbody = document.getElementById('exams-list-body');
    if (exams.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-gray-500">Không tìm thấy file nào.</td></tr>';
        return;
    }

    const isAdmin = currentUserRole === 'admin';
    let tableHtml = '';
    exams.forEach(exam => {
        const createdAt = exam.createdAt ? exam.createdAt.toDate().toLocaleDateString('vi-VN') : 'N/A';
        let actionButtons = '<span>-</span>';
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
                <td class="p-2">${exam.createdByUser || ''}</td>
                <td class="p-2 text-center">${createdAt}</td>
                <td class="p-2 text-center whitespace-nowrap">${actionButtons}</td>
            </tr>`;
    });
    tbody.innerHTML = tableHtml;
}

// --- Assignment & Payment Logic ---
async function fetchAssignments(direction = 'first') {
    if (isFetchingAssignments) return;
    isFetchingAssignments = true;

    const subjectId = document.getElementById('filter-assignment-subject-id').value;
    const yearFilter = document.getElementById('filter-assignment-year').value;

    let q = query(examAssignmentsCol);
    if (subjectId) q = query(q, where("subjectId", "==", subjectId));
    if (yearFilter !== 'all') q = query(q, where("academicYear", "==", yearFilter));

    const countQuery = q;
    q = query(q, orderBy("createdAt", "desc"));
    if (direction === 'next' && lastAssignmentDoc) q = query(q, startAfter(lastAssignmentDoc));
    q = query(q, limit(ITEMS_PER_PAGE));

    try {
        const [snapshots, countSnap] = await Promise.all([getDocs(q), getCountFromServer(countQuery)]);
        totalAssignmentsCount = countSnap.data().count;
        displayedAssignments = snapshots.empty ? [] : snapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        if (!snapshots.empty) lastAssignmentDoc = snapshots.docs[snapshots.docs.length - 1];

        renderAssignmentsList(displayedAssignments);
        renderPaginationControls('assignment', snapshots.size);
    } catch (error) {
        console.error("Error fetching assignments:", error);
        showAlert("Lỗi tải danh sách phân công. Vui lòng kiểm tra chỉ mục (index) trong Firestore.");
    } finally {
        isFetchingAssignments = false;
    }
}

function renderAssignmentsList(assignments) {
    const tbody = document.getElementById('assignments-list-body');
    if (assignments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-gray-500">Không có phân công nào.</td></tr>';
        return;
    }
    const isAdmin = currentUserRole === 'admin';
    let tableHtml = '';
    assignments.forEach(assignment => {
        const totalCost = (assignment.creationTotal || 0) + (assignment.reviewTotal || 0);
        let actionButtons = '<span>-</span>';
        if (isAdmin) {
            actionButtons = `
                <button class="text-yellow-600 hover:text-yellow-800 p-1" onclick="window.editAssignment('${assignment.id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="text-red-600 hover:text-red-800 p-1" onclick="window.deleteAssignment('${assignment.id}')" title="Xóa"><i class="fas fa-trash-alt"></i></button>
            `;
        }
        tableHtml += `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-2">${assignment.subjectName || 'N/A'}</td>
                <td class="p-2 text-center">${assignment.academicYear || ''}</td>
                <td class="p-2">${assignment.creator || '-'}</td>
                <td class="p-2">${assignment.reviewer || '-'}</td>
                <td class="p-2 text-right font-semibold">${formatCurrency(totalCost)}</td>
                <td class="p-2 text-center whitespace-nowrap">${actionButtons}</td>
            </tr>`;
    });
    tbody.innerHTML = tableHtml;
}


// --- Shared Logic ---
function renderPaginationControls(type, currentSize) {
    const prevBtn = document.getElementById(`${type}-prev-page-btn`);
    const nextBtn = document.getElementById(`${type}-next-page-btn`);
    const pageIndicator = document.getElementById(`${type}-page-indicator`);
    const resultsCount = document.getElementById(`${type}-results-count`);
    const currentPage = type === 'exam' ? currentExamPage : currentAssignmentPage;
    const totalCount = type === 'exam' ? totalExamsCount : totalAssignmentsCount;

    pageIndicator.textContent = `Trang ${currentPage}`;
    const startItem = (currentPage - 1) * ITEMS_PER_PAGE + 1;
    const endItem = startItem + currentSize - 1;
    resultsCount.textContent = totalCount > 0 ? `Hiển thị ${startItem}-${endItem} của ${totalCount} kết quả` : "Không có kết quả";

    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = endItem >= totalCount;
}

// --- Modals & Forms ---
function openAssignmentModal(assignmentId = null) {
    const modal = document.getElementById('assignment-modal');
    const form = document.getElementById('assignment-form');
    form.reset();
    document.getElementById('assignment-id').value = '';
    document.getElementById('assignment-subject-id').value = '';
    updatePaymentFields('assignment');

    if (assignmentId) {
        document.getElementById('assignment-modal-title').textContent = 'Cập nhật Phân công';
        const assignment = displayedAssignments.find(a => a.id === assignmentId);
        if (assignment) {
            document.getElementById('assignment-id').value = assignment.id;
            document.getElementById('assignment-subject-input').value = assignment.subjectName || '';
            document.getElementById('assignment-subject-id').value = assignment.subjectId || '';
            document.getElementById('assignment-academic-year').value = assignment.academicYear || '';
            document.getElementById('assignment-exam-date').value = assignment.examDate || '';
            document.getElementById('assignment-exam-session').value = assignment.examSession || '';
            document.getElementById('assignment-review-date').value = assignment.reviewDate || '';
            document.getElementById('assignment-notes').value = assignment.notes || '';
            document.getElementById('assignment-creator').value = assignment.creator || '';
            document.getElementById('assignment-creation-type').value = assignment.creationType || 'de-tu-luan';
            document.getElementById('assignment-creation-qty').value = assignment.creationQty || 1;
            document.getElementById('assignment-reviewer').value = assignment.reviewer || '';
            document.getElementById('assignment-review-type').value = assignment.reviewType || 'duyet-de-thi';
            document.getElementById('assignment-review-qty').value = assignment.reviewQty || 1;
            updatePaymentFields('assignment');
        }
    } else {
        document.getElementById('assignment-modal-title').textContent = 'Thêm Phân công mới';
    }
    modal.style.display = 'block';
}

function closeAssignmentModal() {
    document.getElementById('assignment-modal').style.display = 'none';
}

function updatePaymentFields(prefix) {
    const creationType = document.getElementById(`${prefix}-creation-type`).value;
    const creationQty = parseInt(document.getElementById(`${prefix}-creation-qty`).value) || 0;
    const creationRate = PAYMENT_RATES[creationType]?.rate || 0;
    const creationTotal = creationQty * creationRate;
    document.getElementById(`${prefix}-creation-rate`).value = creationRate;
    document.getElementById(`${prefix}-creation-total`).value = formatCurrency(creationTotal);

    const reviewType = document.getElementById(`${prefix}-review-type`).value;
    const reviewQty = parseInt(document.getElementById(`${prefix}-review-qty`).value) || 0;
    const reviewRate = PAYMENT_RATES[reviewType]?.rate || 0;
    const reviewTotal = reviewQty * reviewRate;
    document.getElementById(`${prefix}-review-rate`).value = reviewRate;
    document.getElementById(`${prefix}-review-total`).value = formatCurrency(reviewTotal);
}

async function saveAssignment(event) {
    event.preventDefault();
    const saveBtn = document.getElementById('save-assignment-btn');
    setButtonLoading(saveBtn, true);

    const assignmentId = document.getElementById('assignment-id').value;
    const subjectId = document.getElementById('assignment-subject-id').value;

    if (!subjectId) {
        showAlert("Vui lòng chọn một môn học.");
        return setButtonLoading(saveBtn, false);
    }

    try {
        const selectedSubject = allSubjects.find(s => s.id === subjectId);
        const data = {
            subjectId: subjectId,
            subjectName: selectedSubject?.subjectName || 'N/A',
            academicYear: document.getElementById('assignment-academic-year').value.trim(),
            examDate: document.getElementById('assignment-exam-date').value,
            examSession: document.getElementById('assignment-exam-session').value.trim(),
            reviewDate: document.getElementById('assignment-review-date').value,
            notes: document.getElementById('assignment-notes').value.trim(),
            creator: document.getElementById('assignment-creator').value.trim(),
            creationType: document.getElementById('assignment-creation-type').value,
            creationQty: parseInt(document.getElementById('assignment-creation-qty').value) || 0,
            creationRate: PAYMENT_RATES[document.getElementById('assignment-creation-type').value]?.rate || 0,
            creationTotal: (parseInt(document.getElementById('assignment-creation-qty').value) || 0) * (PAYMENT_RATES[document.getElementById('assignment-creation-type').value]?.rate || 0),
            reviewer: document.getElementById('assignment-reviewer').value.trim(),
            reviewType: document.getElementById('assignment-review-type').value,
            reviewQty: parseInt(document.getElementById('assignment-review-qty').value) || 0,
            reviewRate: PAYMENT_RATES[document.getElementById('assignment-review-type').value]?.rate || 0,
            reviewTotal: (parseInt(document.getElementById('assignment-review-qty').value) || 0) * (PAYMENT_RATES[document.getElementById('assignment-review-type').value]?.rate || 0),
        };

        if (assignmentId) {
            await updateDoc(doc(examAssignmentsCol, assignmentId), data);
            showAlert("Cập nhật phân công thành công!", true);
        } else {
            data.createdAt = Timestamp.now();
            await addDoc(examAssignmentsCol, data);
            showAlert("Thêm phân công mới thành công!", true);
        }
        closeAssignmentModal();
        fetchAssignments();
    } catch (error) {
        showAlert(`Lưu phân công thất bại: ${error.message}`);
    } finally {
        setButtonLoading(saveBtn, false);
    }
}

window.editAssignment = (id) => openAssignmentModal(id);
window.deleteAssignment = (id) => {
    showConfirm("Bạn có chắc chắn muốn xóa phân công này?", async () => {
        try {
            await deleteDoc(doc(examAssignmentsCol, id));
            showAlert("Xóa phân công thành công!", true);
            fetchAssignments();
        } catch (error) {
            showAlert(`Xóa thất bại: ${error.message}`);
        }
    });
};

// --- Exam File Modal Logic ---
function openExamFileModal(examId = null) {
    const modal = document.getElementById('exam-modal');
    const form = document.getElementById('exam-form');
    form.reset();
    document.getElementById('exam-id').value = '';
    document.getElementById('exam-file-name').textContent = 'Nhấn để chọn file (PDF, DOCX)';
    document.getElementById('answer-file-name').textContent = 'Nhấn để chọn file (PDF, DOCX)';
    
    if (examId) {
        document.getElementById('exam-modal-title').textContent = 'Cập nhật File Đề thi';
        const exam = displayedExams.find(e => e.id === examId);
        if (exam) {
            document.getElementById('exam-id').value = exam.id;
            document.getElementById('exam-subject').value = exam.subjectId;
            document.getElementById('exam-name').value = exam.examName;
            document.getElementById('exam-academic-year').value = exam.academicYear || '';
            document.getElementById('exam-semester').value = exam.semester || 'I';
            if (exam.examFileName) document.getElementById('exam-file-name').textContent = exam.examFileName;
            if (exam.answerFileName) document.getElementById('answer-file-name').textContent = exam.answerFileName;
        }
    } else {
        document.getElementById('exam-modal-title').textContent = 'Thêm File Đề thi mới';
    }
    modal.style.display = 'block';
}

async function saveExamFile(event) {
    event.preventDefault();
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
            subjectId,
            subjectName: selectedSubject?.subjectName || 'N/A',
            examName: document.getElementById('exam-name').value.trim(),
            academicYear: document.getElementById('exam-academic-year').value.trim(),
            semester: document.getElementById('exam-semester').value,
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

        if (examId) {
            await updateDoc(doc(examsCol, examId), data);
            showAlert("Cập nhật file thành công!", true);
        } else {
            data.createdByUser = currentUser.email;
            data.createdAt = Timestamp.now();
            await addDoc(examsCol, data);
            showAlert("Thêm file mới thành công!", true);
        }
        document.getElementById('exam-modal').style.display = 'none';
        fetchExams();
    } catch (error) {
        showAlert(`Lưu file thất bại: ${error.message}`);
    } finally {
        setButtonLoading(saveBtn, false);
    }
}

window.editExam = (id) => openExamFileModal(id);
window.deleteExam = (id) => {
     showConfirm("Bạn có chắc chắn muốn xóa file đề thi này?", async () => {
        try {
            const examRef = doc(examsCol, id);
            const examSnap = await getDoc(examRef);
            if (!examSnap.exists()) return showAlert("Không tìm thấy file để xóa.");
            
            const exam = examSnap.data();
            const totalSizeDeleted = (exam.examFileSize || 0) + (exam.answerFileSize || 0);

            if (exam.examFilePath) await deleteObject(ref(storage, exam.examFilePath));
            if (exam.answerFilePath) await deleteObject(ref(storage, exam.answerFilePath));
            
            await deleteDoc(examRef);

            if (totalSizeDeleted > 0) {
                await setDoc(doc(storageMetadataCol, 'main_bucket'), { totalSizeInBytes: increment(-totalSizeDeleted) }, { merge: true });
            }
            showAlert("Xóa file thành công!", true);
            fetchExams();
        } catch (error) {
            showAlert(`Xóa file thất bại: ${error.message}`);
        }
    });
};

window.downloadFile = (url) => window.open(url, '_blank');

// --- Print Report ---
function printReport(options) {
    const { includeList, includeSummary, printDate, signatory } = options;
    const printWindow = window.open('', '_blank');
    const subjectFilterText = document.getElementById('filter-assignment-subject-input').value || 'Tất cả môn học';
    const yearFilterText = document.getElementById('filter-assignment-year').value === 'all' ? 'Tất cả năm học' : document.getElementById('filter-assignment-year').value;

    let mainTableHtml = '';
    if (includeList) {
        let mainTableRows = '';
        displayedAssignments.forEach((assignment, index) => {
            const subject = allSubjects.find(s => s.id === assignment.subjectId) || {};
            const examDate = assignment.examDate ? new Date(assignment.examDate + 'T00:00:00').toLocaleDateString('vi-VN') : '';
            const reviewDate = assignment.reviewDate ? new Date(assignment.reviewDate + 'T00:00:00').toLocaleDateString('vi-VN') : '';
            
            mainTableRows += `
                <tr>
                    <td>${index + 1}</td>
                    <td>${examDate}</td>
                    <td>${assignment.examSession || ''}</td>
                    <td>${assignment.subjectName || ''}</td>
                    <td>${subject.subjectCode || ''}</td>
                    <td>${assignment.creationType ? (PAYMENT_RATES[assignment.creationType]?.text || '').includes('Trắc nghiệm') ? 'Trắc nghiệm trên máy' : 'Thực hành' : ''}</td>
                    <td>Khoa Công nghệ Thông tin</td>
                    <td>${assignment.creator || ''}</td>
                    <td>${assignment.reviewer || ''}</td>
                    <td>${reviewDate}</td>
                    <td>${assignment.notes || ''}</td>
                </tr>
            `;
        });
        mainTableHtml = `
            <table>
                <thead>
                    <tr>
                        <th>STT</th><th>Ngày thi</th><th>Ca thi</th><th>Môn thi</th><th>Mã HP</th>
                        <th>HTT</th><th>Khoa quản lý</th><th>Ra đề thi và đáp án</th><th>Người duyệt</th>
                        <th>Ngày duyệt</th><th>Ghi chú</th>
                    </tr>
                </thead>
                <tbody>${mainTableRows}</tbody>
            </table>`;
    }

    let summaryTableHtml = '';
    if (includeSummary) {
        const paymentSummary = {};
        displayedAssignments.forEach(assignment => {
            const { creator, creationType, creationQty, creationTotal, reviewer, reviewType, reviewQty, reviewTotal, subjectName } = assignment;
            if (creator && creationTotal > 0) {
                if (!paymentSummary[creator]) paymentSummary[creator] = { tasks: [], total: 0 };
                paymentSummary[creator].tasks.push({
                    description: `${PAYMENT_RATES[creationType]?.text || 'Ra đề'} môn ${subjectName}`,
                    quantity: creationQty,
                    rate: creationTotal / creationQty,
                    total: creationTotal
                });
                paymentSummary[creator].total += creationTotal;
            }
            if (reviewer && reviewTotal > 0) {
                if (!paymentSummary[reviewer]) paymentSummary[reviewer] = { tasks: [], total: 0 };
                paymentSummary[reviewer].tasks.push({
                    description: `${PAYMENT_RATES[reviewType]?.text || 'Duyệt đề'} môn ${subjectName}`,
                    quantity: reviewQty,
                    rate: reviewTotal / reviewQty,
                    total: reviewTotal
                });
                paymentSummary[reviewer].total += reviewTotal;
            }
        });

        summaryTableHtml = `
            <h2 style="margin-top: 40px; text-align: center;">BẢNG TỔNG HỢP THANH TOÁN</h2>
            <table>
                <thead>
                    <tr>
                        <th>STT</th><th>Họ và tên</th><th>Nội dung chi</th><th>Số lượng</th>
                        <th>Đơn giá</th><th>Thành tiền</th><th>Ký nhận</th>
                    </tr>
                </thead>
                <tbody>`;
        let summaryIndex = 1;
        let grandTotal = 0;
        for (const name in paymentSummary) {
            const data = paymentSummary[name];
            grandTotal += data.total;
            const taskRows = data.tasks.map(task => `
                <tr>
                    <td></td><td></td>
                    <td>${task.description}</td>
                    <td class="center">${task.quantity}</td>
                    <td class="currency">${formatCurrency(task.rate)}</td>
                    <td class="currency">${formatCurrency(task.total)}</td>
                    <td></td>
                </tr>
            `).join('');
            
            summaryTableHtml += `
                <tr class="total-row">
                    <td class="center">${summaryIndex++}</td>
                    <td>${name}</td>
                    <td colspan="3"><strong>Cộng</strong></td>
                    <td class="currency total-col">${formatCurrency(data.total)}</td>
                    <td></td>
                </tr>
                ${taskRows}
            `;
        }
        summaryTableHtml += `
                    <tr class="total-row">
                        <td colspan="5"><strong>TỔNG CỘNG</strong></td>
                        <td class="currency total-col">${formatCurrency(grandTotal)}</td>
                        <td></td>
                    </tr>
                </tbody>
            </table>`;
    }

    const formattedPrintDate = new Date(printDate + 'T00:00:00').toLocaleDateString('vi-VN', { day: 'numeric', month: 'long', year: 'numeric' });

    printWindow.document.write(`
        <html>
            <head>
                <title>Báo cáo Phân công Ra đề, Đáp án, Duyệt đề</title>
                <style>
                    body { font-family: 'Times New Roman', serif; margin: 20px; font-size: 11pt; }
                    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                    th, td { border: 1px solid black; padding: 5px; text-align: left; vertical-align: middle; }
                    th { text-align: center; font-weight: bold; }
                    .header { text-align: center; }
                    .header h1, .header h2, .header p { margin: 0; }
                    .header h1 { font-size: 12pt; }
                    .header h2 { font-size: 14pt; margin: 5px 0; }
                    .info { margin-top: 20px; }
                    .currency { text-align: right; }
                    .center { text-align: center; }
                    .total-row { font-weight: bold; background-color: #f2f2f2; }
                    .total-col { font-weight: bold; }
                    @media print {
                        body { -webkit-print-color-adjust: exact; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>TRƯỜNG ĐẠI HỌC HẢI PHÒNG</h1>
                    <p><strong>KHOA CÔNG NGHỆ THÔNG TIN</strong></p>
                    <hr style="width: 150px; border: 1px solid black; margin-top: 5px;">
                    ${includeList ? `<h2>PHÂN CÔNG RA ĐỀ THI, ĐÁP ÁN, DUYỆT ĐỀ THI CÁC HỌC PHẦN</h2>
                    <p><strong>HỌC KỲ I - ${yearFilterText}</strong></p>` : ''}
                </div>
                ${mainTableHtml}
                ${summaryTableHtml}
                 <div style="display: grid; grid-template-columns: 1fr 1fr; margin-top: 20px;">
                    <div></div>
                    <div style="text-align: center;">
                        <p>Hải Phòng, ${formattedPrintDate.replace("tháng", "tháng ")}</p>
                        <p style="font-weight: bold; margin-top: 5px;">TRƯỞNG KHOA</p>
                        <p style="margin-top: 80px; font-weight: bold;">${signatory}</p>
                    </div>
                </div>
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}


// --- Event Listeners ---
function addEventListeners() {
    // View Switcher
    document.getElementById('show-assignments-btn').addEventListener('click', () => switchView('assignments'));
    document.getElementById('show-exam-bank-btn').addEventListener('click', () => switchView('exam-bank'));

    // Assignment Modal
    document.getElementById('add-assignment-btn').addEventListener('click', () => openAssignmentModal());
    document.getElementById('close-assignment-modal').addEventListener('click', closeAssignmentModal);
    document.getElementById('cancel-assignment-btn').addEventListener('click', closeAssignmentModal);
    document.getElementById('assignment-form').addEventListener('submit', saveAssignment);
    
    // Exam File Modal
    document.getElementById('add-exam-btn').addEventListener('click', () => openExamFileModal());
    document.getElementById('close-exam-modal').addEventListener('click', () => document.getElementById('exam-modal').style.display = 'none');
    document.getElementById('cancel-exam-btn').addEventListener('click', () => document.getElementById('exam-modal').style.display = 'none');
    document.getElementById('exam-form').addEventListener('submit', saveExamFile);

    // Filters
    document.getElementById('filter-exam-year').addEventListener('change', () => { currentExamPage = 1; lastExamDoc = null; fetchExams(); });
    document.getElementById('filter-assignment-year').addEventListener('change', () => { currentAssignmentPage = 1; lastAssignmentDoc = null; fetchAssignments(); });
    
    // Print Modal
    document.getElementById('print-report-btn').addEventListener('click', () => {
        document.getElementById('print-date').valueAsDate = new Date();
        document.getElementById('print-options-modal').style.display = 'block'
    });
    document.getElementById('close-print-modal').addEventListener('click', () => document.getElementById('print-options-modal').style.display = 'none');
    document.getElementById('confirm-print-btn').addEventListener('click', () => {
        const printOption = document.querySelector('input[name="print-option"]:checked').value;
        const options = {
            includeList: printOption === 'both' || printOption === 'list',
            includeSummary: printOption === 'both' || printOption === 'summary',
            printDate: document.getElementById('print-date').value,
            signatory: document.getElementById('print-signatory').value,
        };
        printReport(options);
        document.getElementById('print-options-modal').style.display = 'none';
    });
    
    // Payment calculation listeners
    ['assignment-creation-type', 'assignment-creation-qty', 'assignment-review-type', 'assignment-review-qty'].forEach(id => {
        const el = document.getElementById(id);
        el.addEventListener('change', () => updatePaymentFields('assignment'));
        el.addEventListener('input', () => updatePaymentFields('assignment'));
    });
    
    // Searchable Subject Filter Listeners
    function setupSearchFilter(inputId, resultsId, hiddenId, fetchFunction) {
        const input = document.getElementById(inputId);
        const results = document.getElementById(resultsId);
        const hidden = document.getElementById(hiddenId);

        input.addEventListener('input', () => renderSubjectSearchResults(input.value, resultsId));
        input.addEventListener('focus', () => results.classList.remove('hidden'));
        document.addEventListener('click', (e) => {
            if (!input.parentElement.contains(e.target)) results.classList.add('hidden');
        });
        results.addEventListener('click', (e) => {
            if (e.target.dataset.subjectId) {
                const { subjectId, subjectName } = e.target.dataset;
                input.value = subjectName;
                if(hidden) hidden.value = subjectId;
                results.classList.add('hidden');
                if (fetchFunction) fetchFunction();
            }
        });
        input.addEventListener('change', () => {
            if (input.value === '') {
                if(hidden) hidden.value = '';
                if (fetchFunction) fetchFunction();
            }
        });
    }
    setupSearchFilter('filter-exam-subject-input', 'filter-exam-subject-results', 'filter-exam-subject-id', () => { currentExamPage = 1; lastExamDoc = null; fetchExams(); });
    setupSearchFilter('filter-assignment-subject-input', 'filter-assignment-subject-results', 'filter-assignment-subject-id', () => { currentAssignmentPage = 1; lastAssignmentDoc = null; fetchAssignments(); });
    setupSearchFilter('assignment-subject-input', 'assignment-subject-results', 'assignment-subject-id', null);


    // Pagination
    document.getElementById('exam-next-page-btn').addEventListener('click', () => { if (!isFetchingExams) { currentExamPage++; fetchExams('next'); } });
    document.getElementById('exam-prev-page-btn').addEventListener('click', () => { if (!isFetchingExams && currentExamPage > 1) { currentExamPage = 1; lastExamDoc = null; fetchExams(); } });
    document.getElementById('assignment-next-page-btn').addEventListener('click', () => { if (!isFetchingAssignments) { currentAssignmentPage++; fetchAssignments('next'); } });
    document.getElementById('assignment-prev-page-btn').addEventListener('click', () => { if (!isFetchingAssignments && currentAssignmentPage > 1) { currentAssignmentPage = 1; lastAssignmentDoc = null; fetchAssignments(); } });
    
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
