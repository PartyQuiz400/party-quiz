const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// 1. ΦΟΡΤΩΣΗ ΕΡΩΤΗΣΕΩΝ
let localQuestions = {};
try {
    const rawData = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');
    localQuestions = JSON.parse(rawData);
    console.log("✅ Οι τοπικές ερωτήσεις φορτώθηκαν με επιτυχία!");
} catch (err) {
    console.error("❌ Σφάλμα κατά τη φόρτωση του questions.json:", err.message);
}

function getQuestionsByCategory(categoryName, amount = 3) {
    const categoryQuestions = localQuestions[categoryName] || [];
    if (categoryQuestions.length === 0) {
        return [{
            q: "Ποια είναι η πρωτεύουσα της Ελλάδας;",
            options: ["Θεσσαλονίκη", "Αθήνα", "Πάτρα", "Ηράκλειο"],
            correct: 1
        }];
    }
    const shuffled = [...categoryQuestions].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, amount);
}

function getRandomCategories(count = 4) {
    const keys = Object.keys(localQuestions);
    if (keys.length === 0) {
        return ["Γενικές Γνώσεις", "Σινεμά & Ταινίες", "Μουσική", "Αθλητικά"];
    }
    const shuffled = keys.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}

// 2. QUOTES & ΠΑΡΟΥΣΙΑΣΗ
const INTRO_QUOTES = [
    "Δεν σε βλέπω να φτάνεις στον τελικό, {last}... Εκτός αν παίζουμε με ανάποδη βαθμολογία.",
    "Πάλι καλά που διάβασες κι εσύ στο δημοτικό, {first}! Οι υπόλοιποι μάλλον κάνατε κοπάνες.",
    "{last}, αν το πάθος σου ήταν πόντοι, τώρα θα ήσουν... πάλι τελευταίος.",
    "{first}, χαλάρωσε λίγο, άφησε και καμία σωστή απάντηση για τους υπόλοιπους!",
    "Μια θερμή παράκληση στον {last}: Πατήστε και κανένα κουμπί, δεν δαγκώνει!",
    "Ο {first} οδηγεί την κούρσα, ενώ ο {last} απλά απολαμβάνει τη διαδρομή.",
    "{last}, μην ανησυχείς! Η συμμετοχή μετράει... (λέμε τώρα).",
    "{first}, μήπως έχεις ανοιχτό το Google δίπλα;",
    "Ο {last} παίζει τακτική: Αφήνει τους άλλους να κουραστούν για να χτυπήσει στο τέλος!",
    "Συγχαρητήρια στον {first}! Στον {last}, απλά... υπομονή."
];

const WINNER_QUOTES = [
    "Πρωταθλητής ο {winner}! Τους ισοπέδωσες όλους!",
    "Ο {winner} σηκώνει την κούπα! Οι υπόλοιποι απλά χειροκροτήστε.",
    "Μεγάλος νικητής ο {winner}! Τελικά το Google search απέδωσε καρπούς.",
    "{winner}, η δόξα σου ανήκει! Όλοι οι άλλοι για κλάματα.",
    "Ο {winner} έδειξε ποιος είναι το αφεντικό στο PartyQuiz!"
];

const RANK_SETS = [
    ["Νικητής του πολέμου (μέχρι στιγμής)", "Μια ανάσα από την κορυφή", "Προσπαθεί να φτάσει, αλλά δεν ακουμπά", "Ακολουθεί ιδρωμένος...", "Ουραγός της αμάξης", "Συμμετέχει απλά για την ατμόσφαιρα"],
    ["Το 'σπασικλάκι' της παρέας", "Ο πρώτος των χαμένων", "Χρυσή μετριότητα", "Χαμένος στη μετάφραση", "Εγκεφαλικά απών", "Τουλάχιστον έχει καλή προσωπικότητα"],
    ["Πρωταθλητής με διαφορά", "Στη γωνία για την ανατροπή", "Στο ταμπλό με τα προβλήματα", "Έμεινε από βενζίνη", "Έχασε το λεωφορείο", "Ψάχνει ακόμα πού είναι το γήπεδο"]
];

