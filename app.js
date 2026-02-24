// --- CONFIGURAZIONE ---
const CLIENT_ID = '819190259473-aka5j4abtiu6t5e9sdrm32ukke4pt69f.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';
const SCOPES = 'https://mail.google.com/';

let tokenClient;
let gapiInited = false;
let gisInited = false;

// Variabili per Menu Contestuale e Ricerca
let currentMenuMessageId = null;
let currentMenuSender = null;
let selectedFolders = []; 
let searchTimeout = null; // Timer per la ricerca dinamica

// --- INIZIALIZZAZIONE ---
function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
  await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });
  gapiInited = true;
  maybeEnableButtons();
}

function gisLoaded() {
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: '', 
  });
  gisInited = true;
  maybeEnableButtons();
}

function maybeEnableButtons() {
  if (gapiInited && gisInited) {
    // Se l'utente ha già fatto accesso in precedenza, proviamo il login silenzioso
    if (localStorage.getItem('mailcleaner_autologin') === 'true') {
      tryAutoLogin();
    } else {
      // Attiva il pulsante visivamente
      const btn = document.getElementById('authorize_button');
      btn.disabled = false;
      btn.classList.remove('disabled');
      document.getElementById('auth_button_text').innerText = 'Accedi con Google';
      btn.style.display = 'flex';
    }
  }
}

// Tenta il login automatico silenzioso (senza popup) usando la sessione Google esistente
function tryAutoLogin() {
  const loadingMsg = document.createElement('p');
  loadingMsg.id = 'autologin-msg';
  loadingMsg.style.cssText = 'text-align:center; color:#6c757d; font-size:14px; margin-top:30px;';
  loadingMsg.textContent = '🔄 Rientro automatico in corso...';
  document.body.appendChild(loadingMsg);

  // Nascondi temporaneamente il bottone se stiamo provando il login automatico
  document.getElementById('authorize_button').style.display = 'none';

  // Fallback: su mobile il callback silenzioso può non arrivare mai.
  // Dopo 6 secondi, se non è successo nulla, mostriamo il pulsante.
  let callbackFired = false;
  const fallbackTimer = setTimeout(() => {
    if (!callbackFired) {
      console.warn('Auto-login: nessuna risposta entro 6s, mostro il pulsante.');
      const msg = document.getElementById('autologin-msg');
      if (msg) msg.remove();
      localStorage.removeItem('mailcleaner_autologin');
      
      const btn = document.getElementById('authorize_button');
      btn.style.display = 'flex';
      btn.disabled = false;
      btn.classList.remove('disabled');
      document.getElementById('auth_button_text').innerText = 'Accedi con Google';
    }
  }, 6000);

  tokenClient.callback = async (resp) => {
    callbackFired = true;
    clearTimeout(fallbackTimer);

    const msg = document.getElementById('autologin-msg');
    if (msg) msg.remove();

    if (resp.error !== undefined) {
      // Sessione scaduta o revocata: mostra il pulsante normale
      console.warn('Auto-login fallito:', resp.error);
      localStorage.removeItem('mailcleaner_autologin');
      
      const btn = document.getElementById('authorize_button');
      btn.style.display = 'flex';
      btn.disabled = false;
      btn.classList.remove('disabled');
      document.getElementById('auth_button_text').innerText = 'Accedi con Google';
      return;
    }
    onLoginSuccess();
  };

  // prompt: '' = nessun popup se la sessione Google è ancora attiva
  tokenClient.requestAccessToken({ prompt: '' });
}

// --- LOGIN / LOGOUT ---

// Logica comune eseguita dopo ogni login riuscito (manuale o automatico)
function onLoginSuccess() {
  localStorage.setItem('mailcleaner_autologin', 'true');

  document.getElementById('authorize_button').style.display = 'none';
  document.getElementById('signout_button').classList.remove('hidden');
  document.getElementById('app-container').classList.remove('hidden');
  document.getElementById('search-container').classList.remove('hidden');

  loadLabels();
  listEmails();
  startScanPanel();
}

function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) throw (resp);
    onLoginSuccess();
  };

  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    tokenClient.requestAccessToken({prompt: ''});
  }
}

function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');

    // Rimuovi il flag: al prossimo avvio non farà auto-login
    localStorage.removeItem('mailcleaner_autologin');
    
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('signout_button').classList.add('hidden');
    document.getElementById('search-container').classList.add('hidden'); 
    document.getElementById('search-input').value = '';
    
    document.getElementById('email_list').innerHTML = '';
    document.getElementById('label_list').innerHTML = '';
    
    document.getElementById('single-email-view').classList.add('hidden');
    document.getElementById('main-toolbar').classList.remove('hidden');
    
    clearDrawer();

    // Mostra e riattiva il pulsante per un nuovo login
    const btn = document.getElementById('authorize_button');
    btn.style.display = 'flex';
    btn.disabled = false;
    btn.classList.remove('disabled');
    document.getElementById('auth_button_text').innerText = 'Accedi con Google';
  }
}

