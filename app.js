// --- CONFIGURAZIONE ---
// Sostituisci questo valore con il tuo Client ID da Google Cloud Console
const CLIENT_ID = 'IL_TUO_CLIENT_ID_QUI.apps.googleusercontent.com';

// Questo url serve a GAPI per capire come parlare con Gmail
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';
// Il permesso che chiediamo all'utente (modificare le mail)
const SCOPES = 'https://mail.google.com/';

let tokenClient;
let gapiInited = false;
let gisInited = false;

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
    callback: '', // Definito dinamicamente in handleAuthClick
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
    // Chiede il login se non c'è token
    tokenClient.requestAccessToken({prompt: 'consent'});
  } else {
    // Salta se è già loggato
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
    document.getElementById('signout_button').classList.add('hidden');
    document.getElementById('email_list').innerHTML = '';
  }
}

// 5. Cerca le mail inutili
async function listEmails() {
  let response;
  try {
    // Cerchiamo email non lette nella categoria promozioni
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

  // Per ogni messaggio, scarichiamo i dettagli per leggere l'oggetto
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
      <button class="btn-delete" onclick="trashEmail('${message.id}')">Cestina</button>
    `;
    container.appendChild(div);
  }
}

// 6. Sposta la mail nel Cestino
async function trashEmail(messageId) {
  try {
    await gapi.client.gmail.users.messages.trash({
      'userId': 'me',
      'id': messageId
    });
    // Rimuove l'elemento dalla pagina dopo averlo cestinato
    const element = document.getElementById(`msg-${messageId}`);
    element.innerHTML = "<p><em>Email spostata nel cestino! 🗑️</em></p>";
    setTimeout(() => element.remove(), 2000);
  } catch (err) {
    alert("Errore durante l'eliminazione: " + err.message);
  }
}