function getRandomQuote(firstPlayerName, lastPlayerName) {
    const randomQuote = INTRO_QUOTES[Math.floor(Math.random() * INTRO_QUOTES.length)];
    return randomQuote.replace(/{first}/g, firstPlayerName).replace(/{last}/g, lastPlayerName);
}

function getWinnerQuote(winnerName) {
    const randomQuote = WINNER_QUOTES[Math.floor(Math.random() * WINNER_QUOTES.length)];
    return randomQuote.replace(/{winner}/g, winnerName);
}

function getFormattedStandings(players) {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const randomSet = RANK_SETS[Math.floor(Math.random() * RANK_SETS.length)];
    
    return sorted.map((player, index) => {
        const title = randomSet[index] || randomSet[randomSet.length - 1];
        return { rank: index + 1, name: player.name, score: player.score, title: title };
    });
}

// 3. GAME LOGIC
const MAX_PLAYERS = 12;
const rooms = {};

const ROUND_MODES = [
    { id: 1, name: "Γύρος 1: Γρήγορο Δάχτυλο", desc: "Όσο πιο γρήγορα απαντάτε, τόσο περισσότερους πόντους κερδίζετε!" },
    { id: 2, name: "Γύρος 2: Μάχη Buzzer", desc: "Πατήστε πρώτοι το Κόκκινο Buzzer για να κλειδώσετε την απάντηση!" },
    { id: 3, name: "Γύρος 3: Κλέψιμο Πόντων", desc: "Με σωστή απάντηση κλέβετε 20 πόντους από τον 1ο στην κατάταξη!" },
    { id: 4, name: "Γύρος 4: Αντίστροφη Μέτρηση (10s)", desc: "Έχετε 10 δευτερόλεπτα για κάθε ερώτηση!" },
    { id: 5, name: "Γύρος 5: Διπλοί Πόντοι", desc: "Όλοι οι πόντοι διπλασιάζονται σε αυτόν τον γύρο!" },
    { id: 6, name: "Γύρος 6 (ΤΕΛΙΚΟΣ): Time Attack", desc: "Σωστό = +5s, Λάθος = -10s! Στους 2 παίκτες, ο πιο γρήγορος κλέβει +5s!" }
];

