// --- CONFIGURAZIONE ---
// Sostituisci questo valore con il tuo Client ID da Google Cloud Console
const CLIENT_ID = '819190259473-aka5j4abtiu6t5e9sdrm32ukke4pt69f.apps.googleusercontent.com';

const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';
// Abbiamo aggiunto https://www.googleapis.com/auth/gmail.labels per poter creare cartelle
const SCOPES = 'https://mail.google.com/ https://www.googleapis.com/auth/gmail.labels';

let tokenClient;
let gapiInited = false;
let gisInited = false;

// Variabili per il menu contestuale
let currentMenuMessageId = null;
let currentMenuSender = null;

// 1. Inizializza GAPI
function gapiLoaded() {
  gapi.load('client', initializeGapiClient);
}
async function initializeGapiClient() {
  await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });
  gapiInited = true;
  maybeEnableButtons();
}

// 2. Inizializza Google Identity Services (GIS)
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
    document.getElementById('authorize_button').style.display = 'inline-block';
  }
}

// 3. Gestione Login
function handleAuthClick() {
  tokenClient.callback = async (resp) => {
    if (resp.error !== undefined) throw (resp);
    document.getElementById('authorize_button').classList.add('hidden');
    document.getElementById('signout_button').classList.remove('hidden');
    document.getElementById('content').classList.remove('hidden');
  };

  if (gapi.client.getToken() === null) {
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    tokenClient.requestAccessToken({prompt: ''});
  }
}

// 4. Gestione Logout
function handleSignoutClick() {
  const token = gapi.client.getToken();
  if (token !== null) {
    google.accounts.oauth2.revoke(token.access_token);
    gapi.client.setToken('');
    document.getElementById('content').classList.add('hidden');
    document.getElementById('authorize_button').classList.remove('hidden');
    document.getElementById('authorize_button').style.display = 'inline-block';
    document.getElementById('signout_button').classList.add('hidden');
    document.getElementById('email_list').innerHTML = '';
  }
}

// 5. Cerca le mail inutili
async function listEmails() {
  let response;
  try {
    response = await gapi.client.gmail.users.messages.list({
      'userId': 'me',
      'q': 'is:unread category:promotions',
      'maxResults': 10 
    });
  } catch (err) {
    document.getElementById('email_list').innerText = "Errore: " + err.message;
    return;
  }

  const messages = response.result.messages;
  const container = document.getElementById('email_list');
  container.innerHTML = '<h3>Le tue email promozionali:</h3>';

  if (!messages || messages.length === 0) {
    container.innerHTML += '<p>Non hai email inutili qui!</p>';
    return;
  }

  for (const message of messages) {
    const msgData = await gapi.client.gmail.users.messages.get({
      'userId': 'me',
      'id': message.id,
      'format': 'metadata',
      'metadataHeaders': ['Subject', 'From']
    });

    const headers = msgData.result.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || "Nessun Oggetto";
    const from = headers.find(h => h.name === 'From')?.value || "Sconosciuto";

    const div = document.createElement('div');
    div.className = 'email-item';
    div.id = `msg-${message.id}`;
    div.innerHTML = `
      <div>
        <strong>${from}</strong><br>
        <small>${subject}</small>
      </div>
      <button class="btn-delete" onclick="trashEmail('${message.id}'); event.stopPropagation();">Cestina</button>
    `;

    // SELEZIONE: Clic sinistro per selezionare/deselezionare
    div.addEventListener('click', () => {
        div.classList.toggle('selected');
    });

    // MENU CONTESTUALE: Clic destro
    div.addEventListener('contextmenu', (e) => {
        e.preventDefault(); // Blocca il menu di default del browser
        
        // Opzionale: Seleziona in automatico l'email su cui hai fatto tasto destro
        div.classList.add('selected'); 
        
        showContextMenu(e, message.id, from);
    });

    container.appendChild(div);
  }
}

// 6. Sposta la singola mail nel Cestino
async function trashEmail(messageId) {
  try {
    await gapi.client.gmail.users.messages.trash({
      'userId': 'me',
      'id': messageId
    });
    const element = document.getElementById(`msg-${messageId}`);
    if(element) {
        element.innerHTML = "<p><em>Email spostata nel cestino! 🗑️</em></p>";
        setTimeout(() => element.remove(), 2000);
    }
  } catch (err) {
    alert("Errore durante l'eliminazione: " + err.message);
  }
}

// --- LOGICA MENU CONTESTUALE E RAGGRUPPAMENTO ---

// Mostra il menu
function showContextMenu(event, messageId, senderHeader) {
  currentMenuMessageId = messageId;
  currentMenuSender = senderHeader;

  const menu = document.getElementById('custom-menu');
  menu.style.display = 'block';
  menu.style.left = `${event.pageX}px`;
  menu.style.top = `${event.pageY}px`;
}

// Nascondi il menu cliccando altrove nella pagina
document.addEventListener('click', (e) => {
  if (e.button !== 2) { // 2 è il tasto destro
    document.getElementById('custom-menu').style.display = 'none';
  }
});

// Ascoltatori per i bottoni del menu contestuale
document.getElementById('menu-delete').addEventListener('click', () => {
  document.getElementById('custom-menu').style.display = 'none';
  if (currentMenuMessageId) trashEmail(currentMenuMessageId);
});

document.getElementById('menu-group').addEventListener('click', () => {
  document.getElementById('custom-menu').style.display = 'none';
  if (currentMenuSender) groupEmailsBySender(currentMenuSender);
});

// Funzione per raggruppare le email in una nuova cartella
async function groupEmailsBySender(senderHeader) {
  // Estrae la mail pura (es. da "Marco <marco@sito.it>" a "marco@sito.it")
  const emailMatch = senderHeader.match(/<(.+)>/);
  const senderEmail = emailMatch ? emailMatch[1] : senderHeader.trim();
  
  const labelName = `Raggruppate_${senderEmail.split('@')[0]}`; 

  try {
    // 1. Ottieni l'ID della cartella (o creala se non esiste)
    const labelId = await getOrCreateLabel(labelName);

    // 2. Cerca tutte le email di quel mittente
    const searchResp = await gapi.client.gmail.users.messages.list({
      'userId': 'me',
      'q': `from:${senderEmail}`
    });

    const messages = searchResp.result.messages;
    if (!messages || messages.length === 0) {
      alert("Nessuna mail trovata per questo mittente.");
      return;
    }

    const messageIds = messages.map(m => m.id);

    // 3. Sposta le mail (aggiungi etichetta, rimuovi dalla posta in arrivo)
    await gapi.client.gmail.users.messages.batchModify({
      'userId': 'me',
      'resource': {
        'ids': messageIds,
        'addLabelIds': [labelId],
        'removeLabelIds': ['INBOX'] 
      }
    });

    alert(`✅ ${messageIds.length} email spostate nella cartella "${labelName}".`);
    
    // Aggiorna la vista
    listEmails();

  } catch (err) {
    alert("Errore durante il raggruppamento: " + err.message);
  }
}

// Supporto: crea un'etichetta su Gmail o restituisce l'ID se esiste già
async function getOrCreateLabel(name) {
  const labelsResp = await gapi.client.gmail.users.labels.list({ 'userId': 'me' });
  const labels = labelsResp.result.labels;
  
  const existingLabel = labels.find(l => l.name === name);
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
