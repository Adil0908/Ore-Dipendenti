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
// Costanti per fornitori
const COSTANTI_FORNITORI = {
    RIGHE_PER_PAGINA: 5
};

const ADMIN_CREDENTIALS = {
    email: 'eliraoui.a@union14.it',
    password: 'Eliraoui0101!',
    ruolo: 'admin'
};
const TARIFFA_ORARIA = 28.50;
const COSTO_ORARIO_NON_CONFORMITA = 28.50; 
const TARIFFA_ORARIA_INTEGRAZIONE = 28.50;
// Poi rendile disponibili globalmente
window.TARIFFA_ORARIA = TARIFFA_ORARIA;
window.COSTO_ORARIO_NON_CONFORMITA = COSTO_ORARIO_NON_CONFORMITA;
window.TARIFFA_ORARIA_INTEGRAZIONE = TARIFFA_ORARIA_INTEGRAZIONE;


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
// VERIFICA INIZIALE DELLE LIBRERIE PDF
console.log('=== VERIFICA LIBRERIE PDF ===');
console.log('window.jspdf:', typeof window.jspdf);
console.log('window.jspdf.jsPDF:', window.jspdf?.jsPDF);
console.log('window.jspdf.jsPDF.autoTable:', window.jspdf?.jsPDF?.autoTable);

if (window.jspdf && window.jspdf.jsPDF) {
    console.log('✅ jsPDF caricato correttamente');
    const { jsPDF } = window.jspdf;
    if (jsPDF.autoTable) {
        console.log('✅ autoTable caricato correttamente');
    } else {
        console.error('❌ autoTable NON caricato');
    }
} else {
    console.error('❌ jsPDF NON caricato');
}

// utils.js
class Utils {
    static calcolaOreLavorate(oraInizio, oraFine) {
    // Controlli di sicurezza
    if (!oraInizio || !oraFine) {
        console.warn("Orari mancanti:", { oraInizio, oraFine });
        return 0;
    }
    
    // Funzione per normalizzare l'orario
    const normalizzaOra = (ora) => {
        if (!ora || typeof ora !== 'string') return null;
        
        // Rimuovi spazi
        ora = ora.trim();
        
        // Se è vuoto
        if (ora === '') return null;
        
        // CORREZIONE: "24:00" -> "23:59"
        if (ora === "24:00" || ora === "24:00:00") {
            return "23:59";
        }
        
        // Pattern per HH:MM
        const patternCompleto = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
        if (patternCompleto.test(ora)) {
            return ora;
        }
        
        // Pattern per H:MM (es: "8:30")
        const patternCorto = /^([0-9]):([0-5][0-9])$/;
        if (patternCorto.test(ora)) {
            return '0' + ora;
        }
        
        // Pattern per HH (es: "8")
        const patternOraSola = /^([0-9]|1[0-9]|2[0-3])$/;
        if (patternOraSola.test(ora)) {
            return `${ora.padStart(2, '0')}:00`;
        }
        
        // Se non corrisponde a nessun pattern
        console.warn(`Formato orario non riconosciuto: "${ora}"`);
        return null;
    };
    
    const inizioNormalizzato = normalizzaOra(oraInizio);
    const fineNormalizzato = normalizzaOra(oraFine);
    
    if (!inizioNormalizzato || !fineNormalizzato) {
        console.error("Formato orario non valido:", { 
            originale: { inizio: oraInizio, fine: oraFine },
            corretto: { inizio: inizioNormalizzato, fine: fineNormalizzato }
        });
        return 0;
    }

    const toMinutes = (time) => {
        const [ore, minuti] = time.split(':').map(Number);
        return ore * 60 + minuti;
    };

    const minutiInizio = toMinutes(inizioNormalizzato);
    const minutiFine = toMinutes(fineNormalizzato);
    let differenzaMinuti = minutiFine - minutiInizio;

    if (differenzaMinuti < 0) differenzaMinuti += 24 * 60;
    
    // Arrotonda a 2 decimali
    return Math.round((differenzaMinuti / 60) * 100) / 100;
}

    static formattaOreDecimali(oreDecimali) {
        const ore = Math.floor(oreDecimali);
        const minuti = Math.round((oreDecimali - ore) * 60);
        return `${ore}:${String(minuti).padStart(2, '0')}`;
    }