// --- 1. GESTIONE SIDEBAR (CARTELLE) E SELEZIONE MULTIPLA ---
async function loadLabels() {
    const list = document.getElementById('label_list');
    list.innerHTML = '<li>⏳ Caricamento...</li>';

    try {
        const response = await gapi.client.gmail.users.labels.list({ 'userId': 'me' });
        const labels = response.result.labels;
        const userLabels = labels.filter(l => l.type === 'user').sort((a,b) => a.name.localeCompare(b.name));
        
        list.innerHTML = '';
        
        if (userLabels.length === 0) {
            list.innerHTML = '<li>Nessuna cartella personalizzata.</li>';
        }

        userLabels.forEach(label => {
            const li = document.createElement('li');
            li.className = 'label-item';
            li.id = `sidebar-label-${label.id}`;
            
            if (selectedFolders.some(f => f.id === label.id)) {
                li.classList.add('selected-folder');
            }
            
            // AGGIUNTO IL PULSANTE DI ELIMINAZIONE GRUPPO
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
        console.error(err);
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

// --- 2. IL CASSETTO DEI FASCICOLI (EFFETTO 3D) ---
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
                'userId': 'me',
                'labelIds': [folder.id],
                'maxResults': 10 
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
                    return `<div class="fascicolo-mail" onclick="event.stopPropagation(); openEmail('${m.id}')" title="Clicca per leggere"><strong>${from}:</strong> ${subject}</div>`;
                });
                const emailItems = await Promise.all(msgPromises);
                emailsHtml = emailItems.join('');
            }

            const topOffset = index * 45; 
            const zIndex = index + 1;
            const scale = 1 - ((selectedFolders.length - 1 - index) * 0.03); 
            const safeFolderName = folder.name.replace(/'/g, "\\'");

            return `
                <div class="fascicolo" style="top: ${topOffset}px; z-index: ${zIndex}; transform: scale(${scale});" 
                     ondblclick="listFolderEmails('${folder.id}', '${safeFolderName}')" title="Doppio clic per aprire il fascicolo">
                    <div class="fascicolo-header">🗂️ ${folder.name}</div>
                    ${emailsHtml}
                </div>
            `;
        });

        const htmlArray = await Promise.all(folderPromises);
        stack.innerHTML = htmlArray.join('');
        stack.style.minHeight = `${(selectedFolders.length * 45) + 180}px`;

    } catch (err) {
        console.error(err);
        stack.innerHTML = '<div style="color:red; font-size:12px; padding:10px;">Errore apertura fascicoli.</div>';
    }
}

// --- 3. LOGICA "SVUOTA CARTELLA" E "ELIMINA CARTELLA" ---
async function emptyLabel(labelId, labelName) {
    if (!confirm(`⚠️ SEI SICURO?\nStai per eliminare DEFINITIVAMENTE tutte le email nella cartella "${labelName}".`)) {
        return;
    }

    try {
        let pageToken = null;
        let totalDeleted = 0;
        const btn = document.activeElement;
        const originalText = btn.innerText;
        btn.innerText = "⏳...";
        btn.disabled = true;

        do {
            const listResp = await gapi.client.gmail.users.messages.list({
                'userId': 'me',
                'labelIds': [labelId],
                'maxResults': 500,
                'pageToken': pageToken
            });

            const messages = listResp.result.messages;
            pageToken = listResp.result.nextPageToken;

            if (messages && messages.length > 0) {
                const batchIds = messages.map(m => m.id);
                await gapi.client.gmail.users.messages.batchDelete({
                    'userId': 'me',
                    'resource': { 'ids': batchIds }
                });
                totalDeleted += batchIds.length;
            }
        } while (pageToken);

        alert(`✅ Cartella "${labelName}" svuotata.\nTotale eliminati: ${totalDeleted} messaggi.`);
        listEmails();
        if (selectedFolders.some(f => f.id === labelId)) renderDrawer();
        
    } catch (err) {
        alert("Errore durante l'eliminazione: " + err.message);
    } finally {
        loadLabels(); 
    }
}

async function deleteLabel(labelId, labelName) {
    if (!confirm(`⚠️ SEI SICURO?\nStai per eliminare la cartella "${labelName}".\n\nNota bene: Le email al suo interno NON verranno cancellate, ma torneranno visibili nella posta principale. Se vuoi cancellare anche le email, clicca su "Annulla" e usa prima il tasto "Svuota".`)) {
        return;
    }

    try {
        await gapi.client.gmail.users.labels.delete({
            'userId': 'me',
            'id': labelId
        });
        
        // Rimuovi la cartella dai fascicoli selezionati se era aperta
        selectedFolders = selectedFolders.filter(f => f.id !== labelId);
        
        alert(`✅ Gruppo "${labelName}" eliminato con successo.`);
        
        loadLabels(); // Ricarica la lista nella sidebar
        renderDrawer(); // Aggiorna il cassetto in basso
        
    } catch (err) {
        alert("Errore durante l'eliminazione del gruppo: " + err.message);
    }
}
window.deleteLabel = deleteLabel;

