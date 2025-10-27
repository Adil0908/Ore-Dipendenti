// Aggiungi tutte le importazioni Firebase necessarie all'inizio del file
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-analytics.js";

// firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSyAZS2BAvXgClkD6KF87M_OAIHL_vNwa2wQ",
    authDomain: "orecommeseu14.firebaseapp.com",
    projectId: "orecommeseu14",
    storageBucket: "orecommeseu14.firebasestorage.app",
    messagingSenderId: "693874640353",
    appId: "1:693874640353:web:f8626c1a7d568242abfea0",
    measurementId: "G-6XT4G34CQJ"
};

const CONSTANTS = {
    ORARIO_PAUSA_INIZIO: "12:00",
    ORARIO_PAUSA_FINE: "13:00",
    RIGHE_PER_PAGINA: 5,
    MESI: ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
           "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"]
};

const ADMIN_CREDENTIALS = {
    email: 'eliraoui.a@union14.it',
    password: 'Eliraoui0101!',
    ruolo: 'admin'
};

// state-manager.js
class StateManager {
    constructor() {
        this.datiOreLavorate = [];
        this.datiTotaliDipendenti = [];
        this.datiTotaliCommesse = [];
        this.datiFiltrati = null;
        this.currentUser = null;
        this.paginazione = {
            dipendenti: 1,
            commesse: 1,
            oreLavorate: 1
        };
        this.cache = new Map();
    }

    setCache(key, data, ttl = 300000) {
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    }

    getCache(key) {
        const item = this.cache.get(key);
        if (!item) return null;
        
        if (Date.now() - item.timestamp > item.ttl) {
            this.cache.delete(key);
            return null;
        }
        return item.data;
    }

    clearCache() {
        this.cache.clear();
    }
}

const stateManager = new StateManager();

// utils.js
class Utils {
    static calcolaOreLavorate(oraInizio, oraFine) {
        if (!this.isValidTimeFormat(oraInizio) || !this.isValidTimeFormat(oraFine)) {
            console.error("Formato orario non valido. Usare 'HH:mm'");
            return 0;
        }

        const toMinutes = (time) => {
            const [ore, minuti] = time.split(':').map(Number);
            return ore * 60 + minuti;
        };

        const minutiInizio = toMinutes(oraInizio);
        const minutiFine = toMinutes(oraFine);
        let differenzaMinuti = minutiFine - minutiInizio;

        if (differenzaMinuti < 0) differenzaMinuti += 24 * 60;
        
        return differenzaMinuti / 60;
    }

    static formattaOreDecimali(oreDecimali) {
        const ore = Math.floor(oreDecimali);
        const minuti = Math.round((oreDecimali - ore) * 60);
        return `${ore}:${String(minuti).padStart(2, '0')}`;
    }

    static isValidTimeFormat(time) {
        return time && /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time);
    }

    static arrotondaAlQuartoDora(ora) {
        if (!this.isValidTimeFormat(ora)) return ora;
        
        const [ore, minuti] = ora.split(":").map(Number);
        const minutiArrotondati = Math.round(minuti / 15) * 15;
        const oreFinali = ore + Math.floor(minutiArrotondati / 60);
        const minutiFinali = minutiArrotondati % 60;

        return `${String(oreFinali).padStart(2, "0")}:${String(minutiFinali).padStart(2, "0")}`;
    }

    static siSovrappongono(inizio1, fine1, inizio2, fine2) {
        const toMinutes = (time) => {
            const [ore, minuti] = time.split(':').map(Number);
            return ore * 60 + minuti;
        };

        const start1 = toMinutes(inizio1);
        const end1 = toMinutes(fine1);
        const start2 = toMinutes(inizio2);
        const end2 = toMinutes(fine2);

        return start1 < end2 && end1 > start2;
    }

    static calcolaTotaleGenerale(oreFiltrate) {
        if (!Array.isArray(oreFiltrate)) {
            console.error("Dati non validi per il calcolo del totale");
            return 0;
        }

        const totaleOre = oreFiltrate.reduce((totale, ore) => {
            const oreLavorate = this.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
            return totale + oreLavorate;
        }, 0);

        return totaleOre;
    }
}

// error-handler.js
class ErrorHandler {
    static handleError(error, context = '') {
        console.error(`Errore in ${context}:`, error);
        
        const userMessage = this.getUserMessage(error, context);
        this.showNotification(userMessage, 'error');
    }

    static getUserMessage(error, context) {
        const messages = {
            'auth/invalid-credential': 'Credenziali non valide',
            'permission-denied': 'Non hai i permessi necessari',
            'not-found': 'Risorsa non trovata',
            'network': 'Errore di connessione'
        };

        for (const [key, message] of Object.entries(messages)) {
            if (error?.code?.includes(key) || error?.message?.includes(key)) {
                return message;
            }
        }

        return `Si è verificato un errore ${context ? `durante ${context}` : ''}`;
    }

    static showNotification(message, type = 'info') {
        // Rimuovi notifiche precedenti
        const existingNotifications = document.querySelectorAll('.alert[style*="position: fixed"]');
        existingNotifications.forEach(notification => notification.remove());

        const notification = document.createElement('div');
        notification.className = `alert alert-${type} alert-dismissible fade show`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            min-width: 300px;
            max-width: 500px;
        `;
        
        const icons = { error: '❌', success: '✅', warning: '⚠️', info: 'ℹ️' };
        
        notification.innerHTML = `
            <strong>${icons[type] || ''} ${type === 'error' ? 'Errore' : 
              type === 'success' ? 'Successo' : 
              type === 'warning' ? 'Attenzione' : 'Info'}:</strong> 
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, type === 'error' ? 10000 : 5000);
    }
}

// firebase-service.js
class FirebaseService {
    constructor(db) {
        this.db = db;
    }

    async getCollection(collectionName, useCache = true) {
        const cacheKey = `${collectionName}_all`;
        
        if (useCache) {
            const cached = stateManager.getCache(cacheKey);
            if (cached) return cached;
        }

        const querySnapshot = await getDocs(collection(this.db, collectionName));
        const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        if (useCache) {
            stateManager.setCache(cacheKey, data);
        }
        
        return data;
    }

    async addDocument(collectionName, data) {
        const result = await addDoc(collection(this.db, collectionName), data);
        stateManager.clearCache();
        return result;
    }

    async updateDocument(collectionName, id, data) {
        const docRef = doc(this.db, collectionName, id);
        await updateDoc(docRef, data);
        stateManager.clearCache();
    }

    async deleteDocument(collectionName, id) {
        await deleteDoc(doc(this.db, collectionName, id));
        stateManager.clearCache();
    }

    async getOreLavorateFiltrate(filtri = {}) {
        const cacheKey = `ore_lavorate_${JSON.stringify(filtri)}`;
        const cached = stateManager.getCache(cacheKey);
        if (cached) return cached;

        const tutteLeOre = await this.getCollection("oreLavorate", false);
        
        let datiFiltrati = tutteLeOre.filter(ore => {
            let corrisponde = true;

            if (filtri.commessa) {
                corrisponde = corrisponde && ore.commessa.toLowerCase().includes(filtri.commessa.toLowerCase());
            }

            if (filtri.dipendente) {
                const nomeCompleto = `${ore.nomeDipendente} ${ore.cognomeDipendente}`.toLowerCase();
                corrisponde = corrisponde && nomeCompleto.includes(filtri.dipendente.toLowerCase());
            }

            if (filtri.nonConformita) {
                corrisponde = corrisponde && ore.nonConformita === true;
            }

            if (filtri.anno || filtri.mese || filtri.giorno) {
                const [anno, mese, giorno] = ore.data.split('-');
                if (filtri.anno) corrisponde = corrisponde && anno === filtri.anno;
                if (filtri.mese) corrisponde = corrisponde && mese === filtri.mese;
                if (filtri.giorno) corrisponde = corrisponde && giorno === filtri.giorno;
            }

            return corrisponde;
        });

        datiFiltrati.sort((a, b) => new Date(b.data) - new Date(a.data));
        
        stateManager.setCache(cacheKey, datiFiltrati, 60000);
        return datiFiltrati;
    }
}

// pagination-manager.js
// CORREZIONE PAGINATION MANAGER
// CORREZIONE DEFINITIVA PAGINATION MANAGER
class PaginationManager {
    constructor(containerId, righePerPagina) {
        this.container = document.getElementById(containerId);
        this.righePerPagina = righePerPagina;
        this.paginaCorrente = 1;
        this.datiTotali = [];
        this.callbackAggiornaTabella = null;
    }

