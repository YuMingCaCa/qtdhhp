import { auth, db, appId } from './portal-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { 
    collection, onSnapshot, doc, getDoc, updateDoc, writeBatch, query, getDocs, where
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

const basePath = `artifacts/${appId}/public/data`;
const studentsCol = collection(db, `${basePath}/students`);
const departmentsCol = collection(db, `${basePath}/departments`);
const usersCol = collection(db, `${basePath}/users`);

let currentUserInfo = null;
let allStudents = [];
let allDepartments = [];
let filteredStudents = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 20;

// UI Elements
const tbody = document.getElementById('students-table-body');
const filterDept = document.getElementById('filter-department');
const filterCourse = document.getElementById('filter-course');
const filterClass = document.getElementById('filter-class');
const filterStatus = document.getElementById('filter-status');
const searchInput = document.getElementById('search-input');

async function initializeApp() {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            const userDoc = await getDoc(doc(usersCol, user.uid));
            currentUserInfo = userDoc.exists() ? { uid: user.uid, ...userDoc.data() } : { uid: user.uid, role: 'viewer', email: user.email };
            document.getElementById('user-email').textContent = currentUserInfo.email;
            document.getElementById('app-content').classList.remove('hidden');
            
            updateUIForRole();
            loadDepartments();
            loadStudents();
            setupEventListeners();
        } else {
            window.location.href = 'index.html';
        }
    });
}

function updateUIForRole() {
    const isAdmin = currentUserInfo.role === 'admin';
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = isAdmin ? '' : 'none';
    });
}

function loadDepartments() {
    onSnapshot(query(departmentsCol), (snapshot) => {
        allDepartments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        filterDept.innerHTML = '<option value="all">Tất cả Khoa</option>' + allDepartments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
    });
}

function loadStudents() {
    onSnapshot(query(studentsCol), (snapshot) => {
        allStudents = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                ...data,
                status: data.status || 'Đang học'
            };
        });
        updateFilters();
        applyFilters();
    });
}

function updateFilters() {
    const courses = [...new Set(allStudents.map(s => s.course).filter(Boolean))].sort();
    const currentCourse = filterCourse.value;
    filterCourse.innerHTML = '<option value="all">Tất cả Khóa</option>' + courses.map(c => `<option value="${c}">${c}</option>`).join('');
    if(courses.includes(currentCourse)) filterCourse.value = currentCourse;

    const classes = [...new Set(allStudents.map(s => s.class).filter(Boolean))].sort();
    const currentClass = filterClass.value;
    filterClass.innerHTML = '<option value="all">Tất cả Lớp</option>' + classes.map(c => `<option value="${c}">${c}</option>`).join('');
    if(classes.includes(currentClass)) filterClass.value = currentClass;
}

function applyFilters() {
    const deptId = filterDept.value;
    const course = filterCourse.value;
    const cls = filterClass.value;
    const status = filterStatus.value;
    const search = searchInput.value.toLowerCase();

    filteredStudents = allStudents.filter(s => {
        if (deptId !== 'all' && s.departmentId !== deptId) return false;
        if (course !== 'all' && s.course !== course) return false;
        if (cls !== 'all' && s.class !== cls) return false;
        if (status !== 'all' && s.status !== status) return false;
        if (search && !s.name.toLowerCase().includes(search) && !(s.studentId && s.studentId.toLowerCase().includes(search))) return false;
        return true;
    });

    updateDashboard();
    currentPage = 1;
    renderTable();
}

function updateDashboard() {
    document.getElementById('stat-total').textContent = filteredStudents.length;
    document.getElementById('stat-active').textContent = filteredStudents.filter(s => s.status === 'Đang học').length;
    document.getElementById('stat-dropped').textContent = filteredStudents.filter(s => s.status === 'Bỏ học').length;
    document.getElementById('stat-reserved').textContent = filteredStudents.filter(s => s.status === 'Bảo lưu').length;
}

