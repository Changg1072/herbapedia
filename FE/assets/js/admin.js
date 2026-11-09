/**
 * HerbaPedia - Module Quản trị Hệ thống (Admin Portal)
 * Quản lý Cây thuốc (36 loài, Cloudinary upload, 20 loài AI nhận diện)
 * Quản lý Người dùng (Phân quyền Admin/User, khóa/mở khóa tài khoản)
 * Quản lý Bài viết cộng đồng (Kiểm duyệt, xóa bài vi phạm)
 * Quản trị Hệ thống (Trạng thái FastAPI, MySQL, Cloudinary, AI Models)
 */

const ADMIN_API = (window.HerbaConfig && window.HerbaConfig.API_BASE_URL) || window.API_BASE_URL || 'http://127.0.0.1:8000';

// 26 Class thực tế được huấn luyện trong 3 mô hình AI (EfficientNet-B0 / MobileNetV3 / Custom CNN)
const AI_RECOGNIZED_CLASSES = new Set([
    'aloe', 'aloevera', 'arabian-jasmine', 'jasmine', 'betel', 'bhrami', 'brahmi',
    'bitter-gourd', 'bitter gourd', 'centella-asiatica', 'centella asiatica',
    'coffee', 'eucalyptus', 'grape', 'guava', 'hibiscus', 'jackfruit', 'lemon', 'mango',
    'marigold', 'mint', 'neem', 'onion', 'orange', 'papaya', 'pepper', 'rose',
    'snakeplant', 'tea', 'tomato', 'tulsi'
]);

function isAiHerb(herb) {
    const slug = String(herb.slug || herb.id || '').toLowerCase();
    const dataset = String(herb.dataset_name || herb.datasetName || '').toLowerCase();
    return AI_RECOGNIZED_CLASSES.has(slug) || AI_RECOGNIZED_CLASSES.has(dataset);
}

