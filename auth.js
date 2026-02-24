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
        if (localStorage.getItem('mailcleaner_autologin') === 'true') {
            tryAutoLogin();
        } else {
            const btn = document.getElementById('authorize_button');
            btn.disabled = false;
            btn.classList.remove('disabled');
            document.getElementById('auth_button_text').innerText = 'Accedi con Google';
            btn.style.display = 'flex';
        }
    }
}

function tryAutoLogin() {
    const loadingMsg = document.createElement('p');
    loadingMsg.id = 'autologin-msg';
    loadingMsg.style.cssText = 'text-align:center; color:#6c757d; font-size:14px; margin-top:30px;';
    loadingMsg.textContent = '🔄 Rientro automatico in corso...';
    document.body.appendChild(loadingMsg);

    document.getElementById('authorize_button').style.display = 'none';

    let callbackFired = false;
    const fallbackTimer = setTimeout(() => {
        if (!callbackFired) {
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
    tokenClient.requestAccessToken({ prompt: '' });
}

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

        const btn = document.getElementById('authorize_button');
        btn.style.display = 'flex';
        btn.disabled = false;
        btn.classList.remove('disabled');
        document.getElementById('auth_button_text').innerText = 'Accedi con Google';
    }
}
