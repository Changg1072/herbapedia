
const feather = {replace: () => {}};
const document = {
    getElementById: () => ({ addEventListener: () => {}, classList: {add:()=>{}, remove:()=>{}}, style: {}, children: [{addEventListener:()=>{}}] }),
    querySelectorAll: () => ([]),
    body: {style: {}}
};
feather.replace();

        // Logic Modal T?o Bài Vi?t
        const btnOpen = document.getElementById('btnOpenPostModal');
        const btnClose = document.getElementById('btnClosePostModal');
        const backdrop = document.getElementById('createPostBackdrop');
        const modal = document.getElementById('createPostModal');
        const modalContent = document.getElementById('createPostContent');

        function openModal() { modal.classList.remove('opacity-0', 'pointer-events-none'); modalContent.classList.remove('scale-95'); }
        function closeModal() { modal.classList.add('opacity-0', 'pointer-events-none'); modalContent.classList.add('scale-95'); }

        btnOpen.addEventListener('click', openModal);
        btnClose.addEventListener('click', closeModal);
        backdrop.addEventListener('click', closeModal);

        // Logic Modal Bình Lu?n
        const btnOpenComments = document.querySelectorAll('.open-comment-btn');
        const btnCloseComment = document.getElementById('btnCloseCommentModal');
        const commentBackdrop = document.getElementById('commentModalBackdrop');
        const commentModal = document.getElementById('commentModal');
        const commentContent = document.getElementById('commentModalContent');

                        function openCommentModal(e) { 
            const btn = e.currentTarget;
            if(btn) {
                // Ð?i tiêu d? Header Modal
                const author = btn.getAttribute('data-author') || 'Tác gi?';
                document.getElementById('modalHeaderTitle').innerText = 'Bài vi?t c?a ' + author;

                // Clone toàn b? Card bài vi?t hi?n t?i
                const postCard = btn.closest('.bg-white.rounded-2xl.shadow-sm');
                if(postCard) {
                    const clonedCard = postCard.cloneNode(true);
                    
                    // Xóa footer (nút Like, Comment) trong b?n clone
                    const footer = clonedCard.querySelector('.border-t.border-gray-100');
                    if(footer) footer.remove();

                    // B? style shadow và border cho b?n clone vì nó n?m trong modal r?i
                    clonedCard.classList.remove('shadow-sm', 'border', 'border-gray-100');
                    clonedCard.style.padding = '0';

                    // G?n vào c?t trái Modal
                    const container = document.getElementById('modalPostContainer');
                    container.innerHTML = '';
                    container.appendChild(clonedCard);
                }
            }
            
            commentModal.classList.remove('opacity-0', 'pointer-events-none'); 
            commentContent.classList.remove('scale-95'); 
            document.body.style.overflow = 'hidden'; 
        }

        function closeCommentModal() { commentModal.classList.add('opacity-0', 'pointer-events-none'); commentContent.classList.add('scale-95'); document.body.style.overflow = ''; }

        if(btnOpenComments.length > 0) btnOpenComments.forEach(btn => btn.addEventListener('click', openCommentModal));
        if(btnCloseComment) btnCloseComment.addEventListener('click', closeCommentModal);
        if(commentBackdrop) commentBackdrop.addEventListener('click', closeCommentModal);
            // Logic Tab Chuy?n Ð?i Feed
        const btnTabCommunity = document.getElementById('btnTabCommunity');
        const btnTabRecipe = document.getElementById('btnTabRecipe');
        const feedCommunity = document.getElementById('feedCommunity');
        const feedRecipe = document.getElementById('feedRecipe');

        if(btnTabCommunity && btnTabRecipe) {
            btnTabCommunity.addEventListener('click', () => {
                // Ð?i style Tab
                btnTabCommunity.className = "pb-2 text-[#0A2F1D] font-bold border-b-[3px] border-[#8CC63F] transition-colors";
                btnTabRecipe.className = "pb-2 text-gray-400 font-semibold hover:text-gray-600 border-b-[3px] border-transparent transition-colors";
                
                // Ð?i n?i dung
                feedCommunity.classList.remove('hidden');
                feedCommunity.classList.add('flex');
                feedRecipe.classList.add('hidden');
                feedRecipe.classList.remove('flex');
            });

            btnTabRecipe.addEventListener('click', () => {
                // Ð?i style Tab
                btnTabRecipe.className = "pb-2 text-[#0A2F1D] font-bold border-b-[3px] border-[#8CC63F] transition-colors";
                btnTabCommunity.className = "pb-2 text-gray-400 font-semibold hover:text-gray-600 border-b-[3px] border-transparent transition-colors";
                
                // Ð?i n?i dung
                feedRecipe.classList.remove('hidden');
                feedRecipe.classList.add('flex');
                feedCommunity.classList.add('hidden');
                feedCommunity.classList.remove('flex');
            });
        }
    