function renderTable() {
    const isAdmin = currentUserInfo.role === 'admin';
    tbody.innerHTML = '';
    
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageData = filteredStudents.slice(start, end);

    if(pageData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 8 : 7}" class="text-center p-4">Không có dữ liệu</td></tr>`;
    } else {
        pageData.forEach(s => {
            let statusClass = 'bg-green-100 text-green-800';
            if (s.status === 'Bỏ học') statusClass = 'bg-red-100 text-red-800';
            else if (s.status === 'Bảo lưu') statusClass = 'bg-yellow-100 text-yellow-800';
            else if (s.status === 'Tốt nghiệp') statusClass = 'bg-blue-100 text-blue-800';

            const row = document.createElement('tr');
            row.innerHTML = `
                <td class="p-2 text-center admin-only" style="${isAdmin ? '' : 'display:none;'}"><input type="checkbox" class="student-checkbox" value="${s.id}"></td>
                <td class="px-4 py-2 font-semibold">${s.studentId || ''}</td>
                <td class="px-4 py-2">${s.name}</td>
                <td class="px-4 py-2 text-center">${s.course || ''}</td>
                <td class="px-4 py-2 text-center">${s.class || ''}</td>
                <td class="px-4 py-2 text-center"><span class="px-2 py-1 rounded-full text-xs font-bold ${statusClass}">${s.status}</span></td>
                <td class="px-4 py-2 text-sm text-gray-600">${s.statusNote || ''} <br><span class="text-xs italic">${s.statusDate ? `(${s.statusDate})` : ''}</span></td>
                <td class="px-4 py-2 text-center admin-only" style="${isAdmin ? '' : 'display:none;'}">
                    <button class="text-blue-500 hover:text-blue-700" onclick="window.editStudent('${s.id}')"><i class="fas fa-edit"></i></button>
                </td>
            `;
            tbody.appendChild(row);
        });
    }

    const totalPages = Math.ceil(filteredStudents.length / ITEMS_PER_PAGE) || 1;
    document.getElementById('page-info').textContent = `Trang ${currentPage} / ${totalPages}`;
    document.getElementById('btn-prev').disabled = currentPage === 1;
    document.getElementById('btn-next').disabled = currentPage === totalPages;
}

