// File JS cho trang chủ - Xử lý Camera, Upload ảnh, Kéo thả & Khám phá Dược liệu
document.addEventListener('DOMContentLoaded', () => {
    const btnOpenCamera = document.getElementById('btnOpenCamera');
    const btnUploadImage = document.getElementById('btnUploadImage');
    const btnUploadStartScan = document.getElementById('btnUploadStartScan');
    const fileInput = document.getElementById('fileInput');
    const videoElement = document.getElementById('videoElement');
    const imagePreview = document.getElementById('imagePreview');
    const scanLine = document.getElementById('scanLine');
    const loadingStatus = document.getElementById('loadingStatus');
    const cameraFrame = document.getElementById('cameraFrame');
    const frameMessage = document.getElementById('frameMessage');
    const btnClearPreview = document.getElementById('btnClearPreview');

    const controlPopup = document.getElementById('controlPopup');
    const controlBackdrop = document.getElementById('controlBackdrop');
    const btnCloseControl = document.getElementById('btnCloseControl');
    const btnCancelControl = document.getElementById('btnCancelControl');
    const btnSaveAllSettings = document.getElementById('btnSaveAllSettings');
    const btnCameraScan = document.getElementById('btnCameraScan');
    const btnOpenSettings = document.getElementById('btnOpenSettings');
    const inputRpiUrl = document.getElementById('inputRpiUrl');
    const btnTestRpiUrl = document.getElementById('btnTestRpiUrl');
    const rpiStatusBadge = document.getElementById('rpiStatusBadge');
    const confidenceRange = document.getElementById('confidenceRange');
    const confidenceLabel = document.getElementById('confidenceLabel');
    const checkOptimizeImage = document.getElementById('checkOptimizeImage');

    let selectedUploadFile = null;
    let localStream = null;
    let isCameraStreaming = false;
    const API_BASE_URL = (window.HerbaConfig && window.HerbaConfig.API_BASE_URL) || window.API_BASE_URL || 'http://127.0.0.1:8000';

    // Toast thông báo chuyên nghiệp
    function showCameraToast(message, isError = false) {
        let toast = document.getElementById('cameraToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'cameraToast';
            document.body.appendChild(toast);
        }
        toast.className = `fixed bottom-6 right-6 z-[120] px-5 py-3 rounded-2xl shadow-xl text-xs sm:text-sm font-semibold transition-all duration-300 transform translate-y-0 opacity-100 flex items-center gap-2 ${
            isError ? 'bg-red-600 text-white' : 'bg-[#0A2F1D] text-white'
        }`;
        toast.innerHTML = isError
            ? `<i data-feather="alert-circle" class="w-4 h-4"></i> <span>${message}</span>`
            : `<i data-feather="check-circle" class="w-4 h-4 text-[#8CC63F]"></i> <span>${message}</span>`;
        if (window.feather) feather.replace();

        clearTimeout(toast._timeout);
        toast._timeout = setTimeout(() => {
            toast.classList.add('translate-y-8', 'opacity-0');
            toast.classList.remove('translate-y-0', 'opacity-100');
        }, 3000);
    }

    // 1. Quản lý nguồn Camera (Webcam vs Raspberry Pi)
    let cameraSource = localStorage.getItem('cameraSource') || 'webcam';
    let rpiCameraBase = localStorage.getItem('rpiCameraUrl') || 'http://172.20.10.8:5000';
    let isRpiVerified = (localStorage.getItem('rpiVerifiedUrl') === rpiCameraBase);

    if (inputRpiUrl) {
        inputRpiUrl.value = rpiCameraBase;
        inputRpiUrl.addEventListener('input', () => {
            const currentVal = inputRpiUrl.value.trim().replace(/\/+$/, '');
            const verifiedUrl = localStorage.getItem('rpiVerifiedUrl');
            if (currentVal !== verifiedUrl) {
                isRpiVerified = false;
                if (rpiStatusBadge) {
                    rpiStatusBadge.textContent = 'Chưa kiểm tra';
                    rpiStatusBadge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800 font-semibold';
                }
            } else {
                isRpiVerified = true;
                if (rpiStatusBadge) {
                    rpiStatusBadge.textContent = 'Đã kết nối';
                    rpiStatusBadge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold';
                }
            }
        });
    }

    // 2. Ngưỡng tự tin (Confidence slider)
    if (confidenceRange && confidenceLabel) {
        const savedConf = localStorage.getItem('minConfidence') || '35';
        confidenceRange.value = savedConf;
        confidenceLabel.textContent = `${savedConf}%`;
        confidenceRange.addEventListener('input', (e) => {
            confidenceLabel.textContent = `${e.target.value}%`;
        });
    }

    // 3. Hàm nén & tối ưu hóa ảnh trước khi upload để tăng tốc độ nhận diện gấp 5-10 lần
    function optimizeImageFile(file, maxWidth = 1024, quality = 0.85) {
        if (localStorage.getItem('autoOptimize') === 'false') {
            return Promise.resolve(file);
        }
        return new Promise((resolve) => {
            if (!file || !file.type.startsWith('image/') || file.size < 400 * 1024) {
                return resolve(file);
            }
            const img = new Image();
            const reader = new FileReader();
            reader.onload = (e) => {
                img.onload = () => {
                    let { width, height } = img;
                    if (width <= maxWidth && height <= maxWidth) {
                        return resolve(file);
                    }
                    if (width > height) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    } else {
                        width = Math.round((width * maxWidth) / height);
                        height = maxWidth;
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob(
                        (blob) => {
                            if (blob && blob.size < file.size) {
                                resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
                            } else {
                                resolve(file);
                            }
                        },
                        'image/jpeg',
                        quality
                    );
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    // 4. Quản lý chọn mô hình AI (EfficientNet-B0, Custom CNN v2, MobileNetV3 hoặc Custom CNN v1)
    const VALID_MODELS = ['efficientnet_b0', 'custom_cnn_v2', 'mobilenet_v3', 'custom_cnn'];
    let selectedModel = localStorage.getItem('selectedModel') || 'efficientnet_b0';
    if (!VALID_MODELS.includes(selectedModel)) {
        selectedModel = 'efficientnet_b0';
        localStorage.setItem('selectedModel', selectedModel);
    }

    const modelButtons = [
        { id: 'efficientnet_b0', el: document.getElementById('btnModelEfficientnet') },
        { id: 'custom_cnn_v2', el: document.getElementById('btnModelCustomCnnV2') },
        { id: 'mobilenet_v3', el: document.getElementById('btnModelMobilenet') },
        { id: 'custom_cnn', el: document.getElementById('btnModelCustomCnn') }
    ];

    function updateModelButtons() {
        modelButtons.forEach(({ id, el }) => {
            if (!el) return;
            const isActive = (selectedModel === id);
            el.className = isActive
                ? 'px-3.5 py-1.5 rounded-full transition-all duration-200 bg-forest-900 text-white shadow-sm flex items-center gap-1.5'
                : 'px-3.5 py-1.5 rounded-full transition-all duration-200 text-gray-600 hover:text-forest-900 flex items-center gap-1.5';

            const accBadge = el.querySelector('[data-model-acc]');
            if (accBadge) {
                accBadge.className = isActive
                    ? 'text-[10px] px-1.5 py-0.2 bg-[#8CC63F] text-white rounded-full font-bold'
                    : 'text-[10px] px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full font-bold';
            }
        });

        const modalModelRadio = document.querySelector(`input[name="modalModelChoice"][value="${selectedModel}"]`);
        if (modalModelRadio) modalModelRadio.checked = true;
    }

    modelButtons.forEach(({ id, el }) => {
        if (!el) return;
        el.addEventListener('click', () => {
            selectedModel = id;
            localStorage.setItem('selectedModel', selectedModel);
            updateModelButtons();
        });
    });

    // Đồng bộ độ chính xác từng mô hình từ API /models của Backend (nếu có)
    fetch(`${API_BASE_URL}/models`, { signal: AbortSignal.timeout(3000) })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (!data || !Array.isArray(data.models)) return;
            data.models.forEach(m => {
                if (m.id && m.accuracy) {
                    const badge = document.querySelector(`[data-model-acc="${m.id}"]`);
                    if (badge) badge.textContent = m.accuracy;
                }
            });
        })
        .catch(() => {});

    updateModelButtons();

    // 5. Tải danh sách dược liệu được nhận diện nhiều nhất từ backend
    loadTopRecognizedHerbs();

    // 6. Cài đặt Popup & Lưu cấu hình chung
    function openControlPopup() {
        if (!controlPopup) return;
        // Đồng bộ dữ liệu hiện tại từ localStorage vào popup
        const currentSource = localStorage.getItem('cameraSource') || 'webcam';
        const sourceRadio = document.querySelector(`input[name="cameraSourceChoice"][value="${currentSource}"]`);
        if (sourceRadio) sourceRadio.checked = true;

        const currentModel = localStorage.getItem('selectedModel') || 'efficientnet_b0';
        const modelRadio = document.querySelector(`input[name="modalModelChoice"][value="${currentModel}"]`);
        if (modelRadio) modelRadio.checked = true;

        const currentRpi = localStorage.getItem('rpiCameraUrl') || 'http://172.20.10.8:5000';
        if (inputRpiUrl) inputRpiUrl.value = currentRpi;

        // Đồng bộ trạng thái kiểm tra URL của Raspberry Pi
        const verifiedUrl = localStorage.getItem('rpiVerifiedUrl');
        if (rpiStatusBadge) {
            if (verifiedUrl && verifiedUrl === currentRpi) {
                rpiStatusBadge.textContent = 'Đã kết nối';
                rpiStatusBadge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold';
            } else {
                rpiStatusBadge.textContent = 'Chưa kiểm tra';
                rpiStatusBadge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800 font-semibold';
            }
        }

        const currentConf = localStorage.getItem('minConfidence') || '35';
        if (confidenceRange && confidenceLabel) {
            confidenceRange.value = currentConf;
            confidenceLabel.textContent = `${currentConf}%`;
        }

        const currentOptimize = localStorage.getItem('autoOptimize');
        if (checkOptimizeImage) {
            checkOptimizeImage.checked = (currentOptimize !== 'false');
        }

        controlPopup.classList.remove('opacity-0', 'pointer-events-none');
        controlPopup.children[1]?.classList.remove('scale-95');
        if (window.feather) feather.replace();
    }

    function closeControlPopup() {
        if (!controlPopup) return;
        controlPopup.classList.add('opacity-0', 'pointer-events-none');
        controlPopup.children[1]?.classList.add('scale-95');
    }

    function handleSaveSettings() {
        const chosenSource = document.querySelector('input[name="cameraSourceChoice"]:checked')?.value || 'webcam';
        const chosenModel = document.querySelector('input[name="modalModelChoice"]:checked')?.value || 'efficientnet_b0';
        const newRpiUrl = (inputRpiUrl ? inputRpiUrl.value : '').trim().replace(/\/+$/, '');
        const newConf = confidenceRange ? confidenceRange.value : '35';
        const newOptimize = checkOptimizeImage ? checkOptimizeImage.checked : true;

        if (chosenSource === 'rpi' && !newRpiUrl) {
            showCameraToast('Vui lòng nhập địa chỉ URL của Raspberry Pi!', true);
            return;
        }

        // Lưu vào localStorage
        localStorage.setItem('cameraSource', chosenSource);
        localStorage.setItem('selectedModel', chosenModel);
        if (newRpiUrl) localStorage.setItem('rpiCameraUrl', newRpiUrl);
        localStorage.setItem('minConfidence', newConf);
        localStorage.setItem('autoOptimize', newOptimize ? 'true' : 'false');

        // Cập nhật biến bộ nhớ
        const previousSource = cameraSource;
        cameraSource = chosenSource;
        selectedModel = chosenModel;
        if (newRpiUrl) rpiCameraBase = newRpiUrl;

        // Cập nhật nút chọn model bên ngoài
        updateModelButtons();

        // Nếu người dùng chọn Raspberry Pi mà chưa kiểm tra kết nối, đưa ra nhắc nhở rõ ràng
        if (chosenSource === 'rpi') {
            const verifiedUrl = localStorage.getItem('rpiVerifiedUrl');
            if (!isRpiVerified || verifiedUrl !== newRpiUrl) {
                showCameraToast('Đã lưu cấu hình. Chú ý: Cần nhấn "Kiểm tra kết nối" thành công để có thể mở camera Raspberry Pi!', false);
            } else {
                showCameraToast('Đã lưu cấu hình nhận diện thành công!');
            }
        } else {
            showCameraToast('Đã lưu cấu hình nhận diện thành công!');
        }

        // Nếu camera đang bật, cập nhật luồng theo cấu hình mới
        if (isCameraStreaming) {
            if (previousSource !== chosenSource) {
                stopCameraStream();
                if (chosenSource === 'webcam') {
                    toggleCameraStream();
                }
            } else if (chosenSource === 'rpi' && imagePreview) {
                imagePreview.src = `${rpiCameraBase}/video_feed?t=${Date.now()}`;
            }
        }

        closeControlPopup();
    }

    if (btnOpenSettings) {
        btnOpenSettings.addEventListener('click', (e) => {
            e.preventDefault();
            openControlPopup();
        });
    }

    if (btnSaveAllSettings) {
        btnSaveAllSettings.addEventListener('click', handleSaveSettings);
    }

    if (btnCancelControl) {
        btnCancelControl.addEventListener('click', closeControlPopup);
    }

    if (btnCloseControl) {
        btnCloseControl.addEventListener('click', closeControlPopup);
    }

    if (controlBackdrop) {
        controlBackdrop.addEventListener('click', closeControlPopup);
    }

    if (btnTestRpiUrl) {
        btnTestRpiUrl.addEventListener('click', async () => {
            const targetUrl = (inputRpiUrl.value || '').trim().replace(/\/+$/, '');
            if (!targetUrl) {
                showCameraToast('Vui lòng nhập URL Raspberry Pi trước khi kiểm tra!', true);
                return;
            }
            if (rpiStatusBadge) {
                rpiStatusBadge.textContent = 'Đang kiểm tra...';
                rpiStatusBadge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold';
            }
            btnTestRpiUrl.disabled = true;
            btnTestRpiUrl.innerHTML = '<i data-feather="loader" class="w-3.5 h-3.5 animate-spin"></i> Đang kiểm tra...';
            if (window.feather) feather.replace();

            try {
                const response = await fetch(`${targetUrl}/status`, { signal: AbortSignal.timeout(3500) });
                if (response.ok) {
                    isRpiVerified = true;
                    localStorage.setItem('rpiVerifiedUrl', targetUrl);
                    if (rpiStatusBadge) {
                        rpiStatusBadge.textContent = 'Đã kết nối';
                        rpiStatusBadge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-green-100 text-green-700 font-semibold';
                    }
                    showCameraToast('Kết nối Raspberry Pi thành công! Đã sẵn sàng mở camera.');
                } else {
                    throw new Error('Phản hồi không hợp lệ');
                }
            } catch (err) {
                isRpiVerified = false;
                localStorage.removeItem('rpiVerifiedUrl');
                if (rpiStatusBadge) {
                    rpiStatusBadge.textContent = 'Lỗi kết nối';
                    rpiStatusBadge.className = 'text-[11px] px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold';
                }
                showCameraToast('Không thể kết nối đến Raspberry Pi. Vui lòng kiểm tra lại địa chỉ IP hoặc mạng LAN.', true);
            } finally {
                btnTestRpiUrl.disabled = false;
                btnTestRpiUrl.innerHTML = '<i data-feather="activity" class="w-3.5 h-3.5 text-[#8CC63F]"></i> Kiểm tra kết nối';
                if (window.feather) feather.replace();
            }
        });
    }

    // 7. Xử lý mở/tắt Camera (Hỗ trợ cả Webcam và Raspberry Pi)
    btnOpenCamera.addEventListener('click', (e) => {
        e.preventDefault();
        toggleCameraStream();
    });

    async function toggleCameraStream() {
        if (!isCameraStreaming) {
            // YÊU CẦU: Nếu nguồn là Raspberry Pi mà chưa kiểm tra kết nối thành công, không cho mở camera
            if (cameraSource === 'rpi') {
                const verifiedUrl = localStorage.getItem('rpiVerifiedUrl');
                if (!isRpiVerified || !verifiedUrl || verifiedUrl !== rpiCameraBase) {
                    showCameraToast('Chưa kiểm tra kết nối Raspberry Pi! Vui lòng vào Cài đặt và nhấn "Kiểm tra kết nối" trước khi mở camera.', true);
                    openControlPopup();
                    const testBtn = document.getElementById('btnTestRpiUrl');
                    if (testBtn) {
                        testBtn.classList.add('ring-4', 'ring-[#8CC63F]/50', 'animate-pulse');
                        setTimeout(() => testBtn.classList.remove('ring-4', 'ring-[#8CC63F]/50', 'animate-pulse'), 3500);
                    }
                    return;
                }
            }

            // Mở camera
            if (cameraSource === 'webcam') {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            facingMode: 'environment',
                            width: { ideal: 1280 },
                            height: { ideal: 720 }
                        }
                    });
                    localStream = stream;
                    if (videoElement) {
                        videoElement.srcObject = stream;
                        videoElement.style.display = 'block';
                    }
                    if (imagePreview) imagePreview.style.display = 'none';
                    if (frameMessage) frameMessage.style.display = 'none';
                    isCameraStreaming = true;
                } catch (err) {
                    console.warn('Không thể mở Webcam máy tính:', err);
                    alert('Không thể mở Webcam của thiết bị. Vui lòng cấp quyền truy cập camera hoặc thử tải ảnh lên.');
                    return;
                }
            } else {
                // Raspberry Pi Stream
                isCameraStreaming = true;
                if (imagePreview) {
                    imagePreview.src = `${rpiCameraBase}/video_feed?t=${Date.now()}`;
                    imagePreview.style.display = 'block';
                }
                if (videoElement) videoElement.style.display = 'none';
                if (frameMessage) frameMessage.style.display = 'none';
            }

            btnOpenCamera.innerHTML = '<i data-feather="video-off" class="w-4 h-4 stroke-[2.5]"></i> Tắt camera';
            btnOpenCamera.className = 'flex items-center justify-center gap-2 px-8 py-3.5 bg-gray-700 text-white rounded-full font-semibold text-sm transition-all duration-300 hover:bg-gray-800 hover:shadow-lg w-full sm:w-auto';

            if (btnCameraScan) {
                btnCameraScan.classList.remove('hidden');
                btnCameraScan.classList.add('flex');
            }
            if (btnUploadImage) btnUploadImage.classList.add('hidden');
            if (btnUploadStartScan) {
                btnUploadStartScan.classList.add('hidden');
                btnUploadStartScan.classList.remove('flex');
            }
            if (btnClearPreview) {
                btnClearPreview.classList.remove('hidden');
                btnClearPreview.classList.add('flex');
            }
        } else {
            stopCameraStream();
        }
        if (typeof feather !== 'undefined') feather.replace();
    }

    function stopCameraStream() {
        isCameraStreaming = false;
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }
        if (videoElement) {
            videoElement.srcObject = null;
            videoElement.style.display = 'none';
        }
        if (imagePreview) {
            imagePreview.src = '';
            imagePreview.style.display = 'none';
        }
        if (frameMessage) frameMessage.style.display = 'flex';

        btnOpenCamera.innerHTML = '<i data-feather="video" class="w-4 h-4 stroke-[2.5]"></i> Mở camera';
        btnOpenCamera.className = 'flex items-center justify-center gap-2 px-8 py-3.5 bg-forest-900 text-white rounded-full font-semibold text-sm transition-all duration-300 hover:bg-[#132a18] hover:shadow-lg hover:-translate-y-0.5 w-full sm:w-auto';

        if (btnCameraScan) {
            btnCameraScan.classList.add('hidden');
            btnCameraScan.classList.remove('flex');
        }
        if (btnUploadImage) btnUploadImage.classList.remove('hidden');
        if (btnClearPreview) {
            btnClearPreview.classList.add('hidden');
            btnClearPreview.classList.remove('flex');
        }
        if (typeof feather !== 'undefined') feather.replace();
    }

    // 8. Nút "Huỷ / Xoá ảnh xem trước" (Reset Frame)
    if (btnClearPreview) {
        btnClearPreview.addEventListener('click', (e) => {
            e.stopPropagation();
            resetCameraFrame();
        });
    }

    function resetCameraFrame() {
        if (isCameraStreaming) {
            stopCameraStream();
        }
        selectedUploadFile = null;
        if (fileInput) fileInput.value = '';
        if (imagePreview) {
            imagePreview.src = '';
            imagePreview.style.display = 'none';
        }
        if (videoElement) {
            videoElement.srcObject = null;
            videoElement.style.display = 'none';
        }
        if (frameMessage) frameMessage.style.display = 'flex';
        if (btnUploadStartScan) {
            btnUploadStartScan.classList.add('hidden');
            btnUploadStartScan.classList.remove('flex');
        }
        if (btnUploadImage) btnUploadImage.classList.remove('hidden');
        if (btnClearPreview) {
            btnClearPreview.classList.add('hidden');
            btnClearPreview.classList.remove('flex');
        }
        if (scanLine) scanLine.style.display = 'none';
        if (loadingStatus) loadingStatus.style.display = 'none';
        if (typeof feather !== 'undefined') feather.replace();
    }

    // 9. Nút "Tải ảnh lên"
    btnUploadImage.addEventListener('click', (e) => {
        e.preventDefault();
        if (fileInput) fileInput.click();
    });

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleSelectedImageFile(e.target.files[0]);
            }
        });
    }

    function handleSelectedImageFile(file) {
        if (isCameraStreaming) stopCameraStream();
        selectedUploadFile = file;
        const reader = new FileReader();
        reader.onload = function(event) {
            if (imagePreview) {
                imagePreview.src = event.target.result;
                imagePreview.style.display = 'block';
            }
            if (frameMessage) frameMessage.style.display = 'none';
            if (videoElement) videoElement.style.display = 'none';
            if (btnClearPreview) {
                btnClearPreview.classList.remove('hidden');
                btnClearPreview.classList.add('flex');
            }
            localStorage.setItem('lastCapturedImage', event.target.result);
            if (btnUploadStartScan) {
                btnUploadStartScan.classList.remove('hidden');
                btnUploadStartScan.classList.add('flex');
            }
            if (typeof feather !== 'undefined') feather.replace();
        };
        reader.readAsDataURL(file);
    }

    // 10. Kéo & Thả ảnh vào Camera Frame (Drag and Drop)
    if (cameraFrame) {
        cameraFrame.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            cameraFrame.classList.add('drag-active');
        });

        cameraFrame.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            cameraFrame.classList.remove('drag-active');
        });

        cameraFrame.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            cameraFrame.classList.remove('drag-active');
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const droppedFile = e.dataTransfer.files[0];
                if (droppedFile.type.startsWith('image/')) {
                    handleSelectedImageFile(droppedFile);
                } else {
                    alert('Vui lòng chỉ kéo thả tệp hình ảnh (.jpg, .png, .jpeg, .webp).');
                }
            }
        });

        // Nhấn vào khung trống cũng mở chọn file
        cameraFrame.addEventListener('click', (e) => {
            if (e.target.closest('#btnClearPreview') || e.target.closest('button')) return;
            if (!isCameraStreaming && (!imagePreview || imagePreview.style.display === 'none')) {
                if (fileInput) fileInput.click();
            }
        });
    }

    // 11. Thử nhanh ảnh mẫu lá cây (Quick Sample Chips)
    const sampleChips = document.querySelectorAll('.sample-chip');
    sampleChips.forEach(chip => {
        chip.addEventListener('click', async (e) => {
            e.preventDefault();
            const sampleUrl = chip.dataset.sampleUrl;
            const sampleName = chip.dataset.sampleName || 'Lá mẫu';
            if (!sampleUrl) return;

            if (isCameraStreaming) stopCameraStream();

            if (loadingStatus) {
                loadingStatus.style.display = 'flex';
                loadingStatus.innerHTML = `<i data-feather="loader" class="w-4 h-4 animate-spin text-[#8CC63F]"></i> Đang nạp ảnh mẫu ${sampleName}...`;
                if (typeof feather !== 'undefined') feather.replace();
            }

            try {
                const res = await fetch(sampleUrl);
                const blob = await res.blob();
                const file = new File([blob], `${sampleName.toLowerCase().replace(/\s+/g, '_')}.jpg`, { type: 'image/jpeg' });
                handleSelectedImageFile(file);
            } catch (err) {
                // Fallback nếu fetch blob bị CORS
                if (imagePreview) {
                    imagePreview.src = sampleUrl;
                    imagePreview.style.display = 'block';
                }
                if (frameMessage) frameMessage.style.display = 'none';
                if (btnClearPreview) {
                    btnClearPreview.classList.remove('hidden');
                    btnClearPreview.classList.add('flex');
                }
                localStorage.setItem('lastCapturedImage', sampleUrl);
                // Tạo blob từ canvas để gửi backend
                const tempImg = new Image();
                tempImg.crossOrigin = 'anonymous';
                tempImg.onload = () => {
                    const canvas = document.createElement('canvas');
                    canvas.width = tempImg.width || 600;
                    canvas.height = tempImg.height || 600;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(tempImg, 0, 0);
                    canvas.toBlob((b) => {
                        if (b) {
                            selectedUploadFile = new File([b], 'sample.jpg', { type: 'image/jpeg' });
                        }
                    }, 'image/jpeg');
                };
                tempImg.src = sampleUrl;

                if (btnUploadStartScan) {
                    btnUploadStartScan.classList.remove('hidden');
                    btnUploadStartScan.classList.add('flex');
                }
            } finally {
                if (loadingStatus) loadingStatus.style.display = 'none';
            }
        });
    });

    // 12. Chụp ảnh từ Camera (Webcam hoặc Raspberry Pi) và gửi Backend
    async function handleCameraScan() {
        if (!isCameraStreaming) {
            alert('Vui lòng mở camera trước khi quét.');
            return;
        }

        if (btnCameraScan) {
            btnCameraScan.disabled = true;
            btnCameraScan.innerHTML = '<i data-feather="loader" class="w-4 h-4 animate-spin"></i> Đang chụp & phân tích...';
            if (typeof feather !== 'undefined') feather.replace();
        }
        if (scanLine) scanLine.style.display = 'block';
        if (loadingStatus) {
            loadingStatus.style.display = 'flex';
            loadingStatus.innerHTML = '<i data-feather="loader" class="w-4 h-4 animate-spin text-[#8CC63F]"></i> AI đang phân tích dữ liệu...';
            if (typeof feather !== 'undefined') feather.replace();
        }

        try {
            let capturedBlob = null;

            if (cameraSource === 'webcam') {
                // Chụp khung hình từ Video Element
                if (!videoElement || videoElement.videoWidth === 0) {
                    throw new Error('Khung hình camera chưa sẵn sàng.');
                }
                const canvas = document.createElement('canvas');
                canvas.width = videoElement.videoWidth;
                canvas.height = videoElement.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                capturedBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
            } else {
                // Chụp từ Raspberry Pi qua /capture
                const captureRes = await fetch(`${rpiCameraBase}/capture`, { signal: AbortSignal.timeout(4000) });
                if (!captureRes.ok) throw new Error('Không thể chụp ảnh từ Raspberry Pi.');
                capturedBlob = await captureRes.blob();
            }

            // Chuyển blob thành Base64 để lưu vào localStorage cho trang result.html hiển thị
            const base64Data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(capturedBlob);
            });
            localStorage.setItem('lastCapturedImage', base64Data);

            // Gửi ảnh đến Backend /predict
            const token = localStorage.getItem('accessToken');
            const formData = new FormData();
            formData.append('file', capturedBlob, 'camera_capture.jpg');
            formData.append('model_name', selectedModel);

            const headers = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const predRes = await fetch(`${API_BASE_URL}/predict`, {
                method: 'POST',
                headers: headers,
                body: formData
            });

            if (!predRes.ok) {
                const errRes = await predRes.json().catch(() => ({}));
                throw new Error(errRes.detail || 'Không thể nhận diện ảnh từ camera.');
            }

            const predictionData = await predRes.json();
            localStorage.setItem('lastPrediction', JSON.stringify(predictionData));

            // Hiệu ứng quét 1s trước khi sang trang kết quả
            setTimeout(() => {
                if (scanLine) scanLine.style.display = 'none';
                if (loadingStatus) loadingStatus.style.display = 'none';
                window.location.href = 'result.html';
            }, 1000);

        } catch (err) {
            console.error('Lỗi khi quét từ camera:', err);
            alert(err.message || 'Lỗi chụp ảnh từ camera.');
            if (btnCameraScan) {
                btnCameraScan.disabled = false;
                btnCameraScan.innerHTML = '<i data-feather="camera" class="w-4 h-4"></i> Bắt đầu quét';
                if (typeof feather !== 'undefined') feather.replace();
            }
            if (scanLine) scanLine.style.display = 'none';
            if (loadingStatus) loadingStatus.style.display = 'none';
        }
    }

    if (btnCameraScan) {
        btnCameraScan.addEventListener('click', handleCameraScan);
    }


    // 13. Xử lý quét file tải lên
    if (btnUploadStartScan) {
        btnUploadStartScan.addEventListener('click', async () => {
            if (!selectedUploadFile) {
                alert('Vui lòng chọn hoặc tải ảnh lên trước khi quét.');
                return;
            }
            const token = localStorage.getItem('accessToken');
            const headers = {};
            if (token) headers['Authorization'] = `Bearer ${token}`;

            btnUploadStartScan.disabled = true;
            btnUploadStartScan.innerHTML = '<i data-feather="loader" class="w-4 h-4 animate-spin"></i> Đang quét...';
            if (typeof feather !== 'undefined') feather.replace();
            if (scanLine) scanLine.style.display = 'block';
            if (loadingStatus) {
                loadingStatus.style.display = 'flex';
                loadingStatus.innerHTML = '<i data-feather="loader" class="w-4 h-4 animate-spin text-[#8CC63F]"></i> AI đang phân tích hình thái lá cây...';
                if (typeof feather !== 'undefined') feather.replace();
            }

            try {
                const optimizedFile = await optimizeImageFile(selectedUploadFile);
                const formData = new FormData();
                formData.append('file', optimizedFile, optimizedFile.name);
                formData.append('model_name', selectedModel);

                const response = await fetch(`${API_BASE_URL}/predict`, {
                    method: 'POST',
                    headers: headers,
                    body: formData
                });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(result.detail || 'Không thể nhận diện ảnh.');
                }
                localStorage.setItem('lastPrediction', JSON.stringify(result));
                window.location.href = 'result.html';
            } catch (error) {
                alert(error.message);
                btnUploadStartScan.disabled = false;
                btnUploadStartScan.innerHTML = '<i data-feather="search" class="w-4 h-4"></i> Bắt đầu quét ảnh';
                if (typeof feather !== 'undefined') feather.replace();
                if (scanLine) scanLine.style.display = 'none';
                if (loadingStatus) loadingStatus.style.display = 'none';
            }
        });
    }


    // 15. Tải danh sách Dược liệu nhận diện nhiều nhất từ API
    async function loadTopRecognizedHerbs() {
        const container = document.getElementById('topRecognizedContainer');
        if (!container) return;

        try {
            const response = await fetch(`${API_BASE_URL}/herbs/top-recognized?limit=4`, {
                signal: AbortSignal.timeout(3000)
            });
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const herbs = await response.json();

            if (!Array.isArray(herbs) || herbs.length === 0) {
                container.innerHTML = `
                    <div class="col-span-full py-8 text-center text-gray-500 w-full bg-white/70 rounded-2xl border border-gray-100">
                        <p class="text-sm">Chưa có dữ liệu nhận diện dược liệu.</p>
                    </div>
                `;
                return;
            }

            const escapeHtml = (str) => {
                if (!str) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            };

            const defaultFallbackImg = 'https://images.unsplash.com/photo-1596484552834-6a58f850e0a1?w=400&h=400&fit=crop';

            const cardsHtml = herbs.map((herb, idx) => {
                const rank = herb.rank || (idx + 1);
                let badgeClass = 'bg-gray-400';
                if (rank === 1) {
                    badgeClass = 'bg-[#8CC63F]';
                } else if (rank === 2) {
                    badgeClass = 'bg-gradient-to-r from-[#8CC63F] to-green-500';
                } else if (rank === 3) {
                    badgeClass = 'bg-gradient-to-r from-green-500 to-emerald-500';
                }

                const imgUrl = (herb.image && String(herb.image).trim()) ? herb.image.trim() : defaultFallbackImg;
                const countFormatted = Number(herb.recognition_count || 0).toLocaleString('vi-VN');
                const targetUrl = `detail.html?id=${encodeURIComponent(herb.slug || herb.id)}`;

                return `
                    <a href="${targetUrl}" class="w-[75vw] md:w-auto shrink-0 snap-center bg-white/90 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm hover:-translate-y-1.5 hover:shadow-lg transition-all duration-300 flex flex-col group cursor-pointer block overflow-hidden">
                        <div class="relative h-48 w-full overflow-hidden bg-gray-100">
                            <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(herb.name)}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onerror="this.onerror=null;this.src='${defaultFallbackImg}';">
                            <span class="absolute top-3 left-3 ${badgeClass} text-white text-xs font-bold px-3 py-1 rounded-full shadow-md z-10">Top ${rank}</span>
                        </div>
                        <div class="p-4 flex flex-col flex-1">
                            <h3 class="text-base font-bold text-gray-800 line-clamp-1 group-hover:text-[#8CC63F] transition-colors">${escapeHtml(herb.name)}</h3>
                            <p class="text-xs text-gray-400 italic mb-3 line-clamp-1 font-light">${escapeHtml(herb.scientific || '')}</p>
                            
                            <div class="border-t border-gray-100 pt-3 mt-auto flex items-center justify-between">
                                <div class="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                                    <i data-feather="camera" class="w-3.5 h-3.5 text-[#8CC63F]"></i>
                                    <span>${countFormatted} lượt quét</span>
                                </div>
                                <span class="text-xs text-[#8CC63F] font-bold group-hover:translate-x-1 transition-transform">Chi tiết &rarr;</span>
                            </div>
                        </div>
                    </a>
                `;
            }).join('');

            container.innerHTML = cardsHtml;
            if (typeof feather !== 'undefined') {
                feather.replace();
            }
        } catch (error) {
            console.error('Lỗi khi tải danh sách dược liệu hàng đầu:', error);
            container.innerHTML = `
                <div class="col-span-full py-8 text-center text-gray-400 w-full bg-white/70 rounded-2xl border border-gray-100">
                    <p class="text-sm">Không thể tải dữ liệu dược liệu được nhận diện nhiều nhất.</p>
                </div>
            `;
        }
    }
});
