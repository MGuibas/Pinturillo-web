const socket = io();

let myTurn = false;
let color = '#000000';
let brushSize = 5;
let playerName = "";
let timeLeft;
let timerInterval;
let isAdmin = false;
let currentLobbyId = null;
let currentRound = 0;

let currentWord = '';
let currentDrawer = '';

const currentWordDisplay = document.getElementById('currentWord');
let drawingBuffer = [];
let lastSentTime = 0;
const SEND_INTERVAL = 25; //intervalos dibujos

// Referencias a elementos del DOM
const lobby = document.getElementById('lobby');
const gameArea = document.getElementById('gameArea');
const playerNameInput = document.getElementById('playerName');
const createLobbyButton = document.getElementById('createLobby');
const joinLobbyButton = document.getElementById('joinLobby');
const lobbyIdInput = document.getElementById('lobbyId');
const startGameButton = document.getElementById('startGame');
const playerList = document.getElementById('playerList');
const turnInfo = document.getElementById('turnInfo');
const colorPicker = document.getElementById('colorPicker');
const brushSizeSlider = document.getElementById('brushSize');
const canvas = document.getElementById('drawingCanvas');
const ctx = canvas.getContext('2d');
const timerDisplay = document.getElementById('timeLeft');
const endTurnButton = document.getElementById('endTurn');
const chat = document.getElementById('chat');
const chatInput = document.getElementById('chatInput');
const sendMessageButton = document.getElementById('sendMessage');
const lobbyOptions = document.getElementById('lobbyOptions');
const lobbyInfo = document.getElementById('lobbyInfo');
const lobbyIdDisplay = document.getElementById('lobbyIdDisplay');
const wordSelectionArea = document.getElementById('wordSelectionArea');
const wordOptions = document.getElementById('wordOptions');
const roundInfo = document.getElementById('roundInfo');

// Nuevo: Canvas oculto para el jugador que dibuja
const hiddenCanvas = document.createElement('canvas');
const hiddenCtx = hiddenCanvas.getContext('2d');

createLobbyButton.addEventListener('click', () => {
  playerName = playerNameInput.value.trim();
  if (playerName) {
    socket.emit('createLobby', playerName);
    playerNameInput.disabled = true;
    createLobbyButton.disabled = true;
    joinLobbyButton.disabled = true;
  } else {
    alert('Por favor, ingresa tu nombre.');
  }
});

joinLobbyButton.addEventListener('click', () => {
  playerName = playerNameInput.value.trim();
  const lobbyId = lobbyIdInput.value.trim();
  if (playerName && lobbyId) {
    socket.emit('joinLobby', { lobbyId, playerName });
    playerNameInput.disabled = true;
    createLobbyButton.disabled = true;
    joinLobbyButton.disabled = true;
    lobbyIdInput.disabled = true;
  } else {
    alert('Por favor, ingresa tu nombre y el ID del lobby.');
  }
});

socket.on('lobbyCreated', ({ lobbyId, players, admin }) => {
  currentLobbyId = lobbyId;
  updateLobbyUI(players, admin);
  alert(`Lobby creado. ID: ${lobbyId}`);
});

socket.on('lobbyJoined', ({ lobbyId, players, admin }) => {
  currentLobbyId = lobbyId;
  updateLobbyUI(players, admin);
  alert(`Te has unido al lobby: ${lobbyId}`);
});

socket.on('lobbyUpdate', ({ lobbyId, players, admin }) => {
  currentLobbyId = lobbyId;
  updateLobbyUI(players, admin);
});

function updateLobbyUI(players, admin) {
  lobbyOptions.style.display = 'none';
  lobbyInfo.style.display = 'block';
  lobbyIdDisplay.textContent = `ID del Lobby: ${currentLobbyId}`;
  
  playerList.innerHTML = '';
  players.forEach(player => {
    const playerElement = document.createElement('li');
    playerElement.textContent = player.name + (player.id === admin ? ' (Admin)' : '');
    playerList.appendChild(playerElement);
  });
  
  isAdmin = socket.id === admin;
  startGameButton.style.display = isAdmin ? 'block' : 'none';
}

startGameButton.addEventListener('click', () => {
  if (isAdmin && currentLobbyId) {
    socket.emit('startGame', currentLobbyId);
  }
});

socket.on('gameStart', ({ round }) => {
  showGame();
  currentRound = round;
  updateRoundInfo();
  resizeCanvas();
});

socket.on('wordSelected', ({ drawer, word }) => {
  wordSelectionArea.style.display = 'none';
  if (socket.id === drawer) {
    turnInfo.textContent = "¡Es tu turno para dibujar!";
    currentWordDisplay.textContent = word;
  } else {
    turnInfo.textContent = "¡Adivina la palabra!";
    currentWordDisplay.textContent = "_ ".repeat(word.length);
  }
});

function selectWord(word) {
  socket.emit('selectWord', { lobbyId: currentLobbyId, word });
  wordSelectionArea.style.display = 'none';
  currentWordDisplay.textContent = word;
}