    render(datiTotali, callbackAggiornaTabella) {
        if (!this.container) return;
        
        this.datiTotali = datiTotali || [];
        this.callbackAggiornaTabella = callbackAggiornaTabella;
        
        const numeroPagine = Math.ceil(this.datiTotali.length / this.righePerPagina);
        
        // Se non ci sono pagine, nascondi la paginazione
        if (numeroPagine <= 1) {
            this.container.innerHTML = '';
            return;
        }
        
        this.container.innerHTML = `
            <div class="pagination-controls">
                <button id="btnPrecedente" class="btn btn-outline-primary btn-sm" ${this.paginaCorrente === 1 ? 'disabled' : ''}>
                    ‹ Precedente
                </button>
                <div id="numeriPagina" class="pagination-numbers"></div>
                <button id="btnSuccessiva" class="btn btn-outline-primary btn-sm" ${this.paginaCorrente === numeroPagine ? 'disabled' : ''}>
                    Successiva ›
                </button>
                <span class="pagination-info">Pagina ${this.paginaCorrente} di ${numeroPagine} (${this.datiTotali.length} record)</span>
            </div>
        `;

        const numeriPagina = this.container.querySelector('#numeriPagina');
        
        // Mostra massimo 7 numeri di pagina
        let startPage = Math.max(1, this.paginaCorrente - 3);
        let endPage = Math.min(numeroPagine, startPage + 6);
        
        if (endPage - startPage < 6) {
            startPage = Math.max(1, endPage - 6);
        }

        // Pulsante prima pagina
        if (startPage > 1) {
            const btnFirst = document.createElement('button');
            btnFirst.textContent = '1';
            btnFirst.className = 'btn btn-sm btn-outline-primary';
            btnFirst.addEventListener('click', () => {
                this.paginaCorrente = 1;
                this.aggiornaPaginazione();
            });
            numeriPagina.appendChild(btnFirst);
            
            if (startPage > 2) {
                const ellipsis = document.createElement('span');
                ellipsis.textContent = '...';
                ellipsis.className = 'pagination-ellipsis';
                numeriPagina.appendChild(ellipsis);
            }
        }

        // Numeri di pagina
        for (let i = startPage; i <= endPage; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            btn.className = `btn btn-sm ${i === this.paginaCorrente ? 'btn-primary' : 'btn-outline-primary'}`;
            btn.addEventListener('click', () => {
                this.paginaCorrente = i;
                this.aggiornaPaginazione();
            });
            numeriPagina.appendChild(btn);
        }

        // Pulsante ultima pagina
        if (endPage < numeroPagine) {
            if (endPage < numeroPagine - 1) {
                const ellipsis = document.createElement('span');
                ellipsis.textContent = '...';
                ellipsis.className = 'pagination-ellipsis';
                numeriPagina.appendChild(ellipsis);
            }
            
            const btnLast = document.createElement('button');
            btnLast.textContent = numeroPagine;
            btnLast.className = 'btn btn-sm btn-outline-primary';
            btnLast.addEventListener('click', () => {
                this.paginaCorrente = numeroPagine;
                this.aggiornaPaginazione();
            });
            numeriPagina.appendChild(btnLast);
        }

        // Gestione pulsanti precedente/successiva
        this.container.querySelector('#btnPrecedente').addEventListener('click', () => {
            if (this.paginaCorrente > 1) {
                this.paginaCorrente--;
                this.aggiornaPaginazione();
            }
        });

        this.container.querySelector('#btnSuccessiva').addEventListener('click', () => {
            if (this.paginaCorrente < numeroPagine) {
                this.paginaCorrente++;
                this.aggiornaPaginazione();
            }
        });
    }

    aggiornaPaginazione() {
        if (this.callbackAggiornaTabella && this.datiTotali) {
            this.callbackAggiornaTabella();
        }
    }

    getDatiPagina() {
        if (!this.datiTotali || this.datiTotali.length === 0) {
            return [];
        }
        const inizio = (this.paginaCorrente - 1) * this.righePerPagina;
        const fine = inizio + this.righePerPagina;
        return this.datiTotali.slice(inizio, fine);
    }

    reset() {
        this.paginaCorrente = 1;
    }

    // Metodo per aggiornare i dati senza ricreare la paginazione
    aggiornaDati(nuoviDati) {
        this.datiTotali = nuoviDati || [];
        this.paginaCorrente = 1; // Reset alla prima pagina
    }
}

// MAIN APPLICATION - VERSIONE COMPLETA CON CSV
class OreLavorateApp {
    constructor() {
        this.firebaseService = null;
        this.paginazioneOre = null;
        this.paginazioneDipendenti = null;
        this.paginazioneCommesse = null;
        
        // Proprietà per i dati
        this.datiTotaliOre = [];
        this.datiTotaliDipendenti = [];
        this.datiTotaliCommesse = [];
        
        this.init();
    }

    async init() {
    try {
        // Inizializza Firebase
        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        
        // Inizializza Analytics (opzionale)
        getAnalytics(app);
        
        this.firebaseService = new FirebaseService(db);

        // Inizializza paginazione
        this.paginazioneOre = new PaginationManager('paginationOre', CONSTANTS.RIGHE_PER_PAGINA);
        this.paginazioneDipendenti = new PaginationManager('paginationDipendenti', CONSTANTS.RIGHE_PER_PAGINA);
        this.paginazioneCommesse = new PaginationManager('paginationCommesse', CONSTANTS.RIGHE_PER_PAGINA);

        this.setupEventListeners();
        
        // INIZIALIZZA LA VISUALIZZAZIONE DELLE FASCE
        this.setupVisualizzazioneFasce();
        this.setupControlliTempoReale();
        
        console.log('Applicazione inizializzata con successo');
        
    } catch (error) {
        ErrorHandler.handleError(error, 'inizializzazione app');
    }
}

