const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.static(path.join(__dirname, 'public')));

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

const rooms = {};

function generateRoomCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

io.on('connection', (socket) => {
    console.log('🔌 Νέα σύνδεση:', socket.id);

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
    });

    socket.on('join-room', ({ roomId, playerName }) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('error-msg', 'Το δωμάτιο δεν υπάρχει!');
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
    });

    socket.on('set-difficulty', ({ roomId, difficulty }) => {
        const room = rooms[roomId];
        if (room) {
            room.difficulty = difficulty.toLowerCase();
            io.to(room.hostId).emit('difficulty-updated', { difficulty: room.difficulty });
        }
    });

    socket.on('press-buzzer', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.ready = true;
            io.to(room.hostId).emit('update-players', room.players);

            // Αν όλοι είναι έτοιμοι, επιλέγουμε τυχαία έναν παίκτη να διαλέξει κατηγορία
            const allReady = room.players.every(p => p.ready);
            if (allReady && room.players.length > 0) {
                const chooser = room.players[Math.floor(Math.random() * room.players.length)];
                
                // Παίρνουμε τις κατηγορίες βάσει της δυσκολίας
                const diffData = rawQuestions[room.difficulty] || rawQuestions['easy'] || {};
                const categories = Object.keys(diffData);

                // Ειδοποίηση Host
                io.to(room.hostId).emit('category-selection-started', { chooserName: chooser.name });

                // Ειδοποίηση Παικτών
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

    socket.on('select-category', ({ roomId, category }) => {
        const room = rooms[roomId];
        if (!room) return;

        room.currentRound++;
        const diffData = rawQuestions[room.difficulty] || rawQuestions['easy'] || {};
        const categoryQuestions = diffData[category] || [];
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

        // Αποστολή στον Host (περιλαμβάνει και τη σωστή απάντηση)
        io.to(room.hostId).emit('new-question-host', {
            round: room.currentRound,
            category: category,
            question: questionObj.question,
            options: questionObj.options
        });

        // Αποστολή στους Παίκτες
        io.to(roomId).emit('new-question', {
            round: room.currentRound,
            category: category,
            options: questionObj.options
        });
    });

    socket.on('enable-answers-host', ({ roomId }) => {
        io.to(roomId).emit('enable-answers');
    });

    socket.on('submit-answer', ({ roomId, answerIndex }) => {
        const room = rooms[roomId];
        if (!room || !room.questionState) return;

        room.questionState.answers[socket.id] = answerIndex;

        // Όταν απαντήσουν όλοι οι παίκτες
        if (Object.keys(room.questionState.answers).length === room.players.length) {
            room.players.forEach(p => {
                const playerAns = room.questionState.answers[p.id];
                if (playerAns === room.questionState.correctIndex) {
                    p.score += 10;
                }
                p.ready = false; // Reset ready status για τον επόμενο γύρο
                io.to(p.id).emit('update-single-player-score', { score: p.score });
            });

            io.to(room.hostId).emit('round-results', {
                correctIndex: room.questionState.correctIndex,
                players: room.players
            });

            io.to(roomId).emit('round-ended');
        }
    });

    socket.on('disconnect', () => {
        for (const roomId in rooms) {
            const room = rooms[roomId];
            room.players = room.players.filter(p => p.id !== socket.id);
            io.to(room.hostId).emit('update-players', room.players);
        }
    });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Ο διακομιστής τρέχει στη θύρα ${PORT}`);
});