// --- 4. LISTE EMAIL, RICERCA DINAMICA E RENDER ---

// Cerca dinamicamente mentre l'utente digita
window.handleDynamicSearch = function() {
    clearTimeout(searchTimeout); // Resetta il timer ad ogni lettera digitata
    
    const query = document.getElementById('search-input').value.trim();
    
    // Se l'utente cancella tutto, torna subito alla Inbox
    if (query === '') {
        listEmails();
        return;
    }

    // Aspetta mezzo secondo prima di cercare, per non fare mille chiamate API
    searchTimeout = setTimeout(() => {
        executeSearch();
    }, 600); 
}

// Cerca se l'utente preme invio
window.handleSearch = function(event) {
    if (event.key === 'Enter') {
        clearTimeout(searchTimeout);
        executeSearch();
    }
}

window.executeSearch = async function() {
    const query = document.getElementById('search-input').value.trim();
    if (!query) return;

    document.getElementById('view-title').innerHTML = `🔍 Risultati per: "${query}"`;
    const container = document.getElementById('email_list');
    
    document.getElementById('single-email-view').classList.add('hidden');
    document.getElementById('main-toolbar').classList.remove('hidden');
    container.classList.remove('hidden');

    container.innerHTML = `<p>⏳ Ricerca in corso...</p>`;

    try {
        const response = await gapi.client.gmail.users.messages.list({
            'userId': 'me',
            'q': query, // Cerca la parola in tutto il contenuto della mail
            'maxResults': 100 // Aumentato per trovare più risultati contemporaneamente
        });
        await renderMessagesList(response.result.messages, container);
    } catch (err) {
        container.innerText = "Errore durante la ricerca: " + err.message;
    }
};

window.listFolderEmails = async function(labelId, folderName) {
    document.getElementById('view-title').innerHTML = `🗂️ Fascicolo: ${folderName}`;
    const container = document.getElementById('email_list');
    
    document.getElementById('single-email-view').classList.add('hidden');
    document.getElementById('main-toolbar').classList.remove('hidden');
    container.classList.remove('hidden');

    container.innerHTML = `<p>⏳ Caricamento fascicolo <b>${folderName}</b>...</p>`;

    try {
        const response = await gapi.client.gmail.users.messages.list({
            'userId': 'me',
            'labelIds': [labelId],
            'maxResults': 50 
        });
        await renderMessagesList(response.result.messages, container);
    } catch (err) {
        container.innerText = "Errore caricamento cartella: " + err.message;
    }
};

async function listEmails() {
  document.getElementById('view-title').innerHTML = `📥 Inbox`;
  const container = document.getElementById('email_list');
  
  document.getElementById('single-email-view').classList.add('hidden');
  document.getElementById('main-toolbar').classList.remove('hidden');
  container.classList.remove('hidden');
  
  container.innerHTML = '<p>⏳ Caricamento Inbox...</p>';

  try {
    const response = await gapi.client.gmail.users.messages.list({
      'userId': 'me',
      'labelIds': ['INBOX'], 
      'maxResults': 50 
    });
    await renderMessagesList(response.result.messages, container);
  } catch (err) {
    container.innerText = "Errore API: " + err.message;
  }
}

async function renderMessagesList(messages, container) {
    container.innerHTML = '';

    if (!messages || messages.length === 0) {
      container.innerHTML = '<p>Nessuna email trovata per questa ricerca.</p>';
      return;
    }

    const isMobile = () => window.matchMedia('(max-width: 700px)').matches;

    for (const message of messages) {
      const msgData = await gapi.client.gmail.users.messages.get({
        'userId': 'me',
        'id': message.id,
        'format': 'metadata',
        'metadataHeaders': ['Subject', 'From']
      });

      const headers = msgData.result.payload.headers;
      const subject = headers.find(h => h.name === 'Subject')?.value || "(Nessun oggetto)";
      const from = headers.find(h => h.name === 'From')?.value || "Sconosciuto";

      const div = document.createElement('div');
      div.className = 'email-item';
      div.id = `msg-${message.id}`;
      div.innerHTML = `
        <div class="email-text" style="pointer-events: none;">
            <strong>${from}</strong>
            <small>${subject}</small>
        </div>
        <button class="btn-delete" onclick="trashEmail('${message.id}'); event.stopPropagation();">🗑️</button>
      `;

      // --- CLICK / TAP ---
      let tapTimer = null;
      div.addEventListener('click', (e) => {
        if (isMobile()) {
          // Singolo tap su mobile apre l'email (chiude anche la sidebar se aperta)
          closeSidebar();
          openEmail(message.id);
        } else {
          div.classList.toggle('selected');
        }
      });

      div.addEventListener('dblclick', () => {
        if (!isMobile()) openEmail(message.id);
      });

      // --- MENU CONTESTUALE ---
      // Desktop: click destro
      div.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (!div.classList.contains('selected')) div.classList.add('selected');
          showContextMenu(e, message.id, from);
      });

      // Mobile: long-press (500ms) → apre il menu come bottom-sheet
      let longPressTimer = null;
      div.addEventListener('touchstart', (e) => {
          longPressTimer = setTimeout(() => {
              longPressTimer = null;
              if (!div.classList.contains('selected')) div.classList.add('selected');
              showContextMenu(e.touches[0], message.id, from);
          }, 500);
      }, { passive: true });

      div.addEventListener('touchend', () => {
          if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      }, { passive: true });

      div.addEventListener('touchmove', () => {
          if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      }, { passive: true });

      container.appendChild(div);
    }
}

