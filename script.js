const { jsPDF } = window.jspdf;


// Variabili globali
let currentUser = null;
const ADMIN_CREDENTIALS = {
  email: 'eliraoui.a@union14.it',
  password: 'Eliraoui0101!',
  ruolo: 'admin'
};

let dipendenti = JSON.parse(localStorage.getItem('dipendenti')) || [];
if (!dipendenti.some(d => d.ruolo === 'admin')) {
  dipendenti.push({
    nome: "Amministratore",
    cognome: "Sistema",
    email: ADMIN_CREDENTIALS.email,
    ruolo: ADMIN_CREDENTIALS.ruolo,
    password: ADMIN_CREDENTIALS.password
  });
  localStorage.setItem('dipendenti', JSON.stringify(dipendenti));
}

let commesse = JSON.parse(localStorage.getItem('commesse')) || [];
let oreLavorate = JSON.parse(localStorage.getItem('oreLavorate')) || [];

// Funzione per salvare i dati nel localStorage
function salvaDati() {
    localStorage.setItem('dipendenti', JSON.stringify(dipendenti));
    localStorage.setItem('commesse', JSON.stringify(commesse));
    localStorage.setItem('oreLavorate', JSON.stringify(oreLavorate));
}

// Funzione per gestire il login
function gestisciLogin() {
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

    const dipendente = dipendenti.find(d => d.email === email && d.password === password);
    if (dipendente) {
        if (dipendente.ruolo === "dipendente") {
            currentUser = {
                ruolo: 'dipendente',
                name: `${dipendente.nome} ${dipendente.cognome}`
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
  console.log('Logout chiamato'); // Debug
    currentUser = null;
    window.location.href = 'index.html';
}

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
    // Aggiorna contenuti
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
function aggiornaMenuCommesse() {
    const selectCommessa = document.getElementById('oreCommessa');
    selectCommessa.innerHTML = ''; // Svuota il menu

    // Carica le commesse dal localStorage
    const commesse = JSON.parse(localStorage.getItem('commesse')) || [];

    // Aggiungi ogni commessa al menu
    commesse.forEach(commessa => {
        const option = document.createElement('option');
        option.value = commessa.nomeCommessa;
        option.textContent = commessa.nomeCommessa;
        selectCommessa.appendChild(option);
    });
}
// Funzione per aggiornare la tabella dei dipendenti
function aggiornaTabellaDipendenti() {
    const tbody = document.querySelector('#dipendentiTable tbody');
    tbody.innerHTML = '';
    dipendenti.forEach((dipendente, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${dipendente.nome}</td>
            <td>${dipendente.cognome}</td>
            <td>${dipendente.email}</td>
            <td>${dipendente.password}</td>
            <td>${dipendente.ruolo}</td> <!-- Mostra il ruolo -->
            <td>
                <button onclick="modificaDipendente(${index})">Modifica</button>
                <button onclick="eliminaDipendente(${index})">Elimina</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}
// Funzione per aggiornare la tabella ore lavorate
function aggiornaTabellaOreLavorate(datiFiltrati = null) {
    const tbody = document.querySelector('#orelavorateTable tbody');
    tbody.innerHTML = '';
    const datiDaMostrare = datiFiltrati || oreLavorate; // Usa i dati filtrati o tutti i dati
    datiDaMostrare.forEach((ore, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${ore.commessa}</td>
            <td>${ore.nomeDipendente} ${ore.cognomeDipendente}</td>
            <td>${ore.data}</td>
            <td>${ore.oraInizio}</td>
            <td>${ore.oraFine}</td>
            <td>${ore.descrizione}</td>
            <td>
                <button onclick="modificaOreLavorate(${index})">Modifica</button>
                <button onclick="eliminaOreLavorate(${index})">Elimina</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}
// Funzione per modificare ore lavorate
function modificaOreLavorate(index) {
    const ore = oreLavorate[index];
    const nuovaCommessa = prompt("Inserisci la nuova commessa:", ore.commessa);
    const nuovoNome = prompt("Inserisci il nuovo nome:", ore.nome);
    const nuovoCognome = prompt("Inserisci il nuovo cognome:", ore.cognome);
    const nuovaData = prompt("Inserisci la nuova data:", ore.data);
    const nuovaOraInizio = prompt("Inserisci la nuova ora di inizio:", ore.oraInizio);
    const nuovaOraFine = prompt("Inserisci la nuova ora di fine:", ore.oraFine);
    const nuovaDescrizione = prompt("Inserisci la nuova descrizione:", ore.descrizione);
    if (nuovaCommessa && nuovaData && nuovaOraInizio && nuovaOraFine && nuovaDescrizione) {
        ore.commessa = nuovaCommessa;
        ore.data = nuovaData;
        ore.oraInizio = nuovaOraInizio;
        ore.oraFine = nuovaOraFine;
        ore.descrizione = nuovaDescrizione;
        salvaDati();
        aggiornaTabellaOreLavorate();
    }
}

// Funzione per eliminare ore lavorate
function eliminaOreLavorate(index) {
    oreLavorate.splice(index, 1);
    salvaDati();
    aggiornaTabellaOreLavorate();
}






// Funzione per aggiornare la tabella delle commesse
function aggiornaTabellaCommesse() {
    const tbody = document.querySelector('#commesseTable tbody');
    tbody.innerHTML = '';
    commesse.forEach((commessa, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${commessa.nomeCommessa}</td>
            <td>${commessa.cliente}</td>
            <td>
                <button onclick="modificaCommessa(${index})">Modifica</button>
                <button onclick="eliminaCommessa(${index})">Elimina</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// Funzione per modificare una commessa
function modificaCommessa(index) {
    const commessa = commesse[index];
    const nuovoNomeCommessa = prompt("Inserisci il nuovo nome della commessa:", commessa.nomeCommessa);
    const nuovoCliente = prompt("Inserisci il nuovo cliente:", commessa.cliente);
    if (nuovoNomeCommessa && nuovoCliente) {
        commessa.nomeCommessa = nuovoNomeCommessa;
        commessa.cliente = nuovoCliente;
        salvaDati();
        aggiornaTabellaCommesse();
    }
}


// Funzione per eliminare una commessa
function eliminaCommessa(index) {
    commesse.splice(index, 1);
    salvaDati();
    aggiornaTabellaCommesse();
}

// Funzione per modificare un dipendente
function modificaDipendente(index) {
    const dipendente = dipendenti[index];
    const nuovoNome = prompt("Inserisci il nuovo nome:", dipendente.nome);
    const nuovoCognome = prompt("Inserisci il nuovo cognome:", dipendente.cognome);
    const nuovaEmail = prompt("Inserisci la nuova email:", dipendente.email);
    const nuovaPassword = prompt("Inserisci la nuova password:", dipendente.password);
    const nuovoRuolo = prompt("Inserisci il nuovo ruolo (admin/dipendente):", dipendente.ruolo);
    if (nuovoNome && nuovoCognome && nuovaEmail && nuovaPassword && nuovoRuolo) {
        dipendente.nome = nuovoNome;
        dipendente.cognome = nuovoCognome;
        dipendente.email = nuovaEmail;
        dipendente.password = nuovaPassword;
        dipendente.ruolo = nuovoRuolo; // Aggiorna il ruolo
        salvaDati();
        aggiornaTabellaDipendenti();
    }
}

// Funzione per eliminare un dipendente
function eliminaDipendente(index) {
    dipendenti.splice(index, 1);
    salvaDati();
    aggiornaTabellaDipendenti();
}

// Funzione per generare un PDF delle ore lavorate
function generaPDFOreLavorate() {
    const doc = new jsPDF();
    const oreLavorate = JSON.parse(localStorage.getItem('oreLavorate')) || [];
    let content = 'Ore Lavorate:\n\n';
    oreLavorate.forEach(ore => {
        content += `Commessa: ${ore.commessa}\n`;
        content += `Data: ${ore.data}\n`;
        content += `Ora Inizio: ${ore.oraInizio}\n`;
        content += `Ora Fine: ${ore.oraFine}\n`;
        content += `Descrizione: ${ore.descrizione}\n\n`;
    });
    doc.text(content, 10, 10);
    doc.save('ore_lavorate.pdf');
}

// Funzione per generare un PDF delle commesse
function generaPDFCommesse() {
    const doc = new jsPDF();
    const commesse = JSON.parse(localStorage.getItem('commesse')) || [];
    let content = 'Commesse:\n\n';
    commesse.forEach(commessa => {
        content += `Nome Commessa: ${commessa.nomeCommessa}\n`;
        content += `Cliente: ${commessa.cliente}\n\n`;
    });
    doc.text(content, 10, 10);
    doc.save('commesse.pdf');
}

// Event listener per il caricamento della pagina
document.addEventListener('DOMContentLoaded', function () {
    // Gestione Login
    document.getElementById('btnLogin').addEventListener('click', gestisciLogin);

    // Gestione Logout
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
      console.log('Pulsante di logout trovato'); // Debug
        logoutButton.addEventListener('click', logout);
    } else {
        console.error('Pulsante di logout non trovato'); // Debug
    }
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
            commesse.push({ nomeCommessa, cliente });
            salvaDati();
            aggiornaTabellaCommesse();
            aggiornaMenuCommesse();
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
            const ruolo = document.getElementById('dipendenteRuolo').value; // Ottieni il ruolo
            dipendenti.push({ nome, cognome, email, password, ruolo: 'dipendente' });
            salvaDati();
            aggiornaTabellaDipendenti();
            document.getElementById('dipendenteNome').value = "";
            document.getElementById('dipendenteCognome').value = "";
            document.getElementById('dipendenteEmail').value = "";
            document.getElementById('dipendentePassword').value = "";
            document.getElementById('dipendenteRuolo').value = "dipendente"; 
        });
    }

    const oreForm = document.getElementById('oreForm');
if (oreForm) {
    oreForm.addEventListener('submit', function (e) {
        e.preventDefault();
        const commessa = document.getElementById('oreCommessa').value;
        const nomeDipendente = currentUser.name.split(" ")[0]; // Prende il nome
        const cognomeDipendente = currentUser.name.split(" ")[1]; // Prende il cognome
        const data = document.getElementById('oreData').value;
        const oraInizio = document.getElementById('oreInizio').value;
        const oraFine = document.getElementById('oreFine').value;
        const descrizione = document.getElementById('oreDescrizione').value;

        oreLavorate.push({ commessa,nomeDipendente,cognomeDipendente, data, oraInizio, oraFine, descrizione });
        salvaDati();

        // Pulisci i campi del form
        document.getElementById('oreCommessa').value = "";
        document.getElementById('dipendente').value = "";
        document.getElementById('oreData').value = "";
        document.getElementById('oreInizio').value = "";
        document.getElementById('oreFine').value = "";
        document.getElementById('oreDescrizione').value = "";

        alert('Ore lavorate registrate con successo!');
        aggiornaTabellaOreLavorate();
    });
}
// Filtri ore lavorate
    document.getElementById('filtriOreLavorate').addEventListener('submit', function (e) {
        e.preventDefault();
        applicaFiltri();
    });
    

});
function resetFiltri() {
    // Resetta i campi di input
    document.getElementById('filtroCommessa').value = "";
    document.getElementById('filtroDipendente').value = "";
    document.getElementById('filtroMese').value = "";

    // Mostra tutti i dati nella tabella
    aggiornaTabellaOreLavorate(oreLavorate);
}
function applicaFiltri() {
    const filtroCommessa = document.getElementById('filtroCommessa').value.trim().toLowerCase();
    const filtroDipendente = document.getElementById('filtroDipendente').value.trim().toLowerCase();
    const filtroMese = document.getElementById('filtroMese').value;

    const oreFiltrate = oreLavorate.filter(ore => {
        const corrispondeCommessa = filtroCommessa ? ore.commessa.toLowerCase().includes(filtroCommessa) : true;
        const corrispondeDipendente = filtroDipendente ? (ore.nomeDipendente.toLowerCase().includes(filtroDipendente) || ore.cognomeDipendente.toLowerCase().includes(filtroDipendente)) : true;
        const corrispondeMese = filtroMese ? ore.data.startsWith(filtroMese) : true;

        return corrispondeCommessa && corrispondeDipendente && corrispondeMese;
    });

    aggiornaTabellaOreLavorate(oreFiltrate);
}
function generaPDFFiltrato() {
    const filtroCommessa = document.getElementById('filtroCommessa').value.trim().toLowerCase();
    const filtroDipendente = document.getElementById('filtroDipendente').value.trim().toLowerCase();
    const filtroMese = document.getElementById('filtroMese').value;

    const oreFiltrate = oreLavorate.filter(ore => {
        const corrispondeCommessa = filtroCommessa ? ore.commessa.toLowerCase().includes(filtroCommessa) : true;
        const corrispondeDipendente = filtroDipendente ? (ore.nomeDipendente.toLowerCase().includes(filtroDipendente) || ore.cognomeDipendente.toLowerCase().includes(filtroDipendente)) : true;
        const corrispondeMese = filtroMese ? ore.data.startsWith(filtroMese) : true;

        return corrispondeCommessa && corrispondeDipendente && corrispondeMese;
    });

    const doc = new jsPDF();
    let content = 'Ore Lavorate Filtrate:\n\n';
    oreFiltrate.forEach(ore => {
        content += `Commessa: ${ore.commessa}\n`;
        content += `Dipendente: ${ore.nomeDipendente} ${ore.cognomeDipendente}\n`;
        content += `Data: ${ore.data}\n`;
        content += `Ora Inizio: ${ore.oraInizio}\n`;
        content += `Ora Fine: ${ore.oraFine}\n`;
        content += `Descrizione: ${ore.descrizione}\n\n`;
    });
    doc.text(content, 10, 10);
    doc.save('ore_lavorate_filtrate.pdf');
}