const CLIENT_ID = '819190259473-aka5j4abtiu6t5e9sdrm32ukke4pt69f.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';
const SCOPES = 'https://mail.google.com/ https://www.googleapis.com/auth/gmail.labels';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let currentMenuMessageId = null;
let currentMenuSender = null;

// --- INIZIALIZZAZIONE ---
function gapiLoaded() {
    gapi.load('client', async () => {
        await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });
        gapiInited = true;
        maybeEnableButtons();
    });
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
        document.getElementById('authorize_button').style.display = 'inline-block';
    }
}

// --- AUTH ---
function handleAuthClick() {
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) throw (resp);
        document.getElementById('authorize_button').classList.add('hidden');
        document.getElementById('signout_button').classList.remove('hidden');
        document.getElementById('content').classList.remove('hidden');
        
        // Avvia scansione totale appena loggato
        listAllEmails();
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
        location.reload(); // Reset totale della pagina
    }
}

// --- LOGICA EMAIL (SCANSIONE TOTALE) ---
async function listAllEmails() {
    const container = document.getElementById('email_list');
    const counter = document.getElementById('counter');
    container.innerHTML = '';
    
    let nextPageToken = null;
    let totalCount = 0;

    try {
        do {
            const response = await gapi.client.gmail.users.messages.list({
                'userId': 'me',
                'maxResults': 500,
                'pageToken': nextPageToken,
                'q': '' // Nessun filtro = Tutte le email
            });

            const messages = response.result.messages;
            if (messages && messages.length > 0) {
                totalCount += messages.length;
                counter.innerText = `Scansione in corso... Individuate ${totalCount} email`;
                await renderBatch(messages);
            }
            nextPageToken = response.result.nextPageToken;
        } while (nextPageToken);

        counter.innerText = `Scansione completata. Totale email: ${totalCount}`;
    } catch (err) {
        counter.innerText = "Errore: " + err.message;
    }
}

async function renderBatch(messages) {
    const container = document.getElementById('email_list');
    
    // Per velocizzare, carichiamo i dettagli solo per le prime (o a blocchi)
    // Nota: richiedere i dettagli di migliaia di mail può richiedere tempo
    for (const msg of messages) {
        const div = document.createElement('div');
        div.className = 'email-item';
        div.id = `msg-${msg.id}`;
        div.innerHTML = `<span>Caricamento ID: ${msg.id}...</span>`;
        container.appendChild(div);

        // Chiamata asincrona per i dettagli (Soggetto/Mittente)
        fetchEmailDetails(msg.id, div);
    }
}

async function fetchEmailDetails(id, element) {
    try {
        const res = await gapi.client.gmail.users.messages.get({
            'userId': 'me',
            'id': id,
            'format': 'metadata',
            'metadataHeaders': ['Subject', 'From']
        });
        const headers = res.result.payload.headers;
        const from = headers.find(h => h.name === 'From')?.value || "Sconosciuto";
        const subject = headers.find(h => h.name === 'Subject')?.value || "(Senza oggetto)";

        element.innerHTML = `
            <div><strong>${from}</strong><br><small>${subject}</small></div>
            <button class="btn-delete" onclick="trashEmail('${id}'); event.stopPropagation();">🗑️</button>
        `;
        
        element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, id, from);
        });
    } catch (e) {
        element.remove(); // Se fallisce, rimuovi l'entry
    }
}

// --- FUNZIONI UTILITY (TRASH, MENU, GROUP) ---
async function trashEmail(id) {
    await gapi.client.gmail.users.messages.trash({ 'userId': 'me', 'id': id });
    document.getElementById(`msg-${id}`).style.opacity = '0.3';
    document.getElementById(`msg-${id}`).style.pointerEvents = 'none';
}

function showContextMenu(event, id, sender) {
    currentMenuMessageId = id;
    currentMenuSender = sender;
    const menu = document.getElementById('custom-menu');
    menu.style.display = 'block';
    menu.style.left = `${event.pageX}px`;
    menu.style.top = `${event.pageY}px`;
}

document.addEventListener('click', () => {
    document.getElementById('custom-menu').style.display = 'none';
});

// Aggiungi qui gli event listener per 'menu-delete' e 'menu-group' 
// come nel tuo codice originale...
