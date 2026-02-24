// --- CARICAMENTO CARTELLE E FASCICOLI ---
async function loadLabels() {
    const list = document.getElementById('label_list');
    list.innerHTML = '<li>⏳ Caricamento...</li>';

    try {
        const response = await gapi.client.gmail.users.labels.list({ 'userId': 'me' });
        const labels = response.result.labels;
        const userLabels = labels.filter(l => l.type === 'user').sort((a,b) => a.name.localeCompare(b.name));
        
        list.innerHTML = '';
        if (userLabels.length === 0) { list.innerHTML = '<li>Nessuna cartella personalizzata.</li>'; }

        userLabels.forEach(label => {
            const li = document.createElement('li');
            li.className = 'label-item';
            li.id = `sidebar-label-${label.id}`;
            if (selectedFolders.some(f => f.id === label.id)) { li.classList.add('selected-folder'); }
            
            li.innerHTML = `
                <span class="label-name" title="${label.name}">📁 ${label.name}</span>
                <div style="display: flex; gap: 5px; align-items: center;">
                    <button class="btn-empty-folder" onclick="event.stopPropagation(); emptyLabel('${label.id}', '${label.name.replace(/'/g, "\\'")}')" title="Svuota cartella">Svuota</button>
                    <button class="btn-delete-folder" onclick="event.stopPropagation(); deleteLabel('${label.id}', '${label.name.replace(/'/g, "\\'")}')" title="Elimina questo gruppo">🗑️</button>
                </div>
            `;
            li.addEventListener('click', () => toggleFolderSelection(label.id, label.name, li));
            list.appendChild(li);
        });
    } catch (err) {
        list.innerHTML = '<li>Errore caricamento.</li>';
    }
}

function toggleFolderSelection(id, name, liElement) {
    const index = selectedFolders.findIndex(f => f.id === id);
    if (index > -1) {
        selectedFolders.splice(index, 1);
        liElement.classList.remove('selected-folder');
    } else {
        selectedFolders.push({ id, name });
        liElement.classList.add('selected-folder');
    }
    renderDrawer();
}

function clearDrawer() {
    selectedFolders = [];
    document.querySelectorAll('.label-item').forEach(li => li.classList.remove('selected-folder'));
    renderDrawer();
}
window.clearDrawer = clearDrawer;

async function renderDrawer() {
    const container = document.getElementById('drawer-container');
    const stack = document.getElementById('drawer-stack');
    
    if (selectedFolders.length === 0) {
        container.classList.add('hidden');
        return;
    }

    container.classList.remove('hidden');
    stack.innerHTML = '<div style="text-align:center; padding-top:20px; font-size:12px;">🕵️ Recupero fascicoli...</div>';

    try {
        const folderPromises = selectedFolders.map(async (folder, index) => {
            const response = await gapi.client.gmail.users.messages.list({
                'userId': 'me', 'labelIds': [folder.id], 'maxResults': 10 
            });

            let emailsHtml = '';
            if (!response.result.messages) {
                emailsHtml = '<div class="fascicolo-mail">Nessun documento trovato.</div>';
            } else {
                const msgPromises = response.result.messages.map(async (m) => {
                    const msgData = await gapi.client.gmail.users.messages.get({
                        'userId': 'me', 'id': m.id, 'format': 'metadata', 'metadataHeaders': ['Subject', 'From']
                    });
                    const headers = msgData.result.payload.headers;
                    const subject = headers.find(h => h.name === 'Subject')?.value || "(Senza Titolo)";
                    const from = headers.find(h => h.name === 'From')?.value.split('<')[0] || "Sconosciuto";
                    return `<div class="fascicolo-mail" onclick="event.stopPropagation(); openEmail('${m.id}')"><strong>${from}:</strong> ${subject}</div>`;
                });
                const emailItems = await Promise.all(msgPromises);
                emailsHtml = emailItems.join('');
            }
            const scale = 1 - ((selectedFolders.length - 1 - index) * 0.03); 
            return `
                <div class="fascicolo" style="top: ${index * 45}px; z-index: ${index + 1}; transform: scale(${scale});" 
                     ondblclick="listFolderEmails('${folder.id}', '${folder.name.replace(/'/g, "\\'")}')">
                    <div class="fascicolo-header">🗂️ ${folder.name}</div>
                    ${emailsHtml}
                </div>
            `;
        });
        stack.innerHTML = (await Promise.all(folderPromises)).join('');
        stack.style.minHeight = `${(selectedFolders.length * 45) + 180}px`;
    } catch (err) {
        stack.innerHTML = '<div style="color:red; font-size:12px;">Errore apertura fascicoli.</div>';
    }
}

async function emptyLabel(labelId, labelName) {
    if (!confirm(`⚠️ SEI SICURO?\nEliminerai DEFINITIVAMENTE le email in "${labelName}".`)) return;
    try {
        let pageToken = null; let totalDeleted = 0;
        do {
            const listResp = await gapi.client.gmail.users.messages.list({
                'userId': 'me', 'labelIds': [labelId], 'maxResults': 500, 'pageToken': pageToken
            });
            pageToken = listResp.result.nextPageToken;
            if (listResp.result.messages) {
                const batchIds = listResp.result.messages.map(m => m.id);
                await gapi.client.gmail.users.messages.batchDelete({'userId': 'me', 'resource': { 'ids': batchIds }});
                totalDeleted += batchIds.length;
            }
        } while (pageToken);
        alert(`✅ Svuotata. Eliminati: ${totalDeleted} messaggi.`);
        listEmails();
        if (selectedFolders.some(f => f.id === labelId)) renderDrawer();
    } catch (err) { alert("Errore: " + err.message); } finally { loadLabels(); }
}

async function deleteLabel(labelId, labelName) {
    if (!confirm(`⚠️ SEI SICURO?\nEliminerai la cartella "${labelName}". (Le email torneranno in posta principale)`)) return;
    try {
        await gapi.client.gmail.users.labels.delete({ 'userId': 'me', 'id': labelId });
        selectedFolders = selectedFolders.filter(f => f.id !== labelId);
        alert(`✅ Gruppo eliminato.`);
        loadLabels(); renderDrawer();
    } catch (err) { alert("Errore: " + err.message); }
}
window.deleteLabel = deleteLabel;