io.on('connection', (socket) => {

    socket.on('create-room', (roomId) => {
        socket.join(roomId);
        rooms[roomId] = {
            hostId: socket.id,
            players: {},
            gameStarted: false,
            currentCategoryName: null,
            loadedQuestions: [],
            currentQuestionIndex: 0,
            questionActive: false,
            currentRound: 1,
            maxQuestionsPerRound: 3,
            correctAnswersOrder: 0,
            buzzedPlayerId: null,
            timer: null,
            finalRoundInterval: null,
            autoNextTimeout: null,
            chooserPlayerId: null,
            finalCorrectOrder: 0
        };
        console.log(`Δημιουργήθηκε δωμάτιο: ${roomId}`);
    });

    socket.on('join-room', ({ roomId, playerName }) => {
        const room = rooms[roomId];
        if (!room) return;

        const currentPlayersCount = Object.keys(room.players).length;
        if (currentPlayersCount >= MAX_PLAYERS) return;

        socket.join(roomId);
        room.players[socket.id] = {
            id: socket.id,
            name: playerName || `Παίκτης ${currentPlayersCount + 1}`,
            score: 0,
            timeLeft: 0,
            hasAnswered: false,
            buzzed: false,
            isReady: false,
            eliminated: false
        };

        const playersList = Object.values(room.players);
        const readyCount = playersList.filter(p => p.isReady).length;

        socket.emit('joined-successfully', { roomId, playerName: room.players[socket.id].name });
        io.to(room.hostId).emit('update-players', playersList);
        io.to(roomId).emit('ready-update', { readyCount, totalCount: playersList.length });
    });

    socket.on('press-buzzer', ({ roomId }) => {
        const room = rooms[roomId];
        if (!room) return;

        if (!room.gameStarted) {
            const player = room.players[socket.id];
            if (player) {
                player.isReady = true;
                const playersList = Object.values(room.players);
                const readyCount = playersList.filter(p => p.isReady).length;

                io.to(roomId).emit('ready-update', { readyCount, totalCount: playersList.length });
                io.to(room.hostId).emit('update-players', playersList);

                if (readyCount === playersList.length && playersList.length > 0) {
                    room.gameStarted = true;
                    io.to(roomId).emit('game-started-signal');
                    startRoundFlow(roomId);
                }
            }
            return;
        }

        if (room.questionActive) {
            const roundMode = ROUND_MODES[room.currentRound - 1];
            if (roundMode.id === 2 && !room.buzzedPlayerId) {
                room.buzzedPlayerId = socket.id;
                room.players[socket.id].buzzed = true;

                io.to(roomId).emit('player-buzzed', {
                    playerId: socket.id,
                    playerName: room.players[socket.id].name
                });
            }
        }
    });

    function startRoundFlow(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        if (room.autoNextTimeout) clearTimeout(room.autoNextTimeout);

        const roundMode = ROUND_MODES[room.currentRound - 1];

        io.to(roomId).emit('show-round-intro', {
            round: room.currentRound,
            modeName: roundMode.name,
            desc: roundMode.desc
        });

        setTimeout(() => {
            prepareCategorySelection(roomId);
        }, 3500);
    }

    function prepareCategorySelection(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        const round = room.currentRound;
        const playerList = Object.values(room.players);
        if (playerList.length === 0) return;

        let chooser = null;

        if (round === 1 || round === 4) {
            chooser = playerList[Math.floor(Math.random() * playerList.length)];
        } else if (round === 2 || round === 5) {
            const sorted = [...playerList].sort((a, b) => a.score - b.score);
            chooser = sorted[0];
        } else if (round === 3) {
            const sorted = [...playerList].sort((a, b) => b.score - a.score);
            chooser = sorted[0];
        } else if (round === 6) {
            room.currentCategoryName = "Γενικές Γνώσεις";
            room.currentQuestionIndex = 0;
            startFinalRound(roomId);
            return;
        }

        room.chooserPlayerId = chooser ? chooser.id : null;
        const categories = getRandomCategories(4);

        io.to(room.hostId).emit('show-category-options-host', {
            categories,
            chooserName: chooser ? chooser.name : '',
            round: round
        });

        Object.values(room.players).forEach(p => {
            const isChooser = (p.id === room.chooserPlayerId);
            io.to(p.id).emit('prompt-category-selection', {
                isChooser,
                chooserName: chooser ? chooser.name : '',
                categories: isChooser ? categories : []
            });
        });
    }

    socket.on('select-category', ({ roomId, category }) => {
        const room = rooms[roomId];
        if (!room) return;

        room.currentCategoryName = category;
        room.currentQuestionIndex = 0;
        room.loadedQuestions = getQuestionsByCategory(category, room.maxQuestionsPerRound);

        if (room.currentRound === 6) {
            startFinalRound(roomId);
        } else {
            sendQuestion(roomId);
        }
    });

    function sendQuestion(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        if (room.timer) clearInterval(room.timer);

        if (room.currentQuestionIndex < room.loadedQuestions.length) {
            const q = room.loadedQuestions[room.currentQuestionIndex];
            room.questionActive = true;
            room.correctAnswersOrder = 0;
            room.buzzedPlayerId = null;

            Object.keys(room.players).forEach(id => {
                room.players[id].hasAnswered = false;
                room.players[id].buzzed = false;
            });

            const roundMode = ROUND_MODES[room.currentRound - 1];

            io.to(roomId).emit('new-question', {
                question: q.q,
                options: q.options,
                questionNum: room.currentQuestionIndex + 1,
                totalQuestions: room.loadedQuestions.length,
                round: room.currentRound,
                roundMode: roundMode,
                category: room.currentCategoryName
            });

            if (roundMode.id === 4) {
                let timeLeft = 10;
                io.to(roomId).emit('timer-tick', timeLeft);
                room.timer = setInterval(() => {
                    timeLeft--;
                    io.to(roomId).emit('timer-tick', timeLeft);
                    if (timeLeft <= 0) {
                        clearInterval(room.timer);
                        revealAnswerAndNext(roomId, q.correct);
                    }
                }, 1000);
            }
        } else {
            room.currentRound++;
            
            if (room.currentRound === 6) {
                Object.values(room.players).forEach(p => {
                    p.timeLeft = Math.max(10, p.score);
                });
            }

            const playersList = Object.values(room.players);
            const sortedPlayers = [...playersList].sort((a, b) => b.score - a.score);
            
            const firstPlayer = sortedPlayers[0] ? sortedPlayers[0].name : "Παίκτης 1";
            const lastPlayer = sortedPlayers[sortedPlayers.length - 1] ? sortedPlayers[sortedPlayers.length - 1].name : "Παίκτης";

            const funQuote = getRandomQuote(firstPlayer, lastPlayer);
            const standingsWithTitles = getFormattedStandings(playersList);

            io.to(roomId).emit('round-ended', {
                standings: standingsWithTitles,
                quote: funQuote,
                nextRound: room.currentRound,
                nextMode: ROUND_MODES[room.currentRound - 1],
                autoStartSeconds: 15
            });

            if (room.autoNextTimeout) clearTimeout(room.autoNextTimeout);
            room.autoNextTimeout = setTimeout(() => {
                startRoundFlow(roomId);
            }, 15000);
        }
    }

    function revealAnswerAndNext(roomId, correctIndex) {
        const room = rooms[roomId];
        if (!room) return;

        room.questionActive = false;
        io.to(roomId).emit('show-answer', { correctIndex });

        setTimeout(() => {
            if (room.currentRound === 6) {
                sendFinalQuestion(roomId);
            } else {
                nextQuestionInternal(roomId);
            }
        }, 2200);
    }

    function startFinalRound(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        room.loadedQuestions = getQuestionsByCategory("Γενικές Γνώσεις", 25);
        sendFinalQuestion(roomId);

        if (room.finalRoundInterval) clearInterval(room.finalRoundInterval);
        room.finalRoundInterval = setInterval(() => {
            let activePlayers = [];

            Object.values(room.players).forEach(p => {
                if (!p.eliminated) {
                    p.timeLeft--;
                    if (p.timeLeft <= 0) {
                        p.timeLeft = 0;
                        p.eliminated = true;
                    } else {
                        activePlayers.push(p);
                    }
                }
            });

            io.to(roomId).emit('update-final-timer', Object.values(room.players));

            if (activePlayers.length <= 1) {
                clearInterval(room.finalRoundInterval);
                room.questionActive = false;
                
                const winner = activePlayers[0] || Object.values(room.players).sort((a,b) => b.timeLeft - a.timeLeft)[0];
                const winnerQuote = getWinnerQuote(winner ? winner.name : "Κανένας");

                io.to(roomId).emit('game-over', {
                    players: Object.values(room.players),
                    winnerName: winner ? winner.name : "Κανένας",
                    quote: winnerQuote
                });
            }
        }, 1000);
    }

    function sendFinalQuestion(roomId) {
        const room = rooms[roomId];
        if (!room) return;

        if (room.currentQuestionIndex >= room.loadedQuestions.length) {
            room.currentQuestionIndex = 0;
        }

        const q = room.loadedQuestions[room.currentQuestionIndex];
        room.currentQuestionIndex++;

        room.questionActive = true;
        room.finalCorrectOrder = 0;

        Object.keys(room.players).forEach(id => {
            room.players[id].hasAnswered = false;
        });

        io.to(roomId).emit('new-question', {
            question: q.q,
            options: q.options,
            round: 6,
            roundMode: ROUND_MODES[5],
            category: "ΤΕΛΙΚΟΣ"
        });

        room.currentFinalQ = q;
    }

    socket.on('submit-answer', ({ roomId, answerIndex }) => {
        const room = rooms[roomId];
        if (!room || !room.questionActive) return;

        const player = room.players[socket.id];
        if (!player || player.hasAnswered || player.eliminated) return;

        player.hasAnswered = true;

        if (room.currentRound === 6) {
            const isCorrect = (answerIndex === room.currentFinalQ.correct);
            const activePlayers = Object.values(room.players).filter(p => !p.eliminated);

            if (isCorrect) {
                player.timeLeft += 5;

                if (activePlayers.length === 2 && room.finalCorrectOrder === 0) {
                    const sortedTwo = [...activePlayers].sort((a,b) => b.timeLeft - a.timeLeft);
                    const leader = sortedTwo[0];
                    
                    if (leader.id !== player.id && leader.timeLeft >= 5) {
                        leader.timeLeft -= 5;
                        player.timeLeft += 5;
                    }
                }
                room.finalCorrectOrder++;
            } else {
                player.timeLeft = Math.max(0, player.timeLeft - 10);
                if (player.timeLeft === 0) player.eliminated = true;
            }

            socket.emit('answer-recorded', { isCorrect });
            socket.emit('update-single-player-score', { score: player.score, timeLeft: player.timeLeft });
            io.to(room.hostId).emit('update-players', Object.values(room.players));

            const remainingActive = Object.values(room.players).filter(p => !p.eliminated);
            const allAnswered = remainingActive.every(p => p.hasAnswered);

            if (allAnswered && remainingActive.length > 0) {
                revealAnswerAndNext(roomId, room.currentFinalQ.correct);
            }
            return;
        }

        const roundMode = ROUND_MODES[room.currentRound - 1];
        const currentQ = room.loadedQuestions[room.currentQuestionIndex];
        const isCorrect = (answerIndex === currentQ.correct);

        if (roundMode.id === 1) {
            if (isCorrect) {
                const pointsTable = [30, 20, 10];
                player.score += pointsTable[room.correctAnswersOrder] || 10;
                room.correctAnswersOrder++;
            }
        } else if (roundMode.id === 2) {
            if (socket.id === room.buzzedPlayerId) {
                if (isCorrect) player.score += 30;
                else player.score = Math.max(0, player.score - 10);
                room.questionActive = false;
            }
        } else if (roundMode.id === 3) {
            if (isCorrect) {
                player.score += 20;
                const others = Object.values(room.players).filter(p => p.id !== socket.id).sort((a,b) => b.score - a.score);
                if (others.length > 0 && others[0].score >= 20) others[0].score -= 20;
            }
        } else if (roundMode.id === 4) {
            if (isCorrect) player.score += 20;
        } else if (roundMode.id === 5) {
            if (isCorrect) player.score += 40;
        }

        socket.emit('answer-recorded', { isCorrect });
        socket.emit('update-single-player-score', { score: player.score, timeLeft: player.timeLeft });
        io.to(room.hostId).emit('update-players', Object.values(room.players));

        const allAnswered = Object.values(room.players).every(p => p.hasAnswered);
        if (allAnswered || roundMode.id === 2) {
            if (room.timer) clearInterval(room.timer);
            revealAnswerAndNext(roomId, currentQ.correct);
        }
    });

    function nextQuestionInternal(roomId) {
        const room = rooms[roomId];
        if (!room) return;
        room.currentQuestionIndex++;
        sendQuestion(roomId);
    }

    socket.on('disconnect', () => {
        Object.keys(rooms).forEach(roomId => {
            const room = rooms[roomId];
            if (room && room.players[socket.id]) {
                delete room.players[socket.id];
                io.to(room.hostId).emit('update-players', Object.values(room.players));
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`PartyQuiz Game Running on http://localhost:${PORT}`);
});
