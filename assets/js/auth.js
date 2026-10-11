document.addEventListener('DOMContentLoaded', () => {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const authForms = document.querySelectorAll('.auth-form');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            authForms.forEach(f => f.classList.remove('active'));
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
        });
    });

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            let isValid = true;
            const email = document.getElementById('loginEmail').value;
            const pass = document.getElementById('loginPass').value;

            if (!email.includes('@')) {
                document.getElementById('errLoginEmail').innerText = "Email không hợp lệ.";
                document.getElementById('errLoginEmail').classList.remove('hidden');
                isValid = false;
            } else {
                document.getElementById('errLoginEmail').innerText = "";
                document.getElementById('errLoginEmail').classList.add('hidden');
            }

            if (pass.length < 6) {
                document.getElementById('errLoginPass').innerText = "Mật khẩu phải từ 6 kí tự.";
                document.getElementById('errLoginPass').classList.remove('hidden');
                isValid = false;
            } else {
                document.getElementById('errLoginPass').innerText = "";
                document.getElementById('errLoginPass').classList.add('hidden');
            }

            if (isValid) {
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('userName', 'Alex');
                if (typeof showCustomAlert === 'function') {
                    showCustomAlert('Đăng nhập thành công!', 'Chào mừng bạn quay trở lại HerbaPedia.', 'success', 'index.html');
                } else {
                    alert('Đăng nhập thành công!');
                    window.location.href = 'index.html';
                }
            }
        });
    }

    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            localStorage.setItem('isLoggedIn', 'true');
            localStorage.setItem('userName', 'New User');
            if (typeof showCustomAlert === 'function') {
                showCustomAlert('Đăng ký thành công!', 'Tài khoản của bạn đã được tạo.', 'success', 'index.html');
            } else {
                alert('Đăng ký thành công!');
                window.location.href = 'index.html';
            }
        });
    }
});