    static isValidTimeFormat(time) {
    if (!time || typeof time !== 'string') return false;
    // Formato HH:MM
    return /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(time);
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
        
        if (numeroPagine <= 1) {
            this.container.innerHTML = '';
            return;
        }
        
        this.container.innerHTML = `
            <div class="pagination-controls d-flex justify-content-center align-items-center gap-2 flex-wrap">
                <button id="btnPrecedenteCommesse" class="btn btn-outline-primary btn-sm" ${this.paginaCorrente === 1 ? 'disabled' : ''}>
                    ‹ Precedente
                </button>
                <div id="numeriPaginaCommesse" class="d-flex gap-1"></div>
                <button id="btnSuccessivaCommesse" class="btn btn-outline-primary btn-sm" ${this.paginaCorrente === numeroPagine ? 'disabled' : ''}>
                    Successiva ›
                </button>
                <span class="ms-2 text-muted small">Pagina ${this.paginaCorrente} di ${numeroPagine} (${this.datiTotali.length} record)</span>
            </div>
        `;

        const numeriPagina = this.container.querySelector('#numeriPaginaCommesse');
        
        let startPage = Math.max(1, this.paginaCorrente - 3);
        let endPage = Math.min(numeroPagine, startPage + 6);
        
        if (endPage - startPage < 6) {
            startPage = Math.max(1, endPage - 6);
        }

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
                ellipsis.className = 'px-1';
                numeriPagina.appendChild(ellipsis);
            }
        }

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

        if (endPage < numeroPagine) {
            if (endPage < numeroPagine - 1) {
                const ellipsis = document.createElement('span');
                ellipsis.textContent = '...';
                ellipsis.className = 'px-1';
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

        this.container.querySelector('#btnPrecedenteCommesse')?.addEventListener('click', () => {
            if (this.paginaCorrente > 1) {
                this.paginaCorrente--;
                this.aggiornaPaginazione();
            }
        });

        this.container.querySelector('#btnSuccessivaCommesse')?.addEventListener('click', () => {
            if (this.paginaCorrente < numeroPagine) {
                this.paginaCorrente++;
                this.aggiornaPaginazione();
            }
        });
    }

    aggiornaPaginazione() {
        if (this.callbackAggiornaTabella) {
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

    aggiornaDati(nuoviDati) {
        this.datiTotali = nuoviDati || [];
        this.paginaCorrente = 1;
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
        // Proprietà per paginazione grafici
        this.paginaMarginiCorrente = 1;
        this.paginaOreCorrente = 1;
        this.elementiPerPagina = 15; // Numero di elementi per pagina
        this.tuttiMargini = [];
        this.tutteOreDipendenti = [];
          // Proprietà per filtri grafici
        this.filtroMargini = { anno: '', mese: '' };
        this.filtroOreDipendenti = { anno: '', mese: '' };
        
        // NUOVA PROPRIETÀ: controllo aggiornamenti duplicati
        this.aggiornamentoInCorso = false;
         this.datiTotaliFornitori = [];  // AGGIUNGI QUESTA
        // PROPRIETÀ PER DEBOUNCE FILTRI
        this.filtroTimeout = null;
        
        this.init();
    }
    

// Verifica che Chart.js sia caricato
verificaChartJS() {
    if (typeof Chart === 'undefined') {
        console.warn('⚠️ Chart.js non caricato, provo a caricarlo...');
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
        script.onload = () => {
            console.log('✅ Chart.js caricato con successo');
            if (stateManager.currentUser?.ruolo === 'admin') {
                setTimeout(() => this.creaGraficiDashboard(), 500);
            }
        };
        script.onerror = () => {
            console.error('❌ Errore nel caricamento di Chart.js');
            ErrorHandler.showNotification('Errore nel caricamento dei grafici', 'error');
        };
        document.head.appendChild(script);
        return false;
    }
    return true;
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
        // Dopo le altre inizializzazioni
await this.caricaFornitori();
await this.popolaSelectCommessePerFornitore();
// Aggiungi listener per resize della finestra
window.addEventListener('resize', () => {
    setTimeout(() => this.resizeGrafici(), 200);
});
        
        // INIZIALIZZA LA VISUALIZZAZIONE DELLE FASCE
        this.setupVisualizzazioneFasce();
        this.setupControlliTempoReale();
        
        console.log('Applicazione inizializzata con successo');
         

        // CORREZIONE AUTOMATICA COMMESSE ESISTENTI
        if (stateManager.currentUser?.ruolo === 'admin') {
            setTimeout(async () => {
                await this.correggiCommesseEsistenti();
                await this.aggiornaMonitorCommesse(); // Aggiorna la visualizzazione
            }, 3000);
        }

       

        
    
       // TEST SICUREZZA: verifica integrità dati
        setTimeout(async () => {
            const commesse = await this.firebaseService.getCollection("commesse");
            console.log('🔍 Check integrità dati commesse:');
            console.log('- Commesse totali:', commesse.length);
            console.log('- Commesse valide:', commesse.filter(c => c && c.nomeCommessa).length);
            console.log('- Commesse con preventivo:', commesse.filter(c => c && c.valorePreventivo).length);
            
            const commesseCorrotte = commesse.filter(c => !c || !c.nomeCommessa);
            if (commesseCorrotte.length > 0) {
                console.warn('⚠️ Commesse corrotte trovate:', commesseCorrotte);
            }
        }, 2000);
  // Verifica librerie PDF
        this.verificaLibreriePDF();
    } catch (error) {
        ErrorHandler.handleError(error, 'inizializzazione app');
    }
    
}

    setupEventListeners() {
        this.rimuoviEventListeners();
        // Login
        document.getElementById('btnLogin')?.addEventListener('click', () => this.gestisciLogin());
        
        // Logout
        document.getElementById('logoutButton')?.addEventListener('click', () => this.logout());
        
        // Forms
        document.getElementById('oreForm')?.addEventListener('submit', (e) => this.handleOreForm(e));
        document.getElementById('commessaForm')?.addEventListener('submit', (e) => this.handleCommessaForm(e));
        document.getElementById('dipendentiForm')?.addEventListener('submit', (e) => this.handleDipendentiForm(e));
        // Form fornitore
        document.getElementById('fornitoreForm')?.addEventListener('submit', (e) => this.aggiungiLavorazioneFornitore(e));
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
          // Aggiungi pulsante diagnostica (solo admin)
        if (stateManager.currentUser?.ruolo === 'admin') {
        const diagnosticaBtn = document.createElement('button');
        diagnosticaBtn.className = 'btn btn-sm btn-outline-info';
        diagnosticaBtn.innerHTML = '🔍 Diagnostica Commesse';
        diagnosticaBtn.addEventListener('click', () => this.diagnosticaCommesse());
        
        // Inserisci nel header del monitoraggio
        const monitorHeader = document.querySelector('#monitorCommesse .card-header');
        if (monitorHeader) {
            monitorHeader.appendChild(diagnosticaBtn);
        }
    }
// Aggiungi pulsante debug per admin
    if (stateManager.currentUser?.ruolo === 'admin') {
        const debugBtn = document.createElement('button');
        debugBtn.className = 'btn btn-sm btn-outline-warning';
        debugBtn.innerHTML = '🐛 Debug Commesse';
        debugBtn.addEventListener('click', () => this.debugCommesse());
        
        const monitorHeader = document.querySelector('#monitorCommesse .card-header');
        if (monitorHeader) {
            monitorHeader.appendChild(debugBtn);
        }
    }

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
        // Pulsanti grafici
document.getElementById('btnAggiornaGrafici')?.addEventListener('click', () => {
    this.creaGraficiDashboard();
});

document.getElementById('btnEsportaGrafici')?.addEventListener('click', () => {
    this.esportaGraficiPNG();
});

// Pulsanti backup
document.getElementById('btnBackupDati')?.addEventListener('click', () => {
    this.eseguiBackupDati();
});

document.getElementById('btnRipristinoDati')?.addEventListener('click', () => {
    this.mostraSelettoreBackup();
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
         // NUOVI EVENT LISTENERS
        document.getElementById('filtroCommessaMonitor')?.addEventListener('change', (e) => {
            this.aggiornaMonitorCommesse(e.target.value);
        });

        document.getElementById('btnAggiornaMonitor')?.addEventListener('click', () => {
            const filtro = document.getElementById('filtroCommessaMonitor').value;
            this.aggiornaMonitorCommesse(filtro);
        });

        // Aggiorna il monitor quando vengono modificate le ore
        document.addEventListener('oreAggiornate', () => {
            this.aggiornaMonitorCommesse();
        });
        // Pulsante PDF rubrica dipendenti
document.getElementById('btnScaricaPDFDipendenti')?.addEventListener('click', (e) => {
    e.preventDefault();
    console.log('🎯 Cliccato btnScaricaPDFDipendenti');
    this.generaPDFRubricaDipendenti();
});
        // Listener per i nuovi filtri Anno e Mese nel monitoraggio
document.getElementById('filtroAnnoMonitor')?.addEventListener('change', (e) => {
    const filtroStato = document.getElementById('filtroCommessaMonitor')?.value || '';
    const filtroNome = document.getElementById('filtroNomeCommessa')?.value || '';
    const filtroAnno = e.target.value || '';
    const filtroMese = document.getElementById('filtroMeseMonitor')?.value || '';
    this.aggiornaMonitorCommesse(filtroStato, filtroNome, filtroAnno, filtroMese);
});

document.getElementById('filtroMeseMonitor')?.addEventListener('change', (e) => {
    const filtroStato = document.getElementById('filtroCommessaMonitor')?.value || '';
    const filtroNome = document.getElementById('filtroNomeCommessa')?.value || '';
    const filtroAnno = document.getElementById('filtroAnnoMonitor')?.value || '';
    const filtroMese = e.target.value || '';
    this.aggiornaMonitorCommesse(filtroStato, filtroNome, filtroAnno, filtroMese);
});


        
          // DEBUG: Verifica che il pulsante PDF esista e abbia l'event listener
    const btnScaricaPDFMonitor = document.getElementById('btnScaricaPDFMonitor');
    console.log('🔍 Pulsante PDF Monitor:', btnScaricaPDFMonitor);
    
    if (btnScaricaPDFMonitor) {
        btnScaricaPDFMonitor.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('🎯 Cliccato btnScaricaPDFMonitor');
            this.generaPDFMonitoraggio();
        });
    } else {
        console.error('❌ btnScaricaPDFMonitor non trovato!');
    }
        // FILTRO NOME COMMESSA (ricerca in tempo reale)
    document.getElementById('filtroNomeCommessa')?.addEventListener('input', (e) => {
        const filtroNome = e.target.value;
        const filtroStato = document.getElementById('filtroCommessaMonitor').value;
        
        // Aspetta un po' prima di aggiornare (debounce)
        clearTimeout(this.filtroTimeout);
        this.filtroTimeout = setTimeout(() => {
            this.aggiornaMonitorCommesse(filtroStato, filtroNome);
        }, 500);
    });
    
    // FILTRO STATO COMMESSA
    document.getElementById('filtroCommessaMonitor')?.addEventListener('change', (e) => {
        const filtroStato = e.target.value;
        const filtroNome = document.getElementById('filtroNomeCommessa').value;
        this.aggiornaMonitorCommesse(filtroStato, filtroNome);
    });
    
    // PULSANTE RESET FILTRI
   document.getElementById('btnResetFiltriMonitor')?.addEventListener('click', () => {
    this.resetFiltriMonitor();
});
    
    // PULSANTE AGGIORNA
   document.getElementById('btnAggiornaMonitor')?.addEventListener('click', () => {
    const filtroStato = document.getElementById('filtroCommessaMonitor').value;
    const filtroNome = document.getElementById('filtroNomeCommessa').value;
    const filtroAnno = document.getElementById('filtroAnnoMonitor').value;
    const filtroMese = document.getElementById('filtroMeseMonitor').value;
    this.aggiornaMonitorCommesse(filtroStato, filtroNome, filtroAnno, filtroMese);
});
    // Pulsante test per admin
    if (stateManager.currentUser?.ruolo === 'admin') {
        const testBtn = document.createElement('button');
        testBtn.className = 'btn btn-sm btn-outline-info';
        testBtn.innerHTML = '🧪 Test Margine';
        testBtn.addEventListener('click', () => this.testCalcoloMargine());
        
        const monitorHeader = document.querySelector('#monitorCommesse .card-header');
        if (monitorHeader) {
            monitorHeader.appendChild(testBtn);
        }
    }
     // Pulsante debug condizione
    if (stateManager.currentUser?.ruolo === 'admin') {
        const condizioneBtn = document.createElement('button');
        condizioneBtn.className = 'btn btn-sm btn-outline-dark';
        condizioneBtn.innerHTML = '🔍 Debug Condizione';
        condizioneBtn.addEventListener('click', () => this.debugCondizioneMargini());
        
        const monitorHeader = document.querySelector('#monitorCommesse .card-header');
        if (monitorHeader) {
            monitorHeader.appendChild(condizioneBtn);
        }
    }
     // Pulsante reset completo
    if (stateManager.currentUser?.ruolo === 'admin') {
        const resetBtn = document.createElement('button');
        resetBtn.className = 'btn btn-sm btn-outline-danger';
        resetBtn.innerHTML = '🗑️ Reset Completo';
        resetBtn.addEventListener('click', () => this.resetCompletoMonitoraggio());
        
        const monitorHeader = document.querySelector('#monitorCommesse .card-header');
        if (monitorHeader) {
            monitorHeader.appendChild(resetBtn);
        }
    }
    // Pulsante test PDF
    if (stateManager.currentUser?.ruolo === 'admin') {
        const testPdfBtn = document.createElement('button');
        testPdfBtn.className = 'btn btn-sm btn-outline-info';
        testPdfBtn.innerHTML = '🧪 Test PDF';
        testPdfBtn.addEventListener('click', () => this.testGenerazionePDF());
        
        const monitorHeader = document.querySelector('#monitorCommesse .card-header');
        if (monitorHeader) {
            monitorHeader.appendChild(testPdfBtn);
        }
    }
      // Pulsante verifica librerie
    if (stateManager.currentUser?.ruolo === 'admin') {
        const verificaLibBtn = document.createElement('button');
        verificaLibBtn.className = 'btn btn-sm btn-outline-secondary';
        verificaLibBtn.innerHTML = '🔍 Verifica Librerie';
        verificaLibBtn.addEventListener('click', () => this.verificaLibreriePDF());
        
        const monitorHeader = document.querySelector('#monitorCommesse .card-header');
        if (monitorHeader) {
            monitorHeader.appendChild(verificaLibBtn);
        }
    }
      // Test immediato al click
    document.getElementById('btnScaricaPDFMonitor')?.addEventListener('click', async (e) => {
        e.preventDefault();
        console.log('🎯 Cliccato Scarica PDF');
        
        // Test rapido delle librerie
        if (typeof window.jspdf === 'undefined') {
            alert('❌ jsPDF non caricato!');
            return;
        }
        
        const { jsPDF } = window.jspdf;
        if (typeof jsPDF.autoTable === 'undefined') {
            alert('❌ autoTable non caricato!');
            return;
        }
        
        console.log('✅ Librerie OK, generando PDF...');
        await this.generaPDFMonitoraggio();
    });
}
// POPOLA GLI ANNI NEL SELECT DEL MONITORAGGIO
popolaAnniMonitor() {
    const annoSelect = document.getElementById('filtroAnnoMonitor');
    if (!annoSelect) return;
    
    const annoCorrente = new Date().getFullYear();
    annoSelect.innerHTML = '<option value="">Tutti gli anni</option>';
    
    // Popola gli ultimi 5 anni e i prossimi 2
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

resetFiltriMonitor() {
    document.getElementById('filtroNomeCommessa').value = '';
    document.getElementById('filtroCommessaMonitor').value = '';
    document.getElementById('filtroAnnoMonitor').value = '';
    document.getElementById('filtroMeseMonitor').value = '';
    
    // Rimuovi info filtri
    const existingInfo = document.getElementById('infoFiltriMonitor');
    if (existingInfo) {
        existingInfo.remove();
    }
    
    // Aggiorna con filtri vuoti
    this.aggiornaMonitorCommesse('', '', '', '');
    
    ErrorHandler.showNotification('Filtri resettati', 'info');
}
       
       
        rimuoviEventListeners() {
    // Questo metodo può essere usato per pulire event listeners se necessario
    const elements = [
        'btnLogin', 'logoutButton', 'oreForm', 'commessaForm', 'dipendentiForm',
        'filtraOreLavorate', 'btnScaricaPDF', 'btnCercaCommessa', 'btnResetCercaCommessa',
        'btnMostraTabella', 'btnFiltraNonConformita', 'btnMostraTutti', 'btnResetFiltri',
        'btnApplicaFiltri', 'btnAggiornaMonitor', 'btnScaricaPDFMonitor', 'btnDiagnosticaCommesse'
    ];
    
    elements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            const newElement = element.cloneNode(true);
            element.parentNode.replaceChild(newElement, element);
        }
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

   // Nel metodo mostraApplicazione(), verifica che la tabella venga chiamata solo per gli admin
// MODIFICA il metodo mostraApplicazione()
async mostraApplicazione() {
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('appContent').style.display = 'block';

    // Nascondi tutte le sezioni
    document.querySelectorAll('.admin-only, .dipendente-only').forEach(el => {
        el.style.display = 'none';
    });

    if (stateManager.currentUser?.ruolo === 'dipendente') {
        document.querySelectorAll('.dipendente-only').forEach(el => {
            el.style.display = 'block';
        });
    }

    if (stateManager.currentUser?.ruolo === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => {
            el.style.display = 'block';
        });
         this.popolaAnniMonitor();
        // NASCONDI la tabella monitoraggio all'inizio
        const monitorCommesseTable = document.getElementById('monitorCommesseTable');
        if (monitorCommesseTable) {
            monitorCommesseTable.style.display = 'none';
        }
        
        // Mostra un messaggio invece della tabella
        this.mostraMessaggioMonitoraggioIniziale();
        // Nel metodo init(), dopo le altre inizializzazioni
        this.inizializzaDarkMode();
    }

    document.getElementById('tabelleMensili').style.display = 'none';
    // Dopo aver mostrato le sezioni admin
if (stateManager.currentUser?.ruolo === 'admin') {
    setTimeout(() => {
        if (this.verificaChartJS()) {
            this.creaGraficiDashboard();
        }
        this.aggiornaInfoUltimoBackup();
    }, 1000);
}


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
    
    // AGGIORNAMENTO UNICO DELLE TABELLE - ESCLUDI MONITORAGGIO
    if (stateManager.currentUser?.ruolo === 'admin') {
        console.log('🔄 Aggiornamento tabelle admin...');
        
        // Aggiorna solo le tabelle principali, NON il monitoraggio
        await Promise.all([
            this.aggiornaTabellaOreLavorate(),
            this.aggiornaTabellaCommesse(),
            this.aggiornaTabellaDipendenti()
            // ESCLUDI: this.aggiornaMonitorCommesse()
        ]);
        
    } else if (stateManager.currentUser?.ruolo === 'dipendente') {
        console.log('🔄 Aggiornamento dipendente...');
        await this.aggiornaMenuCommesse();
    }
    
    // Imposta la data corrente nel form ore lavorate
    const oggi = new Date().toISOString().split('T')[0];
    document.getElementById('oreData').value = oggi;
    
    // Aggiorna la visualizzazione delle fasce per la data corrente
    await this.aggiornaVisualizzazioneFasce(oggi);

    // Messaggio di benvenuto
    const benvenuto = document.createElement('div');
    benvenuto.className = 'alert alert-info alert-dismissible fade show';
    benvenuto.innerHTML = `
        <strong>Benvenuto, ${stateManager.currentUser?.name || 'Utente'}!</strong>
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    const appContent = document.getElementById('appContent');
    appContent.insertBefore(benvenuto, appContent.firstChild);
    
    console.log('✅ Applicazione mostrata correttamente');
}

// AGGIUNGI questo metodo per mostrare il messaggio iniziale
mostraMessaggioMonitoraggioIniziale() {
    const monitorCommesseContainer = document.getElementById('monitorCommesse');
    if (!monitorCommesseContainer) return;

    // Cerca se esiste già un messaggio
    let messaggioEsistente = monitorCommesseContainer.querySelector('.messaggio-monitoraggio-iniziale');
    
    if (!messaggioEsistente) {
        const messaggio = document.createElement('div');
        messaggio.className = 'messaggio-monitoraggio-iniziale alert alert-info text-center';
        messaggio.innerHTML = `
            <div class="py-4">
                <i class="fas fa-chart-line fa-3x mb-3 text-muted"></i>
                <h5>Monitoraggio Commesse</h5>
                <p class="mb-3">Utilizza i filtri o il pulsante "Aggiorna Monitoraggio" per visualizzare i dati</p>
                <button class="btn btn-primary" id="btnCaricaMonitoraggioIniziale">
                    <i class="fas fa-sync-alt"></i> Carica Monitoraggio
                </button>
            </div>
        `;
        
        // Inserisci il messaggio prima della tabella
        const tabella = monitorCommesseContainer.querySelector('#monitorCommesseTable');
        if (tabella) {
            monitorCommesseContainer.insertBefore(messaggio, tabella);
        }
        
        // Aggiungi event listener al pulsante
        setTimeout(() => {
            document.getElementById('btnCaricaMonitoraggioIniziale')?.addEventListener('click', () => {
                this.aggiornaEMostraMonitoraggio();
            });
        }, 100);
    }
}

// MODIFICA il metodo aggiornaEMostraMonitoraggio per accettare parametri
async aggiornaEMostraMonitoraggio(filtroStato = '', filtroNome = '') {
    try {
        // Mostra loading
        const btn = document.getElementById('btnCaricaMonitoraggioIniziale') || document.getElementById('btnAggiornaMonitor');
        if (btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Caricamento...';
            btn.disabled = true;
            
            // Attendi l'aggiornamento
            await this.aggiornaMonitorCommesse(filtroStato, filtroNome);
            
            // Ripristina pulsante
            btn.innerHTML = originalText;
            btn.disabled = false;
        } else {
            await this.aggiornaMonitorCommesse(filtroStato, filtroNome);
        }
        
        // Nascondi il messaggio e mostra la tabella
        this.mostraTabellaMonitoraggio();
        
    } catch (error) {
        console.error('Errore nel caricamento monitoraggio:', error);
        ErrorHandler.showNotification('Errore nel caricamento del monitoraggio', 'error');
    }
}

// AGGIUNGI questo metodo per mostrare la tabella
mostraTabellaMonitoraggio() {
    const monitorCommesseTable = document.getElementById('monitorCommesseTable');
    const messaggio = document.querySelector('.messaggio-monitoraggio-iniziale');
    
    if (monitorCommesseTable) {
        monitorCommesseTable.style.display = 'table';
    }
    
    if (messaggio) {
        messaggio.style.display = 'none';
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
   // MODIFICA il metodo handleCommessaForm per essere più robusto
async handleCommessaForm(e) {
    e.preventDefault();
    try {
        const nomeCommessa = document.getElementById('nomeCommessa').value.trim();
        const cliente = document.getElementById('cliente').value.trim();
        const valorePreventivoInput = document.getElementById('valorePreventivo').value;
        const valorePreventivo = parseFloat(valorePreventivoInput);
        const statoCommessa = document.getElementById('statoCommessa').value;
        const dataCommessa = document.getElementById('dataCommessa').value; // NUOVO

        // VALIDAZIONE MIGLIORATA
        if (!nomeCommessa || !cliente) {
            ErrorHandler.showNotification("Nome commessa e cliente sono obbligatori", 'error');
            return;
        }

        if (!valorePreventivoInput || isNaN(valorePreventivo) || valorePreventivo <= 0) {
            ErrorHandler.showNotification("Inserisci un valore preventivo valido", 'error');
            return;
        }

        // VALIDAZIONE DATA
        if (!dataCommessa) {
            ErrorHandler.showNotification("Seleziona una data inizio per la commessa", 'error');
            return;
        }

        // CALCOLO ORE AUTOMATICO
        const oreTotaliCommessa = this.calcolaOreDaPreventivo(valorePreventivo);
        
        const datiCommessa = {
            nomeCommessa: nomeCommessa,
            cliente: cliente,
            valorePreventivo: valorePreventivo,
            oreTotaliPreviste: oreTotaliCommessa,
            oreIntegrazione: 0,
            stato: statoCommessa,
            dataInizio: dataCommessa,  // NUOVO: salva la data
            dataCreazione: new Date().toISOString(),
            dataUltimaModifica: new Date().toISOString()
        };

        console.log('📝 Salvataggio commessa:', datiCommessa);

        await this.firebaseService.addDocument("commesse", datiCommessa);
        
        ErrorHandler.showNotification(
            `Commessa "${nomeCommessa}" aggiunta con successo! (${oreTotaliCommessa} ore previste)`, 
            'success'
        );

        // AGGIORNAMENTO VISUALIZZAZIONI
        await Promise.all([
            this.aggiornaTabellaCommesse(),
            this.aggiornaMenuCommesse(),
            this.aggiornaMonitorCommesse()
        ]);

        e.target.reset();
        
        // Imposta data di default per il prossimo inserimento
        document.getElementById('dataCommessa').value = new Date().toISOString().split('T')[0];

    } catch (error) {
        ErrorHandler.handleError(error, 'aggiunta commessa');
    }
}
// AGGIUNGI QUESTO METODO PER DIAGNOSTICARE LE COMMESSE


// METODO PER MOSTRARE IL REPORT NELL'UI
// AGGIORNA IL METODO diagnosticaCommesse
async diagnosticaCommesse() {
    try {
        console.log('=== DIAGNOSTICA COMMESSE ===');
        
        const commesse = await this.firebaseService.getCollection("commesse");
        
        const report = {
            totale: commesse.length,
            conPreventivo: 0,
            senzaPreventivo: 0,
            conOreCalcolate: 0,
            senzaOreCalcolate: 0,
            conStato: 0,
            senzaStato: 0,
            problemi: [],
            commesseSenzaOre: []
        };

        commesse.forEach((commessa, index) => {
            const hasPreventivo = commessa.valorePreventivo > 0;
            const hasOreCalcolate = commessa.oreTotaliPreviste > 0;
            const hasStato = !!commessa.stato;
            
            if (hasPreventivo) report.conPreventivo++;
            else report.senzaPreventivo++;
            
            if (hasOreCalcolate) report.conOreCalcolate++;
            else report.senzaOreCalcolate++;
            
            if (hasStato) report.conStato++;
            else report.senzaStato++;

            // Rileva problemi specifici
            if (hasPreventivo && !hasOreCalcolate) {
                report.problemi.push({
                    commessa: commessa.nomeCommessa,
                    id: commessa.id,
                    problema: 'Ha preventivo ma ore non calcolate',
                    preventivo: commessa.valorePreventivo,
                    oreCalcolate: commessa.oreTotaliPreviste
                });
                report.commesseSenzaOre.push(commessa);
            }

            if (!hasStato) {
                report.problemi.push({
                    commessa: commessa.nomeCommessa,
                    id: commessa.id,
                    problema: 'Manca stato'
                });
            }
        });

        console.log('📋 Report diagnostica:', report);
        
        // Mostra report nell'UI con opzione correzione automatica
        this.mostraReportDiagnostica(report);
        
        return report;

    } catch (error) {
        console.error('Errore nella diagnostica:', error);
        return null;
    }
}

// METODO MIGLIORATO PER MOSTRARE REPORT DIAGNOSTICA
mostraReportDiagnostica(report) {
    const container = document.createElement('div');
    container.className = 'diagnostica-report alert alert-warning';
    container.innerHTML = `
        <h5>🔍 Diagnostica Commesse</h5>
        <div class="row">
            <div class="col-md-3">
                <strong>Totale:</strong> ${report.totale} commesse
            </div>
            <div class="col-md-3">
                <strong>Con preventivo:</strong> ${report.conPreventivo}
            </div>
            <div class="col-md-3">
                <strong>Ore calcolate:</strong> ${report.conOreCalcolate}
            </div>
            <div class="col-md-3">
                <strong>Con stato:</strong> ${report.conStato}
            </div>
        </div>
        
        ${report.problemi.length > 0 ? `
            <div class="mt-3">
                <h6>⚠️ Problemi rilevati (${report.problemi.length}):</h6>
                <div class="table-responsive">
                    <table class="table table-sm table-bordered">
                        <thead>
                            <tr>
                                <th>Commessa</th>
                                <th>Problema</th>
                                <th>Preventivo</th>
                                <th>Ore Calcolate</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${report.problemi.slice(0, 5).map(p => `
                                <tr>
                                    <td>${p.commessa}</td>
                                    <td>${p.problema}</td>
                                    <td>€ ${p.preventivo?.toFixed(2) || 'N/D'}</td>
                                    <td>${p.oreCalcolate || 'N/D'} ore</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ${report.problemi.length > 5 ? `<small>... e altri ${report.problemi.length - 5} problemi</small>` : ''}
            </div>
            
            <div class="mt-3 p-3 bg-light rounded">
                <h6>🚀 Correzione Automatica</h6>
                <p class="mb-2">
                    <strong>${report.commesseSenzaOre.length} commesse</strong> hanno un preventivo ma non hanno le ore calcolate automaticamente.
                </p>
                <button class="btn btn-success btn-sm" id="btnCorreggiAutomaticamente">
                    🔧 Correggi Automaticamente ${report.commesseSenzaOre.length} Commesse
                </button>
                <small class="d-block mt-1 text-muted">
                    Verranno calcolate le ore totali previste in base al preventivo (€${TARIFFA_ORARIA}/ora)
                </small>
            </div>
        ` : `
            <div class="mt-3 alert alert-success">
                ✅ Tutte le commesse sono configurate correttamente!
            </div>
        `}
        
        <div class="mt-2">
            <button class="btn btn-sm btn-secondary" onclick="this.parentElement.parentElement.remove()">
                ❌ Chiudi
            </button>
        </div>
    `;

    // Inserisci nel DOM
    const appContent = document.getElementById('appContent');
    if (appContent) {
        appContent.insertBefore(container, appContent.firstChild);
    }

    // Aggiungi event listener per correzione automatica
    const btnCorreggi = document.getElementById('btnCorreggiAutomaticamente');
    if (btnCorreggi) {
        btnCorreggi.addEventListener('click', async () => {
            await this.correggiCommesseEsistenti();
            container.remove();
        });
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
            const tutteLeCommesse = await this.firebaseService.getCollection("commesse");
            // FILTRA: mostra solo commesse attive
            const commesseAttive = tutteLeCommesse.filter(commessa => commessa.stato === 'attiva');
            
            if (commesseAttive.length === 0) {
                const option = document.createElement('option');
                option.value = "";
                option.textContent = "Nessuna commessa attiva disponibile";
                select.appendChild(option);
                return;
            }

            commesseAttive.forEach(commessa => {
                const option = document.createElement('option');
                option.value = commessa.nomeCommessa;
                option.textContent = `${commessa.nomeCommessa} - ${commessa.cliente}`;
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

    // CONTROLLO: evita aggiornamenti duplicati durante il caricamento
    if (this.aggiornamentoInCorso) {
        console.log('⚠️ Aggiornamento già in corso, skip...');
        return;
    }

    this.aggiornamentoInCorso = true;
    
    try {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">Caricamento...</td></tr>';

        console.log('🔄 Aggiornamento tabella ore lavorate...');

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
            // Pulisci il tbody
            tbody.innerHTML = '';
            
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

                // Aggiungi event listeners
                row.querySelector('.btnModificaOreLavorate').addEventListener('click', () => this.modificaOreLavorate(ore.id));
                row.querySelector('.btnEliminaOreLavorate').addEventListener('click', () => this.eliminaOreLavorate(ore.id));
            });

            // Calcola e aggiungi totale
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

        console.log('✅ Tabella ore lavorate aggiornata');

    } catch (error) {
        console.error('❌ Errore nel caricamento tabella ore:', error);
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">Errore nel caricamento dei dati</td></tr>`;
    } finally {
        this.aggiornamentoInCorso = false;
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

  // MODIFICA: Correggi anche nel metodo aggiornaTabellaCommesse
async aggiornaTabellaCommesse(filtro = '') {
    const tbody = document.querySelector('#commesseTable tbody');
    if (!tbody) return;

    try {
        // Mostra loading
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Caricamento...</td></tr>';
        
        // Recupera tutte le commesse
        let tutteLeCommesse = await this.firebaseService.getCollection("commesse");
        
        // Filtra se necessario
        if (filtro && filtro.trim() !== '') {
            const filtroLowerCase = filtro.toLowerCase();
            tutteLeCommesse = tutteLeCommesse.filter(commessa => 
                commessa.nomeCommessa.toLowerCase().includes(filtroLowerCase) ||
                (commessa.cliente && commessa.cliente.toLowerCase().includes(filtroLowerCase))
            );
        }
        
        // Ordina le commesse (attive prima, poi per nome)
        tutteLeCommesse.sort((a, b) => {
            const statoA = a.stato === 'attiva' ? 0 : 1;
            const statoB = b.stato === 'attiva' ? 0 : 1;
            if (statoA !== statoB) return statoA - statoB;
            return (a.nomeCommessa || '').localeCompare(b.nomeCommessa || '');
        });
        
        // Salva i dati totali
        this.datiTotaliCommesse = tutteLeCommesse;
        
        // Inizializza la paginazione se non esiste
        if (!this.paginazioneCommesse) {
            this.paginazioneCommesse = new PaginationManager('paginationCommesse', CONSTANTS.RIGHE_PER_PAGINA);
        }
        
        // Aggiorna i dati nella paginazione
        this.paginazioneCommesse.aggiornaDati(tutteLeCommesse);
        
        // Renderizza la tabella
        this.renderizzaTabellaCommesse();
        
    } catch (error) {
        console.error('Errore nel caricamento tabella commesse:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Errore nel caricamento dei dati</td></tr>';
    }
}

// NUOVO METODO: Renderizza la tabella con i dati della pagina corrente
renderizzaTabellaCommesse() {
    const tbody = document.querySelector('#commesseTable tbody');
    if (!tbody) return;
    
    // Verifica che la paginazione esista
    if (!this.paginazioneCommesse) {
        console.error('Paginazione non inizializzata');
        return;
    }
    
    // Ottieni i dati della pagina corrente
    const datiPagina = this.paginazioneCommesse.getDatiPagina();
    
    if (!datiPagina || datiPagina.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nessuna commessa trovata</td></tr>';
        // Renderizza comunque la paginazione (vuota)
        this.paginazioneCommesse.render(this.datiTotaliCommesse, () => this.renderizzaTabellaCommesse());
        return;
    }
    
    // Pulisci il tbody
    tbody.innerHTML = '';
    
    // Popola la tabella
    datiPagina.forEach(commessa => {
        const row = this.creaRigaTabellaCommesse(commessa);
        tbody.appendChild(row);
    });
    
    // Renderizza la paginazione
    this.paginazioneCommesse.render(this.datiTotaliCommesse, () => this.renderizzaTabellaCommesse());
}

creaRigaTabellaCommesse(commessa) {
    const row = document.createElement('tr');
    const statoCorrente = commessa.stato || 'attiva';
    
    if (statoCorrente === 'conclusa') {
        row.classList.add('commessa-conclusa', 'table-secondary');
    }
    
    // Formatta la data
    const dataInizio = commessa.dataInizio || (commessa.dataCreazione ? commessa.dataCreazione.split('T')[0] : '');
    const dataFormattata = dataInizio ? this.formattaDataItaliana(dataInizio) : 'N/D';
    
    // Crea il contenuto HTML della riga - SENZA pulsante Data
    row.innerHTML = `
        <td style="min-width: 160px;">
            <strong>${this.escapeHtml(commessa.nomeCommessa)}</strong>
            <br><small class="text-muted">${this.escapeHtml(commessa.cliente || 'N/D')}</small>
          </td>
        <td class="text-end">€ ${(commessa.valorePreventivo || 0).toFixed(2)}</td>
        <td class="text-center">${Utils.formattaOreDecimali(commessa.oreTotaliPreviste || 0)} ore</td>
        <td class="text-center">${dataFormattata}</td>
        <td class="text-center">
            <span class="badge ${statoCorrente === 'attiva' ? 'bg-success' : 'bg-secondary'}">
                ${statoCorrente === 'attiva' ? 'ATTIVA' : 'CONCLUSA'}
            </span>
        </td>
       <td class="text-center">
    <div class="btn-group btn-group-sm" role="group">
        <button class="btn btn-sm btn-warning btn-modifica-commessa" data-id="${commessa.id}">
            <i class="fas fa-edit"></i>
        </button>
        <button class="btn btn-sm btn-secondary btn-cambia-stato-commessa" data-id="${commessa.id}" data-stato="${statoCorrente}">
            ${statoCorrente === 'attiva' ? '🔒' : '↩️'}
        </button>
        <button class="btn btn-sm btn-danger btn-elimina-commessa" data-id="${commessa.id}">
            <i class="fas fa-trash"></i>
        </button>
    </div>
</td>
    `;
    
    // Aggiungi event listeners (SOLO 3 pulsanti ora)
    const modificaBtn = row.querySelector('.btn-modifica-commessa');
    const cambiaStatoBtn = row.querySelector('.btn-cambia-stato-commessa');
    const eliminaBtn = row.querySelector('.btn-elimina-commessa');
    
    if (modificaBtn) {
        modificaBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.modificaCommessa(commessa.id);
        });
    }
    
    if (cambiaStatoBtn) {
        cambiaStatoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.cambiaStatoCommessa(commessa.id, statoCorrente);
        });
    }
    
    if (eliminaBtn) {
        eliminaBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.eliminaCommessa(commessa.id);
        });
    }
    
    return row;
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

        // Prepara valori correnti per i prompt
        const nomeCorrente = commessa.nomeCommessa || '';
        const clienteCorrente = commessa.cliente || '';
        const valoreCorrente = commessa.valorePreventivo || 0;
        const dataCorrente = commessa.dataInizio || commessa.dataCreazione?.split('T')[0] || '';
        const statoCorrente = commessa.stato === 'attiva';
        
        // Prompt per i vari campi
        const nuovoNomeCommessa = prompt("Inserisci il nuovo nome della commessa:", nomeCorrente);
        if (!nuovoNomeCommessa) return;
        
        const nuovoCliente = prompt("Inserisci il nuovo cliente:", clienteCorrente);
        if (!nuovoCliente) return;
        
        const nuovoValorePreventivo = parseFloat(prompt("Inserisci il nuovo valore preventivo (€):", valoreCorrente));
        if (isNaN(nuovoValorePreventivo) || nuovoValorePreventivo <= 0) {
            ErrorHandler.showNotification("Valore preventivo non valido", 'error');
            return;
        }
        
        // NUOVO: Prompt per la data
        let nuovaData = prompt(
            "Inserisci la data di inizio commessa (YYYY-MM-DD):\n\n" +
            "Esempio: 2025-01-15", 
            dataCorrente
        );
        
        // Valida la data
        if (nuovaData) {
            const regexData = /^\d{4}-\d{2}-\d{2}$/;
            if (!regexData.test(nuovaData)) {
                ErrorHandler.showNotification("Formato data non valido. Usa YYYY-MM-DD", 'error');
                return;
            }
            
            // Verifica che la data sia valida
            const dataTest = new Date(nuovaData);
            if (isNaN(dataTest.getTime())) {
                ErrorHandler.showNotification("Data non valida", 'error');
                return;
            }
        } else {
            // Se l'utente annulla, mantieni la data esistente
            nuovaData = dataCorrente;
        }
        
        const nuovoStato = confirm("La commessa è attiva? (OK per Attiva, Annulla per Conclusa)") ? 'attiva' : 'conclusa';
        
        // Calcola nuove ore totali in base al nuovo preventivo
        const nuoveOreTotali = this.calcolaOreDaPreventivo(nuovoValorePreventivo);
        const oreIntegrazioneEsistenti = commessa.oreIntegrazione || 0;
        
        // Prepara i dati da aggiornare
        const updateData = {
            nomeCommessa: nuovoNomeCommessa,
            cliente: nuovoCliente,
            valorePreventivo: nuovoValorePreventivo,
            oreTotaliPreviste: nuoveOreTotali,
            oreIntegrazione: oreIntegrazioneEsistenti,
            stato: nuovoStato,
            dataUltimaModifica: new Date().toISOString()
        };
        
        // Aggiungi la data solo se è stata fornita
        if (nuovaData) {
            updateData.dataInizio = nuovaData;
        }
        
        await this.firebaseService.updateDocument("commesse", id, updateData);
        
        const messaggio = `Commessa "${nuovoNomeCommessa}" modificata con successo!\n` +
                         `Ore totali previste: ${Utils.formattaOreDecimali(nuoveOreTotali)}\n` +
                         `Data inizio: ${nuovaData || 'Non specificata'}`;
        
        ErrorHandler.showNotification(messaggio, 'success');
        
        // Aggiorna tutte le viste
        await Promise.all([
            this.aggiornaTabellaCommesse(),
            this.aggiornaMenuCommesse(),
            this.aggiornaMonitorCommesse()
        ]);
        
    } catch (error) {
        console.error('Errore in modificaCommessa:', error);
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
    if (confirm("Sei sicuro di voler eliminare questa commessa?\n\nAttenzione: Questa azione è irreversibile!")) {
        try {
            await this.firebaseService.deleteDocument("commesse", id);
            ErrorHandler.showNotification("Commessa eliminata con successo!", 'success');
            
            // Ricarica i dati e resetta la paginazione
            this.datiTotaliCommesse = [];
            if (this.paginazioneCommesse) {
                this.paginazioneCommesse.reset();
            }
            await this.aggiornaTabellaCommesse();
            await this.aggiornaMenuCommesse();
            await this.aggiornaMonitorCommesse();
            
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

// GENERA PDF RUBRICA DIPENDENTI
// GENERA PDF RUBRICA DIPENDENTI (versione senza emoji)
async generaPDFRubricaDipendenti() {
    try {
        console.log('📄 Avvio generazione PDF rubrica dipendenti...');
        
        // Verifica librerie PDF
        if (typeof window.jspdf === 'undefined') {
            await this.caricaLibreriePDFDinamico();
        }
        
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            throw new Error('jsPDF non disponibile');
        }
        
        // Recupera tutti i dipendenti
        const dipendenti = await this.firebaseService.getCollection("dipendenti");
        
        if (!dipendenti || dipendenti.length === 0) {
            ErrorHandler.showNotification("Nessun dipendente trovato", 'warning');
            return;
        }
        
        // Ordina dipendenti per ruolo (admin prima, poi dipendenti) e poi per cognome
        dipendenti.sort((a, b) => {
            if (a.ruolo !== b.ruolo) {
                return a.ruolo === 'admin' ? -1 : 1;
            }
            return (a.cognome || '').localeCompare(b.cognome || '');
        });
        
        // Crea PDF in orientamento portrait
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        // Colori professionali
        const colors = {
            primary: [44, 62, 80],      // Blu scuro
            secondary: [52, 152, 219],   // Blu chiaro
            accent: [46, 204, 113],      // Verde
            warning: [243, 156, 18],     // Arancione
            danger: [231, 76, 60],       // Rosso
            text: [52, 73, 94],          // Testo scuro
            light: [236, 240, 241],      // Grigio chiaro
            background: [248, 249, 250]  // Sfondo
        };
        
        // HEADER
        this.creaHeaderRubricaPDF(doc, colors, dipendenti.length);
        
        // Statistiche rapide
        let yPos = this.creaStatisticheRubricaPDF(doc, colors, dipendenti, 35);
        
        // Tabella dipendenti
        yPos = this.creaTabellaRubricaPDF(doc, colors, dipendenti, yPos + 5);
        
        // Footer (applicato a tutte le pagine)
        this.creaFooterRubricaPDF(doc, colors);
        
        // Salva PDF
        const dataGenerazione = new Date().toISOString().split('T')[0];
        const nomeFile = `rubrica_dipendenti_${dataGenerazione}.pdf`;
        doc.save(nomeFile);
        
        console.log('✅ PDF rubrica dipendenti generato con successo!');
        ErrorHandler.showNotification(`PDF rubrica generato: ${dipendenti.length} dipendenti`, 'success');
        
    } catch (error) {
        console.error('❌ Errore generazione PDF rubrica:', error);
        ErrorHandler.showNotification('Errore nella generazione PDF: ' + error.message, 'error');
    }
}

// HEADER RUBRICA PDF
creaHeaderRubricaPDF(doc, colors, totaleDipendenti) {
    // Sfondo header
    doc.setFillColor(...colors.primary);
    doc.rect(0, 0, 210, 35, 'F');
    
    // Logo/Icona (rettangolo bianco)
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(15, 8, 35, 15, 2, 2, 'F');
    
    doc.setTextColor(...colors.primary);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('UNION14', 18, 17);
    doc.text('SRL', 40, 17);
    
    // Titolo principale
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('RUBRICA DIPENDENTI', 105, 18, { align: 'center' });
    
    // Sottotitolo
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Anagrafica del personale', 105, 26, { align: 'center' });
    
    // Data generazione
    doc.setFontSize(8);
    const dataGenerazione = new Date().toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    doc.text(`Generato: ${dataGenerazione}`, 195, 12, { align: 'right' });
    doc.text(`Totale: ${totaleDipendenti} dipendenti`, 195, 19, { align: 'right' });
}

// STATISTICHE RUBRICA PDF (senza icone)
creaStatisticheRubricaPDF(doc, colors, dipendenti, startY) {
    // Conta admin e dipendenti
    const adminCount = dipendenti.filter(d => d.ruolo === 'admin').length;
    const dipendentiCount = dipendenti.filter(d => d.ruolo === 'dipendente').length;
    
    // Container statistiche
    doc.setFillColor(...colors.background);
    doc.roundedRect(14, startY, 182, 22, 3, 3, 'F');
    
    // Titolo
    doc.setTextColor(...colors.primary);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('RIEPILOGO RUBRICA', 20, startY + 6);
    
    // Linea separatrice
    doc.setDrawColor(...colors.light);
    doc.line(20, startY + 9, 190, startY + 9);
    
    // Valori
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.text);
    
    doc.text(`Totale dipendenti: ${dipendenti.length}`, 20, startY + 16);
    doc.text(`Amministratori: ${adminCount}`, 85, startY + 16);
    doc.text(`Dipendenti: ${dipendentiCount}`, 155, startY + 16);
    
    return startY + 22;
}

// TABELLA RUBRICA PDF (senza icone)
creaTabellaRubricaPDF(doc, colors, dipendenti, startY) {
    if (typeof doc.autoTable !== 'undefined') {
        
        // Prepara i dati per la tabella
        const tableData = dipendenti.map(dip => {
            const isAdmin = dip.ruolo === 'admin';
            const ruoloTesto = isAdmin ? 'ADMIN' : 'DIPENDENTE';
            const ruoloColore = isAdmin ? colors.warning : colors.accent;
            
            return [
                { 
                    content: `${dip.nome || ''} ${dip.cognome || ''}`,
                    styles: { fontStyle: 'bold', fontSize: 9 }
                },
                { 
                    content: dip.email || '-',
                    styles: { fontSize: 8 }
                },
                { 
                    content: dip.password ? '********' : '-',
                    styles: { fontSize: 8, textColor: [150, 150, 150] }
                },
                { 
                    content: ruoloTesto,
                    styles: { 
                        fontSize: 8, 
                        fontStyle: 'bold',
                        textColor: ruoloColore,
                        halign: 'center'
                    }
                }
            ];
        });
        
        // Configurazione colonne
        const columnStyles = {
            0: { cellWidth: 55, halign: 'left' },   // Nome
            1: { cellWidth: 65, halign: 'left' },   // Email
            2: { cellWidth: 30, halign: 'center' },  // Password
            3: { cellWidth: 32, halign: 'center' }   // Ruolo
        };
        
        // Intestazioni
        const headers = [
            { content: 'NOME COMPLETO', styles: { 
                fillColor: colors.secondary, 
                textColor: 255, 
                fontStyle: 'bold',
                fontSize: 9,
                cellPadding: 4
            }},
            { content: 'EMAIL', styles: { 
                fillColor: colors.secondary, 
                textColor: 255, 
                fontStyle: 'bold',
                fontSize: 9,
                cellPadding: 4
            }},
            { content: 'PASSWORD', styles: { 
                fillColor: colors.secondary, 
                textColor: 255, 
                fontStyle: 'bold',
                fontSize: 9,
                cellPadding: 4
            }},
            { content: 'RUOLO', styles: { 
                fillColor: colors.secondary, 
                textColor: 255, 
                fontStyle: 'bold',
                fontSize: 9,
                cellPadding: 4
            }}
        ];
        
        doc.autoTable({
            startY: startY,
            head: [headers],
            body: tableData,
            theme: 'grid',
            styles: { 
                fontSize: 8,
                cellPadding: 4,
                lineColor: [200, 200, 200],
                lineWidth: 0.1,
                overflow: 'linebreak',
                minCellHeight: 8
            },
            headStyles: { 
                fillColor: colors.secondary,
                textColor: 255,
                fontStyle: 'bold',
                fontSize: 9,
                cellPadding: 5
            },
            alternateRowStyles: {
                fillColor: [248, 248, 250]
            },
            columnStyles: columnStyles,
            margin: { top: startY, right: 14, left: 14, bottom: 20 },
            tableWidth: 182,
            pageBreak: 'auto',
            didDrawPage: (data) => {
                // Numero pagina
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(
                    `Pagina ${data.pageNumber} di ${doc.internal.getNumberOfPages()}`, 
                    105, 
                    doc.internal.pageSize.height - 10,
                    { align: 'center' }
                );
            }
        });
        
        return doc.lastAutoTable.finalY + 5;
    } else {
        return this.creaTabellaRubricaManuale(doc, colors, dipendenti, startY);
    }
}

// TABELLA MANUALE (fallback senza icone)
creaTabellaRubricaManuale(doc, colors, dipendenti, startY) {
    let y = startY;
    const pageHeight = doc.internal.pageSize.height;
    const margins = { left: 14, right: 14 };
    
    // Larghezze colonne
    const colWidths = [55, 65, 30, 32];
    const totalWidth = colWidths.reduce((sum, w) => sum + w, 0);
    
    // Intestazione
    doc.setFillColor(...colors.secondary);
    doc.rect(margins.left, y, totalWidth, 7, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    
    let x = margins.left;
    const headers = ['NOME COMPLETO', 'EMAIL', 'PASSWORD', 'RUOLO'];
    headers.forEach((header, index) => {
        doc.text(header, x + 2, y + 5);
        x += colWidths[index];
    });
    
    y += 8;
    
    // Dati
    doc.setFont('helvetica', 'normal');
    
    dipendenti.forEach((dip, index) => {
        if (y > pageHeight - 20) {
            doc.addPage();
            y = 20;
            
            // Ridisegna intestazione
            doc.setFillColor(...colors.secondary);
            doc.rect(margins.left, y, totalWidth, 7, 'F');
            doc.setTextColor(255, 255, 255);
            
            x = margins.left;
            headers.forEach((header, idx) => {
                doc.text(header, x + 2, y + 5);
                x += colWidths[idx];
            });
            y += 8;
        }
        
        // Sfondo alternato
        if (index % 2 === 0) {
            doc.setFillColor(248, 248, 250);
            doc.rect(margins.left, y, totalWidth, 6, 'F');
        }
        
        doc.setTextColor(...colors.text);
        x = margins.left;
        
        // Nome
        doc.text(`${dip.nome || ''} ${dip.cognome || ''}`, x + 2, y + 4);
        x += colWidths[0];
        
        // Email - troncata se troppo lunga
        let email = dip.email || '-';
        if (email.length > 25) {
            email = email.substring(0, 22) + '...';
        }
        doc.text(email, x + 2, y + 4);
        x += colWidths[1];
        
        // Password
        doc.text('********', x + (colWidths[2] / 2), y + 4, { align: 'center' });
        x += colWidths[2];
        
        // Ruolo - senza icone
        const ruoloText = dip.ruolo === 'admin' ? 'ADMIN' : 'DIPENDENTE';
        const ruoloColor = dip.ruolo === 'admin' ? colors.warning : colors.accent;
        doc.setTextColor(...ruoloColor);
        doc.text(ruoloText, x + (colWidths[3] / 2), y + 4, { align: 'center' });
        
        // Ripristina colore per la prossima riga
        doc.setTextColor(...colors.text);
        
        y += 6;
    });
    
    return y + 5;
}

// FOOTER RUBRICA PDF
// FOOTER RUBRICA PDF
creaFooterRubricaPDF(doc, colors) {
    const pageHeight = doc.internal.pageSize.height;
    const pageCount = doc.internal.getNumberOfPages();
    
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        
        // Linea separatrice
        doc.setDrawColor(...colors.light);
        doc.line(14, pageHeight - 18, 196, pageHeight - 18);
        
        // Testo footer
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(150, 150, 150);
        
        doc.text('Union14 srl - Rubrica Dipendenti', 14, pageHeight - 12);
        doc.text('Documento riservato - Solo uso interno', 105, pageHeight - 12, { align: 'center' });
        
        // Numero pagina
        doc.text(`Pagina ${i} di ${pageCount}`, 196, pageHeight - 12, { align: 'right' });
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
    if (!dataString) return 'N/D';
    try {
        const data = new Date(dataString + 'T00:00:00');
        if (isNaN(data.getTime())) return 'N/D';
        const giorni = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
        const mesi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
        
        const giorno = data.getDate();
        const mese = mesi[data.getMonth()];
        const anno = data.getFullYear();
        
        return `${giorno} ${mese} ${anno}`;
    } catch (e) {
        return 'N/D';
    }
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

    

    calcolaOreDaPreventivo(valorePreventivo) {
    if (!valorePreventivo || valorePreventivo <= 0) return 0;
    
    const ore = valorePreventivo / TARIFFA_ORARIA;
    return parseFloat(ore.toFixed(2)); // 2 decimali per precisione
}

async aggiornaMonitorCommesse(filtroStato = '', filtroNome = '', filtroAnno = '', filtroMese = '') {
    try {
        console.log('🔄 Aggiornamento monitor commesse con filtri:', {filtroStato, filtroNome, filtroAnno, filtroMese});
        
        const [tutteLeCommesse, tutteLeOre] = await Promise.all([
            this.firebaseService.getCollection("commesse"),
            this.firebaseService.getCollection("oreLavorate")
        ]);

        // Filtra commesse valide
        let commesseDaMostrare = tutteLeCommesse.filter(commessa => 
            commessa && typeof commessa === 'object' && commessa.nomeCommessa
        );
        
        // FILTRO PER NOME
        if (filtroNome && filtroNome.trim() !== '') {
            const filtroLowerCase = filtroNome.toLowerCase().trim();
            commesseDaMostrare = commesseDaMostrare.filter(commessa => 
                commessa.nomeCommessa.toLowerCase().includes(filtroLowerCase)
            );
        }
        
        // FILTRO PER STATO
        if (filtroStato === 'attive') {
            commesseDaMostrare = commesseDaMostrare.filter(c => c.stato === 'attiva' || !c.stato);
        } else if (filtroStato === 'concluse') {
            commesseDaMostrare = commesseDaMostrare.filter(c => c.stato === 'conclusa');
        }
        
        // NUOVO: FILTRO PER ANNO E MESE SULLA DATA DELLA COMMESSA (NON SULLE ORE)
        if (filtroAnno && filtroAnno !== '') {
            commesseDaMostrare = commesseDaMostrare.filter(commessa => {
                // Usa dataInizio se esiste, altrimenti dataCreazione, altrimenti non filtrare
                const dataCommessa = commessa.dataInizio || commessa.dataCreazione;
                if (!dataCommessa) return true; // Se non ha data, includila
                const annoCommessa = dataCommessa.split('-')[0];
                return annoCommessa === filtroAnno;
            });
        }
        
        if (filtroMese && filtroMese !== '') {
            commesseDaMostrare = commesseDaMostrare.filter(commessa => {
                const dataCommessa = commessa.dataInizio || commessa.dataCreazione;
                if (!dataCommessa) return true; // Se non ha data, includila
                const meseCommessa = dataCommessa.split('-')[1];
                return meseCommessa === filtroMese;
            });
        }

        const tbody = document.querySelector('#monitorCommesseTable tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';

        if (commesseDaMostrare.length === 0) {
            tbody.innerHTML = `<tr><td colspan="11" class="text-center">Nessuna commessa trovata con i filtri applicati</td></tr>`;
            return;
        }

        // Ordina: attive prima, poi per nome
        commesseDaMostrare.sort((a, b) => {
            const statoA = a.stato === 'attiva' ? 0 : 1;
            const statoB = b.stato === 'attiva' ? 0 : 1;
            if (statoA !== statoB) return statoA - statoB;
            return a.nomeCommessa.localeCompare(b.nomeCommessa);
        });

        // Calcola statistiche per ogni commessa (usa TUTTE le ore, senza filtri data)
        for (const commessa of commesseDaMostrare) {
            const statistiche = await this.calcolaStatisticheCommessa(commessa, tutteLeOre);
            const row = this.creaRigaMonitoraggio(commessa, statistiche);
            tbody.appendChild(row);
        }

        // Mostra info sui filtri applicati
        this.mostraInfoFiltriMonitorAggiornata(commesseDaMostrare.length, tutteLeCommesse.length, filtroNome, filtroStato, filtroAnno, filtroMese);
        
        this.mostraTabellaMonitoraggio();
        console.log('✅ Monitoraggio aggiornato con filtri su data commessa');

    } catch (error) {
        console.error('❌ Errore aggiornamento monitor:', error);
        ErrorHandler.showNotification('Errore nel caricamento del monitoraggio', 'error');
    }
}
mostraInfoFiltriMonitorAggiornata(commesseFiltrate, commesseTotali, filtroNome, filtroStato, filtroAnno, filtroMese) {
    // Rimuovi info precedenti
    const existingInfo = document.getElementById('infoFiltriMonitor');
    if (existingInfo) {
        existingInfo.remove();
    }

    // Crea solo se ci sono filtri attivi
    if (!filtroNome && !filtroStato && !filtroAnno && !filtroMese) return;

    const infoDiv = document.createElement('div');
    infoDiv.id = 'infoFiltriMonitor';
    infoDiv.className = 'alert alert-info py-2 mt-3';
    
    let infoText = `<strong>Filtri attivi:</strong> `;
    const filtriAttivi = [];
    
    if (filtroNome && filtroNome.trim() !== '') {
        filtriAttivi.push(`Commessa: "${filtroNome}"`);
    }
    if (filtroStato && filtroStato !== '') {
        const statoTesto = filtroStato === 'attive' ? 'Attive' : 'Concluse';
        filtriAttivi.push(`Stato: ${statoTesto}`);
    }
    if (filtroAnno && filtroAnno !== '') {
        filtriAttivi.push(`Anno commessa: ${filtroAnno}`);
    }
    if (filtroMese && filtroMese !== '') {
        const mesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 
                      'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
        const nomeMese = mesi[parseInt(filtroMese) - 1];
        filtriAttivi.push(`Mese commessa: ${nomeMese}`);
    }
    
    infoText += filtriAttivi.join(' • ');
    infoText += ` | <strong>Risultati:</strong> ${commesseFiltrate} di ${commesseTotali} commesse`;
    
    infoDiv.innerHTML = infoText;

    // Inserisci dopo la tabella
    const table = document.getElementById('monitorCommesseTable');
    if (table && table.parentNode) {
        table.parentNode.insertBefore(infoDiv, table.nextSibling);
    }
}
// NUOVO METODO: Calcola statistiche usando le ore filtrate per data
async calcolaStatisticheConFiltriData(commessa, oreFiltratePerData) {
    // VALORI DI DEFAULT
    let valorePreventivo = 0;
    let orePrevisteOriginali = 0;
    let oreIntegrazione = 0;
    let costiFornitori = 0;
    let oreLavorateTotali = 0;
    let oreNonConformita = 0;
    
    try {
        valorePreventivo = parseFloat(commessa.valorePreventivo) || 0;
        orePrevisteOriginali = parseFloat(commessa.oreTotaliPreviste) || 0;
        oreIntegrazione = parseFloat(commessa.oreIntegrazione) || 0;
        
        // RECUPERA I COSTI DEI FORNITORI
        try {
            const tutteLeLavorazioniFornitori = await this.firebaseService.getCollection("fornitoriLavorazioni");
            costiFornitori = tutteLeLavorazioniFornitori
                .filter(f => f.commessa === commessa.nomeCommessa)
                .reduce((tot, f) => tot + (parseFloat(f.costo) || 0), 0);
        } catch (e) {
            console.warn('Errore recupero fornitori:', e);
            costiFornitori = 0;
        }
        
        // Filtra ore per questa commessa
        const oreCommessa = oreFiltratePerData.filter(ore => 
            ore.commessa && ore.commessa.toLowerCase().trim() === commessa.nomeCommessa.toLowerCase().trim()
        );
        
        // Calcola ore lavorate
        oreLavorateTotali = oreCommessa.reduce((tot, ore) => {
            try {
                return tot + Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
            } catch (e) {
                return tot;
            }
        }, 0);
        
        // Calcola ore non conformità
        oreNonConformita = oreCommessa
            .filter(ore => ore.nonConformita === true)
            .reduce((tot, ore) => {
                try {
                    return tot + Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
                } catch (e) {
                    return tot;
                }
            }, 0);
            
    } catch (error) {
        console.error('Errore nel calcolo statistiche per:', commessa?.nomeCommessa, error);
    }
    
    // Calcoli finali (con valori di default sicuri)
    const costoCostoIntegrazione = oreIntegrazione * (window.TARIFFA_ORARIA || 28.50);
    const ricavoTotale = valorePreventivo + costoCostoIntegrazione;
    
    const costoDipendentiConformi = (oreLavorateTotali - oreNonConformita) * (window.TARIFFA_ORARIA || 28.50);
    const costoDipendentiNC = oreNonConformita * (window.COSTO_ORARIO_NON_CONFORMITA || 28.50);
    const costoDipendentiTotali = costoDipendentiConformi + costoDipendentiNC;
    
    const costoTotale = costoDipendentiTotali + costiFornitori;
    const margineEuro = ricavoTotale - costoTotale;
    const marginePercentuale = ricavoTotale > 0 ? (margineEuro / ricavoTotale) * 100 : 0;
    
    return {
        valorePreventivo: valorePreventivo,
        orePrevisteOriginali: orePrevisteOriginali,
        oreIntegrazione: oreIntegrazione,
        valoreAggiuntivoIntegrazione: costoCostoIntegrazione,
        ricavoTotale: ricavoTotale,
        oreLavorateTotali: oreLavorateTotali,
        oreNonConformita: oreNonConformita,
        costoDipendentiTotali: costoDipendentiTotali,
        costiFornitori: costiFornitori,
        costoTotale: costoTotale,
        margineEuro: margineEuro,
        marginePercentuale: marginePercentuale,
        hasIntegrazione: oreIntegrazione > 0,
        hasFornitori: costiFornitori > 0,
        dataInizio: commessa.dataInizio || null
    };
}
// NUOVO METODO: Mostra info filtri monitoraggio
mostraInfoFiltriMonitor(commesseFiltrate, commesseTotali, filtroNome, filtroStato, filtroAnno, filtroMese) {
    // Rimuovi info precedenti
    const existingInfo = document.getElementById('infoFiltriMonitor');
    if (existingInfo) {
        existingInfo.remove();
    }

    // Crea solo se ci sono filtri attivi
    if (!filtroNome && !filtroStato && !filtroAnno && !filtroMese) return;

    const infoDiv = document.createElement('div');
    infoDiv.id = 'infoFiltriMonitor';
    infoDiv.className = 'alert alert-info py-2 mt-3';
    
    let infoText = `<strong>Filtri attivi:</strong> `;
    const filtriAttivi = [];
    
    if (filtroNome && filtroNome.trim() !== '') {
        filtriAttivi.push(`Commessa: "${filtroNome}"`);
    }
    if (filtroStato && filtroStato !== '') {
        const statoTesto = filtroStato === 'attive' ? 'Attive' : 'Concluse';
        filtriAttivi.push(`Stato: ${statoTesto}`);
    }
    if (filtroAnno && filtroAnno !== '') {
        filtriAttivi.push(`Anno: ${filtroAnno}`);
    }
    if (filtroMese && filtroMese !== '') {
        const mesi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 
                      'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
        const nomeMese = mesi[parseInt(filtroMese) - 1];
        filtriAttivi.push(`Mese: ${nomeMese}`);
    }
    
    infoText += filtriAttivi.join(' • ');
    infoText += ` | <strong>Risultati:</strong> ${commesseFiltrate} di ${commesseTotali} commesse`;
    
    infoDiv.innerHTML = infoText;

    // Inserisci dopo la tabella
    const table = document.getElementById('monitorCommesseTable');
    if (table && table.parentNode) {
        table.parentNode.insertBefore(infoDiv, table.nextSibling);
    }
}
// ========== CALCOLO STATISTICHE CON INTEGRAZIONE ==========
// ========== CALCOLO STATISTICHE CON INTEGRAZIONE E FORNITORI ==========
async calcolaStatisticheConIntegrazione(commessa, tutteLeOre) {
    const valorePreventivo = parseFloat(commessa.valorePreventivo) || 0;
    const orePrevisteOriginali = parseFloat(commessa.oreTotaliPreviste) || 0;
    const oreIntegrazione = parseFloat(commessa.oreIntegrazione) || 0;
    const costoCostoIntegrazione = oreIntegrazione * TARIFFA_ORARIA;
    const ricavoTotale = valorePreventivo + costoCostoIntegrazione;
    
    // RECUPERA I COSTI DEI FORNITORI PER QUESTA COMMESSA
        const tutteLeLavorazioniFornitori = await this.firebaseService.getCollection("fornitoriLavorazioni");
    const costiFornitori = tutteLeLavorazioniFornitori
        .filter(f => f.commessa === commessa.nomeCommessa)
        .reduce((tot, f) => tot + f.costo, 0);
    
    // Filtra ore per questa commessa
    const oreCommessa = tutteLeOre.filter(ore => 
        ore.commessa && ore.commessa.toLowerCase().trim() === commessa.nomeCommessa.toLowerCase().trim()
    );
    
    // Calcola ore lavorate dai dipendenti interni
    const oreLavorateTotali = oreCommessa.reduce((tot, ore) => {
        return tot + Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
    }, 0);
    
    // Calcola ore non conformità
    const oreNonConformita = oreCommessa
        .filter(ore => ore.nonConformita === true)
        .reduce((tot, ore) => tot + Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine), 0);
    
    // COSTO DIPENDENTI INTERNI
    const costoDipendentiConformi = (oreLavorateTotali - oreNonConformita) * TARIFFA_ORARIA;
    const costoDipendentiNC = oreNonConformita * COSTO_ORARIO_NON_CONFORMITA;
    const costoDipendentiTotali = costoDipendentiConformi + costoDipendentiNC;
    
    // COSTO TOTALE (Dipendenti + Fornitori)
    const costoTotale = costoDipendentiTotali + costiFornitori;
    
    // MARGINE
    const margineEuro = ricavoTotale - costoTotale;
    const marginePercentuale = ricavoTotale > 0 ? (margineEuro / ricavoTotale) * 100 : 0;
    
    return {
        valorePreventivo,
        orePrevisteOriginali,
        oreIntegrazione,
        valoreAggiuntivoIntegrazione: costoCostoIntegrazione,
        ricavoTotale,
        oreLavorateTotali,
        oreNonConformita,
        costoDipendentiTotali,
        costiFornitori,        // NUOVO: costo totale fornitori
        costoTotale,           // NUOVO: somma dipendenti + fornitori
        margineEuro,
        marginePercentuale,
        hasIntegrazione: oreIntegrazione > 0,
        hasFornitori: costiFornitori > 0
    };
}

creaRigaMonitoraggio(commessa, stats) {
    const row = document.createElement('tr');
    const statoCommessa = commessa.stato || 'attiva';
    const isAttiva = statoCommessa === 'attiva';
    
    // Formattazione valori
    const valorePreventivo = stats?.valorePreventivo || 0;
    const valoreOreIntegrate = stats?.valoreOreIntegrate || 0;
    const ricavoTotale = stats?.ricavoTotale || valorePreventivo;
    const oreIntegrazione = stats?.oreIntegrazione || 0;
    const oreLavorateTotali = stats?.oreLavorateTotali || 0;
    const oreTotaliPreviste = stats?.oreTotaliPreviste || 0;
    const oreNonConformita = stats?.oreNonConformita || 0;
    const costoDipendentiTotali = stats?.costoDipendentiTotali || 0;
    const costiFornitori = stats?.costiFornitori || 0;
    const costoTotale = stats?.costoTotale || 0;
    const margineEuro = stats?.margineEuro || 0;
    const marginePercentuale = stats?.marginePercentuale || 0;
    const hasIntegrazione = stats?.hasIntegrazione || false;
    const hasFornitori = stats?.hasFornitori || false;
    
    // Calcolo dettaglio costi dipendenti
    const tariffaOraria = 28.50;
    const oreConformi = oreLavorateTotali - oreNonConformita;
    const costoOreConformi = oreConformi * tariffaOraria;
    const costoOreNonConformi = oreNonConformita * tariffaOraria;
    
    // Formattazione ore
    const oreLavFormattate = Utils.formattaOreDecimali(oreLavorateTotali);
    const orePrevFormattate = Utils.formattaOreDecimali(oreTotaliPreviste);
    const oreIntegrFormattate = Utils.formattaOreDecimali(oreIntegrazione);
    const oreNCFormattate = Utils.formattaOreDecimali(oreNonConformita);
    const oreConformiFormattate = Utils.formattaOreDecimali(oreConformi);
    
    // Colore margine
    let margineClass = 'text-success';
    let badgeClass = 'bg-success';
    if (marginePercentuale < 0) {
        margineClass = 'text-danger';
        badgeClass = 'bg-danger';
    } else if (marginePercentuale < 10) {
        margineClass = 'text-warning';
        badgeClass = 'bg-warning';
    } else if (marginePercentuale < 20) {
        margineClass = 'text-info';
        badgeClass = 'bg-info';
    }
    
    row.innerHTML = `
        <td style="min-width: 160px;">
            <strong>${this.escapeHtml(commessa.nomeCommessa)}</strong>
            <br><small class="text-muted">${this.escapeHtml(commessa.cliente || 'N/D')}</small>
            ${hasIntegrazione ? '<br><span class="badge bg-warning text-dark mt-1" style="font-size: 0.7rem;">💰 Integr.</span>' : ''}
            ${hasFornitori ? '<br><span class="badge bg-info mt-1" style="font-size: 0.7rem;">🏭 Forn.</span>' : ''}
        </td>
        <!-- PREVENTIVO + INTEGRAZIONE -->
        <td class="text-end" style="font-size: 0.85rem;">
            <div>
                <strong>€ ${valorePreventivo.toFixed(2)}</strong>
                ${hasIntegrazione ? `<br><small style="font-size: 0.7rem;">+ € ${valoreOreIntegrate.toFixed(2)}</small>` : ''}
                ${hasIntegrazione ? `<br><strong class="text-primary">€ ${ricavoTotale.toFixed(2)}</strong>` : ''}
            </div>
        </td>
        <!-- ORE LAVORATE / PREVISTE -->
        <td class="text-center" style="font-size: 0.85rem;">
            <div>
                <strong class="${oreLavorateTotali > oreTotaliPreviste ? 'text-danger' : ''}">
                    ${oreLavFormattate}
                </strong>
                <br><small style="font-size: 0.7rem;">/ ${orePrevFormattate}</small>
                ${hasIntegrazione ? `<br><small style="font-size: 0.7rem; color: #fd7e14;">+${oreIntegrFormattate}</small>` : ''}
            </div>
        </td>
        <!-- ORE NON CONFORMITÀ -->
        <td class="text-center ${oreNonConformita > 0 ? 'text-warning fw-bold' : ''}" style="font-size: 0.85rem;">
            ${oreNCFormattate}
            ${oreNonConformita > 0 ? '<br><small style="font-size: 0.65rem;">⚠️ NC</small>' : ''}
        </td>
        <!-- ORE INTEGRAZIONE -->
        <td class="text-center ${hasIntegrazione ? 'bg-warning bg-opacity-25' : ''}" style="font-size: 0.85rem;">
            ${hasIntegrazione ? `
                <div>
                    <strong class="text-success">+${oreIntegrFormattate}</strong>
                    <br><small style="font-size: 0.65rem;">€ ${valoreOreIntegrate.toFixed(2)}</small>
                </div>
            ` : `-`}
        </td>
        
        <!-- COSTO DIPENDENTI (DETTAGLIO ORE CONFORMI + NC) -->
        <td class="text-end" style="font-size: 0.85rem;">
            <div>
                <strong>€ ${costoDipendentiTotali.toFixed(2)}</strong>
                <br><small style="font-size: 0.65rem;">
                    ${oreConformiFormattate}h conf. (€ ${costoOreConformi.toFixed(2)})
                </small>
                ${oreNonConformita > 0 ? `
                    <br><small style="font-size: 0.65rem; color: #055f05;">
                        + ${oreNCFormattate}h NC (€ ${costoOreNonConformi.toFixed(2)})
                    </small>
                ` : ''}
            </div>
        </td>
        
        <!-- COSTO FORNITORI -->
        <td class="text-end ${hasFornitori ? 'bg-light' : ''}" style="font-size: 0.85rem;">
            ${hasFornitori ? `
                <div>
                    <strong>€ ${costiFornitori.toFixed(2)}</strong>
                    <br><small style="font-size: 0.65rem;">(fornitori esterni)</small>
                </div>
            ` : '-'}
        </td>
        
        <!-- COSTO TOTALE (DIPENDENTI + FORNITORI) -->
        <td class="text-end fw-bold" style="font-size: 0.85rem; background-color: #f8f9fa;">
            <div>
                <strong>€ ${costoTotale.toFixed(2)}</strong>
                <br><small style="font-size: 0.65rem;">
                    = dipendenti + fornitori
                </small>
            </div>
        </td>
        
        <!-- MARGINE € -->
        <td class="text-end ${margineClass} fw-bold" style="font-size: 0.85rem;">
            ${margineEuro >= 0 ? '+' : ''}€ ${margineEuro.toFixed(2)}
            <br><small style="font-size: 0.65rem;">
                su ricavo € ${ricavoTotale.toFixed(2)}
            </small>
        </td>
        
        <!-- MARGINE % -->
        <td class="text-end ${margineClass} fw-bold" style="font-size: 0.85rem;">
            ${marginePercentuale >= 0 ? '+' : ''}${marginePercentuale.toFixed(1)}%
            <div class="progress mt-1" style="height: 3px; width: 50px; margin: 0 auto;">
                <div class="progress-bar ${badgeClass}" style="width: ${Math.min(100, Math.max(0, 50 + marginePercentuale))}%"></div>
            </div>
        </td>
        
        <!-- AZIONI -->
        <td class="text-center" style="min-width: 100px;">
            <div class="btn-group-vertical btn-group-sm gap-1" role="group" style="gap: 4px;">
                <span class="badge ${isAttiva ? 'bg-success' : 'bg-secondary'} mb-1" style="font-size: 0.7rem;">
                    ${isAttiva ? 'ATTIVA' : 'CONCLUSA'}
                </span>
                
                <button class="btn btn-sm btn-outline-secondary btn-cambia-stato" 
                        data-id="${commessa.id}" 
                        data-stato="${statoCommessa}"
                        style="padding: 2px 6px; font-size: 0.7rem;"
                        title="${isAttiva ? 'Concludi commessa' : 'Riattiva commessa'}">
                    ${isAttiva ? '🔒' : '↩️'}
                </button>
                
                ${hasIntegrazione ? `
                    <button class="btn btn-sm btn-outline-warning btn-modifica-integrazione" 
                            data-id="${commessa.id}" 
                            data-ore="${oreIntegrazione}"
                            style="padding: 2px 6px; font-size: 0.7rem;"
                            title="Modifica integrazione (${oreIntegrFormattate} ore)">
                        ✏️ ${oreIntegrFormattate}
                    </button>
                ` : `
                    <button class="btn btn-sm btn-outline-success btn-aggiungi-integrazione" 
                            data-id="${commessa.id}"
                            style="padding: 2px 6px; font-size: 0.7rem;"
                            title="Aggiungi integrazione">
                        ➕ Integr.
                    </button>
                `}
            </div>
        </td>
    `;
    
    // Event listeners
    const cambiaStatoBtn = row.querySelector('.btn-cambia-stato');
    const aggiungiIntegrBtn = row.querySelector('.btn-aggiungi-integrazione');
    const modificaIntegrBtn = row.querySelector('.btn-modifica-integrazione');
    
    if (cambiaStatoBtn) {
        cambiaStatoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const id = cambiaStatoBtn.dataset.id;
            const stato = cambiaStatoBtn.dataset.stato;
            this.cambiaStatoCommessa(id, stato);
        });
    }
    
    if (aggiungiIntegrBtn) {
        aggiungiIntegrBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const id = aggiungiIntegrBtn.dataset.id;
            this.aggiungiIntegrazione(id);
        });
    }
    
    if (modificaIntegrBtn) {
        modificaIntegrBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const id = modificaIntegrBtn.dataset.id;
            const ore = parseFloat(modificaIntegrBtn.dataset.ore);
            this.modificaIntegrazione(id, ore);
        });
    }
    
    return row;
}
// ========== METODI HELPER FORNITORI ==========

