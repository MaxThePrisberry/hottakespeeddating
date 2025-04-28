// server.js
console.log("Starting Hot Take Speed Dating Server...");

const express = require('express');
const http = require('http');
const path = require('path');
const { WebSocketServer } = require('ws');
const cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');

// Express app setup
const app = express();
const port = process.env.PORT || 4000;

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.static('./public'));

// Routes for different interfaces
app.get('/host', (req, res) => {
  res.sendFile('host.html', { root: 'public' });
});

// Return homepage for any other route
app.use((req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

// Create HTTP server
const httpServer = http.createServer(app);

// Start the HTTP server
httpServer.listen(port, () => {
  console.log(`Opinion Game Server is running on HTTP at http://localhost:${port}`);
});

// Sample questions bank
const questions = [
  "Is pineapple an acceptable pizza topping?",
  "Should toilet paper hang over or under?",
  "Is a hot dog a sandwich?",
  "Does milk go before or after cereal?",
  "Is it acceptable to put ketchup on steak?",
  "Is it okay to recline your seat on an airplane?",
  "Should you put your shopping cart back at the store? Explain.",
  "Is it alright to talk during movies?",
  "Is it acceptable to wear socks with sandals?",
  "Should you put salt on watermelon?",
  "Should you shower in the morning or evening?",
  "Do you wash your legs in the shower?",
  "Is it okay to text 'K' as a response?",
  "Is it acceptable to ghost someone?",
  "Is it okay to break up with someone via text?",
  "Should you tip for takeout orders?",
  "Is standing at concerts rude to people behind you?",
	"Is it acceptable to listen to music without headphones in public?",
	"Is it acceptable to check your partner's phone?",
	"Is it acceptable to correct someone's grammar in casual conversation?",
	"Is it acceptable to drink directly from the milk carton?",
	"Is it okay to talk to someone while they're wearing headphones?",
	"Should you leave a negative review for bad service?",
	"Is it acceptable to eat food in a grocery store before paying?",
	"Is it okay to ask someone's salary?",
	"Should parents monitor their teenagers' text messages?",
	"Should you remove your shoes before entering someone's home?",
	"Is it okay to make phone calls in public bathrooms?",
	"Should you keep your camera on during video meetings?",
	"Is it acceptable to call instead of text without warning?",
	"Is it okay to ask a pregnant person when they're due?",
	"Is it okay to listen to explicit music?",
	"Is it okay to do homework on Sundays?",
	"Is it acceptable to kiss in public?",
	"Is it okay to use self-checkout with a full cart of groceries?",
	"Should you make your bed every morning?",
	"Is it acceptable to text during a date?",
	"Is it okay to take food home from a buffet?",
	"Should you leave a tip even if service was poor?",
	"Is it acceptable to ignore phone calls and text back instead?",
	"Should you tell a friend if you don't like their significant other?",
	"Is it okay to give used items as gifts?",
	"Is it okay to stay friends with an ex?",
  "Is it acceptable to double-dip chips at parties?"
];

// Game state
const gameState = {
  players: {},        // Maps playerId -> { connection, name, score, basednessTotal, ratingsReceived }
  pairs: [],          // Array of pairs, each with [player1Id, player2Id]
  currentQuestion: null,
  activeRound: false,
  countdownSeconds: 60,
  hostConnection: null,
  leaderboardMode: false,
  roundEndTime: null,
  countdownInterval: null
};

// WebSocket setup
const wss = new WebSocketServer({ server: httpServer });

// Helper function to set cookies
function setCookie(ws, name, value, maxAge) {
  ws.send(JSON.stringify({
    type: 'setCookie',
    name: name,
    value: value,
    maxAge: maxAge || 86400 // 24 hours by default
  }));
}

// Helper function to parse cookies
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts[0].trim();
    const value = parts[1] ? parts[1].trim() : '';
    cookies[name] = value;
  });
  
  return cookies;
}

