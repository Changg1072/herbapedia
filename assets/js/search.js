// Dữ liệu giả lập
const mockHerbs = [
    {
        id: "tiato_123",
        name: "Lá Tía Tô",
        scientific: "Perilla frutescens",
        img: "https://images.unsplash.com/photo-1596484552834-6a58f850e0a1?auto=format&fit=crop&w=300&q=80",
        usage: "Giải cảm, trị ho, đầy bụng, làm đẹp da.",
        tags: ["GiaiDoc", "TriHo", "LamDep", "TieuHoa"],
        tinhVi: "Ôn",
        boPhan: "Lá",
        anToan: "Không độc"
    },
    {
        id: "ngai_cuu",
        name: "Ngải Cứu",
        scientific: "Artemisia vulgaris",
        img: "https://images.unsplash.com/photo-1628155930542-3c7a64e2c848?auto=format&fit=crop&w=300&q=80",
        usage: "Chữa đau bụng kinh, an thai, sơ cứu vết thương.",
        tags: ["TieuHoa", "GiaiDoc"],
        tinhVi: "Ôn",
        boPhan: "Lá",
        anToan: "Không độc"
    },
    {
        id: "ma_tien",
        name: "Mã Tiền",
        scientific: "Strychnos nux-vomica",
        img: "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?auto=format&fit=crop&w=300&q=80",
        usage: "Chữa đau nhức xương khớp, tê liệt. Rất độc cần bào chế.",
        tags: ["CoDoc"],
        tinhVi: "Hàn",
        boPhan: "Quả",
        anToan: "Có độc"
    },
    {
        id: "sen",
        name: "Tâm Sen",
        scientific: "Nelumbo nucifera",
        img: "https://images.unsplash.com/photo-1579705745173-02f8ddc6412e?auto=format&fit=crop&w=300&q=80",
        usage: "An thần, chữa mất ngủ, thanh nhiệt.",
        tags: ["AnThan"],
        tinhVi: "Hàn",
        boPhan: "Lá", // Có thể dùng lá, tâm
        anToan: "Không độc"
    }
];

document.addEventListener('DOMContentLoaded', () => {
    const resultsGrid = document.getElementById('resultsGrid');
    const searchInput = document.getElementById('searchInput');
    const tags = document.querySelectorAll('.tag');
    const filterTinhVi = document.getElementById('filterTinhVi');
    const filterBoPhan = document.getElementById('filterBoPhan');
    const filterAnToan = document.getElementById('filterAnToan');

    let currentTag = 'all';

    function renderHerbs(data) {
        resultsGrid.innerHTML = '';
        if(data.length === 0) {
            resultsGrid.innerHTML = '<p class="col-span-full text-center text-gray-500 font-light">Không tìm thấy kết quả phù hợp.</p>';
            return;
        }

        data.forEach(herb => {
            const dangerHtml = herb.anToan === "Có độc" ? `<span class="inline-flex items-center gap-1 bg-red-50 text-red-600 text-xs font-bold px-2 py-1 rounded-full mt-3 self-start"><i data-feather="alert-triangle" class="w-3 h-3"></i> Có độc</span>` : '';
            // Randomize a high confidence score for demo purpose
            const aiScore = Math.floor(Math.random() * (99 - 90 + 1) + 90);
            const cardHtml = `
                <a href="detail.html?id=${herb.id}" class="relative flex flex-col bg-white/80 backdrop-blur-md rounded-2xl overflow-hidden border border-white/60 shadow-[0_4px_16px_rgba(0,0,0,0.03)] transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:border-green-300 group cursor-pointer">
                    <div class="absolute top-3 left-3 bg-gradient-to-r from-[#1b3b22] to-yellow-400 text-white text-xs font-bold px-3 py-1 rounded-full shadow-md z-10 border border-white/20">Độ tin cậy AI: ${aiScore}%</div>
                    <img src="${herb.img}" alt="${herb.name}" class="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-500">
                    <div class="p-5 flex flex-col flex-1">
                        <h3 class="text-xl font-bold text-[#1b3b22]">${herb.name}</h3>
                        <p class="italic text-sm text-gray-500 mb-2">${herb.scientific}</p>
                        <p class="text-sm text-gray-700 font-light leading-relaxed">${herb.usage}</p>
                        ${dangerHtml}
                    </div>
                </a>
            `;
            resultsGrid.insertAdjacentHTML('beforeend', cardHtml);
        });
        
        // Re-initialize feather icons for newly added elements
        if (typeof feather !== 'undefined') {
            feather.replace();
        }
    }

    // Helper function to toggle active class on filters
    function toggleFilterActive(selectEl) {
        if (selectEl.value !== "") {
            selectEl.classList.add('active');
        } else {
            selectEl.classList.remove('active');
        }
    }

    function applyFilters() {
        const keyword = searchInput.value.toLowerCase();
        const fTinhVi = filterTinhVi.value;
        const fBoPhan = filterBoPhan.value;
        const fAnToan = filterAnToan.value;

        // Cập nhật trạng thái active cho dropdown
        toggleFilterActive(filterTinhVi);
        toggleFilterActive(filterBoPhan);
        toggleFilterActive(filterAnToan);

        const filteredData = mockHerbs.filter(herb => {
            // Lọc theo keyword
            const matchKeyword = herb.name.toLowerCase().includes(keyword) || 
                                 herb.usage.toLowerCase().includes(keyword) || 
                                 herb.scientific.toLowerCase().includes(keyword);
            
            // Lọc theo tag
            const matchTag = currentTag === 'all' || herb.tags.includes(currentTag);

            // Lọc theo Dropdowns
            const matchTinhVi = fTinhVi === "" || herb.tinhVi === fTinhVi;
            const matchBoPhan = fBoPhan === "" || herb.boPhan === fBoPhan;
            const matchAnToan = fAnToan === "" || herb.anToan === fAnToan;

            return matchKeyword && matchTag && matchTinhVi && matchBoPhan && matchAnToan;
        });

        renderHerbs(filteredData);
    }

    // Gán sự kiện
    searchInput.addEventListener('input', applyFilters);
    filterTinhVi.addEventListener('change', applyFilters);
    filterBoPhan.addEventListener('change', applyFilters);
    filterAnToan.addEventListener('change', applyFilters);

    tags.forEach(tagBtn => {
        tagBtn.addEventListener('click', (e) => {
            tags.forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            currentTag = e.target.getAttribute('data-tag');
            applyFilters();
        });
    });

    // Khởi tạo render lần đầu
    renderHerbs(mockHerbs);
});

