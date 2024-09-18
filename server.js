const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

let lobbies = {};
const words = JSON.parse(fs.readFileSync('words.json', 'utf8')).words;

const TURN_DURATION = 30000; // 30 segundos
const WORD_SELECTION_TIME = 10000; // 10 segundos
const ROUNDS_PER_GAME = 5;
const ROUND_BREAK_TIME = 5000; // 5 segundos de descanso entre rondas

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  console.log('Jugador conectado:', socket.id);

  socket.on('createLobby', (playerName) => {
    const lobbyId = uuidv4();
    const player = { id: socket.id, name: playerName, isAdmin: true };
    lobbies[lobbyId] = {
      id: lobbyId,
      players: [player],
      admin: player,
      gameInProgress: false,
      currentTurn: 0,
      turnTimer: null,
      currentRound: 0,
      wordOptions: [],
      currentWord: '',
      scores: {}
    };
    socket.join(lobbyId);
    socket.emit('lobbyCreated', { lobbyId, players: [player], admin: player.id });
  });

  socket.on('joinLobby', ({ lobbyId, playerName }) => {
    const lobby = lobbies[lobbyId];
    if (lobby && !lobby.gameInProgress) {
      const player = { id: socket.id, name: playerName, isAdmin: false };
      lobby.players.push(player);
      lobby.scores[socket.id] = 0;
      socket.join(lobbyId);
      socket.emit('lobbyJoined', { lobbyId, players: lobby.players, admin: lobby.admin.id });
      io.to(lobbyId).emit('lobbyUpdate', { lobbyId, players: lobby.players, admin: lobby.admin.id });
    } else {
      socket.emit('error', 'No se puede unir al lobby');
    }
  });

  socket.on('startGame', (lobbyId) => {
    const lobby = lobbies[lobbyId];
    if (lobby && socket.id === lobby.admin.id && lobby.players.length > 1) {
      lobby.gameInProgress = true;
      lobby.currentRound = 1;
      io.to(lobbyId).emit('gameStart', { round: lobby.currentRound });
      startTurn(lobbyId);
    }
  });

  socket.on('selectWord', ({ lobbyId, word }) => {
    const lobby = lobbies[lobbyId];
    if (lobby && lobby.gameInProgress && socket.id === lobby.players[lobby.currentTurn].id) {
      lobby.currentWord = word;
      clearTimeout(lobby.wordSelectionTimer);
      io.to(lobbyId).emit('wordSelected', { drawer: socket.id });
      startDrawing(lobbyId);
    }
  });

  socket.on('drawing', ({ lobbyId, data }) => {
    const lobby = lobbies[lobbyId];
    if (lobby && lobby.gameInProgress && socket.id === lobby.players[lobby.currentTurn].id) {
      socket.to(lobbyId).emit('drawing', data);
    }
  });
  socket.on('clearCanvas', ({ lobbyId }) => {
    const lobby = lobbies[lobbyId];
    if (lobby && lobby.gameInProgress && socket.id === lobby.players[lobby.currentTurn].id) {
      io.to(lobbyId).emit('canvasCleared');
    }
  });
  socket.on('chatMessage', ({ lobbyId, message }) => {
    const lobby = lobbies[lobbyId];
    if (lobby && lobby.gameInProgress) {
      if (socket.id !== lobby.players[lobby.currentTurn].id && message.toLowerCase() === lobby.currentWord.toLowerCase()) {
        // Palabra correcta adivinada
        const guesser = lobby.players.find(p => p.id === socket.id);
        const drawer = lobby.players[lobby.currentTurn];
        lobby.scores[socket.id] += 10;
        lobby.scores[drawer.id] += 5;
        io.to(lobbyId).emit('wordGuessed', { guesser: guesser.name, word: lobby.currentWord, scores: lobby.scores });
        endTurn(lobbyId);
      } else {
        io.to(lobbyId).emit('chatMessage', { playerName: lobby.players.find(p => p.id === socket.id).name, message });
      }
    }
  });

  socket.on('endTurn', (lobbyId) => {
    const lobby = lobbies[lobbyId];
    if (lobby && lobby.gameInProgress && socket.id === lobby.players[lobby.currentTurn].id) {
      endTurn(lobbyId);
    }
  });

  socket.on('disconnect', () => {
    for (const lobbyId in lobbies) {
      const lobby = lobbies[lobbyId];
      const index = lobby.players.findIndex((player) => player.id === socket.id);
      if (index !== -1) {
        lobby.players.splice(index, 1);
        delete lobby.scores[socket.id];
        if (socket.id === lobby.admin.id && lobby.players.length > 0) {
          lobby.admin = lobby.players[0];
          lobby.admin.isAdmin = true;
        }
        if (lobby.gameInProgress) {
          if (index === lobby.currentTurn) {
            clearTimeout(lobby.turnTimer);
            clearTimeout(lobby.wordSelectionTimer);
            nextTurn(lobbyId);
          } else if (index < lobby.currentTurn) {
            lobby.currentTurn--;
          }
        }
        io.to(lobbyId).emit('lobbyUpdate', { lobbyId, players: lobby.players, admin: lobby.admin ? lobby.admin.id : null });
        if (lobby.players.length === 0) {
          delete lobbies[lobbyId];
        }
        break;
      }
    }
  });
});

