// --- GESTIONE RAGGRUPPAMENTO MITTENTE E MULTIPLO ---

document.getElementById('menu-group').addEventListener('click', () => {
    if (currentMenuSender) {
        closeContextMenu();
        showGroupPickerDialog(currentMenuSender);
    }
});

document.getElementById('menu-group-selected').addEventListener('click', () => {
    groupSelectedEmails(); closeContextMenu();
});

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

  overlay.querySelectorAll('.gp-opt-period').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.gp-opt-period').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      updatePickerSummary();
    });
  });

  overlay.querySelectorAll('.gp-opt-batch').forEach(btn => {
    btn.addEventListener('click', () => {
      overlay.querySelectorAll('.gp-opt-batch').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

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
    '':              `Cercherà <strong>tutte le email</strong> dall'inizio della casella.`,
    'newer_than:1y': `Cercherà solo le email dell'<strong>ultimo anno</strong>.`,
    'newer_than:6m': `Cercherà solo le email degli <strong>ultimi 6 mesi</strong>.`,
    'newer_than:3m': `Cercherà solo le email degli <strong>ultimi 3 mesi</strong>.`,
    'newer_than:1m': `Cercherà solo le email dell'<strong>ultimo mese</strong>.`,
    'newer_than:7d': `Cercherà solo le email dell'<strong>ultima settimana</strong>.`,
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

  let q = `from:${senderEmail} in:anywhere`;
  if (period) q += ` ${period}`;

  showGroupProgress({ sender: senderEmail, label: labelName, phase: 'search', found: 0, moved: 0, total: 0 });

  try {
    const labelId = await getOrCreateLabel(labelName);

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