function showFloatingWord(word) {
  const floatingWord = document.getElementById('floatingWord');
  floatingWord.textContent = word;
  floatingWord.style.display = 'block';
  setTimeout(() => {
    floatingWord.style.display = 'none';
  }, 3000);
}



document.getElementById('clearCanvas').addEventListener('click', () => {
  if (myTurn) {
    clearCanvas();
    socket.emit('clearCanvas', { lobbyId: currentLobbyId });
  }
});

colorPicker.addEventListener('input', (e) => {
  color = e.target.value;
});

brushSizeSlider.addEventListener('input', (e) => {
  brushSize = e.target.value;
});

let drawing = false;
let lastX = 0;
let lastY = 0;

canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
canvas.addEventListener('mouseup', stopDrawing);
canvas.addEventListener('mouseleave', stopDrawing);

function startDrawing(event) {
  if (!myTurn) return;
  drawing = true;
  [lastX, lastY] = [event.offsetX, event.offsetY];
}
let lastDrawnPoint = null;


function draw(event) {
  if (!drawing || !myTurn) return;
  const currentPoint = { x: event.offsetX, y: event.offsetY };
  
  // Dibujar en el canvas oculto
  hiddenCtx.beginPath();
  hiddenCtx.moveTo(lastX, lastY);
  hiddenCtx.lineTo(currentPoint.x, currentPoint.y);
  hiddenCtx.strokeStyle = color;
  hiddenCtx.lineWidth = brushSize;
  hiddenCtx.lineCap = 'round';
  hiddenCtx.stroke();
  
  // Mostrar brevemente en el canvas visible
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(currentPoint.x, currentPoint.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = brushSize;
  ctx.lineCap = 'round';
  ctx.stroke();
  
  setTimeout(() => {
    ctx.clearRect(currentPoint.x - brushSize, currentPoint.y - brushSize, brushSize * 2, brushSize * 2);
  }, 100);

  drawingBuffer.push(currentPoint);
  [lastX, lastY] = [currentPoint.x, currentPoint.y];
  
  const now = Date.now();
  if (now - lastSentTime >= SEND_INTERVAL) {
    sendDrawingData();
    lastSentTime = now;
  }
}

function sendDrawingData() {
  if (drawingBuffer.length > 0 && currentLobbyId && myTurn) {
    socket.emit('drawing', {
      lobbyId: currentLobbyId,
      data: {
        points: drawingBuffer,
        color: color,
        size: brushSize,
      }
    });
    drawingBuffer = [];
  }
}

function stopDrawing() {
  drawing = false;
  sendDrawingData(); // Enviar los últimos puntos al soltar el mouse
}

socket.on('newTurn', (data) => {
  myTurn = socket.id === data.playerId;
  turnInfo.textContent = myTurn ? "¡Es tu turno para dibujar!" : `Turno de ${data.playerName}`;
  endTurnButton.disabled = !myTurn;
  canvas.style.cursor = myTurn ? 'crosshair' : 'not-allowed';
  document.getElementById('clearCanvas').disabled = !myTurn;

  // Habilitar/deshabilitar el botón de enviar mensajes y el input del chat
  sendMessageButton.disabled = myTurn;
  chatInput.disabled = myTurn;

  if (myTurn) {
    clearCanvas();
    startTimer();
  } else {
    stopTimer();
    startTimer();
  }
});

socket.on('drawing', (data) => {
  if (!myTurn) {
    const points = data.points;
    ctx.beginPath();
    ctx.strokeStyle = data.color;
    ctx.lineWidth = data.size;
    ctx.lineCap = 'round';
    
    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];
      
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    }
    
    ctx.stroke();
  }
});

function startTimer() {
  timeLeft = 60;
  updateTimerDisplay();
  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();
    if (timeLeft <= 0) {
      endTurn();
    } else if (timeLeft === 2) {
      showCompleteDrawing();
    }
  }, 1000);
}

function showCompleteDrawing() {
  if (myTurn) {
    ctx.drawImage(hiddenCanvas, 0, 0);
    setTimeout(() => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }, 2000);
  }
}

function stopTimer() {
  clearInterval(timerInterval);
}

function updateTimerDisplay() {
  timerDisplay.textContent = timeLeft;
  timerDisplay.style.color = '#ff0000';
}

endTurnButton.addEventListener('click', endTurn);

function endTurn() {
  if (myTurn && currentLobbyId) {
    socket.emit('endTurn', currentLobbyId);
    myTurn = false;
  }
}

sendMessageButton.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

function sendMessage() {
  const message = chatInput.value.trim();
  if (message && currentLobbyId) {
    socket.emit('chatMessage', {
      lobbyId: currentLobbyId,
      message
    });
    chatInput.value = '';
  }
}

socket.on('chatMessage', (data) => {
  const messageElement = document.createElement('p');
  messageElement.innerHTML = `<strong>${data.playerName}:</strong> ${data.message}`;
  chat.appendChild(messageElement);
  chat.scrollTop = chat.scrollHeight;
});

