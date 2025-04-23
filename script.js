import { initializeApp } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js";
import { 
   
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc,
    getDoc // Aggiungi questa funzione
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-analytics.js"; // Aggiungi questa riga

// Configurazione di Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAZS2BAvXgClkD6KF87M_OAIHL_vNwa2wQ",
    authDomain: "orecommeseu14.firebaseapp.com",
    projectId: "orecommeseu14",
    storageBucket: "orecommeseu14.firebasestorage.app",
    messagingSenderId: "693874640353",
    appId: "1:693874640353:web:f8626c1a7d568242abfea0",
    measurementId: "G-6XT4G34CQJ"
  };

// Inizializza Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// jsPDF
const { jsPDF } = window.jspdf;

// Variabili globali
const mesi = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];
let datiOreLavorate = []; // Memorizza i dati delle ore lavorate
let paginaCorrenteDipendenti = 1;
const righePerPaginaDipendenti = 5; // Numero di righe per pagina
let datiTotaliDipendenti = []; // Memorizza tutti i dati della tabella dipendenti
let paginaCorrenteCommesse = 1;
const righePerPaginaCommesse = 5; // Numero di righe per pagina
let datiTotaliCommesse = []; // Memorizza tutti i dati della tabella commesse
let paginaCorrente = 1;
const righePerPagina = 5; // Numero di righe per pagina
let datiTotali = []; // Memorizza tutti i dati della tabella
let datiFiltrati = null; // Variabile globale per memorizzare i dati filtrati
let currentUser = null;
const ADMIN_CREDENTIALS = {
  email: 'eliraoui.a@union14.it',
  password: 'Eliraoui0101!',
  ruolo: 'admin'
};

// Funzione per gestire il login
async function gestisciLogin() {
  const email = document.getElementById('inputEmail').value.trim();
  const password = document.getElementById('inputPassword').value.trim();

  if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
    currentUser = {
      ruolo: 'admin',
      name: 'Amministratore Sistema'
    };
    mostraApplicazione();
    return;
  }

  const querySnapshot = await getDocs(collection(db, "dipendenti"));
  const dipendente = querySnapshot.docs.find(doc => doc.data().email === email && doc.data().password === password);

  if (dipendente) {
    if (dipendente.data().ruolo === "dipendente") {
      currentUser = {
        ruolo: 'dipendente',
        name: `${dipendente.data().nome} ${dipendente.data().cognome}`
      };
      mostraApplicazione();
    } else {
      alert('Il tuo account non ha i privilegi necessari!');
    }
  } else {
    alert('Credenziali non valide!');
  }

  // Pulisci i campi del form
  document.getElementById('inputEmail').value = "";
  document.getElementById('inputPassword').value = "";
}

// Funzione per gestire il logout
function logout() {
  currentUser = null;
  window.location.href = 'index.html';
}
document.getElementById('btnScaricaPDF').addEventListener('click', function (e) {
  e.preventDefault();

  // Recupera i dati filtrati dalla tabella corrente
  const righe = document.querySelectorAll('#orelavorateTable tbody tr');
  const oreFiltrate = Array.from(righe).map(riga => {
      return {
          commessa: riga.cells[0].textContent,
          nomeDipendente: riga.cells[1].textContent.split(' ')[0],
          cognomeDipendente: riga.cells[1].textContent.split(' ')[1],
          data: riga.cells[2].textContent,
          oraInizio: riga.cells[3].textContent,
          oraFine: riga.cells[4].textContent,
          descrizione: riga.cells[5].textContent
      };
  });

  console.log("Dati filtrati passati a generaPDFFiltrato:", oreFiltrate); // Debug
  generaPDFFiltrato(oreFiltrate);
});

