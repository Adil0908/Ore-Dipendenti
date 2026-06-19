/**
 * UNION14 - SISTEMA DI GESTIONE ORE LAVORATIVE
 * Versione 2.0 - Firebase Compat (NON moduli)
 */

// ============================================================
// 1. CONFIGURAZIONI
// ============================================================

const CONFIG = {
    TARIFFA_ORARIA: 28.50,
    COSTO_ORARIO_NON_CONFORMITA: 28.50,
    RIGHE_PER_PAGINA: 10,
    ELEMENTI_GRAFICI_PER_PAGINA: 15,
    PAUSA_INIZIO: "12:00",
    PAUSA_FINE: "13:00",
    CACHE_TTL: 300000,
    MESI: ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
           "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"],
    MESI_ABBREVIATI: ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", 
                      "Lug", "Ago", "Set", "Ott", "Nov", "Dic"]
};

const ADMIN_CREDENTIALS = {
    email: 'eliraoui.a@union14.it',
    password: 'Eliraoui0101!'
};

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyAZS2BAvXgClkD6KF87M_OAIHL_vNwa2wQ",
    authDomain: "orecommeseu14.firebaseapp.com",
    projectId: "orecommeseu14",
    storageBucket: "orecommeseu14.firebasestorage.app",
    messagingSenderId: "693874640353",
    appId: "1:693874640353:web:f8626c1a7d568242abfea0",
    measurementId: "G-6XT4G34CQJ"
};

// ============================================================
// 2. UTILITY
// ============================================================

const Utils = {
    calcolaOreLavorate(oraInizio, oraFine) {
        if (!oraInizio || !oraFine) return 0;
        
        const normalizza = (ora) => {
            if (!ora || typeof ora !== 'string') return null;
            ora = ora.trim();
            if (ora === '') return null;
            if (ora === "24:00" || ora === "24:00:00") return "23:59";
            
            const pattern = /^([0-1][0-9]|2[0-3]):([0-5][0-9])$/;
            if (pattern.test(ora)) return ora;
            
            const corto = /^([0-9]):([0-5][0-9])$/;
            if (corto.test(ora)) return '0' + ora;
            
            const solo = /^([0-9]|1[0-9]|2[0-3])$/;
            if (solo.test(ora)) return `${ora.padStart(2, '0')}:00`;
            
            return null;
        };
        
        const inizio = normalizza(oraInizio);
        const fine = normalizza(oraFine);
        if (!inizio || !fine) return 0;
        
        const toMin = (t) => {
            const [o, m] = t.split(':').map(Number);
            return o * 60 + m;
        };
        
        let diff = toMin(fine) - toMin(inizio);
        if (diff < 0) diff += 24 * 60;
        return Math.round((diff / 60) * 100) / 100;
    },

    formattaOreDecimali(ore) {
        if (isNaN(ore) || ore < 0) return "0:00";
        const o = Math.floor(ore);
        const m = Math.round((ore - o) * 60);
        return `${o}:${String(m).padStart(2, '0')}`;
    },

    siSovrappongono(i1, f1, i2, f2) {
        const toMin = (t) => {
            const [o, m] = t.split(':').map(Number);
            return o * 60 + m;
        };
        return toMin(i1) < toMin(f2) && toMin(f1) > toMin(i2);
    },

    arrotondaAlQuartoDora(ora) {
        if (!ora || !/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/.test(ora)) return ora;
        const [ore, min] = ora.split(":").map(Number);
        const arrot = Math.round(min / 15) * 15;
        const oF = ore + Math.floor(arrot / 60);
        const mF = arrot % 60;
        return `${String(oF).padStart(2, "0")}:${String(mF).padStart(2, "0")}`;
    },

    formattaDataItaliana(dataString) {
        if (!dataString) return 'N/D';
        try {
            const data = new Date(dataString + 'T00:00:00');
            if (isNaN(data.getTime())) return 'N/D';
            const mesi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
            return `${data.getDate()} ${mesi[data.getMonth()]} ${data.getFullYear()}`;
        } catch { return 'N/D'; }
    },

    escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password + 'UNION14_SALT_2024');
        const hash = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
};

// ============================================================
// 3. STATE MANAGER - UNA SOLA DICHIARAZIONE
// ============================================================

class StateManager {
    constructor() {
        this.currentUser = null;
        this.cache = new Map();
        this.datiFiltrati = null;
        this.datiTotali = { commesse: [], dipendenti: [], oreLavorate: [], fornitori: [] };
        this.paginazione = { commesse: 1, dipendenti: 1, oreLavorate: 1, fornitori: 1 };
        this.filtri = { margini: { anno: '', mese: '' }, oreDipendenti: { anno: '', mese: '' } };
        this.pagineGrafici = { margini: 1, oreDipendenti: 1 };
        this.tuttiMargini = [];
        this.tutteOreDipendenti = [];
        this.aggiornamentoInCorso = false;
        this.salvataggioInCorso = false;
    }

    setCache(key, data, ttl = CONFIG.CACHE_TTL) {
        this.cache.set(key, { data, timestamp: Date.now(), ttl });
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

    clearCache() { this.cache.clear(); }
}

// SINGOLA istanza - NIENTE DOPPIONI!
const stateManager = new StateManager();

// ============================================================
// 4. NOTIFICATION SERVICE
// ============================================================

const NotificationService = {
    show(message, type = 'info', duration = 5000) {
        const existing = document.querySelectorAll('.notification-toast');
        existing.forEach(n => n.remove());

        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        const colors = { success: '#16a34a', error: '#dc2626', warning: '#eab308', info: '#0891b2' };

        const el = document.createElement('div');
        el.className = 'notification-toast';
        el.style.cssText = `
            position: fixed; top: 24px; right: 24px; z-index: 99999;
            background: #ffffff; border-left: 4px solid ${colors[type] || colors.info};
            border-radius: 10px; padding: 16px 20px; min-width: 320px; max-width: 480px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.15);
            display: flex; align-items: flex-start; gap: 12px;
            animation: slideInRight 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            color: #0f172a; border: 1px solid #e2e8f0;
        `;

        el.innerHTML = `
            <span style="font-size:1.5rem;flex-shrink:0;">${icons[type] || 'ℹ️'}</span>
            <div style="flex:1;">
                <div style="font-weight:600;font-size:0.9rem;margin-bottom:2px;">
                    ${type.charAt(0).toUpperCase() + type.slice(1)}
                </div>
                <div style="font-size:0.875rem;color:#475569;">${message}</div>
            </div>
            <button onclick="this.parentElement.remove()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:#94a3b8;padding:0 4px;">✕</button>
        `;

        document.body.appendChild(el);

        setTimeout(() => {
            if (el.parentElement) {
                el.style.opacity = '0';
                el.style.transform = 'translateX(100px)';
                setTimeout(() => el.remove(), 300);
            }
        }, duration);
    },
    success(msg) { this.show(msg, 'success', 4000); },
    error(msg) { this.show(msg, 'error', 6000); },
    warning(msg) { this.show(msg, 'warning', 5000); },
    info(msg) { this.show(msg, 'info', 4000); }
};

// ============================================================
// 5. PAGINATION MANAGER
// ============================================================

// ============================================================
// 5. PAGINATION MANAGER - VERSIONE CORRETTA
// ============================================================

class PaginationManager {
    constructor(containerId, righePerPagina = CONFIG.RIGHE_PER_PAGINA) {
        this.containerId = containerId;
        this.container = document.getElementById(containerId);
        this.righePerPagina = righePerPagina;
        this.paginaCorrente = 1;
        this.datiTotali = [];
        this.callbackAggiorna = null;
        this._isRendering = false;
        
        // Se il container non esiste, crealo
        if (!this.container) {
            console.warn(`⚠️ Container ${containerId} non trovato, creazione automatica...`);
            this.container = document.createElement('div');
            this.container.id = containerId;
            this.container.className = 'mt-3';
            
            // Trova la tabella corrispondente
            const tableMap = {
                'paginationOre': 'orelavorateTable',
                'paginationCommesse': 'commesseTable',
                'paginationDipendenti': 'dipendentiTable',
                'paginationFornitori': 'fornitoriTable'
            };
            
            const tableId = tableMap[containerId];
            if (tableId) {
                const table = document.getElementById(tableId);
                if (table && table.parentNode) {
                    table.parentNode.insertBefore(this.container, table.nextSibling);
                    console.log(`✅ Container ${containerId} creato automaticamente`);
                }
            }
        }
    }

    render(datiTotali, callbackAggiorna) {
        // Evita render multipli simultanei
        if (this._isRendering) {
            console.log('⏳ Render già in corso, salto...');
            return;
        }
        this._isRendering = true;

        try {
            if (!this.container) {
                console.error(`❌ Container ${this.containerId} non trovato`);
                return;
            }
            
            this.datiTotali = datiTotali || [];
            this.callbackAggiorna = callbackAggiorna;
            
            const numPagine = Math.max(1, Math.ceil(this.datiTotali.length / this.righePerPagina));
            
            // Se non ci sono dati, nascondi
            if (this.datiTotali.length === 0) {
                this.container.innerHTML = '';
                this.container.style.display = 'none';
                this._isRendering = false;
                return;
            }

            // Se una sola pagina, nascondi
            if (numPagine <= 1) {
                this.container.innerHTML = '';
                this.container.style.display = 'none';
                this._isRendering = false;
                return;
            }

            // Mostra il container
            this.container.style.display = 'block';

            // Assicura che la pagina corrente sia valida
            if (this.paginaCorrente < 1) this.paginaCorrente = 1;
            if (this.paginaCorrente > numPagine) this.paginaCorrente = numPagine;

            // Costruisci HTML
            let html = `
                <div class="pagination-controls d-flex justify-content-center align-items-center gap-2 flex-wrap">
                    <button class="btn btn-outline-secondary btn-sm btn-pagina-prec" 
                            data-container="${this.containerId}"
                            ${this.paginaCorrente === 1 ? 'disabled' : ''}>
                        <i class="fas fa-chevron-left"></i> Prec
                    </button>
                    <div class="pagination-numbers d-flex gap-1">
            `;

            // Mostra tutte le pagine (per semplicità e affidabilità)
            for (let i = 1; i <= numPagine; i++) {
                html += `<button class="btn btn-sm ${i === this.paginaCorrente ? 'btn-primary' : 'btn-outline-primary'} btn-pagina-numero" 
                                data-pagina="${i}"
                                data-container="${this.containerId}">${i}</button>`;
            }

            html += `
                    </div>
                    <button class="btn btn-outline-secondary btn-sm btn-pagina-succ" 
                            data-container="${this.containerId}"
                            ${this.paginaCorrente === numPagine ? 'disabled' : ''}>
                        Succ <i class="fas fa-chevron-right"></i>
                    </button>
                    <span class="pagination-info ms-2 text-muted small">
                        ${this.datiTotali.length} record - Pagina ${this.paginaCorrente} di ${numPagine}
                    </span>
                </div>
            `;

            this.container.innerHTML = html;

            // Riferimenti per gli eventi
            const self = this;
            const container = this.container;

            // === PULSANTE PRECEDENTE ===
            const btnPrec = container.querySelector('.btn-pagina-prec');
            if (btnPrec) {
                btnPrec.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (self.paginaCorrente > 1) {
                        self.paginaCorrente--;
                        console.log(`📄 ${self.containerId} - Pagina ${self.paginaCorrente}`);
                        if (typeof self.callbackAggiorna === 'function') {
                            self.callbackAggiorna();
                        }
                    }
                });
            }

            // === PULSANTE SUCCESSIVO ===
            const btnSucc = container.querySelector('.btn-pagina-succ');
            if (btnSucc) {
                btnSucc.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (self.paginaCorrente < numPagine) {
                        self.paginaCorrente++;
                        console.log(`📄 ${self.containerId} - Pagina ${self.paginaCorrente}`);
                        if (typeof self.callbackAggiorna === 'function') {
                            self.callbackAggiorna();
                        }
                    }
                });
            }

            // === PULSANTI NUMERI ===
            const numeri = container.querySelectorAll('.btn-pagina-numero');
            numeri.forEach(btn => {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    const pagina = parseInt(this.dataset.pagina);
                    if (pagina !== self.paginaCorrente) {
                        self.paginaCorrente = pagina;
                        console.log(`📄 ${self.containerId} - Pagina ${self.paginaCorrente}`);
                        if (typeof self.callbackAggiorna === 'function') {
                            self.callbackAggiorna();
                        }
                    }
                });
            });

            console.log(`✅ ${this.containerId} - Render completato: pagina ${this.paginaCorrente} di ${numPagine}`);

        } catch (error) {
            console.error(`❌ Errore render ${this.containerId}:`, error);
        } finally {
            this._isRendering = false;
        }
    }

    getDatiPagina() {
        if (!this.datiTotali || this.datiTotali.length === 0) return [];
        const inizio = (this.paginaCorrente - 1) * this.righePerPagina;
        const fine = Math.min(inizio + this.righePerPagina, this.datiTotali.length);
        return this.datiTotali.slice(inizio, fine);
    }

    aggiornaDati(nuoviDati) {
        this.datiTotali = nuoviDati || [];
        this.paginaCorrente = 1;
    }

    reset() {
        this.paginaCorrente = 1;
        this.datiTotali = [];
        if (this.container) {
            this.container.innerHTML = '';
            this.container.style.display = 'none';
        }
    }
}

// ============================================================
// 6. FIREBASE SERVICE (COMPAT)
// ============================================================

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

        try {
            const querySnapshot = await this.db.collection(collectionName).get();
            const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (useCache) stateManager.setCache(cacheKey, data);
            return data;
        } catch (error) {
            console.error(`Errore recupero ${collectionName}:`, error);
            return [];
        }
    }

    async addDocument(collectionName, data) {
        const result = await this.db.collection(collectionName).add(data);
        stateManager.clearCache();
        return result;
    }

    async updateDocument(collectionName, id, data) {
        await this.db.collection(collectionName).doc(id).update(data);
        stateManager.clearCache();
    }

    async deleteDocument(collectionName, id) {
        await this.db.collection(collectionName).doc(id).delete();
        stateManager.clearCache();
    }

    async getOreLavorateFiltrate(filtri = {}) {
        const tutte = await this.getCollection("oreLavorate", false);
        return tutte.filter(ore => {
            let ok = true;
            if (filtri.commessa) ok = ok && ore.commessa?.toLowerCase().includes(filtri.commessa.toLowerCase());
            if (filtri.dipendente) {
                const nome = `${ore.nomeDipendente || ''} ${ore.cognomeDipendente || ''}`.toLowerCase();
                ok = ok && nome.includes(filtri.dipendente.toLowerCase());
            }
            if (filtri.nonConformita) ok = ok && ore.nonConformita === true;
            if (filtri.anno || filtri.mese || filtri.giorno) {
                const [anno, mese, giorno] = (ore.data || '').split('-');
                if (filtri.anno) ok = ok && anno === filtri.anno;
                if (filtri.mese) ok = ok && mese === filtri.mese;
                if (filtri.giorno) ok = ok && giorno === filtri.giorno;
            }
            return ok;
        });
    }
}

// ============================================================
// 7. MAIN APP
// ============================================================

class OreLavorateApp {
    constructor() {
        this.firebaseService = null;
        this.paginazione = {};
        this.grafici = {};
        this.filtroTimeout = null;
        this.salvataggioInCorso = false;
        this.init();
    }

   // Nel metodo init() della classe OreLavorateApp
async init() {
    try {
         console.log('🚀 Avvio app...');

        const app = firebase.initializeApp(FIREBASE_CONFIG);
        const db = firebase.firestore(app);
        
        this.firebaseService = new FirebaseService(db);

        // 🔥 VERIFICA CHE I CONTAINER ESISTANO PRIMA DI INIZIALIZZARE
        this.paginazione = {
            ore: new PaginationManager('paginationOre', CONFIG.RIGHE_PER_PAGINA),
            dipendenti: new PaginationManager('paginationDipendenti', CONFIG.RIGHE_PER_PAGINA),
            commesse: new PaginationManager('paginationCommesse', CONFIG.RIGHE_PER_PAGINA),
            fornitori: new PaginationManager('paginationFornitori', CONFIG.RIGHE_PER_PAGINA)
        };

        // Verifica che i container esistano
        Object.entries(this.paginazione).forEach(([name, pag]) => {
            if (pag.container) {
                console.log(`✅ Paginazione ${name}: container trovato`);
            } else {
                console.warn(`⚠️ Paginazione ${name}: container NON trovato!`);
                // Crea container di fallback
                const fallbackContainer = document.createElement('div');
                fallbackContainer.id = `pagination${name.charAt(0).toUpperCase() + name.slice(1)}`;
                fallbackContainer.className = 'mt-3';
                
                // Trova la tabella corrispondente e inserisci dopo
                const tableMap = {
                    ore: 'orelavorateTable',
                    dipendenti: 'dipendentiTable',
                    commesse: 'commesseTable',
                    fornitori: 'fornitoriTable'
                };
                const table = document.getElementById(tableMap[name]);
                if (table && table.parentNode) {
                    table.parentNode.insertBefore(fallbackContainer, table.nextSibling);
                    pag.container = fallbackContainer;
                    console.log(`✅ Container ${name} creato automaticamente`);
                }
            }
        });

        this.setupEventListeners();
        this.setupVisualizzazioneFasce();
        this.inizializzaDarkMode();
        this.popolaSelectMesi();

        await this.verificaSessione();

        console.log('✅ App inizializzata con successo');

    } catch (error) {
        console.error('❌ Errore:', error);
        NotificationService.error('Errore durante l\'inizializzazione: ' + error.message);
    }
}
// Aggiungi alla classe OreLavorateApp, dopo il metodo init()

// SOSTITUISCI il metodo migraPasswordDipendenti con questo:

async migraPasswordDipendenti() {
    try {
        const dipendenti = await this.firebaseService.getCollection("dipendenti");
        let migrati = 0;
        
        for (const d of dipendenti) {
            // Se ha password in chiaro ma non l'hash
            if (d.password && !d.passwordHash) {
                const hash = await Utils.hashPassword(d.password);
                
                // CORREZIONE: usa FieldValue.delete() invece di undefined
                await this.firebaseService.db
                    .collection("dipendenti")
                    .doc(d.id)
                    .update({
                        passwordHash: hash,
                        password: firebase.firestore.FieldValue.delete()
                    });
                    
                migrati++;
                console.log(`✅ Migrato: ${d.email}`);
            }
        }
        
        if (migrati > 0) {
            NotificationService.success(`${migrati} password migrate con successo!`);
        } else {
            NotificationService.info('Nessuna password da migrare');
        }
        return migrati;
        
    } catch (error) {
        console.error('Errore migrazione password:', error);
        NotificationService.error('Errore durante la migrazione: ' + error.message);
        return 0;
    }
}
    // ============================================================
    // 7.1 SESSIONE
    // ============================================================

    async verificaSessione() {
        const saved = localStorage.getItem('union14_user');
        if (saved) {
            try {
                stateManager.currentUser = JSON.parse(saved);
                await this.mostraApplicazione();
                return;
            } catch { localStorage.removeItem('union14_user'); }
        }
        document.getElementById('loginPage').style.display = 'flex';
        document.getElementById('appContent').style.display = 'none';
    }

