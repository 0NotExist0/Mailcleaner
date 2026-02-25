// --- COSTANTI E VARIABILI GLOBALI ---
// Assicurati di inserire i tuoi dati reali qui
const CLIENT_ID = 'IL_TUO_CLIENT_ID.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/gmail.modify'; 
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';

let tokenClient;
let gapiInited = false;
let gisInited = false;

// --- INIZIALIZZAZIONE ---
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}
  
async function initializeGapiClient() {
    try {
        await gapi.client.init({ discoveryDocs: [DISCOVERY_DOC] });
        gapiInited = true;
        maybeEnableButtons();
    } catch (error) {
        console.error('Errore durante l\'inizializzazione di GAPI:', error);
    }
}

function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '', // Verrà sovrascritto di volta in volta
    });
    gisInited = true;
    maybeEnableButtons();
}

function maybeEnableButtons() {
    if (gapiInited && gisInited) {
        if (localStorage.getItem('mailcleaner_autologin') === 'true') {
            tryAutoLogin();
        } else {
            showLoginButton();
        }
    }
}

// Funzione di utilità per non ripetere il codice
function showLoginButton() {
    const btn = document.getElementById('authorize_button');
    btn.style.display = 'flex';
    btn.disabled = false;
    btn.classList.remove('disabled');
    document.getElementById('auth_button_text').innerText = 'Accedi con Google';
}

function tryAutoLogin() {
    // 1. Mostra il messaggio di caricamento
    const loadingMsg = document.createElement('p');
    loadingMsg.id = 'autologin-msg';
    loadingMsg.style.cssText = 'text-align:center; color:#6c757d; font-size:14px; margin-top:30px;';
    loadingMsg.textContent = '🔄 Rientro automatico in corso...';
    document.body.appendChild(loadingMsg);

    document.getElementById('authorize_button').style.display = 'none';

    let callbackFired = false;
    
    // 2. Fallback nel caso in cui il browser blocchi la richiesta in background
    const fallbackTimer = setTimeout(() => {
        if (!callbackFired) {
            cancelAutoLogin(loadingMsg);
        }
    }, 5000); // 5 secondi sono sufficienti

    // 3. Imposta il callback per questa specifica richiesta
    tokenClient.callback = async (resp) => {
        callbackFired = true;
        clearTimeout(fallbackTimer);
        if (loadingMsg) loadingMsg.remove();

        // Se fallisce, cancelliamo il flag e mostriamo il bottone
        if (resp.error !== undefined) {
            console.warn('Auto-login fallito o bloccato dal browser:', resp.error);
            cancelAutoLogin(null); // Il msg è già rimosso
            return;
        }
        onLoginSuccess();
    };

    // 4. Lancia la richiesta invisibile
    tokenClient.requestAccessToken({ prompt: 'none' });
}

function cancelAutoLogin(msgElement) {
    if (msgElement) msgElement.remove();
    localStorage.removeItem('mailcleaner_autologin');
    showLoginButton();
}

function onLoginSuccess() {
    localStorage.setItem('mailcleaner_autologin', 'true');
    document.getElementById('authorize_button').style.display = 'none';
    document.getElementById('signout_button').classList.remove('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    document.getElementById('search-container').classList.remove('hidden');
    
    // Avvia il resto dell'app
    loadLabels();
    listEmails();
    startScanPanel();
}

function handleAuthClick() {
    // Se abbiamo già un token valido, non lo richiediamo a Google inutilmente
    if (gapi.client.getToken() !== null) {
        onLoginSuccess();
        return;
    }

    // Se non abbiamo un token, mostriamo il popup all'utente
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) {
            console.error('Errore durante il login manuale:', resp);
            return;
        }
        onLoginSuccess();
    };
    
    tokenClient.requestAccessToken({ prompt: 'consent' });
}

function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        // La revoca del token è asincrona, passiamo una funzione vuota per sicurezza
        google.accounts.oauth2.revoke(token.access_token, () => {});
        gapi.client.setToken('');
    }
    
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
    showLoginButton();
}
