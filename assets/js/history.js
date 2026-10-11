document.addEventListener('DOMContentLoaded', () => {
    const historyList = document.getElementById('historyList');

    // Dữ liệu mẫu ban đầu để hiển thị (Trong thực tế sẽ dùng localStorage)
    let historyData = [
        {
            id: 1,
            name: "Lá Tía Tô",
            img: "https://images.unsplash.com/photo-1596484552834-6a58f850e0a1?auto=format&fit=crop&w=150&q=80",
            accuracy: 96,
            time: "10 phút trước"
        },
        {
            id: 2,
            name: "Ngải Cứu",
            img: "https://images.unsplash.com/photo-1628155930542-3c7a64e2c848?auto=format&fit=crop&w=150&q=80",
            accuracy: 89,
            time: "2 ngày trước"
        }
    ];

    function renderHistory() { historyList.innerHTML = ""; if (historyData.length === 0) { historyList.innerHTML = `<p class="text-center text-gray-500 font-light mt-10">B?n chua c� l?ch s? tra c?u n�o.</p>`; return; } historyData.forEach(item => { const el = document.createElement("div"); el.className = "flex items-center p-4 bg-white/80 backdrop-blur-md border border-white/60 rounded-2xl shadow-[0_4px_16px_rgba(0,0,0,0.03)] transition-all hover:-translate-y-1 hover:shadow-lg hover:border-green-300 group mb-4"; el.innerHTML = `<img src="${item.img}" alt="${item.name}" class="w-20 h-20 object-cover rounded-xl mr-5 shadow-sm"> <div class="flex-1"> <h4 class="font-serif text-xl font-bold text-[#1b3b22] mb-1">${item.name}</h4> <span class="inline-block bg-yellow-100 text-yellow-800 text-xs font-bold px-2 py-0.5 rounded-full mb-1 border border-yellow-200">AI: ${item.accuracy}%</span> <div class="flex items-center gap-1 text-sm text-gray-500 font-light mt-1"><i data-feather="clock" class="w-3.5 h-3.5"></i> ${item.time}</div> </div> <button class="btn-delete p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" data-id="${item.id}"> <i data-feather="trash-2" class="w-5 h-5"></i> </button>`; historyList.appendChild(el); }); document.querySelectorAll(".btn-delete").forEach(btn => { btn.addEventListener("click", (e) => { const id = parseInt(e.currentTarget.closest(".btn-delete").getAttribute("data-id")); historyData = historyData.filter(h => h.id !== id); renderHistory(); }); }); if (typeof feather !== "undefined") { feather.replace(); } } renderHistory();
});


