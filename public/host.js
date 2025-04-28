document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const createPairsButton = document.getElementById('create-pairs');
    const startRoundButton = document.getElementById('start-round');
    const endGameButton = document.getElementById('end-game');
    const resetGameButton = document.getElementById('reset-game');
    const countdownTimeInput = document.getElementById('countdown-time');
    const playersListEl = document.getElementById('players-list');
    const roundIndicatorEl = document.getElementById('round-indicator');
    const percentageValueEl = document.getElementById('percentage-value');
    const pairsListEl = document.getElementById('pairs-list');
    const pairsViewEl = document.getElementById('pairs-view');
    const leaderboardViewEl = document.getElementById('leaderboard-view');
    const hostLeaderboardEl = document.getElementById('host-leaderboard');
    
    // Game state
    let players = [];
    let pairs = [];
    let activeRound = false;
    let leaderboardMode = false;
    let ratingPercentage = 0;
    
    // WebSocket connection
    let socket;
    
    function initializeWebSocket() {
        // Simple protocol detection
        const protocol = window.location.protocol === 'http:' ? 'ws' : 'wss';
        socket = new WebSocket(`${protocol}://${window.location.host}/ws/host`);
        
        socket.onopen = () => {
            console.log('Connected to server as host');
        };
        
        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'connected':
                    console.log(`Connected as ${message.role}`);
                    break;
                    
                case 'hostState':
                    updateHostState(message);
                    break;
                    
                case 'error':
                    alert(`Error: ${message.message}`);
                    break;
            }
        };
        
        socket.onclose = () => {
            console.log('Connection closed');
            setTimeout(initializeWebSocket, 5000); // Reconnect after 5 seconds
        };
        
        socket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }
    
    function updateHostState(state) {
        players = state.players || [];
        pairs = state.pairs || [];
        activeRound = state.activeRound || false;
        leaderboardMode = state.leaderboardMode || false;
        ratingPercentage = state.ratingPercentage || 0;
        
        // Update player list
        updatePlayersList();
        
        // Update round status
        updateRoundStatus();
        
        // Update pairs view if applicable
        if (pairs.length > 0) {
            updatePairsView();
            pairsViewEl.classList.remove('hidden');
        } else {
            pairsViewEl.classList.add('hidden');
        }
        
        // Show leaderboard if in leaderboard mode
        if (leaderboardMode && state.leaderboard) {
            updateLeaderboardView(state.leaderboard);
            leaderboardViewEl.classList.remove('hidden');
        } else {
            leaderboardViewEl.classList.add('hidden');
        }
    }
    
    function updatePlayersList() {
        playersListEl.innerHTML = '';
        
        if (players.length === 0) {
            playersListEl.innerHTML = '<div class="no-players">No players connected yet</div>';
            return;
        }
        
        players.forEach(player => {
            if (!player.name || player.name === "Not registered") {
                return; // Skip unregistered players
            }
            
            const playerEl = document.createElement('div');
            playerEl.className = 'player-item';
            
            let partnerInfo = '';
            if (player.partner) {
                partnerInfo = `<span class="player-partner">Paired with: ${player.partner}</span>`;
            }
            
            let statsInfo = '';
            if (player.ratingsReceived > 0) {
                statsInfo = `
                    <div class="player-stats">
                        Average basedness: ${player.averageBasedness}/10 (${player.ratingsReceived} ratings)
                    </div>
                `;
            }
            
            // Add kick button
            const kickButtonHtml = `<button class="kick-button" data-player-id="${player.id}">Kick</button>`;
            
            playerEl.innerHTML = `
                <div class="player-info">
                    <div class="player-status ${player.connected ? 'connected' : 'disconnected'}"></div>
                    <div class="player-name">${player.name}</div>
                    ${partnerInfo}
                </div>
                <div class="player-actions">
                    ${statsInfo}
                    ${kickButtonHtml}
                </div>
            `;
            
            playersListEl.appendChild(playerEl);
            
            // Add event listener to kick button
            const kickButton = playerEl.querySelector(`.kick-button[data-player-id="${player.id}"]`);
            if (kickButton) {
                kickButton.addEventListener('click', () => kickPlayer(player.id));
            }
        });
    }
    
    function updateRoundStatus() {
        percentageValueEl.textContent = ratingPercentage;
        
        // Update the percentage fill bar
        const percentageFill = document.getElementById('percentage-fill');
        if (percentageFill) {
            percentageFill.style.width = `${ratingPercentage}%`;
        }
        
        if (activeRound) {
            roundIndicatorEl.textContent = 'Discussion in progress';
            roundIndicatorEl.className = 'round-indicator active';
        } else if (ratingPercentage < 100 && ratingPercentage > 0) {
            roundIndicatorEl.textContent = 'Rating in progress';
            roundIndicatorEl.className = 'round-indicator rating';
        } else {
            roundIndicatorEl.textContent = 'Waiting to start';
            roundIndicatorEl.className = 'round-indicator waiting';
        }
    }
    
    function updatePairsView() {
        pairsListEl.innerHTML = '';
        
        // First, create a mapping of player IDs to their data
        const playerMap = {};
        players.forEach(player => {
            playerMap[player.id] = player;
        });
        
        // Then create a view for each pair
        pairs.forEach(pair => {
            const [player1Id, player2Id] = pair;
            const player1 = playerMap[player1Id];
            const player2 = playerMap[player2Id];
            
            if (!player1 || !player2) return; // Skip if player not found
            
            const pairEl = document.createElement('div');
            pairEl.className = 'pair-item';
            
            // Find the question for this pair
            let question = player1.question || player2.question || "Unknown question";
            
            pairEl.innerHTML = `
                <div class="pair-players">
                    <div>${player1.name}</div>
                    <div>+</div>
                    <div>${player2.name}</div>
                </div>
                <div class="pair-question">${question}</div>
            `;
            
            pairsListEl.appendChild(pairEl);
        });
        
        // Add any "Max" pairs (odd players)
        players.forEach(player => {
            if (player.partner === "Max") {
                const pairEl = document.createElement('div');
                pairEl.className = 'pair-item';
                
                pairEl.innerHTML = `
                    <div class="pair-players">
                        <div>${player.name}</div>
                        <div>+</div>
                        <div>Max</div>
                    </div>
                    <div class="pair-question">${player.question || "Unknown question"}</div>
                `;
                
                pairsListEl.appendChild(pairEl);
            }
        });
    }
    
    function updateLeaderboardView(leaderboard) {
        hostLeaderboardEl.innerHTML = '';
        
        leaderboard.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            
            // Format name for disconnected players
            const displayName = player.connected ? player.name : `${player.name} (disconnected)`;
            
            item.innerHTML = `
                <div class="leaderboard-rank">${index + 1}.</div>
                <div class="leaderboard-name">${displayName}</div>
                <div class="leaderboard-score">${player.averageBasedness}/10</div>
                <div class="leaderboard-stats">(${player.ratingsReceived} ratings)</div>
            `;
            
            hostLeaderboardEl.appendChild(item);
        });
    }
    
    function createPairs() {
        socket.send(JSON.stringify({
            type: 'createPairs'
        }));
    }
    
    function startRound() {
        const seconds = parseInt(countdownTimeInput.value) || 60;
        
        // Validate seconds
        if (seconds < 10 || seconds > 300) {
            alert('Please enter a time between 10 and 300 seconds');
            return;
        }
        
        socket.send(JSON.stringify({
            type: 'startRound',
            countdownSeconds: seconds
        }));
    }
    
    function kickPlayer(playerId) {
        if (confirm('Are you sure you want to kick this player?')) {
            socket.send(JSON.stringify({
                type: 'kickPlayer',
                playerId: playerId
            }));
        }
    }
    
    function endGame() {
        if (confirm('Are you sure you want to end the game and show the final leaderboard?')) {
            socket.send(JSON.stringify({
                type: 'endGame'
            }));
        }
    }
    
    function resetGame() {
        if (confirm('Are you sure you want to reset the game? This will start a new game.')) {
            location.reload(); // Just reload the page for now
        }
    }
    
    // Event listeners
    createPairsButton.addEventListener('click', createPairs);
    startRoundButton.addEventListener('click', startRound);
    endGameButton.addEventListener('click', endGame);
    resetGameButton.addEventListener('click', resetGame);
    
    // Initialize
    initializeWebSocket();
});