document.addEventListener('DOMContentLoaded', () => {
    const list = document.getElementById('herbManagementList');
    if (!list) return;

    let herbs = [];
    let editingSlug = null;
    let isAiOnly = false;

    // Hiển thị host và link swagger động theo cấu hình HerbaConfig
    const adminHostSpan = document.getElementById('adminServerHost');
    if (adminHostSpan) {
        try {
            const urlObj = new URL(ADMIN_API);
            adminHostSpan.textContent = urlObj.host;
        } catch (e) {
            adminHostSpan.textContent = ADMIN_API;
        }
    }
    const adminSwaggerLink = document.getElementById('adminSwaggerLink');
    if (adminSwaggerLink) {
        adminSwaggerLink.href = `${ADMIN_API}/docs`;
    }

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[character]));

    const tokenHeaders = () => ({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('accessToken') || ''}`
    });

    // Update greeting & avatar in admin navbar
    function syncAdminHeaderProfile() {
        const greeting = document.getElementById('navGreeting');
        const avatar = document.getElementById('navbarAvatar');
        const storedName = localStorage.getItem('userName');
        if (greeting && storedName) {
            const parts = storedName.trim().split(/\s+/);
            greeting.textContent = parts[parts.length - 1] || 'Admin';
        }
        const token = localStorage.getItem('accessToken');
        if (token) {
            fetch(`${ADMIN_API}/auth/me`, { headers: tokenHeaders() })
                .then((r) => r.ok ? r.json() : null)
                .then((user) => {
                    if (user) {
                        if (greeting && user.display_name) {
                            const p = user.display_name.trim().split(/\s+/);
                            greeting.textContent = p[p.length - 1] || 'Admin';
                        }
                        if (avatar && user.avatar_url) {
                            avatar.src = user.avatar_url;
                        }
                    }
                })
                .catch(() => {});
        }
    }
    syncAdminHeaderProfile();

    function setStatus(message, type = 'success') {
        const element = document.getElementById('herbManagementStatus');
        if (!element) return;
        element.textContent = message;
        element.className = `mb-4 rounded-2xl px-4 py-3 text-sm ${type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`;
        element.classList.remove('hidden');
        setTimeout(() => element?.classList.add('hidden'), 5000);
    }

    function renderList() {
        const searchInput = document.getElementById('herbSearchInput');
        const clearBtn = document.getElementById('btnAdminClearHerbSearch');
        const summary = document.getElementById('herbDisplaySummary');

        const keyword = (searchInput?.value || '').trim().toLocaleLowerCase('vi');
        if (clearBtn) {
            clearBtn.classList.toggle('hidden', !keyword);
        }

        const category = document.getElementById('herbCategoryFilter')?.value || '';
        const filtered = herbs.filter((herb) => {
            const matchesKeyword = !keyword || [herb.name, herb.slug, herb.dataset_name, herb.scientific]
                .join(' ').toLocaleLowerCase('vi').includes(keyword);
            const matchesCategory = !category || (herb.tags && herb.tags.includes(category));
            const matchesAiOnly = !isAiOnly || isAiHerb(herb);
            return matchesKeyword && matchesCategory && matchesAiOnly;
        });

        if (summary) {
            summary.textContent = `Hiển thị ${filtered.length} / ${herbs.length} loài cây`;
        }

        list.innerHTML = filtered.length ? filtered.map((herb) => {
            const isRecognized = isAiHerb(herb);
            const tagsPreview = (herb.tags || []).slice(0, 3).map((tag) => `
                <span class="rounded-full bg-sage-100/70 text-forest-900 px-2 py-0.5 text-[10px] font-medium">${escapeHtml(tag)}</span>
            `).join('');

            return `
                <article class="flex flex-col sm:flex-row gap-4 rounded-2xl border border-gray-200/80 bg-white/80 p-4 transition-all hover:shadow-md hover:border-emerald-300">
                    <div class="relative shrink-0">
                        <img src="${escapeHtml(herb.image || 'assets/images/logo.png')}" alt="${escapeHtml(herb.name)}" class="h-24 w-full sm:w-24 rounded-xl object-cover bg-sage-50 border border-gray-100" onerror="this.onerror=null;this.src='assets/images/logo.png'">
                        ${isRecognized ? `
                            <span class="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-700/90 text-white px-1.5 py-0.5 text-[9px] font-bold shadow-sm backdrop-blur">
                                <i data-feather="cpu" class="w-2.5 h-2.5"></i> AI
                            </span>
                        ` : ''}
                    </div>
                    <div class="min-w-0 flex-1 flex flex-col justify-between">
                        <div>
                            <div class="flex items-start justify-between gap-2">
                                <div>
                                    <h3 class="font-bold text-forest-900 text-base leading-snug">${escapeHtml(herb.name)}</h3>
                                    <p class="text-xs italic text-gray-500">${escapeHtml(herb.scientific)}</p>
                                </div>
                                <span class="rounded-full bg-sage-100 px-2.5 py-0.5 text-[10px] font-bold text-forest-900 shrink-0">${escapeHtml(herb.slug)}</span>
                            </div>

                            ${tagsPreview ? `<div class="mt-2 flex flex-wrap gap-1">${tagsPreview}</div>` : ''}

                            <p class="mt-2 line-clamp-2 text-xs sm:text-sm text-gray-600 leading-relaxed">${escapeHtml(herb.usage)}</p>
                        </div>

                        <div class="mt-3.5 pt-2.5 border-t border-gray-100 flex items-center justify-between gap-2">
                            <span class="text-[11px] text-gray-400 font-mono truncate max-w-[120px]">${escapeHtml(herb.dataset_name || '')}</span>
                            <div class="flex items-center gap-1.5">
                                <a href="detail.html?herb=${encodeURIComponent(herb.slug)}" target="_blank" class="rounded-full border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:text-forest-900 hover:bg-gray-100 transition inline-flex items-center gap-1">
                                    <i data-feather="external-link" class="w-3 h-3"></i> Xem
                                </a>
                                <button type="button" data-edit-herb="${escapeHtml(herb.slug)}" class="rounded-full border border-gray-200 px-3 py-1 text-xs font-bold text-forest-900 hover:bg-sage-50 transition inline-flex items-center gap-1">
                                    <i data-feather="edit-2" class="w-3 h-3"></i> Sửa
                                </button>
                                <button type="button" data-delete-herb="${escapeHtml(herb.slug)}" class="rounded-full border border-red-200 px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 transition inline-flex items-center gap-1">
                                    <i data-feather="trash-2" class="w-3 h-3"></i> Xóa
                                </button>
                            </div>
                        </div>
                    </div>
                </article>
            `;
        }).join('') : '<p class="col-span-full rounded-2xl bg-white/70 p-8 text-center text-sm text-gray-500">Không tìm thấy cây dược liệu nào phù hợp với bộ lọc.</p>';

        if (window.feather) feather.replace();
    }

    // Toggle AI Only filter button
    const btnAdminFilterAiOnly = document.getElementById('btnAdminFilterAiOnly');
    if (btnAdminFilterAiOnly) {
        btnAdminFilterAiOnly.addEventListener('click', () => {
            isAiOnly = !isAiOnly;
            if (isAiOnly) {
                btnAdminFilterAiOnly.className = 'rounded-full border border-forest-900 bg-forest-900 text-white px-4 py-2.5 text-xs sm:text-sm font-bold shadow-sm transition flex items-center gap-1.5 whitespace-nowrap';
            } else {
                btnAdminFilterAiOnly.className = 'rounded-full border border-gray-200 bg-white px-4 py-2.5 text-xs sm:text-sm font-semibold text-gray-700 hover:border-forest-900 transition flex items-center gap-1.5 whitespace-nowrap';
            }
            renderList();
        });
    }

    // Clear search input button
    const btnAdminClearHerbSearch = document.getElementById('btnAdminClearHerbSearch');
    const herbSearchInput = document.getElementById('herbSearchInput');
    if (btnAdminClearHerbSearch && herbSearchInput) {
        btnAdminClearHerbSearch.addEventListener('click', () => {
            herbSearchInput.value = '';
            herbSearchInput.focus();
            renderList();
        });
    }

    function closeModal() {
        document.getElementById('herbEditorModal')?.remove();
        editingSlug = null;
    }

    function openEditor(herb = null) {
        editingSlug = herb?.slug || null;
        const value = (key) => escapeHtml(herb?.[key] || '');
        document.body.insertAdjacentHTML('beforeend', `
            <div id="herbEditorModal" class="fixed inset-0 z-[70] flex items-center justify-center bg-forest-900/50 backdrop-blur-sm p-4 overflow-y-auto">
                <div class="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 sm:p-8 shadow-2xl custom-scrollbar my-4">
                    <div class="mb-6 flex items-center justify-between pb-4 border-b border-gray-100">
                        <div>
                            <h2 class="font-serif text-2xl font-bold text-forest-900">${herb ? 'Chỉnh sửa dữ liệu cây' : 'Thêm cây mới vào cơ sở dữ liệu'}</h2>
                            <p class="text-xs text-gray-500 mt-1">Các trường có dấu <span class="text-red-500">*</span> là bắt buộc nhập.</p>
                        </div>
                        <button id="closeHerbEditor" type="button" class="rounded-full p-2 text-gray-500 hover:bg-gray-100 transition focus:outline-none">
                            <i data-feather="x" class="w-5 h-5"></i>
                        </button>
                    </div>

                    <form id="herbEditorForm" class="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <label class="text-sm font-semibold text-gray-700">Slug cây (định danh URL) <span class="text-red-500">*</span>
                            <input name="slug" required value="${value('slug')}" placeholder="vi-du-cay-bac-ha" class="admin-input">
                        </label>
                        <label class="text-sm font-semibold text-gray-700">Tên dataset (phân loại AI) <span class="text-red-500">*</span>
                            <input name="dataset_name" required value="${value('dataset_name')}" placeholder="mint" class="admin-input">
                        </label>
                        <label class="text-sm font-semibold text-gray-700">Tên tiếng Việt <span class="text-red-500">*</span>
                            <input name="name" required value="${value('name')}" placeholder="Bạc hà" class="admin-input">
                        </label>
                        <label class="text-sm font-semibold text-gray-700">Tên khoa học <span class="text-red-500">*</span>
                            <input name="scientific" required value="${value('scientific')}" placeholder="Mentha arvensis" class="admin-input">
                        </label>

                        <!-- Hình ảnh Cloudinary Dropzone -->
                        <div class="md:col-span-2">
                            <div class="mb-2 flex items-center justify-between gap-3">
                                <label for="herbImageFile" class="text-sm font-semibold text-gray-700">Hình ảnh đại diện</label>
                                <span class="text-xs font-normal text-gray-400">JPEG, PNG hoặc WEBP · tối đa 5 MB</span>
                            </div>
                            <input name="image" value="${value('image')}" type="hidden">
                            <input type="hidden" name="image_public_id" value="${value('image_public_id')}">
                            
                            <div id="herbImageDropzone" tabindex="0" role="button" class="group relative flex min-h-48 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-emerald-200 bg-gradient-to-br from-green-50 to-sage-50 p-4 text-center transition hover:border-emerald-500 hover:bg-green-50 focus:outline-none focus:ring-4 focus:ring-green-100">
                                <img id="herbImagePreview" src="${value('image') || 'assets/images/logo.png'}" alt="Xem trước ảnh cây" class="absolute inset-0 hidden h-full w-full object-cover">
                                
                                <div id="herbImageEmptyState" class="${value('image') ? 'hidden' : ''} relative flex flex-col items-center gap-2 text-forest-900">
                                    <span class="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
                                        <i data-feather="upload-cloud" class="h-6 w-6 text-emerald-600"></i>
                                    </span>
                                    <span class="font-bold text-sm">Kéo thả ảnh vào đây</span>
                                    <span class="text-xs text-gray-500">hoặc bấm vào khung để chọn file từ máy tính</span>
                                </div>

                                <div class="absolute inset-x-3 bottom-3 hidden items-center justify-between gap-2 rounded-xl bg-white/95 px-3 py-2 text-left shadow-sm backdrop-blur group-hover:flex" id="herbImageOverlay">
                                    <span id="herbImageFileName" class="min-w-0 truncate text-xs font-semibold text-forest-900">Ảnh hiện tại</span>
                                    <span id="herbImageFileSize" class="shrink-0 text-[11px] text-gray-500"></span>
                                </div>
                                <input id="herbImageFile" name="image_file" type="file" accept="image/jpeg,image/png,image/webp" class="sr-only">
                            </div>
                            <p id="imageUploadStatus" class="mt-2 text-xs text-gray-500">Ảnh sẽ được tải lên Cloudinary an toàn khi bạn bấm nút lưu.</p>
                        </div>

                        <label class="text-sm font-semibold text-gray-700 md:col-span-2">Nhóm công dụng (cách nhau bằng dấu phẩy)
                            <input name="tags" value="${escapeHtml((herb?.tags || []).join(', '))}" placeholder="thanh nhiệt, giải độc, tiêu hóa" class="admin-input">
                        </label>
                        <label class="text-sm font-semibold text-gray-700 md:col-span-2">Công dụng chính <span class="text-red-500">*</span>
                            <textarea name="usage" required rows="2" class="admin-input">${value('usage')}</textarea>
                        </label>
                        <label class="text-sm font-semibold text-gray-700">Bộ phận sử dụng <span class="text-red-500">*</span>
                            <textarea name="parts" required rows="2" class="admin-input">${value('parts')}</textarea>
                        </label>
                        <label class="text-sm font-semibold text-gray-700">Đặc điểm nhận dạng <span class="text-red-500">*</span>
                            <textarea name="identification" required rows="2" class="admin-input">${value('identification')}</textarea>
                        </label>
                        <label class="text-sm font-semibold text-gray-700">Môi trường sống / Phân bố
                            <textarea name="habitat" rows="2" class="admin-input">${value('habitat')}</textarea>
                        </label>
                        <label class="text-sm font-semibold text-gray-700">Cách thu hái & sơ chế
                            <textarea name="preparation" rows="2" class="admin-input">${value('preparation')}</textarea>
                        </label>
                        <label class="text-sm font-semibold text-gray-700 md:col-span-2">Cảnh báo an toàn <span class="text-red-500">*</span>
                            <textarea name="safety" required rows="2" class="admin-input">${value('safety')}</textarea>
                        </label>
                        <label class="text-sm font-semibold text-gray-700 md:col-span-2">Lưu ý thêm khi sử dụng
                            <textarea name="caution" rows="2" class="admin-input">${value('caution')}</textarea>
                        </label>
                        <label class="text-sm font-semibold text-gray-700 md:col-span-2">Cách sử dụng chi tiết (mỗi dòng một mục)
                            <textarea name="usageDetails" rows="3" class="admin-input">${escapeHtml((herb?.usageDetails || []).join('\n'))}</textarea>
                        </label>
                        <label class="text-sm font-semibold text-gray-700 md:col-span-2">Bài thuốc dân gian ứng dụng (mỗi dòng một mục)
                            <textarea name="remedies" rows="3" class="admin-input">${escapeHtml((herb?.remedies || []).join('\n'))}</textarea>
                        </label>

                        <div class="flex justify-end gap-3 pt-4 border-t border-gray-100 md:col-span-2">
                            <button id="cancelHerbEditor" type="button" class="rounded-full border border-gray-200 px-6 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 transition">
                                Hủy bỏ
                            </button>
                            <button type="submit" class="rounded-full bg-forest-900 px-7 py-2.5 text-sm font-bold text-white hover:bg-forest-800 transition shadow-sm hover:shadow-md flex items-center gap-2">
                                <i data-feather="check" class="w-4 h-4 text-[#8CC63F]"></i>
                                <span>${herb ? 'Lưu thay đổi' : 'Tạo cây mới'}</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `);

        if (window.feather) feather.replace();
        setupImagePicker(herb);
        document.getElementById('closeHerbEditor')?.addEventListener('click', closeModal);
        document.getElementById('cancelHerbEditor')?.addEventListener('click', closeModal);
        document.getElementById('herbEditorForm')?.addEventListener('submit', submitEditor);
    }

    function setupImagePicker(herb) {
        const dropzone = document.getElementById('herbImageDropzone');
        const input = document.getElementById('herbImageFile');
        const preview = document.getElementById('herbImagePreview');
        const emptyState = document.getElementById('herbImageEmptyState');
        const overlay = document.getElementById('herbImageOverlay');
        const fileName = document.getElementById('herbImageFileName');
        const fileSize = document.getElementById('herbImageFileSize');
        const status = document.getElementById('imageUploadStatus');
        const formatSize = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

        if (herb?.image) {
            preview.classList.remove('hidden');
            overlay.classList.add('flex');
            fileName.textContent = 'Ảnh hiện tại';
            preview.onerror = () => {
                preview.classList.add('hidden');
                emptyState.classList.remove('hidden');
                overlay.classList.remove('flex');
            };
        }

        const showSelectedFile = (file) => {
            if (!file) return;
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
                status.textContent = 'File không hợp lệ hoặc vượt quá 5 MB.';
                status.className = 'mt-2 text-xs text-red-600 font-semibold';
                input.value = '';
                return;
            }
            const objectUrl = URL.createObjectURL(file);
            preview.src = objectUrl;
            preview.classList.remove('hidden');
            emptyState.classList.add('hidden');
            overlay.classList.add('flex');
            fileName.textContent = file.name;
            fileSize.textContent = formatSize(file.size);
            status.textContent = 'Ảnh đã sẵn sàng. Bấm nút lưu để tải ảnh lên Cloudinary và lưu dữ liệu.';
            status.className = 'mt-2 text-xs text-emerald-700 font-semibold';
        };

        input.addEventListener('change', () => showSelectedFile(input.files[0]));
        dropzone.addEventListener('click', (event) => {
            if (event.target !== input) input.click();
        });
        dropzone.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') input.click();
        });
        ['dragenter', 'dragover'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropzone.classList.add('border-emerald-500', 'bg-green-100');
        }));
        ['dragleave', 'drop'].forEach((eventName) => dropzone.addEventListener(eventName, (event) => {
            event.preventDefault();
            dropzone.classList.remove('border-emerald-500', 'bg-green-100');
        }));
        dropzone.addEventListener('drop', (event) => {
            const file = event.dataTransfer.files[0];
            input.files = event.dataTransfer.files;
            showSelectedFile(file);
        });
    }

    async function uploadHerbImage(file) {
        const form = document.getElementById('herbEditorForm');
        const status = document.getElementById('imageUploadStatus');
        const data = new FormData();
        data.append('file', file);
        status.textContent = 'Đang tải ảnh lên máy chủ Cloudinary...';
        status.className = 'mt-2 text-xs text-gray-600';
        const response = await fetch(`${ADMIN_API}/herbs/upload-image`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('accessToken') || ''}` },
            body: data
        });
        if (!response.ok) {
            const body = await response.json().catch(() => ({}));
            throw new Error(body.detail || 'Không thể tải ảnh lên Cloudinary.');
        }
        const result = await response.json();
        form.elements.image.value = result.url;
        form.elements.image_public_id.value = result.public_id;
        return result;
    }

    async function submitEditor(event) {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const submitButton = event.currentTarget.querySelector('button[type="submit"]');
        const imageFile = form.get('image_file');
        submitButton.disabled = true;
        submitButton.innerHTML = '<i data-feather="loader" class="w-4 h-4 animate-spin"></i> <span>Đang lưu...</span>';
        if (window.feather) feather.replace();

        const imageStatus = document.getElementById('imageUploadStatus');
        try {
            if (imageFile instanceof File && imageFile.size > 0) {
                await uploadHerbImage(imageFile);
                imageStatus.textContent = 'Đã tải ảnh lên, đang lưu dữ liệu cây...';
                imageStatus.className = 'mt-2 text-xs text-emerald-700';
            }
            const lines = (name) => String(form.get(name) || '').split('\n').map((item) => item.trim()).filter(Boolean);
            const payload = {
                slug: form.get('slug').trim(),
                dataset_name: form.get('dataset_name').trim(),
                name: form.get('name').trim(),
                scientific: form.get('scientific').trim(),
                image: form.get('image').trim() || null,
                image_public_id: form.get('image_public_id').trim() || null,
                tags: form.get('tags').split(',').map((item) => item.trim()).filter(Boolean),
                usage: form.get('usage').trim(),
                parts: form.get('parts').trim(),
                identification: form.get('identification').trim(),
                safety: form.get('safety').trim(),
                habitat: form.get('habitat').trim() || null,
                preparation: form.get('preparation').trim() || null,
                caution: form.get('caution').trim() || null,
                usageDetails: lines('usageDetails'),
                remedies: lines('remedies')
            };

            const response = await fetch(`${ADMIN_API}/herbs${editingSlug ? `/${encodeURIComponent(editingSlug)}` : ''}`, {
                method: editingSlug ? 'PUT' : 'POST',
                headers: tokenHeaders(),
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.detail || 'Không thể lưu dữ liệu cây.');
            }

            closeModal();
            setStatus(editingSlug ? 'Đã cập nhật dữ liệu cây thành công.' : 'Đã thêm cây dược liệu mới thành công.');
            await loadHerbs();
        } catch (error) {
            setStatus(error.message || 'Không thể lưu dữ liệu cây.', 'error');
            if (imageStatus) {
                imageStatus.textContent = error.message || 'Không thể tải ảnh hoặc lưu dữ liệu.';
                imageStatus.className = 'mt-2 text-xs text-red-600 font-semibold';
            }
            submitButton.disabled = false;
            submitButton.innerHTML = `<i data-feather="check" class="w-4 h-4 text-[#8CC63F]"></i> <span>${editingSlug ? 'Lưu thay đổi' : 'Tạo cây mới'}</span>`;
            if (window.feather) feather.replace();
        }
    }

    async function loadHerbs() {
        const response = await fetch(`${ADMIN_API}/herbs`);
        if (!response.ok) throw new Error('Không thể tải dữ liệu cây từ API.');
        herbs = await response.json();
        const count = String(herbs.length);
        const herbCountEl = document.getElementById('herbCount');
        if (herbCountEl) herbCountEl.textContent = count;
        const tabHerb = document.getElementById('tabHerbCount');
        if (tabHerb) tabHerb.textContent = count;
        renderList();
    }

    list.addEventListener('click', async (event) => {
        const editButton = event.target.closest('[data-edit-herb]');
        const deleteButton = event.target.closest('[data-delete-herb]');
        if (editButton) openEditor(herbs.find((herb) => herb.slug === editButton.dataset.editHerb));
        if (deleteButton && window.confirm('Bạn có chắc muốn xóa cây này không? Mọi dữ liệu bách khoa, cách dùng và bài thuốc liên quan cũng sẽ bị xóa vĩnh viễn.')) {
            const response = await fetch(`${ADMIN_API}/herbs/${encodeURIComponent(deleteButton.dataset.deleteHerb)}`, {
                method: 'DELETE',
                headers: tokenHeaders()
            });
            if (!response.ok) {
                setStatus('Không thể xóa dữ liệu cây.', 'error');
                return;
            }
            setStatus('Đã xóa dữ liệu cây thành công.');
            await loadHerbs();
        }
    });

    document.getElementById('addHerbButton')?.addEventListener('click', () => openEditor());
    document.getElementById('herbSearchInput')?.addEventListener('input', renderList);
    document.getElementById('herbCategoryFilter')?.addEventListener('change', renderList);
    loadHerbs().catch(() => setStatus('Không thể tải dữ liệu. Hãy kiểm tra máy chủ backend và phân quyền Admin.', 'error'));

    // ==========================================
    // USER MANAGEMENT LOGIC
    // ==========================================
    const userListContainer = document.getElementById('userManagementList');
    const userStatusElement = document.getElementById('userManagementStatus');
    const userSearchInput = document.getElementById('userSearchInput');
    const userRoleFilter = document.getElementById('userRoleFilter');
    const userStatusFilter = document.getElementById('userStatusFilter');
    const addUserButton = document.getElementById('addUserButton');
    const userCountElement = document.getElementById('userCount');

    let users = [];
    const currentUsername = (localStorage.getItem('username') || '').toLowerCase();

    function setUserStatus(message, type = 'success') {
        if (!userStatusElement) return;
        userStatusElement.textContent = message;
        userStatusElement.className = `mb-4 rounded-2xl px-4 py-3 text-sm ${type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`;
        userStatusElement.classList.remove('hidden');
        setTimeout(() => {
            userStatusElement?.classList.add('hidden');
        }, 5000);
    }

    function renderUserList() {
        if (!userListContainer) return;
        const keyword = (userSearchInput?.value || '').trim().toLocaleLowerCase('vi');
        const role = userRoleFilter?.value || '';
        const status = userStatusFilter?.value || '';

        const filtered = users.filter((u) => {
            const matchesKeyword = !keyword || [u.username, u.display_name, u.phone]
                .join(' ').toLocaleLowerCase('vi').includes(keyword);
            const matchesRole = !role || u.role === role;
            const matchesStatus = !status || (status === 'active' ? u.is_active : !u.is_active);
            return matchesKeyword && matchesRole && matchesStatus;
        });

        if (!filtered.length) {
            userListContainer.innerHTML = '<p class="p-8 text-center text-sm text-gray-500">Không tìm thấy người dùng nào phù hợp với bộ lọc.</p>';
            return;
        }

        userListContainer.innerHTML = `
            <table class="w-full text-left text-sm text-gray-600">
                <thead class="bg-sage-50/90 text-xs font-bold uppercase tracking-wider text-forest-900 border-b border-gray-200">
                    <tr>
                        <th class="py-3.5 px-4">Người dùng</th>
                        <th class="py-3.5 px-4">Vai trò</th>
                        <th class="py-3.5 px-4">Trạng thái</th>
                        <th class="py-3.5 px-4">Số điện thoại</th>
                        <th class="py-3.5 px-4">Đăng nhập qua</th>
                        <th class="py-3.5 px-4">Lịch sử quét</th>
                        <th class="py-3.5 px-4 text-right">Thao tác</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    ${filtered.map((u) => {
                        const isSelf = u.username.toLowerCase() === currentUsername;
                        const roleBadge = u.role === 'admin'
                            ? '<span class="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2.5 py-0.5 text-xs font-bold border border-amber-200"><i data-feather="shield" class="w-3 h-3"></i> Admin</span>'
                            : '<span class="inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-700 px-2.5 py-0.5 text-xs font-medium">User</span>';
                        
                        const statusBadge = u.is_active
                            ? '<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 px-2.5 py-0.5 text-xs font-semibold border border-emerald-200"><span class="w-2 h-2 rounded-full bg-emerald-500"></span> Hoạt động</span>'
                            : '<span class="inline-flex items-center gap-1.5 rounded-full bg-red-50 text-red-700 px-2.5 py-0.5 text-xs font-semibold border border-red-200"><span class="w-2 h-2 rounded-full bg-red-500"></span> Đã khóa</span>';
                        
                        const providerBadge = u.auth_provider === 'google'
                            ? '<span class="inline-flex items-center gap-1 text-xs text-blue-600 font-semibold">Google</span>'
                            : '<span class="inline-flex items-center gap-1 text-xs text-gray-500">Mật khẩu</span>';
                        
                        const maskedUser = (u.username && u.username.includes('@'))
                            ? u.username.split('@')[0].slice(0, 2) + '***@' + u.username.split('@')[1]
                            : u.username;
                        const safeDisplayName = (u.display_name && !u.display_name.includes('@'))
                            ? u.display_name
                            : (u.display_name ? u.display_name.split('@')[0] : (u.username ? u.username.split('@')[0] : 'User'));

                        return `
                            <tr class="hover:bg-white transition-colors">
                                <td class="py-3.5 px-4">
                                    <div class="flex items-center gap-3">
                                        <img src="${escapeHtml(u.avatar_url || 'assets/images/logo.png')}" alt="" class="h-9 w-9 rounded-full object-cover border border-gray-200 bg-white" onerror="this.onerror=null;this.src='assets/images/logo.png'">
                                        <div>
                                            <div class="font-bold text-forest-900 flex items-center gap-1.5">
                                                ${escapeHtml(safeDisplayName)}
                                                ${isSelf ? '<span class="rounded bg-forest-900/10 px-1.5 py-0.5 text-[10px] font-bold text-forest-900">(Bạn)</span>' : ''}
                                            </div>
                                            <div class="text-xs text-gray-400 font-mono" title="Tài khoản bảo mật">${escapeHtml(maskedUser)}</div>
                                        </div>
                                    </div>
                                </td>
                                <td class="py-3.5 px-4">${roleBadge}</td>
                                <td class="py-3.5 px-4">${statusBadge}</td>
                                <td class="py-3.5 px-4 font-mono text-xs">${escapeHtml(u.phone || 'Chưa cập nhật')}</td>
                                <td class="py-3.5 px-4">${providerBadge}</td>
                                <td class="py-3.5 px-4">
                                    <span class="inline-flex items-center gap-1 text-xs font-bold text-forest-900 bg-sage-50 px-2 py-0.5 rounded-full">
                                        ${u.history_count || 0} lượt
                                    </span>
                                </td>
                                <td class="py-3.5 px-4 text-right">
                                    <div class="inline-flex items-center gap-1.5">
                                        <button type="button" data-edit-user="${u.id}" class="rounded-full border border-gray-200 px-3 py-1 text-xs font-bold text-forest-900 hover:bg-sage-50 transition inline-flex items-center gap-1">
                                            <i data-feather="edit-2" class="w-3 h-3"></i> Sửa
                                        </button>
                                        ${!isSelf ? `
                                            <button type="button" data-toggle-user="${u.id}" data-active="${u.is_active}" class="rounded-full border ${u.is_active ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'} px-3 py-1 text-xs font-bold transition inline-flex items-center gap-1">
                                                <i data-feather="${u.is_active ? 'lock' : 'unlock'}" class="w-3 h-3"></i>
                                                ${u.is_active ? 'Khóa' : 'Mở'}
                                            </button>
                                            <button type="button" data-delete-user="${u.id}" class="rounded-full border border-red-200 px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 transition inline-flex items-center gap-1">
                                                <i data-feather="trash-2" class="w-3 h-3"></i> Xóa
                                            </button>
                                        ` : ''}
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
        if (window.feather) feather.replace();
    }

    async function loadUsers() {
        if (!userListContainer) return;
        try {
            const response = await fetch(`${ADMIN_API}/auth/users`, { headers: tokenHeaders() });
            if (!response.ok) throw new Error('Không thể tải danh sách người dùng.');
            users = await response.json();
            if (userCountElement) userCountElement.textContent = String(users.length);
            const tabUser = document.getElementById('tabUserCount');
            if (tabUser) tabUser.textContent = String(users.length);
            renderUserList();
        } catch (error) {
            setUserStatus(error.message || 'Lỗi khi tải danh sách người dùng.', 'error');
        }
    }

    function closeUserModal() {
        document.getElementById('userModal')?.remove();
    }

    function openCreateUserModal() {
        closeUserModal();
        document.body.insertAdjacentHTML('beforeend', `
            <div id="userModal" class="fixed inset-0 z-[70] flex items-center justify-center bg-forest-900/50 backdrop-blur-sm p-4">
                <div class="w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-2xl">
                    <div class="mb-5 flex items-center justify-between pb-3 border-b border-gray-100">
                        <div>
                            <h2 class="font-serif text-2xl font-bold text-forest-900">Thêm người dùng mới</h2>
                            <p class="text-xs text-gray-500 mt-0.5">Tạo tài khoản và phân quyền trực tiếp trong hệ thống.</p>
                        </div>
                        <button id="closeUserModalBtn" type="button" class="rounded-full p-2 text-gray-500 hover:bg-gray-100 transition focus:outline-none">
                            <i data-feather="x" class="w-5 h-5"></i>
                        </button>
                    </div>
                    <form id="createUserForm" class="space-y-4">
                        <label class="block text-sm font-semibold text-gray-700">Tên đăng nhập <span class="text-red-500">*</span>
                            <input name="username" required minlength="3" maxlength="50" placeholder="nguyenvana" class="admin-input">
                        </label>
                        <label class="block text-sm font-semibold text-gray-700">Mật khẩu ban đầu <span class="text-red-500">*</span>
                            <input name="password" type="password" required minlength="8" placeholder="Tối thiểu 8 ký tự" class="admin-input">
                        </label>
                        <label class="block text-sm font-semibold text-gray-700">Họ và tên hiển thị <span class="text-red-500">*</span>
                            <input name="display_name" required placeholder="Nguyễn Văn A" class="admin-input">
                        </label>
                        <label class="block text-sm font-semibold text-gray-700">Số điện thoại
                            <input name="phone" placeholder="0901234567" class="admin-input">
                        </label>
                        <label class="block text-sm font-semibold text-gray-700">Vai trò tài khoản
                            <select name="role" class="admin-input">
                                <option value="user">Người dùng thông thường (User)</option>
                                <option value="admin">Quản trị viên (Admin)</option>
                            </select>
                        </label>
                        <div class="flex justify-end gap-3 pt-4 border-t border-gray-100">
                            <button id="cancelUserModalBtn" type="button" class="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 transition">Hủy</button>
                            <button type="submit" class="rounded-full bg-forest-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-forest-800 transition shadow-sm">Tạo tài khoản</button>
                        </div>
                    </form>
                </div>
            </div>
        `);
        if (window.feather) feather.replace();
        document.getElementById('closeUserModalBtn')?.addEventListener('click', closeUserModal);
        document.getElementById('cancelUserModalBtn')?.addEventListener('click', closeUserModal);
        document.getElementById('createUserForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang tạo...';
            try {
                const payload = {
                    username: form.get('username').trim(),
                    password: form.get('password'),
                    display_name: form.get('display_name').trim(),
                    phone: form.get('phone').trim() || '',
                    role: form.get('role')
                };
                const res = await fetch(`${ADMIN_API}/auth/users`, {
                    method: 'POST',
                    headers: tokenHeaders(),
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || 'Không thể tạo người dùng.');
                }
                closeUserModal();
                setUserStatus('Đã tạo tài khoản người dùng mới thành công.');
                await loadUsers();
            } catch (err) {
                alert(err.message);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Tạo tài khoản';
            }
        });
    }

    function openEditUserModal(user) {
        closeUserModal();
        const isSelf = user.username.toLowerCase() === currentUsername;
        document.body.insertAdjacentHTML('beforeend', `
            <div id="userModal" class="fixed inset-0 z-[70] flex items-center justify-center bg-forest-900/50 backdrop-blur-sm p-4">
                <div class="w-full max-w-md rounded-3xl bg-white p-6 sm:p-7 shadow-2xl">
                    <div class="mb-5 flex items-center justify-between pb-3 border-b border-gray-100">
                        <div>
                            <h2 class="font-serif text-2xl font-bold text-forest-900">Sửa thông tin tài khoản</h2>
                            <p class="text-xs text-gray-500 mt-0.5">Tài khoản: <strong>@${escapeHtml(user.username)}</strong></p>
                        </div>
                        <button id="closeUserModalBtn" type="button" class="rounded-full p-2 text-gray-500 hover:bg-gray-100 transition focus:outline-none">
                            <i data-feather="x" class="w-5 h-5"></i>
                        </button>
                    </div>
                    <form id="editUserForm" class="space-y-4">
                        <label class="block text-sm font-semibold text-gray-700">Họ và tên hiển thị <span class="text-red-500">*</span>
                            <input name="display_name" required value="${escapeHtml(user.display_name || user.username)}" class="admin-input">
                        </label>
                        <label class="block text-sm font-semibold text-gray-700">Số điện thoại
                            <input name="phone" value="${escapeHtml(user.phone || '')}" placeholder="0901234567" class="admin-input">
                        </label>
                        <label class="block text-sm font-semibold text-gray-700">Vai trò
                            <select name="role" class="admin-input" ${isSelf ? 'disabled title="Không thể tự đổi vai trò của bản thân"' : ''}>
                                <option value="user" ${user.role === 'user' ? 'selected' : ''}>Người dùng (User)</option>
                                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Quản trị viên (Admin)</option>
                            </select>
                            ${isSelf ? '<span class="text-[11px] text-gray-400 mt-1 block">Không thể tự đổi vai trò của chính mình</span>' : ''}
                        </label>
                        <label class="block text-sm font-semibold text-gray-700">Trạng thái tài khoản
                            <select name="is_active" class="admin-input" ${isSelf ? 'disabled' : ''}>
                                <option value="true" ${user.is_active ? 'selected' : ''}>Hoạt động</option>
                                <option value="false" ${!user.is_active ? 'selected' : ''}>Đã khóa</option>
                            </select>
                            ${isSelf ? '<span class="text-[11px] text-gray-400 mt-1 block">Không thể tự khóa tài khoản của chính mình</span>' : ''}
                        </label>
                        <div class="border-t border-gray-100 pt-3">
                            <label class="block text-sm font-semibold text-gray-700">Đặt lại mật khẩu mới
                                <input name="new_password" type="password" minlength="8" placeholder="Để trống nếu không muốn đổi" class="admin-input">
                                <span class="text-[11px] text-gray-400 mt-1 block">Tối thiểu 8 ký tự nếu nhập mật khẩu mới</span>
                            </label>
                        </div>
                        <div class="flex justify-end gap-3 pt-4 border-t border-gray-100">
                            <button id="cancelUserModalBtn" type="button" class="rounded-full border border-gray-200 px-5 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-100 transition">Hủy</button>
                            <button type="submit" class="rounded-full bg-forest-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-forest-800 transition shadow-sm">Lưu thay đổi</button>
                        </div>
                    </form>
                </div>
            </div>
        `);
        if (window.feather) feather.replace();
        document.getElementById('closeUserModalBtn')?.addEventListener('click', closeUserModal);
        document.getElementById('cancelUserModalBtn')?.addEventListener('click', closeUserModal);
        document.getElementById('editUserForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Đang lưu...';
            try {
                const payload = {
                    display_name: form.get('display_name').trim(),
                    phone: form.get('phone').trim() || ''
                };
                if (!isSelf) {
                    payload.role = form.get('role');
                    payload.is_active = form.get('is_active') === 'true';
                }
                const newPass = form.get('new_password');
                if (newPass && newPass.trim().length >= 8) {
                    payload.new_password = newPass.trim();
                }
                const res = await fetch(`${ADMIN_API}/auth/users/${user.id}`, {
                    method: 'PUT',
                    headers: tokenHeaders(),
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || 'Không thể cập nhật người dùng.');
                }
                closeUserModal();
                setUserStatus('Đã cập nhật thông tin tài khoản thành công.');
                await loadUsers();
            } catch (err) {
                alert(err.message);
                submitBtn.disabled = false;
                submitBtn.textContent = 'Lưu thay đổi';
            }
        });
    }

    if (userListContainer) {
        userListContainer.addEventListener('click', async (event) => {
            const editBtn = event.target.closest('[data-edit-user]');
            const toggleBtn = event.target.closest('[data-toggle-user]');
            const deleteBtn = event.target.closest('[data-delete-user]');

            if (editBtn) {
                const u = users.find((item) => String(item.id) === editBtn.dataset.editUser);
                if (u) openEditUserModal(u);
            }

            if (toggleBtn) {
                const userId = toggleBtn.dataset.toggleUser;
                const currentActive = toggleBtn.dataset.active === 'true';
                const actionText = currentActive ? 'khóa' : 'mở khóa';
                if (window.confirm(`Bạn có chắc chắn muốn ${actionText} tài khoản này không?`)) {
                    try {
                        const res = await fetch(`${ADMIN_API}/auth/users/${userId}`, {
                            method: 'PUT',
                            headers: tokenHeaders(),
                            body: JSON.stringify({ is_active: !currentActive })
                        });
                        if (!res.ok) {
                            const err = await res.json().catch(() => ({}));
                            throw new Error(err.detail || `Không thể ${actionText} tài khoản.`);
                        }
                        setUserStatus(`Đã ${actionText} tài khoản thành công.`);
                        await loadUsers();
                    } catch (err) {
                        setUserStatus(err.message, 'error');
                    }
                }
            }

            if (deleteBtn) {
                const userId = deleteBtn.dataset.deleteUser;
                if (window.confirm('Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản này? Mọi dữ liệu lịch sử quét và bài viết liên quan sẽ bị xóa.')) {
                    try {
                        const res = await fetch(`${ADMIN_API}/auth/users/${userId}`, {
                            method: 'DELETE',
                            headers: tokenHeaders()
                        });
                        if (!res.ok) {
                            const err = await res.json().catch(() => ({}));
                            throw new Error(err.detail || 'Không thể xóa tài khoản.');
                        }
                        setUserStatus('Đã xóa tài khoản người dùng thành công.');
                        await loadUsers();
                    } catch (err) {
                        setUserStatus(err.message, 'error');
                    }
                }
            }
        });
    }

    addUserButton?.addEventListener('click', openCreateUserModal);
    userSearchInput?.addEventListener('input', renderUserList);
    userRoleFilter?.addEventListener('change', renderUserList);
    userStatusFilter?.addEventListener('change', renderUserList);
    loadUsers().catch(() => setUserStatus('Không thể tải người dùng. Hãy kiểm tra kết nối API.', 'error'));

    // ==========================================
    // COMMUNITY POSTS MANAGEMENT LOGIC
    // ==========================================
    let communityPosts = [];
    const communityListContainer = document.getElementById('communityManagementList');
    const communityStatusElement = document.getElementById('communityManagementStatus');
    const communitySearchInput = document.getElementById('communitySearchInput');
    const communityTypeFilter = document.getElementById('communityTypeFilter');
    const communityPostCountElement = document.getElementById('communityPostCount');
    const tabCommunityCountElement = document.getElementById('tabCommunityCount');

    function setCommunityStatus(message, type = 'success') {
        if (!communityStatusElement) return;
        communityStatusElement.textContent = message;
        communityStatusElement.className = `mb-4 rounded-2xl px-4 py-3 text-sm ${
            type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
        }`;
        communityStatusElement.classList.remove('hidden');
        setTimeout(() => communityStatusElement?.classList.add('hidden'), 5000);
    }

    function renderCommunityList() {
        if (!communityListContainer) return;
        const keyword = (communitySearchInput?.value || '').trim().toLowerCase();
        const type = communityTypeFilter?.value || '';

        const filtered = communityPosts.filter((p) => {
            const authorName = (p.author?.display_name || '').toLowerCase();
            const title = (p.title || '').toLowerCase();
            const content = (p.content || '').toLowerCase();
            const matchesKeyword = !keyword || title.includes(keyword) || authorName.includes(keyword) || content.includes(keyword);
            const matchesType = !type || p.post_type === type;
            return matchesKeyword && matchesType;
        });

        if (!filtered.length) {
            communityListContainer.innerHTML = '<p class="p-8 text-center text-sm text-gray-500">Chưa có bài viết nào hoặc không tìm thấy bài viết phù hợp với bộ lọc.</p>';
            return;
        }

        communityListContainer.innerHTML = `
            <table class="w-full text-left text-sm text-gray-600">
                <thead class="bg-sage-50/90 text-xs font-bold uppercase tracking-wider text-forest-900 border-b border-gray-200">
                    <tr>
                        <th class="px-5 py-3.5">Bài viết</th>
                        <th class="px-4 py-3.5">Tác giả</th>
                        <th class="px-3 py-3.5 text-center">Loại bài</th>
                        <th class="px-3 py-3.5 text-center">Tương tác</th>
                        <th class="px-4 py-3.5">Ngày đăng</th>
                        <th class="px-5 py-3.5 text-right">Thao tác</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                    ${filtered.map((p) => `
                        <tr class="hover:bg-white transition-colors">
                            <td class="px-5 py-4 max-w-xs">
                                <div class="flex items-center gap-3">
                                    ${p.image_url ? `<img src="${escapeHtml(p.image_url)}" class="w-12 h-12 rounded-xl object-cover bg-gray-100 shrink-0 border border-gray-100" onerror="this.onerror=null;this.src='assets/images/logo.png'">` : `<div class="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-forest-900 shrink-0"><i data-feather="file-text" class="w-5 h-5 text-emerald-700"></i></div>`}
                                    <div class="min-w-0">
                                        <h4 class="font-bold text-forest-900 truncate">${escapeHtml(p.title)}</h4>
                                        <p class="text-xs text-gray-500 line-clamp-1 mt-0.5">${escapeHtml(p.content)}</p>
                                    </div>
                                </div>
                            </td>
                            <td class="px-4 py-4 whitespace-nowrap">
                                <div class="flex items-center gap-2">
                                    <img src="${escapeHtml(p.author?.avatar_url || 'assets/images/logo.png')}" alt="" class="w-6 h-6 rounded-full object-cover border border-gray-200" onerror="this.onerror=null;this.src='assets/images/logo.png'">
                                    <span class="font-semibold text-gray-800 text-xs">${escapeHtml(p.author?.display_name || 'Người dùng')}</span>
                                    ${p.author?.role === 'admin' ? '<span class="text-[9px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">Admin</span>' : ''}
                                </div>
                            </td>
                            <td class="px-3 py-4 text-center whitespace-nowrap">
                                <span class="inline-block px-2.5 py-1 rounded-full text-xs font-semibold ${p.post_type === 'remedy' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-gray-100 text-gray-700'}">
                                    ${p.post_type === 'remedy' ? '🌿 Bài thuốc' : 'Chia sẻ'}
                                </span>
                            </td>
                            <td class="px-3 py-4 text-center whitespace-nowrap text-xs text-gray-500">
                                <span class="font-semibold text-gray-700">${p.like_count || 0}</span> thích • <span class="font-semibold text-gray-700">${p.comment_count || 0}</span> bình luận
                            </td>
                            <td class="px-4 py-4 whitespace-nowrap text-xs text-gray-500">
                                ${new Date(p.created_at).toLocaleDateString('vi-VN')}
                            </td>
                            <td class="px-5 py-4 text-right whitespace-nowrap">
                                <div class="flex items-center justify-end gap-2">
                                    <a href="user-profile.html?userId=${p.author?.id}" target="_blank" class="rounded-full border border-gray-200 px-3 py-1 text-xs font-bold text-forest-900 hover:bg-gray-50 transition inline-flex items-center gap-1">
                                        <i data-feather="user" class="w-3 h-3"></i> Tác giả
                                    </a>
                                    <a href="history.html?post=${p.id}" target="_blank" class="rounded-full border border-gray-200 px-3 py-1 text-xs font-bold text-gray-600 hover:bg-gray-50 transition inline-flex items-center gap-1">
                                        <i data-feather="external-link" class="w-3 h-3"></i> Xem
                                    </a>
                                    <button type="button" data-delete-community-post="${p.id}" class="rounded-full border border-red-200 px-3 py-1 text-xs font-bold text-red-600 hover:bg-red-50 transition inline-flex items-center gap-1">
                                        <i data-feather="trash-2" class="w-3 h-3"></i> Xóa
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        if (window.feather) feather.replace();
    }

    async function loadCommunityPostsAdmin() {
        try {
            const res = await fetch(`${ADMIN_API}/community/posts`, { headers: tokenHeaders() });
            if (!res.ok) throw new Error('Không thể tải bài viết cộng đồng.');
            communityPosts = await res.json();
            const count = String(communityPosts.length);
            if (communityPostCountElement) communityPostCountElement.textContent = count;
            if (tabCommunityCountElement) tabCommunityCountElement.textContent = count;
            renderCommunityList();
        } catch (e) {
            setCommunityStatus(e.message, 'error');
        }
    }

    if (communityListContainer) {
        communityListContainer.addEventListener('click', async (e) => {
            const deleteBtn = e.target.closest('[data-delete-community-post]');
            if (deleteBtn) {
                const postId = deleteBtn.dataset.deleteCommunityPost;
                if (window.confirm('Bạn có chắc chắn muốn xóa vĩnh viễn bài viết này khỏi cộng đồng?')) {
                    try {
                        const res = await fetch(`${ADMIN_API}/community/posts/${postId}`, {
                            method: 'DELETE',
                            headers: tokenHeaders()
                        });
                        if (!res.ok) {
                            const err = await res.json().catch(() => ({}));
                            throw new Error(err.detail || 'Không thể xóa bài viết.');
                        }
                        setCommunityStatus('Đã xóa bài viết khỏi cộng đồng thành công.');
                        await loadCommunityPostsAdmin();
                    } catch (err) {
                        setCommunityStatus(err.message, 'error');
                    }
                }
            }
        });
    }

    communitySearchInput?.addEventListener('input', renderCommunityList);
    communityTypeFilter?.addEventListener('change', renderCommunityList);

    // ==========================================
    // TOOL SWITCHER (TAB & CARD) LOGIC
    // ==========================================
    const toolSections = document.querySelectorAll('.tool-section');
    const toolCards = document.querySelectorAll('[data-tool-card]');
    const toolTabs = document.querySelectorAll('[data-tool-tab]');
    const statTargets = document.querySelectorAll('[data-tool-target]');

    function switchAdminTool(targetId, shouldScroll = false) {
        const validIds = ['herb-management', 'user-management', 'community-management', 'system-settings'];
        if (!validIds.includes(targetId)) targetId = 'herb-management';

        // 1. Hide all tool sections, show only target
        toolSections.forEach((sec) => {
            if (sec.id === targetId) {
                sec.classList.remove('hidden');
            } else {
                sec.classList.add('hidden');
            }
        });

        // 2. Update Tool Cards Active State
        toolCards.forEach((card) => {
            const isCurrent = card.dataset.toolCard === targetId;
            const badge = card.querySelector('[data-active-badge]');
            if (isCurrent) {
                card.className = 'admin-tool-card text-left rounded-2xl border-2 border-forest-900 bg-emerald-50/90 p-5 shadow-md ring-2 ring-forest-900/10 transition-all flex flex-col justify-between transform scale-[1.01]';
                if (badge) {
                    badge.className = 'text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-forest-900 text-white flex items-center gap-1 shadow-sm';
                    badge.innerHTML = '<i data-feather="check" class="w-3 h-3 text-[#8CC63F]"></i> Đang hiển thị';
                }
            } else {
                card.className = 'admin-tool-card text-left rounded-2xl border border-gray-200 bg-white/70 p-5 hover:-translate-y-1 hover:shadow-md hover:border-gray-300 transition-all flex flex-col justify-between';
                if (badge) {
                    badge.className = 'text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500';
                    badge.textContent = 'Bấm để chọn';
                }
            }
        });

        // 3. Update Tab Buttons Active State
        toolTabs.forEach((tab) => {
            const isCurrent = tab.dataset.toolTab === targetId;
            if (isCurrent) {
                tab.className = 'admin-tab-btn px-4 py-2.5 rounded-full text-xs md:text-sm font-bold transition-all flex items-center gap-2 shrink-0 bg-forest-900 text-white shadow-sm';
            } else {
                tab.className = 'admin-tab-btn px-4 py-2.5 rounded-full text-xs md:text-sm font-bold transition-all flex items-center gap-2 shrink-0 bg-white/80 text-gray-600 hover:text-forest-900 hover:bg-white border border-gray-200/60';
            }
        });

        // 4. Update URL Hash without unwanted jump
        if (window.location.hash !== '#' + targetId) {
            history.replaceState(null, '', '#' + targetId);
        }

        // 5. If community management, load posts if needed
        if (targetId === 'community-management' && communityPosts.length === 0) {
            loadCommunityPostsAdmin();
        }

        if (window.feather) feather.replace();

        // 6. Smooth scroll if requested
        if (shouldScroll) {
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                const yOffset = -90;
                const y = targetEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
                window.scrollTo({ top: y, behavior: 'smooth' });
            }
        }
    }

    toolCards.forEach((card) => {
        card.addEventListener('click', () => switchAdminTool(card.dataset.toolCard, true));
    });

    toolTabs.forEach((tab) => {
        tab.addEventListener('click', () => switchAdminTool(tab.dataset.toolTab, true));
    });

    statTargets.forEach((target) => {
        target.addEventListener('click', () => switchAdminTool(target.dataset.toolTarget, true));
    });

    const initialHash = (window.location.hash || '').replace('#', '');
    switchAdminTool(initialHash || 'herb-management', false);

    window.addEventListener('hashchange', () => {
        const hash = (window.location.hash || '').replace('#', '');
        switchAdminTool(hash, false);
    });

    // Reload all admin data button in System Settings
    document.getElementById('btnReloadAdminData')?.addEventListener('click', async () => {
        const btn = document.getElementById('btnReloadAdminData');
        btn.disabled = true;
        btn.innerHTML = '<i data-feather="loader" class="w-4 h-4 animate-spin text-[#8CC63F]"></i> <span>Đang làm mới...</span>';
        if (window.feather) feather.replace();
        try {
            await Promise.all([loadHerbs(), loadUsers(), loadCommunityPostsAdmin()]);
            alert('Đã làm mới toàn bộ dữ liệu quản trị thành công!');
        } catch (e) {
            alert('Lỗi làm mới dữ liệu: ' + e.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-feather="refresh-cw" class="w-4 h-4 text-[#8CC63F]"></i> <span>Làm mới toàn bộ dữ liệu</span>';
            if (window.feather) feather.replace();
        }
    });

    // Preload community posts for dashboard metrics
    loadCommunityPostsAdmin().catch(() => {});
});
