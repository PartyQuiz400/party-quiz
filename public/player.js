const socket = io();

const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');

let myPlayerName = '';
let isFirstPlayer = false;
let answersDisabled = true;

function joinGame() {
    const nameInput = document.getElementById('player-name').value.trim();
    if (!nameInput) return alert('Παρακαλώ εισάγετε όνομα!');

    if (!roomId) {
        roomId = prompt('Εισάγετε τον 4-ψήφιο κωδικό δωματίου:');
    }

    if (!roomId) return;

    myPlayerName = nameInput;
    socket.emit('join-room', { roomId, playerName: myPlayerName });
}

socket.on('joined-successfully', (data) => {
    document.getElementById('join-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'block';

    document.getElementById('player-title').innerText = data.playerName;
    isFirstPlayer = data.isFirstPlayer;

    if (isFirstPlayer) {
        document.getElementById('first-player-options').style.display = 'block';
    }
});

function setDifficulty(level, btnElement) {
    document.querySelectorAll('.btn-diff').forEach(b => b.classList.remove('selected'));
    btnElement.classList.add('selected');
    socket.emit('set-difficulty', { roomId, difficulty: level });
}

function pressBuzzer() {
    socket.emit('press-buzzer', { roomId });
}

socket.on('game-started-signal', () => {
    document.getElementById('lobby-status-text').innerText = 'Το παιχνίδι ξεκίνησε!';
    document.getElementById('first-player-options').style.display = 'none';
});

socket.on('prompt-category-selection', (data) => {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('quiz-screen').style.display = 'none';
    document.getElementById('category-screen').style.display = 'block';

    const container = document.getElementById('category-buttons-container');
    container.innerHTML = '';

    if (data.isChooser) {
        document.getElementById('category-prompt-text').innerText = '🎯 Επιλέξτε Κατηγορία:';
        data.categories.forEach((cat, idx) => {
            const btn = document.createElement('button');
            btn.className = `btn btn-${idx}`;
            btn.innerText = cat;
            btn.onclick = () => {
                socket.emit('select-category', { roomId, category: cat });
                document.getElementById('category-screen').style.display = 'none';
            };
            container.appendChild(btn);
        });
    } else {
        document.getElementById('category-prompt-text').innerText = `⏳ Ο/Η "${data.chooserName}" επιλέγει κατηγορία...`;
    }
});

socket.on('new-question', (data) => {
    document.getElementById('category-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('quiz-screen').style.display = 'block';

    document.getElementById('question-wait-text').innerText = '🎧 Ακούστε την ερώτηση στην οθόνη...';
    answersDisabled = true;

    const container = document.getElementById('answers-container');
    container.innerHTML = '';

    data.options.forEach((opt, idx) => {
        const btn = document.createElement('button');
        btn.className = `btn btn-${idx}`;
        btn.id = `ans-btn-${idx}`;
        btn.innerText = opt;
        btn.disabled = true; // Αρχικά απενεργοποιημένα μέχρι να ολοκληρωθεί η εκφώνηση

        btn.onclick = () => {
            if (answersDisabled) return;
            
            // Κλειδώνουμε όλες τις απαντήσεις αλλάΔΕΝ τις κρύβουμε/εξαφανίζουμε
            document.querySelectorAll('#answers-container .btn').forEach(b => b.disabled = true);
            btn.classList.add('selected-answer');

            socket.emit('submit-answer', { roomId, answerIndex: idx });
        };

        container.appendChild(btn);
    });
});

socket.on('enable-answers', () => {
    answersDisabled = false;
    document.getElementById('question-wait-text').innerText = '⚡ Απαντήστε ΤΩΡΑ!';
    document.querySelectorAll('#answers-container .btn').forEach(b => b.disabled = false);
});

socket.on('update-single-player-score', (data) => {
    const text = (data.timeLeft !== undefined && data.timeLeft > 0) ? `Χρόνος: ${data.timeLeft}s` : `Πόντοι: ${data.score}`;
    document.getElementById('score-display').innerText = text;
    document.getElementById('game-score-display').innerText = text;
});

socket.on('round-ended', () => {
    document.getElementById('quiz-screen').style.display = 'none';
    document.getElementById('category-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'block';
    document.getElementById('lobby-status-text').innerText = 'Αναμονή για τον επόμενο γύρο...';
});

socket.on('game-over', () => {
    document.getElementById('quiz-screen').style.display = 'none';
    document.getElementById('category-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'block';
    document.getElementById('lobby-status-text').innerText = '🏆 Το παιχνίδι ολοκληρώθηκε!';
});