// --- 5. MENU CONTESTUALE E AZIONI VARIE ---
async function trashEmail(messageId) {
  try {
    await gapi.client.gmail.users.messages.trash({ 'userId': 'me', 'id': messageId });
    const el = document.getElementById(`msg-${messageId}`);
    if(el) el.remove();
  } catch (err) {
    console.error("Errore cancellazione singola", err);
  }
}

function showContextMenu(event, messageId, senderHeader) {
  currentMenuMessageId = messageId;
  currentMenuSender = senderHeader;
  const menu = document.getElementById('custom-menu');
  const isMobile = window.matchMedia('(max-width: 700px)').matches;

  menu.style.display = 'block';

  if (isMobile) {
    // Bottom-sheet su mobile
    menu.classList.add('is-bottom-sheet');
    menu.style.left = '';
    menu.style.top = '';
    document.getElementById('menu-overlay').classList.add('active');
  } else {
    // Tooltip posizionato su desktop
    menu.classList.remove('is-bottom-sheet');
    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
    document.getElementById('menu-overlay').classList.remove('active');
  }
}

// Chiude il menu contestuale (usato dall'overlay e dal pulsante Annulla)
function closeContextMenu() {
  const menu = document.getElementById('custom-menu');
  menu.style.display = 'none';
  menu.classList.remove('is-bottom-sheet');
  document.getElementById('menu-overlay').classList.remove('active');
}

// Click su area libera → chiude il menu (solo desktop)
document.addEventListener('click', (e) => {
    const menu = document.getElementById('custom-menu');
    if (!menu.classList.contains('is-bottom-sheet')) {
        closeContextMenu();
    }
});

// Pulsante Annulla nel menu
document.getElementById('menu-cancel').addEventListener('click', closeContextMenu);

