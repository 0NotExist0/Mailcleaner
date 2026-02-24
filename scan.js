// --- PANNELLO SCANSIONE INBOX (colonna destra) ---

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
    const labelInfo = await gapi.client.gmail.users.labels.get({ userId: 'me', id: 'INBOX' });
    const estimatedTotal = labelInfo.result.messagesTotal || 0;
    statsTxt.textContent = `~${estimatedTotal.toLocaleString('it-IT')} email in Inbox`;

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