    setupEventListeners() {
        // Login
        document.getElementById('btnLogin')?.addEventListener('click', () => this.gestisciLogin());
        
        // Logout
        document.getElementById('logoutButton')?.addEventListener('click', () => this.logout());
        
        // Forms
        document.getElementById('oreForm')?.addEventListener('submit', (e) => this.handleOreForm(e));
        document.getElementById('commessaForm')?.addEventListener('submit', (e) => this.handleCommessaForm(e));
        document.getElementById('dipendentiForm')?.addEventListener('submit', (e) => this.handleDipendentiForm(e));
        
        // Filtri
        document.getElementById('filtraOreLavorate')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.applicaFiltri();
        });

        // PDF
        document.getElementById('btnScaricaPDF')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.generaPDFFiltrato();
        });

        // Ricerca commesse
        document.getElementById('btnCercaCommessa')?.addEventListener('click', () => {
            const filtro = document.getElementById('cercaCommessa').value.trim();
            this.paginazioneCommesse.reset();
            this.aggiornaTabellaCommesse(filtro);
        });

        document.getElementById('btnResetCercaCommessa')?.addEventListener('click', () => {
            document.getElementById('cercaCommessa').value = '';
            this.paginazioneCommesse.reset();
            this.aggiornaTabellaCommesse();
        });

        // Gestione date
        document.getElementById('filtroAnno')?.addEventListener('change', this.aggiornaGiorni.bind(this));
        document.getElementById('filtroMese')?.addEventListener('change', this.aggiornaGiorni.bind(this));
        
        // Tabelle mensili
        document.getElementById('btnMostraTabella')?.addEventListener('click', () => this.mostraTabellaMensile());

        // Non conformità
        document.getElementById('btnFiltraNonConformita')?.addEventListener('click', () => this.filtraNonConformita());

        // Mostra tutti
        document.getElementById('btnMostraTutti')?.addEventListener('click', () => this.mostraTutti());

        // Reset filtri
        document.getElementById('btnResetFiltri')?.addEventListener('click', () => this.resetFiltri());

        // Applica filtri
        document.getElementById('btnApplicaFiltri')?.addEventListener('click', (e) => {
            e.preventDefault();
            this.applicaFiltri();
        });
    }

 async gestisciLogin() {
    try {
        const email = document.getElementById('inputEmail').value.trim();
        const password = document.getElementById('inputPassword').value.trim();

        if (!email || !password) {
            ErrorHandler.showNotification('Inserisci email e password', 'error');
            return;
        }

        if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
            stateManager.currentUser = { 
                ruolo: 'admin', 
                name: 'Amministratore Sistema',
                email: ADMIN_CREDENTIALS.email // AGGIUNGI email
            };
            await this.mostraApplicazione();
            return;
        }

        const dipendenti = await this.firebaseService.getCollection("dipendenti");
        const dipendente = dipendenti.find(d => d.email === email && d.password === password);

        if (dipendente) {
            if (dipendente.ruolo === "dipendente") {
                stateManager.currentUser = {
                    ruolo: 'dipendente',
                    name: `${dipendente.nome} ${dipendente.cognome}`,
                    email: dipendente.email, // AGGIUNGI email
                    id: dipendente.id // AGGIUNGI ID per maggiore sicurezza
                };
                console.log("Login dipendente:", stateManager.currentUser);
                await this.mostraApplicazione();
            } else {
                ErrorHandler.showNotification('Il tuo account non ha i privilegi necessari!', 'error');
            }
        } else {
            ErrorHandler.showNotification('Credenziali non valide!', 'error');
        }

        document.getElementById('inputEmail').value = "";
        document.getElementById('inputPassword').value = "";

    } catch (error) {
        ErrorHandler.handleError(error, 'login');
    }
}

    logout() {
        stateManager.currentUser = null;
        stateManager.clearCache();
        window.location.href = 'index.html';
    }

    async mostraApplicazione() {
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('appContent').style.display = 'block';

      

        // Nascondi tutte le sezioni
        document.querySelectorAll('.admin-only, .dipendente-only').forEach(el => el.style.display = 'none');

        if (stateManager.currentUser?.ruolo === 'dipendente') {
            document.querySelectorAll('.dipendente-only').forEach(el => el.style.display = 'block');
        }

        if (stateManager.currentUser?.ruolo === 'admin') {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
        }

        document.getElementById('tabelleMensili').style.display = 'none';

        // Imposta filtri predefiniti per admin
        if (stateManager.currentUser?.ruolo === 'admin') {
            const oggi = new Date();
            const annoCorrente = oggi.getFullYear().toString();
            const meseCorrente = String(oggi.getMonth() + 1).padStart(2, '0');
            const giornoCorrente = String(oggi.getDate()).padStart(2, '0');
            
            document.getElementById('filtroAnno').value = annoCorrente;
            document.getElementById('filtroMese').value = meseCorrente;
            
            this.aggiornaGiorni();
            
            setTimeout(() => {
                document.getElementById('filtroGiorno').value = giornoCorrente;
            }, 100);
        }

        await this.aggiornaMenuCommesse();
        await this.aggiornaTabellaOreLavorate();
        await this.aggiornaTabellaCommesse();
        await this.aggiornaTabellaDipendenti();
          // Imposta la data corrente nel form ore lavorate
    const oggi = new Date().toISOString().split('T')[0];
    document.getElementById('oreData').value = oggi;
    
    // Aggiorna la visualizzazione delle fasce per la data corrente
    await this.aggiornaVisualizzazioneFasce(oggi);

        // Messaggio di benvenuto
        const benvenuto = document.createElement('div');
        benvenuto.className = 'alert alert-info';
        benvenuto.innerHTML = `
            <strong>Benvenuto, ${stateManager.currentUser?.name || 'Utente'}!</strong>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        const appContent = document.getElementById('appContent');
        appContent.insertBefore(benvenuto, appContent.firstChild);
        // DEBUG: verifica i dati dopo il login
    if (stateManager.currentUser?.ruolo === 'dipendente') {
        setTimeout(() => this.verificaDatiDipendente(), 1000);
    }
    }

    async handleOreForm(e) {
    e.preventDefault();
    
    try {
        // CONTROLLO SICUREZZA: verifica che l'utente sia un dipendente
        if (!stateManager.currentUser || stateManager.currentUser.ruolo !== 'dipendente') {
            ErrorHandler.showNotification("Errore: accesso non autorizzato", 'error');
            return;
        }

        const formData = this.getOreFormData();
        if (!this.validateOreForm(formData)) return;

        // LOG per debug
        console.log("Tentativo di salvataggio ore per:", stateManager.currentUser.name);
        console.log("Dati form:", formData);

        const controllo = await this.controllaOrariGiornata(
            formData.data, 
            formData.oraInizio, 
            formData.oraFine
        );
        
        if (!controllo.valido) {
            ErrorHandler.showNotification(controllo.errore, 'error');
            return;
        }

        await this.firebaseService.addDocument("oreLavorate", formData);
        ErrorHandler.showNotification("Ore lavorate aggiunte con successo!", 'success');
        
        await this.aggiornaTabellaOreLavorate();
        e.target.reset();

    } catch (error) {
        if (error.message === "Utente non autorizzato" || error.message === "Profilo utente incompleto") {
            ErrorHandler.showNotification(error.message, 'error');
        } else {
            ErrorHandler.handleError(error, 'salvataggio ore lavorate');
        }
    }
}

    getOreFormData() {
    // VERIFICA che l'utente sia effettivamente loggato come dipendente
    if (!stateManager.currentUser || stateManager.currentUser.ruolo !== 'dipendente') {
        ErrorHandler.showNotification("Errore: utente non autorizzato", 'error');
        throw new Error("Utente non autorizzato");
    }
    
    // VERIFICA che il nome sia completo
    if (!stateManager.currentUser.name || stateManager.currentUser.name.split(" ").length < 2) {
        ErrorHandler.showNotification("Errore: profilo utente incompleto", 'error');
        throw new Error("Profilo utente incompleto");
    }
    
    const nomeCompleto = stateManager.currentUser.name.split(" ");
    const nomeDipendente = nomeCompleto[0];
    const cognomeDipendente = nomeCompleto.slice(1).join(" "); // Gestisce cognomi composti
    
    console.log("Dipendente corrente:", stateManager.currentUser);
    console.log("Nome:", nomeDipendente, "Cognome:", cognomeDipendente);
    
    return {
        commessa: document.getElementById('oreCommessa').value,
        nomeDipendente: nomeDipendente,
        cognomeDipendente: cognomeDipendente,
        data: document.getElementById('oreData').value,
        oraInizio: Utils.arrotondaAlQuartoDora(document.getElementById('oreInizio').value),
        oraFine: Utils.arrotondaAlQuartoDora(document.getElementById('oreFine').value),
        descrizione: document.getElementById('oreDescrizione').value,
        nonConformita: document.getElementById('nonConformita').checked,
        // AGGIUNGI l'email per maggiore sicurezza
        emailDipendente: stateManager.currentUser.email || stateManager.currentUser.name
    };
}

    validateOreForm(data) {
        if (!data.commessa) {
            ErrorHandler.showNotification("Seleziona una commessa dalla lista", 'error');
            return false;
        }

        if (!data.data) {
            ErrorHandler.showNotification("Seleziona una data", 'error');
            return false;
        }

        if (!data.oraInizio || !data.oraFine) {
            ErrorHandler.showNotification("Inserisci sia l'ora di inizio che di fine", 'error');
            return false;
        }

        if (data.oraFine <= data.oraInizio) {
            ErrorHandler.showNotification("L'ora di fine deve essere successiva all'ora di inizio", 'error');
            return false;
        }

        return true;
    }
// METODO TEMPORANEO - da rimuovere dopo l'uso
async correggiDatiOreLavorate() {
    try {
        const tutteLeOre = await this.firebaseService.getCollection("oreLavorate");
        const dipendenti = await this.firebaseService.getCollection("dipendenti");
        
        for (const ore of tutteLeOre) {
            // Trova il dipendente corretto in base all'email
            const dipendenteCorretto = dipendenti.find(d => 
                d.nome === ore.nomeDipendente && 
                d.cognome === ore.cognomeDipendente
            );
            
            if (dipendenteCorretto && dipendenteCorretto.email) {
                // Aggiorna con l'email per tracciabilità
                await this.firebaseService.updateDocument("oreLavorate", ore.id, {
                    emailDipendente: dipendenteCorretto.email
                });
                console.log("Corretto record:", ore.id, "per", dipendenteCorretto.email);
            }
        }
        
        console.log("Correzione dati completata");
    } catch (error) {
        console.error("Errore correzione dati:", error);
    }
}
    async handleCommessaForm(e) {
        e.preventDefault();
        try {
            const nomeCommessa = document.getElementById('nomeCommessa').value;
            const cliente = document.getElementById('cliente').value;
            
            if (!nomeCommessa || !cliente) {
                ErrorHandler.showNotification("Compila tutti i campi", 'error');
                return;
            }
            
            await this.firebaseService.addDocument("commesse", {
                nomeCommessa: nomeCommessa,
                cliente: cliente
            });
            
            ErrorHandler.showNotification("Commessa aggiunta con successo!", 'success');
            await this.aggiornaTabellaCommesse();
            await this.aggiornaMenuCommesse();
            
            e.target.reset();
        } catch (error) {
            ErrorHandler.handleError(error, 'aggiunta commessa');
        }
    }

    async handleDipendentiForm(e) {
        e.preventDefault();
        try {
            const nome = document.getElementById('dipendenteNome').value;
            const cognome = document.getElementById('dipendenteCognome').value;
            const email = document.getElementById('dipendenteEmail').value;
            const password = document.getElementById('dipendentePassword').value;
            const ruolo = document.getElementById('dipendenteRuolo').value;
            
            if (!nome || !cognome || !email || !password || !ruolo) {
                ErrorHandler.showNotification("Compila tutti i campi", 'error');
                return;
            }
            
            await this.firebaseService.addDocument("dipendenti", {
                nome: nome,
                cognome: cognome,
                email: email,
                password: password,
                ruolo: ruolo
            });
            
            ErrorHandler.showNotification("Dipendente aggiunto con successo!", 'success');
            await this.aggiornaTabellaDipendenti();
            
            e.target.reset();
        } catch (error) {
            ErrorHandler.handleError(error, 'aggiunta dipendente');
        }
    }

    async aggiornaMenuCommesse() {
        const select = document.getElementById('oreCommessa');
        if (!select) return;
        
        select.innerHTML = '<option value="">Seleziona una commessa</option>';

        try {
            const commesse = await this.firebaseService.getCollection("commesse");
            commesse.forEach(commessa => {
                const option = document.createElement('option');
                option.value = commessa.nomeCommessa;
                option.textContent = commessa.nomeCommessa;
                select.appendChild(option);
            });
        } catch (error) {
            ErrorHandler.handleError(error, 'caricamento commesse');
        }
    }

   // CORREZIONE METODI AGGIORNAMENTO TABELLE - VERSIONE SICURA
async aggiornaTabellaOreLavorate(oreFiltrate = null) {
    const tbody = document.querySelector('#orelavorateTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    try {
        // Se vengono passati dati filtrati, usali, altrimenti carica tutti i dati
        if (oreFiltrate) {
            this.datiTotaliOre = oreFiltrate;
            this.paginazioneOre.aggiornaDati(oreFiltrate);
        } else if (this.datiTotaliOre.length === 0) {
            const filtri = this.getFiltriAttivi();
            this.datiTotaliOre = await this.firebaseService.getOreLavorateFiltrate(filtri);
            this.paginazioneOre.aggiornaDati(this.datiTotaliOre);
        }

        const datiPagina = this.paginazioneOre.getDatiPagina();

        if (datiPagina.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="9" class="text-center">Nessun dato trovato</td>`;
            tbody.appendChild(row);
        } else {
            datiPagina.forEach(ore => {
                const oreLavorate = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${ore.commessa}</td>
                    <td>${ore.nomeDipendente} ${ore.cognomeDipendente}</td>
                    <td>${ore.data}</td>
                    <td>${ore.oraInizio}</td>
                    <td>${ore.oraFine}</td>
                    <td>${ore.descrizione}</td>
                    <td>${ore.nonConformita ? 'Sì' : 'No'}</td>
                    <td>${Utils.formattaOreDecimali(oreLavorate)}</td>
                    <td>
                        <button class="btn btn-sm btn-warning btnModificaOreLavorate" data-id="${ore.id}">Modifica</button>
                        <button class="btn btn-sm btn-danger btnEliminaOreLavorate" data-id="${ore.id}">Elimina</button>
                    </td>
                `;
                tbody.appendChild(row);

                row.querySelector('.btnModificaOreLavorate').addEventListener('click', () => this.modificaOreLavorate(ore.id));
                row.querySelector('.btnEliminaOreLavorate').addEventListener('click', () => this.eliminaOreLavorate(ore.id));
            });

            const totaleOreDecimali = Utils.calcolaTotaleGenerale(this.datiTotaliOre);
            const totaleFormattato = Utils.formattaOreDecimali(totaleOreDecimali);

            const totalRow = document.createElement('tr');
            totalRow.className = 'table-info';
            totalRow.innerHTML = `
                <td colspan="7"><strong>Totale Generale</strong></td>
                <td><strong>${totaleFormattato} ore</strong></td>
                <td></td>
            `;
            tbody.appendChild(totalRow);
        }

        // Aggiorna la paginazione
        this.paginazioneOre.render(this.datiTotaliOre, () => this.aggiornaTabellaOreLavorate());

    } catch (error) {
        console.error('Errore nel caricamento tabella ore:', error);
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Errore nel caricamento dei dati</td></tr>`;
    }
}

async aggiornaTabellaDipendenti() {
    const tbody = document.querySelector('#dipendentiTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    try {
        if (this.datiTotaliDipendenti.length === 0) {
            this.datiTotaliDipendenti = await this.firebaseService.getCollection("dipendenti");
            this.paginazioneDipendenti.aggiornaDati(this.datiTotaliDipendenti);
        }

        const datiPagina = this.paginazioneDipendenti.getDatiPagina();

        if (datiPagina.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" class="text-center">Nessun dipendente trovato</td>`;
            tbody.appendChild(row);
        } else {
            datiPagina.forEach(dipendente => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${dipendente.nome}</td>
                    <td>${dipendente.cognome}</td>
                    <td>${dipendente.email}</td>
                    <td>${dipendente.password}</td>
                    <td>${dipendente.ruolo}</td>
                    <td>
                        <button class="btn btn-sm btn-warning btnModificaDipendente" data-id="${dipendente.id}">Modifica</button>
                        <button class="btn btn-sm btn-danger btnEliminaDipendente" data-id="${dipendente.id}">Elimina</button>
                    </td>
                `;
                tbody.appendChild(row);

                row.querySelector('.btnModificaDipendente').addEventListener('click', () => this.modificaDipendente(dipendente.id));
                row.querySelector('.btnEliminaDipendente').addEventListener('click', () => this.eliminaDipendente(dipendente.id));
            });
        }

        this.paginazioneDipendenti.render(this.datiTotaliDipendenti, () => this.aggiornaTabellaDipendenti());

    } catch (error) {
        console.error('Errore nel caricamento tabella dipendenti:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Errore nel caricamento dei dati</td></tr>`;
    }
}

async aggiornaTabellaCommesse(filtro = '') {
    const tbody = document.querySelector('#commesseTable tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    try {
        if (this.datiTotaliCommesse.length === 0 || filtro) {
            this.datiTotaliCommesse = await this.firebaseService.getCollection("commesse");
            
            if (filtro) {
                const filtroLowerCase = filtro.toLowerCase();
                this.datiTotaliCommesse = this.datiTotaliCommesse.filter(commessa => 
                    commessa.nomeCommessa.toLowerCase().includes(filtroLowerCase) ||
                    commessa.cliente.toLowerCase().includes(filtroLowerCase)
                );
            }
            this.paginazioneCommesse.aggiornaDati(this.datiTotaliCommesse);
        }

        const datiPagina = this.paginazioneCommesse.getDatiPagina();

        if (datiPagina.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="3" class="text-center">Nessuna commessa trovata</td>`;
            tbody.appendChild(row);
        } else {
            datiPagina.forEach(commessa => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${commessa.nomeCommessa}</td>
                    <td>${commessa.cliente}</td>
                    <td>
                        <button class="btn btn-sm btn-warning btnModificaCommessa" data-id="${commessa.id}">Modifica</button>
                        <button class="btn btn-sm btn-danger btnEliminaCommessa" data-id="${commessa.id}">Elimina</button>
                    </td>
                `;
                tbody.appendChild(row);

                row.querySelector('.btnModificaCommessa').addEventListener('click', () => this.modificaCommessa(commessa.id));
                row.querySelector('.btnEliminaCommessa').addEventListener('click', () => this.eliminaCommessa(commessa.id));
            });
        }

        this.paginazioneCommesse.render(this.datiTotaliCommesse, () => this.aggiornaTabellaCommesse(filtro));

    } catch (error) {
        console.error('Errore nel caricamento tabella commesse:', error);
        tbody.innerHTML = `<tr><td colspan="3" class="text-center text-danger">Errore nel caricamento dei dati</td></tr>`;
    }
}

// Aggiungi queste proprietà al costruttore della classe OreLavorateApp


    async modificaOreLavorate(id) {
        try {
            const docRef = doc(this.firebaseService.db, "oreLavorate", id);
            const docSnap = await getDoc(docRef);

            if (!docSnap.exists()) {
                ErrorHandler.showNotification("Record non trovato", 'error');
                return;
            }

            const ore = docSnap.data();

            const nuovaCommessa = prompt("Inserisci la nuova commessa:", ore.commessa); 
            const nuovoNomeDipendente = prompt("Inserisci il nuovo nome del dipendente:", ore.nomeDipendente);
            const nuovoCognomeDipendente = prompt("Inserisci il nuovo cognome del dipendente:", ore.cognomeDipendente);
            const nuovaData = prompt("Inserisci la nuova data (YYYY-MM-DD):", ore.data);
            const nuovaOraInizio = prompt("Inserisci la nuova ora di inizio (HH:mm):", ore.oraInizio);
            const nuovaOraFine = prompt("Inserisci la nuova ora di fine (HH:mm):", ore.oraFine);
            const nuovaDescrizione = prompt("Inserisci la nuova descrizione:", ore.descrizione);
            const nuovaNonConformita = confirm("La non conformità è presente? (Annulla per No, OK per Sì)");

            if (nuovaCommessa && nuovoNomeDipendente && nuovoCognomeDipendente && nuovaData && 
                nuovaOraInizio && nuovaOraFine && nuovaDescrizione) {
                
                const controllo = await this.controllaOrariGiornata(nuovaData, nuovaOraInizio, nuovaOraFine, id);
                
                if (!controllo.valido) {
                    ErrorHandler.showNotification(controllo.errore, 'error');
                    return;
                }

                await this.firebaseService.updateDocument("oreLavorate", id, {
                    commessa: nuovaCommessa,
                    nomeDipendente: nuovoNomeDipendente,
                    cognomeDipendente: nuovoCognomeDipendente,
                    data: nuovaData,
                    oraInizio: nuovaOraInizio,
                    oraFine: nuovaOraFine,
                    descrizione: nuovaDescrizione,
                    nonConformita: nuovaNonConformita,
                });

                ErrorHandler.showNotification("Ore lavorate modificate con successo!", 'success');
                await this.aggiornaTabellaOreLavorate();
            }

        } catch (error) {
            ErrorHandler.handleError(error, 'modifica ore lavorate');
        }
    }

    async modificaDipendente(id) {
        try {
            const docRef = doc(this.firebaseService.db, "dipendenti", id);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                ErrorHandler.showNotification("Dipendente non trovato", 'error');
                return;
            }
            
            const dipendente = docSnap.data();

            const nuovoNome = prompt("Inserisci il nuovo nome:", dipendente.nome);
            const nuovoCognome = prompt("Inserisci il nuovo cognome:", dipendente.cognome);
            const nuovaEmail = prompt("Inserisci la nuova email:", dipendente.email);
            const nuovaPassword = prompt("Inserisci la nuova password:", dipendente.password);
            const nuovoRuolo = prompt("Inserisci il nuovo ruolo:", dipendente.ruolo);

            if (nuovoNome && nuovoCognome && nuovaEmail && nuovaPassword && nuovoRuolo) {
                await this.firebaseService.updateDocument("dipendenti", id, {
                    nome: nuovoNome,
                    cognome: nuovoCognome,
                    email: nuovaEmail,
                    password: nuovaPassword,
                    ruolo: nuovoRuolo
                });
                ErrorHandler.showNotification("Dipendente modificato con successo!", 'success');
                await this.aggiornaTabellaDipendenti();
            }
        } catch (error) {
            ErrorHandler.handleError(error, 'modifica dipendente');
        }
    }

    async modificaCommessa(id) {
        try {
            const docRef = doc(this.firebaseService.db, "commesse", id);
            const docSnap = await getDoc(docRef);
            
            if (!docSnap.exists()) {
                ErrorHandler.showNotification("Commessa non trovata", 'error');
                return;
            }
            
            const commessa = docSnap.data();

            const nuovoNomeCommessa = prompt("Inserisci il nuovo nome della commessa:", commessa.nomeCommessa);
            const nuovoCliente = prompt("Inserisci il nuovo cliente:", commessa.cliente);

            if (nuovoNomeCommessa && nuovoCliente) {
                await this.firebaseService.updateDocument("commesse", id, {
                    nomeCommessa: nuovoNomeCommessa,
                    cliente: nuovoCliente
                });
                ErrorHandler.showNotification("Commessa modificata con successo!", 'success');
                await this.aggiornaTabellaCommesse();
            }
        } catch (error) {
            ErrorHandler.handleError(error, 'modifica commessa');
        }
    }

    async eliminaOreLavorate(id) {
        if (confirm("Sei sicuro di voler eliminare queste ore lavorate?")) {
            try {
                await this.firebaseService.deleteDocument("oreLavorate", id);
                ErrorHandler.showNotification("Ore lavorate eliminate con successo!", 'success');
                await this.aggiornaTabellaOreLavorate();
            } catch (error) {
                ErrorHandler.handleError(error, 'eliminazione ore lavorate');
            }
        }
    }

    async eliminaDipendente(id) {
        if (confirm("Sei sicuro di voler eliminare questo dipendente?")) {
            try {
                await this.firebaseService.deleteDocument("dipendenti", id);
                ErrorHandler.showNotification("Dipendente eliminato con successo!", 'success');
                await this.aggiornaTabellaDipendenti();
            } catch (error) {
                ErrorHandler.handleError(error, 'eliminazione dipendente');
            }
        }
    }

    async eliminaCommessa(id) {
        if (confirm("Sei sicuro di voler eliminare questa commessa?")) {
            try {
                await this.firebaseService.deleteDocument("commesse", id);
                ErrorHandler.showNotification("Commessa eliminata con successo!", 'success');
                await this.aggiornaTabellaCommesse();
                await this.aggiornaMenuCommesse();
            } catch (error) {
                ErrorHandler.handleError(error, 'eliminazione commessa');
            }
        }
    }

   async controllaOrariGiornata(data, nuovaOraInizio, nuovaOraFine, idEscluso = null) {
    try {
        if (nuovaOraInizio < CONSTANTS.ORARIO_PAUSA_FINE && nuovaOraFine > CONSTANTS.ORARIO_PAUSA_INIZIO) {
            return {
                valido: false,
                errore: `Impossibile registrare ore durante la pausa pranzo (${CONSTANTS.ORARIO_PAUSA_INIZIO} - ${CONSTANTS.ORARIO_PAUSA_FINE})`
            };
        }

        const oreEsistenti = await this.firebaseService.getCollection("oreLavorate");
        
        // CONTROLLO RINFORZATO: usa nome E cognome per identificare il dipendente
        const nomeCorrente = stateManager.currentUser.name.split(" ")[0];
        const cognomeCorrente = stateManager.currentUser.name.split(" ").slice(1).join(" ");
        
        const oreFiltrate = oreEsistenti.filter(ore => {
            const corrispondeData = ore.data === data;
            const corrispondeNome = ore.nomeDipendente === nomeCorrente;
            const corrispondeCognome = ore.cognomeDipendente === cognomeCorrente;
            const nonEscluso = ore.id !== idEscluso;
            
            return corrispondeData && corrispondeNome && corrispondeCognome && nonEscluso;
        });

        console.log("Ore esistenti per", stateManager.currentUser.name, "in data", data, ":", oreFiltrate.length);

        for (const oreEsistente of oreFiltrate) {
            const sovrappone = Utils.siSovrappongono(
                nuovaOraInizio, nuovaOraFine,
                oreEsistente.oraInizio, oreEsistente.oraFine
            );
            
            if (sovrappone) {
                return {
                    valido: false,
                    errore: `Sovrapposizione con fascia oraria esistente: ${oreEsistente.oraInizio} - ${oreEsistente.oraFine}`
                };
            }
        }

        return { valido: true };
    } catch (error) {
        ErrorHandler.handleError(error, 'controllo orari');
        return {
            valido: false,
            errore: "Errore di sistema durante il controllo degli orari"
        };
    }
}
async verificaDatiDipendente() {
    try {
        const tutteLeOre = await this.firebaseService.getCollection("oreLavorate");
        console.log("Tutte le ore nel database:", tutteLeOre);
        
        const oreDipendenteCorrente = tutteLeOre.filter(ore => 
            ore.nomeDipendente === stateManager.currentUser.name.split(" ")[0] &&
            ore.cognomeDipendente === stateManager.currentUser.name.split(" ").slice(1).join(" ")
        );
        
        console.log("Ore del dipendente corrente:", oreDipendenteCorrente);
        
    } catch (error) {
        console.error("Errore verifica dati:", error);
    }
}

    getFiltriAttivi() {
        return {
            commessa: document.getElementById('filtroCommessa')?.value.trim() || '',
            dipendente: document.getElementById('filtroDipendente')?.value.trim() || '',
            anno: document.getElementById('filtroAnno')?.value || '',
            mese: document.getElementById('filtroMese')?.value || '',
            giorno: document.getElementById('filtroGiorno')?.value || '',
            nonConformita: document.getElementById('filtroNonConformita')?.checked || false
        };
    }