async vediDettaglioFornitori(nomeCommessa) {
    try {
        const tutteLeLavorazioni = await this.firebaseService.getCollection("fornitoriLavorazioni");
        const lavorazioniCommessa = tutteLeLavorazioni.filter(f => f.commessa === nomeCommessa);
        
        if (lavorazioniCommessa.length === 0) {
            ErrorHandler.showNotification("Nessuna lavorazione fornitore per questa commessa", 'info');
            return;
        }
        
        let dettaglioHtml = `<div class="p-3"><h6>Lavorazioni Fornitori - ${nomeCommessa}</h6><table class="table table-sm">`;
        dettaglioHtml += `<thead><tr><th>Fornitore</th><th>Costo</th><th>Descrizione</th><th>Data</th></tr></thead><tbody>`;
        
        lavorazioniCommessa.forEach(f => {
            dettaglioHtml += `<tr>
                <td>${this.escapeHtml(f.nomeFornitore)}</td>
                <td class="text-end">€ ${f.costo.toFixed(2)}</td>
                <td>${this.escapeHtml(f.descrizione || '-')}</td>
                <td>${f.data || '-'}</td>
            </tr>`;
        });
        
        const costoTotale = lavorazioniCommessa.reduce((tot, f) => tot + f.costo, 0);
        dettaglioHtml += `<tr class="table-primary"><td colspan="1"><strong>Totale</strong></td>
                          <td class="text-end"><strong>€ ${costoTotale.toFixed(2)}</strong></td>
                          <td colspan="2"></td></tr>`;
        dettaglioHtml += `</tbody></table>
                          <button class="btn btn-sm btn-secondary" onclick="this.parentElement.parentElement.remove()">Chiudi</button></div>`;
        
        // Crea un modal/dialog per mostrare il dettaglio
        const dialog = document.createElement('div');
        dialog.className = 'alert alert-info';
        dialog.style.position = 'fixed';
        dialog.style.top = '50%';
        dialog.style.left = '50%';
        dialog.style.transform = 'translate(-50%, -50%)';
        dialog.style.zIndex = '10000';
        dialog.style.minWidth = '500px';
        dialog.style.maxWidth = '90%';
        dialog.style.maxHeight = '80vh';
        dialog.style.overflow = 'auto';
        dialog.innerHTML = dettaglioHtml;
        
        document.body.appendChild(dialog);
        
    } catch (error) {
        ErrorHandler.handleError(error, 'visualizzazione dettaglio fornitori');
    }
}

async aggiungiFornitoreDaCommessa(nomeCommessa) {
    // Apri la sezione fornitori e pre-popola la commessa
    const fornitoreSection = document.querySelector('#fornitoriSection');
    if (fornitoreSection) {
        fornitoreSection.scrollIntoView({ behavior: 'smooth' });
    }
    
    const selectCommessa = document.getElementById('fornitoreCommessa');
    if (selectCommessa) {
        selectCommessa.value = nomeCommessa;
        // Trigger change event per eventuali validazioni
        const event = new Event('change');
        selectCommessa.dispatchEvent(event);
    }
    
    // Focus sul campo nome fornitore
    document.getElementById('fornitoreNome').focus();
}

// ========== METODI PER GESTIRE INTEGRAZIONE ==========
async aggiungiIntegrazione(commessaId) {
    try {
        const oreInput = prompt("Inserisci le ore di integrazione (es: 10.5 per 10 ore e 30 minuti):", "0");
        if (oreInput === null) return;
        
        let oreIntegrazione = parseFloat(oreInput.replace(',', '.'));
        if (isNaN(oreIntegrazione) || oreIntegrazione < 0) {
            ErrorHandler.showNotification("Inserisci un numero valido", 'error');
            return;
        }
        
        oreIntegrazione = Math.round(oreIntegrazione * 100) / 100;
        
        await this.firebaseService.updateDocument("commesse", commessaId, {
            oreIntegrazione: oreIntegrazione,
            dataUltimaModifica: new Date().toISOString()
        });
        
        ErrorHandler.showNotification(
            oreIntegrazione > 0 ? `✅ +${oreIntegrazione} ore di integrazione aggiunte` : '🗑️ Integrazione rimossa',
            'success'
        );
        
        await this.aggiornaMonitorCommesse();
        
    } catch (error) {
        ErrorHandler.handleError(error, 'aggiunta integrazione');
    }
}
async modificaIntegrazione(commessaId, oreCorrenti) {
    try {
        const oreCorrentiFormattate = Utils.formattaOreDecimali(oreCorrenti);
        const nuovoInput = prompt(
            `Ore integrazione attuali: ${oreCorrentiFormattate}\n\nNuovo valore (0 per rimuovere):`,
            oreCorrenti.toString().replace('.', ',')
        );
        
        if (nuovoInput === null) return;
        
        let oreIntegrazione = parseFloat(nuovoInput.replace(',', '.'));
        if (isNaN(oreIntegrazione) || oreIntegrazione < 0) {
            ErrorHandler.showNotification("Inserisci un numero valido", 'error');
            return;
        }
        
        oreIntegrazione = Math.round(oreIntegrazione * 100) / 100;
        
        await this.firebaseService.updateDocument("commesse", commessaId, {
            oreIntegrazione: oreIntegrazione,
            dataUltimaModifica: new Date().toISOString()
        });
        
        ErrorHandler.showNotification(
            oreIntegrazione > 0 ? `✅ Integrazione aggiornata: +${oreIntegrazione} ore` : '🗑️ Integrazione rimossa',
            'success'
        );
        
        await this.aggiornaMonitorCommesse();
        
    } catch (error) {
        ErrorHandler.handleError(error, 'modifica integrazione');
    }
}

// ========== UTILITY ==========
escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
// ========== METODI PER GESTIONE FORNITORI ==========

async caricaFornitori() {
    try {
        this.datiTotaliFornitori = await this.firebaseService.getCollection("fornitoriLavorazioni");
        await this.aggiornaTabellaFornitori();
    } catch (error) {
        console.error('Errore caricamento fornitori:', error);
        this.datiTotaliFornitori = [];
    }
}

async aggiornaTabellaFornitori() {
    const tbody = document.querySelector('#fornitoriTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    try {
        const fornitori = await this.firebaseService.getCollection("fornitoriLavorazioni");
        
        if (fornitori.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center">Nessuna lavorazione fornitore registrata</td></tr>`;
            return;
        }
        
        for (const fornitore of fornitori) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${this.escapeHtml(fornitore.nomeFornitore)}</td>
                <td>${this.escapeHtml(fornitore.commessa)}</td>
                <td class="text-end">€ ${fornitore.costo.toFixed(2)}</td>
                <td>${this.escapeHtml(fornitore.descrizione || '-')}</td>
                <td>${fornitore.data || '-'}</td>
                <td>
                    <button class="btn btn-sm btn-danger btnEliminaFornitore" data-id="${fornitore.id}">
                        <i class="fas fa-trash"></i> Elimina
                    </button>
                </td>
            `;
            tbody.appendChild(row);
            
            row.querySelector('.btnEliminaFornitore').addEventListener('click', () => 
                this.eliminaLavorazioneFornitore(fornitore.id)
            );
        }
    } catch (error) {
        console.error('Errore aggiornamento tabella fornitori:', error);
        tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">Errore nel caricamento</td></tr>`;
    }
}

async aggiungiLavorazioneFornitore(e) {
    e.preventDefault();
    
    try {
        const nomeFornitore = document.getElementById('fornitoreNome').value.trim();
        const commessa = document.getElementById('fornitoreCommessa').value;
        const costo = parseFloat(document.getElementById('fornitoreCosto').value);
        const descrizione = document.getElementById('fornitoreDescrizione').value.trim();
        const data = document.getElementById('fornitoreData').value || new Date().toISOString().split('T')[0];
        
        if (!nomeFornitore || !commessa || isNaN(costo) || costo <= 0) {
            ErrorHandler.showNotification("Compila tutti i campi obbligatori", 'error');
            return;
        }
        
        await this.firebaseService.addDocument("fornitoriLavorazioni", {
            nomeFornitore: nomeFornitore,
            commessa: commessa,
            costo: costo,
            descrizione: descrizione,
            data: data,
            dataCreazione: new Date().toISOString()
        });
        
        ErrorHandler.showNotification(`Lavorazione fornitore "${nomeFornitore}" aggiunta con successo!`, 'success');
        
        // Reset form
        document.getElementById('fornitoreForm').reset();
        
        // Aggiorna visualizzazioni
        await this.caricaFornitori();
        await this.aggiornaMonitorCommesse();
        
    } catch (error) {
        ErrorHandler.handleError(error, 'aggiunta lavorazione fornitore');
    }
}

async eliminaLavorazioneFornitore(id) {
    if (confirm("Sei sicuro di voler eliminare questa lavorazione fornitore?")) {
        try {
            await this.firebaseService.deleteDocument("fornitoriLavorazioni", id);
            ErrorHandler.showNotification("Lavorazione fornitore eliminata", 'success');
            await this.caricaFornitori();
            await this.aggiornaMonitorCommesse();
        } catch (error) {
            ErrorHandler.handleError(error, 'eliminazione lavorazione fornitore');
        }
    }
}