function setupEventListeners() {
    filterDept.addEventListener('change', applyFilters);
    filterCourse.addEventListener('change', applyFilters);
    filterClass.addEventListener('change', applyFilters);
    filterStatus.addEventListener('change', applyFilters);
    searchInput.addEventListener('input', applyFilters);

    document.getElementById('btn-prev').addEventListener('click', () => { if(currentPage > 1) { currentPage--; renderTable(); } });
    document.getElementById('btn-next').addEventListener('click', () => { 
        const totalPages = Math.ceil(filteredStudents.length / ITEMS_PER_PAGE);
        if(currentPage < totalPages) { currentPage++; renderTable(); } 
    });

    document.getElementById('logout-btn').addEventListener('click', () => signOut(auth));

    document.getElementById('select-all').addEventListener('change', (e) => {
        document.querySelectorAll('.student-checkbox').forEach(cb => cb.checked = e.target.checked);
    });

    document.getElementById('btn-update-status').addEventListener('click', () => {
        const selected = document.querySelectorAll('.student-checkbox:checked');
        if(selected.length === 0) {
            alert('Vui lòng chọn ít nhất một sinh viên.');
            return;
        }
        document.getElementById('update-count').textContent = selected.length;
        document.getElementById('status-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('status-note').value = '';
        document.getElementById('update-status-modal').style.display = 'flex';
    });

    document.getElementById('update-status-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const selected = Array.from(document.querySelectorAll('.student-checkbox:checked')).map(cb => cb.value);
        const newStatus = document.getElementById('new-status').value;
        const statusDate = document.getElementById('status-date').value;
        const statusNote = document.getElementById('status-note').value;

        const batch = writeBatch(db);
        selected.forEach(id => {
            batch.update(doc(studentsCol, id), { status: newStatus, statusDate, statusNote });
        });

        try {
            await batch.commit();
            alert('Cập nhật trạng thái thành công!');
            document.getElementById('update-status-modal').style.display = 'none';
            document.getElementById('select-all').checked = false;
        } catch (error) {
            alert('Lỗi: ' + error.message);
        }
    });

    window.editStudent = (id) => {
        const s = allStudents.find(st => st.id === id);
        if(!s) return;
        document.getElementById('student-id').value = s.id;
        document.getElementById('student-code').value = s.studentId;
        document.getElementById('student-name').value = s.name;
        document.getElementById('student-class-input').value = s.class || '';
        document.getElementById('student-course-input').value = s.course || '';
        
        const depSelect = document.getElementById('student-department-input');
        depSelect.innerHTML = allDepartments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
        depSelect.value = s.departmentId || '';

        document.getElementById('student-modal').style.display = 'flex';
    };

    document.getElementById('student-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('student-id').value;
        const data = {
            studentId: document.getElementById('student-code').value,
            name: document.getElementById('student-name').value,
            class: document.getElementById('student-class-input').value,
            course: document.getElementById('student-course-input').value,
            departmentId: document.getElementById('student-department-input').value,
        };
        try {
            await updateDoc(doc(studentsCol, id), data);
            alert('Cập nhật thành công!');
            document.getElementById('student-modal').style.display = 'none';
        } catch (error) {
            alert('Lỗi: ' + error.message);
        }
    });

    document.getElementById('btn-import').addEventListener('click', () => {
        document.getElementById('import-student-file-input').value = '';
        document.getElementById('import-student-results-container').classList.add('hidden');
        document.getElementById('import-student-log').innerHTML = '';
        document.getElementById('import-students-modal').style.display = 'flex';
    });
    
    document.getElementById('btn-export').addEventListener('click', () => {
        generateReport();
    });

    document.getElementById('download-student-template-btn').addEventListener('click', downloadTemplateForStudents);
    document.getElementById('start-student-import-btn').addEventListener('click', handleStudentImport);
}

function downloadTemplateForStudents() {
    const headers = ["maSV", "hoTen", "ngaySinh", "lop", "tenKhoa", "khoaHoc"];
    const sampleData = [{
        maSV: "2131480123",
        hoTen: "Nguyễn Văn An",
        ngaySinh: "2003-10-20",
        lop: "CNTT1-K14",
        tenKhoa: "Khoa Công nghệ Thông tin",
        khoaHoc: "K14"
    }];
    const ws = XLSX.utils.json_to_sheet(sampleData, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, "Mau_Import_SinhVien.xlsx");
}