async applicaFiltri() {
    try {
        const filtri = this.getFiltriAttivi();
        const datiFiltrati = await this.firebaseService.getOreLavorateFiltrate(filtri);
        
        // MEMORIZZA i dati filtrati per il PDF
        stateManager.datiFiltrati = datiFiltrati;
        this.datiTotaliOre = datiFiltrati;
        this.paginazioneOre.aggiornaDati(datiFiltrati);
        
        await this.aggiornaTabellaOreLavorate(datiFiltrati);
        ErrorHandler.showNotification(`Filtri applicati con successo (${datiFiltrati.length} record trovati)`, 'success');
    } catch (error) {
        ErrorHandler.handleError(error, 'applicazione filtri');
    }
}

    async resetFiltri() {
    try {
        document.getElementById('filtroCommessa').value = "";
        document.getElementById('filtroDipendente').value = "";
        document.getElementById('filtroAnno').value = new Date().getFullYear().toString();
        document.getElementById('filtroMese').value = "";
        document.getElementById('filtroGiorno').value = "";
        document.getElementById('filtroNonConformita').checked = false;

        this.aggiornaGiorni();
        
        // RESETTA anche i dati filtrati
        stateManager.datiFiltrati = null;
        
        // Ricarica tutti i dati senza filtri
        this.datiTotaliOre = await this.firebaseService.getCollection("oreLavorate");
        this.paginazioneOre.aggiornaDati(this.datiTotaliOre);
        await this.aggiornaTabellaOreLavorate();
        
        ErrorHandler.showNotification("Filtri resettati", 'info');
    } catch (error) {
        ErrorHandler.handleError(error, 'reset filtri');
    }
}

    aggiornaGiorni() {
        const mese = document.getElementById('filtroMese')?.value;
        const anno = document.getElementById('filtroAnno')?.value;
        const giornoSelect = document.getElementById('filtroGiorno');
        
        if (!giornoSelect) return;
        
        giornoSelect.innerHTML = '<option value="">Tutti i giorni</option>';
        
        if (mese && anno) {
            const giorniNelMese = new Date(anno, mese, 0).getDate();
            
            for (let i = 1; i <= giorniNelMese; i++) {
                const giorno = i < 10 ? `0${i}` : `${i}`;
                const option = document.createElement('option');
                option.value = giorno;
                option.textContent = i;
                giornoSelect.appendChild(option);
            }
        }
    }

