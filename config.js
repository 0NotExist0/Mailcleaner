// --- CONFIGURAZIONE E VARIABILI GLOBALI ---
const CLIENT_ID = '819190259473-aka5j4abtiu6t5e9sdrm32ukke4pt69f.apps.googleusercontent.com';
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/gmail/v1/rest';
const SCOPES = 'https://mail.google.com/';

let tokenClient;
let gapiInited = false;
let gisInited = false;

// Stato dell'app
let currentMenuMessageId = null;
let currentMenuSender = null;
let selectedFolders = []; 
let searchTimeout = null; 
let scanPanelOpen = true;

// Utility Globale
function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