async popolaSelectCommessePerFornitore() {
    const select = document.getElementById('fornitoreCommessa');
    if (!select) return;
    
    select.innerHTML = '<option value="">Seleziona una commessa</option>';
    
    try {
        const commesse = await this.firebaseService.getCollection("commesse");
        const commesseAttive = commesse.filter(c => c.stato === 'attiva' || !c.stato);
        
        commesseAttive.forEach(commessa => {
            const option = document.createElement('option');
            option.value = commessa.nomeCommessa;
            option.textContent = `${commessa.nomeCommessa} - ${commessa.cliente || 'N/D'}`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('Errore caricamento commesse per fornitore:', error);
    }
}

// AGGIUNGI questo metodo per pulire tutto e ricominciare
async resetCompletoMonitoraggio() {
    try {
        console.log('🔄 Reset completo monitoraggio...');
        
        // Pulisci tutta la cache
        stateManager.clearCache();
        
        // Forza il reload dei dati
        this.datiTotaliCommesse = [];
        this.datiTotaliOre = [];
        
        // Ricarica il monitoraggio
        await this.aggiornaMonitorCommesse();
        
        ErrorHandler.showNotification('Monitoraggio resettato e ricaricato', 'success');
        
    } catch (error) {
        ErrorHandler.handleError(error, 'reset completo monitoraggio');
    }
}
// AGGIUNGI questo metodo per correggere le commesse senza preventivo
async correggiCommesseSenzaPreventivo() {
    try {
        const commesse = await this.firebaseService.getCollection("commesse");
        const commesseSenzaPreventivo = commesse.filter(c => 
            !c.valorePreventivo || c.valorePreventivo <= 0
        );

        console.log(`🔧 Trovate ${commesseSenzaPreventivo.length} commesse senza preventivo`);

        for (const commessa of commesseSenzaPreventivo) {
            const nuovoPreventivo = parseFloat(
                prompt(`Inserisci il valore preventivo per "${commessa.nomeCommessa}":`, "0.00")
            );
            
            if (!isNaN(nuovoPreventivo) && nuovoPreventivo > 0) {
                const oreTotaliPreviste = this.calcolaOreDaPreventivo(nuovoPreventivo);
                
                await this.firebaseService.updateDocument("commesse", commessa.id, {
                    valorePreventivo: nuovoPreventivo,
                    oreTotaliPreviste: oreTotaliPreviste,
                    dataUltimaModifica: new Date().toISOString()
                });
                
                console.log(`✅ Commessa "${commessa.nomeCommessa}" corretta: €${nuovoPreventivo}`);
            }
        }

        if (commesseSenzaPreventivo.length > 0) {
            ErrorHandler.showNotification(
                `${commesseSenzaPreventivo.length} commesse corrette con preventivo`, 
                'success'
            );
            await this.aggiornaMonitorCommesse();
        }

    } catch (error) {
        ErrorHandler.handleError(error, 'correzione commesse senza preventivo');
    }
}
// METODO DEBUG
async debugCommesse() {
    const commesse = await this.firebaseService.getCollection("commesse");
    
    console.log('=== DEBUG COMMESSE ===');
    commesse.forEach((c, index) => {
        console.log(`${index + 1}. ${c.nomeCommessa}:`, {
            id: c.id,
            preventivo: c.valorePreventivo,
            orePreviste: c.oreTotaliPreviste,
            stato: c.stato,
            hasPreventivo: !!c.valorePreventivo && c.valorePreventivo > 0
        });
    });
    
    const conPreventivo = commesse.filter(c => c.valorePreventivo > 0).length;
    const senzaPreventivo = commesse.filter(c => !c.valorePreventivo || c.valorePreventivo <= 0).length;
    
    alert(`Debug Commesse:\n- Con preventivo: ${conPreventivo}\n- Senza preventivo: ${senzaPreventivo}\n- Totale: ${commesse.length}\n\nControlla la console per i dettagli.`);
}
// NUOVO METODO: Popola la datalist delle commesse
async popolaDatalistCommesse(commesse) {
    const datalist = document.getElementById('listaCommesse');
    if (!datalist) return;

    // Pulisci la datalist
    datalist.innerHTML = '';

    // Estrai tutti i nomi commessa unici
    const nomiCommesse = [...new Set(commesse
        .filter(c => c && c.nomeCommessa)
        .map(c => c.nomeCommessa)
        .sort()
    )];

    // Aggiungi le opzioni alla datalist
    nomiCommesse.forEach(nome => {
        const option = document.createElement('option');
        option.value = nome;
        datalist.appendChild(option);
    });

    console.log(`📝 Datalist popolata con ${nomiCommesse.length} commesse`);
}
// NUOVO METODO: Mostra informazioni sui filtri applicati
mostraInfoFiltri(commesseFiltrate, commesseTotali, filtroNome, filtroStato) {
    // Rimuovi info precedenti
    const existingInfo = document.getElementById('infoFiltriMonitor');
    if (existingInfo) {
        existingInfo.remove();
    }

    // Crea solo se ci sono filtri attivi
    if (!filtroNome && !filtroStato) return;

    const infoDiv = document.createElement('div');
    infoDiv.id = 'infoFiltriMonitor';
    infoDiv.className = 'alert alert-info py-2 mt-3';
    
    let infoText = `<strong>Filtri attivi:</strong> `;
    const filtriAttivi = [];
    
    if (filtroNome) {
        filtriAttivi.push(`Commessa: "${filtroNome}"`);
    }
    
    if (filtroStato) {
        const statoTesto = filtroStato === 'attive' ? 'Attive' : 'Concluse';
        filtriAttivi.push(`Stato: ${statoTesto}`);
    }
    
    infoText += filtriAttivi.join(' • ');
    infoText += ` | <strong>Risultati:</strong> ${commesseFiltrate} di ${commesseTotali} commesse`;
    
    infoDiv.innerHTML = infoText;

    // Inserisci dopo la tabella
    const table = document.getElementById('monitorCommesseTable');
    if (table) {
        table.parentNode.insertBefore(infoDiv, table.nextSibling);
    }
}
// NUOVO METODO: Pulisci commesse corrotte
async pulisciCommesseCorrotte() {
    try {
        const commesse = await this.firebaseService.getCollection("commesse");
        let commesseCorrotte = 0;

        for (const commessa of commesse) {
            // Verifica se la commessa è valida
            if (!commessa || typeof commessa !== 'object' || !commessa.nomeCommessa) {
                console.warn('Commessa corrotta trovata:', commessa);
                commesseCorrotte++;
                
                // Opzionale: elimina commesse corrotte
                if (confirm(`Trovata commessa corrotta. Eliminare?`)) {
                    await this.firebaseService.deleteDocument("commesse", commessa.id);
                    console.log('Commessa corrotta eliminata:', commessa.id);
                }
            }
        }

        if (commesseCorrotte > 0) {
            ErrorHandler.showNotification(`Trovate ${commesseCorrotte} commesse corrotte`, 'warning');
        } else {
            ErrorHandler.showNotification('Nessuna commessa corrotta trovata', 'success');
        }
    } catch (error) {
        ErrorHandler.handleError(error, 'pulizia commesse corrotte');
    }
}



// AGGIUNGI questo metodo per testare il calcolo
testCalcoloMargine() {
    const testCommessa = {
        nomeCommessa: "TEST",
        valorePreventivo: 1000,
        oreTotaliPreviste: 35
    };

    const testOre = [
        { commessa: "TEST", oraInizio: "08:00", oraFine: "12:00", nonConformita: false },
        { commessa: "TEST", oraInizio: "13:00", oraFine: "17:00", nonConformita: true }
    ];

    const stats = this.calcolaStatisticheCommessa(testCommessa, testOre);
    
    console.log('🧪 TEST CALCOLO MARGINE:', stats);
    alert(`Test Margine:\n- Preventivo: €${stats.valorePreventivo}\n- Costo Ore: €${stats.costoOreTotale}\n- Margine €: €${stats.margineEuro}\n- Margine %: ${stats.marginePercentuale}%`);
}
// ASSICURATI che il metodo creaStatisticheVuote sia così:
creaStatisticheVuote(commessa = null) {
    return {
        oreLavorateTotali: 0,
        oreNonConformita: 0,
        oreConformi: 0,
        costoOreTotale: 0,
        margineEuro: 0,
        marginePercentuale: 0,
        valorePreventivo: commessa ? (parseFloat(commessa.valorePreventivo) || 0) : 0,
        oreTotaliPreviste: commessa ? (parseFloat(commessa.oreTotaliPreviste) || 0) : 0, // CORRETTO
        datiCompleti: false,
        numeroRecord: 0
    };
}
// AGGIUNGI QUESTO METODO PER CORREGGERE LE COMMESSE ESISTENTI
// AGGIUNGI QUESTO METODO ALLA CLASSE OreLavorateApp
async correggiCommesseEsistenti() {
    try {
        console.log('🔄 Correzione automatica commesse esistenti...');
        
        const tutteLeCommesse = await this.firebaseService.getCollection("commesse");
        let commesseCorrette = 0;
        let commesseConProblemi = 0;
        
        const risultati = [];

        for (const commessa of tutteLeCommesse) {
            try {
                let needsUpdate = false;
                const updateData = {};

                // 1. Calcola oreTotaliPreviste se manca o è 0 ma c'è il preventivo
                if (commessa.valorePreventivo && commessa.valorePreventivo > 0) {
                    const oreCalcolate = this.calcolaOreDaPreventivo(commessa.valorePreventivo);
                    
                    if (!commessa.oreTotaliPreviste || commessa.oreTotaliPreviste === 0) {
                        updateData.oreTotaliPreviste = oreCalcolate;
                        needsUpdate = true;
                        console.log(`📊 Commessa "${commessa.nomeCommessa}": calcolate ${oreCalcolate} ore da €${commessa.valorePreventivo}`);
                    }
                }

                // 2. Assicurati che tutte le commesse abbiano uno stato
                if (!commessa.stato) {
                    updateData.stato = 'attiva';
                    needsUpdate = true;
                    console.log(`🏷️ Commessa "${commessa.nomeCommessa}": aggiunto stato "attiva"`);
                }

                // 3. Aggiungi dataUltimaModifica se manca
                if (!commessa.dataUltimaModifica) {
                    updateData.dataUltimaModifica = new Date().toISOString();
                    needsUpdate = true;
                }

                // 4. Aggiungi dataCreazione se manca
                if (!commessa.dataCreazione) {
                    updateData.dataCreazione = new Date().toISOString();
                    needsUpdate = true;
                }

                if (needsUpdate) {
                    await this.firebaseService.updateDocument("commesse", commessa.id, updateData);
                    commesseCorrette++;
                    
                    risultati.push({
                        nome: commessa.nomeCommessa,
                        azioni: Object.keys(updateData),
                        preventivo: commessa.valorePreventivo,
                        oreCalcolate: updateData.oreTotaliPreviste
                    });
                }

            } catch (error) {
                console.error(`❌ Errore nella commessa ${commessa.nomeCommessa}:`, error);
                commesseConProblemi++;
            }
        }

        // Mostra report
        this.mostraReportCorrezione(commesseCorrette, commesseConProblemi, risultati);
        
        return { commesseCorrette, commesseConProblemi, risultati };

    } catch (error) {
        console.error('❌ Errore nella correzione commesse:', error);
        ErrorHandler.handleError(error, 'correzione commesse esistenti');
        return { commesseCorrette: 0, commesseConProblemi: 0, risultati: [] };
    }
}

// METODO PER MOSTRARE IL REPORT DI CORREZIONE
mostraReportCorrezione(commesseCorrette, commesseConProblemi, risultati) {
    if (commesseCorrette === 0 && commesseConProblemi === 0) {
        console.log('✅ Tutte le commesse sono già corrette');
        return;
    }

    const reportContainer = document.createElement('div');
    reportContainer.className = 'alert alert-info diagnostica-report';
    reportContainer.innerHTML = `
        <h5>🔧 Correzione Automatica Commesse</h5>
        <div class="row">
            <div class="col-md-6">
                <strong>Commesse corrette:</strong> ${commesseCorrette}
            </div>
            <div class="col-md-6">
                <strong>Commesse con problemi:</strong> ${commesseConProblemi}
            </div>
        </div>
        ${risultati.length > 0 ? `
            <div class="mt-3">
                <h6>Dettaglio correzioni:</h6>
                <div class="table-responsive">
                    <table class="table table-sm table-bordered">
                        <thead>
                            <tr>
                                <th>Commessa</th>
                                <th>Preventivo</th>
                                <th>Ore Calcolate</th>
                                <th>Azioni</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${risultati.slice(0, 10).map(r => `
                                <tr>
                                    <td>${r.nome}</td>
                                    <td>€ ${r.preventivo?.toFixed(2) || '0.00'}</td>
                                    <td>${r.oreCalcolate || 'N/D'} ore</td>
                                    <td>${r.azioni.join(', ')}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                ${risultati.length > 10 ? `<small>... e altre ${risultati.length - 10} commesse</small>` : ''}
            </div>
        ` : ''}
        <div class="mt-2">
            <button class="btn btn-sm btn-success" onclick="this.parentElement.parentElement.remove()">
                ✅ Chiudi
            </button>
        </div>
    `;

    // Inserisci nel DOM
    const appContent = document.getElementById('appContent');
    if (appContent) {
        appContent.insertBefore(reportContainer, appContent.firstChild);
    }

    if (commesseCorrette > 0) {
        ErrorHandler.showNotification(
            `${commesseCorrette} commesse corrette automaticamente!`, 
            'success'
        );
    }
}
// SOSTITUISCI COMPLETAMENTE il metodo creaRigaMonitorCommessa
// SOSTITUISCI COMPLETAMENTE il metodo creaRigaMonitorCommessa
creaRigaMonitorCommessa(commessa, statistiche) {
    if (!commessa || !commessa.nomeCommessa) {
        console.error('❌ Commessa non valida per creazione riga:', commessa);
        const row = document.createElement('tr');
        row.innerHTML = '<td colspan="8" class="text-center text-danger">Dati commessa non validi</td>';
        return row;
    }

    const row = document.createElement('tr');
    const statoCorrente = commessa.stato || 'attiva';
    
    // DEBUG: verifica i dati delle statistiche
    console.log('📊 Dati statistiche per riga:', {
        nome: commessa.nomeCommessa,
        preventivo: statistiche.valorePreventivo,
        margineEuro: statistiche.margineEuro,
        marginePercentuale: statistiche.marginePercentuale,
        datiCompleti: statistiche.datiCompleti,
        hasPreventivo: statistiche.valorePreventivo > 0
    });

    // Aggiungi classi CSS in base allo stato
    if (statoCorrente === 'conclusa') {
        row.classList.add('commessa-conclusa', 'table-secondary');
    }

    // VERIFICA: quando mostrare i margini
    const mostraMargini = statistiche.datiCompleti && statistiche.valorePreventivo > 0;
    
    console.log('🔍 Condizione margini:', {
        nome: commessa.nomeCommessa,
        mostraMargini: mostraMargini,
        datiCompleti: statistiche.datiCompleti,
        valorePreventivo: statistiche.valorePreventivo
    });

    // Se NON mostrare i margini (mancanza preventivo o preventivo = 0)
    if (!mostraMargini) {
        console.log('❌ Nascondendo margini per:', commessa.nomeCommessa);
        row.innerHTML = `
            <td>
                <strong>${commessa.nomeCommessa}</strong>
                <br><small class="text-muted">${commessa.cliente || 'Cliente non specificato'}</small>
                ${statistiche.valorePreventivo > 0 ? 
                    `<br><small class="text-info">€ ${statistiche.valorePreventivo.toFixed(2)} preventivo</small>` : 
                    '<br><span class="badge badge-warning">⚠️ Senza preventivo</span>'
                }
            </td>
            <td class="text-center">
                ${statistiche.valorePreventivo > 0 ? 
                    `<strong>€ ${statistiche.valorePreventivo.toFixed(2)}</strong>` : 
                    '<small class="text-muted">N/D</small>'
                }
            </td>
            <td class="text-center">
                <strong>${Utils.formattaOreDecimali(statistiche.oreLavorateTotali)}</strong>
                <br><small>ore lavorate</small>
            </td>
            <td class="text-center ${statistiche.oreNonConformita > 0 ? 'text-warning' : ''}">
                ${Utils.formattaOreDecimali(statistiche.oreNonConformita)}
                <br><small>ore NC</small>
            </td>
            <td class="text-center">
                <strong>€ ${statistiche.costoOreTotale.toFixed(2)}</strong>
                <br><small class="text-muted">costo totale</small>
            </td>
            <td class="text-center text-muted">
                <small>N/D</small>
            </td>
            <td class="text-center text-muted">
                <small>N/D</small>
            </td>
            <td class="text-center">
                <div class="d-flex flex-column gap-1">
                    <span class="badge ${statoCorrente === 'attiva' ? 'badge-attiva' : 'badge-conclusa'}">
                        ${statoCorrente === 'attiva' ? '📊 ATTIVA' : '✅ CONCLUSA'}
                    </span>
                    ${statistiche.valorePreventivo <= 0 ? 
                        `<button class="btn btn-sm btn-outline-warning mt-1" 
                                onclick="app.correggiCommessa('${commessa.id}')">
                            <i class="fas fa-edit"></i> Aggiungi Preventivo
                        </button>` : 
                        ''
                    }
                </div>
            </td>
        `;
        return row;
    }

    // SE ARRIVIAMO QUI, DOBBIAMO MOSTRARE I MARGINI
    console.log('✅ Mostrando margini per:', commessa.nomeCommessa);

    // CALCOLO STATO MARGINE (solo se abbiamo preventivo e dati completi)
    const statoMargine = this.getStatoMargine(statistiche);

    // DEBUG: verifica il calcolo del margine
    console.log('💰 Calcolo margine VISUALIZZATO:', {
        nome: commessa.nomeCommessa,
        preventivo: statistiche.valorePreventivo,
        costoOreTotale: statistiche.costoOreTotale,
        margineEuro: statistiche.margineEuro,
        marginePercentuale: statistiche.marginePercentuale,
        statoMargine: statoMargine
    });

    row.innerHTML = `
        <td>
            <div class="d-flex flex-column">
                <strong>${commessa.nomeCommessa}</strong>
                <small class="text-muted">${commessa.cliente || 'Cliente non specificato'}</small>
                <small class="text-info">
                    <i class="fas fa-clock"></i> 
                    ${Utils.formattaOreDecimali(statistiche.oreTotaliPreviste)} ore previste
                </small>
            </div>
        </td>
        <td class="text-center">
            <strong>€ ${statistiche.valorePreventivo.toFixed(2)}</strong>
        </td>
        <td class="text-center">
            <div class="d-flex flex-column align-items-center">
                <strong class="${statistiche.oreLavorateTotali > statistiche.oreTotaliPreviste ? 'text-danger' : ''}">
                    ${Utils.formattaOreDecimali(statistiche.oreLavorateTotali)}
                </strong>
                <small>ore</small>
                ${statistiche.oreLavorateTotali > statistiche.oreTotaliPreviste ? 
                    '<span class="badge badge-danger badge-sm">⚠️ Oltre</span>' : ''}
            </div>
        </td>
        <td class="text-center ${statistiche.oreNonConformita > 0 ? 'text-warning' : ''}">
            <div class="d-flex flex-column align-items-center">
                <strong>${Utils.formattaOreDecimali(statistiche.oreNonConformita)}</strong>
                <small>ore NC</small>
                ${statistiche.oreNonConformita > 0 ? 
                    `<small class="text-warning">€ ${(statistiche.oreNonConformita * COSTO_ORARIO_NON_CONFORMITA).toFixed(2)}</small>` : ''}
            </div>
        </td>
        <td class="text-center">
            <strong>€ ${statistiche.costoOreTotale.toFixed(2)}</strong>
            <br><small class="text-muted">costo totale</small>
        </td>
        <td class="text-center ${statoMargine.classeTesto}">
            <strong>€ ${statistiche.margineEuro >= 0 ? '+' : ''}${statistiche.margineEuro.toFixed(2)}</strong>
            <br><small class="${statistiche.margineEuro >= 0 ? 'text-success' : 'text-danger'}">
                ${statistiche.margineEuro >= 0 ? 'guadagno' : 'perdita'}
            </small>
        </td>
        <td class="text-center ${statoMargine.classeTesto}">
            <div class="d-flex flex-column align-items-center">
                <strong>${statistiche.marginePercentuale >= 0 ? '+' : ''}${statistiche.marginePercentuale.toFixed(1)}%</strong>
                <div class="progress mt-1" style="height: 6px; width: 80px;">
                    <div class="progress-bar ${statoMargine.classeProgress}" 
                         style="width: ${Math.min(100, Math.max(0, 50 + statistiche.marginePercentuale))}%">
                    </div>
                </div>
            </div>
        </td>
        <td class="text-center">
            <div class="d-flex flex-column gap-1 align-items-center">
                <!-- Stato Margine -->
                <span class="badge ${statoMargine.classe}">${statoMargine.testo}</span>
                
                <!-- Stato Commessa -->
                <span class="badge ${statoCorrente === 'attiva' ? 'badge-attiva' : 'badge-conclusa'}">
                    ${statoCorrente === 'attiva' ? '📊 ATTIVA' : '✅ CONCLUSA'}
                </span>
                
                <!-- Non Conformità -->
                ${statistiche.oreNonConformita > 0 ? 
                    '<span class="badge badge-warning badge-sm">⚠️ NC</span>' : ''}
                
                <!-- Pulsante Azione -->
                <button class="btn btn-sm btn-outline-secondary mt-1" 
                        onclick="app.cambiaStatoCommessa('${commessa.id}', '${statoCorrente}')">
                    ${statoCorrente === 'attiva' ? '🔒 Concludi' : '↩️ Riattiva'}
                </button>
            </div>
        </td>
    `;
    
    return row;
    // Determina se ha integrazione
    const hasIntegrazione = statistiche.hasIntegrazione;
    const oreIntegrazione = statistiche.oreIntegrazione;
    const costoIntegrazione = statistiche.costoOreIntegrazione;
    const oreIntegrazioneFormattate = Utils.formattaOreDecimali(oreIntegrazione);
    
    // Calcola se le ore lavorate superano quelle previste (considerando integrazione)
    const oreTotaliDisponibili = statistiche.oreTotaliPrevisteConIntegrazione;
    const superamentoOre = statistiche.oreLavorateTotali > oreTotaliDisponibili;
    
    row.innerHTML = `
        <td>
            <div class="d-flex flex-column">
                <strong>${commessa.nomeCommessa}</strong>
                <small class="text-muted">${commessa.cliente || 'Cliente non specificato'}</small>
                <small class="text-info">
                    <i class="fas fa-clock"></i> 
                    ${Utils.formattaOreDecimali(statistiche.oreTotaliPreviste)} ore previste
                    ${hasIntegrazione ? `<br><span class="text-warning">➕ +${oreIntegrazioneFormattate} ore integrazione</span>` : ''}
                </small>
            </div>
        </td>
        <td class="text-center">
            <strong>€ ${statistiche.valorePreventivo.toFixed(2)}</strong>
        </td>
        <td class="text-center">
            <div class="d-flex flex-column align-items-center">
                <strong class="${superamentoOre ? 'text-danger' : ''}">
                    ${Utils.formattaOreDecimali(statistiche.oreLavorateTotali)}
                </strong>
                <small>ore</small>
                ${superamentoOre ? '<span class="badge badge-danger badge-sm">⚠️ Oltre</span>' : ''}
                ${hasIntegrazione ? `<small class="text-warning">su ${Utils.formattaOreDecimali(oreTotaliDisponibili)} totali</small>` : ''}
            </div>
        </td>
        <td class="text-center ${statistiche.oreNonConformita > 0 ? 'text-warning' : ''}">
            <div class="d-flex flex-column align-items-center">
                <strong>${Utils.formattaOreDecimali(statistiche.oreNonConformita)}</strong>
                <small>ore NC</small>
            </div>
        </td>
        
        <!-- NUOVA COLONNA ORE INTEGRAZIONE -->
        <td class="text-center ${hasIntegrazione ? 'table-warning' : ''}">
            <div class="d-flex flex-column align-items-center">
                ${hasIntegrazione ? `
                    <strong class="text-warning">+${oreIntegrazioneFormattate}</strong>
                    <small class="text-muted">(+€ ${costoIntegrazione.toFixed(2)})</small>
                    <button class="btn btn-sm btn-outline-warning mt-1" 
                            onclick="app.modificaOreIntegrazione('${commessa.id}', ${oreIntegrazione})">
                        <i class="fas fa-edit"></i> Modifica
                    </button>
                ` : `
                    <button class="btn btn-sm btn-outline-success mt-1" 
                            onclick="app.aggiungiOreIntegrazione('${commessa.id}')">
                        <i class="fas fa-plus-circle"></i> Aggiungi
                    </button>
                `}
            </div>
        </td>
        
        <td class="text-center">
            <strong>€ ${statistiche.costoOreTotale.toFixed(2)}</strong>
            ${hasIntegrazione ? `<br><small class="text-warning">(incl. +€${costoIntegrazione.toFixed(2)})</small>` : ''}
        </td>
        
        <!-- Margine € e % come già presenti -->
        <td class="text-center ${statoMargine.classeTesto}">
            <strong>€ ${statistiche.margineEuro >= 0 ? '+' : ''}${statistiche.margineEuro.toFixed(2)}</strong>
        </td>
        <td class="text-center ${statoMargine.classeTesto}">
            <strong>${statistiche.marginePercentuale >= 0 ? '+' : ''}${statistiche.marginePercentuale.toFixed(1)}%</strong>
        </td>
        <td class="text-center">
            <!-- stato come già presente -->
        </td>
    `;
    
    return row;

}
// Metodo per aggiungere/modificare ore integrazione
async aggiungiOreIntegrazione(commessaId) {
    try {
        const oreAttuali = prompt("Inserisci le ore di integrazione per questa commessa (es: 10.5 per 10 ore e 30 minuti):", "0");
        
        if (oreAttuali === null) return; // Annulla
        
        let oreIntegrazione = parseFloat(oreAttuali.replace(',', '.'));
        
        if (isNaN(oreIntegrazione) || oreIntegrazione < 0) {
            ErrorHandler.showNotification("Inserisci un numero valido di ore", 'error');
            return;
        }
        
        // Arrotonda a 2 decimali
        oreIntegrazione = Math.round(oreIntegrazione * 100) / 100;
        
        await this.firebaseService.updateDocument("commesse", commessaId, {
            oreIntegrazione: oreIntegrazione,
            dataUltimaModifica: new Date().toISOString()
        });
        
        ErrorHandler.showNotification(
            oreIntegrazione > 0 
                ? `✅ Ore integrazione: +${Utils.formattaOreDecimali(oreIntegrazione)} aggiunte` 
                : `🗑️ Ore integrazione rimosse`,
            'success'
        );
        
        // Aggiorna tutte le viste
        await this.aggiornaMonitorCommesse();
        await this.aggiornaTabellaCommesse();
        
    } catch (error) {
        ErrorHandler.handleError(error, 'aggiunta ore integrazione');
    }
}

// Metodo per modificare ore integrazione esistenti
async modificaOreIntegrazione(commessaId, oreCorrenti) {
    try {
        const nuoveOre = prompt(
            `Ore integrazione correnti: ${Utils.formattaOreDecimali(oreCorrenti)}\n\n` +
            `Inserisci il nuovo valore (0 per rimuovere):`, 
            oreCorrenti.toString().replace('.', ',')
        );
        
        if (nuoveOre === null) return;
        
        let oreIntegrazione = parseFloat(nuoveOre.replace(',', '.'));
        
        if (isNaN(oreIntegrazione) || oreIntegrazione < 0) {
            ErrorHandler.showNotification("Inserisci un numero valido di ore", 'error');
            return;
        }
        
        oreIntegrazione = Math.round(oreIntegrazione * 100) / 100;
        
        await this.firebaseService.updateDocument("commesse", commessaId, {
            oreIntegrazione: oreIntegrazione,
            dataUltimaModifica: new Date().toISOString()
        });
        
        ErrorHandler.showNotification(
            oreIntegrazione > 0 
                ? `✅ Ore integrazione aggiornate: +${Utils.formattaOreDecimali(oreIntegrazione)}` 
                : `🗑️ Ore integrazione rimosse`,
            'success'
        );
        
        await this.aggiornaMonitorCommesse();
        await this.aggiornaTabellaCommesse();
        
    } catch (error) {
        ErrorHandler.handleError(error, 'modifica ore integrazione');
    }
}
      // NUOVO METODO: Cambia stato commessa
  async cambiaStatoCommessa(commessaId, statoAttuale) {
    try {
        if (!commessaId) {
            ErrorHandler.showNotification("ID commessa non valido", 'error');
            return;
        }

        const nuovoStato = statoAttuale === 'attiva' ? 'conclusa' : 'attiva';
        const azioneTesto = nuovoStato === 'conclusa' ? 'concludere' : 'riattivare';
        
        const conferma = confirm(
            `Sei sicuro di voler ${azioneTesto} questa commessa?\n\n` +
            `La commessa ${nuovoStato === 'conclusa' ? 'non sarà più visibile ai dipendenti' : 'tornerà visibile ai dipendenti'}.`
        );
        
        if (!conferma) return;

        await this.firebaseService.updateDocument("commesse", commessaId, {
            stato: nuovoStato,
            dataUltimaModifica: new Date().toISOString()
        });

        ErrorHandler.showNotification(
            nuovoStato === 'conclusa' ? 
            'Commessa conclusa con successo!' : 
            'Commessa riattivata con successo!',
            'success'
        );
        
        // Ricarica i dati e resetta la paginazione per mostrare i dati aggiornati
        this.datiTotaliCommesse = [];
        if (this.paginazioneCommesse) {
            this.paginazioneCommesse.reset();
        }
        
        setTimeout(async () => {
            await this.aggiornaTabellaCommesse();
            await this.aggiornaMenuCommesse();
            await this.aggiornaMonitorCommesse();
        }, 500);

    } catch (error) {
        console.error('Errore nel cambio stato commessa:', error);
        ErrorHandler.handleError(error, 'cambio stato commessa');
    }
}
// Aggiungi questo metodo per debug
debugCommessaStato(commessa) {
    console.log('=== DEBUG COMMESSA ===');
    console.log('Nome:', commessa.nomeCommessa);
    console.log('ID:', commessa.id);
    console.log('Stato:', commessa.stato);
    console.log('Valore Preventivo:', commessa.valorePreventivo);
    console.log('Stato corrente calcolato:', commessa.stato || 'attiva');
    console.log('================');
}

// Aggiungi questo metodo per debug approfondito
debugDettaglioCommessa(commessaId) {
    try {
        const commesse = stateManager.getCache('commesse_all') || [];
        const commessa = commesse.find(c => c.id === commessaId);
        
        if (commessa) {
            console.log('=== DEBUG DETTAGLIO COMMESSA ===');
            console.log('ID:', commessa.id);
            console.log('Nome:', commessa.nomeCommessa);
            console.log('Stato:', commessa.stato);
            console.log('Stato calcolato:', commessa.stato || 'attiva');
            console.log('Valore Preventivo:', commessa.valorePreventivo);
            console.log('Ore Previste:', commessa.oreTotaliPreviste);
            console.log('Tutti i dati:', commessa);
            console.log('==============================');
        } else {
            console.error('Commessa non trovata con ID:', commessaId);
        }
    } catch (error) {
        console.error('Errore nel debug:', error);
    }
}

  


// Aggiungi questo metodo alla classe OreLavorateApp
async correggiCommessa(commessaId) {
    try {
        const docRef = doc(this.firebaseService.db, "commesse", commessaId);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
            ErrorHandler.showNotification("Commessa non trovata", 'error');
            return;
        }
        
        const commessa = docSnap.data();
        
        const nuovoValorePreventivo = parseFloat(
            prompt(`Inserisci il valore preventivo per "${commessa.nomeCommessa}":`, "0.00")
        );
        
        if (!isNaN(nuovoValorePreventivo) && nuovoValorePreventivo > 0) {
            const oreTotaliPreviste = this.calcolaOreDaPreventivo(nuovoValorePreventivo);
            
            await this.firebaseService.updateDocument("commesse", commessaId, {
                valorePreventivo: nuovoValorePreventivo,
                oreTotaliPreviste: oreTotaliPreviste
            });
            
            ErrorHandler.showNotification("Commessa corretta con successo!", 'success');
            await this.aggiornaMonitorCommesse();
            await this.aggiornaTabellaCommesse();
        }
    } catch (error) {
        ErrorHandler.handleError(error, 'correzione commessa');
    }
}

    getStatoCommessa(statistiche) {
        if (statistiche.oreLavorateTotali > statistiche.oreTotaliPreviste) {
            return { 
                testo: 'SOVRACOSTO', 
                classe: 'badge-danger',
                classeProgress: 'bg-danger'
            };
        } else if (statistiche.percentualeCompletamento >= 90) {
            return { 
                testo: 'IN ESURIMENTO', 
                classe: 'badge-warning',
                classeProgress: 'bg-warning'
            };
        } else if (statistiche.percentualeCompletamento >= 100) {
            return { 
                testo: 'COMPLETATA', 
                classe: 'badge-success',
                classeProgress: 'bg-success'
            };
        } else {
            return { 
                testo: 'IN CORSO', 
                classe: 'badge-info',
                classeProgress: 'bg-info'
            };
        }
    }

    // AGGIORNA IL METODO popolaFiltroCommesseMonitor
async popolaFiltroCommesseMonitor(commesse) {
    const select = document.getElementById('filtroCommessaMonitor');
    if (!select) return;

    const valoreCorrente = select.value;
    
    // Conta le commesse per stato
    const commesseAttive = commesse.filter(c => c.stato === 'attiva' || !c.stato).length;
    const commesseConcluse = commesse.filter(c => c.stato === 'conclusa').length;
    
    select.innerHTML = `
        <option value="">Tutte le commesse (${commesse.length})</option>
        <option value="attive">Solo attive (${commesseAttive})</option>
        <option value="concluse">Solo concluse (${commesseConcluse})</option>
    `;
    
    // Ripristina il valore selezionato
    if (valoreCorrente) {
        select.value = valoreCorrente;
    }
}
calcolaStatisticheCommessa(commessa, tutteLeOre) {
    try {
        // 1. RECUPERA VALORI BASE DALLA COMMESSA
        let valorePreventivo = parseFloat(commessa.valorePreventivo) || 0;
        let oreTotaliPreviste = parseFloat(commessa.oreTotaliPreviste) || 0;
        let oreIntegrazione = parseFloat(commessa.oreIntegrazione) || 0;
        
        // 1b. RECUPERA COSTI FORNITORI
        let costiFornitori = 0;
        if (this.datiTotaliFornitori) {
            costiFornitori = this.datiTotaliFornitori
                .filter(f => f.commessa === commessa.nomeCommessa)
                .reduce((tot, f) => tot + (parseFloat(f.costo) || 0), 0);
        }
        
        // 2. CALCOLA IL VALORE DELLE ORE INTEGRATE (in euro)
        const tariffaOraria = 28.50;
        const valoreOreIntegrate = oreIntegrazione * tariffaOraria;
        
        // 3. RICAVO TOTALE = PREVENTIVO + VALORE ORE INTEGRATE
        const ricavoTotale = valorePreventivo + valoreOreIntegrate;
        
        console.log(`📊 ${commessa.nomeCommessa}:`, {
            preventivo: valorePreventivo,
            oreIntegrazione: oreIntegrazione,
            valoreOreIntegrate: valoreOreIntegrate,
            ricavoTotale: ricavoTotale
        });
        
        // 4. FILTRA ORE LAVORATE PER QUESTA COMMESSA
        const oreCommessa = tutteLeOre.filter(ore => {
            if (!ore || !ore.commessa) return false;
            const nomeOre = ore.commessa.trim().toLowerCase();
            const nomeComm = commessa.nomeCommessa.trim().toLowerCase();
            return nomeOre === nomeComm;
        });
        
        // 5. CALCOLA ORE LAVORATE TOTALI E NON CONFORMITÀ
        let oreLavorateTotali = 0;
        let oreNonConformita = 0;
        
        oreCommessa.forEach(ore => {
            if (ore.oraInizio && ore.oraFine) {
                try {
                    let oraInizio = ore.oraInizio;
                    let oraFine = ore.oraFine;
                    
                    // Correggi formato orario se necessario
                    if (oraInizio && oraInizio.match(/^\d{1,2}:\d{2}$/) && oraInizio.length === 4) {
                        oraInizio = '0' + oraInizio;
                    }
                    if (oraFine && oraFine.match(/^\d{1,2}:\d{2}$/) && oraFine.length === 4) {
                        oraFine = '0' + oraFine;
                    }
                    
                    const oreCalc = Utils.calcolaOreLavorate(oraInizio, oraFine);
                    if (!isNaN(oreCalc) && oreCalc > 0) {
                        oreLavorateTotali += oreCalc;
                        if (ore.nonConformita === true) {
                            oreNonConformita += oreCalc;
                        }
                    }
                } catch (e) {
                    console.warn(`Errore calcolo ore per ${ore.id}:`, e);
                }
            }
        });
        
        // 6. CALCOLA COSTI DIPENDENTI
        const oreConformi = oreLavorateTotali - oreNonConformita;
        const costoOreConformi = oreConformi * tariffaOraria;
        const costoOreNonConformi = oreNonConformita * tariffaOraria;
        const costoDipendentiTotali = costoOreConformi + costoOreNonConformi;
        
        // 7. COSTO TOTALE (DIPENDENTI + FORNITORI)
        const costoTotale = costoDipendentiTotali + costiFornitori;
        
        // 8. CALCOLA MARGINI (sul RICAVO TOTALE, non solo sul preventivo)
        let margineEuro = ricavoTotale - costoTotale;
        let marginePercentuale = 0;
        
        if (ricavoTotale > 0) {
            marginePercentuale = (margineEuro / ricavoTotale) * 100;
        }
        
        // 9. RISULTATO FINALE
        const risultato = {
            // Valori base
            valorePreventivo: valorePreventivo,
            oreTotaliPreviste: oreTotaliPreviste,
            oreIntegrazione: oreIntegrazione,
            valoreOreIntegrate: valoreOreIntegrate,
            ricavoTotale: ricavoTotale,
            
            // Ore lavorate
            oreLavorateTotali: parseFloat(oreLavorateTotali.toFixed(2)),
            oreNonConformita: parseFloat(oreNonConformita.toFixed(2)),
            oreConformi: parseFloat(oreConformi.toFixed(2)),
            
            // Costi
            costoDipendentiTotali: parseFloat(costoDipendentiTotali.toFixed(2)),
            costiFornitori: parseFloat(costiFornitori.toFixed(2)),
            costoTotale: parseFloat(costoTotale.toFixed(2)),
            
            // Margini
            margineEuro: parseFloat(margineEuro.toFixed(2)),
            marginePercentuale: parseFloat(marginePercentuale.toFixed(1)),
            
            // Flag
            hasIntegrazione: oreIntegrazione > 0,
            hasFornitori: costiFornitori > 0,
            datiCompleti: valorePreventivo > 0
        };
        
        console.log(`✅ Risultato ${commessa.nomeCommessa}:`, risultato);
        
        return risultato;
        
    } catch (error) {
        console.error(`❌ Errore calcolo per ${commessa?.nomeCommessa}:`, error);
        return {
            valorePreventivo: 0,
            oreTotaliPreviste: 0,
            oreIntegrazione: 0,
            valoreOreIntegrate: 0,
            ricavoTotale: 0,
            oreLavorateTotali: 0,
            oreNonConformita: 0,
            oreConformi: 0,
            costoDipendentiTotali: 0,
            costiFornitori: 0,
            costoTotale: 0,
            margineEuro: 0,
            marginePercentuale: 0,
            hasIntegrazione: false,
            hasFornitori: false,
            datiCompleti: false
        };
    }
}

 // AGGIUNGI questo metodo di debug specifico
debugCondizioneMargini() {
    const commesse = stateManager.getCache('commesse_all') || [];
    const oreLavorate = stateManager.getCache('oreLavorate_all') || [];
    
    console.log('=== DEBUG CONDIZIONE MARGINI ===');
    
    commesse.forEach(commessa => {
        const stats = this.calcolaStatisticheCommessa(commessa, oreLavorate);
        const mostraMargini = stats.datiCompleti && stats.valorePreventivo > 0;
        
        console.log(`📋 ${commessa.nomeCommessa}:`, {
            preventivo: stats.valorePreventivo,
            datiCompleti: stats.datiCompleti,
            mostraMargini: mostraMargini,
            margineEuro: stats.margineEuro,
            marginePercentuale: stats.marginePercentuale
        });
    });
}

 // SOSTITUISCI il metodo getStatoMargine
getStatoMargine(statistiche) {
    // Controllo di sicurezza
    if (!statistiche || typeof statistiche.marginePercentuale === 'undefined') {
        console.warn('❌ Statistiche non valide per calcolo stato margine:', statistiche);
        return { 
            testo: 'N/D', 
            classe: 'badge-secondary',
            classeProgress: 'bg-secondary',
            classeTesto: 'text-muted'
        };
    }

    const marginePercent = statistiche.marginePercentuale;

    if (marginePercent >= 30) {
        return { 
            testo: 'ECCELLENTE', 
            classe: 'badge-success',
            classeProgress: 'bg-success',
            classeTesto: 'text-success'
        };
    } else if (marginePercent >= 20) {
        return { 
            testo: 'BUONO', 
            classe: 'badge-info',
            classeProgress: 'bg-info',
            classeTesto: 'text-info'
        };
    } else if (marginePercent >= 10) {
        return { 
            testo: 'SUFFICIENTE', 
            classe: 'badge-warning',
            classeProgress: 'bg-warning',
            classeTesto: 'text-warning'
        };
    } else if (marginePercent >= 0) {
        return { 
            testo: 'LIMITE', 
            classe: 'badge-danger',
            classeProgress: 'bg-danger',
            classeTesto: 'text-danger'
        };
    } else {
        return { 
            testo: 'IN PERDITA', 
            classe: 'badge-dark',
            classeProgress: 'bg-dark',
            classeTesto: 'text-danger'
        };
    }
}


// AGGIUNGI questo metodo come fallback
creaTabellaManualePDF(doc, tableData, startY) {
    console.log('📄 Creazione tabella manuale...');
    
    const colors = {
        text: [52, 73, 94],
        primary: [41, 128, 185],
        success: [39, 174, 96],
        warning: [243, 156, 18],
        danger: [231, 76, 60],
        dark: [44, 62, 80]
    };
    
    let y = startY;
    const pageHeight = doc.internal.pageSize.height;
    const margins = { left: 10, right: 10 };
    
    // LARGHEZZE COLONNE OTTIMIZZATE
    const columnWidths = [35, 25, 18, 15, 15, 12, 18, 18, 15, 10];
    const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    
    // Intestazione
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    
    const headers = ['Commessa', 'Cliente', 'Preventivo', 'Ore Prev', 'Ore Lav', 'NC', 'Costo', 'Margine€', 'Margine%', 'Stato'];
    let x = margins.left;
    
    // Disegna intestazione con sfondo
    doc.setFillColor(...colors.primary);
    doc.rect(margins.left, y, totalWidth, 5, 'F');
    
    doc.setTextColor(255, 255, 255);
    headers.forEach((header, index) => {
        doc.text(header, x + 1, y + 3.5);
        x += columnWidths[index];
    });
    
    y += 6;
    
    // Dati
    doc.setFont('helvetica', 'normal');
    
    tableData.forEach((row, index) => {
        // Controllo pagina piena
        if (y > pageHeight - 15) {
            doc.addPage();
            y = 20;
            
            // Ridisegna intestazione
            doc.setFont('helvetica', 'bold');
            doc.setFillColor(...colors.primary);
            doc.rect(margins.left, y, totalWidth, 5, 'F');
            doc.setTextColor(255, 255, 255);
            
            let xHeader = margins.left;
            headers.forEach((header, idx) => {
                doc.text(header, xHeader + 1, y + 3.5);
                xHeader += columnWidths[idx];
            });
            
            y += 6;
            doc.setFont('helvetica', 'normal');
        }
        
        x = margins.left;
        doc.setTextColor(...colors.text);
        
        // Commessa (troncata)
        doc.text(this.troncaTesto(row.commessa, 15), x + 1, y);
        x += columnWidths[0];
        
        // Cliente (troncato)
        doc.text(this.troncaTesto(row.cliente, 12), x + 1, y);
        x += columnWidths[1];
        
        // Preventivo
        doc.text(row.preventivo > 0 ? `€${row.preventivo.toFixed(0)}` : '€0', x + columnWidths[2] - 2, y, { align: 'right' });
        x += columnWidths[2];
        
        // Ore Previste
        doc.text(row.orePreviste > 0 ? `${row.orePreviste.toFixed(0)}h` : '0h', x + columnWidths[3] / 2, y, { align: 'center' });
        x += columnWidths[3];
        
        // Ore Lavorate
        const coloreOre = row.oreLavorate > row.orePreviste ? colors.danger : colors.text;
        doc.setTextColor(...coloreOre);
        doc.text(`${row.oreLavorate.toFixed(0)}h`, x + columnWidths[4] / 2, y, { align: 'center' });
        x += columnWidths[4];
        
        // Ore NC
        const coloreNC = row.hasNC ? colors.warning : colors.success;
        doc.setTextColor(...coloreNC);
        doc.text(row.hasNC ? '⚠️' : '✓', x + columnWidths[5] / 2, y, { align: 'center' });
        x += columnWidths[5];
        
        // Costo
        doc.setTextColor(...colors.text);
        doc.text(`€${row.costoTotale.toFixed(0)}`, x + columnWidths[6] - 2, y, { align: 'right' });
        x += columnWidths[6];
        
        // Margine €
        const coloreMargineEuro = row.margineEuro >= 0 ? colors.success : colors.danger;
        doc.setTextColor(...coloreMargineEuro);
        doc.text(`€${row.margineEuro >= 0 ? '+' : ''}${row.margineEuro.toFixed(0)}`, x + columnWidths[7] - 2, y, { align: 'right' });
        x += columnWidths[7];
        
        // Margine %
        const coloreMarginePercent = row.marginePercentuale >= 20 ? colors.success : 
                                   row.marginePercentuale >= 10 ? colors.warning : colors.danger;
        doc.setTextColor(...coloreMarginePercent);
        doc.text(`${row.marginePercentuale >= 0 ? '+' : ''}${row.marginePercentuale.toFixed(1)}%`, x + columnWidths[8] - 2, y, { align: 'right' });
        x += columnWidths[8];
        
        // Stato
        const coloreStato = row.statoCommessa === 'attiva' ? colors.success : colors.dark;
        const simboloStato = row.statoCommessa === 'attiva' ? '▶' : '✓';
        doc.setTextColor(...coloreStato);
        doc.text(simboloStato, x + columnWidths[9] / 2, y, { align: 'center' });
        
        y += 3.5;
        
        // Linea separatrice ogni 5 righe
        if ((index + 1) % 5 === 0 && index < tableData.length - 1) {
            doc.setDrawColor(200, 200, 200);
            doc.line(margins.left, y, margins.left + totalWidth, y);
            y += 1;
        }
    });
    
    return y;
}
// AGGIUNGI questo metodo per testare il PDF
async testPDFCompleto() {
    try {
        console.log('🧪 TEST PDF COMPLETO...');
        
        const [commesse, tutteLeOre] = await Promise.all([
            this.firebaseService.getCollection("commesse"),
            this.firebaseService.getCollection("oreLavorate")
        ]);

        // Prendi solo 5 commesse per test
        const commesseTest = commesse.slice(0, 5);
        
        console.log('📊 Dati per test PDF:');
        commesseTest.forEach(commessa => {
            const stats = this.calcolaStatisticheCommessa(commessa, tutteLeOre);
            console.log(`- ${commessa.nomeCommessa}:`, {
                preventivo: stats.valorePreventivo,
                orePreviste: stats.oreTotaliPreviste,
                oreLavorate: stats.oreLavorateTotali,
                oreNC: stats.oreNonConformita,
                stato: commessa.stato,
                hasNC: stats.oreNonConformita > 0
            });
        });

        // Genera PDF di test
        await this.generaPDFMonitoraggio();
        
    } catch (error) {
        console.error('❌ Test PDF fallito:', error);
    }
}




// Aggiungi questi metodi alla classe OreLavorateApp

async generaPDFMonitoraggio() {
    try {
        console.log('🎯 Inizio generazione PDF Monitoraggio Premium...');
        
        // 1. VERIFICA LIBRERIE PDF
        if (typeof window.jspdf === 'undefined') {
            await this.caricaLibreriePDFDinamico();
        }

        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            throw new Error('jsPDF non disponibile');
        }

        // 2. RECUPERA DATI
        console.log('📊 Recupero dati...');
        const [commesse, tutteLeOre] = await Promise.all([
            this.firebaseService.getCollection("commesse"),
            this.firebaseService.getCollection("oreLavorate")
        ]);

        // Applica filtri correnti
        const filtroStato = document.getElementById('filtroCommessaMonitor')?.value || '';
        const filtroNome = document.getElementById('filtroNomeCommessa')?.value || '';
        
        let commesseFiltrate = commesse.filter(commessa => {
            let corrisponde = true;
            
            if (filtroNome) {
                corrisponde = corrisponde && 
                    commessa.nomeCommessa.toLowerCase().includes(filtroNome.toLowerCase());
            }
            
            if (filtroStato === 'attive') {
                corrisponde = corrisponde && (commessa.stato === 'attiva' || !commessa.stato);
            } else if (filtroStato === 'concluse') {
                corrisponde = corrisponde && commessa.stato === 'conclusa';
            }
            
            return corrisponde;
        });

        if (commesseFiltrate.length === 0) {
            ErrorHandler.showNotification("Nessuna commessa trovata con i filtri attuali", 'warning');
            return;
        }

        // 3. CREA PDF PREMIUM
        console.log('📄 Creazione PDF Premium...');
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });

        // Palette di colori moderna e professionale
        const colors = {
            primary: [44, 62, 80],       // Blu scuro elegante
            secondary: [52, 152, 219],   // Blu principale
            accent: [41, 128, 185],      // Blu medio
            success: [46, 204, 113],     // Verde brillante
            warning: [230, 126, 34],     // Arancione
            danger: [231, 76, 60],       // Rosso
            light: [236, 240, 241],      // Grigio chiaro
            dark: [52, 73, 94],          // Testo scuro
            background: [248, 249, 250]  // Sfondo chiaro
        };

        // 4. HEADER ELEGANTE CON GRADIENTE
        this.creaHeaderPremium(doc, colors, commesseFiltrate.length, commesse.length, filtroNome, filtroStato);

        // 5. KPI CARDS IN ALTO
        let startY = this.creaKPICards(doc, colors, commesseFiltrate, tutteLeOre, 35);

        // 6. TABELLA MODERNA E COMPATTA
        const tableData = this.preparaDatiTabellaPremium(commesseFiltrate, tutteLeOre, colors);
        startY = this.creaTabellaPremium(doc, colors, tableData, startY + 10);

        // 7. FOOTER PROFESSIONALE
        this.creaFooterPremium(doc, colors);

        // 8. SALVA PDF
        const nomeFile = `monitoraggio_${new Date().toISOString().split('T')[0]}_premium.pdf`;
        doc.save(nomeFile);
        
        console.log('✅ PDF Premium generato con successo!');
        ErrorHandler.showNotification(`PDF Premium generato: ${commesseFiltrate.length} commesse`, 'success');

    } catch (error) {
        console.error('❌ Errore generazione PDF premium:', error);
        ErrorHandler.showNotification('Errore nella generazione PDF: ' + error.message, 'error');
    }
}

// CORREGGI il metodo creaHeaderPremium per i colori
creaHeaderPremium(doc, colors, commesseFiltrate, commesseTotali, filtroNome, filtroStato) {
    // Sfondo header con gradiente - CORREZIONE: usa spread operator
    doc.setFillColor(...colors.primary);
    doc.rect(0, 0, 297, 30, 'F');
    
    // Logo/Icona
    doc.setFillColor(255, 255, 255); // Bianco
    doc.roundedRect(15, 8, 35, 15, 2, 2, 'F');
    
    // Testo logo - CORREZIONE: usa spread operator per colors.primary
    doc.setTextColor(...colors.primary);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('UNION14', 18, 17);
    doc.text('SRL', 40, 17);
    
    // Titolo principale - CORREZIONE: usa array per bianco
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('MONITORAGGIO COMMESSE', 148, 15, { align: 'center' });
    
    // Sottotitolo
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Analisi Prestazioni e Margini', 148, 22, { align: 'center' });
    
    // Data e informazioni - CORREZIONE: usa array per bianco
    doc.setFontSize(8);
    const dataGenerazione = new Date().toLocaleDateString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    doc.text(`Generato: ${dataGenerazione}`, 275, 12, { align: 'right' });
    
    // Informazioni filtri
    let infoFiltri = `${commesseFiltrate} di ${commesseTotali} commesse`;
    if (filtroNome) infoFiltri += ` • "${filtroNome}"`;
    if (filtroStato) infoFiltri += ` • ${filtroStato === 'attive' ? 'Attive' : 'Concluse'}`;
    
    doc.text(infoFiltri, 275, 17, { align: 'right' });
}

// SOSTITUISCI COMPLETAMENTE il metodo creaKPICards
creaKPICards(doc, colors, commesseFiltrate, tutteLeOre, startY) {
    const totali = this.calcolaTotaliMonitoraggio(commesseFiltrate, tutteLeOre);
    const stats = this.calcolaStatisticheAvanzate(commesseFiltrate, tutteLeOre);
    
    const cardWidth = 65;
    const cardHeight = 28;
    const spacing = 5;
    const cardsPerRow = 4;
    
    const kpiData = [
        {
            label: 'FATTURATO',
            value: `€ ${totali.preventivoTotale.toFixed(0)}`,
            subtitle: 'Preventivo Totale',
            icon: '€',
            color: colors.success
        },
        {
            label: 'MARGINE',
            value: `${totali.marginePercentuale.toFixed(1)}%`,
            subtitle: `€ ${totali.margineTotale.toFixed(0)}`,
            icon: '%',
            color: totali.marginePercentuale >= 20 ? colors.success : 
                   totali.marginePercentuale >= 10 ? colors.warning : colors.danger
        },
        {
            label: 'COMMESSE',
            value: commesseFiltrate.length.toString(),
            subtitle: `${stats.attive} attive`,
            icon: '#',
            color: colors.secondary
        },
        {
            label: 'ORE NC',
            value: `${stats.oreNCTotali.toFixed(0)}h`,
            subtitle: `€ ${stats.costoNCTotale.toFixed(0)}`,
            icon: '!',
            color: stats.oreNCTotali > 0 ? colors.warning : colors.success,
            extra: stats.oreNCTotali > 0 ? `${stats.commesseConNC} commesse con NC` : 'Nessuna NC'
        }
    ];
    
    let xPos = 14;
    let yPos = startY;
    
    kpiData.forEach((kpi, index) => {
        if (index > 0 && index % cardsPerRow === 0) {
            xPos = 14;
            yPos += cardHeight + spacing;
        }
        
        // Card background
        doc.setFillColor(...colors.background);
        doc.roundedRect(xPos, yPos, cardWidth, cardHeight, 3, 3, 'F');
        
        // Bordo superiore colorato - CORREZIONE: usa spread operator
        doc.setFillColor(...kpi.color);
        doc.roundedRect(xPos, yPos, cardWidth, 4, 3, 3, 'F');
        
        // Icona - CORREZIONE: usa setTextColor con array
        doc.setTextColor(...kpi.color);
        doc.setFontSize(14);
        doc.text(kpi.icon, xPos + 8, yPos + 15);
        
        // Valore principale - CORREZIONE: usa setTextColor con array colors.dark
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...colors.dark);
        doc.text(kpi.value, xPos + 25, yPos + 15);
        
        // Label - CORREZIONE: usa array per il colore grigio
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(150, 150, 150); // Grigio
        doc.text(kpi.label, xPos + 8, yPos + 21);
        
        // Subtitle
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(kpi.subtitle, xPos + 8, yPos + 24);
        
        // Trend/Extra info se presente
        if (kpi.extra) {
            doc.setTextColor(...kpi.color);
            doc.text(kpi.extra, xPos + cardWidth - 8, yPos + 24, { align: 'right' });
        }
        
        xPos += cardWidth + spacing;
    });
    
    return yPos + cardHeight;
}
// SOSTITUISCI il metodo preparaDatiTabellaPremium
preparaDatiTabellaPremium(commesseFiltrate, tutteLeOre, colors) {
    return commesseFiltrate.map(commessa => {
        const statistiche = this.calcolaStatisticheCommessa(commessa, tutteLeOre);
        const statoCommessa = commessa.stato || 'attiva';
        
        // Calcola indicatori avanzati
        const orePreviste = statistiche.oreTotaliPreviste || 0;
        const oreLavorate = statistiche.oreLavorateTotali || 0;
        const progressoOre = orePreviste > 0 ? Math.min(100, (oreLavorate / orePreviste) * 100) : 0;
        const costoNC = statistiche.oreNonConformita * COSTO_ORARIO_NON_CONFORMITA;
        const efficienza = orePreviste > 0 ? (oreLavorate / orePreviste) * 100 : 0;
        
        // DEBUG: verifica dati NC
        console.log('📊 Dati NC per PDF:', {
            commessa: commessa.nomeCommessa,
            oreNC: statistiche.oreNonConformita,
            costoNC: costoNC,
            hasNC: statistiche.oreNonConformita > 0
        });

        return {
            commessa: commessa.nomeCommessa,
            cliente: commessa.cliente || 'N/D',
            preventivo: statistiche.valorePreventivo,
            oreLavorate: oreLavorate,
            orePreviste: orePreviste, // AGGIUNTO: ore previste
            oreNC: statistiche.oreNonConformita,
            costoNC: costoNC,
            costoTotale: statistiche.costoOreTotale,
            margineEuro: statistiche.margineEuro,
            marginePercentuale: statistiche.marginePercentuale,
            statoCommessa: statoCommessa, // MODIFICATO: testo completo
            progressoOre: progressoOre,
            efficienza: efficienza,
            hasNC: statistiche.oreNonConformita > 0,
            // NUOVO: dati per visualizzazione migliorata
            oreLavorateFormattate: Utils.formattaOreDecimali(oreLavorate),
            orePrevisteFormattate: Utils.formattaOreDecimali(orePreviste),
            oreNCFormattate: Utils.formattaOreDecimali(statistiche.oreNonConformita)
        };
    });
}

// SOSTITUISCI COMPLETAMENTE il metodo creaTabellaPremium con questa versione corretta
creaTabellaPremium(doc, colors, tableData, startY) {
    if (typeof doc.autoTable !== 'undefined') {
        
        // LARGHEZZE COLONNE MIGLIORATE
        const columnStyles = {
            0: { cellWidth: 40, halign: 'left', fontStyle: 'bold' },    // COMMESSA
            1: { cellWidth: 30, halign: 'left' },                       // CLIENTE  
            2: { cellWidth: 20, halign: 'right' },                      // PREVENTIVO
            3: { cellWidth: 18, halign: 'center' },                     // ORE PREV
            4: { cellWidth: 18, halign: 'center' },                     // ORE LAV
            5: { cellWidth: 15, halign: 'center' },                     // ORE NC
            6: { cellWidth: 20, halign: 'right' },                      // COSTO
            7: { cellWidth: 20, halign: 'right' },                      // MARGINE €
            8: { cellWidth: 18, halign: 'right' },                      // MARGINE %
            9: { cellWidth: 18, halign: 'center' }                      // STATO
        };

        // HEADER MIGLIORATO
        const headers = [
            { content: 'COMMESSA', styles: { 
                fillColor: colors.primary, 
                textColor: 255, 
                fontStyle: 'bold',
                fontSize: 8,
                cellPadding: 3
            }},
            { content: 'CLIENTE', styles: { 
                fillColor: colors.primary, 
                textColor: 255, 
                fontStyle: 'bold',
                fontSize: 8,
                cellPadding: 3
            }},
            { content: 'PREVENTIVO', styles: { 
                fillColor: colors.primary, 
                textColor: 255, 
                fontStyle: 'bold',
                fontSize: 8,
                cellPadding: 3
            }},
            { content: 'ORE PREV', styles: { 
                fillColor: colors.primary, 
                textColor: 255, 
                fontStyle: 'bold',
                fontSize: 8,
                cellPadding: 3
            }},
            { content: 'ORE LAV', styles: { 
                fillColor: colors.primary, 
                textColor: 255, 
                fontStyle: 'bold',
                fontSize: 8,
                cellPadding: 3
            }},
            { content: 'ORE NC', styles: { 
                fillColor: colors.primary, 
                textColor: 255, 
                fontStyle: 'bold',
                fontSize: 8,
                cellPadding: 3
            }},
            { content: 'COSTO', styles: { 
                fillColor: colors.primary, 
                textColor: 255, 
                fontStyle: 'bold',
                fontSize: 8,
                cellPadding: 3
            }},
            { content: 'MARGINE €', styles: { 
                fillColor: colors.primary, 
                textColor: 255, 
                fontStyle: 'bold',
                fontSize: 8,
                cellPadding: 3
            }},
            { content: 'MARGINE %', styles: { 
                fillColor: colors.primary, 
                textColor: 255, 
                fontStyle: 'bold',
                fontSize: 8,
                cellPadding: 3
            }},
            { content: 'STATO', styles: { 
                fillColor: colors.primary, 
                textColor: 255, 
                fontStyle: 'bold',
                fontSize: 8,
                cellPadding: 3
            }}
        ];

        // BODY CORRETTO - CON DEFINIZIONE CORRETTA DELLE VARIABILI
        const bodyData = tableData.map(row => {
            // Colori per margine
            const coloreMargineEuro = row.margineEuro >= 0 ? colors.success : colors.danger;
            const coloreMarginePercent = row.marginePercentuale >= 20 ? colors.success : 
                                       row.marginePercentuale >= 10 ? colors.warning : colors.danger;
            
            // CORREZIONE: definisci tutte le variabili qui
            const isAttiva = row.statoCommessa === 'attiva';
            const simboloStato = isAttiva ? '▶' : '✓';
            const testoStato = isAttiva ? 'ATTIVA' : 'CONCLUSA'; // QUESTA ERA LA VARIABILE MANCANTE
            const coloreStato = isAttiva ? colors.success : colors.dark;
            
            // Formattazione NC
            const simboloNC = row.hasNC ? '!' : '✓';
            const coloreNC = row.hasNC ? colors.warning : colors.success;
            const testoNC = row.hasNC ? `${row.oreNC.toFixed(1)}h` : '0h';

            return [
                { 
                    content: this.troncaTesto(row.commessa, 20),
                    styles: { fontSize: 7, cellPadding: 2 }
                },
                { 
                    content: this.troncaTesto(row.cliente, 15),
                    styles: { fontSize: 7, cellPadding: 2 }
                },
                { 
                    content: `€${row.preventivo > 0 ? row.preventivo.toFixed(0) : '0'}`,
                    styles: { fontSize: 7, cellPadding: 2, halign: 'right' }
                },
                { 
                    content: row.orePreviste > 0 ? `${row.orePreviste.toFixed(0)}h` : '0h',
                    styles: { fontSize: 7, cellPadding: 2, halign: 'center' }
                },
                { 
                    content: `${row.oreLavorate.toFixed(0)}h`,
                    styles: { 
                        fontSize: 7, 
                        cellPadding: 2, 
                        halign: 'center',
                        textColor: row.oreLavorate > row.orePreviste ? colors.danger : colors.dark
                    }
                },
                { 
                    content: testoNC,
                    styles: { 
                        fontSize: 7, 
                        cellPadding: 2, 
                        halign: 'center',
                        textColor: coloreNC
                    }
                },
                { 
                    content: `€${row.costoTotale.toFixed(0)}`,
                    styles: { fontSize: 7, cellPadding: 2, halign: 'right' }
                },
                { 
                    content: `€${row.margineEuro >= 0 ? '+' : ''}${row.margineEuro.toFixed(0)}`,
                    styles: { 
                        fontSize: 7, 
                        cellPadding: 2, 
                        halign: 'right',
                        textColor: coloreMargineEuro,
                        fontStyle: 'bold'
                    }
                },
                { 
                    content: `${row.marginePercentuale >= 0 ? '+' : ''}${row.marginePercentuale.toFixed(1)}%`,
                    styles: { 
                        fontSize: 7, 
                        cellPadding: 2, 
                        halign: 'right',
                        textColor: coloreMarginePercent,
                        fontStyle: 'bold'
                    }
                },
                { 
                    // CORREZIONE: ora testoStato è definito
                    content: `${testoStato}`,
                    styles: { 
                        fontSize: 6, 
                        cellPadding: 1,
                        halign: 'center',
                        textColor: coloreStato,
                        fontStyle: 'bold'
                    }
                }
            ];
        });

        doc.autoTable({
            startY: startY,
            head: [headers],
            body: bodyData,
            theme: 'grid',
            styles: { 
                fontSize: 7,
                cellPadding: 2,
                lineColor: [200, 200, 200],
                lineWidth: 0.1,
                overflow: 'ellipsis',
                minCellHeight: 6
            },
            headStyles: { 
                fillColor: colors.primary,
                textColor: 255,
                fontStyle: 'bold',
                fontSize: 8,
                cellPadding: 3
            },
            alternateRowStyles: {
                fillColor: [252, 252, 252]
            },
            columnStyles: columnStyles,
            margin: { top: startY, right: 10, left: 10, bottom: 20 },
            tableWidth: 277,
            pageBreak: 'auto',
            didDrawPage: (data) => {
                // Numero pagina
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(
                    `Pagina ${data.pageNumber} di ${doc.internal.getNumberOfPages()}`, 
                    148, 
                    doc.internal.pageSize.height - 10,
                    { align: 'center' }
                );
            }
        });
        
        return doc.lastAutoTable.finalY + 10;
    }
    
    // Fallback se autoTable non è disponibile
    return this.creaTabellaManualePDF(doc, tableData, startY);
}

// CORREGGI il metodo creaFooterPremium
creaFooterPremium(doc, colors) {
    const pageHeight = doc.internal.pageSize.height;
    
    // Linea separatrice - CORREZIONE: usa spread operator
    doc.setDrawColor(...colors.light);
    doc.line(20, pageHeight - 25, 277, pageHeight - 25);
    
    // Informazioni footer - CORREZIONE: usa array per grigio
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    
    doc.text('Union14 - Sistema di Monitoraggio Commesse', 20, pageHeight - 20);
    doc.text(`Tariffa: €${TARIFFA_ORARIA}/h | NC: €${COSTO_ORARIO_NON_CONFORMITA}/h`, 148, pageHeight - 20, { align: 'center' });
    doc.text('Documento confidenziale', 277, pageHeight - 20, { align: 'right' });
    
    // Copyright
    doc.text(`© ${new Date().getFullYear()} Union14 - Tutti i diritti riservati`, 148, pageHeight - 15, { align: 'center' });
}
// AGGIUNGI questo metodo per debug
verificaColoriPDF() {
    console.log('🎨 Verifica colori PDF:');
    
    const colors = {
        primary: [44, 62, 80],
        secondary: [52, 152, 219],
        accent: [41, 128, 185],
        success: [46, 204, 113],
        warning: [230, 126, 34],
        danger: [231, 76, 60],
        light: [236, 240, 241],
        dark: [52, 73, 94],
        background: [248, 249, 250]
    };
    
    Object.entries(colors).forEach(([nome, colore]) => {
        console.log(`- ${nome}:`, colore, `(tipo: ${typeof colore})`);
    });
    
    return colors;
}

// CALCOLA STATISTICHE AVANZATE PER KPI
calcolaStatisticheAvanzate(commesseFiltrate, tutteLeOre) {
    let oreNCTotali = 0;
    let costoNCTotale = 0;
    let commesseConNC = 0;
    let attive = 0;
    
    commesseFiltrate.forEach(commessa => {
        const stats = this.calcolaStatisticheCommessa(commessa, tutteLeOre);
        oreNCTotali += stats.oreNonConformita;
        costoNCTotale += stats.oreNonConformita * COSTO_ORARIO_NON_CONFORMITA;
        
        if (stats.oreNonConformita > 0) {
            commesseConNC++;
        }
        
        if (commessa.stato === 'attiva' || !commessa.stato) {
            attive++;
        }
    });
    
    return {
        oreNCTotali,
        costoNCTotale,
        commesseConNC,
        attive
    };
}

// METODI AUSILIARI PER IL PDF MODERNO

creaHeaderPDF(doc, colors, commesseFiltrate, commesseTotali, filtroNome, filtroStato) {
    // Sfondo header
    doc.setFillColor(...colors.primary);
    doc.rect(0, 0, 297, 25, 'F');
    
    // Titolo principale
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('MONITORAGGIO COMMESSE', 148, 15, { align: 'center' });
    
    // Sottotitolo
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Report Analitico Prestazioni', 148, 22, { align: 'center' });
    
    // Informazioni filtri
    doc.setTextColor(...colors.text);
    doc.setFontSize(8);
    
    let infoFiltri = `Commesse incluse: ${commesseFiltrate} di ${commesseTotali}`;
    if (filtroNome) infoFiltri += ` • Filtro: "${filtroNome}"`;
    if (filtroStato) infoFiltri += ` • Stato: ${filtroStato === 'attive' ? 'Attive' : 'Concluse'}`;
    
    doc.text(infoFiltri, 14, 32);
    
    // Data generazione
    const dataGenerazione = new Date().toLocaleDateString('it-IT', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    doc.text(`Generato il: ${dataGenerazione}`, 283, 32, { align: 'right' });
}

preparaDatiTabellaModerni(commesseFiltrate, tutteLeOre, colors) {
    return commesseFiltrate.map(commessa => {
        const statistiche = this.calcolaStatisticheCommessa(commessa, tutteLeOre);
        const statoMargine = this.getStatoMargine(statistiche);
        const statoCommessa = commessa.stato || 'attiva';
        
        // Calcola costo NC
        const costoNC = statistiche.oreNonConformita * COSTO_ORARIO_NON_CONFORMITA;
        
        // Icone per lo stato
        const iconaStato = statoCommessa === 'attiva' ? '▶' : '✓';
        const coloreStato = statoCommessa === 'attiva' ? colors.success : colors.dark;
        
        // Formattazione valori con colori
        const formattaValore = (valore, sogliaBuona = 0, sogliaMedia = -10) => {
            if (valore >= sogliaBuona) return { testo: `+${valore.toFixed(2)}`, colore: colors.success };
            if (valore >= sogliaMedia) return { testo: valore.toFixed(2), colore: colors.warning };
            return { testo: valore.toFixed(2), colore: colors.danger };
        };
        
        const margineEuro = formattaValore(statistiche.margineEuro);
        const marginePercentuale = formattaValore(statistiche.marginePercentuale);
        
        return {
            commessa: commessa.nomeCommessa,
            cliente: commessa.cliente || 'N/D',
            preventivo: statistiche.valorePreventivo,
            oreLavorate: statistiche.oreLavorateTotali,
            orePreviste: statistiche.oreTotaliPreviste,
            oreNC: statistiche.oreNonConformita,
            costoNC: costoNC, // Aggiunto costo NC
            costoTotale: statistiche.costoOreTotale,
            margineEuro: margineEuro,
            marginePercentuale: marginePercentuale,
            statoCommessa: { testo: statoCommessa === 'attiva' ? 'ATTIVA' : 'CONCLUSA', icona: iconaStato, colore: coloreStato },
            statoMargine: statoMargine
        };
    });
}
creaRiepilogoIniziale(doc, colors, commesseFiltrate, tutteLeOre, startY) {
    const totali = this.calcolaTotaliMonitoraggio(commesseFiltrate, tutteLeOre);
    
    // Container riepilogo
    doc.setFillColor(...colors.light);
    doc.roundedRect(14, startY, 270, 25, 3, 3, 'F');
    
    // Titolo riepilogo
    doc.setTextColor(...colors.dark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('RIEPILOGO GENERALE', 25, startY + 8);
    
    // Valori riepilogo
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    const colonne = [
        { label: 'Totale Preventivi', valore: `€ ${totali.preventivoTotale.toFixed(2)}`, x: 25 },
        { label: 'Costo Totale', valore: `€ ${totali.costoTotale.toFixed(2)}`, x: 85 },
        { label: 'Margine Totale', valore: `€ ${totali.margineTotale.toFixed(2)}`, x: 145 },
        { label: 'Margine %', valore: `${totali.marginePercentuale.toFixed(1)}%`, x: 205 },
        { label: 'Commesse', valore: commesseFiltrate.length.toString(), x: 265 }
    ];
    
    colonne.forEach(colonna => {
        doc.setTextColor(...colors.text);
        doc.text(colonna.label, colonna.x, startY + 16);
        doc.setTextColor(...colors.primary);
        doc.setFont('helvetica', 'bold');
        doc.text(colonna.valore, colonna.x, startY + 21);
        doc.setFont('helvetica', 'normal');
    });
    
    // Indicatore performance
    const performance = totali.marginePercentuale >= 20 ? 'ECCELLENTE' : 
                       totali.marginePercentuale >= 10 ? 'BUONA' : 
                       totali.marginePercentuale >= 0 ? 'SUFFICIENTE' : 'CRITICA';
    
    const colorePerformance = totali.marginePercentuale >= 20 ? colors.success : 
                             totali.marginePercentuale >= 10 ? colors.warning : 
                             totali.marginePercentuale >= 0 ? colors.warning : colors.danger;
    
    doc.setTextColor(...colorePerformance);
    doc.setFont('helvetica', 'bold');
    doc.text(`Performance: ${performance}`, 148, startY + 10, { align: 'center' });
    
    return startY + 32;
}
creaTabellaModerna(doc, colors, tableData, startY) {
    if (typeof doc.autoTable !== 'undefined') {
        const columnWidths = {
            commessa: 55,
            cliente: 45,
            preventivo: 25,
            ore: 25,
            nonConformita: 25,
            costo: 25,
            margineEuro: 25,
            marginePercent: 25,
            stato: 25
        };

        doc.autoTable({
            startY: startY,
            head: [[
                { content: 'COMMESSA', styles: { fillColor: colors.dark, textColor: 255, fontStyle: 'bold', halign: 'left', cellWidth: columnWidths.commessa } },
                { content: 'CLIENTE', styles: { fillColor: colors.dark, textColor: 255, fontStyle: 'bold', halign: 'left', cellWidth: columnWidths.cliente } },
                { content: 'PREVENTIVO €', styles: { fillColor: colors.dark, textColor: 255, fontStyle: 'bold', halign: 'right', cellWidth: columnWidths.preventivo } },
                { content: 'ORE LAV/PR', styles: { fillColor: colors.dark, textColor: 255, fontStyle: 'bold', halign: 'center', cellWidth: columnWidths.ore } },
                { content: 'ORE NC', styles: { fillColor: colors.dark, textColor: 255, fontStyle: 'bold', halign: 'center', cellWidth: columnWidths.nonConformita } },
                { content: 'COSTO €', styles: { fillColor: colors.dark, textColor: 255, fontStyle: 'bold', halign: 'right', cellWidth: columnWidths.costo } },
                { content: 'MARGINE €', styles: { fillColor: colors.dark, textColor: 255, fontStyle: 'bold', halign: 'right', cellWidth: columnWidths.margineEuro } },
                { content: 'MARGINE %', styles: { fillColor: colors.dark, textColor: 255, fontStyle: 'bold', halign: 'right', cellWidth: columnWidths.marginePercent } },
                { content: 'STATO', styles: { fillColor: colors.dark, textColor: 255, fontStyle: 'bold', halign: 'center', cellWidth: columnWidths.stato } }
            ]],
            body: tableData.map(row => [
                { 
                    content: this.troncaTesto(row.commessa, 35),
                    styles: { fontStyle: 'bold', halign: 'left', cellWidth: columnWidths.commessa } 
                },
                { 
                    content: this.troncaTesto(row.cliente, 30),
                    styles: { halign: 'left', cellWidth: columnWidths.cliente } 
                },
                { 
                    content: ` ${row.preventivo.toFixed(2)}€`, 
                    styles: { halign: 'right', cellWidth: columnWidths.preventivo } 
                },
                { 
                    content: `${Utils.formattaOreDecimali(row.oreLavorate)}
                    ${Utils.formattaOreDecimali(row.orePreviste)}`, 
                    styles: { halign: 'center', cellWidth: columnWidths.ore, fontSize: 8 } 
                },
                { 
                    content: this.formattaOreNC(row.oreNC, row.costoNC),
                    styles: { 
                        halign: 'center', 
                        cellWidth: columnWidths.nonConformita,
                        // CORREZIONE: usa textColor con array RGB
                        textColor: row.oreNC > 0 ? colors.warning : colors.success,
                        fontStyle: 'bold',
                        fontSize: 7
                    } 
                },
                { 
                    content: ` ${row.costoTotale.toFixed(2)}€`, 
                    styles: { halign: 'right', cellWidth: columnWidths.costo } 
                },
                { 
                    content: row.margineEuro.testo, 
                    styles: { 
                        halign: 'right', 
                        cellWidth: columnWidths.margineEuro,
                        // CORREZIONE: usa direttamente l'array colore
                        textColor: row.margineEuro.colore,
                        fontStyle: 'bold'
                    } 
                },
                { 
                    content: row.marginePercentuale.testo, 
                    styles: { 
                        halign: 'right', 
                        cellWidth: columnWidths.marginePercent,
                        // CORREZIONE: usa direttamente l'array colore
                        textColor: row.marginePercentuale.colore,
                        fontStyle: 'bold'
                    } 
                },
                { 
                    content: `${row.statoCommessa.testo}`, 
                    styles: { 
                        halign: 'center', 
                        cellWidth: columnWidths.stato,
                        // CORREZIONE: usa direttamente l'array colore
                        textColor: row.statoCommessa.colore,
                        fontStyle: 'bold',
                        fontSize: 8
                    } 
                }
            ]),
            theme: 'grid',
            styles: { 
                fontSize: 9,
                cellPadding: 5,
                lineColor: colors.light,
                lineWidth: 0.1,
                overflow: 'linebreak',
                minCellHeight: 9
            },
            headStyles: { 
                fillColor: colors.dark,
                textColor: 255,
                fontStyle: 'bold',
                cellPadding: 6,
                fontSize: 9
            },
            alternateRowStyles: {
                fillColor: [248, 248, 248]
            },
            columnStyles: {
                0: { cellWidth: columnWidths.commessa, halign: 'left' },
                1: { cellWidth: columnWidths.cliente, halign: 'left' },
                2: { cellWidth: columnWidths.preventivo, halign: 'right' },
                3: { cellWidth: columnWidths.ore, halign: 'center' },
                4: { cellWidth: columnWidths.nonConformita, halign: 'center' },
                5: { cellWidth: columnWidths.costo, halign: 'right' },
                6: { cellWidth: columnWidths.margineEuro, halign: 'right' },
                7: { cellWidth: columnWidths.marginePercent, halign: 'right' },
                8: { cellWidth: columnWidths.stato, halign: 'center' }
            },
            margin: { top: startY, right: 0, left: 0, bottom: 20 },
            tableWidth: 270,
            pageBreak: 'auto',
            // AGGIUNGI QUESTA FUNZIONE PER GESTIRE I COLORI MANUALMENTE
            willDrawCell: (data) => {
                // Applica colori manualmente per le colonne che hanno colori condizionali
                if (data.section === 'body') {
                    const rowIndex = data.row.index;
                    const columnIndex = data.column.index;
                    const rowData = tableData[rowIndex];
                    
                    if (rowData) {
                        // Colonna ORE NC (indice 4)
                        if (columnIndex === 4) {
                            const colore = rowData.oreNC > 0 ? colors.warning : colors.success;
                            doc.setTextColor(colore[0], colore[1], colore[2]);
                        }
                        
                        // Colonna MARGINE € (indice 6)
                        if (columnIndex === 6) {
                            const colore = rowData.margineEuro.colore;
                            doc.setTextColor(colore[0], colore[1], colore[2]);
                        }
                        
                        // Colonna MARGINE % (indice 7)
                        if (columnIndex === 7) {
                            const colore = rowData.marginePercentuale.colore;
                            doc.setTextColor(colore[0], colore[1], colore[2]);
                        }
                        
                        // Colonna STATO (indice 8)
                        if (columnIndex === 8) {
                            const colore = rowData.statoCommessa.colore;
                            doc.setTextColor(colore[0], colore[1], colore[2]);
                        }
                    }
                }
            },
            didDrawCell: (data) => {
                // Ripristina il colore del testo a nero dopo ogni cella
                if (data.section === 'body') {
                    doc.setTextColor(0, 0, 0);
                }
            },
            didDrawPage: (data) => {
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(
                    `Pagina ${doc.internal.getNumberOfPages()}`, 
                    data.settings.margin.left, 
                    doc.internal.pageSize.height - 10
                );
            }
        });
        
        return doc.lastAutoTable.finalY + 10;
    } else {
        return this.creaTabellaManualePDF(doc, tableData, startY);
    }
}

// Aggiorna anche il metodo di troncamento per permettere più caratteri
troncaTesto(testo, lunghezzaMassima) {
    if (!testo) return 'N/D';
    if (testo.length <= lunghezzaMassima) return testo;
    return testo.substring(0, lunghezzaMassima - 2) + '..';
}
// Aggiungi questo metodo per formattare le ore NC come nella tabella monitoraggio
formattaOreNC(oreNC, costoNC) {
    if (oreNC === 0) {
        return '0:00\n€ 0.00'; // Zero ore NC
    } else {
        const oreFormattate = Utils.formattaOreDecimali(oreNC);
        const costoFormattato = costoNC ? `€ ${costoNC.toFixed(2)}` : `€ ${(oreNC * COSTO_ORARIO_NON_CONFORMITA).toFixed(2)}`;
        return `${oreFormattate}\n${costoFormattato}`;
    }
}

creaGraficoRiassuntivo(doc, colors, commesseFiltrate, tutteLeOre, startY) {
    if (startY > 180) return startY; // Non c'è spazio
    
    const stats = this.calcolaStatisticheGrafico(commesseFiltrate, tutteLeOre);
    
    // Titolo sezione
    doc.setTextColor(...colors.dark);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('DISTRIBUZIONE PERFORMANCE', 14, startY + 5);
    
    // Container grafico
    const graficoWidth = 270;
    const graficoHeight = 40;
    const graficoX = 14;
    const graficoY = startY + 10;
    
    // Sfondo grafico
    doc.setFillColor(...colors.light);
    doc.roundedRect(graficoX, graficoY, graficoWidth, graficoHeight, 2, 2, 'F');
    
    // Barre performance
    const categorie = [
        { label: 'Eccellente', count: stats.eccellenti, color: colors.success, soglia: 20 },
        { label: 'Buona', count: stats.buone, color: colors.warning, soglia: 10 },
        { label: 'Sufficiente', count: stats.sufficienti, color: [243, 156, 18], soglia: 0 },
        { label: 'Critica', count: stats.critiche, color: colors.danger, soglia: -100 }
    ];
    
    const barWidth = (graficoWidth - 50) / categorie.length;
    let xPos = graficoX + 10;
    
    categorie.forEach((cat, index) => {
        const altezzaBarra = (cat.count / commesseFiltrate.length) * (graficoHeight - 20);
        const yPos = graficoY + graficoHeight - altezzaBarra - 5;
        
        // Barra
        doc.setFillColor(...cat.color);
        doc.rect(xPos, yPos, barWidth - 5, altezzaBarra, 'F');
        
        // Etichetta
        doc.setTextColor(...colors.text);
        doc.setFontSize(7);
        doc.text(cat.label, xPos + (barWidth - 5) / 2, graficoY + graficoHeight - 2, { align: 'center' });
        
        // Valore
        doc.setFont('helvetica', 'bold');
        doc.text(cat.count.toString(), xPos + (barWidth - 5) / 2, yPos - 3, { align: 'center' });
        
        xPos += barWidth;
    });
    
    // Legenda
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...colors.text);
    doc.text(`Totale commesse analizzate: ${commesseFiltrate.length}`, graficoX + 5, graficoY + 15);
    
    return graficoY + graficoHeight + 10;
}

calcolaStatisticheGrafico(commesseFiltrate, tutteLeOre) {
    let eccellenti = 0, buone = 0, sufficienti = 0, critiche = 0;
    
    commesseFiltrate.forEach(commessa => {
        const stats = this.calcolaStatisticheCommessa(commessa, tutteLeOre);
        
        if (stats.marginePercentuale >= 20) eccellenti++;
        else if (stats.marginePercentuale >= 10) buone++;
        else if (stats.marginePercentuale >= 0) sufficienti++;
        else critiche++;
    });
    
    return { eccellenti, buone, sufficienti, critiche };
}

creaFooterPDF(doc, colors) {
    const pageHeight = doc.internal.pageSize.height;
    
    // Linea separatrice
    doc.setDrawColor(...colors.light);
    doc.line(14, pageHeight - 20, 283, pageHeight - 20);
    
    // Informazioni footer
    doc.setTextColor(150, 150, 150);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    
    doc.text('Sistema di Monitoraggio Commesse - Union14', 14, pageHeight - 15);
    doc.text(`Tariffa oraria: € ${TARIFFA_ORARIA}/h | Costo NC: € ${COSTO_ORARIO_NON_CONFORMITA}/h`, 148, pageHeight - 15, { align: 'center' });
    doc.text('Documento generato automaticamente', 283, pageHeight - 15, { align: 'right' });
    
    // Numero pagina finale
    doc.text(`Pagina ${doc.internal.getNumberOfPages()} di ${doc.internal.getNumberOfPages()}`, 148, pageHeight - 10, { align: 'center' });
}

generaNomeFileModerno(filtroNome, filtroStato) {
    const data = new Date();
    const timestamp = data.toISOString().split('T')[0].replace(/-/g, '');
    
    let nomeFile = `monitoraggio_commesse_${timestamp}`;
    
    if (filtroNome) {
        nomeFile += `_${filtroNome.replace(/\s+/g, '_').substring(0, 15)}`;
    }
    
    if (filtroStato) {
        nomeFile += `_${filtroStato}`;
    }
    
    return `${nomeFile}.pdf`;
}

// Aggiungi questi metodi mancanti alla classe OreLavorateApp

async testGenerazionePDF() {
    try {
        console.log('🧪 Test generazione PDF...');
        
        if (typeof window.jspdf === 'undefined') {
            await this.caricaLibreriePDFDinamico();
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        doc.text('Test PDF - ' + new Date().toLocaleString(), 20, 20);
        doc.text('Se vedi questo, le librerie PDF funzionano!', 20, 30);
        
        doc.save('test_monitoraggio.pdf');
        console.log('✅ Test PDF completato');
        
    } catch (error) {
        console.error('❌ Test PDF fallito:', error);
        ErrorHandler.showNotification('Test PDF fallito: ' + error.message, 'error');
    }
}

verificaLibreriePDF() {
    console.log('🔍 Verifica librerie PDF:');
    console.log('- window.jspdf:', typeof window.jspdf);
    
    if (typeof window.jspdf !== 'undefined') {
        const { jsPDF } = window.jspdf;
        console.log('- jsPDF:', typeof jsPDF);
        console.log('- autoTable:', typeof jsPDF?.autoTable);
    }
    
    const result = {
        jsPDF: typeof window.jspdf !== 'undefined',
        autoTable: window.jspdf?.jsPDF?.autoTable !== undefined
    };
    
    console.log('📊 Risultato verifica:', result);
    return result;
}
caricaLibreriePDFDinamico() {
    return new Promise((resolve, reject) => {
        console.log('🔄 Caricamento dinamico librerie PDF...');
        
        // Se già caricato, risolvi immediatamente
        if (typeof window.jspdf !== 'undefined' && window.jspdf.jsPDF) {
            console.log('✅ jsPDF già caricato');
            resolve();
            return;
        }

        const scriptJSPDF = document.createElement('script');
        scriptJSPDF.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        
        scriptJSPDF.onload = () => {
            console.log('✅ jsPDF caricato dinamicamente');
            
            // Aspetta che jsPDF sia disponibile
            setTimeout(() => {
                if (typeof window.jspdf !== 'undefined' && window.jspdf.jsPDF) {
                    console.log('✅ jsPDF verificato e pronto');
                    
                    // Ora carica autoTable
                    const scriptAutoTable = document.createElement('script');
                    scriptAutoTable.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js';
                    
                    scriptAutoTable.onload = () => {
                        console.log('✅ autoTable caricato');
                        resolve();
                    };
                    
                    scriptAutoTable.onerror = () => {
                        console.warn('⚠️ autoTable non caricato, useremo fallback');
                        resolve(); // Risolvi comunque
                    };
                    
                    document.head.appendChild(scriptAutoTable);
                } else {
                    reject(new Error('jsPDF non disponibile dopo il caricamento'));
                }
            }, 100);
        };
        
        scriptJSPDF.onerror = () => {
            console.error('❌ Errore caricamento jsPDF');
            reject(new Error('Impossibile caricare jsPDF'));
        };
        
        document.head.appendChild(scriptJSPDF);
    });
}

async verificaECaricaLibreriePDF() {
    // Se jsPDF non è disponibile, prova a caricarlo
    if (typeof window.jspdf === 'undefined') {
        console.log('🔄 Tentativo di caricamento jsPDF...');
        
        // Crea un elemento script per jsPDF
        const scriptJSPDF = document.createElement('script');
        scriptJSPDF.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        
        return new Promise((resolve, reject) => {
            scriptJSPDF.onload = () => {
                console.log('✅ jsPDF caricato');
                
                // Ora carica autoTable
                const scriptAutoTable = document.createElement('script');
                scriptAutoTable.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js';
                
                scriptAutoTable.onload = () => {
                    console.log('✅ autoTable caricato');
                    resolve();
                };
                
                scriptAutoTable.onerror = () => {
                    console.warn('⚠️ autoTable non caricato, useremo fallback');
                    resolve(); // Risolvi comunque, useremo fallback
                };
                
                document.head.appendChild(scriptAutoTable);
            };
            
            scriptJSPDF.onerror = () => {
                reject(new Error('Impossibile caricare jsPDF'));
            };
            
            document.head.appendChild(scriptJSPDF);
        });
    }
    
    // Se jsPDF è disponibile ma manca autoTable
    if (window.jspdf && !window.jspdf.jsPDF.autoTable) {
        console.log('🔄 Caricamento autoTable...');
        
        return new Promise((resolve) => {
            const scriptAutoTable = document.createElement('script');
            scriptAutoTable.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js';
            
            scriptAutoTable.onload = () => {
                console.log('✅ autoTable caricato');
                resolve();
            };
            
            scriptAutoTable.onerror = () => {
                console.warn('⚠️ autoTable non caricato, useremo fallback');
                resolve();
            };
            
            document.head.appendChild(scriptAutoTable);
        });
    }
    
    return Promise.resolve();
}

calcolaTotaliMonitoraggio(commesse, tutteLeOre) {
    let preventivoTotale = 0;
    let costoTotale = 0;
    
    commesse.forEach(commessa => {
        const stats = this.calcolaStatisticheCommessa(commessa, tutteLeOre);
        preventivoTotale += stats.valorePreventivo || 0;
        costoTotale += stats.costoOreTotale || 0;
    });
    
    const margineTotale = preventivoTotale - costoTotale;
    const marginePercentuale = preventivoTotale > 0 ? (margineTotale / preventivoTotale) * 100 : 0;
    
    return {
        preventivoTotale: parseFloat(preventivoTotale.toFixed(2)),
        costoTotale: parseFloat(costoTotale.toFixed(2)),
        margineTotale: parseFloat(margineTotale.toFixed(2)),
        marginePercentuale: parseFloat(marginePercentuale.toFixed(1))
    };
}

generaNomeFileMonitoraggio(filtroNome, filtroStato) {
    let nomeFile = 'monitoraggio_commesse';
    
    if (filtroNome) {
        nomeFile += `_${filtroNome.replace(/\s+/g, '_').substring(0, 20)}`;
    }
    
    if (filtroStato) {
        nomeFile += `_${filtroStato}`;
    }
    
    nomeFile += `_${new Date().toISOString().split('T')[0]}`;
    
    return `${nomeFile}.pdf`;
}

async testStatisticheCommesse() {
    console.log('=== TEST STATISTICHE COMMESSE ===');
    
    const [commesse, tutteLeOre] = await Promise.all([
        this.firebaseService.getCollection("commesse"),
        this.firebaseService.getCollection("oreLavorate")
    ]);
    
    console.log('📊 Commesse trovate:', commesse.length);
    console.log('📊 Ore lavorate trovate:', tutteLeOre.length);
    
    // Prendi la prima commessa per test
    const primaCommessa = commesse[0];
    console.log('🔍 Test con commessa:', primaCommessa.nomeCommessa);
    console.log('   - Preventivo:', primaCommessa.valorePreventivo);
    console.log('   - Ore previste:', primaCommessa.oreTotaliPreviste);
    console.log('   - Stato:', primaCommessa.stato);
    
    // Filtra ore per questa commessa
    const oreCommessa = tutteLeOre.filter(ore => 
        ore.commessa && ore.commessa.toLowerCase().trim() === primaCommessa.nomeCommessa.toLowerCase().trim()
    );
    console.log('   - Ore collegate:', oreCommessa.length);
    
    // Calcola statistiche
    const stats = this.calcolaStatisticheCommessa(primaCommessa, tutteLeOre);
    console.log('📈 Statistiche calcolate:', stats);
    
    return stats;
}
async pulisciRecordOreInvalidi() {
    console.log('🔧 Inizio pulizia record con orari non validi...');
    
    try {
        const tutteLeOre = await this.firebaseService.getCollection("oreLavorate");
        let recordInvalidi = 0;
        let recordCorretti = 0;
        
        for (const ore of tutteLeOre) {
            let needsUpdate = false;
            let nuovoInizio = ore.oraInizio;
            let nuovaFine = ore.oraFine;
            
            const correggiOra = (ora) => {
                if (!ora) return null;
                ora = ora.toString().trim();
                if (/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(ora)) return ora;
                if (/^[0-9]:[0-5][0-9]$/.test(ora)) return '0' + ora;
                if (/^([0-9]|1[0-9]|2[0-3])$/.test(ora)) return `${ora.padStart(2, '0')}:00`;
                return null;
            };
            
            const inizioCorretto = correggiOra(ore.oraInizio);
            const fineCorretto = correggiOra(ore.oraFine);
            
            if (inizioCorretto && inizioCorretto !== ore.oraInizio) {
                nuovoInizio = inizioCorretto;
                needsUpdate = true;
            }
            
            if (fineCorretto && fineCorretto !== ore.oraFine) {
                nuovaFine = fineCorretto;
                needsUpdate = true;
            }
            
            if (needsUpdate) {
                console.log(`📝 Correzione record ${ore.id}: ${ore.oraInizio}->${nuovoInizio}, ${ore.oraFine}->${nuovaFine}`);
                await this.firebaseService.updateDocument("oreLavorate", ore.id, {
                    oraInizio: nuovoInizio,
                    oraFine: nuovaFine
                });
                recordCorretti++;
            }
            
            if (!inizioCorretto || !fineCorretto) {
                recordInvalidi++;
            }
        }
        
        console.log(`📊 Risultato: ${recordCorretti} corretti, ${recordInvalidi} non correggibili`);
        
        if (recordCorretti > 0) {
            ErrorHandler.showNotification(`Corretti ${recordCorretti} record con orari non validi`, 'success');
            await this.aggiornaMonitorCommesse();
            await this.creaGraficiDashboard();
        }
        
        return { recordCorretti, recordInvalidi };
        
    } catch (error) {
        console.error('Errore nella pulizia:', error);
        return { recordCorretti: 0, recordInvalidi: 0 };
    }
}


// ========== GRAFICI CON PAGINAZIONE ==========

async creaGraficiDashboard() {
    try {
        console.log('📊 Creazione grafici dashboard...');
        
        const [commesse, tutteLeOre, dipendenti] = await Promise.all([
            this.firebaseService.getCollection("commesse"),
            this.firebaseService.getCollection("oreLavorate"),
            this.firebaseService.getCollection("dipendenti")
        ]);
        
        // Popola i select degli anni usando le date delle commesse
        this.popolaAnniFiltriGrafici(tutteLeOre, commesse);
        
        // Inizializza filtri se non esistono
        if (!this.filtroMargini) this.filtroMargini = { anno: '', mese: '' };
        if (!this.filtroOreDipendenti) this.filtroOreDipendenti = { anno: '', mese: '' };
        
        // GRAFICO MARGINI COMMESSE (USA LO STESSO FILTRO DELLA TABELLA)
        await this.aggiornaGraficoMargini(commesse, tutteLeOre);
        
        // GRAFICO STATO COMMESSE
        this.creaGraficoStatoCommesse(commesse);
        
        // GRAFICO ORE DIPENDENTI
        await this.aggiornaGraficoOreDipendenti(tutteLeOre, dipendenti);
        
        // GRAFICO ANDAMENTO MENSILE
        this.creaGraficoAndamentoMensile(tutteLeOre);
        
        // Listener per filtri
        this.aggiungiListenerFiltriGrafici();
        
        console.log('✅ Tutti i grafici creati con successo');
        
    } catch (error) {
        console.error('❌ Errore creazione grafici:', error);
    }
}
// Popola i select degli anni per i filtri
popolaAnniFiltriGrafici(tutteLeOre) {
    // Estrai anni unici dalle ore lavorate
    const anni = new Set();
    tutteLeOre.forEach(ore => {
        if (ore.data) {
            const anno = ore.data.split('-')[0];
            if (anno) anni.add(anno);
        }
    });
    
    // Aggiungi anche anni da commesse se necessario
    const anniArray = Array.from(anni).sort().reverse();
    
    // Popola select per margini
    const selectMargini = document.getElementById('filtroAnnoMargini');
    if (selectMargini) {
        selectMargini.innerHTML = '<option value="">Tutti gli anni</option>';
        anniArray.forEach(anno => {
            const option = document.createElement('option');
            option.value = anno;
            option.textContent = anno;
            selectMargini.appendChild(option);
        });
    }
    
    // Popola select per ore dipendenti
    const selectOre = document.getElementById('filtroAnnoOreDipendenti');
    if (selectOre) {
        selectOre.innerHTML = '<option value="">Tutti gli anni</option>';
        anniArray.forEach(anno => {
            const option = document.createElement('option');
            option.value = anno;
            option.textContent = anno;
            selectOre.appendChild(option);
        });
    }
}

async aggiornaGraficoMargini(commesse, tutteLeOre) {
    console.log('📊 Aggiornamento grafico margini - usando filtro come tabella monitoraggio...');
    console.log('Filtri attivi:', this.filtroMargini);
    
    // 1. APPLICA FILTRI ALLE COMMESSE (COME FA LA TABELLA MONITORAGGIO)
    let commesseFiltrate = [...commesse];
    
    // Filtra per anno sulla data della commessa (come nella tabella)
    if (this.filtroMargini.anno && this.filtroMargini.anno !== '') {
        commesseFiltrate = commesseFiltrate.filter(commessa => {
            const dataCommessa = commessa.dataInizio || commessa.dataCreazione;
            if (!dataCommessa) return true;
            const annoCommessa = dataCommessa.split('-')[0];
            return annoCommessa === this.filtroMargini.anno;
        });
        console.log(`📅 Filtro anno ${this.filtroMargini.anno}: ${commesseFiltrate.length} commesse rimaste`);
    }
    
    // Filtra per mese sulla data della commessa (come nella tabella)
    if (this.filtroMargini.mese && this.filtroMargini.mese !== '') {
        commesseFiltrate = commesseFiltrate.filter(commessa => {
            const dataCommessa = commessa.dataInizio || commessa.dataCreazione;
            if (!dataCommessa) return true;
            const meseCommessa = dataCommessa.split('-')[1];
            return meseCommessa === this.filtroMargini.mese;
        });
        console.log(`📅 Filtro mese ${this.filtroMargini.mese}: ${commesseFiltrate.length} commesse rimaste`);
    }
    
    // 2. CALCOLA MARGINI PER OGNI COMMESSA USANDO LO STESSO METODO DELLA TABELLA
    const risultati = [];
    
    for (const commessa of commesseFiltrate) {
        if (!commessa.nomeCommessa) continue;
        
        // USA LO STESSO METODO DELLA TABELLA MONITORAGGIO
        const stats = this.calcolaStatisticheCommessa(commessa, tutteLeOre);
        
        // Prendi i valori esattamente come nella tabella
        const margine = stats.marginePercentuale;
        const preventivo = stats.valorePreventivo || commessa.valorePreventivo || 0;
        const ricavoTotale = stats.ricavoTotale || preventivo;
        const oreLavorate = stats.oreLavorateTotali || 0;
        
        risultati.push({
            nome: commessa.nomeCommessa,
            margine: margine,
            preventivo: preventivo,
            ricavoTotale: ricavoTotale,
            oreLavorate: oreLavorate,
            stato: commessa.stato || 'attiva'
        });
    }
    
    // 3. ORDINA PER MARGINE (decrescente)
    risultati.sort((a, b) => b.margine - a.margine);
    this.tuttiMargini = risultati;
    
    console.log(`📊 Risultato: ${this.tuttiMargini.length} commesse`);
    console.log('Prime 5:', this.tuttiMargini.slice(0, 5).map(m => ({
        nome: m.nome,
        margine: m.margine.toFixed(1) + '%'
    })));
    
    // 4. AGGIORNA INFO FILTRI
    const infoFiltri = document.getElementById('infoFiltriMargini');
    if (infoFiltri) {
        let testo = '';
        if (this.filtroMargini.anno) testo += `Anno: ${this.filtroMargini.anno} `;
        if (this.filtroMargini.mese) {
            const mesi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
            testo += `Mese: ${mesi[parseInt(this.filtroMargini.mese) - 1]}`;
        }
        infoFiltri.textContent = testo || 'Tutti i dati';
        if (this.filtroMargini.anno || this.filtroMargini.mese) {
            infoFiltri.textContent += ` (${this.tuttiMargini.length} commesse)`;
        }
    }
    
    // 5. RESET PAGINA E DISEGNA
    this.paginaMarginiCorrente = 1;
    this.disegnaGraficoMargini();
}
popolaAnniFiltriGrafici(tutteLeOre, commesse) {
    // Estrai anni unici dalle DATE DELLE COMMESSE (come nella tabella)
    const anni = new Set();
    
    // Prendi anni dalle commesse
    commesse.forEach(commessa => {
        const dataCommessa = commessa.dataInizio || commessa.dataCreazione;
        if (dataCommessa) {
            const anno = dataCommessa.split('-')[0];
            if (anno) anni.add(anno);
        }
    });
    
    // Aggiungi anche l'anno corrente se non c'è
    const annoCorrente = new Date().getFullYear().toString();
    anni.add(annoCorrente);
    
    const anniArray = Array.from(anni).sort().reverse();
    
    // Popola select per margini
    const selectMargini = document.getElementById('filtroAnnoMargini');
    if (selectMargini) {
        const valoreCorrente = selectMargini.value;
        selectMargini.innerHTML = '<option value="">Tutti gli anni</option>';
        anniArray.forEach(anno => {
            const option = document.createElement('option');
            option.value = anno;
            option.textContent = anno;
            selectMargini.appendChild(option);
        });
        if (valoreCorrente) selectMargini.value = valoreCorrente;
    }
    
    // Popola select per ore dipendenti
    const selectOre = document.getElementById('filtroAnnoOreDipendenti');
    if (selectOre) {
        const valoreCorrente = selectOre.value;
        selectOre.innerHTML = '<option value="">Tutti gli anni</option>';
        anniArray.forEach(anno => {
            const option = document.createElement('option');
            option.value = anno;
            option.textContent = anno;
            selectOre.appendChild(option);
        });
        if (valoreCorrente) selectOre.value = valoreCorrente;
    }
}
async calcolaStatisticheCommessaConFiltro(commessa, oreFiltrate) {
    try {
        // Valori base dalla commessa
        let valorePreventivo = parseFloat(commessa.valorePreventivo) || 0;
        let oreIntegrazione = parseFloat(commessa.oreIntegrazione) || 0;
        
        // Filtra ore per questa commessa (solo quelle già filtrate per data)
        const oreCommessa = oreFiltrate.filter(ore => {
            if (!ore || !ore.commessa) return false;
            const nomeOre = ore.commessa.trim().toLowerCase();
            const nomeComm = commessa.nomeCommessa.trim().toLowerCase();
            return nomeOre === nomeComm;
        });
        
        // Calcola ore lavorate totali
        let oreLavorateTotali = 0;
        let oreNonConformita = 0;
        
        oreCommessa.forEach(ore => {
            if (ore.oraInizio && ore.oraFine) {
                try {
                    const oreCalc = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
                    if (!isNaN(oreCalc) && oreCalc > 0) {
                        oreLavorateTotali += oreCalc;
                        if (ore.nonConformita === true) {
                            oreNonConformita += oreCalc;
                        }
                    }
                } catch (e) {
                    console.warn(`Errore calcolo ore:`, e);
                }
            }
        });
        
        // Costi
        const tariffaOraria = window.TARIFFA_ORARIA || 28.50;
        const costoOreTotali = oreLavorateTotali * tariffaOraria;
        
        // Integrazione
        const costoIntegrazione = oreIntegrazione * tariffaOraria;
        
        // Ricavo totale = preventivo + integrazione
        const ricavoTotale = valorePreventivo + costoIntegrazione;
        
        // Margine
        let marginePercentuale = 0;
        if (ricavoTotale > 0) {
            const margineEuro = ricavoTotale - costoOreTotali;
            marginePercentuale = (margineEuro / ricavoTotale) * 100;
        } else if (valorePreventivo > 0) {
            const margineEuro = valorePreventivo - costoOreTotali;
            marginePercentuale = (margineEuro / valorePreventivo) * 100;
        }
        
        // Limita il margine tra -100 e 100 per visualizzazione
        marginePercentuale = Math.min(100, Math.max(-100, marginePercentuale));
        
        return {
            valorePreventivo: valorePreventivo,
            oreLavorateTotali: oreLavorateTotali,
            costoOreTotali: costoOreTotali,
            ricavoTotale: ricavoTotale,
            marginePercentuale: marginePercentuale,
            datiCompleti: valorePreventivo > 0
        };
        
    } catch (error) {
        console.error(`Errore calcolo per ${commessa?.nomeCommessa}:`, error);
        return {
            valorePreventivo: 0,
            oreLavorateTotali: 0,
            costoOreTotali: 0,
            ricavoTotale: 0,
            marginePercentuale: 0,
            datiCompleti: false
        };
    }
}

// Aggiorna grafico ore dipendenti con filtri
async aggiornaGraficoOreDipendenti(tutteLeOre, dipendenti) {
    // Applica filtri alle ore
    let oreFiltrate = tutteLeOre;
    
    if (this.filtroOreDipendenti.anno) {
        oreFiltrate = oreFiltrate.filter(ore => {
            if (!ore.data) return false;
            const anno = ore.data.split('-')[0];
            return anno === this.filtroOreDipendenti.anno;
        });
    }
    
    if (this.filtroOreDipendenti.mese) {
        oreFiltrate = oreFiltrate.filter(ore => {
            if (!ore.data) return false;
            const mese = ore.data.split('-')[1];
            return mese === this.filtroOreDipendenti.mese;
        });
    }
    
    // Calcola ore per dipendente con ore filtrate
    const orePerDipendente = {};
    
    dipendenti.forEach(dip => {
        const nomeCompleto = `${dip.nome} ${dip.cognome}`;
        orePerDipendente[nomeCompleto] = 0;
    });
    
    oreFiltrate.forEach(ore => {
        const nomeCompleto = `${ore.nomeDipendente} ${ore.cognomeDipendente}`;
        const oreLavorate = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
        if (orePerDipendente[nomeCompleto] !== undefined) {
            orePerDipendente[nomeCompleto] += oreLavorate;
        }
    });
    
    this.tutteOreDipendenti = Object.entries(orePerDipendente)
        .filter(([_, ore]) => ore > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([nome, ore]) => ({ nome, ore: parseFloat(ore.toFixed(1)) }));
    
    // Aggiorna info filtri
    const infoFiltri = document.getElementById('infoFiltriOreDipendenti');
    if (infoFiltri) {
        let testo = '';
        if (this.filtroOreDipendenti.anno) testo += `Anno: ${this.filtroOreDipendenti.anno} `;
        if (this.filtroOreDipendenti.mese) {
            const mesi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
            testo += `Mese: ${mesi[parseInt(this.filtroOreDipendenti.mese) - 1]}`;
        }
        infoFiltri.textContent = testo || 'Tutti i dati';
    }
    
    // Reset pagina e ridisegna
    this.paginaOreCorrente = 1;
    this.disegnaGraficoOreDipendenti();
}

// Metodo helper per calcolare statistiche con ore specifiche
calcolaStatisticheCommessaConOre(commessa, oreFiltrate) {
    try {
        let valorePreventivo = parseFloat(commessa.valorePreventivo) || 0;
        let oreTotaliPreviste = parseFloat(commessa.oreTotaliPreviste) || 0;
        let oreIntegrazione = parseFloat(commessa.oreIntegrazione) || 0;
        
        // Filtra ore per questa commessa
        const oreCommessa = oreFiltrate.filter(ore => {
            if (!ore || !ore.commessa) return false;
            const nomeOre = ore.commessa.trim().toLowerCase();
            const nomeComm = commessa.nomeCommessa.trim().toLowerCase();
            return nomeOre === nomeComm;
        });
        
        let oreLavorateTotali = 0;
        let oreNonConformita = 0;
        
        oreCommessa.forEach(ore => {
            if (ore.oraInizio && ore.oraFine) {
                const oreCalc = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
                oreLavorateTotali += oreCalc;
                if (ore.nonConformita === true) {
                    oreNonConformita += oreCalc;
                }
            }
        });
        
        const tariffaOraria = 28.50;
        const costoTariffaNC = 28.50;
        
        // CALCOLO CORRETTO DEL COSTO
        const oreConformi = oreLavorateTotali - oreNonConformita;
        const costoOreConformi = oreConformi * tariffaOraria;
        const costoOreNonConformi = oreNonConformita * costoTariffaNC;
        const costoOreTotali = costoOreConformi + costoOreNonConformi;
        
        // COSTO INTEGRAZIONE
        const costoIntegrazione = oreIntegrazione * tariffaOraria;
        
        // RICAVO TOTALE (preventivo + integrazione)
        const ricavoTotale = valorePreventivo + costoIntegrazione;
        
        // MARGINE CORRETTO
        let margineEuro = ricavoTotale - costoOreTotali;
        let marginePercentuale = 0;
        
        if (ricavoTotale > 0) {
            marginePercentuale = (margineEuro / ricavoTotale) * 100;
        }
        
        // DEBUG per verificare
        console.log(`📊 ${commessa.nomeCommessa}:`, {
            preventivo: valorePreventivo,
            ricavo: ricavoTotale,
            costoOre: costoOreTotali,
            margineEuro: margineEuro,
            marginePercentuale: marginePercentuale.toFixed(1)
        });
        
        return {
            valorePreventivo: valorePreventivo,
            oreTotaliPreviste: oreTotaliPreviste,
            marginePercentuale: marginePercentuale,
            ricavoTotale: ricavoTotale,
            datiCompleti: valorePreventivo > 0
        };
    } catch (error) {
        console.error(`Errore calcolo per ${commessa?.nomeCommessa}:`, error);
        return {
            valorePreventivo: 0,
            oreTotaliPreviste: 0,
            marginePercentuale: 0,
            ricavoTotale: 0,
            datiCompleti: false
        };
    }
}

// Aggiungi listener per i filtri
aggiungiListenerFiltriGrafici() {
    // Filtri grafico margini
    const btnApplicaMargini = document.getElementById('btnApplicaFiltriMargini');
    const btnResetMargini = document.getElementById('btnResetFiltriMargini');
    const selectAnnoMargini = document.getElementById('filtroAnnoMargini');
    const selectMeseMargini = document.getElementById('filtroMeseMargini');
    
    if (btnApplicaMargini) {
        btnApplicaMargini.onclick = async () => {
            this.filtroMargini = {
                anno: selectAnnoMargini?.value || '',
                mese: selectMeseMargini?.value || ''
            };
            console.log('🔍 Filtro margini applicato:', this.filtroMargini);
            
            const [commesse, tutteLeOre] = await Promise.all([
                this.firebaseService.getCollection("commesse"),
                this.firebaseService.getCollection("oreLavorate")
            ]);
            await this.aggiornaGraficoMargini(commesse, tutteLeOre);
            ErrorHandler.showNotification('Filtri applicati al grafico margini', 'success');
        };
    }
    
    if (btnResetMargini) {
        btnResetMargini.onclick = async () => {
            this.filtroMargini = { anno: '', mese: '' };
            if (selectAnnoMargini) selectAnnoMargini.value = '';
            if (selectMeseMargini) selectMeseMargini.value = '';
            console.log('🔍 Reset filtri margini');
            
            const [commesse, tutteLeOre] = await Promise.all([
                this.firebaseService.getCollection("commesse"),
                this.firebaseService.getCollection("oreLavorate")
            ]);
            await this.aggiornaGraficoMargini(commesse, tutteLeOre);
            ErrorHandler.showNotification('Filtri resettati', 'info');
        };
    }
    
    // Filtri grafico ore dipendenti (se non esistono già)
    const btnApplicaOre = document.getElementById('btnApplicaFiltriOreDipendenti');
    const btnResetOre = document.getElementById('btnResetFiltriOreDipendenti');
    const selectAnnoOre = document.getElementById('filtroAnnoOreDipendenti');
    const selectMeseOre = document.getElementById('filtroMeseOreDipendenti');
    
    if (btnApplicaOre) {
        btnApplicaOre.onclick = async () => {
            this.filtroOreDipendenti = {
                anno: selectAnnoOre?.value || '',
                mese: selectMeseOre?.value || ''
            };
            console.log('🔍 Filtro ore dipendenti applicato:', this.filtroOreDipendenti);
            
            const [tutteLeOre, dipendenti] = await Promise.all([
                this.firebaseService.getCollection("oreLavorate"),
                this.firebaseService.getCollection("dipendenti")
            ]);
            await this.aggiornaGraficoOreDipendenti(tutteLeOre, dipendenti);
        };
    }
    
    if (btnResetOre) {
        btnResetOre.onclick = async () => {
            this.filtroOreDipendenti = { anno: '', mese: '' };
            if (selectAnnoOre) selectAnnoOre.value = '';
            if (selectMeseOre) selectMeseOre.value = '';
            
            const [tutteLeOre, dipendenti] = await Promise.all([
                this.firebaseService.getCollection("oreLavorate"),
                this.firebaseService.getCollection("dipendenti")
            ]);
            await this.aggiornaGraficoOreDipendenti(tutteLeOre, dipendenti);
        };
    }
}

disegnaGraficoMargini() {
    const canvas = document.getElementById('chartMarginiCommesse');
    if (!canvas) return;
    
    if (window.chartMarginiCommesse && typeof window.chartMarginiCommesse.destroy === 'function') {
        window.chartMarginiCommesse.destroy();
    }
    
    // Filtra solo commesse con margine valido (non NaN e non undefined)
    const marginiValidi = this.tuttiMargini.filter(item => {
        return item && typeof item.margine === 'number' && !isNaN(item.margine);
    });
    
    if (marginiValidi.length === 0) {
        this.mostraMessaggioGraficoVuoto(canvas, 'Nessun margine disponibile con i filtri selezionati');
        return;
    }
    
    // Calcola indici paginazione
    const startIndex = (this.paginaMarginiCorrente - 1) * this.elementiPerPagina;
    const endIndex = startIndex + this.elementiPerPagina;
    const datiPagina = marginiValidi.slice(startIndex, endIndex);
    
    const totalePagine = Math.ceil(marginiValidi.length / this.elementiPerPagina);
    const paginaInfo = document.getElementById('paginaMarginiInfo');
    if (paginaInfo) {
        paginaInfo.textContent = `Pagina ${this.paginaMarginiCorrente} / ${totalePagine || 1} (${marginiValidi.length} totali)`;
    }
    
    const btnPrec = document.getElementById('btnPrecMargini');
    const btnSucc = document.getElementById('btnSuccMargini');
    if (btnPrec) btnPrec.disabled = this.paginaMarginiCorrente === 1;
    if (btnSucc) btnSucc.disabled = this.paginaMarginiCorrente === totalePagine || totalePagine === 0;
    
    if (datiPagina.length === 0) {
        this.mostraMessaggioGraficoVuoto(canvas, 'Nessuna commessa con margini disponibili');
        return;
    }
    
    // DEBUG: stampa i dati visualizzati
    console.log('📊 Dati visualizzati nel grafico:', datiPagina.map(d => ({
        nome: d.nome,
        margine: d.margine.toFixed(1) + '%',
        preventivo: '€' + d.preventivo
    })));
    
    // Colori in base al margine
    const colori = datiPagina.map(item => {
        const m = item.margine;
        if (m >= 30) return 'rgba(40, 167, 69, 0.8)';
        if (m >= 20) return 'rgba(23, 162, 184, 0.8)';
        if (m >= 10) return 'rgba(255, 193, 7, 0.8)';
        if (m >= 0) return 'rgba(253, 126, 20, 0.8)';
        return 'rgba(220, 53, 69, 0.8)';
    });
    
    canvas.style.height = '300px';
    canvas.style.width = '100%';
    canvas.height = 300;
    
    const ctx = canvas.getContext('2d');
    
    window.chartMarginiCommesse = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: datiPagina.map(item => {
                let nome = item.nome;
                if (nome.length > 25) nome = nome.substring(0, 22) + '...';
                return nome;
            }),
            datasets: [{
                label: 'Margine (%)',
                data: datiPagina.map(item => {
                    // Mostra il margine reale, limitato tra -50 e 100
                    return Math.min(100, Math.max(-50, item.margine));
                }),
                backgroundColor: colori,
                borderColor: colori.map(c => c.replace('0.8', '1')),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const val = context.raw;
                            const item = datiPagina[context.dataIndex];
                            if (item) {
                                return [
                                    `Margine: ${item.margine.toFixed(1)}%`,
                                    `Preventivo: € ${item.preventivo.toFixed(2)}`,
                                    `Ricavo: € ${(item.ricavoTotale || item.preventivo).toFixed(2)}`,
                                    `Ore lavorate: ${item.oreLavorate?.toFixed(1) || 0}h`
                                ];
                            }
                            return `Margine: ${val}%`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Margine (%)' },
                    ticks: { 
                        callback: (v) => v + '%', 
                        stepSize: 20 
                    },
                    min: -50,
                    max: 100
                },
                x: {
                    ticks: { 
                        maxRotation: 35, 
                        minRotation: 35, 
                        autoSkip: false, 
                        font: { size: 10 } 
                    }
                }
            }
        }
    });
}

// Disegna grafico ore dipendenti con paginazione
disegnaGraficoOreDipendenti() {
    const canvas = document.getElementById('chartOreDipendenti');
    if (!canvas) return;
    
    // Distruggi grafico esistente
    if (window.chartOreDipendenti && typeof window.chartOreDipendenti.destroy === 'function') {
        window.chartOreDipendenti.destroy();
    }
    
    // Calcola indici paginazione
    const startIndex = (this.paginaOreCorrente - 1) * this.elementiPerPagina;
    const endIndex = startIndex + this.elementiPerPagina;
    const datiPagina = this.tutteOreDipendenti.slice(startIndex, endIndex);
    
    // Aggiorna info pagina
    const totalePagine = Math.ceil(this.tutteOreDipendenti.length / this.elementiPerPagina);
    const paginaInfo = document.getElementById('paginaOreDipendentiInfo');
    if (paginaInfo) {
        paginaInfo.textContent = `Pagina ${this.paginaOreCorrente} / ${totalePagine || 1} (${this.tutteOreDipendenti.length} dipendenti)`;
    }
    
    // Abilita/disabilita pulsanti
    const btnPrec = document.getElementById('btnPrecOreDipendenti');
    const btnSucc = document.getElementById('btnSuccOreDipendenti');
    if (btnPrec) btnPrec.disabled = this.paginaOreCorrente === 1;
    if (btnSucc) btnSucc.disabled = this.paginaOreCorrente === totalePagine || totalePagine === 0;
    
    if (datiPagina.length === 0) {
        this.mostraMessaggioGraficoVuoto(canvas, 'Nessuna ora lavorata registrata');
        return;
    }
    
    // Mantieni dimensioni fisse del canvas
    canvas.style.height = '300px';
    canvas.style.width = '100%';
    canvas.height = 300;
    
    const ctx = canvas.getContext('2d');
    window.chartOreDipendenti = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: datiPagina.map(item => item.nome.length > 20 ? item.nome.substring(0, 17) + '...' : item.nome),
            datasets: [{
                label: 'Ore Lavorate',
                data: datiPagina.map(item => item.ore),
                backgroundColor: 'rgba(52, 152, 219, 0.7)',
                borderColor: 'rgba(52, 152, 219, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const ore = context.raw;
                            const oreFormattate = Utils.formattaOreDecimali(ore);
                            return `${oreFormattate} ore (${ore.toFixed(1)}h)`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Ore Lavorate' },
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => Utils.formattaOreDecimali(value)
                    }
                },
                x: {
                    ticks: {
                        maxRotation: 35,
                        minRotation: 35,
                        autoSkip: false,
                        font: { size: 10 }
                    }
                }
            }
        }
    });
}

// Aggiungi listener per pulsanti di paginazione
aggiungiListenerPaginazione() {
    // Rimuovi listener esistenti per evitare duplicati
    const btnPrecMargini = document.getElementById('btnPrecMargini');
    const btnSuccMargini = document.getElementById('btnSuccMargini');
    const btnPrecOre = document.getElementById('btnPrecOreDipendenti');
    const btnSuccOre = document.getElementById('btnSuccOreDipendenti');
    
    // Clona e sostituisci per rimuovere listener vecchi
    if (btnPrecMargini) {
        const newBtn = btnPrecMargini.cloneNode(true);
        btnPrecMargini.parentNode.replaceChild(newBtn, btnPrecMargini);
        newBtn.addEventListener('click', () => {
            if (this.paginaMarginiCorrente > 1) {
                this.paginaMarginiCorrente--;
                this.disegnaGraficoMargini();
            }
        });
    }
    
    if (btnSuccMargini) {
        const newBtn = btnSuccMargini.cloneNode(true);
        btnSuccMargini.parentNode.replaceChild(newBtn, btnSuccMargini);
        newBtn.addEventListener('click', () => {
            const totalePagine = Math.ceil(this.tuttiMargini.length / this.elementiPerPagina);
            if (this.paginaMarginiCorrente < totalePagine) {
                this.paginaMarginiCorrente++;
                this.disegnaGraficoMargini();
            }
        });
    }
    
    if (btnPrecOre) {
        const newBtn = btnPrecOre.cloneNode(true);
        btnPrecOre.parentNode.replaceChild(newBtn, btnPrecOre);
        newBtn.addEventListener('click', () => {
            if (this.paginaOreCorrente > 1) {
                this.paginaOreCorrente--;
                this.disegnaGraficoOreDipendenti();
            }
        });
    }
    
    if (btnSuccOre) {
        const newBtn = btnSuccOre.cloneNode(true);
        btnSuccOre.parentNode.replaceChild(newBtn, btnSuccOre);
        newBtn.addEventListener('click', () => {
            const totalePagine = Math.ceil(this.tutteOreDipendenti.length / this.elementiPerPagina);
            if (this.paginaOreCorrente < totalePagine) {
                this.paginaOreCorrente++;
                this.disegnaGraficoOreDipendenti();
            }
        });
    }
}
// Ridimensiona i grafici quando la finestra cambia
resizeGrafici() {
    if (window.chartMarginiCommesse) {
        window.chartMarginiCommesse.resize();
    }
    if (window.chartOreDipendenti) {
        window.chartOreDipendenti.resize();
    }
    if (window.chartStatoCommesse) {
        window.chartStatoCommesse.resize();
    }
    if (window.chartAndamentoMensile) {
        window.chartAndamentoMensile.resize();
    }
}
async debugMargini() {
    console.log('=== DEBUG MARGINI COMMESSE ===');
    
    const [commesse, tutteLeOre] = await Promise.all([
        this.firebaseService.getCollection("commesse"),
        this.firebaseService.getCollection("oreLavorate")
    ]);
    
    // Prima controlla se ci sono ore con orari non validi
    let oreValide = 0;
    let oreInvalidi = 0;
    
    tutteLeOre.forEach(ore => {
        const oreCalc = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
        if (oreCalc > 0) {
            oreValide++;
        } else {
            oreInvalidi++;
            console.warn(`Record con orari non validi:`, {
                id: ore.id,
                commessa: ore.commessa,
                oraInizio: ore.oraInizio,
                oraFine: ore.oraFine,
                data: ore.data
            });
        }
    });
    
    console.log(`📊 Ore valide: ${oreValide}, Ore non valide: ${oreInvalidi}`);
    
    if (oreInvalidi > 0) {
        console.log('💡 Suggerimento: Esegui app.pulisciRecordOreInvalidi() per correggere i record');
    }
    
    // Calcola margini solo per commesse con ore valide
    for (const commessa of commesse) {
        // Filtra solo ore valide per questa commessa
        const oreCommessa = tutteLeOre.filter(ore => {
            if (!ore.commessa) return false;
            const oreCalc = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
            return ore.commessa.toLowerCase().trim() === commessa.nomeCommessa.toLowerCase().trim() && oreCalc > 0;
        });
        
        const stats = this.calcolaStatisticheCommessaConOre(commessa, oreCommessa);
        
        if (stats.datiCompleti) {
            console.log(`${commessa.nomeCommessa}:`, {
                preventivo: `€${stats.valorePreventivo.toFixed(2)}`,
                ricavo: `€${stats.ricavoTotale.toFixed(2)}`,
                costoOre: `€${stats.costoOreTotali?.toFixed(2) || 'N/D'}`,
                marginePercentuale: `${stats.marginePercentuale.toFixed(1)}%`,
                oreCollegate: oreCommessa.length
            });
        }
    }
}
async correggiOrariVentiquattro() {
    console.log('🔧 Correzione record con ora 24:00...');
    
    try {
        const tutteLeOre = await this.firebaseService.getCollection("oreLavorate");
        let recordCorretti = 0;
        
        for (const ore of tutteLeOre) {
            let needsUpdate = false;
            let nuovaFine = ore.oraFine;
            
            // Correggi "24:00" in "23:59" o "00:00" del giorno dopo?
            if (ore.oraFine === "24:00") {
                nuovaFine = "23:59";
                needsUpdate = true;
                console.log(`📝 Correzione record ${ore.id}: ${ore.oraFine} -> 23:59`);
            }
            
            // Controlla anche altri formati anomali
            if (ore.oraFine === "24:00" || ore.oraFine === "24:00:00") {
                nuovaFine = "23:59";
                needsUpdate = true;
            }
            
            // Controlla se l'ora inizio è maggiore dell'ora fine (esclude mezzanotte)
            if (ore.oraInizio && ore.oraFine && ore.oraFine !== "23:59") {
                const inizioNum = parseInt(ore.oraInizio.split(':')[0]);
                const fineNum = parseInt(ore.oraFine.split(':')[0]);
                if (fineNum < inizioNum && fineNum !== 0) {
                    console.warn(`⚠️ Orario anomalo: ${ore.oraInizio} - ${ore.oraFine} per ${ore.id}`);
                }
            }
            
            if (needsUpdate) {
                await this.firebaseService.updateDocument("oreLavorate", ore.id, {
                    oraFine: nuovaFine
                });
                recordCorretti++;
            }
        }
        
        console.log(`✅ Corretti ${recordCorretti} record con ora 24:00`);
        
        if (recordCorretti > 0) {
            ErrorHandler.showNotification(`Corretti ${recordCorretti} record con ora 24:00`, 'success');
            // Ricarica i grafici
            await this.creaGraficiDashboard();
        }
        
        return recordCorretti;
        
    } catch (error) {
        console.error('Errore correzione orari:', error);
        return 0;
    }
}
async verificaRecordOre() {
    console.log('=== VERIFICA RECORD ORE ===');
    
    const tutteLeOre = await this.firebaseService.getCollection("oreLavorate");
    
    let validi = 0;
    let nonValidi = [];
    
    for (const ore of tutteLeOre) {
        const isValid = Utils.isValidTimeFormat(ore.oraInizio) && Utils.isValidTimeFormat(ore.oraFine);
        
        if (!isValid) {
            nonValidi.push({
                id: ore.id,
                commessa: ore.commessa,
                data: ore.data,
                oraInizio: ore.oraInizio,
                oraFine: ore.oraFine
            });
        } else {
            validi++;
        }
    }
    
    console.log(`📊 Record validi: ${validi}`);
    console.log(`⚠️ Record non validi: ${nonValidi.length}`);
    
    if (nonValidi.length > 0) {
        console.table(nonValidi);
        console.log('💡 Per correggere: app.pulisciRecordOreInvalidi()');
    }
    
    return nonValidi;
}

// GRAFICO 1: Margini Commesse (TUTTE le commesse con scroll)
async creaGraficoMarginiCommesse(commesse, tutteLeOre) {
    const canvas = document.getElementById('chartMarginiCommesse');
    if (!canvas) {
        console.warn('Canvas chartMarginiCommesse non trovato');
        return;
    }
    
    // Aggiungi un container con scroll se necessario
    const container = canvas.parentElement;
    if (container && !container.querySelector('.chart-scroll-controls')) {
        container.style.overflowX = 'auto';
        container.style.overflowY = 'hidden';
        container.style.width = '100%';
        
        // Imposta larghezza dinamica in base al numero di dati
        canvas.style.minWidth = '100%';
    }
    
    // Distruggi grafico esistente
    if (window.chartMarginiCommesse && typeof window.chartMarginiCommesse.destroy === 'function') {
        window.chartMarginiCommesse.destroy();
    }
    
    // Calcola margini per TUTTE le commesse
    const marginiCommesse = [];
    
    for (const commessa of commesse) {
        const stats = this.calcolaStatisticheCommessa(commessa, tutteLeOre);
        if (stats.datiCompleti && stats.marginePercentuale !== 0 && stats.marginePercentuale !== undefined) {
            marginiCommesse.push({
                nome: commessa.nomeCommessa,
                margine: stats.marginePercentuale,
                preventivo: stats.valorePreventivo,
                ricavoTotale: stats.ricavoTotale
            });
        }
    }
    
    if (marginiCommesse.length === 0) {
        this.mostraMessaggioGraficoVuoto(canvas, 'Nessuna commessa con margini disponibili');
        return;
    }
    
    // Ordina per margine decrescente
    marginiCommesse.sort((a, b) => b.margine - a.margine);
    
    // Colori in base al margine
    const colori = marginiCommesse.map(item => {
        if (item.margine >= 30) return 'rgba(40, 167, 69, 0.8)';
        if (item.margine >= 20) return 'rgba(23, 162, 184, 0.8)';
        if (item.margine >= 10) return 'rgba(255, 193, 7, 0.8)';
        if (item.margine >= 0) return 'rgba(253, 126, 20, 0.8)';
        return 'rgba(220, 53, 69, 0.8)';
    });
    
    // Calcola larghezza dinamica del canvas (40px per ogni commessa, min 800px)
    const larghezzaCanvas = Math.max(800, marginiCommesse.length * 40);
    canvas.style.width = `${larghezzaCanvas}px`;
    canvas.width = larghezzaCanvas;
    canvas.height = 300;
    
    // Aggiungi controlli scroll se necessario
    this.aggiungiControlliScroll(canvas, 'chartMarginiCommesse');
    
    const ctx = canvas.getContext('2d');
    window.chartMarginiCommesse = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: marginiCommesse.map(item => item.nome.length > 20 ? item.nome.substring(0, 17) + '...' : item.nome),
            datasets: [{
                label: 'Margine (%)',
                data: marginiCommesse.map(item => parseFloat(item.margine.toFixed(1))),
                backgroundColor: colori,
                borderColor: colori.map(c => c.replace('0.8', '1')),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Rende il grafico orizzontale se ci sono molti dati
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const valore = context.raw;
                            const commessa = marginiCommesse[context.dataIndex];
                            return [
                                `Margine: ${valore}%`,
                                `Preventivo: € ${commessa.preventivo.toFixed(2)}`,
                                `Ricavo Totale: € ${commessa.ricavoTotale?.toFixed(2) || commessa.preventivo.toFixed(2)}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Margine (%)' },
                    ticks: { callback: (value) => value + '%' },
                    beginAtZero: true
                },
                y: {
                    ticks: {
                        autoSkip: false,
                        font: { size: 10 }
                    }
                }
            },
            layout: {
                padding: {
                    left: 10,
                    right: 10,
                    top: 10,
                    bottom: 10
                }
            }
        }
    });
}
// Aggiungi pulsanti nel header del grafico
aggiungiPulsantiVisualizzazione() {
    const cardHeader = document.querySelector('#chartMarginiCommesse')?.closest('.card')?.querySelector('.card-header');
    if (!cardHeader) return;
    
    const btnGroup = document.createElement('div');
    btnGroup.className = 'btn-group btn-group-sm ms-auto';
    btnGroup.innerHTML = `
        <button class="btn btn-outline-secondary btn-vista-barre" data-tipo="barre">
            <i class="fas fa-chart-bar"></i> Barre
        </button>
        <button class="btn btn-outline-secondary btn-vista-linee" data-tipo="linee">
            <i class="fas fa-chart-line"></i> Linee
        </button>
    `;
    
    cardHeader.appendChild(btnGroup);
    
    btnGroup.querySelector('.btn-vista-barre')?.addEventListener('click', () => {
        this.cambiaTipoGrafico('chartMarginiCommesse', 'bar');
    });
    
    btnGroup.querySelector('.btn-vista-linee')?.addEventListener('click', () => {
        this.cambiaTipoGrafico('chartMarginiCommesse', 'line');
    });
}