async generaPDFFiltrato() {
    try {
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            ErrorHandler.showNotification("jsPDF non trovato. Assicurati che sia incluso nella pagina.", 'error');
            return;
        }

        // USA I DATI FILTRATI invece di tutti i dati
        let oreFiltrate;
        
        // Se ci sono dati filtrati attivi, usali
        if (stateManager.datiFiltrati && stateManager.datiFiltrati.length > 0) {
            oreFiltrate = stateManager.datiFiltrati;
            console.log("PDF: usando dati filtrati", oreFiltrate.length, "record");
        } 
        // Altrimenti applica i filtri correnti
        else {
            const filtri = this.getFiltriAttivi();
            oreFiltrate = await this.firebaseService.getOreLavorateFiltrate(filtri);
            console.log("PDF: applicando filtri correnti", oreFiltrate.length, "record");
        }

        // Se non ci sono dati, mostra un messaggio
        if (!oreFiltrate || oreFiltrate.length === 0) {
            ErrorHandler.showNotification("Nessun dato da esportare con i filtri attuali", 'warning');
            return;
        }

        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        // Titolo dinamico in base ai filtri
        const titolo = this.generaTitoloPDF();
        doc.setFontSize(18);
        doc.text(titolo, 14, 20);

        // Aggiungi informazioni sui filtri applicati
        const infoFiltri = this.generaInfoFiltri();
        if (infoFiltri) {
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            doc.text(infoFiltri, 14, 28);
            doc.setTextColor(0, 0, 0); // Ripristina colore nero
        }

        doc.autoTable({
            startY: infoFiltri ? 35 : 25,
            head: [['Commessa', 'Dipendente', 'Data', 'Ora Inizio', 'Ora Fine', 'Descrizione', 'Ore Lavorate', 'Non Conformità']],  
            body: oreFiltrate.map(ore => [
                ore.commessa,
                `${ore.nomeDipendente} ${ore.cognomeDipendente}`,
                ore.data,
                ore.oraInizio,
                ore.oraFine,
                ore.descrizione,
                Utils.formattaOreDecimali(Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine)),
                ore.nonConformita ? 'Sì' : 'No'
            ]),
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            margin: { top: 20 }
        });

        // Calcola e aggiungi i totali
        this.aggiungiTotaliPDF(doc, oreFiltrate);

        // Nome file dinamico
        const nomeFile = this.generaNomeFilePDF();
        doc.save(nomeFile);
        
        ErrorHandler.showNotification(`PDF generato con successo (${oreFiltrate.length} record)`, 'success');
        
    } catch (error) {
        ErrorHandler.handleError(error, 'generazione PDF');
    }
}