// --- SIDEBAR TOGGLE (mobile) ---
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const isOpen = sidebar.classList.contains('open');
    if (isOpen) {
        closeSidebar();
    } else {
        sidebar.classList.add('open');
        overlay.classList.add('active');
        // Blocca lo scroll del body mentre la sidebar è aperta
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

document.getElementById('menu-open').addEventListener('click', () => {
    if (currentMenuMessageId) {
        openEmail(currentMenuMessageId);
        closeContextMenu();
    }
});

document.getElementById('menu-delete').addEventListener('click', () => {
    if (currentMenuMessageId) { trashEmail(currentMenuMessageId); closeContextMenu(); }
});

document.getElementById('menu-group').addEventListener('click', () => {
    if (currentMenuSender) {
        closeContextMenu();
        showGroupPickerDialog(currentMenuSender);
    }
});

document.getElementById('menu-group-selected').addEventListener('click', () => {
    groupSelectedEmails(); closeContextMenu();
});

// ── Dialogo scelta periodo/batch prima del raggruppamento ───────────────
function showGroupPickerDialog(senderHeader) {
  const emailMatch = senderHeader.match(/<(.+)>/);
  const senderEmail = emailMatch ? emailMatch[1] : senderHeader.trim();
  const fromName = senderHeader.split('<')[0].trim().replace(/^"|"$/g,'') || senderEmail;

  let overlay = document.getElementById('group-picker-overlay');
  if (overlay) overlay.remove();

  overlay = document.createElement('div');
  overlay.id = 'group-picker-overlay';
  overlay.innerHTML = `
    <div id="group-picker-modal">
      <button class="gp-picker-close" onclick="closeGroupPicker()" title="Annulla">✕</button>
      <div class="gp-picker-icon">📁</div>
      <h3 class="gp-picker-title">Raggruppa per mittente</h3>
      <div class="gp-picker-sender" title="${senderEmail}">📧 ${escHtml(fromName)}<br><small>${escHtml(senderEmail)}</small></div>

      <div class="gp-picker-section">
        <div class="gp-picker-label">📅 Quanto indietro cercare?</div>
        <div class="gp-picker-grid" id="gp-period-grid">
          <button class="gp-opt gp-opt-period selected" data-val="">🌐 Tutte (dall'inizio)</button>
          <button class="gp-opt gp-opt-period" data-val="newer_than:1y">📆 Ultimo anno</button>
          <button class="gp-opt gp-opt-period" data-val="newer_than:6m">🗓️ Ultimi 6 mesi</button>
          <button class="gp-opt gp-opt-period" data-val="newer_than:3m">📅 Ultimi 3 mesi</button>
          <button class="gp-opt gp-opt-period" data-val="newer_than:1m">🗓️ Ultimo mese</button>
          <button class="gp-opt gp-opt-period" data-val="newer_than:7d">📅 Ultima settimana</button>
        </div>
      </div>

      <div class="gp-picker-section">
        <div class="gp-picker-label">⚙️ Dimensione batch per spostamento</div>
        <div class="gp-picker-grid" id="gp-batch-grid">
          <button class="gp-opt gp-opt-batch selected" data-val="1000">🚀 1000 (massimo)</button>
          <button class="gp-opt gp-opt-batch" data-val="500">⚡ 500 (veloce)</button>
          <button class="gp-opt gp-opt-batch" data-val="100">🐇 100 (medio)</button>
          <button class="gp-opt gp-opt-batch" data-val="25">🐢 25 (lento/sicuro)</button>
        </div>
      </div>

      <div class="gp-picker-summary" id="gp-picker-summary">
        Cercherà in <strong>tutta la casella</strong>, nessuna email esclusa.
      </div>

      <button class="gp-picker-go" id="gp-picker-go-btn" onclick="launchGroupFromPicker('${senderEmail}')">
        📦 Avvia raggruppamento
      </button>
    </div>
  `;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('gp-picker-visible'));

  // Toggle selezione opzioni periodo
  overlay.querySelectorAll('.gp-opt-period').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.gp-opt-period').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      updatePickerSummary();
    });
  });

  // Toggle selezione opzioni batch
  overlay.querySelectorAll('.gp-opt-batch').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.gp-opt-batch').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // Chiudi cliccando fuori dal modal
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeGroupPicker();
  });
}

function updatePickerSummary() {
  const periodBtn = document.querySelector('.gp-opt-period.selected');
  const val = periodBtn?.dataset.val || '';
  const summaryEl = document.getElementById('gp-picker-summary');
  if (!summaryEl) return;
  const map = {
    '':              'Cercherà <strong>tutte le email</strong> dall'inizio della casella.',
    'newer_than:1y': 'Cercherà solo le email dell'<strong>ultimo anno</strong>.',
    'newer_than:6m': 'Cercherà solo le email degli <strong>ultimi 6 mesi</strong>.',
    'newer_than:3m': 'Cercherà solo le email degli <strong>ultimi 3 mesi</strong>.',
    'newer_than:1m': 'Cercherà solo le email dell'<strong>ultimo mese</strong>.',
    'newer_than:7d': 'Cercherà solo le email dell'<strong>ultima settimana</strong>.',
  };
  summaryEl.innerHTML = map[val] || '';
}

function closeGroupPicker() {
  const overlay = document.getElementById('group-picker-overlay');
  if (!overlay) return;
  overlay.classList.remove('gp-picker-visible');
  setTimeout(() => overlay.remove(), 300);
}
window.closeGroupPicker = closeGroupPicker;

async function launchGroupFromPicker(senderEmail) {
  const periodBtn = document.querySelector('.gp-opt-period.selected');
  const batchBtn  = document.querySelector('.gp-opt-batch.selected');
  const period    = periodBtn?.dataset.val || '';
  const batchSize = parseInt(batchBtn?.dataset.val || '1000', 10);
  closeGroupPicker();
  await groupEmailsBySender(senderEmail, { period, batchSize });
}
window.launchGroupFromPicker = launchGroupFromPicker;