    async gestisciLogin() {
        try {
            const email = document.getElementById('inputEmail').value.trim();
            const password = document.getElementById('inputPassword').value.trim();

            if (!email || !password) {
                NotificationService.error('Inserisci email e password');
                return;
            }

            // Admin
            if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
                stateManager.currentUser = { 
                    ruolo: 'admin', 
                    name: 'Amministratore', 
                    email: ADMIN_CREDENTIALS.email 
                };
                localStorage.setItem('union14_user', JSON.stringify(stateManager.currentUser));
                await this.mostraApplicazione();
                return;
            }

            // Dipendenti
            const dipendenti = await this.firebaseService.getCollection("dipendenti");
            const hash = await Utils.hashPassword(password);
            
            const dip = dipendenti.find(d => d.email === email && d.passwordHash === hash);
            if (dip) {
                stateManager.currentUser = {
                    ruolo: dip.ruolo || 'dipendente',
                    name: `${dip.nome} ${dip.cognome}`,
                    email: dip.email,
                    id: dip.id
                };
                localStorage.setItem('union14_user', JSON.stringify(stateManager.currentUser));
                await this.mostraApplicazione();
            } else {
                // Backward compatibility
                const dipLegacy = dipendenti.find(d => d.email === email && d.password === password);
                if (dipLegacy) {
                    const newHash = await Utils.hashPassword(password);
                    await this.firebaseService.updateDocument("dipendenti", dipLegacy.id, {
                        passwordHash: newHash,
                        password: undefined
                    });
                    stateManager.currentUser = {
                        ruolo: dipLegacy.ruolo || 'dipendente',
                        name: `${dipLegacy.nome} ${dipLegacy.cognome}`,
                        email: dipLegacy.email,
                        id: dipLegacy.id
                    };
                    localStorage.setItem('union14_user', JSON.stringify(stateManager.currentUser));
                    await this.mostraApplicazione();
                } else {
                    NotificationService.error('Credenziali non valide');
                }
            }

            document.getElementById('inputEmail').value = '';
            document.getElementById('inputPassword').value = '';

        } catch (error) {
            console.error('Errore login:', error);
            NotificationService.error('Errore durante il login');
        }
    }

    logout() {
        stateManager.currentUser = null;
        stateManager.clearCache();
        localStorage.removeItem('union14_user');
        document.getElementById('loginPage').style.display = 'flex';
        document.getElementById('appContent').style.display = 'none';
        NotificationService.info('Logout effettuato');
    }

    // ============================================================
    // 7.2 MOSTRA APPLICAZIONE
    // ============================================================