async function handleStudentImport() {
    const btn = document.getElementById('start-student-import-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Đang xử lý...';
    
    const fileInput = document.getElementById('import-student-file-input');
    const logContainer = document.getElementById('import-student-log');
    const resultsContainer = document.getElementById('import-student-results-container');
    
    resultsContainer.classList.remove('hidden');
    logContainer.innerHTML = 'Bắt đầu...<br>';
    
    if (!fileInput.files || fileInput.files.length === 0) {
        logContainer.innerHTML += '<span class="text-red-500">Vui lòng chọn file.</span><br>';
        btn.disabled = false;
        btn.innerHTML = 'Bắt đầu Import';
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
            
            if (jsonData.length === 0) {
                logContainer.innerHTML += '<span class="text-red-500">Lỗi: File trống.</span><br>';
                btn.disabled = false;
                btn.innerHTML = 'Bắt đầu Import';
                return;
            }
            
            logContainer.innerHTML += `Đã đọc ${jsonData.length} dòng. Đang xử lý...<br>`;
            const batch = writeBatch(db);
            let successCount = 0, updateCount = 0, errorCount = 0;
            
            for (const [index, row] of jsonData.entries()) {
                try {
                    const studentId = String(row.maSV || '').trim();
                    const studentName = String(row.hoTen || '').trim();
                    let dateOfBirth = row.ngaySinh;
                    if (dateOfBirth instanceof Date) {
                        // Keep as Date
                    } else if (typeof dateOfBirth === 'string') {
                        dateOfBirth = new Date(dateOfBirth);
                    } else {
                        dateOfBirth = null;
                    }

                    const studentClass = String(row.lop || '').trim();
                    const departmentName = String(row.tenKhoa || '').trim().toLowerCase();
                    const course = String(row.khoaHoc || '').trim();
                    
                    if (!studentId || !studentName || !departmentName) throw new Error("Thiếu Mã SV, Họ tên, hoặc Tên Khoa.");
                    
                    const department = allDepartments.find(d => d.name.toLowerCase() === departmentName);
                    if (!department) throw new Error(`Không tìm thấy khoa "${row.tenKhoa}"`);
                    
                    const studentData = { 
                        studentId, 
                        name: studentName, 
                        dateOfBirth: dateOfBirth ? dateOfBirth.toISOString().split('T')[0] : null,
                        class: studentClass, 
                        departmentId: department.id, 
                        course, 
                        lastUpdated: new Date().toISOString() 
                    };
                    
                    const existingDocs = await getDocs(query(studentsCol, where("studentId", "==", studentId)));
                    if (!existingDocs.empty) {
                        batch.update(existingDocs.docs[0].ref, studentData);
                        updateCount++;
                    } else {
                        studentData.status = 'Đang học'; // Default status
                        batch.set(doc(studentsCol), studentData);
                        successCount++;
                    }
                } catch (rowError) {
                    errorCount++;
                    logContainer.innerHTML += `<span class="text-orange-500">- Dòng ${index + 2}: Lỗi - ${rowError.message}</span><br>`;
                }
            }
            
            if (successCount > 0 || updateCount > 0) await batch.commit();
            logContainer.innerHTML += `<hr class="my-2"><strong class="text-green-600">Hoàn thành!</strong><br><span>- Thêm mới: ${successCount}.</span><br><span class="text-blue-600">- Cập nhật: ${updateCount}.</span><br><span>- Lỗi: ${errorCount}.</span><br>`;
        } catch (error) {
            logContainer.innerHTML += `<span class="text-red-500">Lỗi nghiêm trọng: ${error.message}</span><br>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = 'Bắt đầu Import';
            fileInput.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

function generateReport() {
    const deptName = filterDept.value === 'all' ? 'Toàn trường' : allDepartments.find(d => d.id === filterDept.value)?.name;
    const course = filterCourse.value === 'all' ? 'Tất cả' : filterCourse.value;
    
    const printWindow = window.open('', '_blank');
    
    let rows = filteredStudents.map((s, index) => `
        <tr>
            <td style="text-align:center">${index + 1}</td>
            <td>${s.studentId || ''}</td>
            <td>${s.name}</td>
            <td style="text-align:center">${s.class || ''}</td>
            <td style="text-align:center">${s.status}</td>
            <td>${s.statusNote || ''}</td>
        </tr>
    `).join('');

    printWindow.document.write(`
        <html>
        <head>
            <title>Báo cáo sĩ số</title>
            <style>
                body { font-family: 'Times New Roman', serif; }
                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th, td { border: 1px solid black; padding: 8px; text-align: left; }
                th { background-color: #f2f2f2; text-align: center; font-weight: bold; }
                .text-center { text-align: center; }
            </style>
        </head>
        <body>
            <div class="text-center">
                <h2>TRƯỜNG ĐẠI HỌC HẢI PHÒNG</h2>
                <h3>DANH SÁCH VÀ TRẠNG THÁI SINH VIÊN</h3>
                <p>Khoa: ${deptName} | Khóa: ${course}</p>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>STT</th>
                        <th>Mã SV</th>
                        <th>Họ và tên</th>
                        <th>Lớp</th>
                        <th>Trạng thái</th>
                        <th>Ghi chú / Quyết định</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </body>
        </html>
    `);
    printWindow.document.close();
    setTimeout(() => {
        printWindow.print();
    }, 500);
}

document.addEventListener('DOMContentLoaded', initializeApp);