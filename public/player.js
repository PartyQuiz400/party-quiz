const socket = io();

// Παράμετροι από το URL (QR code scan)
const urlParams = new URLSearchParams(window.location.search);
const roomIdFromUrl = urlParams.get('room');

// Αν υπάρχει room στο URL, το συμπληρώνουμε αυτόματα στο input
if (roomIdFromUrl) {
    const roomInput = document.getElementById('input-room');
    if (roomInput) roomInput.value = roomIdFromUrl;
}

// Χειροκίνητη Σύνδεση με κουμπί
function joinGame() {
    const roomId = document.getElementById('input-room').value.trim();
    const playerName = document.getElementById('input-name').value.trim();

    if (!roomId || !playerName) {
        alert("Παρακαλώ συμπληρώστε Κωδικό Δωματίου και Όνομα!");
        return;
    }

    socket.emit('join-room', { roomId, playerName });
}

// 1. Επιτυχής Σύνδεση -> Μετάβαση στην Αναμονή
socket.on('joined-successfully', (data) => {
    hideAllScreens();
    showScreen('waiting-screen');
    setText('player-welcome', `Καλωσήρθες ${data.playerName}!`);
});

// 2. Πατώντας Ready στο Lobby
function sendReady() {
    const roomId = document.getElementById('input-room').value.trim();
    socket.emit('player-ready', { roomId });
    const btn = document.getElementById('ready-buzzer-btn');
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.innerText = "READY!";
    }
}

// 3. Ενημέρωση Ready
socket.on('ready-update', (data) => {
    setText('ready-status', `Έτοιμοι παίκτες: ${data.readyCount} / ${data.totalCount}`);
});

// 4. Επιλογή Κατηγορίας
socket.on('prompt-category-selection', (data) => {
    hideAllScreens();
    showScreen('category-screen');

    const container = document.getElementById('categories-container');
    const title = document.getElementById('category-title');
    const roomId = document.getElementById('input-room').value.trim();

    if (data.isChooser) {
        if (title) title.innerText = "Διάλεξε κατηγορία:";
        if (container) {
            container.innerHTML = '';
            data.categories.forEach(cat => {
                const btn = document.createElement('button');
                btn.className = 'btn-option';
                btn.style.background = '#007bb5';
                btn.innerText = cat;
                btn.onclick = () => {
                    socket.emit('select-category', { roomId, category: cat });
                };
                container.appendChild(btn);
            });
        }
    } else {
        if (title) title.innerText = `Ο παίκτης ${data.chooserName} επιλέγει κατηγορία...`;
        if (container) container.innerHTML = '<p>Περιμένετε...</p>';
    }
});

// 5. Νέα Ερώτηση
socket.on('new-question', (data) => {
    hideAllScreens();
    showScreen('question-screen');
    setText('answer-status', '');

    const buzzerBtn = document.getElementById('buzzer-btn');
    const optionsContainer = document.getElementById('options-container');

    if (data.round === 2) {
        if (buzzerBtn) {
            buzzerBtn.style.display = 'block';
            buzzerBtn.disabled = false;
        }
        if (optionsContainer) optionsContainer.style.display = 'none';
    } else {
        if (buzzerBtn) buzzerBtn.style.display = 'none';
        if (optionsContainer) optionsContainer.style.display = 'grid';
    }

    if (optionsContainer) {
        optionsContainer.innerHTML = '';
        const roomId = document.getElementById('input-room').value.trim();
        data.options.forEach((opt, index) => {
            const btn = document.createElement('button');
            btn.className = 'btn-option';
            btn.style.background = '#1f2833';
            btn.innerText = opt;
            btn.onclick = () => {
                disableAllOptions();
                socket.emit('submit-answer', { roomId, answerIndex: index });
            };
            optionsContainer.appendChild(btn);
        });
    }
});

// 6. Buzzer
function pressBuzzer() {
    const roomId = document.getElementById('input-room').value.trim();
    socket.emit('press-buzzer', { roomId });
}

socket.on('player-buzzed', (data) => {
    const buzzerBtn = document.getElementById('buzzer-btn');
    const optionsContainer = document.getElementById('options-container');

    if (data.playerId === socket.id) {
        if (buzzerBtn) buzzerBtn.style.display = 'none';
        if (optionsContainer) optionsContainer.style.display = 'grid';
    } else {
        if (buzzerBtn) buzzerBtn.disabled = true;
    }
});

// 7. Timer & Game State
socket.on('timer-tick', (timeLeft) => {
    setText('timer-display', `${timeLeft}s`);
});

socket.on('answer-recorded', (data) => {
    setText('answer-status', data.isCorrect ? "✅ Σωστό!" : "❌ Λάθος!");
});

socket.on('round-ended', (data) => {
    hideAllScreens();
    showScreen('round-end-screen');
    setText('round-quote', data.quote);
});

socket.on('game-over', (data) => {
    hideAllScreens();
    showScreen('game-over-screen');
    setText('winner-name', data.winnerName);
    setText('winner-quote', data.quote);
});

// Βοηθητικές Συναρτήσεις UI
function hideAllScreens() {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
}

function showScreen(id) {
    const screen = document.getElementById(id);
    if (screen) {
        screen.classList.add('active');
        screen.style.display = 'block';
    }
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function disableAllOptions() {
    const buttons = document.querySelectorAll('.btn-option');
    buttons.forEach(btn => btn.disabled = true);
}
