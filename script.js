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
    apiKey: "AIzaSyC9ZvmbxZBA5ktK60-wKL-5baHZ45R5JwI",
    authDomain: "union14srl-fcb37.firebaseapp.com",
    projectId: "union14srl-fcb37",
    storageBucket: "union14srl-fcb37.firebasestorage.app",
    messagingSenderId: "781549347487",
    appId: "1:781549347487:web:7133e3b7e5d931ce9638aa",
    measurementId: "G-MYW3153LFE"
};

// Inizializza Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
// jsPDF
const { jsPDF } = window.jspdf;

// Variabili globali
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

// Funzione per mostrare l'applicazione
function mostraApplicazione() {
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

  aggiornaMenuCommesse();
  aggiornaTabellaOreLavorate();
  aggiornaTabellaCommesse();
  aggiornaTabellaDipendenti();

  // Aggiungi messaggio benvenuto
  const benvenuto = document.createElement('div');
  benvenuto.textContent = `Benvenuto, ${currentUser ? currentUser.name : 'Utente'}!`;
  benvenuto.style.marginBottom = '20px';
  benvenuto.style.fontSize = '18px';
  document.getElementById('appContent').prepend(benvenuto);
}

// Funzione per aggiornare il menu delle commesse
async function aggiornaMenuCommesse() {
  const selectCommessa = document.getElementById('oreCommessa');
  selectCommessa.innerHTML = ''; // Svuota il menu

  const querySnapshot = await getDocs(collection(db, "commesse"));
  querySnapshot.forEach(doc => {
    const commessa = doc.data();
    const option = document.createElement('option');
    option.value = commessa.nomeCommessa;
    option.textContent = commessa.nomeCommessa;
    selectCommessa.appendChild(option);
  });
}