// Aggiungi questi metodi helper per migliorare il PDF
generaTitoloPDF() {
    const filtri = this.getFiltriAttivi();
    let titolo = "Report Ore Lavorate";
    
    if (filtri.commessa) {
        titolo += ` - Commessa: ${filtri.commessa}`;
    }
    if (filtri.dipendente) {
        titolo += ` - Dipendente: ${filtri.dipendente}`;
    }
    if (filtri.nonConformita) {
        titolo += " - Solo Non Conformità";
    }
    
    return titolo;
}

generaInfoFiltri() {
    const filtri = this.getFiltriAttivi();
    const info = [];
    
    if (filtri.anno) {
        info.push(`Anno: ${filtri.anno}`);
    }
    if (filtri.mese) {
        const mesi = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", 
                     "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
        const nomeMese = mesi[parseInt(filtri.mese) - 1];
        info.push(`Mese: ${nomeMese}`);
    }
    if (filtri.giorno) {
        info.push(`Giorno: ${filtri.giorno}`);
    }
    
    return info.length > 0 ? `Filtri applicati: ${info.join(', ')}` : '';
}

aggiungiTotaliPDF(doc, oreFiltrate) {
    const totaleOre = Utils.calcolaTotaleGenerale(oreFiltrate);
    const totaleFormattato = Utils.formattaOreDecimali(totaleOre);
    
    // Calcola ore per dipendente
    const orePerDipendente = {};
    oreFiltrate.forEach(ore => {
        const dipendente = `${ore.nomeDipendente} ${ore.cognomeDipendente}`;
        const oreLavorate = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
        
        if (!orePerDipendente[dipendente]) {
            orePerDipendente[dipendente] = 0;
        }
        orePerDipendente[dipendente] += oreLavorate;
    });

    const startY = doc.lastAutoTable.finalY + 10;
    
    // Totale generale
    doc.setFontSize(12);
    doc.setTextColor(41, 128, 185);
    doc.text(`Totale ore lavorate: ${totaleFormattato}`, 14, startY);
    
    // Ore per dipendente (se più di un dipendente)
    if (Object.keys(orePerDipendente).length > 1) {
        let yPos = startY + 8;
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text("Ore per dipendente:", 14, yPos);
        
        yPos += 5;
        Object.entries(orePerDipendente).forEach(([dipendente, ore]) => {
            const oreFormattate = Utils.formattaOreDecimali(ore);
            doc.text(`• ${dipendente}: ${oreFormattate} ore`, 20, yPos);
            yPos += 4;
        });
    }
}