async function groupEmailsBySender(senderEmail, opts = {}) {
  const period    = opts.period    || '';
  const batchSize = opts.batchSize || 1000;

  const cleanName = senderEmail.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_');
  const labelName = `Archivio_${cleanName}`;

  // Costruisci la query Gmail
  let q = `from:${senderEmail} in:anywhere`;
  if (period) q += ` ${period}`;

  showGroupProgress({ sender: senderEmail, label: labelName, phase: 'search', found: 0, moved: 0, total: 0 });

  try {
    const labelId = await getOrCreateLabel(labelName);

    // Raccoglie TUTTI gli ID senza limite di pagine
    let allIds    = [];
    let pageToken = undefined;

    do {
      const params = { userId: 'me', q, maxResults: 500 };
      if (pageToken) params.pageToken = pageToken;

      const resp = await gapi.client.gmail.users.messages.list(params);
      allIds.push(...(resp.result.messages || []).map(m => m.id));
      pageToken = resp.result.nextPageToken;
      updateGroupProgress({ phase: 'search', found: allIds.length });

    } while (pageToken);

    const total = allIds.length;

    if (total === 0) {
      closeGroupProgress();
      alert(`ℹ️ Nessuna email trovata da "${senderEmail}" con i criteri selezionati.`);
      return;
    }

    // Sposta in batch
    let moved = 0;
    for (let i = 0; i < allIds.length; i += batchSize) {
      const chunk = allIds.slice(i, i + batchSize);
      await gapi.client.gmail.users.messages.batchModify({
        userId: 'me',
        resource: {
          ids:            chunk,
          addLabelIds:    [labelId],
          removeLabelIds: ['INBOX', 'SPAM', 'TRASH']
        }
      });
      moved += chunk.length;
      updateGroupProgress({ phase: 'move', moved, total });
    }

    closeGroupProgress();
    alert(`✅ ${moved.toLocaleString('it-IT')} email di "${senderEmail}" spostate in "${labelName}".`);
    loadLabels();
    listEmails();

  } catch (err) {
    closeGroupProgress();
    alert('Errore durante il raggruppamento: ' + (err.message || JSON.stringify(err)));
  }
}

