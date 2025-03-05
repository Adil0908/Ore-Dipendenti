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

      // Calcola le ore per dipendente e le ore totali
      const orePerDipendente = {};
      let oreTotali = 0;

      oreFiltrate.forEach(ore => {
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
      doc.text("Report Ore Lavorate Filtrate", 14, 20);

      // Aggiungi la tabella delle ore lavorate
      doc.autoTable({
          startY: 25,
          head: [['Commessa', 'Dipendente', 'Data', 'Ora Inizio', 'Ora Fine', 'Descrizione', 'Ore Lavorate']],
          body: oreFiltrate.map(ore => [
              ore.commessa,
              `${ore.nomeDipendente} ${ore.cognomeDipendente}`,
              ore.data,
              ore.oraInizio,
              ore.oraFine,
              ore.descrizione,
              calcolaOreLavorate(ore.oraInizio, ore.oraFine).toFixed(2)
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
              ore.toFixed(2)
          ]),
          theme: 'grid',
          styles: { fontSize: 10, cellPadding: 3 },
          headStyles: { fillColor: [41, 128, 185], textColor: 255 }
      });

      // Aggiungi una sezione per le ore totali
      const startYTotali = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(14);
      doc.text("Ore Totali Lavorate", 14, startYTotali);
      doc.text(`Totale: ${oreTotali.toFixed(2)} ore`, 14, startYTotali + 10);

      // Salva il PDF
      doc.save('ore_lavorate_filtrate.pdf');
  } catch (error) {
      console.error("Errore durante la generazione del PDF:", error);
      alert("Si è verificato un errore durante la generazione del PDF.");
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
              <button class="btnModificaDipendente" data-id="${doc.id}">Modifica</button>
              <button class="btnEliminaDipendente" data-id="${doc.id}">Elimina</button>
          </td>
      `;
      tbody.appendChild(row);

      // Collega gli event listener ai pulsanti
      row.querySelector('.btnModificaDipendente').addEventListener('click', () => modificaDipendente(doc.id));
      row.querySelector('.btnEliminaDipendente').addEventListener('click', () => eliminaDipendente(doc.id));
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
              <button class="btnModificaCommessa" data-id="${doc.id}">Modifica</button>
              <button class="btnEliminaCommessa" data-id="${doc.id}">Elimina</button>
          </td>
      `;
      tbody.appendChild(row);

      // Collega gli event listener ai pulsanti
      row.querySelector('.btnModificaCommessa').addEventListener('click', () => modificaCommessa(doc.id));
      row.querySelector('.btnEliminaCommessa').addEventListener('click', () => eliminaCommessa(doc.id));
  });
}

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
async function aggiornaTabellaOreLavorate(oreFiltrate = null, totali = null) {
  if (!oreFiltrate) {
      // Se non ci sono dati filtrati, carica tutti i dati
      const querySnapshot = await getDocs(collection(db, "oreLavorate"));
      oreFiltrate = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  const tbody = document.querySelector('#orelavorateTable tbody');
  tbody.innerHTML = '';

  // Verifica che oreFiltrate sia un array
  if (!Array.isArray(oreFiltrate)) {
      console.error("oreFiltrate non è un array:", oreFiltrate);
      return;
  }

  // Aggiungi le righe delle ore lavorate
  oreFiltrate.forEach(ore => {
      const oreLavorate = calcolaOreLavorate(ore.oraInizio, ore.oraFine);
      const row = document.createElement('tr');
      row.innerHTML = `
          <td>${ore.commessa}</td>
          <td>${ore.nomeDipendente} ${ore.cognomeDipendente}</td>
          <td>${ore.data}</td>
          <td>${ore.oraInizio}</td>
          <td>${ore.oraFine}</td>
          <td>${ore.descrizione}</td>
          <td>${oreLavorate.toFixed(2)} ore</td>
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
  const totalRow = document.createElement('tr');
  totalRow.innerHTML = `
      <td colspan="6"><strong>Totali</strong></td>
      <td><strong>${calcolaTotaleGenerale(oreFiltrate).toFixed(2)} ore</strong></td>
  `;
  tbody.appendChild(totalRow);

  // Aggiungi i totali per dipendente, commessa e mese
  if (totali) {
      const totaliDipendente = Object.entries(totali.perDipendente)
          .map(([dipendente, ore]) => `<div>${dipendente}: ${ore.toFixed(2)} ore</div>`)
          .join('');

      const totaliCommessa = Object.entries(totali.perCommessa)
          .map(([commessa, ore]) => `<div>${commessa}: ${ore.toFixed(2)} ore</div>`)
          .join('');

      const totaliMese = Object.entries(totali.perMese)
          .map(([mese, ore]) => `<div>${mese}: ${ore.toFixed(2)} ore</div>`)
          .join('');

      const totaliDiv = document.createElement('div');
      totaliDiv.innerHTML = `
          <h3>Totali per Dipendente</h3>
          ${totaliDipendente}
          <h3>Totali per Commessa</h3>
          ${totaliCommessa}
          <h3>Totali per Mese</h3>
          ${totaliMese}
      `;
      document.getElementById('totaliContainer').innerHTML = '';
      document.getElementById('totaliContainer').appendChild(totaliDiv);
  }
}

function calcolaTotaleGenerale(oreFiltrate) {
  return oreFiltrate.reduce((totale, ore) => {
      return totale + calcolaOreLavorate(ore.oraInizio, ore.oraFine);
  }, 0);
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
      alert("Dati salvati con successo!");
    aggiornaTabellaOreLavorate();
  } catch (error) {
    console.error("Errore durante l'aggiunta delle ore lavorate: ", error);
  }
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
      const nuovaData = prompt("Inserisci la nuova data:", ore.data);
      const nuovaOraInizio = prompt("Inserisci la nuova ora di inizio:", ore.oraInizio);
      const nuovaOraFine = prompt("Inserisci la nuova ora di fine:", ore.oraFine);
      const nuovaDescrizione = prompt("Inserisci la nuova descrizione:", ore.descrizione);

      if (!nuovaCommessa || !nuovoNomeDipendente || !nuovoCognomeDipendente || !nuovaData || !nuovaOraInizio || !nuovaOraFine || !nuovaDescrizione) {
          console.error("Uno o più campi non sono stati inseriti correttamente.");
          return;
      }

      const aggiornamenti = {
          commessa: nuovaCommessa,
          nomeDipendente: nuovoNomeDipendente,
          cognomeDipendente: nuovoCognomeDipendente,
          data: nuovaData,
          oraInizio: nuovaOraInizio,
          oraFine: nuovaOraFine,
          descrizione: nuovaDescrizione
      };

      await updateDoc(docRef, aggiornamenti);
      console.log("Documento aggiornato con successo.");
      aggiornaTabellaOreLavorate();
  } catch (error) {
      console.error("Errore durante la modifica delle ore lavorate:", error);
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
  datiFiltrati = querySnapshot.docs
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

  // Calcola i totali
  const totali = {
      perDipendente: {},
      perCommessa: {},
      perMese: {}
  };

  datiFiltrati.forEach(ore => {
      const oreLavorate = calcolaOreLavorate(ore.oraInizio, ore.oraFine);

      // Totale per dipendente
      const dipendenteKey = `${ore.nomeDipendente} ${ore.cognomeDipendente}`;
      if (!totali.perDipendente[dipendenteKey]) {
          totali.perDipendente[dipendenteKey] = 0;
      }
      totali.perDipendente[dipendenteKey] += oreLavorate;

      // Totale per commessa
      if (!totali.perCommessa[ore.commessa]) {
          totali.perCommessa[ore.commessa] = 0;
      }
      totali.perCommessa[ore.commessa] += oreLavorate;

      // Totale per mese
      const meseKey = ore.data.substring(0, 7); // Formato YYYY-MM
      if (!totali.perMese[meseKey]) {
          totali.perMese[meseKey] = 0;
      }
      totali.perMese[meseKey] += oreLavorate;
  });

  // Aggiorna la tabella con i dati filtrati
  aggiornaTabellaOreLavorate(datiFiltrati, totali);
}
function calcolaOreLavorate(oraInizio, oraFine) {
  const inizio = new Date(`1970-01-01T${oraInizio}:00`);
  const fine = new Date(`1970-01-01T${oraFine}:00`);
  const differenza = fine - inizio; // Differenza in millisecondi
  return differenza / (1000 * 60 * 60); // Converti in ore
}
function resetFiltri() {
  // Resetta i campi di input
  document.getElementById('filtroCommessa').value = "";
  document.getElementById('filtroDipendente').value = "";
  document.getElementById('filtroMese').value = "";

  // Resetta i dati filtrati
  datiFiltrati = null;

  // Mostra tutti i dati
  aggiornaTabellaOreLavorate();
}