generaNomeFilePDF() {
    const filtri = this.getFiltriAttivi();
    let nomeFile = 'ore_lavorate';
    
    if (filtri.commessa) {
        nomeFile += `_${filtri.commessa.replace(/\s+/g, '_')}`;
    }
    if (filtri.dipendente) {
        nomeFile += `_${filtri.dipendente.replace(/\s+/g, '_')}`;
    }
    if (filtri.anno) {
        nomeFile += `_${filtri.anno}`;
    }
    if (filtri.mese) {
        nomeFile += `_${filtri.mese}`;
    }
    if (filtri.nonConformita) {
        nomeFile += '_non_conformita';
    }
    
    return `${nomeFile}.pdf`;
}

    async mostraTabellaMensile() {
        const selettoreMese = document.getElementById('selettoreMese');
        const meseSelezionato = parseInt(selettoreMese.value);
        const nomeMese = CONSTANTS.MESI[meseSelezionato];

        const tabelleMensili = document.getElementById('tabelleMensili');
        tabelleMensili.style.display = 'block';

        await this.generaTabellaMensile(meseSelezionato + 1, nomeMese);
    }

    async generaTabellaMensile(meseNumero, nomeMese) {
        const tabelleMensili = document.getElementById('tabelleMensili');
        tabelleMensili.innerHTML = '';

        const divMese = document.createElement('div');
        divMese.className = 'tabellaMese card mb-4';
        divMese.innerHTML = `
            <div class="card-header d-flex justify-content-between align-items-center">
                <h3 class="card-title mb-0">${nomeMese}</h3>
                <button class="btn btn-success btn-sm" id="btnScaricaCSV-${meseNumero}">
                    <i class="fas fa-download"></i> Scarica CSV
                </button>
            </div>
            <div class="card-body">
                <div class="table-responsive">
                    <table class="table table-bordered table-sm">
                        <thead class="table-light">
                            <tr>
                                <th>Dipendente</th>
                                ${Array.from({ length: 31 }, (_, i) => `<th class="text-center">${i + 1}</th>`).join('')}
                                <th class="text-center">Totale Mensile</th>
                            </tr>
                        </thead>
                        <tbody></tbody>
                    </table>
                </div>
            </div>
        `;

        tabelleMensili.appendChild(divMese);

        // Aggiungi event listener al pulsante CSV
        const btnScaricaCSV = document.getElementById(`btnScaricaCSV-${meseNumero}`);
        if (btnScaricaCSV) {
            btnScaricaCSV.addEventListener('click', () => this.scaricaCSV(nomeMese, meseNumero));
        }

        await this.popolaTabellaMensile(meseNumero, divMese.querySelector('tbody'));
    }

    async popolaTabellaMensile(meseNumero, tbody) {
        const datiOreLavorate = await this.firebaseService.getCollection("oreLavorate");
        const datiPerDipendente = {};

        datiOreLavorate.forEach(ore => {
            const data = new Date(ore.data);
            if (data.getMonth() + 1 === meseNumero) {
                const dipendenteKey = `${ore.nomeDipendente} ${ore.cognomeDipendente}`;
                if (!datiPerDipendente[dipendenteKey]) {
                    datiPerDipendente[dipendenteKey] = {
                        oreGiornaliere: Array(31).fill(0),
                        totaleMensile: 0
                    };
                }
                const giorno = data.getDate() - 1;
                const oreLavorate = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
                datiPerDipendente[dipendenteKey].oreGiornaliere[giorno] += oreLavorate;
                datiPerDipendente[dipendenteKey].totaleMensile += oreLavorate;
            }
        });

        Object.entries(datiPerDipendente).forEach(([dipendente, dati]) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><strong>${dipendente}</strong></td>
                ${dati.oreGiornaliere.map(ore => 
                    `<td class="text-center ${ore > 0 ? 'table-success' : ''}">${ore > 0 ? Utils.formattaOreDecimali(ore) : ''}</td>`
                ).join('')}
                <td class="text-center table-primary"><strong>${Utils.formattaOreDecimali(dati.totaleMensile)}</strong></td>
            `;
            tbody.appendChild(row);
        });
    }

    async scaricaCSV(mese, meseNumero) {
        try {
            console.log("Recupero dati per il mese:", mese, meseNumero);

            const datiOreLavorate = await this.firebaseService.getCollection("oreLavorate");
            const datiMese = datiOreLavorate.filter(ore => {
                const data = new Date(ore.data);
                return data.getMonth() + 1 === meseNumero;
            });

            const datiPerDipendente = {};
            datiMese.forEach(ore => {
                const dipendenteKey = `${ore.nomeDipendente} ${ore.cognomeDipendente}`;
                if (!datiPerDipendente[dipendenteKey]) {
                    datiPerDipendente[dipendenteKey] = {
                        oreGiornaliere: Array(31).fill(0),
                        totaleMensile: 0
                    };
                }
                const dataOre = new Date(ore.data);
                const giorno = dataOre.getDate() - 1;
                const oreLavorate = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
                datiPerDipendente[dipendenteKey].oreGiornaliere[giorno] += oreLavorate;
                datiPerDipendente[dipendenteKey].totaleMensile += oreLavorate;
            });

            // Funzione per determinare se un giorno è sabato o domenica
            function isWeekend(year, month, day) {
                const date = new Date(year, month - 1, day);
                const dayOfWeek = date.getDay();
                return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Domenica, 6 = Sabato
            }

            // Ottieni l'anno corrente
            const currentYear = new Date().getFullYear();

            // Intestazione CSV con giorni evidenziati
            const header = [
                "Dipendente".padEnd(20, " "),
                ...Array.from({ length: 31 }, (_, i) => {
                    const day = i + 1;
                    const isNonLavorativo = isWeekend(currentYear, meseNumero, day);
                    return `${day}${isNonLavorativo ? '*' : ''}`.padStart(8, " ");
                }),
                "Totale Mensile".padStart(12, " ")
            ].join(";");

            // Righe CSV con giorni non lavorativi evidenziati
            const rows = Object.entries(datiPerDipendente).map(([dipendente, dati]) => {
                const oreFormattate = dati.oreGiornaliere.map((ore, index) => {
                    const day = index + 1;
                    const isNonLavorativo = isWeekend(currentYear, meseNumero, day);
                    const oreStr = ore > 0 ? Utils.formattaOreDecimali(ore) : isNonLavorativo ? 'FESTIVO' : '';
                    return oreStr.padStart(8, " ");
                });
                
                return [
                    dipendente.padEnd(20, " "),
                    ...oreFormattate,
                    Utils.formattaOreDecimali(dati.totaleMensile).padStart(12, " ")
                ].join(";");
            });

            // Calcolo totale mensile
            const totaleMensileGenerale = Object.values(datiPerDipendente).reduce((totale, dati) => totale + dati.totaleMensile, 0);

            // Creazione contenuto CSV
            const csvContent = [
                `Report Ore Lavorate - ${mese} ${currentYear}`,
                "=".repeat(header.length),
                header,
                "-".repeat(header.length),
                ...rows,
                "-".repeat(header.length),
                [
                    "Totale Generale".padEnd(20, " "),
                    ...Array(31).fill("".padStart(8, " ")),
                    Utils.formattaOreDecimali(totaleMensileGenerale).padStart(12, " ")
                ].join(";"),
                "",
                "* I giorni contrassegnati con asterisco sono sabato/domenica",
                "FESTIVO = Giorno non lavorativo (sabato/domenica)"
            ].join("\n");

            // Download del file
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `ore_lavorate_${mese}_${currentYear}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            
            ErrorHandler.showNotification(`CSV per ${mese} scaricato con successo!`, 'success');
        } catch (error) {
            ErrorHandler.handleError(error, 'scarica CSV');
        }
    }

    async filtraNonConformita() {
        try {
            const filtri = this.getFiltriAttivi();
            filtri.nonConformita = true;
            stateManager.datiFiltrati = await this.firebaseService.getOreLavorateFiltrate(filtri);
            this.paginazioneOre.reset();
            await this.aggiornaTabellaOreLavorate(stateManager.datiFiltrati);
            ErrorHandler.showNotification("Mostrate solo le non conformità", 'info');
        } catch (error) {
            ErrorHandler.handleError(error, 'filtro non conformità');
        }
    }

    async mostraTutti() {
        try {
            stateManager.datiFiltrati = await this.firebaseService.getCollection("oreLavorate");
            this.paginazioneOre.reset();
            await this.aggiornaTabellaOreLavorate(stateManager.datiFiltrati);
            ErrorHandler.showNotification("Mostrati tutti i record", 'info');
        } catch (error) {
            ErrorHandler.handleError(error, 'mostra tutti');
        }
    }
    // Aggiungi questi metodi alla classe OreLavorateApp

async setupVisualizzazioneFasce() {
    const dataInput = document.getElementById('oreData');
    if (dataInput) {
        // Aggiorna quando cambia la data
        dataInput.addEventListener('change', async () => {
            const dataSelezionata = dataInput.value;
            await this.aggiornaVisualizzazioneFasce(dataSelezionata);
        });

        // Aggiorna anche quando il form viene mostrato
        document.addEventListener('DOMContentLoaded', async () => {
            const dataCorrente = dataInput.value;
            if (dataCorrente) {
                await this.aggiornaVisualizzazioneFasce(dataCorrente);
            }
        });
    }
}

