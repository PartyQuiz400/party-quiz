const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// Ρύθμιση Socket.IO με υποστήριξη CORS για Render
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Σερβίρισμα στατικών αρχείων από τον φάκελο public
app.use(express.static(path.join(__dirname, 'public')));

// Explicit Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/host.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/player.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Φόρτωση Ερωτήσεων
let rawQuestions = {};
try {
    const data = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');
    rawQuestions = JSON.parse(data);
    console.log("✅ Το αρχείο ερωτήσεων φορτώθηκε επιτυχώς!");
} catch (err) {
    console.error("❌ Σφάλμα κατά τη φόρτωση του questions.json:", err);
}

// Διαχείριση Δωματίων (Rooms State)
const rooms = {};

function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

io.on('connection', (socket) => {
    console.log('🔌 Νέα σύνδεση:', socket.id);

    // Δημιουργία Δωματίου από Host
    socket.on('create-room', () => {
        const roomId = generateRoomCode();
        rooms[roomId] = {
            hostId: socket.id,
            players: [],
            currentRound: 0,
            questionState: null,
            difficulty: 'easy'
        };
        socket.join(roomId);
        socket.emit('room-created', { roomId });
        console.log(`🏠 Δημιουργήθηκε το δωμάτιο: ${roomId}`);
    });

    // Είσοδος Παίκτη
    socket.on('join-room', ({ roomId, playerName }) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('error-msg', 'Το δωμάτιο δεν υπάρχει! Ελέγξτε τον κωδικό.');
            return;
        }

        const isFirstPlayer = room.players.length === 0;
        const player = {
            id: socket.id,
            name: playerName,
            score: 0,
            ready: false,
            isFirstPlayer: isFirstPlayer
        };

        room.players.push(player);
        socket.join(roomId);

        socket.emit('joined-successfully', {
            roomId,
            playerName,
            isFirstPlayer
        });

        io.to(room.hostId).emit('update-players', room.players);
        console.log(`👤 Ο παίκτης ${playerName} μπήκε στο δωμάτιο ${roomId}`);
    });

    // Ρύθμιση Δυσκολίας
    socket.on('set-difficulty', ({ roomId, difficulty }) => {
        const room = rooms[roomId];
        if (room) {
            room.difficulty = difficulty;
            io.to(room.hostId).emit('difficulty-updated', { difficulty });
        }
    });

    // Πάτημα Buzzer / Ready
    socket.on('press-buzzer', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.ready = true;
            io.to(room.hostId).emit('update-players', room.players);

            const allReady = room.players.every(p => p.ready);
            if (allReady && room.players.length > 0) {
                const chooser = room.players[Math.floor(Math.random() * room.players.length)];
                const categories = Object.keys(rawQuestions[room.difficulty] || rawQuestions['easy'] || {});
                
                room.players.forEach(p => {
                    io.to(p.id).emit('prompt-category-selection', {
                        isChooser: p.id === chooser.id,
                        chooserName: chooser.name,
                        categories: categories
                    });
                });
            }
        }
    });

    // Επιλογή Κατηγορίας
    socket.on('select-category', ({ roomId, category }) => {
        const room = rooms[roomId];
        if (!room) return;

        room.currentRound++;
        const categoryQuestions = (rawQuestions[room.difficulty] && rawQuestions[room.difficulty][category]) || [];
        const questionObj = categoryQuestions[Math.floor(Math.random() * categoryQuestions.length)];

        if (!questionObj) {
            io.to(roomId).emit('error-msg', 'Δεν βρέθηκαν ερωτήσεις για αυτή την κατηγορία!');
            return;
        }

        room.questionState = {
            category,
            question: questionObj.question,
            options: questionObj.options,
            correctIndex: questionObj.correctIndex,
            answers: {}
        };

        io.to(room.hostId).emit('new-question-host', {
            round: room.currentRound,
            category: category,
            question: questionObj.question,
            options: questionObj.options
        });

        io.to(roomId).emit('new-question', {
            round: room.currentRound,
            category: category,
            options: questionObj.options
        });
    });

    // Ενεργοποίηση Απαντήσεων (από τον Host)
    socket.on('enable-answers-host', ({ roomId }) => {
        io.to(roomId).emit('enable-answers');
    });

    // Υποβολή Απάντησης από Παίκτη
    socket.on('submit-answer', ({ roomId, answerIndex }) => {
        const room = rooms[roomId];
        if (!room || !room.questionState) return;

        room.questionState.answers[socket.id] = answerIndex;

        if (Object.keys(room.questionState.answers).length === room.players.length) {
            room.players.forEach(p => {
                const playerAns = room.questionState.answers[p.id];
                if (playerAns === room.questionState.correctIndex) {
                    p.score += 10;
                }
                p.ready = false;
                io.to(p.id).emit('update-single-player-score', { score: p.score });
            });

            io.to(room.hostId).emit('round-results', {
                correctIndex: room.questionState.correctIndex,
                players: room.players
            });

            io.to(roomId).emit('round-ended');
        }
    });

    // Αποσύνδεση
    socket.on('disconnect', () => {
        console.log('❌ Αποσύνδεση:', socket.id);
        for (const roomId in rooms) {
            const room = rooms[roomId];
            room.players = room.players.filter(p => p.id !== socket.id);
            io.to(room.hostId).emit('update-players', room.players);
        }
    });
});

// Η θύρα ορίζεται δυναμικά από το Render μέσω της μεταβλητής process.env.PORT
const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Ο διακομιστής τρέχει στη θύρα ${PORT}`);
});