// Funzione per aggiornare la tabella dei dipendenti
async function aggiornaTabellaDipendenti() {
  const tbody = document.querySelector('#dipendentiTable tbody');
  tbody.innerHTML = '';

  const querySnapshot = await getDocs(collection(db, "dipendenti"));
  querySnapshot.forEach(doc => {
    const dipendente = doc.data();
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${dipendente.nome}</td>
      <td>${dipendente.cognome}</td>
      <td>${dipendente.email}</td>
      <td>${dipendente.password}</td>
      <td>${dipendente.ruolo}</td>
      <td>
        <button onclick="modificaDipendente('${doc.id}')">Modifica</button>
        <button onclick="eliminaDipendente('${doc.id}')">Elimina</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

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
    aggiornaTabellaDipendenti();
  } catch (error) {
    console.error("Errore durante l'aggiunta del dipendente: ", error);
  }
}

// Funzione per modificare un dipendente
async function modificaDipendente(id) {
  const nuovoNome = prompt("Inserisci il nuovo nome:");
  const nuovoCognome = prompt("Inserisci il nuovo cognome:");
  const nuovaEmail = prompt("Inserisci la nuova email:");
  const nuovaPassword = prompt("Inserisci la nuova password:");
  const nuovoRuolo = prompt("Inserisci il nuovo ruolo:");

  if (nuovoNome && nuovoCognome && nuovaEmail && nuovaPassword && nuovoRuolo) {
    try {
      await updateDoc(doc(db, "dipendenti", id), {
        nome: nuovoNome,
        cognome: nuovoCognome,
        email: nuovaEmail,
        password: nuovaPassword,
        ruolo: nuovoRuolo
      });
      aggiornaTabellaDipendenti();
    } catch (error) {
      console.error("Errore durante la modifica del dipendente: ", error);
    }
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
async function aggiornaTabellaCommesse() {
  const tbody = document.querySelector('#commesseTable tbody');
  tbody.innerHTML = '';

  const querySnapshot = await getDocs(collection(db, "commesse"));
  querySnapshot.forEach(doc => {
    const commessa = doc.data();
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${commessa.nomeCommessa}</td>
      <td>${commessa.cliente}</td>
      <td>
        <button onclick="modificaCommessa('${doc.id}')">Modifica</button>
        <button onclick="eliminaCommessa('${doc.id}')">Elimina</button>
      </td>
    `;
    tbody.appendChild(row);
  });
}

// Funzione per aggiungere una commessa
async function aggiungiCommessa(nomeCommessa, cliente) {
  try {
    await addDoc(collection(db, "commesse"), {
      nomeCommessa: nomeCommessa,
      cliente: cliente
    });
    aggiornaTabellaCommesse();
    aggiornaMenuCommesse();
  } catch (error) {
    console.error("Errore durante l'aggiunta della commessa: ", error);
  }
}

// Funzione per modificare una commessa
async function modificaCommessa(id) {
  const nuovoNomeCommessa = prompt("Inserisci il nuovo nome della commessa:");
  const nuovoCliente = prompt("Inserisci il nuovo cliente:");

  if (nuovoNomeCommessa && nuovoCliente) {
    try {
      await updateDoc(doc(db, "commesse", id), {
        nomeCommessa: nuovoNomeCommessa,
        cliente: nuovoCliente
      });
      aggiornaTabellaCommesse();
      aggiornaMenuCommesse();
    } catch (error) {
      console.error("Errore durante la modifica della commessa: ", error);
    }
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
async function aggiornaTabellaOreLavorate(datiFiltrati = null) {
    const tbody = document.querySelector('#orelavorateTable tbody');
    tbody.innerHTML = '';

    // Se non ci sono filtri, carica tutti i dati
    const datiDaMostrare = datiFiltrati || 
        (await getDocs(collection(db, "oreLavorate"))).docs.map(doc => ({ id: doc.id, ...doc.data() }));

    datiDaMostrare.forEach(ore => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${ore.commessa}</td>
            <td>${ore.nomeDipendente} ${ore.cognomeDipendente}</td>
            <td>${ore.data}</td>
            <td>${ore.oraInizio}</td>
            <td>${ore.oraFine}</td>
            <td>${ore.descrizione}</td>
            <td>
                <button onclick="modificaOreLavorate('${ore.id}')">Modifica</button>
                <button onclick="eliminaOreLavorate('${ore.id}')">Elimina</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Funzione per aggiungere ore lavorate
async function aggiungiOreLavorate(commessa, nomeDipendente, cognomeDipendente, data, oraInizio, oraFine, descrizione) {
  try {
    await addDoc(collection(db, "oreLavorate"), {
      commessa: commessa,
      nomeDipendente: nomeDipendente,
      cognomeDipendente: cognomeDipendente,
      data: data,
      oraInizio: oraInizio,
      oraFine: oraFine,
      descrizione: descrizione
    });
    aggiornaTabellaOreLavorate();
  } catch (error) {
    console.error("Errore durante l'aggiunta delle ore lavorate: ", error);
  }
}

// Funzione per modificare ore lavorate
async function modificaOreLavorate(id) {
  const nuovaCommessa = prompt("Inserisci la nuova commessa:");
  const nuovoNomeDipendente = prompt("Inserisci il nuovo nome del dipendente:");
  const nuovoCognomeDipendente = prompt("Inserisci il nuovo cognome del dipendente:");
  const nuovaData = prompt("Inserisci la nuova data:");
  const nuovaOraInizio = prompt("Inserisci la nuova ora di inizio:");
  const nuovaOraFine = prompt("Inserisci la nuova ora di fine:");
  const nuovaDescrizione = prompt("Inserisci la nuova descrizione:");

  if (nuovaCommessa && nuovoNomeDipendente && nuovoCognomeDipendente && nuovaData && nuovaOraInizio && nuovaOraFine && nuovaDescrizione) {
    try {
      await updateDoc(doc(db, "oreLavorate", id), {
        commessa: nuovaCommessa,
        nomeDipendente: nuovoNomeDipendente,
        cognomeDipendente: nuovoCognomeDipendente,
        data: nuovaData,
        oraInizio: nuovaOraInizio,
        oraFine: nuovaOraFine,
        descrizione: nuovaDescrizione
      });
      aggiornaTabellaOreLavorate();
    } catch (error) {
      console.error("Errore durante la modifica delle ore lavorate: ", error);
    }
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
    document.getElementById('filtriOreLavorate').addEventListener('submit', function (e) {
        e.preventDefault();
        applicaFiltri();
    });

    // Pulsante Reset
    const resetButton = document.querySelector('#filtriOreLavorate button[onclick="resetFiltri()"]');
    if (resetButton) {
        resetButton.addEventListener('click', resetFiltri);
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
  const oreForm = document.getElementById('oreForm');
  if (oreForm) {
    oreForm.addEventListener('submit', function (e) {
      e.preventDefault();
      const commessa = document.getElementById('oreCommessa').value;
      const nomeDipendente = currentUser.name.split(" ")[0];
      const cognomeDipendente = currentUser.name.split(" ")[1];
      const data = document.getElementById('oreData').value;
      const oraInizio = document.getElementById('oreInizio').value;
      const oraFine = document.getElementById('oreFine').value;
      const descrizione = document.getElementById('oreDescrizione').value;
      aggiungiOreLavorate(commessa, nomeDipendente, cognomeDipendente, data, oraInizio, oraFine, descrizione);
      document.getElementById('oreCommessa').value = "";
      document.getElementById('oreData').value = "";
      document.getElementById('oreInizio').value = "";
      document.getElementById('oreFine').value = "";
      document.getElementById('oreDescrizione').value = "";
    });
  }
});
async function applicaFiltri() {
    const filtroCommessa = document.getElementById('filtroCommessa').value.trim().toLowerCase();
    const filtroDipendente = document.getElementById('filtroDipendente').value.trim().toLowerCase();
    const filtroMese = document.getElementById('filtroMese').value;

    const querySnapshot = await getDocs(collection(db, "oreLavorate"));
    const oreFiltrate = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(ore => {
            const corrispondeCommessa = filtroCommessa ? 
                ore.commessa.toLowerCase().includes(filtroCommessa) : true;
            const corrispondeDipendente = filtroDipendente ? 
                `${ore.nomeDipendente} ${ore.cognomeDipendente}`.toLowerCase().includes(filtroDipendente) : true;
            const corrispondeMese = filtroMese ? 
                ore.data.startsWith(filtroMese) : true;

            return corrispondeCommessa && corrispondeDipendente && corrispondeMese;
        });

    aggiornaTabellaOreLavorate(oreFiltrate);
    generaPDFFiltrato(oreFiltrate); // Genera il PDF con i dati filtrati
}
function resetFiltri() {
    // Resetta i campi di input
    document.getElementById('filtroCommessa').value = "";
    document.getElementById('filtroDipendente').value = "";
    document.getElementById('filtroMese').value = "";

    // Mostra tutti i dati
    aggiornaTabellaOreLavorate();
}
async function generaPDFFiltrato() { // Aggiunto async
    const filtroCommessa = document.getElementById('filtroCommessa').value.trim().toLowerCase();
    const filtroDipendente = document.getElementById('filtroDipendente').value.trim().toLowerCase();
    const filtroMese = document.getElementById('filtroMese').value;

    // Recupera i dati da Firestore
    const querySnapshot = await getDocs(collection(db, "oreLavorate"));
    const oreFiltrate = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() })) // Mantieni l'ID del documento
        .filter(ore => {
            const corrispondeCommessa = filtroCommessa ? 
                ore.commessa.toLowerCase().includes(filtroCommessa) : true;
            const corrispondeDipendente = filtroDipendente ? 
                `${ore.nomeDipendente} ${ore.cognomeDipendente}`.toLowerCase().includes(filtroDipendente) : true;
            const corrispondeMese = filtroMese ? 
                ore.data.startsWith(filtroMese) : true;

            return corrispondeCommessa && corrispondeDipendente && corrispondeMese;
        });

    // Crea il PDF con tabella formattata
    const doc = new jsPDF();
    doc.autoTable({
        head: [['Commessa', 'Dipendente', 'Data', 'Ora Inizio', 'Ora Fine', 'Descrizione']],
        body: oreFiltrate.map(ore => [
            ore.commessa,
            `${ore.nomeDipendente} ${ore.cognomeDipendente}`,
            ore.data,
            ore.oraInizio,
            ore.oraFine,
            ore.descrizione
        ]),
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [41, 128, 185], textColor: 255 }
    });
    doc.save('ore_lavorate_filtrate.pdf');
}