async mostraApplicazione() {
    try {
        document.getElementById('loginPage').style.display = 'none';
        document.getElementById('appContent').style.display = 'block';

        const isAdmin = stateManager.currentUser?.ruolo === 'admin';
        
        // 🔥 IMPOSTA L'ATTRIBUTO SUL BODY PER IL CSS
        document.body.setAttribute('data-user-role', isAdmin ? 'admin' : 'dipendente');
        
        // 🔥 METODO CORRETTO PER MOSTRARE/NASCONDERE LE SEZIONI
        // 1. NASCONDI TUTTE LE SEZIONI
        document.querySelectorAll('.admin-only, .dipendente-only').forEach(el => {
            el.style.display = 'none';
            el.style.visibility = 'hidden';
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
            el.style.height = '0';
            el.style.overflow = 'hidden';
            el.style.padding = '0';
            el.style.margin = '0';
            el.removeAttribute('data-user-role');
        });
        
        // 2. MOSTRA SOLO LE SEZIONI GIUSTE
        if (isAdmin) {
            // Mostra solo sezioni admin
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = 'block';
                el.style.visibility = 'visible';
                el.style.opacity = '1';
                el.style.pointerEvents = 'auto';
                el.style.height = 'auto';
                el.style.overflow = 'visible';
                el.style.padding = '';
                el.style.margin = '';
                el.setAttribute('data-user-role', 'admin');
            });
            
            // 🔥 NASCONDI ESPLICITAMENTE LA SEZIONE DIPENDENTI
            const sezioneDipendenti = document.querySelector('.dipendente-only');
            if (sezioneDipendenti) {
                sezioneDipendenti.style.display = 'none';
                sezioneDipendenti.style.visibility = 'hidden';
                sezioneDipendenti.style.opacity = '0';
                sezioneDipendenti.style.pointerEvents = 'none';
                sezioneDipendenti.style.height = '0';
                sezioneDipendenti.style.overflow = 'hidden';
                sezioneDipendenti.style.padding = '0';
                sezioneDipendenti.style.margin = '0';
                sezioneDipendenti.setAttribute('data-user-role', 'admin');
            }
            
            // 🔥 NASCONDI ANCHE IL FORM ORE
            const oreForm = document.getElementById('oreForm');
            if (oreForm) {
                oreForm.style.display = 'none';
                oreForm.style.visibility = 'hidden';
                oreForm.style.opacity = '0';
                oreForm.style.pointerEvents = 'none';
                oreForm.style.height = '0';
                oreForm.style.overflow = 'hidden';
                oreForm.style.padding = '0';
                oreForm.style.margin = '0';
            }
            
            // Nascondi skeleton
            const skeleton = document.getElementById('oreFormSkeleton');
            if (skeleton) {
                skeleton.style.display = 'none';
            }
            
            // Nascondi fasce orarie
            const fasce = document.getElementById('visualizzazioneFasce');
            if (fasce) {
                fasce.style.display = 'none';
            }
            
        } else {
            // Dipendente - Mostra solo sezioni dipendenti
            document.querySelectorAll('.dipendente-only').forEach(el => {
                el.style.display = 'block';
                el.style.visibility = 'visible';
                el.style.opacity = '1';
                el.style.pointerEvents = 'auto';
                el.style.height = 'auto';
                el.style.overflow = 'visible';
                el.style.padding = '';
                el.style.margin = '';
                el.setAttribute('data-user-role', 'dipendente');
            });
            
            // 🔥 NASCONDI ESPLICITAMENTE LE SEZIONI ADMIN
            document.querySelectorAll('.admin-only').forEach(el => {
                el.style.display = 'none';
                el.style.visibility = 'hidden';
                el.style.opacity = '0';
                el.style.pointerEvents = 'none';
                el.style.height = '0';
                el.style.overflow = 'hidden';
                el.style.padding = '0';
                el.style.margin = '0';
                el.setAttribute('data-user-role', 'dipendente');
            });
            
            // Mostra il form ore per i dipendenti
            const oreForm = document.getElementById('oreForm');
            if (oreForm) {
                oreForm.style.display = 'flex';
                oreForm.style.flexWrap = 'wrap';
                oreForm.style.gap = '1rem';
                oreForm.style.visibility = 'visible';
                oreForm.style.opacity = '1';
                oreForm.style.pointerEvents = 'auto';
                oreForm.style.height = 'auto';
                oreForm.style.overflow = 'visible';
                oreForm.style.padding = '';
                oreForm.style.margin = '';
            }
            
            const skeleton = document.getElementById('oreFormSkeleton');
            if (skeleton) {
                skeleton.style.display = 'none';
            }
        }

        // Aggiorna UI header
        const roleBadge = document.getElementById('userRoleBadge');
        const userName = document.getElementById('userNameDisplay');
        
        if (roleBadge) {
            roleBadge.textContent = isAdmin ? 'Admin' : 'Dipendente';
            roleBadge.className = `badge ${isAdmin ? 'bg-danger' : 'bg-primary'}`;
        }
        if (userName) {
            userName.textContent = `👤 ${stateManager.currentUser?.name || 'Utente'}`;
        }

        // Per admin: carica dati admin
        if (isAdmin) {
            this.popolaAnniMonitor();
            this.popolaAnniFiltriGrafici();
            
            this.mostraMessaggioMonitoraggioVuoto();
            
            await Promise.all([
                this.aggiornaTabellaCommesse(),
                this.aggiornaTabellaDipendenti(),
                this.aggiornaTabellaOreLavorate(),
                this.caricaFornitori()
            ]);

            setTimeout(() => {
                if (typeof Chart !== 'undefined') {
                    this.creaGraficiDashboard();
                }
                this.aggiornaInfoUltimoBackup();
            }, 500);
            
            const oggi = new Date().toISOString().split('T')[0];
            this.filtraOrePerGiorno(oggi);
        }

        // Per tutti: aggiorna menu commesse
        await this.aggiornaMenuCommesse();
        
        // Imposta data corrente
        const oggi = new Date().toISOString().split('T')[0];
        const dataInput = document.getElementById('oreData');
        if (dataInput) {
            dataInput.value = oggi;
        }

        // Aggiorna fasce orarie (solo per dipendenti)
        if (!isAdmin) {
            await this.aggiornaVisualizzazioneFasce(oggi);
        }

        NotificationService.success(`Benvenuto, ${stateManager.currentUser?.name || 'Utente'}!`);
        
        console.log('✅ Applicazione mostrata, ruolo:', stateManager.currentUser?.ruolo);
        console.log('✅ Admin sections visibili:', document.querySelectorAll('.admin-only[style*="display: block"]').length);
        console.log('✅ Dipendente sections visibili:', document.querySelectorAll('.dipendente-only[style*="display: block"]').length);
        
    } catch (error) {
        console.error('Errore mostraApplicazione:', error);
        NotificationService.error('Errore durante il caricamento');
    }
}
// Metodo per diagnosticare le sezioni visibili
diagnosticaSezioni() {
    console.log('=== DIAGNOSTICA SEZIONI ===');
    console.log('Ruolo utente:', stateManager.currentUser?.ruolo);
    
    const adminSections = document.querySelectorAll('.admin-only');
    const dipendenteSections = document.querySelectorAll('.dipendente-only');
    
    console.log('Sezioni admin:', adminSections.length);
    adminSections.forEach((el, i) => {
        console.log(`  Admin #${i}: display=${el.style.display}, visible=${el.offsetParent !== null}`);
    });
    
    console.log('Sezioni dipendenti:', dipendenteSections.length);
    dipendenteSections.forEach((el, i) => {
        console.log(`  Dipendente #${i}: display=${el.style.display}, visible=${el.offsetParent !== null}`);
    });
    
    // Verifica se ci sono elementi visibili del tipo sbagliato
    const adminVisibili = document.querySelectorAll('.admin-only[style*="display: block"]');
    const dipVisibili = document.querySelectorAll('.dipendente-only[style*="display: block"]');
    
    if (stateManager.currentUser?.ruolo === 'admin' && dipVisibili.length > 0) {
        console.warn('⚠️ ATTENZIONE: Sezioni dipendenti visibili per admin!');
    }
    if (stateManager.currentUser?.ruolo === 'dipendente' && adminVisibili.length > 0) {
        console.warn('⚠️ ATTENZIONE: Sezioni admin visibili per dipendente!');
    }
}
// Mostra messaggio monitoraggio vuoto
mostraMessaggioMonitoraggioVuoto() {
    const tbody = document.querySelector('#monitorCommesseTable tbody');
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr>
            <td colspan="11" class="text-center py-5">
                <div class="py-4">
                    <i class="fas fa-search fa-3x mb-3 text-muted"></i>
                    <h5>Nessuna commessa caricata</h5>
                    <p class="text-muted">Utilizza i filtri sopra per caricare i dati</p>
                    <button class="btn btn-primary btn-sm" onclick="app.aggiornaMonitorCommesse()">
                        <i class="fas fa-sync-alt"></i> Carica Monitoraggio
                    </button>
                </div>
            </td>
        </tr>
    `;
}
popolaGiorni() {
    const mese = document.getElementById('filtroMese')?.value;
    const anno = document.getElementById('filtroAnno')?.value;
    const giornoSelect = document.getElementById('filtroGiorno');
    
    if (!giornoSelect) return;
    
    // Salva il valore corrente
    const valoreCorrente = giornoSelect.value;
    giornoSelect.innerHTML = '<option value="">Tutti i giorni</option>';
    
    if (mese && anno) {
        // Calcola giorni del mese
        const giorniNelMese = new Date(parseInt(anno), parseInt(mese), 0).getDate();
        
        for (let i = 1; i <= giorniNelMese; i++) {
            const option = document.createElement('option');
            option.value = String(i).padStart(2, '0');
            option.textContent = i;
            giornoSelect.appendChild(option);
        }
        
        // Ripristina il valore selezionato se esiste
        if (valoreCorrente && giornoSelect.querySelector(`option[value="${valoreCorrente}"]`)) {
            giornoSelect.value = valoreCorrente;
        }
    }
}
// Metodo di emergenza per mostrare il form ore
mostraFormOre() {
    try {
        // Mostra il container
        const container = document.querySelector('.dipendente-only');
        if (container) {
            container.style.display = 'block';
            container.style.visibility = 'visible';
            container.style.opacity = '1';
        }
        
        // Mostra il form
        const form = document.getElementById('oreForm');
        if (form) {
            form.style.display = 'flex';
            form.style.flexWrap = 'wrap';
            form.style.gap = '1rem';
            form.style.visibility = 'visible';
            form.style.opacity = '1';
        }
        
        // Nascondi skeleton
        const skeleton = document.getElementById('oreFormSkeleton');
        if (skeleton) {
            skeleton.style.display = 'none';
        }
        
        // Aggiorna le commesse
        this.aggiornaMenuCommesse();
        
        console.log('✅ Form ore mostrato con successo');
        return true;
    } catch (error) {
        console.error('Errore mostraFormOre:', error);
        return false;
    }
}
async verificaSessione() {
    const saved = localStorage.getItem('union14_user');
    if (saved) {
        try {
            stateManager.currentUser = JSON.parse(saved);
            await this.mostraApplicazione();
            
            // 🔥 AGGIUNGI QUESTA RIGA PER FORZARE IL FORM
            setTimeout(() => this.mostraFormOre(), 100);
            
            return;
        } catch { 
            localStorage.removeItem('union14_user'); 
        }
    }
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('appContent').style.display = 'none';
}
    // ============================================================
    // 7.3 EVENT LISTENERS
    // ============================================================

setupEventListeners() {
    // Login
    document.getElementById('btnLogin')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.gestisciLogin();
    });
    
    document.getElementById('inputPassword')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.gestisciLogin();
        }
    });

    // Logout
    document.getElementById('logoutButton')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.logout();
    });

    // 🔥 FORMS
    const commessaForm = document.getElementById('commessaForm');
    if (commessaForm) {
        commessaForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCommessaForm(e);
        });
    }

    const dipendentiForm = document.getElementById('dipendentiForm');
    if (dipendentiForm) {
        dipendentiForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleDipendentiForm(e);
        });
    }

    const fornitoreForm = document.getElementById('fornitoreForm');
    if (fornitoreForm) {
        fornitoreForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.aggiungiLavorazioneFornitore(e);
        });
    }

    const oreForm = document.getElementById('oreForm');
    if (oreForm) {
        oreForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleOreForm(e);
        });
    }

    // 🔥 FILTRI ORE
    const filtraOreForm = document.getElementById('filtraOreLavorate');
    if (filtraOreForm) {
        filtraOreForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.applicaFiltriOre(e);  // ✅ PASSIAMO L'EVENTO
        });
    }

    // 🔥 LISTENER PER IL CHECKBOX NON CONFORMITÀ - AGGIUNGI QUESTO!
    const checkboxNC = document.getElementById('filtroNonConformita');
    if (checkboxNC) {
        checkboxNC.addEventListener('change', (e) => {
            console.log('🔄 Checkbox NC cambiato:', e.target.checked);
            // Applica i filtri automaticamente quando il checkbox cambia
            this.applicaFiltriOre(e);
        });
    }

    // 🔥 BOTTONI FILTRI
    document.getElementById('btnResetFiltri')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.resetFiltriOre();
    });

    // ... resto del codice ...
}

    // ============================================================
    // 7.4 DARK MODE
    // ============================================================

    inizializzaDarkMode() {
        const saved = localStorage.getItem('theme');
        const system = window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (saved === 'dark' || (!saved && system)) this.attivaDarkMode();
        else this.attivaLightMode();

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                e.matches ? this.attivaDarkMode() : this.attivaLightMode();
            }
        });
    }

    toggleDarkMode() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        isDark ? this.attivaLightMode() : this.attivaDarkMode();
    }

    attivaDarkMode() {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        const toggle = document.getElementById('darkModeToggle');
        if (toggle) { toggle.innerHTML = '<i class="fas fa-sun"></i>'; }
    }

    attivaLightMode() {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
        const toggle = document.getElementById('darkModeToggle');
        if (toggle) { toggle.innerHTML = '<i class="fas fa-moon"></i>'; }
    }

    // ============================================================
    // 7.5 HELPER
    // ============================================================

   popolaSelectMesi() {
    const selects = document.querySelectorAll('select[id*="filtroMese"]');
    selects.forEach(select => {
        if (select.children.length <= 1) {
            select.innerHTML = '<option value="">Tutti i mesi</option>';
            CONFIG.MESI.forEach((mese, index) => {
                const option = document.createElement('option');
                option.value = String(index + 1).padStart(2, '0');
                option.textContent = mese;
                select.appendChild(option);
            });
        }
    });
    
    // 🔥 Popola anche i giorni se il mese è selezionato
    this.popolaGiorni();
}

    popolaAnniMonitor() {
        const select = document.getElementById('filtroAnnoMonitor');
        if (!select) return;
        const anno = new Date().getFullYear();
        select.innerHTML = '<option value="">Tutti gli anni</option>';
        for (let i = anno - 5; i <= anno + 1; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = i;
            if (i === anno) opt.selected = true;
            select.appendChild(opt);
        }
    }
// Filtra ore per un giorno specifico
async filtraOrePerGiorno(data) {
    try {
        if (!data) {
            data = new Date().toISOString().split('T')[0];
        }
        
        // Imposta i filtri
        document.getElementById('filtroAnno').value = data.split('-')[0];
        document.getElementById('filtroMese').value = data.split('-')[1];
        
        // Popola i giorni
        this.popolaGiorni();
        
        // Imposta il giorno
        document.getElementById('filtroGiorno').value = data.split('-')[2];
        
        // Applica i filtri
        await this.applicaFiltriOre();
        
        console.log(`✅ Ore filtrate per il giorno: ${data}`);
    } catch (error) {
        console.error('Errore filtro per giorno:', error);
    }
}
    popolaAnniFiltriGrafici() {
        const ids = ['filtroAnnoMargini', 'filtroAnnoOreDipendenti', 'filtroAnno'];
        const anno = new Date().getFullYear();
        ids.forEach(id => {
            const select = document.getElementById(id);
            if (!select) return;
            select.innerHTML = '<option value="">Tutti gli anni</option>';
            for (let i = anno - 5; i <= anno + 1; i++) {
                const opt = document.createElement('option');
                opt.value = i;
                opt.textContent = i;
                if (i === anno) opt.selected = true;
                select.appendChild(opt);
            }
        });
    }

    // ============================================================
    // 7.6 GESTIONE ORE (FORM)
    // ============================================================

    async handleOreForm(e) {
        
        if (this.salvataggioInCorso) return;
        this.salvataggioInCorso = true;

        try {
            if (!stateManager.currentUser || stateManager.currentUser.ruolo !== 'dipendente') {
                NotificationService.error('Accesso non autorizzato');
                return;
            }

            const formData = this.getOreFormData();
            if (!this.validateOreForm(formData)) return;

            const controllo = await this.controllaOrariGiornata(
                formData.data, 
                formData.oraInizio, 
                formData.oraFine
            );
            
            if (!controllo.valido) {
                NotificationService.error(controllo.errore);
                return;
            }

            await this.firebaseService.addDocument("oreLavorate", formData);
            NotificationService.success('Ore lavorate aggiunte con successo!');
            
            await this.aggiornaTabellaOreLavorate();
            e.target.reset();
            
            const oggi = new Date().toISOString().split('T')[0];
            document.getElementById('oreData').value = oggi;
            await this.aggiornaVisualizzazioneFasce(oggi);

        } catch (error) {
            console.error('Errore salvataggio ore:', error);
            NotificationService.error('Errore durante il salvataggio');
        } finally {
            this.salvataggioInCorso = false;
        }
    }
async applicaFiltriOre(e) {
    // e.preventDefault() è già chiamato nel listener
    try {
        // 🔥 LEGGI IL CHECKBOX CORRETTAMENTE
        const checkboxNC = document.getElementById('filtroNonConformita');
        const nonConformita = checkboxNC ? checkboxNC.checked : false;
        
        const filtri = {
            commessa: document.getElementById('filtroCommessa')?.value.trim() || '',
            dipendente: document.getElementById('filtroDipendente')?.value.trim() || '',
            anno: document.getElementById('filtroAnno')?.value || '',
            mese: document.getElementById('filtroMese')?.value || '',
            giorno: document.getElementById('filtroGiorno')?.value || '',
            nonConformita: nonConformita  // 🔥 VALORE CORRETTO
        };
        
        console.log('🔍 Filtri applicati:', filtri);
        console.log('🔍 Non conformità:', nonConformita);
        
        // Se non ci sono filtri attivi, usa la data corrente
        if (!filtri.anno && !filtri.mese && !filtri.giorno) {
            const oggi = new Date().toISOString().split('T')[0];
            filtri.anno = oggi.split('-')[0];
            filtri.mese = oggi.split('-')[1];
            filtri.giorno = oggi.split('-')[2];
            
            document.getElementById('filtroAnno').value = filtri.anno;
            document.getElementById('filtroMese').value = filtri.mese;
            this.popolaGiorni();
            document.getElementById('filtroGiorno').value = filtri.giorno;
        }
        
        const dati = await this.firebaseService.getOreLavorateFiltrate(filtri);
        stateManager.datiFiltrati = dati;
        await this.aggiornaTabellaOreLavorate(dati);
        
        const msgNC = nonConformita ? ' (solo non conformità)' : '';
        NotificationService.success(`${dati.length} record trovati${msgNC}`);
        
    } catch (error) {
        console.error('❌ Errore filtri:', error);
        NotificationService.error('Errore nell\'applicazione dei filtri: ' + error.message);
    }
}

    getOreFormData() {
        const nomeCompleto = stateManager.currentUser.name.split(' ');
        return {
            commessa: document.getElementById('oreCommessa').value,
            nomeDipendente: nomeCompleto[0],
            cognomeDipendente: nomeCompleto.slice(1).join(' '),
            data: document.getElementById('oreData').value,
            oraInizio: Utils.arrotondaAlQuartoDora(document.getElementById('oreInizio').value),
            oraFine: Utils.arrotondaAlQuartoDora(document.getElementById('oreFine').value),
            descrizione: document.getElementById('oreDescrizione').value,
            nonConformita: document.getElementById('nonConformita').checked,
            emailDipendente: stateManager.currentUser.email
        };
    }

    validateOreForm(data) {
        if (!data.commessa) { NotificationService.error('Seleziona una commessa'); return false; }
        if (!data.data) { NotificationService.error('Seleziona una data'); return false; }
        if (!data.oraInizio || !data.oraFine) { NotificationService.error('Inserisci orario di inizio e fine'); return false; }
        if (data.oraFine <= data.oraInizio) { NotificationService.error('L\'ora di fine deve essere successiva all\'inizio'); return false; }
        return true;
    }

    async controllaOrariGiornata(data, nuovaOraInizio, nuovaOraFine, idEscluso = null) {
        try {
            if (nuovaOraInizio < CONFIG.PAUSA_FINE && nuovaOraFine > CONFIG.PAUSA_INIZIO) {
                return {
                    valido: false,
                    errore: `Impossibile registrare durante la pausa pranzo (${CONFIG.PAUSA_INIZIO} - ${CONFIG.PAUSA_FINE})`
                };
            }

            const oreEsistenti = await this.firebaseService.getCollection("oreLavorate");
            const nome = stateManager.currentUser.name.split(' ')[0];
            const cognome = stateManager.currentUser.name.split(' ').slice(1).join(' ');
            
            const oreFiltrate = oreEsistenti.filter(ore => 
                ore.data === data &&
                ore.nomeDipendente === nome &&
                ore.cognomeDipendente === cognome &&
                ore.id !== idEscluso
            );

            for (const ore of oreFiltrate) {
                if (Utils.siSovrappongono(nuovaOraInizio, nuovaOraFine, ore.oraInizio, ore.oraFine)) {
                    return {
                        valido: false,
                        errore: `Sovrapposizione con fascia esistente: ${ore.oraInizio} - ${ore.oraFine}`
                    };
                }
            }

            return { valido: true };
        } catch (error) {
            console.error('Errore controllo orari:', error);
            return { valido: false, errore: 'Errore nel controllo degli orari' };
        }
    }

    controllaPausaPranzo() {
        const inizio = document.getElementById('oreInizio')?.value;
        const fine = document.getElementById('oreFine')?.value;
        if (!inizio || !fine) return;
        
        if (inizio < CONFIG.PAUSA_FINE && fine > CONFIG.PAUSA_INIZIO) {
            NotificationService.warning(
                `Orario sovrappone la pausa pranzo (${CONFIG.PAUSA_INIZIO} - ${CONFIG.PAUSA_FINE})`
            );
        }
    }

    // ============================================================
    // 7.7 FASCE ORARIE
    // ============================================================

    setupVisualizzazioneFasce() {
        const dataInput = document.getElementById('oreData');
        if (dataInput) {
            dataInput.addEventListener('change', async () => {
                await this.aggiornaVisualizzazioneFasce(dataInput.value);
            });
        }
    }

    async aggiornaVisualizzazioneFasce(data) {
        const container = document.getElementById('visualizzazioneFasce');
        const fasceElement = document.getElementById('fasceOccupate');
        
        if (!container || !fasceElement || !data) {
            if (container) container.style.display = 'none';
            return;
        }
        
        try {
            const oreGiornata = await this.getFasceOccupateGiornata(data);
            container.style.display = 'block';
            fasceElement.innerHTML = '';
            
            const dataFormattata = Utils.formattaDataItaliana(data);
            
            if (oreGiornata.length === 0) {
                fasceElement.innerHTML = `
                    <div class="fascia-oraria fascia-libera">
                        ✅ <strong>${dataFormattata} - Giornata libera</strong>
                    </div>
                `;
                return;
            }
            
            const header = document.createElement('div');
            header.className = 'fasce-header mb-2';
            header.innerHTML = `
                <strong>${dataFormattata} - Fasce Orarie Occupate:</strong>
                <span class="badge bg-secondary">${oreGiornata.length} fascia(e)</span>
            `;
            fasceElement.appendChild(header);
            
            oreGiornata.forEach((ore, index) => {
                const oreLavorate = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
                const div = document.createElement('div');
                div.className = 'fascia-oraria fascia-occupata';
                div.innerHTML = `
                    <div class="fascia-header">
                        <span class="fascia-numero">${index + 1}</span>
                        ⏰ <strong>${ore.oraInizio} - ${ore.oraFine}</strong>
                        <span class="fascia-ore">(${Utils.formattaOreDecimali(oreLavorate)} ore)</span>
                    </div>
                    <div class="fascia-dettagli">
                        <strong>Commessa:</strong> ${Utils.escapeHtml(ore.commessa)}<br>
                        <strong>Descrizione:</strong> ${Utils.escapeHtml(ore.descrizione)}
                        ${ore.nonConformita ? '<br><span class="badge bg-warning text-dark">⚠️ Non Conformità</span>' : ''}
                    </div>
                `;
                fasceElement.appendChild(div);
            });
            
            const totale = oreGiornata.reduce((sum, ore) => 
                sum + Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine), 0
            );
            
            const footer = document.createElement('div');
            footer.className = 'fasce-footer mt-2';
            footer.innerHTML = `<strong>Totale giornata:</strong> ${Utils.formattaOreDecimali(totale)} ore`;
            fasceElement.appendChild(footer);
            
            this.creaTimelineGiornata(oreGiornata);
            
        } catch (error) {
            console.error('Errore aggiornamento fasce:', error);
            fasceElement.innerHTML = `<div class="alert alert-danger">❌ Errore nel caricamento delle fasce orarie</div>`;
        }
    }

    async getFasceOccupateGiornata(data) {
        try {
            const tutteLeOre = await this.firebaseService.getCollection("oreLavorate");
            const nome = stateManager.currentUser.name.split(' ')[0];
            return tutteLeOre.filter(ore => 
                ore.data === data && 
                ore.nomeDipendente === nome
            ).sort((a, b) => a.oraInizio.localeCompare(b.oraInizio));
        } catch {
            return [];
        }
    }

    creaTimelineGiornata(oreOccupate) {
        const container = document.getElementById('fasceOccupate');
        if (!container || oreOccupate.length === 0) return;
        
        const timelineContainer = document.createElement('div');
        timelineContainer.className = 'timeline-container mt-3';
        timelineContainer.innerHTML = '<div class="timeline-title">Timeline Giornata:</div>';
        
        const timeline = document.createElement('div');
        timeline.className = 'timeline-giornata';
        
        const pausa = document.createElement('div');
        pausa.className = 'pausa-timeline';
        pausa.title = 'Pausa Pranzo 12:00-13:00';
        timeline.appendChild(pausa);
        
        oreOccupate.forEach(ore => {
            const fascia = document.createElement('div');
            fascia.className = 'fascia-occupata-timeline';
            fascia.style.left = this.calcolaPosizioneTimeline(ore.oraInizio) + '%';
            fascia.style.width = this.calcolaLarghezzaTimeline(ore.oraInizio, ore.oraFine) + '%';
            fascia.title = `${ore.oraInizio}-${ore.oraFine}: ${ore.commessa}`;
            timeline.appendChild(fascia);
        });
        
        timelineContainer.appendChild(timeline);
        container.appendChild(timelineContainer);
    }

    calcolaPosizioneTimeline(ora) {
        const [ore, minuti] = ora.split(':').map(Number);
        const minutiTotali = ore * 60 + minuti;
        return ((minutiTotali - 360) / 840) * 100;
    }

    calcolaLarghezzaTimeline(oraInizio, oraFine) {
        const posInizio = this.calcolaPosizioneTimeline(oraInizio);
        const posFine = this.calcolaPosizioneTimeline(oraFine);
        return Math.max(posFine - posInizio, 2);
    }

    // ============================================================
    // 7.8 MENU COMMESSE
    // ============================================================

    async aggiornaMenuCommesse() {
        const select = document.getElementById('oreCommessa');
        if (!select) return;
        
        select.innerHTML = '<option value="">Seleziona una commessa</option>';

        try {
            const commesse = await this.firebaseService.getCollection("commesse");
            const attive = commesse
                .filter(c => c.stato === 'attiva' || !c.stato)
                .sort((a, b) => (a.nomeCommessa || '').localeCompare(b.nomeCommessa || '', 'it'));
            
            if (attive.length === 0) {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'Nessuna commessa attiva disponibile';
                select.appendChild(option);
                return;
            }

            attive.forEach(commessa => {
                const option = document.createElement('option');
                option.value = commessa.nomeCommessa;
                option.textContent = `${commessa.nomeCommessa} - ${commessa.cliente || 'N/D'}`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Errore caricamento commesse:', error);
        }
    }

    // ============================================================
    // 7.9 TABELLA ORE LAVORATE
    // ============================================================

async aggiornaTabellaOreLavorate(oreFiltrate = null) {
    const tbody = document.querySelector('#orelavorateTable tbody');
    if (!tbody) {
        console.error('❌ Tbody ore lavorate non trovato');
        return;
    }

    try {
        let dati;
        
        // 1. SE SONO PASSATI DATI FILTRATI, USALI
        if (oreFiltrate !== null) {
            dati = oreFiltrate;
            stateManager.datiFiltrati = dati;
            console.log(`📦 Uso dati filtrati: ${dati.length} record`);
        } else {
            // 2. ALTRIMENTI USA I FILTRI ATTIVI
            const filtri = this.getFiltriOreAttivi();
            
            // Verifica se ci sono filtri attivi
            const hasFiltri = filtri.commessa || filtri.dipendente || 
                             filtri.anno || filtri.mese || filtri.giorno || 
                             filtri.nonConformita;
            
            if (!hasFiltri) {
                // Se non ci sono filtri, usa la data corrente
                const oggi = new Date().toISOString().split('T')[0];
                filtri.anno = oggi.split('-')[0];
                filtri.mese = oggi.split('-')[1];
                filtri.giorno = oggi.split('-')[2];
                
                // Aggiorna i select
                document.getElementById('filtroAnno').value = filtri.anno;
                document.getElementById('filtroMese').value = filtri.mese;
                this.popolaGiorni();
                document.getElementById('filtroGiorno').value = filtri.giorno;
            }
            
            dati = await this.firebaseService.getOreLavorateFiltrate(filtri);
            stateManager.datiFiltrati = dati;
            console.log(`🔄 Caricati ${dati.length} record con filtri`);
        }

        // 3. SALVA NELLO STATE
        stateManager.datiTotali.oreLavorate = dati;
        
        // 4. AGGIORNA I DATI DELLA PAGINAZIONE
        this.paginazione.ore.datiTotali = dati;

        // 5. OTTIENI I DATI DELLA PAGINA CORRENTE
        const datiPagina = this.paginazione.ore.getDatiPagina();
        
        console.log(`📊 Ore - Pagina ${this.paginazione.ore.paginaCorrente}: ${datiPagina.length} record su ${dati.length}`);

        // 6. PULISCI LA TABELLA
        tbody.innerHTML = '';

        // 7. MOSTRA MESSAGGIO SE VUOTO
        if (datiPagina.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center py-4 text-muted">
                        <i class="fas fa-clock fa-3x mb-3 d-block"></i>
                        <h5>Nessuna ore lavorata trovata</h5>
                        <p class="small">Registra le tue ore usando il form sopra</p>
                    </td>
                </tr>
            `;
        } else {
            // 8. POPOLA LA TABELLA
            datiPagina.forEach(ore => {
                const oreLavorate = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
                const row = document.createElement('tr');
                
                // Evidenzia le non conformità
                if (ore.nonConformita) {
                    row.style.backgroundColor = 'rgba(255, 193, 7, 0.1)';
                }
                
                row.innerHTML = `
                    <td><strong>${Utils.escapeHtml(ore.commessa)}</strong></td>
                    <td>${Utils.escapeHtml(ore.nomeDipendente)} ${Utils.escapeHtml(ore.cognomeDipendente)}</td>
                    <td>${ore.data || '-'}</td>
                    <td>${ore.oraInizio || '-'}</td>
                    <td>${ore.oraFine || '-'}</td>
                    <td>${Utils.escapeHtml(ore.descrizione || '-')}</td>
                    <td class="text-center">
                        ${ore.nonConformita ? '<span class="badge bg-warning text-dark">⚠️ Sì</span>' : '<span class="badge bg-secondary">No</span>'}
                    </td>
                    <td class="text-center"><strong>${Utils.formattaOreDecimali(oreLavorate)}</strong></td>
                    <td class="text-center">
                        <div class="btn-group btn-group-sm" role="group">
                            <button class="btn btn-warning btn-modifica-ore" 
                                    data-id="${ore.id}" 
                                    title="Modifica ore">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-danger btn-elimina-ore" 
                                    data-id="${ore.id}" 
                                    title="Elimina ore">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);

                // EVENT LISTENERS
                row.querySelector('.btn-modifica-ore')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.modificaOreLavorate(ore.id);
                });
                
                row.querySelector('.btn-elimina-ore')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.eliminaOreLavorate(ore.id);
                });
            });

            // 9. AGGIUNGI RIGA TOTALE
            const totale = this.calcolaTotaleGenerale(dati);
            const tr = document.createElement('tr');
            tr.className = 'table-info fw-bold';
            tr.innerHTML = `
                <td colspan="7" class="text-end">TOTALE GENERALE</td>
                <td class="text-center">${Utils.formattaOreDecimali(totale)} ore</td>
                <td></td>
            `;
            tbody.appendChild(tr);
        }

        // 10. RENDERIZZA LA PAGINAZIONE
        this.paginazione.ore.render(dati, () => {
            console.log(`🔄 Callback paginazione ore - ricarico`);
            this.aggiornaTabellaOreLavorate(stateManager.datiFiltrati);
        });

        console.log(`✅ Tabella ore aggiornata: ${dati.length} record, pagina ${this.paginazione.ore.paginaCorrente}`);

    } catch (error) {
        console.error('❌ Errore tabella ore:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="text-center text-danger py-4">
                    <i class="fas fa-exclamation-triangle fa-2x mb-2 d-block"></i>
                    Errore nel caricamento: ${error.message}
                    <br>
                    <button class="btn btn-sm btn-primary mt-2" onclick="app.aggiornaTabellaOreLavorate()">
                        <i class="fas fa-sync-alt"></i> Riprova
                    </button>
                </td>
            </tr>
        `;
    }
}

   getFiltriOreAttivi() {
    // 🔥 LEGGI IL CHECKBOX CORRETTAMENTE
    const checkboxNC = document.getElementById('filtroNonConformita');
    const nonConformita = checkboxNC ? checkboxNC.checked : false;
    
    return {
        commessa: document.getElementById('filtroCommessa')?.value.trim() || '',
        dipendente: document.getElementById('filtroDipendente')?.value.trim() || '',
        anno: document.getElementById('filtroAnno')?.value || '',
        mese: document.getElementById('filtroMese')?.value || '',
        giorno: document.getElementById('filtroGiorno')?.value || '',
        nonConformita: nonConformita
    };
}



    async resetFiltriOre(e) {
    if (e) e.preventDefault();
    
    document.getElementById('filtroCommessa').value = '';
    document.getElementById('filtroDipendente').value = '';
    document.getElementById('filtroAnno').value = new Date().getFullYear().toString();
    document.getElementById('filtroMese').value = '';
    document.getElementById('filtroGiorno').value = '';
    
    // 🔥 RESETTA IL CHECKBOX
    const checkboxNC = document.getElementById('filtroNonConformita');
    if (checkboxNC) {
        checkboxNC.checked = false;
    }

    stateManager.datiFiltrati = null;
    const dati = await this.firebaseService.getCollection("oreLavorate");
    await this.aggiornaTabellaOreLavorate(dati);
    NotificationService.info('Filtri resettati');
}

    async mostraTuttiOre() {
        stateManager.datiFiltrati = null;
        const dati = await this.firebaseService.getCollection("oreLavorate");
        await this.aggiornaTabellaOreLavorate(dati);
        NotificationService.info('Mostrati tutti i record');
    }

    async modificaOreLavorate(id) {
        try {
            const docRef = this.firebaseService.db.collection("oreLavorate").doc(id);
            const docSnap = await docRef.get();
            if (!docSnap.exists) {
                NotificationService.error('Record non trovato');
                return;
            }

            const ore = docSnap.data();
            
            const nuovaCommessa = prompt("Commessa:", ore.commessa);
            if (!nuovaCommessa) return;
            
            const nuovaData = prompt("Data (YYYY-MM-DD):", ore.data);
            if (!nuovaData) return;
            
            const nuovaOraInizio = prompt("Ora inizio (HH:MM):", ore.oraInizio);
            if (!nuovaOraInizio) return;
            
            const nuovaOraFine = prompt("Ora fine (HH:MM):", ore.oraFine);
            if (!nuovaOraFine) return;
            
            const nuovaDescrizione = prompt("Descrizione:", ore.descrizione);
            if (!nuovaDescrizione) return;
            
            const nuovaNonConformita = confirm("Non conformità? (OK=Sì, Annulla=No)");

            const controllo = await this.controllaOrariGiornata(nuovaData, nuovaOraInizio, nuovaOraFine, id);
            if (!controllo.valido) {
                NotificationService.error(controllo.errore);
                return;
            }

            await this.firebaseService.updateDocument("oreLavorate", id, {
                commessa: nuovaCommessa,
                data: nuovaData,
                oraInizio: nuovaOraInizio,
                oraFine: nuovaOraFine,
                descrizione: nuovaDescrizione,
                nonConformita: nuovaNonConformita
            });

            NotificationService.success('Ore modificate con successo!');
            await this.aggiornaTabellaOreLavorate();

        } catch (error) {
            console.error('Errore modifica:', error);
            NotificationService.error('Errore durante la modifica');
        }
    }

    async eliminaOreLavorate(id) {
        if (!confirm('Sei sicuro di voler eliminare queste ore lavorate?')) return;
        
        try {
            await this.firebaseService.deleteDocument("oreLavorate", id);
            NotificationService.success('Ore eliminate con successo!');
            await this.aggiornaTabellaOreLavorate();
        } catch (error) {
            console.error('Errore eliminazione:', error);
            NotificationService.error('Errore durante l\'eliminazione');
        }
    }

    calcolaTotaleGenerale(oreFiltrate) {
        if (!Array.isArray(oreFiltrate)) return 0;
        return oreFiltrate.reduce((tot, ore) => {
            return tot + Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
        }, 0);
    }

    // ============================================================
    // 7.10 TABELLA COMMESSE
    // ============================================================

async aggiornaTabellaCommesse() {
    const tbody = document.querySelector('#commesseTable tbody');
    if (!tbody) {
        console.error('❌ Tbody commesse non trovato');
        return;
    }

    try {
        // 1. Carica i dati
        const filtro = document.getElementById('cercaCommessa')?.value.trim() || '';
        let commesse = await this.firebaseService.getCollection("commesse");

        // 2. Applica filtro
        if (filtro) {
            const f = filtro.toLowerCase();
            commesse = commesse.filter(c => 
                c.nomeCommessa?.toLowerCase().includes(f) ||
                c.cliente?.toLowerCase().includes(f)
            );
        }

        // 3. Ordina
        commesse.sort((a, b) => {
            const statoA = a.stato === 'attiva' ? 0 : 1;
            const statoB = b.stato === 'attiva' ? 0 : 1;
            if (statoA !== statoB) return statoA - statoB;
            return (a.nomeCommessa || '').localeCompare(b.nomeCommessa || '', 'it');
        });

        // 4. Salva nello state
        stateManager.datiTotali.commesse = commesse;
        
        // 5. Aggiorna i dati della paginazione
        this.paginazione.commesse.datiTotali = commesse;

        // 6. Ottieni i dati della pagina corrente
        const datiPagina = this.paginazione.commesse.getDatiPagina();
        
        console.log(`📊 Commesse - Pagina ${this.paginazione.commesse.paginaCorrente}: ${datiPagina.length} record su ${commesse.length}`);

        // 7. Popola la tabella
        tbody.innerHTML = '';

        if (datiPagina.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-4 text-muted">
                        <i class="fas fa-inbox fa-3x mb-3 d-block"></i>
                        <h5>Nessuna commessa trovata</h5>
                        <p class="small">Aggiungi una nuova commessa usando il form sopra</p>
                    </td>
                </tr>
            `;
        } else {
            datiPagina.forEach(commessa => {
                const stato = commessa.stato || 'attiva';
                const row = document.createElement('tr');
                
                if (stato === 'conclusa') {
                    row.classList.add('commessa-conclusa');
                }

                const dataInizio = commessa.dataInizio || commessa.dataCreazione?.split('T')[0] || '';
                const dataFormattata = dataInizio ? Utils.formattaDataItaliana(dataInizio) : '-';
                const oreTotali = commessa.oreTotaliPreviste || 0;
                const oreIntegrazione = commessa.oreIntegrazione || 0;
                
                // 🔥 GESTIONE FATTURATO
                const fatturato = commessa.fatturato || 'da_fatturare';
                const fatturatoBadge = this.getFatturatoBadge(fatturato);
                
                row.innerHTML = `
                    <td>
                        <strong>${Utils.escapeHtml(commessa.nomeCommessa)}</strong>
                        ${oreIntegrazione > 0 ? `<br><small class="text-warning">➕ +${Utils.formattaOreDecimali(oreIntegrazione)} integrazione</small>` : ''}
                    </td>
                    <td>${Utils.escapeHtml(commessa.cliente || 'N/D')}</td>
                    <td class="text-end">€ ${(commessa.valorePreventivo || 0).toFixed(2)}</td>
                    <td class="text-center">${Utils.formattaOreDecimali(oreTotali)} ore</td>
                    <td class="text-center">${dataFormattata}</td>
                    <td class="text-center">
                        <span class="badge ${stato === 'attiva' ? 'badge-attiva' : 'badge-conclusa'}">
                            ${stato === 'attiva' ? '🟢 ATTIVA' : '🔴 CONCLUSA'}
                        </span>
                    </td>
                    <td class="text-center">
                        <button class="btn btn-sm ${fatturato === 'fatturato' ? 'btn-success' : 'btn-outline-secondary'} btn-toggle-fatturato" 
                                data-id="${commessa.id}" 
                                data-fatturato="${fatturato}"
                                title="${fatturato === 'fatturato' ? 'Segna come da fatturare' : 'Segna come fatturato'}">
                            ${fatturatoBadge}
                        </button>
                    </td>
                    <td class="text-center">
                        <div class="btn-group btn-group-sm" role="group">
                            <button class="btn btn-warning btn-modifica-commessa" data-id="${commessa.id}" title="Modifica">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-secondary btn-cambia-stato-commessa" 
                                    data-id="${commessa.id}" data-stato="${stato}" 
                                    title="${stato === 'attiva' ? 'Concludi' : 'Riattiva'}">
                                ${stato === 'attiva' ? '🔒' : '↩️'}
                            </button>
                            <button class="btn btn-danger btn-elimina-commessa" data-id="${commessa.id}" title="Elimina">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);

                // Event listeners
                row.querySelector('.btn-modifica-commessa')?.addEventListener('click', () => this.modificaCommessa(commessa.id));
                row.querySelector('.btn-cambia-stato-commessa')?.addEventListener('click', () => this.cambiaStatoCommessa(commessa.id, stato));
                row.querySelector('.btn-elimina-commessa')?.addEventListener('click', () => this.eliminaCommessa(commessa.id));
                
                // 🔥 EVENT LISTENER PER FATTURATO
                row.querySelector('.btn-toggle-fatturato')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    const btn = e.currentTarget;
                    this.toggleFatturato(btn.dataset.id, btn.dataset.fatturato);
                });
            });
        }

        // 8. Renderizza la paginazione
        this.paginazione.commesse.render(commesse, () => {
            console.log(`🔄 Callback paginazione commesse - ricarico`);
            this.aggiornaTabellaCommesse();
        });

    } catch (error) {
        console.error('❌ Errore tabella commesse:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-danger py-4">
                    <i class="fas fa-exclamation-triangle fa-2x mb-2 d-block"></i>
                    Errore: ${error.message}
                    <br>
                    <button class="btn btn-sm btn-primary mt-2" onclick="app.aggiornaTabellaCommesse()">
                        <i class="fas fa-sync-alt"></i> Riprova
                    </button>
                </td>
            </tr>
        `;
    }
}
/**
 * Restituisce il badge HTML per lo stato di fatturazione
 */
getFatturatoBadge(stato) {
    if (stato === 'fatturato') {
        return `<span class="badge bg-success">
                    <i class="fas fa-check-circle"></i> Fatturato
                </span>`;
    } else {
        return `<span class="badge bg-warning text-dark">
                    <i class="fas fa-clock"></i> Da fatturare
                </span>`;
    }
}
/**
 * Alterna lo stato di fatturazione di una commessa
 */
async toggleFatturato(commessaId, statoCorrente) {
    try {
        // Determina il nuovo stato
        const nuovoStato = statoCorrente === 'fatturato' ? 'da_fatturare' : 'fatturato';
        const etichetta = nuovoStato === 'fatturato' ? 'FATTURATO' : 'DA FATTURARE';
        
        // Chiedi conferma
        if (!confirm(`Sei sicuro di voler segnare questa commessa come "${etichetta}"?`)) {
            return;
        }
        
        // Aggiorna su Firebase
        await this.firebaseService.updateDocument("commesse", commessaId, {
            fatturato: nuovoStato,
            dataUltimaModifica: new Date().toISOString(),
            ...(nuovoStato === 'fatturato' ? { dataFatturazione: new Date().toISOString() } : {})
        });
        
        NotificationService.success(`Commessa segnata come ${etichetta}`);
        
        // Ricarica la tabella
        await this.aggiornaTabellaCommesse();
        await this.aggiornaMonitorCommesse();
        
    } catch (error) {
        console.error('❌ Errore toggle fatturato:', error);
        NotificationService.error('Errore durante l\'aggiornamento del fatturato');
    }
}

   async handleCommessaForm(e) {
    
    try {
        const nomeCommessa = document.getElementById('nomeCommessa').value.trim();
        const cliente = document.getElementById('cliente').value.trim();
        const valorePreventivo = parseFloat(document.getElementById('valorePreventivo').value);
        const statoCommessa = document.getElementById('statoCommessa').value;
        const dataInizio = document.getElementById('dataCommessa').value;

        if (!nomeCommessa || !cliente || !valorePreventivo || !dataInizio) {
            NotificationService.error('Compila tutti i campi');
            return;
        }

        // 🔥 CHIEDI SE LA COMMESSA È FATTURATA
        const fatturato = confirm("La commessa è già stata fatturata? (OK=Sì, Annulla=No)") ? 'fatturato' : 'da_fatturare';

        const oreTotaliPreviste = valorePreventivo / CONFIG.TARIFFA_ORARIA;

        const dataCommessa = {
            nomeCommessa,
            cliente,
            valorePreventivo,
            oreTotaliPreviste: parseFloat(oreTotaliPreviste.toFixed(2)),
            oreIntegrazione: 0,
            dataInizio,
            stato: statoCommessa,
            fatturato: fatturato,  // 🔥 NUOVO CAMPO
            dataCreazione: new Date().toISOString(),
            dataUltimaModifica: new Date().toISOString()
        };

        // Se fatturato, aggiungi data fatturazione
        if (fatturato === 'fatturato') {
            dataCommessa.dataFatturazione = new Date().toISOString();
        }

        await this.firebaseService.addDocument("commesse", dataCommessa);

        NotificationService.success(`Commessa aggiunta con successo! (${fatturato === 'fatturato' ? '✅ Fatturata' : '⏳ Da fatturare'})`);
        await Promise.all([
            this.aggiornaTabellaCommesse(),
            this.aggiornaMenuCommesse(),
            this.aggiornaMonitorCommesse()
        ]);
        
        e.target.reset();

    } catch (error) {
        console.error('Errore aggiunta commessa:', error);
        NotificationService.error('Errore durante l\'aggiunta');
    }
}

 async modificaCommessa(id) {
    try {
        const docRef = this.firebaseService.db.collection("commesse").doc(id);
        const docSnap = await docRef.get();
        if (!docSnap.exists) {
            NotificationService.error('Commessa non trovata');
            return;
        }

        const c = docSnap.data();
        
        const nome = prompt("Nome commessa:", c.nomeCommessa);
        if (!nome) return;
        
        const cliente = prompt("Cliente:", c.cliente);
        if (!cliente) return;
        
        const preventivo = parseFloat(prompt("Valore preventivo (€):", c.valorePreventivo));
        if (isNaN(preventivo) || preventivo <= 0) {
            NotificationService.error('Valore non valido');
            return;
        }
        
        const data = prompt("Data inizio (YYYY-MM-DD):", c.dataInizio || '');
        if (!data) return;
        
        const stato = confirm("Commessa attiva? (OK=Attiva, Annulla=Conclusa)") ? 'attiva' : 'conclusa';
        
        // 🔥 CHIEDI LO STATO FATTURATO
        const fatturato = confirm("Commessa fatturata? (OK=Sì, Annulla=No)") ? 'fatturato' : 'da_fatturare';

        const oreTotali = preventivo / CONFIG.TARIFFA_ORARIA;

        await this.firebaseService.updateDocument("commesse", id, {
            nomeCommessa: nome,
            cliente: cliente,
            valorePreventivo: preventivo,
            oreTotaliPreviste: parseFloat(oreTotali.toFixed(2)),
            dataInizio: data,
            stato: stato,
            fatturato: fatturato,
            dataUltimaModifica: new Date().toISOString(),
            ...(fatturato === 'fatturato' ? { dataFatturazione: new Date().toISOString() } : {})
        });

        NotificationService.success('Commessa modificata!');
        await Promise.all([
            this.aggiornaTabellaCommesse(),
            this.aggiornaMenuCommesse(),
            this.aggiornaMonitorCommesse()
        ]);

    } catch (error) {
        console.error('Errore modifica:', error);
        NotificationService.error('Errore durante la modifica');
    }
}

    async eliminaCommessa(id) {
        if (!confirm('Sei sicuro di voler eliminare questa commessa?\nQuesta azione è irreversibile!')) return;
        
        try {
            await this.firebaseService.deleteDocument("commesse", id);
            NotificationService.success('Commessa eliminata!');
            await Promise.all([
                this.aggiornaTabellaCommesse(),
                this.aggiornaMenuCommesse(),
                this.aggiornaMonitorCommesse()
            ]);
        } catch (error) {
            console.error('Errore eliminazione:', error);
            NotificationService.error('Errore durante l\'eliminazione');
        }
    }

    async cambiaStatoCommessa(id, statoAttuale) {
        try {
            const nuovoStato = statoAttuale === 'attiva' ? 'conclusa' : 'attiva';
            const azione = nuovoStato === 'conclusa' ? 'concludere' : 'riattivare';
            
            if (!confirm(`Sei sicuro di voler ${azione} questa commessa?`)) return;

            await this.firebaseService.updateDocument("commesse", id, {
                stato: nuovoStato,
                dataUltimaModifica: new Date().toISOString()
            });

            NotificationService.success(`Commessa ${nuovoStato === 'conclusa' ? 'conclusa' : 'riattivata'}!`);
            await Promise.all([
                this.aggiornaTabellaCommesse(),
                this.aggiornaMenuCommesse(),
                this.aggiornaMonitorCommesse()
            ]);

        } catch (error) {
            console.error('Errore cambio stato:', error);
            NotificationService.error('Errore durante il cambio stato');
        }
    }


    // ============================================================
    // 7.11 TABELLA DIPENDENTI
    // ============================================================

async aggiornaTabellaDipendenti() {
    const tbody = document.querySelector('#dipendentiTable tbody');
    if (!tbody) {
        console.error('❌ Tbody dipendenti non trovato');
        return;
    }

    try {
        // 1. RECUPERA DATI DA FIREBASE
        let dipendenti = await this.firebaseService.getCollection("dipendenti");
        
        // 2. ORDINA DATI (prima admin, poi per cognome)
        dipendenti.sort((a, b) => {
            const ruoloA = a.ruolo === 'admin' ? 0 : 1;
            const ruoloB = b.ruolo === 'admin' ? 0 : 1;
            if (ruoloA !== ruoloB) return ruoloA - ruoloB;
            return (a.cognome || '').localeCompare(b.cognome || '', 'it');
        });

        // 3. SALVA NELLO STATE
        stateManager.datiTotali.dipendenti = dipendenti;
        
        // 4. AGGIORNA I DATI DELLA PAGINAZIONE
        this.paginazione.dipendenti.datiTotali = dipendenti;

        // 5. OTTIENI I DATI DELLA PAGINA CORRENTE
        const datiPagina = this.paginazione.dipendenti.getDatiPagina();
        
        console.log(`📊 Dipendenti - Pagina ${this.paginazione.dipendenti.paginaCorrente}: ${datiPagina.length} record su ${dipendenti.length}`);

        // 6. PULISCI LA TABELLA
        tbody.innerHTML = '';

        // 7. MOSTRA MESSAGGIO SE VUOTO
        if (datiPagina.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4 text-muted">
                        <i class="fas fa-users fa-3x mb-3 d-block"></i>
                        <h5>Nessun dipendente trovato</h5>
                        <p class="small">Aggiungi un nuovo dipendente usando il form sopra</p>
                    </td>
                </tr>
            `;
        } else {
            // 8. POPOLA LA TABELLA
            datiPagina.forEach(d => {
                const row = document.createElement('tr');
                
                // Mostra la password solo se non è hashata
                const mostraPassword = d.passwordHash ? '••••••••' : (d.password || '-');
                
                row.innerHTML = `
                    <td><strong>${Utils.escapeHtml(d.nome)}</strong></td>
                    <td>${Utils.escapeHtml(d.cognome)}</td>
                    <td>${Utils.escapeHtml(d.email)}</td>
                    <td><span class="font-monospace">${mostraPassword}</span></td>
                    <td>
                        <span class="badge ${d.ruolo === 'admin' ? 'bg-danger' : 'bg-info'}">
                            ${d.ruolo || 'dipendente'}
                        </span>
                    </td>
                    <td>
                        <div class="btn-group btn-group-sm" role="group">
                            <button class="btn btn-warning btn-modifica-dipendente" 
                                    data-id="${d.id}" 
                                    title="Modifica dipendente">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-danger btn-elimina-dipendente" 
                                    data-id="${d.id}" 
                                    title="Elimina dipendente">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);

                // EVENT LISTENERS
                row.querySelector('.btn-modifica-dipendente')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.modificaDipendente(d.id);
                });
                
                row.querySelector('.btn-elimina-dipendente')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.eliminaDipendente(d.id);
                });
            });
        }

        // 9. RENDERIZZA LA PAGINAZIONE
        this.paginazione.dipendenti.render(dipendenti, () => {
            console.log(`🔄 Callback paginazione dipendenti - ricarico`);
            this.aggiornaTabellaDipendenti();
        });

        console.log(`✅ Tabella dipendenti aggiornata: ${dipendenti.length} record, pagina ${this.paginazione.dipendenti.paginaCorrente}`);

    } catch (error) {
        console.error('❌ Errore tabella dipendenti:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-danger py-4">
                    <i class="fas fa-exclamation-triangle fa-2x mb-2 d-block"></i>
                    Errore nel caricamento: ${error.message}
                    <br>
                    <button class="btn btn-sm btn-primary mt-2" onclick="app.aggiornaTabellaDipendenti()">
                        <i class="fas fa-sync-alt"></i> Riprova
                    </button>
                </td>
            </tr>
        `;
    }
}
// ============================================================
// 7.11.1 REFRESH PAGINAZIONI - DENTRO LA CLASSE!
// ============================================================

refreshAllPaginazioni() {
    console.log('🔄 Refresh paginazioni...');
    
    // Usa this.paginazione per accedere alle paginazioni
    if (this.paginazione.ore) {
        this.paginazione.ore.render(
            stateManager.datiTotali.oreLavorate || [],
            () => this.aggiornaTabellaOreLavorate()
        );
    }
    
    if (this.paginazione.commesse) {
        this.paginazione.commesse.render(
            stateManager.datiTotali.commesse || [],
            () => this.aggiornaTabellaCommesse()
        );
    }
    
    if (this.paginazione.dipendenti) {
        this.paginazione.dipendenti.render(
            stateManager.datiTotali.dipendenti || [],
            () => this.aggiornaTabellaDipendenti()
        );
    }
    
    if (this.paginazione.fornitori) {
        this.paginazione.fornitori.render(
            stateManager.datiTotali.fornitori || [],
            () => this.aggiornaTabellaFornitori()
        );
    }
    
    console.log('✅ Refresh paginazioni completato');
}
    async handleDipendentiForm(e) {
        
        try {
            const nome = document.getElementById('dipendenteNome').value.trim();
            const cognome = document.getElementById('dipendenteCognome').value.trim();
            const email = document.getElementById('dipendenteEmail').value.trim();
            const password = document.getElementById('dipendentePassword').value.trim();
            const ruolo = document.getElementById('dipendenteRuolo').value;

            if (!nome || !cognome || !email || !password) {
                NotificationService.error('Compila tutti i campi');
                return;
            }

            const passwordHash = await Utils.hashPassword(password);

            await this.firebaseService.addDocument("dipendenti", {
                nome,
                cognome,
                email,
                passwordHash,
                ruolo,
                dataCreazione: new Date().toISOString()
            });

            NotificationService.success('Dipendente aggiunto con successo!');
            await this.aggiornaTabellaDipendenti();
            e.target.reset();

        } catch (error) {
            console.error('Errore aggiunta dipendente:', error);
            NotificationService.error('Errore durante l\'aggiunta');
        }
    }

    async modificaDipendente(id) {
        try {
            const docRef = this.firebaseService.db.collection("dipendenti").doc(id);
            const docSnap = await docRef.get();
            if (!docSnap.exists) {
                NotificationService.error('Dipendente non trovato');
                return;
            }

            const d = docSnap.data();
            
            const nome = prompt("Nome:", d.nome);
            if (!nome) return;
            
            const cognome = prompt("Cognome:", d.cognome);
            if (!cognome) return;
            
            const email = prompt("Email:", d.email);
            if (!email) return;
            
            const ruolo = prompt("Ruolo (admin/dipendente):", d.ruolo || 'dipendente');
            if (!ruolo) return;
            
            const nuovaPassword = prompt("Nuova password (lascia vuoto per mantenere):", '');
            
            const updateData = { nome, cognome, email, ruolo };
            if (nuovaPassword && nuovaPassword.length > 0) {
                updateData.passwordHash = await Utils.hashPassword(nuovaPassword);
            }

            await this.firebaseService.updateDocument("dipendenti", id, updateData);
            NotificationService.success('Dipendente modificato!');
            await this.aggiornaTabellaDipendenti();

        } catch (error) {
            console.error('Errore modifica:', error);
            NotificationService.error('Errore durante la modifica');
        }
    }

    async eliminaDipendente(id) {
        if (!confirm('Sei sicuro di voler eliminare questo dipendente?')) return;
        
        try {
            await this.firebaseService.deleteDocument("dipendenti", id);
            NotificationService.success('Dipendente eliminato!');
            await this.aggiornaTabellaDipendenti();
        } catch (error) {
            console.error('Errore eliminazione:', error);
            NotificationService.error('Errore durante l\'eliminazione');
        }
    }

    // ============================================================
    // 7.12 GESTIONE FORNITORI
    // ============================================================

    async caricaFornitori() {
        try {
            const fornitori = await this.firebaseService.getCollection("fornitoriLavorazioni");
            stateManager.datiTotali.fornitori = fornitori;
            this.paginazione.fornitori.aggiornaDati(fornitori);
            await this.aggiornaTabellaFornitori();
            await this.popolaSelectCommessePerFornitore();
        } catch (error) {
            console.error('Errore caricamento fornitori:', error);
        }
    }

async aggiornaTabellaFornitori() {
    const tbody = document.querySelector('#fornitoriTable tbody');
    if (!tbody) {
        console.error('❌ Tbody fornitori non trovato');
        return;
    }

    try {
        // 1. RECUPERA DATI
        let fornitori = await this.firebaseService.getCollection("fornitoriLavorazioni");
        
        // 2. ORDINA DATI (più recenti prima)
        fornitori.sort((a, b) => {
            const dataA = a.data || a.dataCreazione || '';
            const dataB = b.data || b.dataCreazione || '';
            return dataB.localeCompare(dataA);
        });

        // 3. SALVA NELLO STATE
        stateManager.datiTotali.fornitori = fornitori;
        
        // 4. AGGIORNA I DATI DELLA PAGINAZIONE
        this.paginazione.fornitori.datiTotali = fornitori;

        // 5. OTTIENI I DATI DELLA PAGINA CORRENTE
        const datiPagina = this.paginazione.fornitori.getDatiPagina();
        
        console.log(`📊 Fornitori - Pagina ${this.paginazione.fornitori.paginaCorrente}: ${datiPagina.length} record su ${fornitori.length}`);

        // 6. PULISCI LA TABELLA
        tbody.innerHTML = '';

        // 7. MOSTRA MESSAGGIO SE VUOTO
        if (datiPagina.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-4 text-muted">
                        <i class="fas fa-truck fa-3x mb-3 d-block"></i>
                        <h5>Nessuna lavorazione fornitore registrata</h5>
                        <p class="small">Aggiungi una lavorazione usando il form sopra</p>
                    </td>
                </tr>
            `;
        } else {
            // 8. POPOLA LA TABELLA
            datiPagina.forEach(f => {
                const row = document.createElement('tr');
                
                // Formatta data
                const dataFormattata = f.data ? Utils.formattaDataItaliana(f.data) : '-';
                
                row.innerHTML = `
                    <td><strong>${Utils.escapeHtml(f.nomeFornitore)}</strong></td>
                    <td>${Utils.escapeHtml(f.commessa)}</td>
                    <td class="text-end"><strong>€ ${(f.costo || 0).toFixed(2)}</strong></td>
                    <td>${Utils.escapeHtml(f.descrizione || '-')}</td>
                    <td>${dataFormattata}</td>
                    <td class="text-center">
                        <div class="btn-group btn-group-sm" role="group">
                            <button class="btn btn-warning btn-modifica-fornitore" 
                                    data-id="${f.id}" 
                                    title="Modifica lavorazione">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-danger btn-elimina-fornitore" 
                                    data-id="${f.id}" 
                                    title="Elimina lavorazione">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(row);

                // EVENT LISTENERS
                row.querySelector('.btn-modifica-fornitore')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.modificaLavorazioneFornitore(f.id);
                });
                
                row.querySelector('.btn-elimina-fornitore')?.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.eliminaLavorazioneFornitore(f.id);
                });
            });

            // 9. AGGIUNGI RIGA TOTALE COSTI
            const totaleCosti = fornitori.reduce((sum, f) => sum + (parseFloat(f.costo) || 0), 0);
            const tr = document.createElement('tr');
            tr.className = 'table-info fw-bold';
            tr.innerHTML = `
                <td colspan="2" class="text-end">TOTALE COSTI FORNITORI</td>
                <td class="text-end"><strong>€ ${totaleCosti.toFixed(2)}</strong></td>
                <td colspan="3"></td>
            `;
            tbody.appendChild(tr);
        }

        // 10. RENDERIZZA LA PAGINAZIONE
        this.paginazione.fornitori.render(fornitori, () => {
            console.log(`🔄 Callback paginazione fornitori - ricarico`);
            this.aggiornaTabellaFornitori();
        });

        console.log(`✅ Tabella fornitori aggiornata: ${fornitori.length} record, pagina ${this.paginazione.fornitori.paginaCorrente}`);

    } catch (error) {
        console.error('❌ Errore tabella fornitori:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-danger py-4">
                    <i class="fas fa-exclamation-triangle fa-2x mb-2 d-block"></i>
                    Errore nel caricamento: ${error.message}
                    <br>
                    <button class="btn btn-sm btn-primary mt-2" onclick="app.aggiornaTabellaFornitori()">
                        <i class="fas fa-sync-alt"></i> Riprova
                    </button>
                </td>
            </tr>
        `;
    }
}
// Aggiungi alla classe OreLavorateApp



    async aggiungiLavorazioneFornitore(e) {
        
        if (this.salvataggioInCorso) return;
        this.salvataggioInCorso = true;

        try {
            const nomeFornitore = document.getElementById('fornitoreNome').value.trim();
            const commessa = document.getElementById('fornitoreCommessa').value;
            const costo = parseFloat(document.getElementById('fornitoreCosto').value);
            const descrizione = document.getElementById('fornitoreDescrizione').value.trim();
            const data = document.getElementById('fornitoreData').value || new Date().toISOString().split('T')[0];

            if (!nomeFornitore || !commessa || isNaN(costo) || costo <= 0) {
                NotificationService.error('Compila tutti i campi obbligatori');
                return;
            }

            await this.firebaseService.addDocument("fornitoriLavorazioni", {
                nomeFornitore,
                commessa,
                costo,
                descrizione,
                data,
                dataCreazione: new Date().toISOString()
            });

            NotificationService.success('Lavorazione fornitore aggiunta!');
            document.getElementById('fornitoreForm').reset();
            await Promise.all([
                this.caricaFornitori(),
                this.aggiornaMonitorCommesse()
            ]);

        } catch (error) {
            console.error('Errore aggiunta fornitore:', error);
            NotificationService.error('Errore durante l\'aggiunta');
        } finally {
            this.salvataggioInCorso = false;
        }
    }

    async modificaLavorazioneFornitore(id) {
        try {
            const docRef = this.firebaseService.db.collection("fornitoriLavorazioni").doc(id);
            const docSnap = await docRef.get();
            if (!docSnap.exists) {
                NotificationService.error('Lavorazione non trovata');
                return;
            }

            const f = docSnap.data();
            
            const nome = prompt("Nome fornitore:", f.nomeFornitore);
            if (!nome) return;
            
            const commessa = prompt("Commessa:", f.commessa);
            if (!commessa) return;
            
            const costo = parseFloat(prompt("Costo (€):", f.costo));
            if (isNaN(costo) || costo <= 0) {
                NotificationService.error('Costo non valido');
                return;
            }
            
            const descrizione = prompt("Descrizione:", f.descrizione || '');
            const data = prompt("Data (YYYY-MM-DD):", f.data || '');

            await this.firebaseService.updateDocument("fornitoriLavorazioni", id, {
                nomeFornitore: nome,
                commessa,
                costo,
                descrizione: descrizione || '',
                data: data || '',
                dataModifica: new Date().toISOString()
            });

            NotificationService.success('Lavorazione modificata!');
            await Promise.all([
                this.caricaFornitori(),
                this.aggiornaMonitorCommesse()
            ]);

        } catch (error) {
            console.error('Errore modifica:', error);
            NotificationService.error('Errore durante la modifica');
        }
    }

    async eliminaLavorazioneFornitore(id) {
        if (!confirm('Sei sicuro di voler eliminare questa lavorazione fornitore?')) return;
        
        try {
            await this.firebaseService.deleteDocument("fornitoriLavorazioni", id);
            NotificationService.success('Lavorazione eliminata!');
            await Promise.all([
                this.caricaFornitori(),
                this.aggiornaMonitorCommesse()
            ]);
        } catch (error) {
            console.error('Errore eliminazione:', error);
            NotificationService.error('Errore durante l\'eliminazione');
        }
    }

    async popolaSelectCommessePerFornitore() {
        const select = document.getElementById('fornitoreCommessa');
        if (!select) return;
        
        select.innerHTML = '<option value="">Seleziona una commessa</option>';

        try {
            const commesse = await this.firebaseService.getCollection("commesse");
            const disponibili = commesse
                .filter(c => c && c.nomeCommessa)
                .sort((a, b) => (a.nomeCommessa || '').localeCompare(b.nomeCommessa || '', 'it'));

            disponibili.forEach(c => {
                const option = document.createElement('option');
                option.value = c.nomeCommessa;
                const stato = c.stato === 'attiva' ? '🟢' : '🔴';
                option.textContent = `${stato} ${c.nomeCommessa} - ${c.cliente || 'N/D'}`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Errore caricamento commesse:', error);
        }
    }

    // ============================================================
    // 7.13 MONITORAGGIO COMMESSE
    // ============================================================

    async aggiornaMonitorCommesse() {
        try {
            const [commesse, tutteLeOre] = await Promise.all([
                this.firebaseService.getCollection("commesse"),
                this.firebaseService.getCollection("oreLavorate")
            ]);

            const filtroNome = document.getElementById('filtroNomeCommessa')?.value.trim() || '';
            const filtroStato = document.getElementById('filtroCommessaMonitor')?.value || '';
            const filtroAnno = document.getElementById('filtroAnnoMonitor')?.value || '';
            const filtroMese = document.getElementById('filtroMeseMonitor')?.value || '';
            const filtroFatturato = document.getElementById('filtroFatturato')?.value || '';
            let commesseFiltrate = commesse.filter(c => c && c.nomeCommessa);

            if (filtroNome) {
                const f = filtroNome.toLowerCase();
                commesseFiltrate = commesseFiltrate.filter(c => 
                    c.nomeCommessa.toLowerCase().includes(f)
                );
            }

            if (filtroStato === 'attive') {
                commesseFiltrate = commesseFiltrate.filter(c => c.stato === 'attiva' || !c.stato);
            } else if (filtroStato === 'concluse') {
                commesseFiltrate = commesseFiltrate.filter(c => c.stato === 'conclusa');
            }

            if (filtroAnno) {
                commesseFiltrate = commesseFiltrate.filter(c => {
                    const data = c.dataInizio || c.dataCreazione;
                    return data && data.split('-')[0] === filtroAnno;
                });
            }

            if (filtroMese) {
                commesseFiltrate = commesseFiltrate.filter(c => {
                    const data = c.dataInizio || c.dataCreazione;
                    return data && data.split('-')[1] === filtroMese;
                });
            }
            if (filtroFatturato) {
                     commesseFiltrate = commesseFiltrate.filter(c => 
                     (c.fatturato || 'da_fatturare') === filtroFatturato
                        );
                }

            commesseFiltrate.sort((a, b) => {
                const statoA = a.stato === 'attiva' ? 0 : 1;
                const statoB = b.stato === 'attiva' ? 0 : 1;
                if (statoA !== statoB) return statoA - statoB;
                return (a.nomeCommessa || '').localeCompare(b.nomeCommessa || '', 'it');
            });

            const tbody = document.querySelector('#monitorCommesseTable tbody');
            if (!tbody) return;

            tbody.innerHTML = '';

            if (commesseFiltrate.length === 0) {
                tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4">Nessuna commessa trovata</td></tr>`;
                return;
            }

            this.popolaDatalistCommesse(commesse);

            const fornitori = stateManager.datiTotali.fornitori || [];

            for (const commessa of commesseFiltrate) {
                const stats = this.calcolaStatisticheCommessa(commessa, tutteLeOre, fornitori);
                const row = this.creaRigaMonitoraggio(commessa, stats);
                tbody.appendChild(row);
            }

            this.mostraInfoFiltriMonitor(commesseFiltrate.length, commesse.length, filtroNome, filtroStato, filtroAnno, filtroMese);

        } catch (error) {
            console.error('Errore monitoraggio:', error);
            const tbody = document.querySelector('#monitorCommesseTable tbody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="11" class="text-center text-danger">Errore nel caricamento</td></tr>`;
            }
        }
    }

    calcolaStatisticheCommessa(commessa, tutteLeOre, fornitori) {
        const valorePreventivo = parseFloat(commessa.valorePreventivo) || 0;
        const oreTotaliPreviste = parseFloat(commessa.oreTotaliPreviste) || 0;
        const oreIntegrazione = parseFloat(commessa.oreIntegrazione) || 0;

        const costiFornitori = fornitori
            .filter(f => f.commessa === commessa.nomeCommessa)
            .reduce((tot, f) => tot + (parseFloat(f.costo) || 0), 0);

        const oreCommessa = tutteLeOre.filter(ore => 
            ore.commessa?.toLowerCase().trim() === commessa.nomeCommessa?.toLowerCase().trim()
        );

        let oreLavorateTotali = 0;
        let oreNonConformita = 0;

        oreCommessa.forEach(ore => {
            const oreCalc = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
            if (!isNaN(oreCalc) && oreCalc > 0) {
                oreLavorateTotali += oreCalc;
                if (ore.nonConformita === true) {
                    oreNonConformita += oreCalc;
                }
            }
        });

        const tariffa = CONFIG.TARIFFA_ORARIA;
        const oreConformi = oreLavorateTotali - oreNonConformita;
        const costoDipendenti = (oreConformi * tariffa) + (oreNonConformita * CONFIG.COSTO_ORARIO_NON_CONFORMITA);
        const costoTotale = costoDipendenti + costiFornitori;

        const valoreIntegrazione = oreIntegrazione * tariffa;
        const ricavoTotale = valorePreventivo + valoreIntegrazione;

        const margineEuro = ricavoTotale - costoTotale;
        const marginePercentuale = ricavoTotale > 0 ? (margineEuro / ricavoTotale) * 100 : 0;

        return {
            valorePreventivo,
            oreTotaliPreviste,
            oreIntegrazione,
            valoreIntegrazione,
            ricavoTotale,
            oreLavorateTotali: parseFloat(oreLavorateTotali.toFixed(2)),
            oreNonConformita: parseFloat(oreNonConformita.toFixed(2)),
            oreConformi: parseFloat(oreConformi.toFixed(2)),
            costoDipendenti: parseFloat(costoDipendenti.toFixed(2)),
            costiFornitori: parseFloat(costiFornitori.toFixed(2)),
            costoTotale: parseFloat(costoTotale.toFixed(2)),
            margineEuro: parseFloat(margineEuro.toFixed(2)),
            marginePercentuale: parseFloat(marginePercentuale.toFixed(1)),
            hasIntegrazione: oreIntegrazione > 0,
            hasFornitori: costiFornitori > 0,
            datiCompleti: valorePreventivo > 0
        };
    }

    creaRigaMonitoraggio(commessa, stats) {
        const row = document.createElement('tr');
        const stato = commessa.stato || 'attiva';
        const isAttiva = stato === 'attiva';

        if (!isAttiva) row.classList.add('commessa-conclusa');

        const statoMargine = this.getStatoMargine(stats);
        const oreLavForm = Utils.formattaOreDecimali(stats.oreLavorateTotali);
        const orePrevForm = Utils.formattaOreDecimali(stats.oreTotaliPreviste);
        const oreNCForm = Utils.formattaOreDecimali(stats.oreNonConformita);
        const oreIntegrForm = Utils.formattaOreDecimali(stats.oreIntegrazione);

        row.innerHTML = `
            <td>
                <strong>${Utils.escapeHtml(commessa.nomeCommessa)}</strong>
                <br><small class="text-muted">${Utils.escapeHtml(commessa.cliente || 'N/D')}</small>
                ${stats.hasIntegrazione ? '<br><span class="badge bg-warning text-dark">💰 Integr.</span>' : ''}
                ${stats.hasFornitori ? '<br><span class="badge bg-info">🏭 Forn.</span>' : ''}
            </td>
            <td class="text-end">
                <strong>€ ${stats.valorePreventivo.toFixed(2)}</strong>
                ${stats.hasIntegrazione ? `<br><small>+ € ${stats.valoreIntegrazione.toFixed(2)}</small>` : ''}
                ${stats.hasIntegrazione ? `<br><strong class="text-primary">€ ${stats.ricavoTotale.toFixed(2)}</strong>` : ''}
            </td>
            <td class="text-center">
                <strong class="${stats.oreLavorateTotali > stats.oreTotaliPreviste ? 'text-danger' : ''}">
                    ${oreLavForm}
                </strong>
                <br><small>/ ${orePrevForm}</small>
                ${stats.hasIntegrazione ? `<br><small class="text-warning">+${oreIntegrForm}</small>` : ''}
            </td>
            <td class="text-center ${stats.oreNonConformita > 0 ? 'text-warning fw-bold' : ''}">
                ${oreNCForm}
                ${stats.oreNonConformita > 0 ? '<br><small>⚠️ NC</small>' : ''}
            </td>
            <td class="text-center ${stats.hasIntegrazione ? 'bg-warning bg-opacity-25' : ''}">
                ${stats.hasIntegrazione ? `<strong class="text-success">+${oreIntegrForm}</strong>` : '-'}
            </td>
            <td class="text-end">
                <strong>€ ${stats.costoDipendenti.toFixed(2)}</strong>
                <br><small>${Utils.formattaOreDecimali(stats.oreConformi)}h conf.</small>
                ${stats.oreNonConformita > 0 ? `<br><small class="text-danger">${oreNCForm}h NC</small>` : ''}
            </td>
            <td class="text-end ${stats.hasFornitori ? 'bg-light' : ''}">
                ${stats.hasFornitori ? `<strong>€ ${stats.costiFornitori.toFixed(2)}</strong>` : '-'}
            </td>
            <td class="text-end fw-bold bg-light">
                <strong>€ ${stats.costoTotale.toFixed(2)}</strong>
            </td>
            <td class="text-end ${stats.margineEuro >= 0 ? 'text-success' : 'text-danger'} fw-bold">
                ${stats.margineEuro >= 0 ? '+' : ''}€ ${stats.margineEuro.toFixed(2)}
            </td>
            <td class="text-end ${stats.margineEuro >= 0 ? 'text-success' : 'text-danger'} fw-bold">
                ${stats.marginePercentuale >= 0 ? '+' : ''}${stats.marginePercentuale.toFixed(1)}%
                <div class="progress mt-1" style="height: 4px; width: 60px; margin: 0 auto;">
                    <div class="progress-bar ${stats.marginePercentuale >= 20 ? 'bg-success' : stats.marginePercentuale >= 10 ? 'bg-info' : stats.marginePercentuale >= 0 ? 'bg-warning' : 'bg-danger'}" 
                         style="width: ${Math.min(100, Math.max(0, 50 + stats.marginePercentuale))}%">
                    </div>
                </div>
            </td>
            <td class="text-center">
                <span class="badge ${isAttiva ? 'badge-attiva' : 'badge-conclusa'} d-block mb-1">
                    ${isAttiva ? 'ATTIVA' : 'CONCLUSA'}
                </span>
                <span class="badge ${statoMargine.classe} d-block">
                    ${statoMargine.testo}
                </span>
                <button class="btn btn-sm btn-outline-secondary mt-1 w-100 btn-cambia-stato-monitor" 
                        data-id="${commessa.id}" data-stato="${stato}">
                    ${isAttiva ? '🔒 Concludi' : '↩️ Riattiva'}
                </button>
                ${stats.hasIntegrazione ? `
                    <button class="btn btn-sm btn-outline-warning mt-1 w-100 btn-modifica-integrazione" 
                            data-id="${commessa.id}" data-ore="${stats.oreIntegrazione}">
                        ✏️ ${oreIntegrForm}
                    </button>
                ` : `
                    <button class="btn btn-sm btn-outline-success mt-1 w-100 btn-aggiungi-integrazione" 
                            data-id="${commessa.id}">
                        ➕ Integr.
                    </button>
                `}
            </td>
        `;

        row.querySelector('.btn-cambia-stato-monitor')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            this.cambiaStatoCommessa(btn.dataset.id, btn.dataset.stato);
        });

        row.querySelector('.btn-aggiungi-integrazione')?.addEventListener('click', (e) => {
            this.aggiungiIntegrazione(e.currentTarget.dataset.id);
        });

        row.querySelector('.btn-modifica-integrazione')?.addEventListener('click', (e) => {
            const btn = e.currentTarget;
            this.modificaIntegrazione(btn.dataset.id, parseFloat(btn.dataset.ore));
        });

        return row;
    }

    getStatoMargine(stats) {
        const m = stats.marginePercentuale;
        if (m >= 30) return { testo: 'ECCELLENTE', classe: 'bg-success' };
        if (m >= 20) return { testo: 'BUONO', classe: 'bg-info' };
        if (m >= 10) return { testo: 'SUFFICIENTE', classe: 'bg-warning text-dark' };
        if (m >= 0) return { testo: 'LIMITE', classe: 'bg-danger' };
        return { testo: 'IN PERDITA', classe: 'bg-dark' };
    }

    popolaDatalistCommesse(commesse) {
        const datalist = document.getElementById('listaCommesse');
        if (!datalist) return;
        
        datalist.innerHTML = '';
        const nomi = [...new Set(commesse.filter(c => c && c.nomeCommessa).map(c => c.nomeCommessa))]
            .sort((a, b) => a.localeCompare(b, 'it'));
        
        nomi.forEach(nome => {
            const option = document.createElement('option');
            option.value = nome;
            datalist.appendChild(option);
        });
    }

    mostraInfoFiltriMonitor(count, total, filtroNome, filtroStato, filtroAnno, filtroMese) {
        const existing = document.getElementById('infoFiltriMonitor');
        if (existing) existing.remove();

        if (!filtroNome && !filtroStato && !filtroAnno && !filtroMese) return;

        const info = document.createElement('div');
        info.id = 'infoFiltriMonitor';
        info.className = 'alert alert-info py-2 mt-3';
        
        const filtri = [];
        if (filtroNome) filtri.push(`Commessa: "${filtroNome}"`);
        if (filtroStato) filtri.push(`Stato: ${filtroStato === 'attive' ? 'Attive' : 'Concluse'}`);
        if (filtroAnno) filtri.push(`Anno: ${filtroAnno}`);
        if (filtroMese) {
            const mesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                         'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
            filtri.push(`Mese: ${mesi[parseInt(filtroMese) - 1]}`);
        }
        
        info.innerHTML = `
            <strong>Filtri attivi:</strong> ${filtri.join(' • ')}
            | <strong>Risultati:</strong> ${count} di ${total} commesse
        `;

        const table = document.getElementById('monitorCommesseTable');
        if (table && table.parentNode) {
            table.parentNode.insertBefore(info, table.nextSibling);
        }
    }

    resetFiltriMonitor() {
        document.getElementById('filtroNomeCommessa').value = '';
        document.getElementById('filtroCommessaMonitor').value = '';
        document.getElementById('filtroAnnoMonitor').value = '';
        document.getElementById('filtroMeseMonitor').value = '';
        this.aggiornaMonitorCommesse();
        NotificationService.info('Filtri resettati');
    }

    // ============================================================
    // 7.14 INTEGRAZIONE ORE
    // ============================================================

    async aggiungiIntegrazione(commessaId) {
        const input = prompt("Inserisci le ore di integrazione (es: 10.5 per 10h 30min):", "0");
        if (input === null) return;
        
        let ore = parseFloat(input.replace(',', '.'));
        if (isNaN(ore) || ore < 0) {
            NotificationService.error('Inserisci un numero valido');
            return;
        }
        
        ore = Math.round(ore * 100) / 100;

        try {
            await this.firebaseService.updateDocument("commesse", commessaId, {
                oreIntegrazione: ore,
                dataUltimaModifica: new Date().toISOString()
            });
            
            NotificationService.success(ore > 0 ? `✅ +${ore} ore di integrazione` : '🗑️ Integrazione rimossa');
            await this.aggiornaMonitorCommesse();
        } catch (error) {
            console.error('Errore integrazione:', error);
            NotificationService.error('Errore durante l\'aggiunta');
        }
    }

    async modificaIntegrazione(commessaId, oreCorrenti) {
        const oreFormattate = Utils.formattaOreDecimali(oreCorrenti);
        const input = prompt(`Ore integrazione attuali: ${oreFormattate}\n\nNuovo valore (0 per rimuovere):`, 
                            oreCorrenti.toString().replace('.', ','));
        if (input === null) return;
        
        let ore = parseFloat(input.replace(',', '.'));
        if (isNaN(ore) || ore < 0) {
            NotificationService.error('Inserisci un numero valido');
            return;
        }
        
        ore = Math.round(ore * 100) / 100;

        try {
            await this.firebaseService.updateDocument("commesse", commessaId, {
                oreIntegrazione: ore,
                dataUltimaModifica: new Date().toISOString()
            });
            
            NotificationService.success(ore > 0 ? `✅ Integrazione aggiornata: +${ore} ore` : '🗑️ Integrazione rimossa');
            await this.aggiornaMonitorCommesse();
        } catch (error) {
            console.error('Errore modifica integrazione:', error);
            NotificationService.error('Errore durante la modifica');
        }
    }

    // ============================================================
    // 7.15 DIAGNOSTICA E DEBUG
    // ============================================================

    async diagnosticaCommesse() {
        try {
            const commesse = await this.firebaseService.getCollection("commesse");
            const report = {
                totale: commesse.length,
                conPreventivo: 0,
                senzaPreventivo: 0,
                conOreCalcolate: 0,
                senzaOreCalcolate: 0,
                conStato: 0,
                senzaStato: 0,
                problemi: []
            };

            commesse.forEach(c => {
                if (c.valorePreventivo > 0) report.conPreventivo++;
                else report.senzaPreventivo++;
                
                if (c.oreTotaliPreviste > 0) report.conOreCalcolate++;
                else report.senzaOreCalcolate++;
                
                if (c.stato) report.conStato++;
                else report.senzaStato++;

                if (c.valorePreventivo > 0 && !c.oreTotaliPreviste) {
                    report.problemi.push({ commessa: c.nomeCommessa, problema: 'Ha preventivo ma ore non calcolate' });
                }
                if (!c.stato) {
                    report.problemi.push({ commessa: c.nomeCommessa, problema: 'Manca stato' });
                }
            });

            this.mostraReportDiagnostica(report);
        } catch (error) {
            console.error('Errore diagnostica:', error);
            NotificationService.error('Errore durante la diagnostica');
        }
    }

    mostraReportDiagnostica(report) {
        const container = document.createElement('div');
        container.className = 'diagnostica-report';
        container.innerHTML = `
            <h5>🔍 Diagnostica Commesse</h5>
            <div class="row">
                <div class="col-md-3"><strong>Totale:</strong> ${report.totale}</div>
                <div class="col-md-3"><strong>Con preventivo:</strong> ${report.conPreventivo}</div>
                <div class="col-md-3"><strong>Ore calcolate:</strong> ${report.conOreCalcolate}</div>
                <div class="col-md-3"><strong>Con stato:</strong> ${report.conStato}</div>
            </div>
            ${report.problemi.length > 0 ? `
                <div class="mt-3">
                    <h6>⚠️ Problemi rilevati (${report.problemi.length}):</h6>
                    <ul>
                        ${report.problemi.slice(0, 10).map(p => `<li>${p.commessa}: ${p.problema}</li>`).join('')}
                        ${report.problemi.length > 10 ? `<li>... e altri ${report.problemi.length - 10} problemi</li>` : ''}
                    </ul>
                    <button class="btn btn-sm btn-success" id="btnCorreggiDiagnostica">
                        🔧 Correggi Automaticamente
                    </button>
                </div>
            ` : `
                <div class="mt-3 alert alert-success">✅ Tutte le commesse sono configurate correttamente!</div>
            `}
            <button class="btn btn-sm btn-secondary mt-2" onclick="this.parentElement.remove()">❌ Chiudi</button>
        `;

        document.body.appendChild(container);

        document.getElementById('btnCorreggiDiagnostica')?.addEventListener('click', async () => {
            await this.correggiCommesseEsistenti();
            container.remove();
            NotificationService.success('Correzione completata!');
        });
    }

    async debugCommesse() {
        try {
            const commesse = await this.firebaseService.getCollection("commesse");
            console.log('=== DEBUG COMMESSE ===');
            commesse.forEach((c, i) => {
                console.log(`${i + 1}. ${c.nomeCommessa}:`, {
                    id: c.id,
                    preventivo: c.valorePreventivo,
                    orePreviste: c.oreTotaliPreviste,
                    stato: c.stato
                });
            });
            
            const conPreventivo = commesse.filter(c => c.valorePreventivo > 0).length;
            const senzaPreventivo = commesse.filter(c => !c.valorePreventivo || c.valorePreventivo <= 0).length;
            
            NotificationService.info(`Debug:\nCon preventivo: ${conPreventivo}\nSenza: ${senzaPreventivo}\nTotale: ${commesse.length}`);
        } catch (error) {
            console.error('Errore debug:', error);
        }
    }

    async correggiCommesseEsistenti() {
        try {
            const commesse = await this.firebaseService.getCollection("commesse");
            let corrette = 0;

            for (const c of commesse) {
                let needsUpdate = false;
                const update = {};

                if (c.valorePreventivo && c.valorePreventivo > 0) {
                    const ore = c.valorePreventivo / CONFIG.TARIFFA_ORARIA;
                    if (!c.oreTotaliPreviste || c.oreTotaliPreviste === 0) {
                        update.oreTotaliPreviste = parseFloat(ore.toFixed(2));
                        needsUpdate = true;
                    }
                }

                if (!c.stato) {
                    update.stato = 'attiva';
                    needsUpdate = true;
                }

                if (needsUpdate) {
                    await this.firebaseService.updateDocument("commesse", c.id, update);
                    corrette++;
                }
            }

            if (corrette > 0) {
                NotificationService.success(`${corrette} commesse corrette!`);
                await this.aggiornaMonitorCommesse();
            }
        } catch (error) {
            console.error('Errore correzione:', error);
        }
    }

    // ============================================================
    // 7.16 GRAFICI DASHBOARD
    // ============================================================

    async creaGraficiDashboard() {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js non caricato');
            return;
        }

        try {
            const [commesse, tutteLeOre, dipendenti] = await Promise.all([
                this.firebaseService.getCollection("commesse"),
                this.firebaseService.getCollection("oreLavorate"),
                this.firebaseService.getCollection("dipendenti")
            ]);

            this.popolaAnniFiltriGrafici();
            await this.creaGraficoMargini(commesse, tutteLeOre);
            this.creaGraficoStato(commesse);
            await this.creaGraficoOreDipendenti(tutteLeOre, dipendenti);
            this.creaGraficoAndamentoMensile(tutteLeOre, commesse);

        } catch (error) {
            console.error('Errore creazione grafici:', error);
            NotificationService.error('Errore nella creazione dei grafici');
        }
    }

    async creaGraficoMargini(commesse, tutteLeOre) {
        const canvas = document.getElementById('chartMarginiCommesse');
        if (!canvas) return;

        let commesseFiltrate = [...commesse];
        const filtroAnno = stateManager.filtri.margini.anno;
        const filtroMese = stateManager.filtri.margini.mese;

        if (filtroAnno) {
            commesseFiltrate = commesseFiltrate.filter(c => {
                const data = c.dataInizio || c.dataCreazione;
                return data && data.split('-')[0] === filtroAnno;
            });
        }

        if (filtroMese) {
            commesseFiltrate = commesseFiltrate.filter(c => {
                const data = c.dataInizio || c.dataCreazione;
                return data && data.split('-')[1] === filtroMese;
            });
        }

        const fornitori = stateManager.datiTotali.fornitori || [];
        const margini = [];

        for (const c of commesseFiltrate) {
            if (!c.nomeCommessa) continue;
            const stats = this.calcolaStatisticheCommessa(c, tutteLeOre, fornitori);
            if (stats.datiCompleti) {
                margini.push({
                    nome: c.nomeCommessa,
                    margine: stats.marginePercentuale,
                    preventivo: stats.valorePreventivo,
                    ricavo: stats.ricavoTotale
                });
            }
        }

        margini.sort((a, b) => b.margine - a.margine);
        stateManager.tuttiMargini = margini;

        const infoEl = document.getElementById('infoFiltriMargini');
        if (infoEl) {
            let testo = '';
            if (filtroAnno) testo += `Anno: ${filtroAnno} `;
            if (filtroMese) {
                const mesi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
                testo += `Mese: ${mesi[parseInt(filtroMese) - 1]}`;
            }
            infoEl.textContent = testo || 'Tutti i dati';
        }

        this.disegnaGraficoMargini();
    }

    disegnaGraficoMargini() {
        const canvas = document.getElementById('chartMarginiCommesse');
        if (!canvas) return;

        if (this.grafici.margini) {
            this.grafici.margini.destroy();
        }

        const start = (stateManager.pagineGrafici.margini - 1) * CONFIG.ELEMENTI_GRAFICI_PER_PAGINA;
        const end = start + CONFIG.ELEMENTI_GRAFICI_PER_PAGINA;
        const dati = stateManager.tuttiMargini.slice(start, end);

        const totalPages = Math.ceil(stateManager.tuttiMargini.length / CONFIG.ELEMENTI_GRAFICI_PER_PAGINA);

        const info = document.getElementById('paginaMarginiInfo');
        if (info) {
            info.textContent = `Pagina ${stateManager.pagineGrafici.margini} / ${totalPages || 1} (${stateManager.tuttiMargini.length} totali)`;
        }

        document.getElementById('btnPrecMargini').disabled = stateManager.pagineGrafici.margini === 1;
        document.getElementById('btnSuccMargini').disabled = stateManager.pagineGrafici.margini === totalPages || totalPages === 0;

        if (dati.length === 0) {
            this.mostraMessaggioGraficoVuoto(canvas, 'Nessun margine disponibile');
            return;
        }

        const colori = dati.map(item => {
            const m = item.margine;
            if (m >= 30) return 'rgba(22, 163, 74, 0.8)';
            if (m >= 20) return 'rgba(8, 145, 178, 0.8)';
            if (m >= 10) return 'rgba(234, 179, 8, 0.8)';
            if (m >= 0) return 'rgba(251, 146, 60, 0.8)';
            return 'rgba(220, 38, 38, 0.8)';
        });

        const ctx = canvas.getContext('2d');
        this.grafici.margini = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dati.map(item => item.nome.length > 20 ? item.nome.substring(0, 17) + '...' : item.nome),
                datasets: [{
                    label: 'Margine (%)',
                    data: dati.map(item => Math.min(100, Math.max(-50, item.margine))),
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
                            label: (ctx) => {
                                const item = dati[ctx.dataIndex];
                                return [
                                    `Margine: ${item.margine.toFixed(1)}%`,
                                    `Preventivo: € ${item.preventivo.toFixed(2)}`,
                                    `Ricavo: € ${item.ricavo.toFixed(2)}`
                                ];
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        title: { display: true, text: 'Margine (%)' },
                        ticks: { callback: v => v + '%', stepSize: 20 },
                        min: -50,
                        max: 100
                    },
                    x: {
                        ticks: { maxRotation: 35, minRotation: 35, autoSkip: false, font: { size: 10 } }
                    }
                }
            }
        });
    }

    creaGraficoStato(commesse) {
        const canvas = document.getElementById('chartStatoCommesse');
        if (!canvas) return;

        if (this.grafici.stato) {
            this.grafici.stato.destroy();
        }

        const attive = commesse.filter(c => c.stato === 'attiva' || !c.stato).length;
        const concluse = commesse.filter(c => c.stato === 'conclusa').length;

        const ctx = canvas.getContext('2d');
        this.grafici.stato = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [`Attive (${attive})`, `Concluse (${concluse})`],
                datasets: [{
                    data: [attive, concluse],
                    backgroundColor: ['rgba(22, 163, 74, 0.8)', 'rgba(100, 116, 139, 0.8)'],
                    borderColor: ['#16a34a', '#64748b'],
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
                            label: (ctx) => {
                                const total = attive + concluse;
                                const pct = total > 0 ? ((ctx.raw / total) * 100).toFixed(1) : 0;
                                return `${ctx.label}: ${ctx.raw} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    async creaGraficoOreDipendenti(tutteLeOre, dipendenti) {
        const canvas = document.getElementById('chartOreDipendenti');
        if (!canvas) return;

        let oreFiltrate = tutteLeOre;
        const filtroAnno = stateManager.filtri.oreDipendenti.anno;
        const filtroMese = stateManager.filtri.oreDipendenti.mese;

        if (filtroAnno) {
            oreFiltrate = oreFiltrate.filter(o => o.data && o.data.split('-')[0] === filtroAnno);
        }
        if (filtroMese) {
            oreFiltrate = oreFiltrate.filter(o => o.data && o.data.split('-')[1] === filtroMese);
        }

        const orePerDipendente = {};
        dipendenti.forEach(d => {
            orePerDipendente[`${d.nome} ${d.cognome}`] = 0;
        });

        oreFiltrate.forEach(o => {
            const nome = `${o.nomeDipendente} ${o.cognomeDipendente}`;
            if (orePerDipendente[nome] !== undefined) {
                orePerDipendente[nome] += Utils.calcolaOreLavorate(o.oraInizio, o.oraFine);
            }
        });

        const sorted = Object.entries(orePerDipendente)
            .filter(([_, ore]) => ore > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([nome, ore]) => ({ nome, ore: parseFloat(ore.toFixed(1)) }));

        stateManager.tutteOreDipendenti = sorted;

        const infoEl = document.getElementById('infoFiltriOreDipendenti');
        if (infoEl) {
            let testo = '';
            if (filtroAnno) testo += `Anno: ${filtroAnno} `;
            if (filtroMese) {
                const mesi = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
                testo += `Mese: ${mesi[parseInt(filtroMese) - 1]}`;
            }
            infoEl.textContent = testo || 'Tutti i dati';
        }

        this.disegnaGraficoOreDipendenti();
    }

    disegnaGraficoOreDipendenti() {
        const canvas = document.getElementById('chartOreDipendenti');
        if (!canvas) return;

        if (this.grafici.oreDipendenti) {
            this.grafici.oreDipendenti.destroy();
        }

        const start = (stateManager.pagineGrafici.oreDipendenti - 1) * CONFIG.ELEMENTI_GRAFICI_PER_PAGINA;
        const end = start + CONFIG.ELEMENTI_GRAFICI_PER_PAGINA;
        const dati = stateManager.tutteOreDipendenti.slice(start, end);

        const totalPages = Math.ceil(stateManager.tutteOreDipendenti.length / CONFIG.ELEMENTI_GRAFICI_PER_PAGINA);

        const info = document.getElementById('paginaOreDipendentiInfo');
        if (info) {
            info.textContent = `Pagina ${stateManager.pagineGrafici.oreDipendenti} / ${totalPages || 1} (${stateManager.tutteOreDipendenti.length} dipendenti)`;
        }

        document.getElementById('btnPrecOreDipendenti').disabled = stateManager.pagineGrafici.oreDipendenti === 1;
        document.getElementById('btnSuccOreDipendenti').disabled = stateManager.pagineGrafici.oreDipendenti === totalPages || totalPages === 0;

        if (dati.length === 0) {
            this.mostraMessaggioGraficoVuoto(canvas, 'Nessuna ora lavorata');
            return;
        }

        const ctx = canvas.getContext('2d');
        this.grafici.oreDipendenti = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dati.map(item => item.nome.length > 20 ? item.nome.substring(0, 17) + '...' : item.nome),
                datasets: [{
                    label: 'Ore Lavorate',
                    data: dati.map(item => item.ore),
                    backgroundColor: 'rgba(37, 99, 235, 0.7)',
                    borderColor: 'rgba(37, 99, 235, 1)',
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
                            label: (ctx) => {
                                const ore = ctx.raw;
                                return `${Utils.formattaOreDecimali(ore)} ore (${ore.toFixed(1)}h)`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        title: { display: true, text: 'Ore Lavorate' },
                        beginAtZero: true,
                        ticks: { callback: v => Utils.formattaOreDecimali(v) }
                    },
                    x: {
                        ticks: { maxRotation: 35, minRotation: 35, autoSkip: false, font: { size: 10 } }
                    }
                }
            }
        });
    }

    creaGraficoAndamentoMensile(tutteLeOre, commesse) {
        const canvas = document.getElementById('chartAndamentoMensile');
        if (!canvas) return;

        if (this.grafici.andamento) {
            this.grafici.andamento.destroy();
        }

        const anni = {};
        const annoCorrente = new Date().getFullYear();

        tutteLeOre.forEach(o => {
            if (o.data) {
                const [anno, mese] = o.data.split('-');
                if (!anni[anno]) anni[anno] = new Array(12).fill(0);
                const ore = Utils.calcolaOreLavorate(o.oraInizio, o.oraFine);
                anni[anno][parseInt(mese) - 1] += ore;
            }
        });

        const anniDisponibili = Object.keys(anni).sort();
        const annoSelezionato = anniDisponibili.includes(String(annoCorrente)) ? 
                               String(annoCorrente) : 
                               anniDisponibili[anniDisponibili.length - 1] || String(annoCorrente);

        const oreLavorate = anni[annoSelezionato] || new Array(12).fill(0);

        const orePreventivate = new Array(12).fill(0);
        commesse.forEach(c => {
            const data = c.dataInizio || c.dataCreazione;
            if (data && c.valorePreventivo > 0) {
                const [anno, mese] = data.split('-');
                if (anno === annoSelezionato) {
                    const meseIndex = parseInt(mese) - 1;
                    if (meseIndex >= 0 && meseIndex < 12) {
                        orePreventivate[meseIndex] += parseFloat(c.oreTotaliPreviste) || 0;
                    }
                }
            }
        });

        const dataLavorate = oreLavorate.map(o => parseFloat(o.toFixed(1)));
        const dataPreventivate = orePreventivate.map(o => parseFloat(o.toFixed(1)));

        const hasData = dataLavorate.some(o => o > 0) || dataPreventivate.some(o => o > 0);
        if (!hasData) {
            this.mostraMessaggioGraficoVuoto(canvas, `Nessun dato per ${annoSelezionato}`);
            return;
        }

        const ctx = canvas.getContext('2d');
        this.grafici.andamento = new Chart(ctx, {
            type: 'line',
            data: {
                labels: CONFIG.MESI_ABBREVIATI,
                datasets: [
                    {
                        label: `Ore Lavorate ${annoSelezionato}`,
                        data: dataLavorate,
                        borderColor: 'rgba(22, 163, 74, 1)',
                        backgroundColor: 'rgba(22, 163, 74, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.3,
                        pointBackgroundColor: 'rgba(22, 163, 74, 1)',
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        label: `Ore Preventivate ${annoSelezionato}`,
                        data: dataPreventivate,
                        borderColor: 'rgba(37, 99, 235, 1)',
                        backgroundColor: 'rgba(37, 99, 235, 0.05)',
                        borderWidth: 3,
                        borderDash: [8, 4],
                        fill: false,
                        tension: 0.3,
                        pointBackgroundColor: 'rgba(37, 99, 235, 1)',
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { 
                        position: 'top',
                        labels: { usePointStyle: true, boxWidth: 10 }
                    },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const val = ctx.raw;
                                return `${ctx.dataset.label}: ${Utils.formattaOreDecimali(val)} ore`;
                            },
                            footer: (items) => {
                                const lav = items.find(i => i.dataset.label.includes('Lavorate'));
                                const prev = items.find(i => i.dataset.label.includes('Preventivate'));
                                if (lav && prev) {
                                    const diff = lav.raw - prev.raw;
                                    if (diff > 0) return `📈 Eccedenza: +${Utils.formattaOreDecimali(diff)} ore`;
                                    if (diff < 0) return `📉 Sottoutilizzo: ${Utils.formattaOreDecimali(Math.abs(diff))} ore`;
                                    return '✓ In linea con il preventivo';
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { callback: v => Utils.formattaOreDecimali(v) },
                        grid: { color: 'rgba(0,0,0,0.05)' }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });

        this.aggiungiSommarioAndamento(dataLavorate, dataPreventivate, annoSelezionato);
    }

    aggiungiSommarioAndamento(lavorate, preventivate, anno) {
        const container = document.getElementById('summaryAndamento');
        if (!container) return;

        const totLav = lavorate.reduce((a, b) => a + b, 0);
        const totPrev = preventivate.reduce((a, b) => a + b, 0);
        const diff = totLav - totPrev;
        const pct = totPrev > 0 ? (totLav / totPrev) * 100 : 0;

        const diffClass = diff > 0 ? 'text-success' : (diff < 0 ? 'text-danger' : 'text-muted');
        const diffText = diff > 0 ? 'Eccedenza' : (diff < 0 ? 'Sottoutilizzo' : 'In linea');

        container.innerHTML = `
            <div class="d-flex justify-content-around flex-wrap gap-2 p-2 bg-light rounded">
                <span><strong>📊 Totale Lavorate:</strong> ${Utils.formattaOreDecimali(totLav)} ore</span>
                <span><strong>📋 Totale Preventivate:</strong> ${Utils.formattaOreDecimali(totPrev)} ore</span>
                <span class="${diffClass}"><strong>${diffText}:</strong> ${Utils.formattaOreDecimali(Math.abs(diff))} ore (${pct.toFixed(1)}%)</span>
                <span class="text-muted"><small>Anno ${anno}</small></span>
            </div>
        `;
    }

    mostraMessaggioGraficoVuoto(canvas, messaggio) {
        const ctx = canvas.getContext('2d');
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
        ctx.scale(2, 2);
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = '14px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(messaggio || 'Nessun dato disponibile', rect.width / 2, rect.height / 2);
    }

    // ============================================================
    // 7.17 FILTRI GRAFICI
    // ============================================================

    async applicaFiltriMarginiGrafico() {
        stateManager.filtri.margini.anno = document.getElementById('filtroAnnoMargini').value || '';
        stateManager.filtri.margini.mese = document.getElementById('filtroMeseMargini').value || '';
        stateManager.pagineGrafici.margini = 1;
        
        const [commesse, ore] = await Promise.all([
            this.firebaseService.getCollection("commesse"),
            this.firebaseService.getCollection("oreLavorate")
        ]);
        await this.creaGraficoMargini(commesse, ore);
        NotificationService.info('Filtri margini applicati');
    }

    resetFiltriMarginiGrafico() {
        document.getElementById('filtroAnnoMargini').value = '';
        document.getElementById('filtroMeseMargini').value = '';
        stateManager.filtri.margini = { anno: '', mese: '' };
        stateManager.pagineGrafici.margini = 1;
        this.creaGraficiDashboard();
        NotificationService.info('Filtri margini resettati');
    }

    async applicaFiltriOreDipendentiGrafico() {
        stateManager.filtri.oreDipendenti.anno = document.getElementById('filtroAnnoOreDipendenti').value || '';
        stateManager.filtri.oreDipendenti.mese = document.getElementById('filtroMeseOreDipendenti').value || '';
        stateManager.pagineGrafici.oreDipendenti = 1;
        
        const [ore, dipendenti] = await Promise.all([
            this.firebaseService.getCollection("oreLavorate"),
            this.firebaseService.getCollection("dipendenti")
        ]);
        await this.creaGraficoOreDipendenti(ore, dipendenti);
        NotificationService.info('Filtri ore dipendenti applicati');
    }

    resetFiltriOreDipendentiGrafico() {
        document.getElementById('filtroAnnoOreDipendenti').value = '';
        document.getElementById('filtroMeseOreDipendenti').value = '';
        stateManager.filtri.oreDipendenti = { anno: '', mese: '' };
        stateManager.pagineGrafici.oreDipendenti = 1;
        this.creaGraficiDashboard();
        NotificationService.info('Filtri ore dipendenti resettati');
    }

    // ============================================================
    // 7.18 PAGINAZIONE GRAFICI
    // ============================================================

    paginaMarginiPrec() {
        if (stateManager.pagineGrafici.margini > 1) {
            stateManager.pagineGrafici.margini--;
            this.disegnaGraficoMargini();
        }
    }

    paginaMarginiSucc() {
        const total = Math.ceil(stateManager.tuttiMargini.length / CONFIG.ELEMENTI_GRAFICI_PER_PAGINA);
        if (stateManager.pagineGrafici.margini < total) {
            stateManager.pagineGrafici.margini++;
            this.disegnaGraficoMargini();
        }
    }

    paginaOreDipendentiPrec() {
        if (stateManager.pagineGrafici.oreDipendenti > 1) {
            stateManager.pagineGrafici.oreDipendenti--;
            this.disegnaGraficoOreDipendenti();
        }
    }

    paginaOreDipendentiSucc() {
        const total = Math.ceil(stateManager.tutteOreDipendenti.length / CONFIG.ELEMENTI_GRAFICI_PER_PAGINA);
        if (stateManager.pagineGrafici.oreDipendenti < total) {
            stateManager.pagineGrafici.oreDipendenti++;
            this.disegnaGraficoOreDipendenti();
        }
    }

    // ============================================================
    // 7.19 ESPORTAZIONE GRAFICI
    // ============================================================

    async esportaGraficiPNG() {
        try {
            const canvas = document.getElementById('chartMarginiCommesse');
            if (!canvas) {
                NotificationService.error('Nessun grafico da esportare');
                return;
            }

            const link = document.createElement('a');
            link.download = `dashboard_grafici_${new Date().toISOString().split('T')[0]}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
            
            NotificationService.success('Grafici esportati con successo!');
        } catch (error) {
            console.error('Errore esportazione:', error);
            NotificationService.error('Errore durante l\'esportazione');
        }
    }

    // ============================================================
    // 7.20 REPORT MENSILE
    // ============================================================

    async mostraTabellaMensile() {
        const meseSelect = document.getElementById('selettoreMese');
        const mese = parseInt(meseSelect.value);
        const nomeMese = CONFIG.MESI[mese];
        
        const container = document.getElementById('tabelleMensili');
        container.style.display = 'block';
        container.innerHTML = `<div class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x"></i><br>Caricamento...</div>`;

        try {
            await this.generaTabellaMensile(mese + 1, nomeMese);
        } catch (error) {
            console.error('Errore report mensile:', error);
            container.innerHTML = `<div class="alert alert-danger">Errore nel caricamento del report</div>`;
        }
    }

    async generaTabellaMensile(meseNumero, nomeMese) {
        const container = document.getElementById('tabelleMensili');
        const datiOre = await this.firebaseService.getCollection("oreLavorate");
        
        const datiPerDipendente = {};
        const annoCorrente = new Date().getFullYear();

        datiOre.forEach(ore => {
            const data = new Date(ore.data);
            if (data.getMonth() + 1 === meseNumero && data.getFullYear() === annoCorrente) {
                const key = `${ore.nomeDipendente} ${ore.cognomeDipendente}`;
                if (!datiPerDipendente[key]) {
                    datiPerDipendente[key] = { giorni: new Array(31).fill(0), totale: 0 };
                }
                const giorno = data.getDate() - 1;
                const oreLav = Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine);
                datiPerDipendente[key].giorni[giorno] += oreLav;
                datiPerDipendente[key].totale += oreLav;
            }
        });

        let html = `
            <div class="card mb-4">
                <div class="card-header d-flex justify-content-between align-items-center">
                    <h3 class="mb-0">${nomeMese} ${annoCorrente}</h3>
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
                                    <th class="text-center">Totale</th>
                                </tr>
                            </thead>
                            <tbody>
        `;

        Object.entries(datiPerDipendente).forEach(([dipendente, dati]) => {
            html += `<tr>
                <td><strong>${dipendente}</strong></td>
                ${dati.giorni.map(ore => 
                    `<td class="text-center ${ore > 0 ? 'table-success' : ''}">${ore > 0 ? Utils.formattaOreDecimali(ore) : ''}</td>`
                ).join('')}
                <td class="text-center table-primary"><strong>${Utils.formattaOreDecimali(dati.totale)}</strong></td>
            </tr>`;
        });

        html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;

        document.getElementById(`btnScaricaCSV-${meseNumero}`)?.addEventListener('click', () => {
            this.scaricaCSV(nomeMese, meseNumero, datiPerDipendente);
        });
    }

    async scaricaCSV(nomeMese, meseNumero, datiPerDipendente) {
        try {
            const annoCorrente = new Date().getFullYear();
            let csv = `Report Ore Lavorate - ${nomeMese} ${annoCorrente}\n`;
            csv += 'Dipendente,' + Array.from({ length: 31 }, (_, i) => i + 1).join(',') + ',Totale Mensile\n';

            Object.entries(datiPerDipendente).forEach(([dipendente, dati]) => {
                csv += dipendente + ',' + 
                       dati.giorni.map(ore => ore > 0 ? Utils.formattaOreDecimali(ore) : '').join(',') + 
                       ',' + Utils.formattaOreDecimali(dati.totale) + '\n';
            });

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `ore_${nomeMese}_${annoCorrente}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
            
            NotificationService.success('CSV scaricato con successo!');
        } catch (error) {
            console.error('Errore CSV:', error);
            NotificationService.error('Errore durante il download CSV');
        }
    }

    // ============================================================
    // 7.21 BACKUP DATI
    // ============================================================

    async eseguiBackupDati() {
        try {
            NotificationService.info('Generazione backup in corso...');

            const [commesse, dipendenti, oreLavorate, fornitori] = await Promise.all([
                this.firebaseService.getCollection("commesse"),
                this.firebaseService.getCollection("dipendenti"),
                this.firebaseService.getCollection("oreLavorate"),
                this.firebaseService.getCollection("fornitoriLavorazioni")
            ]);

            const backup = {
                metadata: {
                    versione: "2.0",
                    dataGenerazione: new Date().toISOString(),
                    autore: stateManager.currentUser?.email || "Sconosciuto",
                    conteggio: {
                        commesse: commesse.length,
                        dipendenti: dipendenti.length,
                        oreLavorate: oreLavorate.length,
                        fornitori: fornitori.length
                    }
                },
                dati: { commesse, dipendenti, oreLavorate, fornitori }
            };

            const json = JSON.stringify(backup, null, 2);
            const blob = new Blob([json], { type: "application/json" });
            
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = `backup_union14_${new Date().toISOString().split('T')[0]}.json`;
            link.click();
            URL.revokeObjectURL(link.href);

            localStorage.setItem('ultimoBackup', JSON.stringify({
                data: new Date().toISOString(),
                utente: stateManager.currentUser?.email
            }));

            this.aggiornaInfoUltimoBackup();
            NotificationService.success('Backup completato con successo!');

        } catch (error) {
            console.error('Errore backup:', error);
            NotificationService.error('Errore durante il backup');
        }
    }

    async ripristinaDaBackup(file) {
        if (!file) return;

        try {
            const text = await file.text();
            const backup = JSON.parse(text);

            if (!backup.dati || !backup.dati.commesse) {
                NotificationService.error('File backup non valido');
                return;
            }

            const confirmMsg = `⚠️ ATTENZIONE: Questa operazione SOSTITUIRÀ tutti i dati esistenti!\n\n` +
                `Backup del: ${new Date(backup.metadata.dataGenerazione).toLocaleString('it-IT')}\n` +
                `Commesse: ${backup.dati.commesse.length}\n` +
                `Dipendenti: ${backup.dati.dipendenti.length}\n` +
                `Ore lavorate: ${backup.dati.oreLavorate.length}\n` +
                `Fornitori: ${backup.dati.fornitori?.length || 0}\n\n` +
                `Sei sicuro di voler procedere?`;

            if (!confirm(confirmMsg)) return;

            NotificationService.info('Ripristino in corso...');

            const collezioni = ['commesse', 'dipendenti', 'oreLavorate', 'fornitoriLavorazioni'];
            for (const coll of collezioni) {
                const docs = await this.firebaseService.getCollection(coll);
                for (const doc of docs) {
                    await this.firebaseService.deleteDocument(coll, doc.id);
                }
            }

            for (const commessa of backup.dati.commesse) {
                delete commessa.id;
                await this.firebaseService.addDocument("commesse", commessa);
            }
            for (const dip of backup.dati.dipendenti) {
                delete dip.id;
                await this.firebaseService.addDocument("dipendenti", dip);
            }
            for (const ore of backup.dati.oreLavorate) {
                delete ore.id;
                await this.firebaseService.addDocument("oreLavorate", ore);
            }
            if (backup.dati.fornitori) {
                for (const f of backup.dati.fornitori) {
                    delete f.id;
                    await this.firebaseService.addDocument("fornitoriLavorazioni", f);
                }
            }

            stateManager.clearCache();
            await Promise.all([
                this.aggiornaTabellaCommesse(),
                this.aggiornaTabellaDipendenti(),
                this.aggiornaTabellaOreLavorate(),
                this.caricaFornitori(),
                this.aggiornaMonitorCommesse(),
                this.creaGraficiDashboard()
            ]);

            NotificationService.success('Ripristino completato con successo!');

        } catch (error) {
            console.error('Errore ripristino:', error);
            NotificationService.error('Errore durante il ripristino: ' + error.message);
        }
    }

    aggiornaInfoUltimoBackup() {
        const infoDiv = document.getElementById('infoUltimoBackup');
        if (!infoDiv) return;

        const ultimo = localStorage.getItem('ultimoBackup');
        if (ultimo) {
            const data = JSON.parse(ultimo);
            infoDiv.innerHTML = `<i class="fas fa-history"></i> Ultimo backup: ${new Date(data.data).toLocaleString('it-IT')} - ${data.utente}`;
        } else {
            infoDiv.innerHTML = '<i class="fas fa-clock"></i> Nessun backup precedente trovato';
        }
    }

    // ============================================================
    // 7.22 PDF
    // ============================================================

    async generaPDFFiltrato() {
        try {
            if (typeof window.jspdf === 'undefined') {
                await this.caricaLibreriePDF();
            }

            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                NotificationService.error('Librerie PDF non disponibili');
                return;
            }

            let dati = stateManager.datiFiltrati;
            if (!dati || dati.length === 0) {
                const filtri = this.getFiltriOreAttivi();
                dati = await this.firebaseService.getOreLavorateFiltrate(filtri);
            }

            if (!dati || dati.length === 0) {
                NotificationService.warning('Nessun dato da esportare');
                return;
            }

            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            
            doc.setFontSize(18);
            doc.text('Report Ore Lavorate', 14, 20);
            doc.setFontSize(10);
            doc.text(`Generato il: ${new Date().toLocaleString('it-IT')}`, 14, 28);
            doc.text(`Record: ${dati.length}`, 14, 34);

            doc.autoTable({
                startY: 40,
                head: [['Commessa', 'Dipendente', 'Data', 'Inizio', 'Fine', 'Descrizione', 'Ore', 'NC']],
                body: dati.map(ore => [
                    ore.commessa,
                    `${ore.nomeDipendente} ${ore.cognomeDipendente}`,
                    ore.data,
                    ore.oraInizio,
                    ore.oraFine,
                    ore.descrizione || '-',
                    Utils.formattaOreDecimali(Utils.calcolaOreLavorate(ore.oraInizio, ore.oraFine)),
                    ore.nonConformita ? 'Sì' : 'No'
                ]),
                theme: 'grid',
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [37, 99, 235], textColor: 255 }
            });

            const totale = this.calcolaTotaleGenerale(dati);
            doc.setFontSize(12);
            doc.text(`Totale ore: ${Utils.formattaOreDecimali(totale)}`, 14, doc.lastAutoTable.finalY + 10);

            doc.save(`ore_lavorate_${new Date().toISOString().split('T')[0]}.pdf`);
            NotificationService.success('PDF generato con successo!');

        } catch (error) {
            console.error('Errore PDF:', error);
            NotificationService.error('Errore durante la generazione PDF');
        }
    }

    async generaPDFRubricaDipendenti() {
        try {
            if (typeof window.jspdf === 'undefined') {
                await this.caricaLibreriePDF();
            }

            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                NotificationService.error('Librerie PDF non disponibili');
                return;
            }

            const dipendenti = await this.firebaseService.getCollection("dipendenti");
            if (!dipendenti || dipendenti.length === 0) {
                NotificationService.warning('Nessun dipendente trovato');
                return;
            }

            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            
            doc.setFontSize(20);
            doc.setTextColor(37, 99, 235);
            doc.text('RUBRICA DIPENDENTI', 105, 20, { align: 'center' });
            doc.setFontSize(10);
            doc.setTextColor(100, 100, 100);
            doc.text(`Generato il: ${new Date().toLocaleString('it-IT')}`, 105, 28, { align: 'center' });
            doc.text(`Totale: ${dipendenti.length} dipendenti`, 105, 34, { align: 'center' });

            const tableData = dipendenti.map(d => [
                `${d.nome} ${d.cognome}`,
                d.email,
                d.ruolo || 'dipendente'
            ]);

            doc.autoTable({
                startY: 40,
                head: [['Nome Completo', 'Email', 'Ruolo']],
                body: tableData,
                theme: 'grid',
                styles: { fontSize: 9, cellPadding: 4 },
                headStyles: { fillColor: [37, 99, 235], textColor: 255 }
            });

            doc.save(`rubrica_dipendenti_${new Date().toISOString().split('T')[0]}.pdf`);
            NotificationService.success('PDF rubrica generato con successo!');

        } catch (error) {
            console.error('Errore PDF rubrica:', error);
            NotificationService.error('Errore durante la generazione PDF');
        }
    }

   async generaPDFMonitoraggio() {
    try {
        if (typeof window.jspdf === 'undefined') {
            await this.caricaLibreriePDF();
        }

        const { jsPDF } = window.jspdf;
        if (!jsPDF) {
            NotificationService.error('Librerie PDF non disponibili');
            return;
        }

        // 🔥 1. RECUPERA I DATI CON GLI STESSI FILTRI DEL MONITORAGGIO
        const [commesse, tutteLeOre] = await Promise.all([
            this.firebaseService.getCollection("commesse"),
            this.firebaseService.getCollection("oreLavorate")
        ]);

        // 🔥 2. APPLICA GLI STESSI FILTRI DELLA TABELLA
        const filtroNome = document.getElementById('filtroNomeCommessa')?.value?.trim() || '';
        const filtroStato = document.getElementById('filtroCommessaMonitor')?.value || '';
        const filtroAnno = document.getElementById('filtroAnnoMonitor')?.value || '';
        const filtroMese = document.getElementById('filtroMeseMonitor')?.value || '';
        const filtroFatturato = document.getElementById('filtroFatturato')?.value || '';

        let commesseFiltrate = commesse.filter(c => c && c.nomeCommessa);

        // Filtro nome
        if (filtroNome) {
            const f = filtroNome.toLowerCase();
            commesseFiltrate = commesseFiltrate.filter(c => 
                c.nomeCommessa.toLowerCase().includes(f)
            );
        }

        // Filtro stato
        if (filtroStato === 'attive') {
            commesseFiltrate = commesseFiltrate.filter(c => c.stato === 'attiva' || !c.stato);
        } else if (filtroStato === 'concluse') {
            commesseFiltrate = commesseFiltrate.filter(c => c.stato === 'conclusa');
        }

        // Filtro anno
        if (filtroAnno) {
            commesseFiltrate = commesseFiltrate.filter(c => {
                const data = c.dataInizio || c.dataCreazione;
                return data && data.split('-')[0] === filtroAnno;
            });
        }

        // Filtro mese
        if (filtroMese) {
            commesseFiltrate = commesseFiltrate.filter(c => {
                const data = c.dataInizio || c.dataCreazione;
                return data && data.split('-')[1] === filtroMese;
            });
        }

        // Filtro fatturato
        if (filtroFatturato) {
            commesseFiltrate = commesseFiltrate.filter(c => 
                (c.fatturato || 'da_fatturare') === filtroFatturato
            );
        }

        if (commesseFiltrate.length === 0) {
            NotificationService.warning('Nessuna commessa trovata con i filtri selezionati');
            return;
        }

        // 🔥 3. CALCOLA LE STATISTICHE PER LE COMMESSE FILTRATE
        const fornitori = stateManager.datiTotali.fornitori || [];
        const tableData = [];

        for (const c of commesseFiltrate) {
            const stats = this.calcolaStatisticheCommessa(c, tutteLeOre, fornitori);
            tableData.push([
                c.nomeCommessa,
                `€${stats.valorePreventivo.toFixed(2)}`,
                Utils.formattaOreDecimali(stats.oreLavorateTotali),
                Utils.formattaOreDecimali(stats.oreNonConformita),
                stats.hasIntegrazione ? `+${Utils.formattaOreDecimali(stats.oreIntegrazione)}` : '-',
                `€${stats.costoDipendenti.toFixed(2)}`,
                stats.hasFornitori ? `€${stats.costiFornitori.toFixed(2)}` : '-',
                `€${stats.costoTotale.toFixed(2)}`,
                `${stats.marginePercentuale.toFixed(1)}%`,
                c.stato === 'attiva' ? 'ATTIVA' : 'CONCLUSA'
            ]);
        }

        // 🔥 4. CREA IL PDF
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        // Intestazione
        doc.setFillColor(37, 99, 235);
        doc.rect(0, 0, 297, 30, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.text('MONITORAGGIO COMMESSE - DATI FILTRATI', 148, 16, { align: 'center' });
        doc.setFontSize(10);
        doc.text(`Generato il: ${new Date().toLocaleString('it-IT')}`, 148, 24, { align: 'center' });
        doc.setTextColor(0, 0, 0);

        // Info filtri
        let filtroInfo = '';
        const filtriAttivi = [];
        if (filtroNome) filtriAttivi.push(`Commessa: "${filtroNome}"`);
        if (filtroStato) filtriAttivi.push(`Stato: ${filtroStato === 'attive' ? 'Attive' : 'Concluse'}`);
        if (filtroAnno) filtriAttivi.push(`Anno: ${filtroAnno}`);
        if (filtroMese) {
            const mesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                         'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
            filtriAttivi.push(`Mese: ${mesi[parseInt(filtroMese) - 1]}`);
        }
        if (filtroFatturato) {
            filtriAttivi.push(`Fatturato: ${filtroFatturato === 'fatturato' ? 'Fatturato' : 'Da fatturare'}`);
        }

        if (filtriAttivi.length > 0) {
            doc.setFontSize(9);
            doc.setTextColor(100, 100, 100);
            doc.text(`Filtri: ${filtriAttivi.join(' • ')}`, 14, 38);
        }

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.text(`Record: ${tableData.length} commesse`, 14, 45);

        // Tabella
        doc.autoTable({
            startY: 50,
            head: [['Commessa', 'Preventivo', 'Ore Lav', 'Ore NC', 'Integr.', 'Costo Dip.', 'Costo Forn.', 'Costo Tot.', 'Margine %', 'Stato']],
            body: tableData,
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { fillColor: [37, 99, 235], textColor: 255 },
            columnStyles: {
                0: { cellWidth: 30 },
                1: { cellWidth: 20, halign: 'right' },
                2: { cellWidth: 18, halign: 'center' },
                3: { cellWidth: 18, halign: 'center' },
                4: { cellWidth: 16, halign: 'center' },
                5: { cellWidth: 22, halign: 'right' },
                6: { cellWidth: 22, halign: 'right' },
                7: { cellWidth: 22, halign: 'right' },
                8: { cellWidth: 20, halign: 'right' },
                9: { cellWidth: 18, halign: 'center' }
            }
        });

        // Riepilogo
        const finalY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(10);
        doc.text(`📊 Riepilogo (${tableData.length} commesse)`, 14, finalY);

        // Salva
        const nomeFile = `monitoraggio_filtrato_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(nomeFile);
        
        NotificationService.success(`PDF generato con ${tableData.length} commesse filtrate!`);

    } catch (error) {
        console.error('❌ Errore PDF monitoraggio:', error);
        NotificationService.error('Errore durante la generazione PDF: ' + error.message);
    }
}

    async testGenerazionePDF() {
        try {
            if (typeof window.jspdf === 'undefined') {
                await this.caricaLibreriePDF();
            }

            const { jsPDF } = window.jspdf;
            if (!jsPDF) {
                NotificationService.error('jsPDF non disponibile');
                return;
            }

            const doc = new jsPDF();
            doc.text('Test PDF - ' + new Date().toLocaleString(), 20, 20);
            doc.text('Se vedi questo, le librerie PDF funzionano!', 20, 30);
            doc.save('test_pdf.pdf');
            
            NotificationService.success('Test PDF completato con successo!');
        } catch (error) {
            console.error('Errore test PDF:', error);
            NotificationService.error('Errore nel test PDF');
        }
    }

    async caricaLibreriePDF() {
        return new Promise((resolve) => {
            if (typeof window.jspdf !== 'undefined' && window.jspdf.jsPDF) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            script.onload = () => {
                setTimeout(() => {
                    const autoScript = document.createElement('script');
                    autoScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js';
                    autoScript.onload = resolve;
                    autoScript.onerror = resolve;
                    document.head.appendChild(autoScript);
                }, 100);
            };
            script.onerror = resolve;
            document.head.appendChild(script);
        });
    }
    // Aggiungi alla classe OreLavorateApp (prima dell'ultima parentesi graffa)

// Metodo per forzare il refresh di tutte le tabelle
refreshTutteLeTabelle() {
    console.log('🔄 Refresh forzato di tutte le tabelle...');
    
    // Forza il refresh delle paginazioni
    if (this.paginazione.ore) {
        this.paginazione.ore.aggiornaDati(stateManager.datiTotali.oreLavorate || []);
    }
    if (this.paginazione.commesse) {
        this.paginazione.commesse.aggiornaDati(stateManager.datiTotali.commesse || []);
    }
    if (this.paginazione.dipendenti) {
        this.paginazione.dipendenti.aggiornaDati(stateManager.datiTotali.dipendenti || []);
    }
    if (this.paginazione.fornitori) {
        this.paginazione.fornitori.aggiornaDati(stateManager.datiTotali.fornitori || []);
    }
    
    // Ricarica tutte le tabelle
    this.aggiornaTabellaOreLavorate(stateManager.datiFiltrati);
    this.aggiornaTabellaCommesse();
    this.aggiornaTabellaDipendenti();
    this.aggiornaTabellaFornitori();
    
    console.log('✅ Refresh completato');
}

/**
 * Ottiene i colori del tema corrente per i grafici
 */
getChartThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    
    return {
        textColor: isDark ? '#e8edf5' : '#0f172a',
        gridColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
        background: isDark ? '#1a2234' : '#ffffff'
    };
}

