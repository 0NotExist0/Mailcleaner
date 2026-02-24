// --- LISTE EMAIL, RICERCA DINAMICA E LETTURA ---

window.handleDynamicSearch = function() {
    clearTimeout(searchTimeout);
    const query = document.getElementById('search-input').value.trim();
    if (query === '') return listEmails();
    searchTimeout = setTimeout(executeSearch, 600); 
}

window.handleSearch = function(event) {
    if (event.key === 'Enter') { clearTimeout(searchTimeout); executeSearch(); }
}

window.executeSearch = async function() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;
    document.getElementById('view-title').innerHTML = `🔍 Risultati per: "${query}"`;
    const container = resetView();
    container.innerHTML = `<p>⏳ Ricerca in corso...</p>`;
    try {
        const response = await gapi.client.gmail.users.messages.list({ 'userId': 'me', 'q': query, 'maxResults': 100 });
        await renderMessagesList(response.result.messages, container);
    } catch (err) { container.innerText = "Errore ricerca: " + err.message; }
};

window.listFolderEmails = async function(labelId, folderName) {
    document.getElementById('view-title').innerHTML = `🗂️ Fascicolo: ${folderName}`;
    const container = resetView();
    container.innerHTML = `<p>⏳ Caricamento <b>${folderName}</b>...</p>`;
    try {
        const response = await gapi.client.gmail.users.messages.list({ 'userId': 'me', 'labelIds': [labelId], 'maxResults': 50 });
        await renderMessagesList(response.result.messages, container);
    } catch (err) { container.innerText = "Errore cartella: " + err.message; }
};

async function listEmails() {
    document.getElementById('view-title').innerHTML = `📥 Inbox`;
    const container = resetView();
    container.innerHTML = '<p>⏳ Caricamento Inbox...</p>';
    try {
        const response = await gapi.client.gmail.users.messages.list({ 'userId': 'me', 'labelIds': ['INBOX'], 'maxResults': 50 });
        await renderMessagesList(response.result.messages, container);
    } catch (err) { container.innerText = "Errore API: " + err.message; }
}

function resetView() {
    const container = document.getElementById('email_list');
    document.getElementById('single-email-view').classList.add('hidden');
    document.getElementById('main-toolbar').classList.remove('hidden');
    container.classList.remove('hidden');
    return container;
}

async function renderMessagesList(messages, container) {
    container.innerHTML = '';
    if (!messages || messages.length === 0) { container.innerHTML = '<p>Nessuna email trovata.</p>'; return; }
    const isMobile = () => window.matchMedia('(max-width: 700px)').matches;

    for (const message of messages) {
        const msgData = await gapi.client.gmail.users.messages.get({
            'userId': 'me', 'id': message.id, 'format': 'metadata', 'metadataHeaders': ['Subject', 'From']
        });
        const headers = msgData.result.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || "(Nessun oggetto)";
        const from = headers.find(h => h.name === 'From')?.value || "Sconosciuto";

        const div = document.createElement('div');
        div.className = 'email-item'; div.id = `msg-${message.id}`;
        div.innerHTML = `
            <div class="email-text" style="pointer-events: none;"><strong>${from}</strong><small>${subject}</small></div>
            <button class="btn-delete" onclick="trashEmail('${message.id}'); event.stopPropagation();">🗑️</button>
        `;

        div.addEventListener('click', () => {
            if (isMobile()) { closeSidebar(); openEmail(message.id); } else { div.classList.toggle('selected'); }
        });
        div.addEventListener('dblclick', () => { if (!isMobile()) openEmail(message.id); });
        
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault(); if (!div.classList.contains('selected')) div.classList.add('selected');
            showContextMenu(e, message.id, from);
        });

        let longPressTimer = null;
        div.addEventListener('touchstart', (e) => {
            longPressTimer = setTimeout(() => {
                if (!div.classList.contains('selected')) div.classList.add('selected');
                showContextMenu(e.touches[0], message.id, from);
            }, 500);
        }, { passive: true });
        div.addEventListener('touchend', () => clearTimeout(longPressTimer));
        div.addEventListener('touchmove', () => clearTimeout(longPressTimer));

        container.appendChild(div);
    }
}

async function trashEmail(messageId) {
    try {
        await gapi.client.gmail.users.messages.trash({ 'userId': 'me', 'id': messageId });
        const el = document.getElementById(`msg-${messageId}`); if(el) el.remove();
    } catch (err) { console.error("Errore cancellazione singola", err); }
}

window.openEmail = async function(messageId) {
    const listContainer = document.getElementById('email_list');
    const viewContainer = document.getElementById('single-email-view');
    const contentContainer = document.getElementById('single-email-content');
    const toolbar = document.getElementById('main-toolbar');

    listContainer.classList.add('hidden'); toolbar.classList.add('hidden'); viewContainer.classList.remove('hidden');
    contentContainer.innerHTML = '<p style="text-align:center;">⏳ Caricamento contenuto...</p>';

    try {
        const response = await gapi.client.gmail.users.messages.get({ 'userId': 'me', 'id': messageId, 'format': 'full' });
        const payload = response.result.payload; const headers = payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || "(Nessun oggetto)";
        const from = headers.find(h => h.name === 'From')?.value || "Sconosciuto";
        const date = headers.find(h => h.name === 'Date')?.value || "";

        let bodyData = getEmailBody(payload); let htmlBody = "Nessun contenuto di testo leggibile trovato.";
        if (bodyData) { htmlBody = decodeURIComponent(escape(window.atob(bodyData.replace(/-/g, '+').replace(/_/g, '/')))); }

        contentContainer.innerHTML = `
            <h2 style="margin-top: 0; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">${subject}</h2>
            <div style="background: #f8f9fa; padding: 10px; margin-bottom: 20px; font-size: 13px;">
                <strong>Da:</strong> ${escHtml(from)}<br><strong>Data:</strong> ${date}
            </div>
            <div class="email-body-content" style="line-height: 1.5; color: #333;">${htmlBody}</div>
        `;
    } catch (err) { contentContainer.innerHTML = `<p style="color: red;">Errore: ${err.message}</p>`; }
};

function getEmailBody(payload) {
    if (payload.parts) {
        let htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
        if (htmlPart && htmlPart.body.data) return htmlPart.body.data;
        let textPart = payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart && textPart.body.data) return textPart.body.data.replace(/\r\n|\n/g, '<br>');
        for (let part of payload.parts) { if (part.parts) { let d = getEmailBody(part); if (d) return d; } }
    } else if (payload.body && payload.body.data) { return payload.body.data; }
    return '';
}

window.closeEmail = function() {
    document.getElementById('single-email-view').classList.add('hidden');
    document.getElementById('main-toolbar').classList.remove('hidden');
    const l = document.getElementById('email_list'); l.classList.remove('hidden'); l.classList.add('animate-fade-in');
    setTimeout(() => l.classList.remove('animate-fade-in'), 300);
};