// Set up WebSocket server with connection handlers
wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  
  // Parse the URL to determine the connection type
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  
  // Generate a unique ID for this connection
  const connectionId = uuidv4();
  
  if (pathname === '/ws/host') {
    handleHostConnection(ws, connectionId);
  } else if (pathname === '/ws/player') {
    handlePlayerConnection(ws, connectionId, req);
  } else {
    console.log(`Unknown WebSocket endpoint: ${pathname}`);
    ws.close();
    return;
  }
  
  // Set up ping/pong to keep connection alive
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  // Handle connection close
  ws.on('close', () => {
    handleConnectionClose(pathname, connectionId);
  });
});

// Keep-alive mechanism with ping/pong
const pingInterval = setInterval(() => {
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(pingInterval);
});

// Host connection handler
function handleHostConnection(ws, connectionId) {
  // Only allow one host connection
  if (gameState.hostConnection) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Another host is already connected'
    }));
    ws.close();
    return;
  }
  
  gameState.hostConnection = { ws, id: connectionId };
  
  // Process messages from the host
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'createPairs':
          // Host wants to create new pairs without starting the round
          createPlayerPairs();
          break;
          
        case 'startRound':
          // Host wants to start the round with current pairs
          startRound(message.countdownSeconds || 60);
          break;
          
        case 'kickPlayer':
          // Host wants to kick a player
          kickPlayer(message.playerId);
          break;
        
        case 'endGame':
          // Host wants to end the game and show leaderboard
          endGame();
          break;
          
        default:
          console.log(`Unknown message type from host: ${message.type}`);
      }
    } catch (error) {
      console.error('Error processing host message:', error);
    }
  });
  
  // Confirm connection
  ws.send(JSON.stringify({
    type: 'connected',
    role: 'host'
  }));

  // Send current player list and stats
  updateHostState();
}

// Player connection handler
function handlePlayerConnection(ws, connectionId, req) {
  // Check for existing player cookie
  const cookies = parseCookies(req.headers.cookie);
  const existingPlayerId = cookies.playerId;
  
  // If we have a player ID cookie and the player exists in our game state
  if (existingPlayerId && gameState.players[existingPlayerId]) {
    // Update the connection and use existing player data
    gameState.players[existingPlayerId].connection = ws;
    gameState.players[existingPlayerId].connected = true;
    connectionId = existingPlayerId;
    console.log(`Player reconnected with ID: ${connectionId}`);
  } else {
    // New player - create new entry
    gameState.players[connectionId] = {
      connection: ws,
      connected: true,
      name: null, // Will be set when the player registers
      basednessTotal: 0,
      ratingsReceived: 0,
      partner: null,
      question: null,
      rated: false
    };
    
    // Set a cookie so the player can be identified on reconnection
    setCookie(ws, 'playerId', connectionId);
  }
  
  // Process messages from the player
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'register':
          // Player has registered with a name
          if (message.name && message.name.trim()) {
            gameState.players[connectionId].name = message.name.trim();
            updateHostState();
            // Send confirmation to player
            ws.send(JSON.stringify({
              type: 'registered',
              name: message.name.trim()
            }));
          }
          break;
          
        case 'ratePartner':
          // Player has rated their partner
          if (gameState.players[connectionId].partner) {
            const partnerId = gameState.players[connectionId].partner;
            if (gameState.players[partnerId]) {
              const basednessRating = parseFloat(message.rating) || 0;
              gameState.players[partnerId].basednessTotal += basednessRating;
              gameState.players[partnerId].ratingsReceived += 1;
              gameState.players[connectionId].rated = true;
              
              // Tell the player they've successfully rated their partner
              ws.send(JSON.stringify({
                type: 'ratingConfirmed'
              }));
              
              // Update the host with new stats
              updateHostState();
            }
          }
          break;
          
        default:
          console.log(`Unknown message type from player: ${message.type}`);
      }
    } catch (error) {
      console.error('Error processing player message:', error);
    }
  });
  
  // Send current game state to player
  const initialState = {
    type: 'gameState',
    id: connectionId,
    leaderboardMode: gameState.leaderboardMode,
    name: gameState.players[connectionId].name
  };
  
  if (gameState.leaderboardMode) {
    initialState.leaderboard = generateLeaderboard();
  } else if (gameState.players[connectionId].partner) {
    // If player already has a partner
    const partnerId = gameState.players[connectionId].partner;
    let partnerName = "Unknown";
    
    if (partnerId === "MAX") {
      partnerName = "Max";
    } else if (gameState.players[partnerId]) {
      partnerName = gameState.players[partnerId].name || "Unknown";
    }
    
    initialState.partner = partnerId;
    initialState.partnerName = partnerName;
    initialState.question = gameState.players[connectionId].question;
    initialState.countdownSeconds = gameState.countdownSeconds;
    initialState.activeRound = gameState.activeRound;
    initialState.rated = gameState.players[connectionId].rated;
    
    // If time left in round, include it
    if (gameState.activeRound && gameState.roundEndTime) {
      const timeLeft = Math.max(0, Math.floor((gameState.roundEndTime - Date.now()) / 1000));
      initialState.timeLeft = timeLeft;
    }
  }
  
  ws.send(JSON.stringify(initialState));
  
  // Update host state to show new player
  updateHostState();
}

