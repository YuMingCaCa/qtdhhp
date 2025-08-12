// File: js/quan-ly-nang-luc.js
// A complete, standalone module for managing departments, lecturers, subjects, and their teaching capabilities.
// This version is self-contained and does not depend on other modules for data.

import { auth, db, appId } from './portal-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    collection, onSnapshot, doc, getDoc, setDoc, addDoc, deleteDoc, writeBatch, getDocs
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// --- Self-Contained Firestore Collection References ---
const dataBasePath = `artifacts/${appId}/public/data`;
const capDepartmentsCol = collection(db, `${dataBasePath}/cap_module_departments`);
const capLecturersCol = collection(db, `${dataBasePath}/cap_module_lecturers`);
const capSubjectsCol = collection(db, `${dataBasePath}/cap_module_subjects`);
const capAssignmentsCol = collection(db, `${dataBasePath}/cap_module_assignments`);
const usersCol = collection(db, `${dataBasePath}/users`);


// --- Global State ---
const state = {
    currentUser: null,
    departments: [],
    lecturers: [],
    subjects: [],
    assignments: {}, // { lecturerId: [subjectId1, subjectId2] }
    editingId: null,
};

// --- UI Utility Functions ---
const showAlert = (message, isSuccess = false) => {
    const modal = document.getElementById('alert-modal');
    document.getElementById('alert-message').textContent = message;
    document.getElementById('alert-title').textContent = isSuccess ? "Thành công" : "Lỗi";
    modal.classList.add('active');
    document.getElementById('alert-ok-btn').onclick = () => modal.classList.remove('active');
};

const showFormModal = (title, formHtml, saveCallback) => {
    const modal = document.getElementById('form-modal');
    document.getElementById('modal-title').textContent = title;
    const form = document.getElementById('modal-form');
    form.innerHTML = formHtml;
    modal.classList.add('active');

    const saveBtn = document.getElementById('modal-save-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');

    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    
    newSaveBtn.addEventListener('click', () => {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        saveCallback(data);
    });
    cancelBtn.onclick = () => modal.classList.remove('active');
};

// --- Render Functions ---
const renderAllTables = () => {
    renderDepartmentsTable();
    renderLecturersTable();
    renderSubjectsTable();
    renderOverviewPanel();
}