// Cambia tipo di grafico
cambiaTipoGrafico(chartId, tipo) {
    const chart = window[chartId];
    if (chart) {
        chart.config.type = tipo;
        chart.update();
    }
}
// GRAFICO 2: Stato Commesse (Pie Chart) - CORRETTO
async creaGraficoStatoCommesse(commesse) {
    const canvas = document.getElementById('chartStatoCommesse');
    if (!canvas) {
        console.warn('Canvas chartStatoCommesse non trovato');
        return;
    }
    
    if (window.chartStatoCommesse && typeof window.chartStatoCommesse.destroy === 'function') {
        window.chartStatoCommesse.destroy();
    }
    
    const attive = commesse.filter(c => c.stato === 'attiva' || !c.stato).length;
    const concluse = commesse.filter(c => c.stato === 'conclusa').length;
    
    const ctx = canvas.getContext('2d');
    window.chartStatoCommesse = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: [`Attive (${attive})`, `Concluse (${concluse})`],
            datasets: [{
                data: [attive, concluse],
                backgroundColor: ['rgba(40, 167, 69, 0.8)', 'rgba(108, 117, 125, 0.8)'],
                borderColor: ['#28a745', '#6c757d'],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom' },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = attive + concluse;
                            const percentuale = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} (${percentuale}%)`;
                        }
                    }
                }
            }
        }
    });
}
       

// GRAFICO 3: Ore Lavorate per Dipendente
// GRAFICO 3: Ore Lavorate per Dipendente (TUTTI i dipendenti)
async creaGraficoOreDipendenti(tutteLeOre, dipendenti) {
    const canvas = document.getElementById('chartOreDipendenti');
    if (!canvas) return;
    
    if (window.chartOreDipendenti && typeof window.chartOreDipendenti.destroy === 'function') {
        window.chartOreDipendenti.destroy();
    }
    
    // Calcola ore per TUTTI i dipendenti
    const orePerDipendente = {};
    
    // Inizializza tutti i dipendenti con 0 ore
    dipendenti.forEach(dip => {
        const nomeCompleto = `${dip.nome} ${dip.cognome}`;
        orePerDipendente[nomeCompleto] = 0;
    });
    
    // Somma le ore
    tutteLeOre.forEach(ore => {
        const nomeCompleto = `${ore.nomeDipendente} ${ore.cognomeDipendente}`;
        const oreLavorate = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
        if (orePerDipendente[nomeCompleto] !== undefined) {
            orePerDipendente[nomeCompleto] += oreLavorate;
        }
    });
    
    // Converti in array e ordina per ore decrescenti
    const sorted = Object.entries(orePerDipendente)
        .filter(([_, ore]) => ore > 0) // Solo chi ha ore > 0
        .sort((a, b) => b[1] - a[1]);
    
    if (sorted.length === 0) {
        this.mostraMessaggioGraficoVuoto(canvas, 'Nessuna ora lavorata registrata');
        return;
    }
    
    // Calcola larghezza dinamica
    const larghezzaCanvas = Math.max(800, sorted.length * 50);
    canvas.style.width = `${larghezzaCanvas}px`;
    canvas.width = larghezzaCanvas;
    canvas.height = 300;
    
    // Aggiungi controlli scroll
    this.aggiungiControlliScroll(canvas, 'chartOreDipendenti');
    
    const ctx = canvas.getContext('2d');
    window.chartOreDipendenti = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sorted.map(item => item[0].length > 15 ? item[0].substring(0, 12) + '...' : item[0]),
            datasets: [{
                label: 'Ore Lavorate',
                data: sorted.map(item => parseFloat(item[1].toFixed(1))),
                backgroundColor: 'rgba(52, 152, 219, 0.7)',
                borderColor: 'rgba(52, 152, 219, 1)',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y', // Grafico orizzontale per leggere meglio i nomi
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            const ore = context.raw;
                            const oreFormattate = Utils.formattaOreDecimali(ore);
                            return `${oreFormattate} ore (${ore.toFixed(1)}h)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Ore Lavorate' },
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => value + 'h'
                    }
                },
                y: {
                    ticks: {
                        autoSkip: false,
                        font: { size: 10 }
                    }
                }
            }
        }
    });
}

