// Logic dùng chung (Responsive Navbar, Utils, etc.)
document.addEventListener('DOMContentLoaded', () => {
    console.log("HerbaPedia App Initialized.");
    
    // Highlight menu đang được chọn (Active) dựa vào URL hiện tại
    const currentPath = window.location.pathname.split('/').pop();
    const navLinks = document.querySelectorAll('.nav-links a');
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if(link.getAttribute('href') === currentPath || (currentPath === '' && link.getAttribute('href') === 'index.html')) {
            link.classList.add('active');
        }
    });

    // Scroll event for navbar frosted glass effect
    const navbar = document.getElementById('navbar');
    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 20) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        });
    }
});

// Custom Botanical Alert Modal
window.showCustomAlert = function(title, message, type = 'success', redirectUrl = null) {
    const existingModal = document.getElementById('botanicalModal');
    if (existingModal) existingModal.remove();

    const iconStr = type === 'success' 
        ? '<i data-feather="check-circle" class="w-12 h-12 text-green-500 mb-4 mx-auto"></i>' 
        : '<i data-feather="alert-circle" class="w-12 h-12 text-yellow-500 mb-4 mx-auto"></i>';

    const modalHtml = `
    <div id="botanicalModal" class="fixed inset-0 z-[100] flex items-center justify-center p-4 opacity-0 transition-opacity duration-300">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-[#1b3b22]/40 backdrop-blur-sm"></div>
        
        <!-- Modal Content -->
        <div class="relative bg-[#fdfbf7] rounded-[2rem] p-8 max-w-sm w-full shadow-2xl transform scale-95 transition-transform duration-300 border border-green-900/10 overflow-hidden text-center z-10">
            
            <!-- Botanical Frame Decor -->
            <svg class="absolute top-0 left-0 w-32 h-32 text-[#1b3b22] opacity-[0.06] transform -translate-x-4 -translate-y-4" viewBox="0 0 200 200" fill="currentColor">
              <path d="M10,0 Q10,50 50,90 Q90,130 150,150 Q100,120 70,70 Q40,20 10,0 Z" />
              <path d="M30,70 Q50,110 90,130 Q70,90 30,70 Z" />
              <path d="M70,30 Q110,50 130,90 Q90,70 70,30 Z" />
            </svg>
            <svg class="absolute bottom-0 right-0 w-40 h-40 text-[#1b3b22] opacity-[0.06] transform translate-x-4 translate-y-4 rotate-180" viewBox="0 0 200 200" fill="currentColor">
              <path d="M10,0 Q10,50 50,90 Q90,130 150,150 Q100,120 70,70 Q40,20 10,0 Z" />
              <path d="M30,70 Q50,110 90,130 Q70,90 30,70 Z" />
              <path d="M70,30 Q110,50 130,90 Q90,70 70,30 Z" />
            </svg>
            
            ${iconStr}
            
            <h3 class="font-serif text-2xl font-bold text-[#1b3b22] mb-2 relative z-10">${title}</h3>
            <p class="text-gray-600 text-sm font-light mb-6 relative z-10">${message}</p>
            
            <button id="closeModalBtn" class="relative z-10 w-full px-6 py-3 bg-[#1b3b22] text-white rounded-full font-semibold text-sm hover:bg-[#132a18] shadow-md transition-all hover:-translate-y-0.5">
                ${redirectUrl ? 'Tiếp tục' : 'Đóng'}
            </button>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    if (typeof feather !== 'undefined') feather.replace();

    const modal = document.getElementById('botanicalModal');
    const modalContent = modal.children[1]; // The inner content card
    
    // Animation in
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95');
    }, 10);

    // Close logic
    const closeBtn = document.getElementById('closeModalBtn');
    closeBtn.addEventListener('click', () => {
        modal.classList.add('opacity-0');
        modalContent.classList.add('scale-95');
        setTimeout(() => {
            modal.remove();
            if (redirectUrl) window.location.href = redirectUrl;
        }, 300);
    });
};
// Handle dynamic login state in Navbar
document.addEventListener('DOMContentLoaded', () => {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';
    const userName = localStorage.getItem('userName') || 'Alex';
    
    // Find the login button
    const loginLinks = document.querySelectorAll('a[href="auth.html"]');
    loginLinks.forEach(link => {
        if(link.innerText.includes('Đăng nhập') || link.innerText.includes('Dang nh?p')) {
            const authLinkLi = link.parentElement;
            if (isLoggedIn && authLinkLi && authLinkLi.tagName === 'LI') {
                authLinkLi.outerHTML = `
                    <li class="relative group">
                        <button class="flex items-center gap-2 bg-white/70 backdrop-blur-md border border-gray-200 text-[#1b3b22] px-4 py-1.5 rounded-full hover:bg-white shadow-sm transition-all cursor-pointer">
                            <img src="https://i.pravatar.cc/150?u=a042581f4e29026704d" alt="Avatar" class="w-6 h-6 rounded-full object-cover">
                            <span class="font-bold text-sm">Hi, ${userName}</span>
                            <i data-feather="chevron-down" class="w-4 h-4 text-gray-500"></i>
                        </button>
                        <div class="absolute right-0 mt-2 w-48 bg-white/90 backdrop-blur-xl border border-white/80 shadow-lg rounded-2xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 z-50">
                            <a href="profile.html" class="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-[#eef1e6] hover:text-[#1b3b22] transition-colors">
                                <i data-feather="user" class="w-4 h-4"></i> Hồ sơ cá nhân
                            </a>
                            <a href="personal-history.html" class="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-[#eef1e6] hover:text-[#1b3b22] transition-colors">
                                <i data-feather="clock" class="w-4 h-4"></i> Lịch sử cá nhân
                            </a>
                            <div class="h-px bg-gray-200/60 my-1"></div>
                            <a href="#" id="btnLogout" class="flex items-center gap-2 px-4 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors">
                                <i data-feather="log-out" class="w-4 h-4"></i> Đăng xuất
                            </a>
                        </div>
                    </li>
                `;
            }
        }
    });

        // Show personal accuracy data if logged in
    const userAccuracyBlock = document.getElementById('userAccuracyBlock');
    if (userAccuracyBlock && isLoggedIn) {
        userAccuracyBlock.classList.remove('hidden');
    }
    if (isLoggedIn && typeof feather !== 'undefined') {
        feather.replace();
    }

    const btnLogout = document.getElementById('btnLogout');
    if(btnLogout) {
        btnLogout.addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('isLoggedIn');
            localStorage.removeItem('userName');
            window.location.reload();
        });
    }
});