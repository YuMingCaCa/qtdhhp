// File: js/portal-firestore.js
// Module này chứa tất cả các hàm tương tác trực tiếp với Firestore.

import { getFirestore, collection, getDocs, addDoc, serverTimestamp, query, where, doc, updateDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { db, appId } from './portal-config.js';

const jobsColPath = `artifacts/${appId}/public/data/jobs`;
const usersColPath = `artifacts/${appId}/public/data/users`;
const applicationsColPath = `artifacts/${appId}/public/data/applications`;
const profilesColPath = `artifacts/${appId}/public/data/profiles`; // Collection mới cho hồ sơ

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
        appliedAt: serverTimestamp()
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
    return querySnapshot.docs.map(doc => doc.data());
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