async aggiornaVisualizzazioneFasce(data) {
    const container = document.getElementById('visualizzazioneFasce');
    const fasceElement = document.getElementById('fasceOccupate');
    
    if (!container || !fasceElement) return;
    
    if (!data) {
        container.style.display = 'none';
        return;
    }
    
    try {
        const oreGiornata = await this.getFasceOccupateGiornata(data);
        container.style.display = 'block';
        fasceElement.innerHTML = '';
        
        // Formatta la data in italiano
        const dataFormattata = this.formattaDataItaliana(data);
        
        if (oreGiornata.length === 0) {
            fasceElement.innerHTML = `
                <div class="fascia-oraria fascia-libera">
                    ✅ <strong>${dataFormattata} - Giornata libera</strong><br>
                    <small>Nessuna fascia oraria occupata per questa data</small>
                </div>
            `;
            return;
        }
        
        // Header con data e riepilogo
        const headerDiv = document.createElement('div');
        headerDiv.className = 'fasce-header';
        headerDiv.innerHTML = `
            <strong>${dataFormattata} - Fasce Orarie Occupate:</strong>
            <span class="badge">${oreGiornata.length} fascia(e) occupata(e)</span>
        `;
        fasceElement.appendChild(headerDiv);
        
        // Mostra le fasce occupate
        oreGiornata.forEach((ore, index) => {
            const oreLavorate = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
            const fasciaDiv = document.createElement('div');
            fasciaDiv.className = 'fascia-oraria fascia-occupata';
            fasciaDiv.innerHTML = `
                <div class="fascia-header">
                    <span class="fascia-numero">${index + 1}</span>
                    ⏰ <strong>${ore.oraInizio} - ${ore.oraFine}</strong>
                    <span class="fascia-ore">(${Utils.formattaOreDecimali(oreLavorate)} ore)</span>
                </div>
                <div class="fascia-dettagli">
                    <strong>Commessa:</strong> ${ore.commessa}<br>
                    <strong>Descrizione:</strong> ${ore.descrizione}
                    ${ore.nonConformita ? '<br><span class="badge-nonconformita">⚠️ Non Conformità</span>' : ''}
                </div>
            `;
            fasceElement.appendChild(fasciaDiv);
        });
        
        // Calcola totale ore giornata
        const totaleGiornata = oreGiornata.reduce((totale, ore) => {
            return totale + Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
        }, 0);
        
        // Footer con totale
        const footerDiv = document.createElement('div');
        footerDiv.className = 'fasce-footer';
        footerDiv.innerHTML = `
            <strong>Totale giornata:</strong> ${Utils.formattaOreDecimali(totaleGiornata)} ore
        `;
        fasceElement.appendChild(footerDiv);
        
        // Aggiungi timeline visiva
        this.creaTimelineGiornata(oreGiornata);
        
    } catch (error) {
        console.error("Errore nell'aggiornamento fasce:", error);
        fasceElement.innerHTML = `
            <div class="fascia-oraria fascia-errore">
                ❌ <strong>Errore nel caricamento delle fasce orarie</strong><br>
                <small>Riprova più tardi</small>
            </div>
        `;
    }
}


async getFasceOccupateGiornata(data) {
    try {
        const tutteLeOre = await this.firebaseService.getCollection("oreLavorate");
        const oreGiornata = tutteLeOre.filter(ore => {
            // Filtra per data e per dipendente corrente
            const corrispondeData = ore.data === data;
            const corrispondeDipendente = ore.nomeDipendente === stateManager.currentUser?.name?.split(" ")[0];
            return corrispondeData && corrispondeDipendente;
        });
        
        // Ordina per ora di inizio
        oreGiornata.sort((a, b) => a.oraInizio.localeCompare(b.oraInizio));
        
        return oreGiornata;
    } catch (error) {
        console.error("Errore nel recupero fasce occupate:", error);
        return [];
    }
}

formattaDataItaliana(dataString) {
    const data = new Date(dataString + 'T00:00:00');
    const giorni = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    const mesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 
                  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    
    const giornoSettimana = giorni[data.getDay()];
    const giorno = data.getDate();
    const mese = mesi[data.getMonth()];
    const anno = data.getFullYear();
    
    return `${giornoSettimana} ${giorno} ${mese} ${anno}`;
}

creaTimelineGiornata(oreOccupate) {
    const container = document.getElementById('fasceOccupate');
    if (!container || oreOccupate.length === 0) return;
    
    const timelineContainer = document.createElement('div');
    timelineContainer.className = 'timeline-container';
    timelineContainer.innerHTML = '<div class="timeline-title">Timeline Giornata:</div>';
    
    const timeline = document.createElement('div');
    timeline.className = 'timeline-giornata';
    
    // Aggiungi la pausa pranzo fissa
    const pausaPranzo = document.createElement('div');
    pausaPranzo.className = 'pausa-timeline';
    pausaPranzo.title = 'Pausa Pranzo 12:00-13:00';
    timeline.appendChild(pausaPranzo);
    
    // Aggiungi le fasce occupate
    oreOccupate.forEach(ore => {
        const fasciaOccupata = document.createElement('div');
        fasciaOccupata.className = 'fascia-occupata-timeline';
        fasciaOccupata.style.left = this.calcolaPosizioneTimeline(ore.oraInizio) + '%';
        fasciaOccupata.style.width = this.calcolaLarghezzaTimeline(ore.oraInizio, ore.oraFine) + '%';
        fasciaOccupata.title = `${ore.oraInizio}-${ore.oraFine}: ${ore.commessa}`;
        timeline.appendChild(fasciaOccupata);
    });
    
    timelineContainer.appendChild(timeline);
    container.appendChild(timelineContainer);
}

calcolaPosizioneTimeline(ora) {
    const [ore, minuti] = ora.split(':').map(Number);
    const minutiTotali = ore * 60 + minuti;
    // Considera giornata dalle 6:00 alle 20:00 (840 minuti)
    return ((minutiTotali - 360) / 840) * 100;
}

calcolaLarghezzaTimeline(oraInizio, oraFine) {
    const posInizio = this.calcolaPosizioneTimeline(oraInizio);
    const posFine = this.calcolaPosizioneTimeline(oraFine);
    return Math.max(posFine - posInizio, 2); // Minimo 2% di larghezza
}

setupControlliTempoReale() {
    const oraInizioInput = document.getElementById('oreInizio');
    const oraFineInput = document.getElementById('oreFine');
    const dataInput = document.getElementById('oreData');
    
    if (!oraInizioInput || !oraFineInput || !dataInput) return;
    
    // Controlla quando cambia la data
    dataInput.addEventListener('change', async () => {
        const dataSelezionata = dataInput.value;
        await this.aggiornaVisualizzazioneFasce(dataSelezionata);
    });
    
    // Controlla in tempo reale la pausa pranzo
    [oraInizioInput, oraFineInput].forEach(input => {
        input.addEventListener('change', () => {
            this.controllaPausaPranzoTempoReale();
        });
        
        input.addEventListener('input', () => {
            this.controllaPausaPranzoTempoReale();
        });
    });
}

controllaPausaPranzoTempoReale() {
    const oraInizio = document.getElementById('oreInizio')?.value;
    const oraFine = document.getElementById('oreFine')?.value;
    
    if (!oraInizio || !oraFine) return;
    
    // Controlla se gli orari sovrappongono la pausa pranzo
    if ((oraInizio < CONSTANTS.ORARIO_PAUSA_FINE && oraFine > CONSTANTS.ORARIO_PAUSA_INIZIO)) {
        ErrorHandler.showNotification(
            `ATTENZIONE: Orario selezionato sovrappone la pausa pranzo (${CONSTANTS.ORARIO_PAUSA_INIZIO} - ${CONSTANTS.ORARIO_PAUSA_FINE})`, 
            'warning'
        );
    }
}
}

// Inizializza l'app quando il DOM è pronto
document.addEventListener('DOMContentLoaded', () => {
    new OreLavorateApp();
});

// Popola gli anni disponibili all'avvio
function popolaAnni() {
    const annoSelect = document.getElementById('filtroAnno');
    if (!annoSelect) return;
    
    const annoCorrente = new Date().getFullYear();
    
    // Svuota le opzioni esistenti
    annoSelect.innerHTML = '';
    
    for (let i = annoCorrente - 5; i <= annoCorrente + 2; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = i;
        if (i === annoCorrente) {
            option.selected = true;
        }
        annoSelect.appendChild(option);
    }
}

document.addEventListener('DOMContentLoaded', popolaAnni);