socket.on('wordGuessed', ({ guesser, word, scores }) => {
  currentWord = word;
  showWordGuessed(guesser, word);
  updateScores(scores);
});

// Añadir esta nueva función
function showWordGuessed(guesser, word) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="message">
      <h2>${guesser} adivinó la palabra</h2>
      <p>La palabra era: ${word}</p>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => {
    document.body.removeChild(overlay);
  }, 3000);
}

function updateScores(scores) {
  const scoresList = document.getElementById('scoresList');
  scoresList.innerHTML = '';
  Object.entries(scores).forEach(([playerId, score]) => {
    const playerName = playerId === socket.id ? 'Tú' : playerList.querySelector(`[data-id="${playerId}"]`).textContent;
    const li = document.createElement('li');
    li.textContent = `${playerName}: ${score}`;
    scoresList.appendChild(li);
  });
}

// Modificar la función que maneja el evento 'turnEnded'
socket.on('turnEnded', ({ word, scores, drawerName }) => {
  currentWord = word;
  currentDrawer = drawerName;
  showTurnEnded(word, drawerName);
  updateScores(scores);
});

function showTurnEnded(word, drawerName) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="message">
      <h2>Fin del turno</h2>
      <p>La palabra era: ${word}</p>
      <p>${drawerName} estaba dibujando</p>
    </div>
  `;
  document.body.appendChild(overlay);
  setTimeout(() => {
    document.body.removeChild(overlay);
  }, 3000);

  // Mostrar el dibujo al dibujante
  if (socket.id === currentDrawer) {
    const drawingDataURL = canvas.toDataURL();
    const drawingOverlay = document.createElement('div');
    drawingOverlay.className = 'overlay';
    drawingOverlay.innerHTML = `
      <div class="message">
        <h2>Tu dibujo</h2>
        <img src="${drawingDataURL}" alt="Tu dibujo" style="max-width: 100%; max-height: 70vh;">
      </div>
    `;
    document.body.appendChild(drawingOverlay);
    setTimeout(() => {
      document.body.removeChild(drawingOverlay);
    }, 5000);
  }
}

socket.on('newRound', ({ round }) => {
  currentRound = round;
  updateRoundInfo();
});

function updateRoundInfo() {
  roundInfo.textContent = `Ronda ${currentRound} de 5`;
}

socket.on('gameEnded', ({ scores, winner }) => {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="message">
      <h2>¡Fin del juego!</h2>
      <p>Ganador: ${winner.name} con ${winner.score} puntos</p>
      <button id="backToLobby">Volver al Lobby</button>
    </div>
  `;
  document.body.appendChild(overlay);
  
  document.getElementById('backToLobby').addEventListener('click', () => {
    document.body.removeChild(overlay);
    showLobby();
  });

  updateScores(scores);
});

function clearCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hiddenCtx.clearRect(0, 0, hiddenCanvas.width, hiddenCanvas.height);
}

socket.on('canvasCleared', () => {
  clearCanvas();
});

socket.on('clearCanvas', clearCanvas);

function resizeCanvas() {
  const container = document.querySelector('.container');
  const containerWidth = container.clientWidth;
  const canvasSize = Math.min(500, containerWidth - 40);
  canvas.width = canvasSize;
  canvas.height = canvasSize * 0.8;
  hiddenCanvas.width = canvas.width;
  hiddenCanvas.height = canvas.height;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

socket.on('error', (message) => {
  alert(message);
});

function startWordSelectionTimer() {
  let selectionTime = 10;
  const timerElement = document.createElement('p');
  wordSelectionArea.appendChild(timerElement);

  const selectionInterval = setInterval(() => {
    selectionTime--;
    timerElement.textContent = `Tiempo para elegir: ${selectionTime}s`;
    if (selectionTime <= 0) {
      clearInterval(selectionInterval);
      wordSelectionArea.style.display = 'none';
    }
  }, 1000);
}
const linesContainer = document.createElement('div');
linesContainer.className = 'lines';
for (let i = 0; i < 3; i++) {
  const line = document.createElement('div');
  line.className = 'line';
  linesContainer.appendChild(line);
}
document.body.insertBefore(linesContainer, document.body.firstChild);

// Añade estas funciones al final de tu archivo app.js

function showLobby() {
  document.getElementById('lobby').classList.add('fade-enter-active');
  document.getElementById('gameArea').classList.add('fade-leave-active');
  setTimeout(() => {
    document.getElementById('lobby').style.display = 'block';
    document.getElementById('gameArea').style.display = 'none';
    document.getElementById('lobby').classList.remove('fade-enter-active');
    document.getElementById('gameArea').classList.remove('fade-leave-active');
  }, 500);
}

function showGame() {
  document.getElementById('gameArea').classList.add('fade-enter-active');
  document.getElementById('lobby').classList.add('fade-leave-active');
  setTimeout(() => {
    document.getElementById('gameArea').style.display = 'block';
    document.getElementById('lobby').style.display = 'none';
    document.getElementById('gameArea').classList.remove('fade-enter-active');
    document.getElementById('lobby').classList.remove('fade-leave-active');
  }, 500);
}