// GRAFICO 4: Andamento Mensile Ore
async creaGraficoAndamentoMensile(tutteLeOre) {
    const canvas = document.getElementById('chartAndamentoMensile');
    if (!canvas) return;
    
    if (window.chartAndamentoMensile && typeof window.chartAndamentoMensile.destroy === 'function') {
        window.chartAndamentoMensile.destroy();
    }
    
    const mesi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
    const orePerMese = new Array(12).fill(0);
    const annoCorrente = new Date().getFullYear();
    
    tutteLeOre.forEach(ore => {
        if (ore.data) {
            const parti = ore.data.split('-');
            if (parti.length >= 2) {
                const mese = parseInt(parti[1]) - 1;
                const anno = parseInt(parti[0]);
                if (anno === annoCorrente && mese >= 0 && mese < 12) {
                    const oreLavorate = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
                    orePerMese[mese] += oreLavorate;
                }
            }
        }
    });
    
    // Verifica se ci sono dati
    const hasData = orePerMese.some(ore => ore > 0);
    if (!hasData) {
        this.mostraMessaggioGraficoVuoto(canvas, `Nessuna ora registrata nel ${annoCorrente}`);
        return;
    }
    
    const ctx = canvas.getContext('2d');
    window.chartAndamentoMensile = new Chart(ctx, {
        type: 'line',
        data: {
            labels: mesi,
            datasets: [{
                label: `Ore Lavorate ${annoCorrente}`,
                data: orePerMese.map(ore => parseFloat(ore.toFixed(1))),
                borderColor: 'rgba(46, 204, 113, 1)',
                backgroundColor: 'rgba(46, 204, 113, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: 'rgba(46, 204, 113, 1)',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: (context) => {
                            return `${context.raw} ore`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Ore Lavorate' },
                    beginAtZero: true,
                    ticks: {
                        callback: (value) => value + 'h'
                    }
                }
            }
        }
    });
}

