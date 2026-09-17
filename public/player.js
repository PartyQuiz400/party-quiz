const socket = io();

// Παράμετροι από το URL (π.χ. player.html?room=1234&name=Nikos)
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const playerName = urlParams.get('name');

// Σύνδεση στο δωμάτιο
if (roomId) {
    socket.emit('join-room', { roomId, playerName });
}

// 1. Επιτυχής Σύνδεση
socket.on('joined-successfully', (data) => {
    console.log(`Συνδέθηκες στο δωμάτιο: ${data.roomId} ως ${data.playerName}`);
});

// 2. Ενημέρωση Ready / Buzzer αναμονής
socket.on('ready-update', (data) => {
    const readyStatus = document.getElementById('ready-status');
    if (readyStatus) {
        readyStatus.innerText = `Έτοιμοι παίκτες: ${data.readyCount} / ${data.totalCount}`;
    }
});

// 3. Έναρξη παιχνιδιού
socket.on('game-started-signal', () => {
    hideAllScreens();
    showScreen('waiting-screen');
});

// 4. Εισαγωγή Γύρου
socket.on('show-round-intro', (data) => {
    hideAllScreens();
    showScreen('round-intro-screen');
    setText('round-title', data.modeName);
    setText('round-desc', data.desc);
});

// 5. Επιλογή Κατηγορίας
socket.on('prompt-category-selection', (data) => {
    hideAllScreens();
    showScreen('category-screen');

    const container = document.getElementById('categories-container');
    const title = document.getElementById('category-title');

    if (data.isChooser) {
        if (title) title.innerText = "Διάλεξε κατηγορία:";
        if (container) {
            container.innerHTML = '';
            data.categories.forEach(cat => {
                const btn = document.createElement('button');
                btn.className = 'btn-category';
                btn.innerText = cat;
                btn.onclick = () => {
                    socket.emit('select-category', { roomId, category: cat });
                };
                container.appendChild(btn);
            });
        }
    } else {
        if (title) title.innerText = `Ο παίκτης ${data.chooserName} επιλέγει κατηγορία...`;
        if (container) container.innerHTML = '<p class="loader">Περιμένετε...</p>';
    }
});

// 6. Νέα Ερώτηση
socket.on('new-question', (data) => {
    hideAllScreens();
    showScreen('question-screen');

    setText('question-text', data.question);
    
    // Εμφάνιση / Απόκρυψη Buzzer αν είναι ο 2ος γύρος
    const buzzerBtn = document.getElementById('buzzer-btn');
    const optionsContainer = document.getElementById('options-container');

    if (data.round === 2) {
        if (buzzerBtn) buzzerBtn.style.display = 'block';
        if (optionsContainer) optionsContainer.style.display = 'none';
    } else {
        if (buzzerBtn) buzzerBtn.style.display = 'none';
        if (optionsContainer) optionsContainer.style.display = 'grid';
    }

    // Δημιουργία Κουμπιών Απαντήσεων
    if (optionsContainer) {
        optionsContainer.innerHTML = '';
        data.options.forEach((opt, index) => {
            const btn = document.createElement('button');
            btn.className = 'btn-option';
            btn.innerText = opt;
            btn.disabled = false;
            btn.onclick = () => {
                disableAllOptions();
                socket.emit('submit-answer', { roomId, answerIndex: index });
            };
            optionsContainer.appendChild(btn);
        });
    }
});

// 7. Πάτημα Buzzer στον 2ο γύρο
function pressBuzzer() {
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

// 8. Χρονόμετρο (π.χ. Γύρος 4 - 2s)
socket.on('timer-tick', (timeLeft) => {
    setText('timer-display', `${timeLeft}s`);
});

// 9. Αποτέλεσμα Απάντησης
socket.on('answer-recorded', (data) => {
    const statusText = document.getElementById('answer-status');
    if (statusText) {
        statusText.innerText = data.isCorrect ? "✅ Σωστό!" : "❌ Λάθος!";
    }
});

// 10. Εμφάνιση Σωστής Απάντησης
socket.on('show-answer', (data) => {
    const optionsContainer = document.getElementById('options-container');
    if (optionsContainer) {
        const buttons = optionsContainer.getElementsByClassName('btn-option');
        if (buttons[data.correctIndex]) {
            buttons[data.correctIndex].classList.add('correct-answer');
        }
    }
});

// 11. Τέλος Γύρου / Κατάταξη
socket.on('round-ended', (data) => {
    hideAllScreens();
    showScreen('round-end-screen');
    setText('round-quote', data.quote);
});

// 12. Χρονόμετρο Τελικού (Round 6)
socket.on('update-final-timer', (players) => {
    const me = players.find(p => p.id === socket.id);
    if (me) {
        setText('final-timer-display', `Χρόνος: ${me.timeLeft}s`);
        if (me.eliminated) {
            setText('answer-status', "☠️ Αποκλείστηκες!");
            disableAllOptions();
        }
    }
});

// 13. GAME OVER (Εμφάνιση Νικητή στο Κινητό)
socket.on('game-over', (data) => {
    hideAllScreens();
    showScreen('game-over-screen');

    setText('winner-name', data.winnerName);
    setText('winner-quote', data.quote);
});

// Βοηθητικές Συναρτήσεις UI
function hideAllScreens() {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => s.style.display = 'none');
}

function showScreen(id) {
    const screen = document.getElementById(id);
    if (screen) screen.style.display = 'block';
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.innerText = text;
}

function disableAllOptions() {
    const buttons = document.querySelectorAll('.btn-option');
    buttons.forEach(btn => btn.disabled = true);
}
