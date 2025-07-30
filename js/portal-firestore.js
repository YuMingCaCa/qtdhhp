// File: js/portal-firestore.js
// Module này chứa tất cả các hàm tương tác trực tiếp với Firestore.

import { getFirestore, collection, getDocs, addDoc, serverTimestamp, query, where, doc, updateDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId } from './portal-config.js';

const jobsColPath = `artifacts/${appId}/public/data/jobs`;
const usersColPath = `artifacts/${appId}/public/data/users`;
const applicationsColPath = `artifacts/${appId}/public/data/applications`;
const profilesColPath = `artifacts/${appId}/public/data/profiles`;
const companiesColPath = `artifacts/${appId}/public/data/companies`;

/**
 * Lấy tất cả các tin tuyển dụng từ Firestore.
 * @returns {Promise<Array<Object>>} Danh sách các tin tuyển dụng.
 */
export async function fetchJobs() {
    const jobsCollection = collection(db, jobsColPath);
    const jobSnapshot = await getDocs(jobsCollection);
    return jobSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Lấy các tin tuyển dụng được đăng bởi một người dùng cụ thể.
 * @param {string} userId - ID của người đăng tin.
 * @returns {Promise<Array<Object>>} Danh sách các tin tuyển dụng.
 */
export async function fetchJobsByOwner(userId) {
    if (!userId) return [];
    const q = query(collection(db, jobsColPath), where("ownerId", "==", userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Lấy thông tin chi tiết của các tin tuyển dụng dựa trên danh sách ID.
 * @param {Array<string>} jobIds - Danh sách các ID của tin tuyển dụng.
 * @returns {Promise<Array<Object>>} Danh sách chi tiết các tin tuyển dụng.
 */
export async function fetchJobsByIds(jobIds) {
    if (!jobIds || jobIds.length === 0) {
        return [];
    }
    const jobsRef = collection(db, jobsColPath);
    const q = query(jobsRef, where('__name__', 'in', jobIds));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}


/**
 * Lưu một tin tuyển dụng (mới hoặc cập nhật) vào Firestore.
 * @param {Object} jobData - Dữ liệu của tin tuyển dụng.
 * @param {string|null} editingId - ID của tin đang sửa, hoặc null nếu là tin mới.
 */
export async function saveJob(jobData, editingId) {
    if (editingId) {
        // Cập nhật tin đã có
        const jobDocRef = doc(db, jobsColPath, editingId);
        await updateDoc(jobDocRef, jobData);
    } else {
        // Thêm tin mới
        await addDoc(collection(db, jobsColPath), { ...jobData, createdAt: serverTimestamp() });
    }
}

/**
 * Xóa một tin tuyển dụng khỏi Firestore.
 * @param {string} jobId - ID của tin tuyển dụng cần xóa.
 */
export async function deleteJob(jobId) {
    await deleteDoc(doc(db, jobsColPath, jobId));
}

/**
 * Lấy tất cả người dùng từ Firestore.
 * @returns {Promise<Array<Object>>} Danh sách người dùng.
 */
export async function fetchUsers() {
    const userSnapshot = await getDocs(collection(db, usersColPath));
    return userSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Cập nhật vai trò của một người dùng trong Firestore.
 * @param {string} userId - ID của người dùng.
 * @param {string} newRole - Vai trò mới ('viewer' hoặc 'business').
 */
export async function updateUserRole(userId, newRole) {
    const userDocRef = doc(db, usersColPath, userId);
    await updateDoc(userDocRef, { role: newRole });
}

/**
 * Lưu đơn ứng tuyển của người dùng vào một công việc.
 * @param {string} jobId - ID của công việc.
 * @param {string} userId - ID của người dùng ứng tuyển.
 * @param {string} userEmail - Email của người dùng ứng tuyển.
 */
export async function applyForJob(jobId, userId, userEmail) {
    await addDoc(collection(db, applicationsColPath), {
        jobId: jobId,
        userId: userId,
        userEmail: userEmail,
        appliedAt: serverTimestamp(),
        status: 'Đã nộp', // Trạng thái mặc định
        notes: '' // Thêm trường ghi chú
    });
}

/**
 * Lấy tất cả các đơn ứng tuyển của một người dùng.
 * @param {string} userId - ID của người dùng.
 * @returns {Promise<Array<Object>>} Danh sách các đơn ứng tuyển.
 */
export async function fetchUserApplications(userId) {
    if (!userId) return [];
    const q = query(collection(db, applicationsColPath), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Kiểm tra xem một người dùng đã có hồ sơ (CV) hay chưa.
 * @param {string} userId - ID của người dùng.
 * @returns {Promise<boolean>} True nếu có hồ sơ, false nếu không.
 */
export async function checkUserProfileExists(userId) {
    if (!userId) return false;
    const profileDocRef = doc(db, profilesColPath, userId);
    const profileDoc = await getDoc(profileDocRef);
    return profileDoc.exists();
}

/**
 * Lấy danh sách ứng viên cho một công việc cụ thể.
 * @param {string} jobId - ID của công việc.
 * @returns {Promise<Array<Object>>} Danh sách các ứng viên.
 */
export async function fetchApplicantsForJob(jobId) {
    const q = query(collection(db, applicationsColPath), where("jobId", "==", jobId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Cập nhật trạng thái của một đơn ứng tuyển.
 * @param {string} applicationId - ID của đơn ứng tuyển.
 * @param {string} newStatus - Trạng thái mới.
 */
export async function updateApplicationStatus(applicationId, newStatus) {
    const applicationDocRef = doc(db, applicationsColPath, applicationId);
    await updateDoc(applicationDocRef, { status: newStatus });
}

/**
 * Cập nhật ghi chú của một đơn ứng tuyển.
 * @param {string} applicationId - ID của đơn ứng tuyển.
 * @param {string} newNote - Ghi chú mới.
 */
export async function updateApplicationNote(applicationId, newNote) {
    const applicationDocRef = doc(db, applicationsColPath, applicationId);
    await updateDoc(applicationDocRef, { notes: newNote });
}


/**
 * Lấy hồ sơ của một công ty dựa trên ID của người sở hữu.
 * @param {string} userId - ID của người dùng (chủ công ty).
 * @returns {Promise<Object|null>} Dữ liệu hồ sơ công ty hoặc null.
 */
export async function fetchCompanyProfile(userId) {
    if (!userId) return null;
    const docRef = doc(db, companiesColPath, userId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
}

/**
 * Lấy tất cả hồ sơ công ty và trả về dưới dạng một map.
 * @returns {Promise<Object>} Một map với key là ID người sở hữu và value là dữ liệu công ty.
 */
export async function fetchAllCompanies() {
    const companySnapshot = await getDocs(collection(db, companiesColPath));
    const companiesMap = {};
    companySnapshot.forEach(doc => {
        companiesMap[doc.id] = { id: doc.id, ...doc.data() };
    });
    return companiesMap;
}

/**
 * Lấy dữ liệu từ nhiều collection cùng lúc cho trang thống kê.
 * @returns {Promise<Object>} Một object chứa dữ liệu từ các collection.
 */
export async function fetchAllDataForStats() {
    const [jobsSnapshot, companiesSnapshot, profilesSnapshot, applicationsSnapshot] = await Promise.all([
        getDocs(collection(db, jobsColPath)),
        getDocs(collection(db, companiesColPath)),
        getDocs(collection(db, profilesColPath)),
        getDocs(collection(db, applicationsColPath))
    ]);
    return {
        jobs: jobsSnapshot.docs.map(doc => doc.data()),
        jobsCount: jobsSnapshot.size,
        companiesCount: companiesSnapshot.size,
        profilesCount: profilesSnapshot.size,
        applicationsCount: applicationsSnapshot.size
    };
}

/**
 * Lấy tất cả hồ sơ sinh viên từ Firestore.
 * @returns {Promise<Array<Object>>} Danh sách hồ sơ.
 */
export async function fetchAllProfiles() {
    const profilesSnapshot = await getDocs(collection(db, profilesColPath));
    return profilesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