// Aggiungi controlli scroll per i grafici
aggiungiControlliScroll(canvas, chartId) {
    const container = canvas.parentElement;
    if (!container) return;
    
    // Rimuovi controlli esistenti
    const existingControls = container.querySelector('.chart-scroll-controls');
    if (existingControls) {
        existingControls.remove();
    }
    
    // Crea controlli scroll
    const controls = document.createElement('div');
    controls.className = 'chart-scroll-controls mt-2';
    controls.style.cssText = 'display: flex; align-items: center; gap: 10px; justify-content: space-between;';
    
    controls.innerHTML = `
        <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-secondary btn-scroll-left" title="Scroll sinistra">
                <i class="fas fa-chevron-left"></i>
            </button>
            <button class="btn btn-outline-secondary btn-scroll-right" title="Scroll destra">
                <i class="fas fa-chevron-right"></i>
            </button>
        </div>
        <div class="d-flex align-items-center gap-2">
            <span class="small text-muted">Trascina per vedere tutti</span>
            <i class="fas fa-arrows-alt-h text-muted"></i>
        </div>
        <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary btn-zoom-out" title="Zoom out">
                <i class="fas fa-search-minus"></i>
            </button>
            <button class="btn btn-outline-primary btn-zoom-in" title="Zoom in">
                <i class="fas fa-search-plus"></i>
            </button>
            <button class="btn btn-outline-danger btn-reset-zoom" title="Reset">
                <i class="fas fa-undo"></i>
            </button>
        </div>
    `;
    
    container.appendChild(controls);
    
    // Eventi scroll
    const scrollLeftBtn = controls.querySelector('.btn-scroll-left');
    const scrollRightBtn = controls.querySelector('.btn-scroll-right');
    const zoomInBtn = controls.querySelector('.btn-zoom-in');
    const zoomOutBtn = controls.querySelector('.btn-zoom-out');
    const resetZoomBtn = controls.querySelector('.btn-reset-zoom');
    
    let currentZoom = 1;
    const originalWidth = canvas.width;
    
    scrollLeftBtn?.addEventListener('click', () => {
        container.scrollLeft -= 100;
    });
    
    scrollRightBtn?.addEventListener('click', () => {
        container.scrollLeft += 100;
    });
    
    zoomInBtn?.addEventListener('click', () => {
        currentZoom = Math.min(currentZoom + 0.2, 2);
        canvas.style.zoom = currentZoom;
        if (window[`chart_${chartId}`]) {
            window[`chart_${chartId}`].update();
        }
    });
    
    zoomOutBtn?.addEventListener('click', () => {
        currentZoom = Math.max(currentZoom - 0.2, 0.5);
        canvas.style.zoom = currentZoom;
        if (window[`chart_${chartId}`]) {
            window[`chart_${chartId}`].update();
        }
    });
    
    resetZoomBtn?.addEventListener('click', () => {
        currentZoom = 1;
        canvas.style.zoom = 1;
        if (window[`chart_${chartId}`]) {
            window[`chart_${chartId}`].update();
        }
    });
}
// Metodo helper per mostrare messaggio quando il grafico è vuoto
mostraMessaggioGraficoVuoto(canvas, messaggio) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    ctx.clearRect(0, 0, width, height);
    ctx.font = '14px "Segoe UI", sans-serif';
    ctx.fillStyle = '#6c757d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(messaggio || 'Nessun dato disponibile', width / 2, height / 2);
}

