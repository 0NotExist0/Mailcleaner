/**
 * UI.JS - Gestione della visualizzazione e del DOM
 */

// --- GESTIONE SIDEBAR E OVERLAY ---
export function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) {
        closeSidebar();
    } else {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

export function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');
    document.body.style.overflow = '';
}

// --- GESTIONE MENU CONTESTUALE ---
export function showContextMenu(event, messageId, senderHeader) {
    const menu = document.getElementById('custom-menu');
    const isMobile = window.matchMedia('(max-width: 700px)').matches;

    menu.style.display = 'block';

    if (isMobile) {
        menu.classList.add('is-bottom-sheet');
        document.getElementById('menu-overlay').classList.add('active');
    } else {
        menu.classList.remove('is-bottom-sheet');
        menu.style.left = `${event.pageX}px`;
        menu.style.top = `${event.pageY}px`;
        document.getElementById('menu-overlay').classList.remove('active');
    }
}

export function closeContextMenu() {
    const menu = document.getElementById('custom-menu');
    menu.style.display = 'none';
    menu.classList.remove('is-bottom-sheet');
    document.getElementById('menu-overlay').classList.remove('active');
}

// --- GESTIONE VISTE (Switching) ---
export function showEmailView() {
    document.getElementById('email_list').classList.add('hidden');
    document.getElementById('main-toolbar').classList.add('hidden');
    document.getElementById('single-email-view').classList.remove('hidden');
}

export function closeEmail() {
    const listContainer = document.getElementById('email_list');
    document.getElementById('single-email-view').classList.add('hidden');
    document.getElementById('main-toolbar').classList.remove('hidden');
    listContainer.classList.remove('hidden');
    listContainer.classList.add('animate-fade-in');
    setTimeout(() => listContainer.classList.remove('animate-fade-in'), 300);
}

// --- RENDERING COMPONENTI ---
export async function updateDrawerUI(selectedFolders, openEmailCallback, listFolderCallback) {
    const container = document.getElementById('drawer-container');
    const stack = document.getElementById('drawer-stack');
    
    if (selectedFolders.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    // ... (Logica di rendering fascicoli 3D spostata qui)
}

export function setLoading(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) el.innerHTML = `<p class="loading-msg">⏳ ${message}...</p>`;
}