const renderDepartmentsTable = () => {
    const tbody = document.getElementById('departments-table-body');
    if (!tbody) return;
    tbody.innerHTML = state.departments.map(dept => `
        <tr class="hover:bg-gray-50">
            <td class="py-2 px-4 border-b">${dept.code}</td>
            <td class="py-2 px-4 border-b">${dept.name}</td>
            <td class="py-2 px-4 border-b">
                <button data-id="${dept.id}" class="edit-department-btn text-blue-500 hover:text-blue-700 mr-2"><i class="fas fa-edit"></i></button>
                <button data-id="${dept.id}" class="delete-department-btn text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
};

const renderLecturersTable = () => {
    const tbody = document.getElementById('lecturers-table-body');
    if (!tbody) return;
    const departmentMap = new Map(state.departments.map(d => [d.id, d.name]));
    tbody.innerHTML = state.lecturers.map(lect => `
        <tr class="hover:bg-gray-50">
            <td class="py-2 px-2 border-b"><input type="checkbox" class="checkbox lecturer-checkbox" data-id="${lect.id}"></td>
            <td class="py-2 px-4 border-b">${lect.code}</td>
            <td class="py-2 px-4 border-b">${lect.name}</td>
            <td class="py-2 px-4 border-b">${departmentMap.get(lect.departmentId) || 'N/A'}</td>
            <td class="py-2 px-4 border-b">
                <button data-id="${lect.id}" class="edit-lecturer-btn text-blue-500 hover:text-blue-700 mr-2"><i class="fas fa-edit"></i></button>
                <button data-id="${lect.id}" class="delete-lecturer-btn text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
};

const renderSubjectsTable = () => {
    const tbody = document.getElementById('subjects-table-body');
    if (!tbody) return;
    tbody.innerHTML = state.subjects.map(sub => `
        <tr class="hover:bg-gray-50">
            <td class="py-2 px-2 border-b"><input type="checkbox" class="checkbox subject-checkbox" data-id="${sub.id}"></td>
            <td class="py-2 px-4 border-b">${sub.maHocPhan}</td>
            <td class="py-2 px-4 border-b">${sub.tenMonHoc}</td>
            <td class="py-2 px-4 border-b">
                <button data-id="${sub.id}" class="edit-subject-btn text-blue-500 hover:text-blue-700 mr-2"><i class="fas fa-edit"></i></button>
                <button data-id="${sub.id}" class="delete-subject-btn text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
};

const renderSubjectsForAssignment = () => {
    const container = document.getElementById('subjects-list-container');
    const placeholder = document.getElementById('subjects-placeholder');
    const saveBtn = document.getElementById('save-capabilities-btn');
    if (!container || !placeholder || !saveBtn) return;
    
    const lecturerId = document.getElementById('selected-lecturer-id').value;

    if (!lecturerId) {
        container.innerHTML = '';
        placeholder.style.display = 'block';
        saveBtn.disabled = true;
        return;
    }

    placeholder.style.display = 'none';
    const assignedSubjectIds = state.assignments[lecturerId] || [];
    container.innerHTML = '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">' +
        state.subjects.map(sub => {
            const isChecked = assignedSubjectIds.includes(sub.id);
            return `
                <label class="flex items-center p-3 bg-white border rounded-lg hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" data-subject-id="${sub.id}" class="h-5 w-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500" ${isChecked ? 'checked' : ''}>
                    <span class="ml-3 text-sm text-gray-700">${sub.tenMonHoc} (${sub.maHocPhan})</span>
                </label>
            `;
        }).join('') + '</div>';
    saveBtn.disabled = false;
};

const renderOverviewPanel = () => {
    const container = document.getElementById('overview-container');
    if (!container) return;

    const lecturerMap = new Map(state.lecturers.map(l => [l.id, l.name]));
    const subjectMap = new Map(state.subjects.map(s => [s.id, s]));

    if (Object.keys(state.assignments).length === 0) {
        container.innerHTML = `<p class="text-center text-gray-500">Chưa có năng lực nào được gán.</p>`;
        return;
    }

    let html = '';
    for (const lecturerId in state.assignments) {
        const lecturerName = lecturerMap.get(lecturerId);
        if (!lecturerName) continue;

        const subjectIds = state.assignments[lecturerId];
        if (!subjectIds || subjectIds.length === 0) continue;

        html += `
            <div class="bg-gray-50 p-4 rounded-lg">
                <h4 class="font-bold text-teal-700">${lecturerName}</h4>
                <ul class="list-disc list-inside mt-2 text-sm text-gray-600">
                    ${subjectIds.map(id => {
                        const subject = subjectMap.get(id);
                        return subject ? `<li>${subject.tenMonHoc} (${subject.maHocPhan})</li>` : '';
                    }).join('')}
                </ul>
            </div>
        `;
    }
    container.innerHTML = html || `<p class="text-center text-gray-500">Chưa có năng lực nào được gán.</p>`;
};


// --- CRUD, Import, and Cleanup Functions ---

// Generic delete function
const deleteItems = async (collectionRef, itemIds, itemName) => {
    if (itemIds.length === 0) {
        showAlert(`Vui lòng chọn ít nhất một ${itemName} để xóa.`);
        return;
    }
    if (!confirm(`Bạn có chắc muốn xóa ${itemIds.length} ${itemName} đã chọn?`)) return;

    try {
        const batch = writeBatch(db);
        itemIds.forEach(id => batch.delete(doc(collectionRef, id)));
        await batch.commit();
        showAlert(`Đã xóa ${itemIds.length} ${itemName}.`, true);
    } catch (e) {
        showAlert(`Lỗi khi xóa: ${e.message}`);
    }
};

// Generic deduplication function
const deduplicateItems = async (collectionRef, codeField, itemName) => {
    if (!confirm(`Hành động này sẽ quét và xóa tất cả ${itemName} bị trùng lặp dựa trên mã. Bạn có chắc chắn?`)) return;

    const items = [...(itemName === 'học phần' ? state.subjects : state.lecturers)];
    const codeMap = new Map();
    const duplicates = [];

    items.forEach(item => {
        const code = item[codeField];
        if (codeMap.has(code)) {
            codeMap.get(code).push(item.id);
        } else {
            codeMap.set(code, [item.id]);
        }
    });

    codeMap.forEach(ids => {
        if (ids.length > 1) {
            duplicates.push(...ids.slice(1)); // Keep the first one, mark others as duplicates
        }
    });

    if (duplicates.length === 0) {
        showAlert(`Không tìm thấy ${itemName} nào bị trùng lặp.`, true);
        return;
    }

    try {
        const batch = writeBatch(db);
        duplicates.forEach(id => batch.delete(doc(collectionRef, id)));
        await batch.commit();
        showAlert(`Đã xóa ${duplicates.length} ${itemName} bị trùng lặp.`, true);
    } catch (e) {
        showAlert(`Lỗi khi dọn dẹp: ${e.message}`);
    }
};

// Departments
const saveDepartment = async (data) => {
    if (!data.code || !data.name) {
        showAlert("Mã khoa và Tên khoa là bắt buộc.");
        return;
    }
    try {
        const docRef = state.editingId ? doc(capDepartmentsCol, state.editingId) : doc(capDepartmentsCol);
        await setDoc(docRef, data, { merge: true });
        showAlert("Lưu khoa thành công!", true);
        document.getElementById('form-modal').classList.remove('active');
    } catch (e) {
        showAlert("Lỗi lưu khoa: " + e.message);
    }
};

// Lecturers
const saveLecturer = async (data) => {
    if (!data.code || !data.name || !data.departmentId) {
        showAlert("Mã, Tên và Khoa là bắt buộc.");
        return;
    }
    try {
        const docRef = state.editingId ? doc(capLecturersCol, state.editingId) : doc(capLecturersCol);
        await setDoc(docRef, data, { merge: true });
        showAlert("Lưu giảng viên thành công!", true);
        document.getElementById('form-modal').classList.remove('active');
    } catch (e) {
        showAlert("Lỗi lưu giảng viên: " + e.message);
    }
};

const downloadLecturerTemplate = () => {
    const filename = "Mau_Import_GiangVien.xlsx";
    const data = [{
        maGiangVien: "GV001",
        tenGiangVien: "Nguyễn Văn A",
        maKhoa: "CNTT" // Mã khoa này phải tồn tại trong tab Quản lý Khoa
    }];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "GiangVien");
    XLSX.writeFile(wb, filename);
};

const handleImportLecturers = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            
            if (jsonData.length === 0) throw new Error("File không có dữ liệu.");

            const departmentCodeMap = new Map(state.departments.map(d => [d.code, d.id]));
            const existingLecturerCodes = new Set(state.lecturers.map(l => l.code));
            const batch = writeBatch(db);
            let count = 0;
            let skipped = 0;
            let errors = [];

            for (const row of jsonData) {
                const lecturerCode = String(row.maGiangVien || '').trim();
                const lecturerName = String(row.tenGiangVien || '').trim();
                const departmentCode = String(row.maKhoa || '').trim();

                if (lecturerCode && lecturerName && departmentCode) {
                    if (existingLecturerCodes.has(lecturerCode)) {
                        skipped++;
                        continue;
                    }
                    const departmentId = departmentCodeMap.get(departmentCode);
                    if (departmentId) {
                        const docRef = doc(capLecturersCol);
                        batch.set(docRef, { 
                            code: lecturerCode, 
                            name: lecturerName,
                            departmentId: departmentId 
                        });
                        existingLecturerCodes.add(lecturerCode); // Prevent duplicates within the same file
                        count++;
                    } else {
                        errors.push(`Không tìm thấy khoa với mã '${departmentCode}' cho GV '${lecturerName}'.`);
                    }
                }
            }
            
            if (count > 0) await batch.commit();
            
            let resultMsg = `Kết quả import:\n- Thêm mới: ${count} giảng viên.\n- Bỏ qua: ${skipped} giảng viên đã tồn tại.`;
            if(errors.length > 0) {
                resultMsg += `\n- Lỗi: ${errors.length} dòng.\n` + errors.join('\n');
            }
            showAlert(resultMsg, true);

        } catch (error) {
            showAlert("Lỗi import: " + error.message);
        } finally {
            document.getElementById('lecturer-import-modal').classList.remove('active');
        }
    };
    reader.readAsArrayBuffer(file);
};


// Subjects
const saveSubject = async (data) => {
    if (!data.maHocPhan || !data.tenMonHoc) {
        showAlert("Mã và Tên học phần là bắt buộc.");
        return;
    }
    try {
        const docRef = state.editingId ? doc(capSubjectsCol, state.editingId) : doc(capSubjectsCol);
        await setDoc(docRef, data, { merge: true });
        showAlert("Lưu học phần thành công!", true);
        document.getElementById('form-modal').classList.remove('active');
    } catch (e) {
        showAlert("Lỗi lưu học phần: " + e.message);
    }
};

const downloadSubjectTemplate = () => {
    const filename = "Mau_Import_HocPhan.xlsx";
    const data = [{
        maHocPhan: "IT101",
        tenMonHoc: "Nhập môn Lập trình"
    }];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "HocPhan");
    XLSX.writeFile(wb, filename);
};

const handleImportSubjects = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            
            if (jsonData.length === 0) throw new Error("File không có dữ liệu.");

            const existingSubjectCodes = new Set(state.subjects.map(s => s.maHocPhan));
            const batch = writeBatch(db);
            let count = 0;
            let skipped = 0;

            for (const row of jsonData) {
                const code = String(row.maHocPhan || '').trim();
                const name = String(row.tenMonHoc || '').trim();
                if (code && name) {
                    if (existingSubjectCodes.has(code)) {
                        skipped++;
                        continue;
                    }
                    const docRef = doc(capSubjectsCol);
                    batch.set(docRef, { maHocPhan: code, tenMonHoc: name });
                    existingSubjectCodes.add(code); // Prevent duplicates within the same file
                    count++;
                }
            }
            if (count > 0) await batch.commit();
            showAlert(`Kết quả import:\n- Thêm mới: ${count} học phần.\n- Bỏ qua: ${skipped} học phần đã tồn tại.`, true);
        } catch (error) {
            showAlert("Lỗi import: " + error.message);
        } finally {
            document.getElementById('subject-import-modal').classList.remove('active');
        }
    };
    reader.readAsArrayBuffer(file);
};

// Capabilities
const saveCapabilities = async () => {
    const lecturerId = document.getElementById('selected-lecturer-id').value;
    if (!lecturerId) {
        showAlert("Vui lòng chọn một giảng viên trước khi lưu.");
        return;
    }

    const checkedBoxes = document.querySelectorAll('#subjects-list-container input:checked');
    const subjectIds = Array.from(checkedBoxes).map(box => box.dataset.subjectId);

    try {
        await setDoc(doc(capAssignmentsCol, lecturerId), { subjectIds });
        showAlert("Lưu năng lực thành công!", true);
    } catch (e) {
        showAlert("Lỗi lưu năng lực: " + e.message);
    }
};

const downloadCapabilityTemplate = () => {
    const filename = "Mau_Import_NangLuc.xlsx";
    const data = [{
        maGiangVien: "GV001",
        maHocPhan: "IT101"
    }];
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "NangLuc");
    XLSX.writeFile(wb, filename);
};

const handleImportCapabilities = (file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            
            if (jsonData.length === 0) throw new Error("File không có dữ liệu.");

            const lecturerCodeMap = new Map(state.lecturers.map(l => [l.code, l.id]));
            const subjectCodeMap = new Map(state.subjects.map(s => [s.maHocPhan, s.id]));
            
            const assignmentsToImport = new Map();
            let errors = [];

            for (const row of jsonData) {
                const lecturerCode = String(row.maGiangVien || '').trim();
                const subjectCode = String(row.maHocPhan || '').trim();

                if (lecturerCode && subjectCode) {
                    const lecturerId = lecturerCodeMap.get(lecturerCode);
                    const subjectId = subjectCodeMap.get(subjectCode);

                    if (lecturerId && subjectId) {
                        if (!assignmentsToImport.has(lecturerId)) {
                            // Import overwrites old capabilities for that lecturer
                            assignmentsToImport.set(lecturerId, new Set());
                        }
                        assignmentsToImport.get(lecturerId).add(subjectId);
                    } else {
                        if (!lecturerId) errors.push(`Không tìm thấy giảng viên mã '${lecturerCode}'.`);
                        if (!subjectId) errors.push(`Không tìm thấy học phần mã '${subjectCode}'.`);
                    }
                }
            }
            
            if (assignmentsToImport.size > 0) {
                const batch = writeBatch(db);
                for (const [lecturerId, subjectIdsSet] of assignmentsToImport.entries()) {
                    const docRef = doc(capAssignmentsCol, lecturerId);
                    batch.set(docRef, { subjectIds: Array.from(subjectIdsSet) });
                }
                await batch.commit();
                
                let successMsg = `Import thành công năng lực cho ${assignmentsToImport.size} giảng viên!`;
                if (errors.length > 0) {
                    successMsg += `\nCác lỗi sau đã bị bỏ qua:\n` + [...new Set(errors)].join('\n');
                }
                showAlert(successMsg, true);
            } else {
                 showAlert("Không có dữ liệu hợp lệ để import. Vui lòng kiểm tra lại mã GV và mã HP trong file.\n" + [...new Set(errors)].join('\n'));
            }

        } catch (error) {
            showAlert("Lỗi import: " + error.message);
        } finally {
            document.getElementById('capability-import-modal').classList.remove('active');
        }
    };
    reader.readAsArrayBuffer(file);
};


// --- Event Listeners Setup ---
const addEventListeners = () => {
    // Tab switching
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
            button.classList.add('active');
            document.getElementById(`tab-panel-${tabName}`).classList.add('active');
        });
    });

    // Department actions
    document.getElementById('add-department-btn').onclick = () => {
        state.editingId = null;
        const formHtml = `
            <div><label class="block text-sm">Mã Khoa</label><input name="code" class="w-full p-2 border rounded"></div>
            <div><label class="block text-sm">Tên Khoa</label><input name="name" class="w-full p-2 border rounded"></div>
        `;
        showFormModal("Thêm Khoa mới", formHtml, saveDepartment);
    };

    document.getElementById('departments-table-body').addEventListener('click', e => {
        const editBtn = e.target.closest('.edit-department-btn');
        const deleteBtn = e.target.closest('.delete-department-btn');
        if (editBtn) {
            state.editingId = editBtn.dataset.id;
            const dept = state.departments.find(d => d.id === state.editingId);
            const formHtml = `
                <div><label class="block text-sm">Mã Khoa</label><input name="code" value="${dept.code}" class="w-full p-2 border rounded"></div>
                <div><label class="block text-sm">Tên Khoa</label><input name="name" value="${dept.name}" class="w-full p-2 border rounded"></div>
            `;
            showFormModal("Chỉnh sửa Khoa", formHtml, saveDepartment);
        }
        if (deleteBtn) {
            if (confirm("Bạn có chắc muốn xóa khoa này?")) {
                deleteDoc(doc(capDepartmentsCol, deleteBtn.dataset.id));
            }
        }
    });

    // Lecturer actions
    document.getElementById('add-lecturer-btn').onclick = () => {
        state.editingId = null;
        const deptOptions = state.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        const formHtml = `
            <div><label class="block text-sm">Mã Giảng viên</label><input name="code" class="w-full p-2 border rounded"></div>
            <div><label class="block text-sm">Tên Giảng viên</label><input name="name" class="w-full p-2 border rounded"></div>
            <div><label class="block text-sm">Khoa</label><select name="departmentId" class="w-full p-2 border rounded">${deptOptions}</select></div>
        `;
        showFormModal("Thêm Giảng viên mới", formHtml, saveLecturer);
    };
    
     document.getElementById('lecturers-table-body').addEventListener('click', e => {
        const editBtn = e.target.closest('.edit-lecturer-btn');
        const deleteBtn = e.target.closest('.delete-lecturer-btn');
        if (editBtn) {
            state.editingId = editBtn.dataset.id;
            const lect = state.lecturers.find(l => l.id === state.editingId);
            const deptOptions = state.departments.map(d => `<option value="${d.id}" ${d.id === lect.departmentId ? 'selected' : ''}>${d.name}</option>`).join('');
            const formHtml = `
                <div><label class="block text-sm">Mã Giảng viên</label><input name="code" value="${lect.code}" class="w-full p-2 border rounded"></div>
                <div><label class="block text-sm">Tên Giảng viên</label><input name="name" value="${lect.name}" class="w-full p-2 border rounded"></div>
                <div><label class="block text-sm">Khoa</label><select name="departmentId" class="w-full p-2 border rounded">${deptOptions}</select></div>
            `;
            showFormModal("Chỉnh sửa Giảng viên", formHtml, saveLecturer);
        }
        if (deleteBtn) {
            if (confirm("Bạn có chắc muốn xóa giảng viên này?")) {
                deleteDoc(doc(capLecturersCol, deleteBtn.dataset.id));
            }
        }
    });

    document.getElementById('open-lecturer-import-modal-btn').onclick = () => {
        document.getElementById('lecturer-import-modal').classList.add('active');
    };
    document.getElementById('lecturer-import-cancel-btn').onclick = () => {
        document.getElementById('lecturer-import-modal').classList.remove('active');
    };
    document.getElementById('lecturer-import-start-btn').onclick = () => {
        const fileInput = document.getElementById('lecturer-import-file-input');
        if (fileInput.files.length > 0) {
            handleImportLecturers(fileInput.files[0]);
        } else {
            showAlert("Vui lòng chọn một file.");
        }
    };
    document.getElementById('download-lecturer-template-btn').onclick = downloadLecturerTemplate;
    document.getElementById('deduplicate-lecturers-btn').onclick = () => deduplicateItems(capLecturersCol, 'code', 'giảng viên');
    document.getElementById('delete-selected-lecturers-btn').onclick = () => {
        const selectedIds = [...document.querySelectorAll('.lecturer-checkbox:checked')].map(cb => cb.dataset.id);
        deleteItems(capLecturersCol, selectedIds, 'giảng viên');
    };


    // Subject actions
    document.getElementById('add-subject-btn').onclick = () => {
        state.editingId = null;
        const formHtml = `
            <div><label class="block text-sm">Mã Học phần</label><input name="maHocPhan" class="w-full p-2 border rounded"></div>
            <div><label class="block text-sm">Tên Học phần</label><input name="tenMonHoc" class="w-full p-2 border rounded"></div>
        `;
        showFormModal("Thêm Học phần mới", formHtml, saveSubject);
    };
    
    document.getElementById('subjects-table-body').addEventListener('click', e => {
        const editBtn = e.target.closest('.edit-subject-btn');
        const deleteBtn = e.target.closest('.delete-subject-btn');
        if (editBtn) {
            state.editingId = editBtn.dataset.id;
            const sub = state.subjects.find(s => s.id === state.editingId);
            const formHtml = `
                <div><label class="block text-sm">Mã Học phần</label><input name="maHocPhan" value="${sub.maHocPhan}" class="w-full p-2 border rounded"></div>
                <div><label class="block text-sm">Tên Học phần</label><input name="tenMonHoc" value="${sub.tenMonHoc}" class="w-full p-2 border rounded"></div>
            `;
            showFormModal("Chỉnh sửa Học phần", formHtml, saveSubject);
        }
        if (deleteBtn) {
            if (confirm("Bạn có chắc muốn xóa học phần này?")) {
                deleteDoc(doc(capSubjectsCol, deleteBtn.dataset.id));
            }
        }
    });
    
    document.getElementById('open-subject-import-modal-btn').onclick = () => {
        document.getElementById('subject-import-modal').classList.add('active');
    };
    document.getElementById('subject-import-cancel-btn').onclick = () => {
        document.getElementById('subject-import-modal').classList.remove('active');
    };
    document.getElementById('subject-import-start-btn').onclick = () => {
        const fileInput = document.getElementById('subject-import-file-input');
        if (fileInput.files.length > 0) {
            handleImportSubjects(fileInput.files[0]);
        } else {
            showAlert("Vui lòng chọn một file.");
        }
    };
    document.getElementById('download-subject-template-btn').onclick = downloadSubjectTemplate;
    document.getElementById('deduplicate-subjects-btn').onclick = () => deduplicateItems(capSubjectsCol, 'maHocPhan', 'học phần');
    document.getElementById('delete-selected-subjects-btn').onclick = () => {
        const selectedIds = [...document.querySelectorAll('.subject-checkbox:checked')].map(cb => cb.dataset.id);
        deleteItems(capSubjectsCol, selectedIds, 'học phần');
    };

    
    // Capability actions
    document.getElementById('open-capability-import-modal-btn').onclick = () => {
        document.getElementById('capability-import-modal').classList.add('active');
    };
    document.getElementById('capability-import-cancel-btn').onclick = () => {
        document.getElementById('capability-import-modal').classList.remove('active');
    };
    document.getElementById('capability-import-start-btn').onclick = () => {
        const fileInput = document.getElementById('capability-import-file-input');
        if (fileInput.files.length > 0) {
            handleImportCapabilities(fileInput.files[0]);
        } else {
            showAlert("Vui lòng chọn một file.");
        }
    };
    document.getElementById('download-capability-template-btn').onclick = downloadCapabilityTemplate;

    document.getElementById('save-capabilities-btn').onclick = saveCapabilities;
    
    // Bulk selection listeners
    document.getElementById('select-all-subjects').addEventListener('change', e => {
        document.querySelectorAll('.subject-checkbox').forEach(cb => cb.checked = e.target.checked);
        document.getElementById('delete-selected-subjects-btn').classList.toggle('hidden', !e.target.checked);
    });
     document.getElementById('select-all-lecturers').addEventListener('change', e => {
        document.querySelectorAll('.lecturer-checkbox').forEach(cb => cb.checked = e.target.checked);
        document.getElementById('delete-selected-lecturers-btn').classList.toggle('hidden', !e.target.checked);
    });

    document.getElementById('subjects-table-body').addEventListener('change', e => {
        if(e.target.classList.contains('subject-checkbox')) {
            const anyChecked = [...document.querySelectorAll('.subject-checkbox')].some(cb => cb.checked);
            document.getElementById('delete-selected-subjects-btn').classList.toggle('hidden', !anyChecked);
        }
    });
    document.getElementById('lecturers-table-body').addEventListener('change', e => {
        if(e.target.classList.contains('lecturer-checkbox')) {
            const anyChecked = [...document.querySelectorAll('.lecturer-checkbox')].some(cb => cb.checked);
            document.getElementById('delete-selected-lecturers-btn').classList.toggle('hidden', !anyChecked);
        }
    });

    // --- NEW: Smart Search Event Listeners ---
    const searchInput = document.getElementById('lecturer-search-input');
    const searchResults = document.getElementById('lecturer-search-results');
    const selectedLecturerIdInput = document.getElementById('selected-lecturer-id');
    const viewBtn = document.getElementById('view-capabilities-btn');

    searchInput.addEventListener('input', () => {
        const searchTerm = searchInput.value.toLowerCase();
        
        // When user types, disable the view button and clear selection
        selectedLecturerIdInput.value = '';
        viewBtn.disabled = true;

        if (searchTerm.length < 2) {
            searchResults.innerHTML = '';
            searchResults.classList.add('hidden');
            return;
        }

        const filtered = state.lecturers.filter(l => 
            l.name.toLowerCase().includes(searchTerm) || 
            l.code.toLowerCase().includes(searchTerm)
        );

        if (filtered.length > 0) {
            searchResults.innerHTML = filtered.map(l => 
                `<div class="p-2 hover:bg-teal-100 cursor-pointer search-result-item" data-id="${l.id}" data-name="${l.name}">
                    ${l.name} (${l.code})
                 </div>`
            ).join('');
            searchResults.classList.remove('hidden');
        } else {
            searchResults.innerHTML = '<div class="p-2 text-gray-500">Không tìm thấy giảng viên.</div>';
            searchResults.classList.remove('hidden');
        }
    });

    searchResults.addEventListener('click', (e) => {
        const item = e.target.closest('.search-result-item');
        if (!item) return;

        const lecturerId = item.dataset.id;
        const lecturerName = item.dataset.name;

        searchInput.value = lecturerName;
        selectedLecturerIdInput.value = lecturerId;
        
        searchResults.classList.add('hidden');
        
        // **FIX**: Enable the view button after selection
        viewBtn.disabled = false;
    });
    
    // **FIX**: Add event listener for the view button
    viewBtn.addEventListener('click', renderSubjectsForAssignment);
    
    // Hide results when clicking outside
    document.addEventListener('click', (e) => {
        const container = document.getElementById('lecturer-search-container');
        if (!container.contains(e.target)) {
            searchResults.classList.add('hidden');
        }
    });

    // Logout
    document.getElementById('logout-btn').onclick = () => signOut(auth);
};

// --- Data Subscription ---
const attachBaseListeners = () => {
    const sortByName = (a, b) => (a.name || a.tenMonHoc || '').localeCompare(b.name || b.tenMonHoc || '');

    onSnapshot(capDepartmentsCol, snapshot => {
        state.departments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(sortByName);
    });
    onSnapshot(capLecturersCol, snapshot => {
        state.lecturers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(sortByName);
    });
    onSnapshot(capSubjectsCol, snapshot => {
        state.subjects = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(sortByName);
    });
    onSnapshot(capAssignmentsCol, snapshot => {
        state.assignments = {};
        snapshot.docs.forEach(doc => {
            state.assignments[doc.id] = doc.data().subjectIds || [];
        });
    });
};

// --- Initialization ---
const initializeApp = async () => {
    // **FIX**: Use Promise.all to wait for all initial data fetches
    const sortByName = (a, b) => (a.name || a.tenMonHoc || '').localeCompare(b.name || b.tenMonHoc || '');
    
    try {
        const [deptsSnap, lectsSnap, subsSnap, assignsSnap] = await Promise.all([
            getDocs(capDepartmentsCol),
            getDocs(capLecturersCol),
            getDocs(capSubjectsCol),
            getDocs(capAssignmentsCol)
        ]);

        state.departments = deptsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(sortByName);
        state.lecturers = lectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(sortByName);
        state.subjects = subsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort(sortByName);
        state.assignments = {};
        assignsSnap.docs.forEach(doc => {
            state.assignments[doc.id] = doc.data().subjectIds || [];
        });

        // Now that all data is loaded, render everything
        renderAllTables();
        
        // Then, attach real-time listeners for subsequent updates
        attachBaseListeners();

    } catch (error) {
        console.error("Error loading initial data:", error);
        showAlert("Không thể tải dữ liệu ban đầu. Vui lòng tải lại trang.");
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(usersCol, user.uid));
            state.currentUser = userDoc.exists() ? { uid: user.uid, ...userDoc.data() } : { uid: user.uid, email: user.email, role: 'viewer' };
            
            if (state.currentUser.role !== 'admin') {
                 document.body.innerHTML = `<div class="text-center p-10"><h1>Không có quyền truy cập</h1></div>`;
                 document.getElementById('main-spinner').style.display = 'none';
                 return;
            }
            
            document.getElementById('user-email').textContent = state.currentUser.email;
            document.getElementById('app-content').classList.remove('hidden');
            
            addEventListeners();
        } else {
            window.location.href = 'index.html';
        }
        document.getElementById('main-spinner').style.display = 'none';
    });
};

document.addEventListener('DOMContentLoaded', initializeApp);