function startTurn(lobbyId) {
  const lobby = lobbies[lobbyId];
  if (lobby.players.length === 0) return;

  lobby.wordOptions = getRandomWords(3);
  io.to(lobbyId).emit('clearCanvas');
  io.to(lobby.players[lobby.currentTurn].id).emit('selectWord', { words: lobby.wordOptions });
  io.to(lobbyId).emit('newTurn', {
    playerName: lobby.players[lobby.currentTurn].name,
    playerId: lobby.players[lobby.currentTurn].id
  });

  lobby.wordSelectionTimer = setTimeout(() => {
    lobby.currentWord = lobby.wordOptions[Math.floor(Math.random() * lobby.wordOptions.length)];
    io.to(lobbyId).emit('wordSelected', { 
      drawer: lobby.players[lobby.currentTurn].id,
      word: lobby.currentWord // Añadir esta línea
    });
    startDrawing(lobbyId);
  }, WORD_SELECTION_TIME);
}

function startDrawing(lobbyId) {
  const lobby = lobbies[lobbyId];
  clearTimeout(lobby.turnTimer);
  lobby.turnTimer = setTimeout(() => {
    endTurn(lobbyId);
  }, TURN_DURATION);
}


function endTurn(lobbyId) {
  const lobby = lobbies[lobbyId];
  clearTimeout(lobby.turnTimer);
  io.to(lobbyId).emit('turnEnded', { 
    word: lobby.currentWord, 
    scores: lobby.scores,
    drawerName: lobby.players[lobby.currentTurn].name
  });
  
  // Añadir un temporizador para el descanso entre turnos
  setTimeout(() => {
    nextTurn(lobbyId);
  }, ROUND_BREAK_TIME);
}

function nextTurn(lobbyId) {
  const lobby = lobbies[lobbyId];
  lobby.currentTurn = (lobby.currentTurn + 1) % lobby.players.length;
  if (lobby.currentTurn === 0) {
    lobby.currentRound++;
    if (lobby.currentRound > ROUNDS_PER_GAME) {
      endGame(lobbyId);
      return;
    }
    io.to(lobbyId).emit('newRound', { round: lobby.currentRound });
  }
  startTurn(lobbyId);
}

function endGame(lobbyId) {
  const lobby = lobbies[lobbyId];
  const winner = Object.entries(lobby.scores).reduce((a, b) => a[1] > b[1] ? a : b);
  io.to(lobbyId).emit('gameEnded', { 
    scores: lobby.scores,
    winner: {
      id: winner[0],
      name: lobby.players.find(p => p.id === winner[0]).name,
      score: winner[1]
    }
  });
  lobby.gameInProgress = false;
  lobby.currentRound = 0;
  lobby.currentTurn = 0;
  lobby.scores = {};
}
function getRandomWords(count) {
  const shuffled = words.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

server.listen(3000, () => {
  console.log('Servidor escuchando en el puerto 3000');
});