// Metodo per diagnosticare lo stato delle paginazioni
diagnosticaPaginazioni() {
    console.log('=== DIAGNOSTICA PAGINAZIONI ===');
    console.log('Stato Manager:', {
        currentUser: stateManager.currentUser?.ruolo || 'nessuno',
        datiTotali: {
            oreLavorate: stateManager.datiTotali.oreLavorate?.length || 0,
            commesse: stateManager.datiTotali.commesse?.length || 0,
            dipendenti: stateManager.datiTotali.dipendenti?.length || 0,
            fornitori: stateManager.datiTotali.fornitori?.length || 0
        }
    });
    
    const paginazioni = ['ore', 'commesse', 'dipendenti', 'fornitori'];
    paginazioni.forEach(nome => {
        const pag = this.paginazione[nome];
        if (pag) {
            const containerEsiste = pag.container !== null && pag.container !== undefined;
            console.log(`📊 ${nome}:`, {
                container: containerEsiste ? '✅' : '❌',
                containerId: pag.containerId,
                totale: pag.datiTotali?.length || 0,
                pagina: pag.paginaCorrente || 1,
                perPagina: pag.righePerPagina || 10,
                visibile: pag.container?.style?.display || 'N/A'
            });
        } else {
            console.log(`❌ ${nome}: NON INIZIALIZZATA`);
        }
    });
    
    // Verifica container HTML
    console.log('🔍 Container HTML:');
    ['paginationOre', 'paginationCommesse', 'paginationDipendenti', 'paginationFornitori'].forEach(id => {
        const el = document.getElementById(id);
        console.log(`  ${id}: ${el ? '✅' : '❌'}`);
    });
    
    console.log('✅ Diagnostica completata');
}
}

// ============================================================
// 8. INIZIALIZZAZIONE APP
// ============================================================

let app;

document.addEventListener('DOMContentLoaded', () => {
    app = new OreLavorateApp();
    window.app = app;
});

// ============================================================
// 9. ANIMAZIONI CSS PER NOTIFICHE
// ============================================================

const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    .notification-toast {
        animation: slideInRight 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }
`;
document.head.appendChild(style);
window.stateManager = stateManager;
console.log('✅ Union14 App v2.0 caricata con successo!');