// Esporta grafici come PNG
async esportaGraficiPNG() {
    try {
        // Verifica jsPDF
        if (typeof window.jspdf === 'undefined') {
            await this.caricaLibreriePDFDinamico();
        }
        
        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            ErrorHandler.showNotification('Librerie PDF non disponibili', 'error');
            return;
        }
        
        const doc = new jsPDF({
            orientation: 'landscape',
            unit: 'mm',
            format: 'a4'
        });
        
        // Titolo
        doc.setFontSize(18);
        doc.text('Dashboard Grafica - Report Commesse', 148, 20, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Generato il: ${new Date().toLocaleString('it-IT')}`, 148, 28, { align: 'center' });
        
        // Cattura i grafici
        const grafici = [
            { id: 'chartMarginiCommesse', titolo: 'Top 10 Margini Commesse', x: 10, y: 40, w: 70, h: 50 },
            { id: 'chartStatoCommesse', titolo: 'Stato Commesse', x: 160, y: 40, w: 70, h: 50 },
            { id: 'chartOreDipendenti', titolo: 'Ore Lavorate per Dipendente', x: 10, y: 120, w: 70, h: 50 },
            { id: 'chartAndamentoMensile', titolo: 'Andamento Mensile Ore', x: 160, y: 120, w: 70, h: 50 }
        ];
        
        let yOffset = 40;
        for (const grafico of grafici) {
            const canvas = document.getElementById(grafico.id);
            if (canvas && canvas.toDataURL) {
                try {
                    const imgData = canvas.toDataURL('image/png');
                    doc.setFontSize(10);
                    doc.text(grafico.titolo, grafico.x, grafico.y - 5);
                    doc.addImage(imgData, 'PNG', grafico.x, grafico.y, grafico.w, grafico.h);
                } catch (e) {
                    console.warn(`Errore esportazione ${grafico.id}:`, e);
                }
            }
        }
        
        doc.save(`dashboard_grafica_${new Date().toISOString().split('T')[0]}.pdf`);
        ErrorHandler.showNotification('Grafici esportati con successo!', 'success');
        
    } catch (error) {
        console.error('Errore esportazione grafici:', error);
        ErrorHandler.showNotification('Errore durante l\'esportazione', 'error');
    }
}
// ========== BACKUP E RIPRISTINO DATI ==========

async eseguiBackupDati() {
    try {
        console.log('💾 Avvio backup dati...');
        ErrorHandler.showNotification('Generazione backup in corso...', 'info');
        
        // Recupera tutti i dati
        const [commesse, dipendenti, oreLavorate, fornitori] = await Promise.all([
            this.firebaseService.getCollection("commesse"),
            this.firebaseService.getCollection("dipendenti"),
            this.firebaseService.getCollection("oreLavorate"),
            this.firebaseService.getCollection("fornitoriLavorazioni")
        ]);
        
        // Crea oggetto backup
        const backup = {
            metadata: {
                versione: "1.0",
                dataGenerazione: new Date().toISOString(),
                autore: stateManager.currentUser?.email || "Sconosciuto",
                conteggio: {
                    commesse: commesse.length,
                    dipendenti: dipendenti.length,
                    oreLavorate: oreLavorate.length,
                    fornitori: fornitori.length
                }
            },
            dati: {
                commesse: commesse,
                dipendenti: dipendenti,
                oreLavorate: oreLavorate,
                fornitori: fornitori
            }
        };
        
        // Converti in JSON
        const jsonString = JSON.stringify(backup, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        
        // Download
        const dataStr = new Date().toISOString().split('T')[0];
        const nomeFile = `backup_union14_${dataStr}.json`;
        
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = nomeFile;
        link.click();
        
        URL.revokeObjectURL(link.href);
        
        // Salva info ultimo backup
        localStorage.setItem('ultimoBackup', JSON.stringify({
            data: new Date().toISOString(),
            utente: stateManager.currentUser?.email,
            conteggio: backup.metadata.conteggio
        }));
        
        this.aggiornaInfoUltimoBackup();
        
        console.log('✅ Backup completato:', backup.metadata.conteggio);
        ErrorHandler.showNotification(`Backup completato! ${commesse.length} commesse, ${dipendenti.length} dipendenti`, 'success');
        
    } catch (error) {
        console.error('❌ Errore backup:', error);
        ErrorHandler.showNotification('Errore durante il backup dei dati', 'error');
    }
}

async ripristinaDaBackup(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const backup = JSON.parse(e.target.result);
                
                // Verifica struttura backup
                if (!backup.dati || !backup.dati.commesse) {
                    throw new Error('File backup non valido');
                }
                
                console.log('📦 Backup letto:', backup.metadata);
                
                const conferma = confirm(
                    `⚠️ ATTENZIONE: Questa operazione SOSTITUIRÀ tutti i dati esistenti!\n\n` +
                    `Backup del: ${new Date(backup.metadata.dataGenerazione).toLocaleString('it-IT')}\n` +
                    `Commesse: ${backup.dati.commesse.length}\n` +
                    `Dipendenti: ${backup.dati.dipendenti.length}\n` +
                    `Ore lavorate: ${backup.dati.oreLavorate.length}\n` +
                    `Fornitori: ${backup.dati.fornitori?.length || 0}\n\n` +
                    `Sei sicuro di voler procedere?`
                );
                
                if (!conferma) {
                    resolve(false);
                    return;
                }
                
                ErrorHandler.showNotification('Ripristino in corso...', 'info');
                
                // Pulisci collezioni esistenti
                const collezioni = ['commesse', 'dipendenti', 'oreLavorate', 'fornitoriLavorazioni'];
                
                for (const collezione of collezioni) {
                    const documenti = await this.firebaseService.getCollection(collezione);
                    for (const doc of documenti) {
                        await this.firebaseService.deleteDocument(collezione, doc.id);
                    }
                    console.log(`🗑️ Cancellata collezione: ${collezione}`);
                }
                
                // Ripristina nuovi dati
                for (const commessa of backup.dati.commesse) {
                    delete commessa.id;
                    await this.firebaseService.addDocument("commesse", commessa);
                }
                
                for (const dipendente of backup.dati.dipendenti) {
                    delete dipendente.id;
                    await this.firebaseService.addDocument("dipendenti", dipendente);
                }
                
                for (const ore of backup.dati.oreLavorate) {
                    delete ore.id;
                    await this.firebaseService.addDocument("oreLavorate", ore);
                }
                
                if (backup.dati.fornitori && backup.dati.fornitori.length > 0) {
                    for (const fornitore of backup.dati.fornitori) {
                        delete fornitore.id;
                        await this.firebaseService.addDocument("fornitoriLavorazioni", fornitore);
                    }
                }
                
                // Svuota cache
                stateManager.clearCache();
                
                // Ricarica tutte le viste
                await this.aggiornaTabellaCommesse();
                await this.aggiornaTabellaDipendenti();
                await this.aggiornaTabellaOreLavorate();
                await this.aggiornaMonitorCommesse();
                await this.creaGraficiDashboard();
                
                console.log('✅ Ripristino completato!');
                ErrorHandler.showNotification('Ripristino completato con successo!', 'success');
                
                resolve(true);
                
            } catch (error) {
                console.error('❌ Errore ripristino:', error);
                ErrorHandler.showNotification('Errore durante il ripristino: file non valido', 'error');
                reject(error);
            }
        };
        
        reader.onerror = () => {
            reject(new Error('Errore nella lettura del file'));
        };
        
        reader.readAsText(file);
    });
}

aggiornaInfoUltimoBackup() {
    const infoDiv = document.getElementById('infoUltimoBackup');
    if (!infoDiv) return;
    
    const ultimoBackup = localStorage.getItem('ultimoBackup');
    if (ultimoBackup) {
        const data = JSON.parse(ultimoBackup);
        const dataFormattata = new Date(data.data).toLocaleString('it-IT');
        infoDiv.innerHTML = `<i class="fas fa-history"></i> Ultimo backup: ${dataFormattata} - Utente: ${data.utente}`;
    } else {
        infoDiv.innerHTML = '<i class="fas fa-clock"></i> Nessun backup precedente trovato';
    }
}

mostraSelettoreBackup() {
    const input = document.getElementById('fileBackupInput');
    if (input) {
        input.click();
        input.onchange = async (e) => {
            if (e.target.files && e.target.files[0]) {
                await this.ripristinaDaBackup(e.target.files[0]);
                input.value = ''; // Reset
            }
        };
    }
}
// ========== DARK MODE ==========

inizializzaDarkMode() {
    // Controlla se c'è una preferenza salvata
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
        this.attivaDarkMode();
    } else {
        this.attivaLightMode();
    }
    
    // Aggiungi listener per il toggle button
    const toggleBtn = document.getElementById('darkModeToggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => this.toggleDarkMode());
    }
    
    // Ascolta i cambi di preferenza del sistema
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            if (e.matches) {
                this.attivaDarkMode();
            } else {
                this.attivaLightMode();
            }
        }
    });
}

toggleDarkMode() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        this.attivaLightMode();
    } else {
        this.attivaDarkMode();
    }
}

attivaDarkMode() {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('theme', 'dark');
    
    // Cambia icona del bottone
    const toggleBtn = document.getElementById('darkModeToggle');
    if (toggleBtn) {
        toggleBtn.innerHTML = '<i class="fas fa-sun"></i>';
        toggleBtn.title = 'Light mode';
    }
    
    // Aggiorna i grafici Chart.js per adattarli al tema scuro
    this.aggiornaGraficiPerDarkMode(true);
    
    console.log('🌙 Dark mode attivata');
}

attivaLightMode() {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('theme', 'light');
    
    // Cambia icona del bottone
    const toggleBtn = document.getElementById('darkModeToggle');
    if (toggleBtn) {
        toggleBtn.innerHTML = '<i class="fas fa-moon"></i>';
        toggleBtn.title = 'Dark mode';
    }
    
    // Aggiorna i grafici Chart.js per adattarli al tema chiaro
    this.aggiornaGraficiPerDarkMode(false);
    
    console.log('☀️ Light mode attivata');
}

aggiornaGraficiPerDarkMode(isDark) {
    // Aggiorna tutti i grafici per adattarli al tema
    const grafici = [
        'chartMarginiCommesse',
        'chartOreDipendenti', 
        'chartStatoCommesse',
        'chartAndamentoMensile'
    ];
    
    grafici.forEach(id => {
        const chart = window[`chart${id.charAt(0).toUpperCase() + id.slice(1)}`];
        if (chart) {
            // Cambia colore del testo degli assi
            const textColor = isDark ? '#e0e0e0' : '#212529';
            const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
            
            if (chart.options.scales) {
                if (chart.options.scales.x) {
                    chart.options.scales.x.ticks.color = textColor;
                    chart.options.scales.x.grid.color = gridColor;
                }
                if (chart.options.scales.y) {
                    chart.options.scales.y.ticks.color = textColor;
                    chart.options.scales.y.grid.color = gridColor;
                }
            }
            
            if (chart.options.plugins?.legend) {
                chart.options.plugins.legend.labels.color = textColor;
            }
            
            chart.update();
        }
    });
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
// AGGIUNGI QUESTA SEZIONE AL TUO FILE JAVASCRIPT PRINCIPALE

// Gestione eventi delegati per i pulsanti della tabella monitoraggio
document.addEventListener('click', function(e) {
    // Gestione cambio stato commessa
    if (e.target.classList.contains('btn-cambia-stato') || 
        e.target.closest('.btn-cambia-stato')) {
        const button = e.target.classList.contains('btn-cambia-stato') ? 
                      e.target : e.target.closest('.btn-cambia-stato');
        const commessaId = button.dataset.id;
        const statoAttuale = button.dataset.stato;
        
        if (window.app && typeof window.app.cambiaStatoCommessa === 'function') {
            window.app.cambiaStatoCommessa(commessaId, statoAttuale);
        } else {
            console.error('App non inizializzata correttamente');
            ErrorHandler.showNotification('Errore: applicazione non pronta', 'error');
        }
    }
    
    // Gestione correzione commessa
    if (e.target.classList.contains('btn-correggi-commessa') || 
        e.target.closest('.btn-correggi-commessa')) {
        const button = e.target.classList.contains('btn-correggi-commessa') ? 
                      e.target : e.target.closest('.btn-correggi-commessa');
        const commessaId = button.dataset.id;
        
        if (window.app && typeof window.app.correggiCommessa === 'function') {
            window.app.correggiCommessa(commessaId);
        }
    }
    
    // Gestione diagnostica
    if (e.target.id === 'btnDiagnosticaCommesse' || 
        e.target.closest('#btnDiagnosticaCommesse')) {
        if (window.app && typeof window.app.diagnosticaCommesse === 'function') {
            window.app.diagnosticaCommesse();
        }
    }
});

// Assicurati che l'app sia disponibile globalmente
window.app = new OreLavorateApp();