// ── UI avanzamento raggruppamento ────────────────────────────────────────
function showGroupProgress({ sender, label, phase, found, moved, total }) {
  let overlay = document.getElementById('group-progress-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'group-progress-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div id="group-progress-modal">
      <div class="gp-icon">📁</div>
      <h3 class="gp-title">Raggruppamento in corso…</h3>
      <div class="gp-sender" title="${sender}">📧 ${sender}</div>
      <div class="gp-label">→ Cartella: <strong>${label}</strong></div>

      <div class="gp-phase" id="gp-phase">🔍 Ricerca in tutta la casella…</div>

      <div class="gp-bar-track">
        <div class="gp-bar-fill" id="gp-bar-fill" style="width:0%"></div>
      </div>
      <div class="gp-counters" id="gp-counters">Trovate: 0 email</div>

      <small class="gp-note">Non chiudere la pagina durante l'operazione.</small>
    </div>
  `;
  requestAnimationFrame(() => overlay.classList.add('gp-visible'));
}

function updateGroupProgress({ phase, found = 0, moved = 0, total = 0 }) {
  const phaseEl   = document.getElementById('gp-phase');
  const fillEl    = document.getElementById('gp-bar-fill');
  const countersEl= document.getElementById('gp-counters');
  if (!phaseEl) return;

  if (phase === 'search') {
    phaseEl.textContent    = '🔍 Ricerca in tutta la casella…';
    fillEl.style.width     = '0%';
    fillEl.classList.add('gp-bar-indeterminate');
    countersEl.textContent = `Trovate finora: ${found.toLocaleString('it-IT')} email`;
  } else {
    phaseEl.textContent    = '📦 Spostamento nella cartella…';
    fillEl.classList.remove('gp-bar-indeterminate');
    const pct = total > 0 ? Math.round((moved / total) * 100) : 0;
    fillEl.style.width     = pct + '%';
    countersEl.textContent = `Spostate ${moved.toLocaleString('it-IT')} / ${total.toLocaleString('it-IT')} email (${pct}%)`;
  }
}

function closeGroupProgress() {
  const overlay = document.getElementById('group-progress-overlay');
  if (!overlay) return;
  overlay.classList.remove('gp-visible');
  setTimeout(() => overlay.remove(), 350);
}

async function groupSelectedEmails() {
    const selectedElements = document.querySelectorAll('.email-item.selected');
    if (selectedElements.length === 0) {
        alert("Nessuna email selezionata.");
        return;
    }

    const labelName = prompt(`Stai per spostare ${selectedElements.length} email.\nInserisci il nome della cartella di destinazione:`);
    if (!labelName || labelName.trim() === '') return; 

    const messageIds = Array.from(selectedElements).map(el => el.id.replace('msg-', ''));
    const container = document.getElementById('email_list');
    const oldHtml = container.innerHTML;
    container.innerHTML = `<p>⏳ Spostamento di ${messageIds.length} email in <b>${labelName}</b>...</p>`;

    try {
        const labelId = await getOrCreateLabel(labelName);
        await gapi.client.gmail.users.messages.batchModify({
            'userId': 'me',
            'ids': messageIds,
            'addLabelIds': [labelId],
            'removeLabelIds': ['INBOX'] 
        });

        alert(`✅ ${messageIds.length} email spostate con successo in "${labelName}".`);
        loadLabels(); 
        
        selectedElements.forEach(el => el.remove());
        container.innerHTML = oldHtml;

    } catch (err) {
        alert("Errore durante lo spostamento: " + err.message);
        container.innerHTML = oldHtml;
    }
}

async function getOrCreateLabel(name) {
  const labelsResp = await gapi.client.gmail.users.labels.list({ 'userId': 'me' });
  const existingLabel = labelsResp.result.labels.find(l => l.name === name);
  if (existingLabel) return existingLabel.id;

  const createResp = await gapi.client.gmail.users.labels.create({
    'userId': 'me',
    'resource': {
      'name': name,
      'labelListVisibility': 'labelShow',
      'messageListVisibility': 'show'
    }
  });
  return createResp.result.id;
}

// --- 6. APERTURA E LETTURA EMAIL ---
window.openEmail = async function(messageId) {
    const listContainer = document.getElementById('email_list');
    const viewContainer = document.getElementById('single-email-view');
    const contentContainer = document.getElementById('single-email-content');
    const toolbar = document.getElementById('main-toolbar');

    listContainer.classList.add('hidden');
    toolbar.classList.add('hidden');
    viewContainer.classList.remove('hidden');
    
    contentContainer.innerHTML = '<p style="text-align:center;">⏳ Caricamento contenuto email...</p>';

    try {
        const response = await gapi.client.gmail.users.messages.get({
            'userId': 'me',
            'id': messageId,
            'format': 'full'
        });

        const payload = response.result.payload;
        const headers = payload.headers;
        
        const subject = headers.find(h => h.name === 'Subject')?.value || "(Nessun oggetto)";
        const from = headers.find(h => h.name === 'From')?.value || "Sconosciuto";
        const date = headers.find(h => h.name === 'Date')?.value || "";

        let bodyData = getEmailBody(payload);
        let htmlBody = "Nessun contenuto di testo leggibile trovato.";

        if (bodyData) {
            const base64 = bodyData.replace(/-/g, '+').replace(/_/g, '/');
            htmlBody = decodeURIComponent(escape(window.atob(base64)));
        }

        contentContainer.innerHTML = `
            <h2 style="margin-top: 0; color: #2c3e50; border-bottom: 2px solid #f0f0f0; padding-bottom: 10px;">
                ${subject}
            </h2>
            <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; margin-bottom: 20px; font-size: 13px;">
                <strong>Da:</strong> ${from.replace(/</g, '&lt;').replace(/>/g, '&gt;')}<br>
                <strong>Data:</strong> ${date}
            </div>
            <div class="email-body-content" style="line-height: 1.5; color: #333;">
                ${htmlBody}
            </div>
        `;
    } catch (err) {
        contentContainer.innerHTML = `<p style="color: red;">Errore caricamento email: ${err.message}</p>`;
        console.error("Errore openEmail:", err);
    }
};

function getEmailBody(payload) {
    let bodyData = '';
    
    if (payload.parts) {
        let htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
        if (htmlPart && htmlPart.body && htmlPart.body.data) {
            return htmlPart.body.data;
        }
        let textPart = payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart && textPart.body && textPart.body.data) {
            return textPart.body.data.replace(/\r\n|\n/g, '<br>');
        }
        for (let part of payload.parts) {
            if (part.parts) {
                bodyData = getEmailBody(part);
                if (bodyData) return bodyData;
            }
        }
    } else if (payload.body && payload.body.data) {
        return payload.body.data;
    }
    return bodyData;
}

window.closeEmail = function() {
    const listContainer = document.getElementById('email_list');
    const viewContainer = document.getElementById('single-email-view');
    const toolbar = document.getElementById('main-toolbar');

    viewContainer.classList.add('hidden');
    toolbar.classList.remove('hidden');
    
    listContainer.classList.remove('hidden');
    listContainer.classList.add('animate-fade-in');
    
    setTimeout(() => {
        listContainer.classList.remove('animate-fade-in');
    }, 300);
};

// ─────────────────────────────────────────────
// PANNELLO SCANSIONE (colonna destra, fisso)
// ─────────────────────────────────────────────
let scanPanelOpen = true;

function startScanPanel() {
  const panel = document.getElementById('scan-panel');
  panel.classList.remove('hidden');
  document.getElementById('sp-progress-wrap').style.display = 'flex';
  document.getElementById('sp-fill').style.width = '0%';
  document.getElementById('sp-progress-text').textContent = 'Avvio scansione...';
  document.getElementById('sp-stats').textContent = '';
  document.getElementById('sp-list').innerHTML = '<div class="sp-loading">⏳ Scansione in corso...</div>';
  runScanPanel();
}

async function runScanPanel() {
  const fill        = document.getElementById('sp-fill');
  const progressTxt = document.getElementById('sp-progress-text');
  const statsTxt    = document.getElementById('sp-stats');
  const list        = document.getElementById('sp-list');

  try {
    // Conteggio stimato
    const labelInfo = await gapi.client.gmail.users.labels.get({ userId: 'me', id: 'INBOX' });
    const estimatedTotal = labelInfo.result.messagesTotal || 0;
    statsTxt.textContent = `~${estimatedTotal.toLocaleString('it-IT')} email in Inbox`;

    // Raccolta ID messaggi (max 3 pagine × 500 = 1500)
    let allMessageIds = [];
    let pageToken = null;
    let pageNum = 0;
    do {
      const resp = await gapi.client.gmail.users.messages.list({
        userId: 'me', labelIds: ['INBOX'], maxResults: 500,
        pageToken: pageToken || undefined
      });
      allMessageIds.push(...(resp.result.messages || []));
      pageToken = resp.result.nextPageToken;
      pageNum++;
      if (pageNum >= 3) break;
    } while (pageToken);

    const total = allMessageIds.length;
    list.innerHTML = '';

    // Carica metadata in batch da 10
    const BATCH = 10;
    let loaded = 0;

    for (let i = 0; i < total; i += BATCH) {
      const batch = allMessageIds.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(m =>
        gapi.client.gmail.users.messages.get({
          userId: 'me', id: m.id, format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date']
        })
      ));

      results.forEach((res, idx) => {
        const msg    = res.result;
        const msgId  = batch[idx].id;
        const hdrs   = msg.payload?.headers || [];
        const from   = hdrs.find(h => h.name === 'From')?.value    || 'Sconosciuto';
        const subj   = hdrs.find(h => h.name === 'Subject')?.value || '(Nessun oggetto)';
        const date   = hdrs.find(h => h.name === 'Date')?.value    || '';
        const isUnread = (msg.labelIds || []).includes('UNREAD');
        const fromName = from.split('<')[0].trim().replace(/^"|"$/g, '') || from;
        const dateShort = formatScanDate(date);

        const row = document.createElement('div');
        row.className = `sp-row${isUnread ? ' sp-unread' : ''}`;
        row.title = `Da: ${from}\nOggetto: ${subj}\nData: ${date}`;
        row.innerHTML = `
          <div class="sp-row-left">
            <span class="sp-dot${isUnread ? '' : ' sp-dot-read'}"></span>
          </div>
          <div class="sp-row-body">
            <div class="sp-row-top">
              <span class="sp-from">${escHtml(fromName)}</span>
              <span class="sp-date">${dateShort}</span>
            </div>
            <div class="sp-subj">${escHtml(subj)}</div>
          </div>
        `;
        row.addEventListener('click', () => {
          document.querySelectorAll('.sp-row.sp-selected').forEach(r => r.classList.remove('sp-selected'));
          row.classList.add('sp-selected');
          row.classList.remove('sp-unread');
          const dot = row.querySelector('.sp-dot');
          if (dot) dot.classList.add('sp-dot-read');
          openEmail(msgId);
          if (window.matchMedia('(max-width: 900px)').matches) toggleScanPanel(false);
        });
        list.appendChild(row);
      });

      loaded += batch.length;
      const pct = Math.round((loaded / total) * 100);
      fill.style.width = pct + '%';
      progressTxt.textContent = `${loaded.toLocaleString('it-IT')} / ${total.toLocaleString('it-IT')} email`;
    }

    fill.style.width = '100%';
    progressTxt.textContent = `✅ ${total.toLocaleString('it-IT')} email caricate`;
    statsTxt.textContent = `Inbox · ${total.toLocaleString('it-IT')} email`;
    setTimeout(() => { document.getElementById('sp-progress-wrap').style.display = 'none'; }, 2200);

  } catch (err) {
    console.error('Errore scansione:', err);
    list.innerHTML = '<div class="sp-loading" style="color:#dc3545">⚠️ Errore durante la scansione.</div>';
    document.getElementById('sp-progress-wrap').style.display = 'none';
  }
}

function toggleScanPanel(forceState) {
  const panel = document.getElementById('scan-panel');
  const btn   = document.getElementById('sp-toggle-btn');
  scanPanelOpen = (forceState !== undefined) ? forceState : !scanPanelOpen;
  if (scanPanelOpen) {
    panel.classList.remove('sp-collapsed');
    btn.textContent = '✕';
    btn.title = 'Chiudi pannello scansione';
  } else {
    panel.classList.add('sp-collapsed');
    btn.textContent = '📡';
    btn.title = 'Apri pannello scansione';
  }
}
window.toggleScanPanel = toggleScanPanel;

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatScanDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return '';
  const now = new Date();
  const diff = now - d;
  const day = 86400000;
  if (diff < day && d.getDate() === now.getDate()) return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  if (diff < 7 * day) return d.toLocaleDateString('it-IT', { weekday: 'short' });
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}