// Handle connection closures
function handleConnectionClose(pathname, connectionId) {
  console.log(`WebSocket connection closed on ${pathname} for ID ${connectionId}`);
  
  switch (pathname) {
    case '/ws/host':
      if (gameState.hostConnection && gameState.hostConnection.id === connectionId) {
        gameState.hostConnection = null;
        console.log('Host disconnected');
      }
      break;
      
    case '/ws/player':
      if (gameState.players[connectionId]) {
        // Mark the player as disconnected but keep their data
        gameState.players[connectionId].connected = false;
        gameState.players[connectionId].connection = null;
        console.log('Player disconnected but data retained');
        updateHostState(); // Update the host with player's disconnection
      }
      break;
  }
}

// Function to create random pairs of players without starting the round
function createPlayerPairs() {
  // Reset any existing pairs
  gameState.pairs = [];
  
  // Reset any players' rated status
  Object.values(gameState.players).forEach(player => {
    player.rated = false;
  });
  
  // Get active (connected) players with names
  const activePlayers = Object.entries(gameState.players)
    .filter(([id, player]) => player.connected && player.name)
    .map(([id, player]) => id);
  
  if (activePlayers.length < 2) {
    // Not enough players
    if (gameState.hostConnection) {
      gameState.hostConnection.ws.send(JSON.stringify({
        type: 'error',
        message: 'Need at least 2 players to create pairs'
      }));
    }
    return;
  }
  
  // Shuffle players for random pairing
  shuffle(activePlayers);
  
  // Create pairs
  for (let i = 0; i < activePlayers.length - 1; i += 2) {
    gameState.pairs.push([activePlayers[i], activePlayers[i + 1]]);
  }
  
  // If odd number of players, last one pairs with "Max"
  if (activePlayers.length % 2 !== 0) {
    const lastPlayer = activePlayers[activePlayers.length - 1];
    gameState.players[lastPlayer].partner = "MAX";
  }
  
  // Set partners but don't assign questions yet
  gameState.pairs.forEach(pair => {
    const [player1Id, player2Id] = pair;
    const player1 = gameState.players[player1Id];
    const player2 = gameState.players[player2Id];
    
    // Assign them as partners
    player1.partner = player2Id;
    player2.partner = player1Id;
    
    // Reset rated status
    player1.rated = false;
    player2.rated = false;
    
    // Notify players about new pairing (without questions yet)
    if (player1.connection) {
      player1.connection.send(JSON.stringify({
        type: 'pairCreated',
        partner: player2Id,
        partnerName: player2.name
      }));
    }
    
    if (player2.connection) {
      player2.connection.send(JSON.stringify({
        type: 'pairCreated',
        partner: player1Id,
        partnerName: player1.name
      }));
    }
  });
  
  // Handle the odd player out paired with Max
  Object.entries(gameState.players).forEach(([playerId, player]) => {
    if (player.partner === "MAX") {
      // Notify player
      if (player.connection) {
        player.connection.send(JSON.stringify({
          type: 'pairCreated',
          partner: "MAX",
          partnerName: "Max"
        }));
      }
    }
  });
  
  // Update host state to show the new pairs
  updateHostState();
  
  // No countdown or questions yet - that happens in startRound
}