async function generaPDFFiltrato() {
  try {
    // Usa i dati filtrati memorizzati nella variabile globale
    const oreFiltrate = datiFiltrati || await getDocs(collection(db, "oreLavorate")).then(querySnapshot => 
      querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
    );

    // Filtra ulteriormente per non conformità se il filtro è attivo
    const filtroNonConformita = document.getElementById('filtroNonConformita').checked;
    const oreNonConformita = filtroNonConformita ? 
      oreFiltrate.filter(ore => ore.nonConformita) : oreFiltrate;

    // Calcola le ore per dipendente e le ore totali
    const orePerDipendente = {};
    let oreTotali = 0;

    oreNonConformita.forEach(ore => {
      const oreLavorate = calcolaOreLavorate(ore.oraInizio, ore.oraFine);
      const dipendenteKey = `${ore.nomeDipendente} ${ore.cognomeDipendente}`;

      if (!orePerDipendente[dipendenteKey]) {
        orePerDipendente[dipendenteKey] = 0;
      }
      orePerDipendente[dipendenteKey] += oreLavorate;
      oreTotali += oreLavorate;
    });

    // Crea il PDF
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    doc.setFontSize(18);
    doc.text("Report Ore Lavorate Filtrate ", 14, 20);

    // Aggiungi la tabella delle ore lavorate
    doc.autoTable({
      startY: 25,
      head: [['Commessa', 'Dipendente', 'Data', 'Ora Inizio', 'Ora Fine', 'Descrizione', 'Ore Lavorate', 'Non Conformità']],  
      body: oreNonConformita.map(ore => [
        ore.commessa,
        `${ore.nomeDipendente} ${ore.cognomeDipendente}`,
        ore.data,
        ore.oraInizio,
        ore.oraFine,
        ore.descrizione,
        formattaOreDecimali(calcolaOreLavorate(ore.oraInizio, ore.oraFine)), // Formatta in HH:MM
        ore.nonConformita ? 'Sì' : 'No'
      ]),
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255 },
      margin: { top: 20 }
    });

    // Aggiungi una sezione per le ore per dipendente
    const startYDipendenti = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.text("Ore Lavorate per Dipendente", 14, startYDipendenti);

    doc.autoTable({
      startY: startYDipendenti + 5,
      head: [['Dipendente', 'Ore Lavorate']],
      body: Object.entries(orePerDipendente).map(([dipendente, ore]) => [
        dipendente,
        formattaOreDecimali(ore) // Formatta in HH:MM
      ]),
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [41, 128, 185], textColor: 255 }
    });

    // Aggiungi una sezione per le ore totali
    const startYTotali = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.text("Ore Totali Lavorate", 14, startYTotali);
    doc.text(`Totale: ${formattaOreDecimali(oreTotali)}`, 14, startYTotali + 10); // Formatta in HH:MM

    // Salva il PDF
    doc.save('ore_lavorate_non_conformita_filtrate.pdf');
  } catch (error) {
    console.error("Errore durante la generazione del PDF:", error);
    alert("Si è verificato un errore durante la generazione del PDF.");
  }
}
// Popola dinamicamente i giorni quando cambia il mese
document.getElementById('filtroMese').addEventListener('change', function() {
  const mese = this.value;
  const giornoSelect = document.getElementById('filtroGiorno');
  
  // Svuota le opzioni esistenti
  giornoSelect.innerHTML = '<option value="">Tutti i giorni</option>';
  
  if (mese) {
    // Determina quanti giorni ha il mese selezionato
    const anno = new Date().getFullYear();
    const giorniNelMese = new Date(anno, mese, 0).getDate();
    
    // Aggiungi i giorni
    for (let i = 1; i <= giorniNelMese; i++) {
      const option = document.createElement('option');
      option.value = i < 10 ? `0${i}` : `${i}`;
      option.textContent = i;
      giornoSelect.appendChild(option);
    }
  }
});
// Popola gli anni disponibili (es. ultimi 5 anni e prossimi 2)
function popolaAnni() {
  const annoSelect = document.getElementById('filtroAnno');
  const annoCorrente = new Date().getFullYear();
  
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

// Chiamata all'inizializzazione
document.addEventListener('DOMContentLoaded', popolaAnni);
document.getElementById('filtroAnno').addEventListener('change', aggiornaGiorni);
document.getElementById('filtroMese').addEventListener('change', aggiornaGiorni);

function aggiornaGiorni() {
  const mese = document.getElementById('filtroMese').value;
  const anno = document.getElementById('filtroAnno').value;
  const giornoSelect = document.getElementById('filtroGiorno');
  
  giornoSelect.innerHTML = '<option value="">Tutti i giorni</option>';
  
  if (mese && anno) {
    // Calcola i giorni effettivi del mese/anno (considera anche anni bisestili)
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
// Funzione per mostrare l'applicazione
async function mostraApplicazione() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appContent').style.display = 'block';

  // Nascondi tutte le sezioni
  document.querySelectorAll('.admin-only, .dipendente-only').forEach(el => el.style.display = 'none');

  // Mostra solo la sezione delle ore lavorate se l'utente è un dipendente
  if (currentUser && currentUser.ruolo === 'dipendente') {
      document.querySelectorAll('.dipendente-only').forEach(el => el.style.display = 'block');
  }

  // Mostra le sezioni admin se l'utente è un amministratore
  if (currentUser && currentUser.ruolo === 'admin') {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
  }
// Nascondi le tabelle mensili al login
document.getElementById('tabelleMensili').style.display = 'none';
// Aggiorna le tabelle con filtro mese corrente per admin
if (currentUser && currentUser.ruolo === 'admin') {
  const oggi = new Date();
  const meseCorrente = oggi.getMonth() + 1;
  const annoCorrente = oggi.getFullYear();
  const meseStringa = `${annoCorrente}-${String(meseCorrente).padStart(2, '0')}`;
  
  const querySnapshot = await getDocs(collection(db, "oreLavorate"));
  const datiMeseCorrente = querySnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(ore => ore.data.startsWith(meseStringa));
  
  await aggiornaTabellaOreLavorate(datiMeseCorrente);
} else {
  await aggiornaTabellaOreLavorate();
}
if (currentUser && currentUser.ruolo === 'admin') {
  const oggi = new Date();
  const annoCorrente = oggi.getFullYear().toString();
  const meseCorrente = String(oggi.getMonth() + 1).padStart(2, '0');
  const giornoCorrente = String(oggi.getDate()).padStart(2, '0');
  
  // Imposta i filtri
  document.getElementById('filtroAnno').value = annoCorrente;
  document.getElementById('filtroMese').value = meseCorrente;
  
  // Trigger per popolare i giorni
  aggiornaGiorni();
  
  // Imposta il giorno dopo un breve delay
  setTimeout(() => {
    document.getElementById('filtroGiorno').value = giornoCorrente;
    applicaFiltri();
  }, 100);
} else {
  await aggiornaTabellaOreLavorate();
}

  // Aggiorna le tabelle
  await aggiornaMenuCommesse();
  await aggiornaTabellaOreLavorate(); // Chiamata senza parametri
  await aggiornaTabellaCommesse();
  await aggiornaTabellaDipendenti();

  // Aggiungi messaggio benvenuto
  const benvenuto = document.createElement('div');
  benvenuto.textContent = `Benvenuto, ${currentUser ? currentUser.name : 'Utente'}!`;
  benvenuto.style.marginBottom = '20px';
  benvenuto.style.fontSize = '18px';
  document.getElementById('appContent').prepend(benvenuto);
}

// Funzione per aggiornare il menu delle commesse
async function aggiornaMenuCommesse() {
  const select = document.getElementById('oreCommessa');
  
  // Mantieni solo l'opzione di default
  select.innerHTML = '<option value="">Seleziona una commessa</option>';

  try {
    const querySnapshot = await getDocs(collection(db, "commesse"));
    querySnapshot.forEach(doc => {
      const commessa = doc.data();
      const option = document.createElement('option');
      option.value = commessa.nomeCommessa;
      option.textContent = commessa.nomeCommessa;
      select.appendChild(option);
    });
  } catch (error) {
    console.error("Errore nel caricamento delle commesse:", error);
    alert("Errore nel caricamento delle commesse disponibili");
  }
}
async function getUltimaLavorazioneGiornata(data) {
  const querySnapshot = await getDocs(collection(db, "oreLavorate"));
  const lavorazioni = querySnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(ore => ore.data === data && ore.nomeDipendente === currentUser.name.split(" ")[0]);
  
  if (lavorazioni.length === 0) return null;
  
  // Ordina per ora di fine (decrescente)
  lavorazioni.sort((a, b) => {
    return b.oraFine.localeCompare(a.oraFine);
  });
  
  return lavorazioni[0];
}

// Funzione per aggiornare la tabella dei dipendenti
async function aggiornaTabellaDipendenti() {
  const tbody = document.querySelector('#dipendentiTable tbody');
  tbody.innerHTML = '';

  // Carica tutti i dati se non sono già stati caricati
  if (datiTotaliDipendenti.length === 0) {
    const querySnapshot = await getDocs(collection(db, "dipendenti"));
    datiTotaliDipendenti = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  // Calcola l'indice di inizio e fine per la pagina corrente
  const inizio = (paginaCorrenteDipendenti - 1) * righePerPaginaDipendenti;
  const fine = inizio + righePerPaginaDipendenti;
  const datiPagina = datiTotaliDipendenti.slice(inizio, fine); // Filtra i dati per la pagina corrente

  // Aggiungi le righe dei dipendenti
  datiPagina.forEach(dipendente => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${dipendente.nome}</td>
      <td>${dipendente.cognome}</td>
      <td>${dipendente.email}</td>
      <td>${dipendente.password}</td>
      <td>${dipendente.ruolo}</td>
      <td>
        <button class="btnModificaDipendente" data-id="${dipendente.id}">Modifica</button>
        <button class="btnEliminaDipendente" data-id="${dipendente.id}">Elimina</button>
      </td>
    `;
    tbody.appendChild(row);

    // Collega gli event listener ai pulsanti
    row.querySelector('.btnModificaDipendente').addEventListener('click', () => modificaDipendente(dipendente.id));
    row.querySelector('.btnEliminaDipendente').addEventListener('click', () => eliminaDipendente(dipendente.id));
  });

  // Aggiorna la paginazione
  aggiornaPaginazioneDipendenti(datiTotaliDipendenti.length);
}
function aggiornaPaginazioneDipendenti(numeroTotaleRighe) {
  const numeroPagine = Math.ceil(numeroTotaleRighe / righePerPaginaDipendenti);
  const numeriPagina = document.getElementById('numeriPaginaDipendenti');
  numeriPagina.innerHTML = '';

  // Aggiungi i numeri di pagina
  for (let i = 1; i <= numeroPagine; i++) {
    const btnPagina = document.createElement('button');
    btnPagina.textContent = i;
    btnPagina.addEventListener('click', () => {
      paginaCorrenteDipendenti = i;
      aggiornaTabellaDipendenti();
    });
    numeriPagina.appendChild(btnPagina);
  }

  // Disabilita i pulsanti "Precedente" e "Successiva" quando necessario
  document.getElementById('btnPrecedenteDipendenti').disabled = paginaCorrenteDipendenti === 1;
  document.getElementById('btnSuccessivaDipendenti').disabled = paginaCorrenteDipendenti === numeroPagine;
}
document.getElementById('btnPrecedenteDipendenti').addEventListener('click', () => {
  if (paginaCorrenteDipendenti > 1) {
    paginaCorrenteDipendenti--;
    aggiornaTabellaDipendenti();
  }
});

document.getElementById('btnSuccessivaDipendenti').addEventListener('click', () => {
  const numeroPagine = Math.ceil(datiTotaliDipendenti.length / righePerPaginaDipendenti);
  if (paginaCorrenteDipendenti < numeroPagine) {
    paginaCorrenteDipendenti++;
    aggiornaTabellaDipendenti();
  }
});
// Funzione per aggiungere un dipendente
async function aggiungiDipendente(nome, cognome, email, password, ruolo) {
  try {
    await addDoc(collection(db, "dipendenti"), {
      nome: nome,
      cognome: cognome,
      email: email,
      password: password,
      ruolo: ruolo
    });
      alert("Dati salvati con successo!");
    aggiornaTabellaDipendenti();
  } catch (error) {
    console.error("Errore durante l'aggiunta del dipendente: ", error);
  }
}

// Funzione per modificare un dipendente
async function modificaDipendente(id) {
  try {
      // Recupera i dati correnti del dipendente
      const docRef = doc(db, "dipendenti", id);
      const docSnap = await getDoc(docRef);
      const dipendente = docSnap.data();

      // Mostra i dati correnti nei prompt
      const nuovoNome = prompt("Inserisci il nuovo nome:", dipendente.nome);
      const nuovoCognome = prompt("Inserisci il nuovo cognome:", dipendente.cognome);
      const nuovaEmail = prompt("Inserisci la nuova email:", dipendente.email);
      const nuovaPassword = prompt("Inserisci la nuova password:", dipendente.password);
      const nuovoRuolo = prompt("Inserisci il nuovo ruolo:", dipendente.ruolo);

      if (nuovoNome && nuovoCognome && nuovaEmail && nuovaPassword && nuovoRuolo) {
          await updateDoc(docRef, {
              nome: nuovoNome,
              cognome: nuovoCognome,
              email: nuovaEmail,
              password: nuovaPassword,
              ruolo: nuovoRuolo
          });
          alert("Dati salvati con successo!");
          aggiornaTabellaDipendenti();
      }
  } catch (error) {
      console.error("Errore durante la modifica del dipendente:", error);
  }
}
// Funzione per eliminare un dipendente
async function eliminaDipendente(id) {
  if (confirm("Sei sicuro di voler eliminare questo dipendente?")) {
    try {
      await deleteDoc(doc(db, "dipendenti", id));
      aggiornaTabellaDipendenti();
    } catch (error) {
      console.error("Errore durante l'eliminazione del dipendente: ", error);
    }
  }
}


// Funzione per aggiornare la tabella delle commesse
async function aggiornaTabellaCommesse(filtro = '') {
  const tbody = document.querySelector('#commesseTable tbody');
  tbody.innerHTML = '';

  // Se non ci sono dati caricati o c'è un filtro, ricarica i dati
  if (datiTotaliCommesse.length === 0 || filtro) {
    const querySnapshot = await getDocs(collection(db, "commesse"));
    datiTotaliCommesse = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Applica il filtro se presente
    if (filtro) {
      const filtroLowerCase = filtro.toLowerCase();
      datiTotaliCommesse = datiTotaliCommesse.filter(commessa => 
        commessa.nomeCommessa.toLowerCase().includes(filtroLowerCase) ||
        commessa.cliente.toLowerCase().includes(filtroLowerCase)
      );
    }
  }
  // Carica tutti i dati se non sono già stati caricati
  if (datiTotaliCommesse.length === 0) {
    const querySnapshot = await getDocs(collection(db, "commesse"));
    datiTotaliCommesse = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  // Calcola l'indice di inizio e fine per la pagina corrente
  const inizio = (paginaCorrenteCommesse - 1) * righePerPaginaCommesse;
  const fine = inizio + righePerPaginaCommesse;
  const datiPagina = datiTotaliCommesse.slice(inizio, fine); // Filtra i dati per la pagina corrente

  // Aggiungi le righe delle commesse
  datiPagina.forEach(commessa => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${commessa.nomeCommessa}</td>
      <td>${commessa.cliente}</td>
      <td>
        <button class="btnModificaCommessa" data-id="${commessa.id}">Modifica</button>
        <button class="btnEliminaCommessa" data-id="${commessa.id}">Elimina</button>
      </td>
    `;
    tbody.appendChild(row);

    // Collega gli event listener ai pulsanti
    row.querySelector('.btnModificaCommessa').addEventListener('click', () => modificaCommessa(commessa.id));
    row.querySelector('.btnEliminaCommessa').addEventListener('click', () => eliminaCommessa(commessa.id));
  });

  // Aggiorna la paginazione
  aggiornaPaginazioneCommesse(datiTotaliCommesse.length);
}
function aggiornaPaginazioneCommesse(numeroTotaleRighe) {
  const numeroPagine = Math.ceil(numeroTotaleRighe / righePerPaginaCommesse);
  const numeriPagina = document.getElementById('numeriPaginaCommesse');
  numeriPagina.innerHTML = '';

  // Aggiungi i numeri di pagina
  for (let i = 1; i <= numeroPagine; i++) {
    const btnPagina = document.createElement('button');
    btnPagina.textContent = i;
    btnPagina.addEventListener('click', () => {
      paginaCorrenteCommesse = i;
      aggiornaTabellaCommesse();
    });
    numeriPagina.appendChild(btnPagina);
  }

  // Disabilita i pulsanti "Precedente" e "Successiva" quando necessario
  document.getElementById('btnPrecedenteCommesse').disabled = paginaCorrenteCommesse === 1;
  document.getElementById('btnSuccessivaCommesse').disabled = paginaCorrenteCommesse === numeroPagine;
}
document.getElementById('btnPrecedenteCommesse').addEventListener('click', () => {
  if (paginaCorrenteCommesse > 1) {
    paginaCorrenteCommesse--;
    aggiornaTabellaCommesse();
  }
});

document.getElementById('btnSuccessivaCommesse').addEventListener('click', () => {
  const numeroPagine = Math.ceil(datiTotaliCommesse.length / righePerPaginaCommesse);
  if (paginaCorrenteCommesse < numeroPagine) {
    paginaCorrenteCommesse++;
    aggiornaTabellaCommesse();
  }
});
// Ricerca commesse
document.getElementById('btnCercaCommessa').addEventListener('click', () => {
  const filtro = document.getElementById('cercaCommessa').value.trim();
  paginaCorrenteCommesse = 1; // Resetta alla prima pagina
  aggiornaTabellaCommesse(filtro);
});

// Reset ricerca
document.getElementById('btnResetCercaCommessa').addEventListener('click', () => {
  document.getElementById('cercaCommessa').value = '';
  paginaCorrenteCommesse = 1;
  aggiornaTabellaCommesse(); // Senza filtro
});

// Ricerca al pressione di Enter
document.getElementById('cercaCommessa').addEventListener('keyup', (e) => {
  if (e.key === 'Enter') {
    const filtro = document.getElementById('cercaCommessa').value.trim();
    paginaCorrenteCommesse = 1;
    aggiornaTabellaCommesse(filtro);
  }
});

// Funzione per aggiungere una commessa
async function aggiungiCommessa(nomeCommessa, cliente) {
  try {
    await addDoc(collection(db, "commesse"), {
      nomeCommessa: nomeCommessa,
      cliente: cliente
    });
      alert("Dati salvati con successo!");
    aggiornaTabellaCommesse();
    aggiornaMenuCommesse();
  } catch (error) {
    console.error("Errore durante l'aggiunta della commessa: ", error);
  }
}

// Funzione per modificare una commessa
async function modificaCommessa(id) {
  try {
      // Recupera i dati correnti della commessa
      const docRef = doc(db, "commesse", id);
      const docSnap = await getDoc(docRef);
      const commessa = docSnap.data();

      // Mostra i dati correnti nei prompt
      const nuovoNomeCommessa = prompt("Inserisci il nuovo nome della commessa:", commessa.nomeCommessa);
      const nuovoCliente = prompt("Inserisci il nuovo cliente:", commessa.cliente);

      if (nuovoNomeCommessa && nuovoCliente) {
          await updateDoc(docRef, {
              nomeCommessa: nuovoNomeCommessa,
              cliente: nuovoCliente
          });
          alert("Dati salvati con successo!");
          aggiornaTabellaCommesse();
      }
  } catch (error) {
      console.error("Errore durante la modifica della commessa:", error);
  }
}

// Funzione per eliminare una commessa
async function eliminaCommessa(id) {
  if (confirm("Sei sicuro di voler eliminare questa commessa?")) {
    try {
      await deleteDoc(doc(db, "commesse", id));
      aggiornaTabellaCommesse();
      aggiornaMenuCommesse();
    } catch (error) {
      console.error("Errore durante l'eliminazione della commessa: ", error);
    }
  }
}

// Funzione per aggiornare la tabella delle ore lavorate
async function aggiornaTabellaOreLavorate(oreFiltrate = null) {
  // Ottieni la data corrente
  const oggi = new Date();
  const meseCorrente = oggi.getMonth() + 1; // 1-12
  const annoCorrente = oggi.getFullYear();
  const meseStringa = `${annoCorrente}-${String(meseCorrente).padStart(2, '0')}`;

  if (!oreFiltrate) {
    // Se non ci sono dati filtrati, carica tutti i dati
    const querySnapshot = await getDocs(collection(db, "oreLavorate"));
    oreFiltrate = querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      // Filtra solo il mese corrente se admin
      .filter(ore => {
        if (currentUser && currentUser.ruolo === 'admin') {
          return ore.data.startsWith(meseStringa);
        }
        return true;
      });
    }
  // Ordina i dati per data in ordine decrescente
  oreFiltrate.sort((a, b) => {
      const dataA = new Date(a.data);
      const dataB = new Date(b.data);
      return dataB - dataA; // Ordine decrescente
  });

  // Memorizza i dati totali per la paginazione
  datiTotali = oreFiltrate;

  const tbody = document.querySelector('#orelavorateTable tbody');
  tbody.innerHTML = '';

  // Verifica che oreFiltrate sia un array
  if (!Array.isArray(oreFiltrate)) {
      console.error("oreFiltrate non è un array:", oreFiltrate);
      return;
  }

  // Calcola l'indice di inizio e fine per la pagina corrente
  const inizio = (paginaCorrente - 1) * righePerPagina;
  const fine = inizio + righePerPagina;
  const datiPagina = oreFiltrate.slice(inizio, fine); // Usa oreFiltrate invece di dati

  // Aggiungi le righe delle ore lavorate
  datiPagina.forEach(ore => {
      const oreLavorate = calcolaOreLavorate(ore.oraInizio, ore.oraFine);
      const row = document.createElement('tr');
      row.innerHTML = `
          <td>${ore.commessa}</td>
          <td>${ore.nomeDipendente} ${ore.cognomeDipendente}</td>
          <td>${ore.data}</td>
          <td>${ore.oraInizio}</td>
          <td>${ore.oraFine}</td>
          <td>${ore.descrizione}</td>
          <td>${ore.nonConformita ? 'Sì' : 'No'}</td>
          <td>${formattaOreDecimali(oreLavorate)}</td> <!-- Formatta le ore -->
  <td>
              <button class="btnModificaOreLavorate" data-id="${ore.id}">Modifica</button>
              <button class="btnEliminaOreLavorate" data-id="${ore.id}">Elimina</button>
          </td>
      `;
      tbody.appendChild(row);

      // Collega gli event listener ai pulsanti
      row.querySelector('.btnModificaOreLavorate').addEventListener('click', () => modificaOreLavorate(ore.id));
      row.querySelector('.btnEliminaOreLavorate').addEventListener('click', () => eliminaOreLavorate(ore.id));
  });

  // Aggiungi una riga per i totali
  // Sostituisci questa parte nell'aggiornamento della tabella
const totalRow = document.createElement('tr');
const totaleOreDecimali = calcolaTotaleGenerale(oreFiltrate);
const totaleFormattato = convertiInOreFormattate(totaleOreDecimali); // "2:30"

totalRow.innerHTML = `
  <td colspan="7"><strong>Totale Generale</strong></td>
  <td><strong>${totaleFormattato} ore</strong></td> <!-- Mostra "2:30" -->
 
`;
tbody.appendChild(totalRow);

  // Aggiorna la paginazione
  aggiornaPaginazione(oreFiltrate.length);
}

function convertiInOreDecimali(oraFormattata) {
  if (!oraFormattata || !oraFormattata.includes(":")) return 0;
  
  const [ore, minuti] = oraFormattata.split(":").map(Number);
  return ore + (minuti / 60); // Esempio: "1:30" → 1.5
}

function convertiInOreFormattate(oreDecimali) {
  const ore = Math.floor(oreDecimali);
  const minuti = Math.round((oreDecimali - ore) * 60);
  return `${ore}:${String(minuti).padStart(2, '0')}`; // Esempio: 2.5 → "2:30"
}

function calcolaOreLavorate(oraInizio, oraFine) {
  // Verifica che gli orari siano nel formato corretto
  if (!oraInizio || !oraFine || !oraInizio.includes(":") || !oraFine.includes(":")) {
    console.error("Formato orario non valido. Usare 'HH:mm'");
    return 0;
  }

  // Divide ore e minuti
  const [inizioOre, inizioMinuti] = oraInizio.split(":").map(Number);
  const [fineOre, fineMinuti] = oraFine.split(":").map(Number);

  // Converte in minuti totali
  const totaleMinutiInizio = inizioOre * 60 + inizioMinuti;
  const totaleMinutiFine = fineOre * 60 + fineMinuti;

  // Calcola la differenza in minuti
  let differenzaMinuti = totaleMinutiFine - totaleMinutiInizio;

  // Se la differenza è negativa, significa che il lavoro è finito il giorno successivo
  if (differenzaMinuti < 0) {
    differenzaMinuti += 24 * 60; // Aggiungi 24 ore in minuti
  }

  // Converti i minuti in ore decimali (es. 1.5 per 1h30m)
  const oreDecimali = differenzaMinuti / 60;

  return oreDecimali;
}
function formattaOreDecimali(oreDecimali) {
  const ore = Math.floor(oreDecimali); // Parte intera (ore)
  const minuti = Math.round((oreDecimali - ore) * 60); // Parte decimale convertita in minuti
  return `${ore}:${String(minuti).padStart(2, '0')}`; // Formatta come HH:MM
}

// Esempio di utilizzo
const oreLavorate = calcolaOreLavorate("08:00", "09:30");
console.log(formattaOreDecimali(oreLavorate)); // "1:30"



//Funzione per aggiornare i pulsanti di paginazione
function aggiornaPaginazione(numeroTotaleRighe) {
  const numeroPagine = Math.ceil(numeroTotaleRighe / righePerPagina);
  const numeriPagina = document.getElementById('numeriPagina');
  numeriPagina.innerHTML = '';

  // Aggiungi i numeri di pagina
  for (let i = 1; i <= numeroPagine; i++) {
    const btnPagina = document.createElement('button');
    btnPagina.textContent = i;
    btnPagina.addEventListener('click', () => {
      paginaCorrente = i;
      aggiornaTabellaOreLavorate(datiTotali);
    });
    numeriPagina.appendChild(btnPagina);
  }

  // Disabilita i pulsanti "Precedente" e "Successiva" quando necessario
  document.getElementById('btnPrecedente').disabled = paginaCorrente === 1;
  document.getElementById('btnSuccessiva').disabled = paginaCorrente === numeroPagine;
}

// Gestione dei pulsanti "Precedente" e "Successiva"
document.getElementById('btnPrecedente').addEventListener('click', () => {
  if (paginaCorrente > 1) {
    paginaCorrente--;
    aggiornaTabellaOreLavorate(datiTotali);
  }
});

document.getElementById('btnSuccessiva').addEventListener('click', () => {
  const numeroPagine = Math.ceil(datiTotali.length / righePerPagina);
  if (paginaCorrente < numeroPagine) {
    paginaCorrente++;
    aggiornaTabellaOreLavorate(datiTotali);
  }
});


document.getElementById('btnMostraTutti').addEventListener('click', async () => {
  const querySnapshot = await getDocs(collection(db, "oreLavorate"));
  datiTotali = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  aggiornaTabellaOreLavorate(datiTotali);
});

// Funzione per aggiungere ore lavorate
async function aggiungiOreLavorate(commessa, nomeDipendente, cognomeDipendente, data, oraInizio, oraFine, descrizione, nonConformita) {
  try {
      // Verifica che gli orari siano validi
      if (!oraInizio || !oraFine || !oraInizio.includes(":") || !oraFine.includes(":")) {
          alert("Formato orario non valido. Usare 'HH:mm'");
          return;
      }

      // Aggiungi le ore lavorate al database
      await addDoc(collection(db, "oreLavorate"), {
          commessa: commessa,
          nomeDipendente: nomeDipendente,
          cognomeDipendente: cognomeDipendente,
          data: data,
          oraInizio: oraInizio,
          oraFine: oraFine,
          descrizione: descrizione,
          nonConformita: nonConformita
      });

      alert("Dati salvati con successo!");
      aggiornaTabellaOreLavorate();
  } catch (error) {
      console.error("Errore durante l'aggiunta delle ore lavorate: ", error);
      alert("Si è verificato un errore durante il salvataggio.");
  }
}
function arrotondaAlQuartoDora(ora) {
  const [ore, minuti] = ora.split(":").map(Number); // Dividi l'ora in ore e minuti
  const minutiArrotondati = Math.round(minuti / 15) * 15; // Arrotonda i minuti al quarto d'ora più vicino
  const oreFinali = ore + Math.floor(minutiArrotondati / 60); // Aggiungi le ore extra se i minuti superano 60
  const minutiFinali = minutiArrotondati % 60; // Calcola i minuti rimanenti

  // Formatta l'ora arrotondata come stringa "HH:mm"
  return `${String(oreFinali).padStart(2, "0")}:${String(minutiFinali).padStart(2, "0")}`;
}

// Funzione per modificare ore lavorate
async function modificaOreLavorate(id) {
  console.log("ID del documento da modificare:", id); // Debug

  if (!id || typeof id !== "string") {
    console.error("ID non valido:", id);
    return;
  }

  try {
    const docRef = doc(db, "oreLavorate", id);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.error("Documento non trovato per ID:", id);
      return;
    }

    const ore = docSnap.data();
    console.log("Dati correnti delle ore lavorate:", ore); // Debug


    // Mostra i dati correnti nei prompt
    const nuovaCommessa = prompt("Inserisci la nuova commessa:", ore.commessa); 
    const nuovoNomeDipendente = prompt("Inserisci il nuovo nome del dipendente:", ore.nomeDipendente);
    const nuovoCognomeDipendente = prompt("Inserisci il nuovo cognome del dipendente:", ore.cognomeDipendente);
    const nuovaData = prompt("Inserisci la nuova data (YYYY-MM-DD):", ore.data);
    const nuovaOraInizio = prompt("Inserisci la nuova ora di inizio (HH:mm):", ore.oraInizio);
    const nuovaOraFine = prompt("Inserisci la nuova ora di fine (HH:mm):", ore.oraFine);
    const nuovaDescrizione = prompt("Inserisci la nuova descrizione:", ore.descrizione);
    const nuovaNonConformita = confirm("La non conformità è stata risolta?"); // Usa confirm per un input booleano

    if (
      nuovaCommessa &&
      nuovoNomeDipendente &&
      nuovoCognomeDipendente &&
      nuovaData &&
      nuovaOraInizio &&
      nuovaOraFine &&
      nuovaDescrizione
    ) {
      // Aggiorna il documento Firestore
      await updateDoc(docRef, {
        commessa: nuovaCommessa,
        nomeDipendente: nuovoNomeDipendente,
        cognomeDipendente: nuovoCognomeDipendente,
        data: nuovaData,
        oraInizio: nuovaOraInizio,
        oraFine: nuovaOraFine,
        descrizione: nuovaDescrizione,
        nonConformita: nuovaNonConformita,
      });

      alert("Dati salvati con successo!");
  

      // Aggiorna la tabella delle ore lavorate
      await aggiornaTabellaOreLavorate();
    } else {
      alert("Tutti i campi sono obbligatori. Modifica annullata.");
    }
  } catch (error) {
    console.error("Errore durante la modifica delle ore lavorate:", error);
    alert("Si è verificato un errore durante la modifica.");
  }
}
// Funzione per eliminare ore lavorate
async function eliminaOreLavorate(id) {
  if (confirm("Sei sicuro di voler eliminare queste ore lavorate?")) {
    try {
      await deleteDoc(doc(db, "oreLavorate", id));
      aggiornaTabellaOreLavorate();
    } catch (error) {
      console.error("Errore durante l'eliminazione delle ore lavorate: ", error);
    }
  }
}

// Event listener per il caricamento della pagina
document.addEventListener('DOMContentLoaded', function () {
  // Gestione Login
  document.getElementById('btnLogin').addEventListener('click', gestisciLogin);

  // Gestione Logout
  const logoutButton = document.getElementById('logoutButton');
  if (logoutButton) {
    logoutButton.addEventListener('click', logout);
  }
 // Filtri ore lavorate
   document.getElementById('filtraOreLavorate').addEventListener('submit', function (e) {
        e.preventDefault();
        applicaFiltri();
    });
    document.getElementById('btnScaricaPDF').addEventListener('click', function (e) {
      e.preventDefault();
  
      // Recupera i dati filtrati dalla tabella corrente
      const righe = document.querySelectorAll('#orelavorateTable tbody tr');
      const oreFiltrate = Array.from(righe).map(riga => {
          return {
              commessa: riga.cells[0].textContent,
              nomeDipendente: riga.cells[1].textContent.split(' ')[0],
              cognomeDipendente: riga.cells[1].textContent.split(' ')[1],
              data: riga.cells[2].textContent,
              oraInizio: riga.cells[3].textContent,
              oraFine: riga.cells[4].textContent,
              descrizione: riga.cells[5].textContent
          };
      });
  
      // Genera il PDF con i dati filtrati
      generaPDFFiltrato(oreFiltrate);
  });
    
    const btnApplicaFiltri = document.getElementById('btnApplicaFiltri');
    const btnResetFiltri = document.getElementById('btnResetFiltri');
    const btnScaricaPDF = document.getElementById('btnScaricaPDF');

    if (btnApplicaFiltri) {
        btnApplicaFiltri.addEventListener('click', function (e) {
            e.preventDefault();
            applicaFiltri();
        });
    } else {
        console.error("Elemento 'btnApplicaFiltri' non trovato!");
    }

    if (btnResetFiltri) {
        btnResetFiltri.addEventListener('click', function (e) {
            e.preventDefault();
            resetFiltri();
        });
    } else {
        console.error("Elemento 'btnResetFiltri' non trovato!");
    }

    if (btnScaricaPDF) {
        btnScaricaPDF.addEventListener('click', function (e) {
            e.preventDefault();
            generaPDFFiltrato();
        });
    } else {
        console.error("Elemento 'btnScaricaPDF' non trovato!");
    }

    
    
    
    
  // Gestione Commesse
  const commessaForm = document.getElementById('commessaForm');
  if (commessaForm) {
    commessaForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const nomeCommessa = document.getElementById('nomeCommessa').value;
      const cliente = document.getElementById('cliente').value;
      aggiungiCommessa(nomeCommessa, cliente);
      document.getElementById('nomeCommessa').value = "";
      document.getElementById('cliente').value = "";
    });
  }

  // Gestione Dipendenti
  const dipendentiForm = document.getElementById('dipendentiForm');
  if (dipendentiForm) {
    dipendentiForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const nome = document.getElementById('dipendenteNome').value;
      const cognome = document.getElementById('dipendenteCognome').value;
      const email = document.getElementById('dipendenteEmail').value;
      const password = document.getElementById('dipendentePassword').value;
      const ruolo = document.getElementById('dipendenteRuolo').value;
      aggiungiDipendente(nome, cognome, email, password, ruolo);
      document.getElementById('dipendenteNome').value = "";
      document.getElementById('dipendenteCognome').value = "";
      document.getElementById('dipendenteEmail').value = "";
      document.getElementById('dipendentePassword').value = "";
      document.getElementById('dipendenteRuolo').value = "dipendente";
    });
  }

  // Gestione Ore Lavorate
  document.getElementById('oreForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    
    const nomeDipendente = currentUser.name.split(" ")[0];
    const cognomeDipendente = currentUser.name.split(" ")[1];
    const data = document.getElementById('oreData').value;
    let oraInizio = document.getElementById('oreInizio').value;
    let oraFine = document.getElementById('oreFine').value;
    const descrizione = document.getElementById('oreDescrizione').value;
    const nonConformita = document.getElementById('nonConformita').checked;
    const commessaSelect = document.getElementById('oreCommessa');
    const commessa = commessaSelect.value;
  
  // Verifica che sia stata selezionata una commessa
  if (!commessa) {
    alert("Seleziona una commessa dalla lista");
    commessaSelect.focus();
    return;
  }
  
    // Arrotonda gli orari
    oraInizio = arrotondaAlQuartoDora(oraInizio);
    oraFine = arrotondaAlQuartoDora(oraFine);
  
    // Verifica che l'ora di inizio non sia vuota
    if (!oraInizio) {
      alert("Inserisci l'ora di inizio");
      return;
    }
  
    // Verifica che l'ora di fine sia successiva all'ora di inizio
    if (oraFine && oraFine <= oraInizio) {
      alert("L'ora di fine deve essere successiva all'ora di inizio");
      return;
    }
  
    // Aggiungi le ore lavorate
    await aggiungiOreLavorate(commessa, nomeDipendente, cognomeDipendente, 
                             data, oraInizio, oraFine, descrizione, nonConformita);
  
    // Resetta il form mantenendo la data e impostando la nuova ora di inizio
    document.getElementById('oreCommessa').value = "";
    document.getElementById('oreInizio').value = oraFine || "";
    document.getElementById('oreFine').value = "";
    document.getElementById('oreDescrizione').value = "";
    document.getElementById('nonConformita').checked = false;
    
    // Focus sul campo oraFine se c'è un'ora di inizio
    if (document.getElementById('oreInizio').value) {
      document.getElementById('oreFine').focus();
    }
  });
  document.getElementById('oreData').addEventListener('change', async function() {
    const dataSelezionata = this.value;
    if (!dataSelezionata) return;
    
    const ultimaLavorazione = await getUltimaLavorazioneGiornata(dataSelezionata);
    
    if (ultimaLavorazione) {
      document.getElementById('oreInizio').value = ultimaLavorazione.oraFine;
      document.getElementById('oreFine').focus();
    }
  });
  aggiornaMenuCommesse();
});
async function applicaFiltri() {
  const filtroCommessa = document.getElementById('filtroCommessa').value.trim().toLowerCase();
  const filtroDipendente = document.getElementById('filtroDipendente').value.trim().toLowerCase();
  const filtroAnno = document.getElementById('filtroAnno').value;
  const filtroMese = document.getElementById('filtroMese').value; // Nota: c'era un typo qui (filtroMese vs filtroMese)
  const filtroGiorno = document.getElementById('filtroGiorno').value;
  const filtroNonConformita = document.getElementById('filtroNonConformita').checked;

  const querySnapshot = await getDocs(collection(db, "oreLavorate"));
  
  datiFiltrati = querySnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(ore => {
      // Filtro per commessa
      const corrispondeCommessa = filtroCommessa ? 
        ore.commessa.toLowerCase().includes(filtroCommessa) : true;
      
      // Filtro per dipendente
      const corrispondeDipendente = filtroDipendente ? 
        `${ore.nomeDipendente} ${ore.cognomeDipendente}`.toLowerCase().includes(filtroDipendente) : true;
      
      // Filtro per non conformità
      const corrispondeNonConformita = filtroNonConformita ? 
        ore.nonConformita === true : true;
      
      // Filtro per data - MODIFICATO
      let corrispondeData = true;
      if (filtroAnno || filtroMese || filtroGiorno) {
        const [anno, mese, giorno] = ore.data.split('-');
        
        if (filtroAnno && anno !== filtroAnno) {
          corrispondeData = false;
        }
        
        if (filtroMese && mese !== filtroMese) {
          corrispondeData = false;
        }
        
        if (filtroGiorno && giorno !== filtroGiorno) {
          corrispondeData = false;
        }
      }
      // Rimuovi il filtro automatico del mese corrente per admin
      // quando nessun filtro è specificato
      
      return corrispondeCommessa && corrispondeDipendente && corrispondeNonConformita && corrispondeData;
    });

  // Ordina i dati per data in ordine decrescente
  datiFiltrati.sort((a, b) => {
    const dataA = new Date(a.data);
    const dataB = new Date(b.data);
    return dataB - dataA;
  });

  aggiornaTabellaOreLavorate(datiFiltrati);
  paginaCorrente = 1;
}

