// --- MENU CONTESTUALE E SIDEBAR TOGGLES ---

function showContextMenu(event, messageId, senderHeader) {
    currentMenuMessageId = messageId;
    currentMenuSender = senderHeader;
    const menu = document.getElementById('custom-menu');
    const isMobile = window.matchMedia('(max-width: 700px)').matches;
  
    menu.style.display = 'block';
  
    if (isMobile) {
        menu.classList.add('is-bottom-sheet');
        menu.style.left = '';
        menu.style.top = '';
        document.getElementById('menu-overlay').classList.add('active');
    } else {
        menu.classList.remove('is-bottom-sheet');
        menu.style.left = `${event.pageX}px`;
        menu.style.top = `${event.pageY}px`;
        document.getElementById('menu-overlay').classList.remove('active');
    }
}
  
function closeContextMenu() {
    const menu = document.getElementById('custom-menu');
    menu.style.display = 'none';
    menu.classList.remove('is-bottom-sheet');
    document.getElementById('menu-overlay').classList.remove('active');
}
  
document.addEventListener('click', (e) => {
    const menu = document.getElementById('custom-menu');
    if (!menu.classList.contains('is-bottom-sheet')) {
        closeContextMenu();
    }
});
  
document.getElementById('menu-cancel').addEventListener('click', closeContextMenu);
  
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar.classList.contains('open')) {
        closeSidebar();
    } else {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}
window.toggleSidebar = toggleSidebar;
  
function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
    document.body.style.overflow = '';
}
window.closeSidebar = closeSidebar;