// Function to start the round with existing pairs
function startRound(countdownSeconds) {
  // Check if we have pairs
  if (gameState.pairs.length === 0) {
    // No pairs yet, can't start
    if (gameState.hostConnection) {
      gameState.hostConnection.ws.send(JSON.stringify({
        type: 'error',
        message: 'No pairs created yet. Create pairs first!'
      }));
    }
    return;
  }
  
  // Clear any existing round timer
  gameState.activeRound = false;
  gameState.roundEndTime = null;
  
  // Reset all player rated status
  Object.values(gameState.players).forEach(player => {
    player.rated = false;
  });
  
  // For each pair, assign a question and notify players
  gameState.pairs.forEach(pair => {
    const [player1Id, player2Id] = pair;
    const player1 = gameState.players[player1Id];
    const player2 = gameState.players[player2Id];
    
    // Give them the same random question
    const question = getRandomQuestion();
    player1.question = question;
    player2.question = question;
    
    // Notify player 1
    if (player1.connection) {
      player1.connection.send(JSON.stringify({
        type: 'paired',
        partner: player2Id,
        partnerName: player2.name,
        question: question,
        countdownSeconds: countdownSeconds
      }));
    }
    
    // Notify player 2
    if (player2.connection) {
      player2.connection.send(JSON.stringify({
        type: 'paired',
        partner: player1Id,
        partnerName: player1.name,
        question: question,
        countdownSeconds: countdownSeconds
      }));
    }
  });
  
  // Handle any players paired with "Max"
  Object.entries(gameState.players).forEach(([playerId, player]) => {
    if (player.partner === "MAX") {
      // Assign a question
      const question = getRandomQuestion();
      player.question = question;
      
      // Notify player
      if (player.connection) {
        player.connection.send(JSON.stringify({
          type: 'paired',
          partner: "MAX",
          partnerName: "Max",
          question: question,
          countdownSeconds: countdownSeconds
        }));
      }
    }
  });
  
  // Update game state
  gameState.activeRound = true;
  gameState.countdownSeconds = countdownSeconds;
  
  // Start countdown
  startCountdown(countdownSeconds);
  
  // Update host
  updateHostState();
}

// Function to kick a player
function kickPlayer(playerId) {
  // Check if player exists
  if (!gameState.players[playerId]) {
    return;
  }
  
  // If player is connected, close their connection
  if (gameState.players[playerId].connection) {
    // Send kick message first
    gameState.players[playerId].connection.send(JSON.stringify({
      type: 'kicked'
    }));
    
    // Close connection
    gameState.players[playerId].connection.close();
  }
  
  // Remove player from game state
  delete gameState.players[playerId];
  
  // If there are pairs, remove any pair with this player
  gameState.pairs = gameState.pairs.filter(pair => 
    pair[0] !== playerId && pair[1] !== playerId
  );
  
  // Update any player who had this player as partner
  Object.values(gameState.players).forEach(player => {
    if (player.partner === playerId) {
      player.partner = null;
    }
  });
  
  // Update host
  updateHostState();
}

