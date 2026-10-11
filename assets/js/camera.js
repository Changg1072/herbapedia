// File JS cho trang chủ - Xử lý Camera và Upload ảnh
document.addEventListener('DOMContentLoaded', () => {
    const btnOpenCamera = document.getElementById('btnOpenCamera');
    const btnUploadImage = document.getElementById('btnUploadImage');
    const fileInput = document.getElementById('fileInput');
    const videoElement = document.getElementById('videoElement');
    const imagePreview = document.getElementById('imagePreview');
    const scanLine = document.getElementById('scanLine');
    const loadingStatus = document.getElementById('loadingStatus');

    const controlPopup = document.getElementById('controlPopup');
    const btnCloseControl = document.getElementById('btnCloseControl');
    const btnStartScan = document.getElementById('btnStartScan');

    if (!btnOpenCamera) return;

    function openControlPopup() {
        if (controlPopup) {
            controlPopup.classList.remove('opacity-0', 'pointer-events-none');
            controlPopup.children[1].classList.remove('scale-95');
        }
    }

    function closeControlPopup() {
        if (controlPopup) {
            controlPopup.classList.add('opacity-0', 'pointer-events-none');
            controlPopup.children[1].classList.add('scale-95');
        }
    }

    // 1. Nút "Mở Camera" -> Demo mở trực tiếp (bạn có thể thay đổi sau)
    btnOpenCamera.addEventListener('click', (e) => {
        e.preventDefault();
        openControlPopup();
    });

    // 2. Nút "Tải ảnh lên" -> Kích hoạt chọn file
    btnUploadImage.addEventListener('click', (e) => {
        e.preventDefault();
        if (fileInput) fileInput.click();
    });

    // 3. Sau khi chọn file -> Hiển thị ảnh & Bật Popup
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = function(event) {
                    // Cập nhật ảnh lên khung
                    if (imagePreview) {
                        imagePreview.src = event.target.result;
                        imagePreview.style.display = 'block';
                    }
                    if (videoElement) videoElement.style.display = 'none';
                    
                    // Lưu lại ảnh để trang Result xài
                    localStorage.setItem('lastCapturedImage', event.target.result);
                    
                    // SAU KHI TẢI ẢNH THÀNH CÔNG -> HIỆN POPUP ĐIỀU KHIỂN
                    openControlPopup();
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });
    }

    // Bắt đầu quét -> Show scan animation then redirect
    if (btnStartScan) {
        btnStartScan.addEventListener('click', () => {
            closeControlPopup();
            simulateAIAnalysis();
        });
    }

    // Đóng Popup
    if (btnCloseControl) {
        btnCloseControl.addEventListener('click', closeControlPopup);
    }
    if (controlPopup) {
        controlPopup.children[0].addEventListener('click', closeControlPopup);
    }

    function simulateAIAnalysis() {
        if(btnOpenCamera) btnOpenCamera.disabled = true;
        if(btnUploadImage) btnUploadImage.disabled = true;
        
        if (scanLine) scanLine.style.display = 'block';
        if (loadingStatus) loadingStatus.style.display = 'flex';
        
        setTimeout(() => {
            if (scanLine) scanLine.style.display = 'none';
            if (loadingStatus) loadingStatus.style.display = 'none';
            window.location.href = 'result.html';
        }, 2000);
    }
});