function calcolaTotaleGenerale(oreFiltrate) {
  if (!Array.isArray(oreFiltrate)) {
    console.error("Dati non validi per il calcolo del totale");
    return 0;
  }

  const totaleOre = oreFiltrate.reduce((totale, ore) => {
    const oreLavorate = calcolaOreLavorate(ore.oraInizio, ore.oraFine);
    return totale + oreLavorate;
  }, 0);

  return totaleOre; // Restituisce in decimale (es. 2.5)
}
function sommaOre(ore1, ore2) {
  // Converte le stringhe "HH:mm" in minuti totali
  const [h1, m1] = ore1.split(':').map(Number);
  const [h2, m2] = ore2.split(':').map(Number);

  // Somma i minuti totali
  const minutiTotali = (h1 + h2) * 60 + (m1 + m2);

  // Converte i minuti totali in ore e minuti
  const ore = Math.floor(minutiTotali / 60);
  const minuti = minutiTotali % 60;

  // Formatta il risultato come "HH:mm"
  return `${String(ore).padStart(2, '0')}:${String(minuti).padStart(2, '0')}`;
}
async function resetFiltri() {
  document.getElementById('filtroCommessa').value = "";
  document.getElementById('filtroDipendente').value = "";
  document.getElementById('filtroAnno').value = new Date().getFullYear().toString();
  document.getElementById('filtroMese').value = "";
  document.getElementById('filtroGiorno').value = "";
  document.getElementById('filtroNonConformita').checked = false;

  // Reset delle opzioni del giorno
  const giornoSelect = document.getElementById('filtroGiorno');
  giornoSelect.innerHTML = '<option value="">Tutti i giorni</option>';
// Se admin, mostra solo mese corrente
if (currentUser && currentUser.ruolo === 'admin') {
  const oggi = new Date();
  const meseCorrente = oggi.getMonth() + 1;
  const annoCorrente = oggi.getFullYear();
  const meseStringa = `${annoCorrente}-${String(meseCorrente).padStart(2, '0')}`;
  
  const querySnapshot = await getDocs(collection(db, "oreLavorate"));
  datiFiltrati = querySnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(ore => ore.data.startsWith(meseStringa));
} else {
  // Resetta i dati filtrati
  const querySnapshot = await getDocs(collection(db, "oreLavorate"));
  datiFiltrati = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}
  // Ordina i dati per data in ordine decrescente
  datiFiltrati.sort((a, b) => {
    const dataA = new Date(a.data);
    const dataB = new Date(b.data);
    return dataB - dataA; // Ordine decrescente
  });

  // Resetta alla prima pagina
  paginaCorrente = 1;
  aggiornaTabellaOreLavorate(datiFiltrati);
}
async function generaTabellaMensile(meseNumero, nomeMese) {
  const tabelleMensili = document.getElementById('tabelleMensili');
  tabelleMensili.innerHTML = ''; // Pulisci il contenitore

  // Crea un elemento div per la tabella del mese
  const divMese = document.createElement('div');
  divMese.className = 'tabellaMese';
  divMese.innerHTML = `<h3>${nomeMese}</h3>`;

  // Crea la tabella
  const table = document.createElement('table');
  table.className = 'table table-bordered';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Dipendente</th>
        ${Array.from({ length: 31 }, (_, i) => `<th>${i + 1}</th>`).join('')}
        <th>Totale Mensile</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  // Aggiungi la tabella al div del mese
  divMese.appendChild(table);

  // Aggiungi un pulsante per scaricare il CSV
  const btnScaricaCSV = document.createElement('button');
  btnScaricaCSV.textContent = `Scarica ${nomeMese} in CSV`;
  btnScaricaCSV.addEventListener('click', () => scaricaCSV(nomeMese, meseNumero));
  divMese.appendChild(btnScaricaCSV);

  // Aggiungi il div del mese al contenitore
  tabelleMensili.appendChild(divMese);

  // Popola la tabella con i dati del mese selezionato
  await popolaTabellaMensile(meseNumero, table.querySelector('tbody'));
}
async function popolaTabellaMensile(meseNumero, tbody) {
  const querySnapshot = await getDocs(collection(db, "oreLavorate"));
  const datiOreLavorate = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

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
      const giorno = data.getDate() - 1; // Ottieni il giorno (0-30)
      const oreLavorate = calcolaOreLavorate(ore.oraInizio, ore.oraFine);
      datiPerDipendente[dipendenteKey].oreGiornaliere[giorno] += oreLavorate;
      datiPerDipendente[dipendenteKey].totaleMensile += oreLavorate;
    }
  });

  // Aggiungi le righe alla tabella
  Object.entries(datiPerDipendente).forEach(([dipendente, dati]) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${dipendente}</td>
      ${dati.oreGiornaliere.map(ore => `<td>${formattaOreDecimali(ore)}</td>`).join('')} <!-- Formatta le ore in HH:MM -->
      <td><strong>${formattaOreDecimali(dati.totaleMensile)}</strong></td> <!-- Formatta il totale mensile in HH:MM -->
    `;
    tbody.appendChild(row);
  });
}
async function scaricaCSV(mese, meseNumero) {
  console.log("Recupero dati per il mese:", mese, meseNumero);

  const querySnapshot = await getDocs(collection(db, "oreLavorate"));
  const datiOreLavorate = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  
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
    const oreLavorate = calcolaOreLavorate(ore.oraInizio, ore.oraFine);
    datiPerDipendente[dipendenteKey].oreGiornaliere[giorno] += oreLavorate;
    datiPerDipendente[dipendenteKey].totaleMensile += oreLavorate;
  });

  // Funzione per determinare se un giorno è sabato o domenica
  function isWeekend(year, month, day) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    return dayOfWeek === 0 || dayOfWeek === 6; // 0 = Domenica, 6 = Sabato
  }

  // Ottieni l'anno corrente (potresti volerlo passare come parametro)
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
      const oreStr = ore > 0 ? formattaOreDecimali(ore) : isNonLavorativo ? 'FESTIVO' : '';
      return oreStr.padStart(8, " ");
    });
    
    return [
      dipendente.padEnd(20, " "),
      ...oreFormattate,
      formattaOreDecimali(dati.totaleMensile).padStart(12, " ")
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
      formattaOreDecimali(totaleMensileGenerale).padStart(12, " ")
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
}
document.getElementById('btnMostraTabella').addEventListener('click', async () => {
  const selettoreMese = document.getElementById('selettoreMese');
  const meseSelezionato = parseInt(selettoreMese.value); // Ottieni il valore selezionato (0-11)
  const nomeMese = mesi[meseSelezionato]; // Ottieni il nome del mese

  // Mostra il contenitore delle tabelle
  const tabelleMensili = document.getElementById('tabelleMensili');
  tabelleMensili.style.display = 'block';

  // Genera e popola la tabella del mese selezionato
  await generaTabellaMensile(meseSelezionato + 1, nomeMese); // +1 perché i mesi vanno da 1 a 12
});
document.addEventListener('DOMContentLoaded', async () => {
  generaTabelleMensili();
  await popolaTabelleMensili();
});
async function filtraNonConformita() {
  const querySnapshot = await getDocs(collection(db, "oreLavorate"));
  const nonConformita = querySnapshot.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(ore => ore.nonConformita);

  aggiornaTabellaOreLavorate(nonConformita);
}
document.getElementById('btnFiltraNonConformita').addEventListener('click', filtraNonConformita);