// Start the timer and send countdown updates
function startCountdown(seconds) {
  let timeLeft = seconds;
  
  // Clear any existing countdown
  if (gameState.countdownInterval) {
    clearInterval(gameState.countdownInterval);
    gameState.countdownInterval = null;
  }
  
  // Store the end time to help with reconnections
  gameState.roundEndTime = Date.now() + (seconds * 1000);
  gameState.activeRound = true;
  
  // Send initial countdown to all players
  Object.values(gameState.players).forEach(player => {
    if (player.connected && player.connection && player.partner) {
      player.connection.send(JSON.stringify({
        type: 'countdown',
        timeLeft: timeLeft
      }));
    }
  });
  
  gameState.countdownInterval = setInterval(() => {
    timeLeft--;
    
    // Send update to all paired players
    Object.values(gameState.players).forEach(player => {
      if (player.connected && player.connection && player.partner) {
        player.connection.send(JSON.stringify({
          type: 'countdown',
          timeLeft: timeLeft
        }));
      }
    });
    
    // Check if countdown is finished
    if (timeLeft <= 0) {
      clearInterval(gameState.countdownInterval);
      gameState.countdownInterval = null;
      endRound();
    }
  }, 1000);
}

// End the discussion round and prompt for ratings
function endRound() {
  gameState.activeRound = false;
  
  // Notify all paired players to rate their partner
  Object.values(gameState.players).forEach(player => {
    if (player.connected && player.connection && player.partner) {
      player.connection.send(JSON.stringify({
        type: 'ratePartner'
      }));
    }
  });
  
  // Update host
  updateHostState();
}

// End the entire game and show leaderboard
function endGame() {
  gameState.leaderboardMode = true;
  
  // Generate the leaderboard
  const leaderboard = generateLeaderboard();
  
  // Send leaderboard to all players
  Object.values(gameState.players).forEach(player => {
    if (player.connected && player.connection) {
      player.connection.send(JSON.stringify({
        type: 'gameEnded',
        leaderboard: leaderboard
      }));
    }
  });
  
  // Update host
  updateHostState();
}

// Generate leaderboard data
function generateLeaderboard() {
  return Object.entries(gameState.players)
    .map(([id, player]) => ({
      id,
      name: player.name || "Anonymous",
      ratingsReceived: player.ratingsReceived || 0,
      averageBasedness: player.ratingsReceived ? 
        (player.basednessTotal / player.ratingsReceived).toFixed(2) : 0,
      connected: player.connected
    }))
    .sort((a, b) => b.averageBasedness - a.averageBasedness); // Sort by basedness (highest first)
}

// Update the host with current game state
function updateHostState() {
  if (!gameState.hostConnection || !gameState.hostConnection.ws) {
    return;
  }
  
  const playerStats = Object.entries(gameState.players)
    .map(([id, player]) => ({
      id,
      name: player.name || "Not registered",
      connected: player.connected,
      partner: player.partner ? 
        (player.partner === "MAX" ? "Max" : gameState.players[player.partner]?.name || "Unknown") : null,
      ratingsReceived: player.ratingsReceived || 0,
      averageBasedness: player.ratingsReceived ? 
        (player.basednessTotal / player.ratingsReceived).toFixed(2) : 0,
      rated: player.rated
    }))
    .sort((a, b) => {
      // Sort by connected first, then by name
      if (a.connected !== b.connected) {
        return a.connected ? -1 : 1; // Connected players first
      }
      return (a.name || "").localeCompare(b.name || "");
    });
  
  const totalPlayers = playerStats.filter(p => p.connected && p.name && p.name !== "Not registered").length;
  const playersRated = playerStats.filter(p => p.rated).length;
  const ratingPercentage = totalPlayers ? (playersRated / totalPlayers * 100).toFixed(0) : 0;
  
  gameState.hostConnection.ws.send(JSON.stringify({
    type: 'hostState',
    players: playerStats,
    pairs: gameState.pairs,
    activeRound: gameState.activeRound,
    ratingPercentage: ratingPercentage,
    leaderboardMode: gameState.leaderboardMode,
    leaderboard: gameState.leaderboardMode ? generateLeaderboard() : null
  }));
}

// Utility function to shuffle an array
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Utility function to get a random question
function getRandomQuestion() {
  return questions[Math.floor(Math.random() * questions.length)];
}

// Listen for server shutdown
process.on('SIGINT', () => {
  console.log('Shutting down Opinion Game Server...');
  process.exit(0);
});
