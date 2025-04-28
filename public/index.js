document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const registrationEl = document.getElementById('registration');
    const waitingAreaEl = document.getElementById('waiting-area');
    const discussionAreaEl = document.getElementById('discussion-area');
    const ratingAreaEl = document.getElementById('rating-area');
    const ratingConfirmationEl = document.getElementById('rating-confirmation');
    const leaderboardAreaEl = document.getElementById('leaderboard-area');
    
    const playerNameInput = document.getElementById('player-name');
    const registerButton = document.getElementById('register-button');
    const playerNameDisplay = document.getElementById('player-name-display');
    const partnerNameEl = document.getElementById('partner-name');
    const timerDisplayEl = document.getElementById('timer-display');
    const questionTextEl = document.getElementById('question-text');
    const ratingPartnerNameEl = document.getElementById('rating-partner-name');
    const ratingQuestionTextEl = document.getElementById('rating-question-text');
    const wrongnessSlider = document.getElementById('wrongness-slider');
    const sliderValueDisplay = document.getElementById('slider-value-display');
    const submitRatingButton = document.getElementById('submit-rating');
    const leaderboardEl = document.getElementById('leaderboard');
    
    // Game state
    let playerId = null;
    let playerName = '';
    let partnerName = '';
    let partnerId = null;
    let question = '';
    let countdownTimer = null;
    
    // WebSocket connection
    let socket;
    
    function initializeWebSocket() {
        // Simple protocol detection
        const protocol = window.location.protocol === 'http:' ? 'ws' : 'wss';
        socket = new WebSocket(`${protocol}://${window.location.host}/ws/player`);
        
        socket.onopen = () => {
            console.log('Connected to server as player');
        };
        
        socket.onmessage = (event) => {
            const message = JSON.parse(event.data);
            
            switch (message.type) {
                case 'setCookie':
                    setCookie(message.name, message.value, message.maxAge / 86400);
                    break;
                    
                case 'gameState':
                    playerId = message.id;
                    
                    if (message.leaderboardMode) {
                        showLeaderboard(message.leaderboard);
                    } else if (message.partner) {
                        // Reconnecting player with existing pair
                        partnerId = message.partner;
                        partnerName = message.partnerName;
                        question = message.question;
                        
                        // Update UI elements
                        partnerNameEl.textContent = partnerName;
                        ratingPartnerNameEl.textContent = partnerName;
                        
                        if (question) {
                            questionTextEl.textContent = question;
                            ratingQuestionTextEl.textContent = question;
                        }
                        
                        if (message.timeLeft) {
                            timerDisplayEl.textContent = message.timeLeft;
                        }
                        
                        if (message.activeRound) {
                            showDiscussionArea();
                        } else if (message.rated) {
                            showRatingConfirmation();
                        } else if (question) {
                            showRatingArea();
                        } else {
                            showPairInfo();
                        }
                    }
                    
                    // If player already has a name, update UI
                    if (message.name) {
                        playerName = message.name;
                        playerNameDisplay.textContent = playerName;
                        playerNameInput.value = playerName;
                    }
                    break;
                    
                case 'registered':
                    playerName = message.name;
                    playerNameDisplay.textContent = playerName;
                    showWaitingArea();
                    break;
                    
                case 'pairCreated':
                    partnerId = message.partner;
                    partnerName = message.partnerName;
                    
                    // Clear any existing timers
                    if (countdownTimer) {
                        clearInterval(countdownTimer);
                        countdownTimer = null;
                    }
                    
                    // Update UI
                    partnerNameEl.textContent = partnerName;
                    ratingPartnerNameEl.textContent = partnerName;
                    
                    showPairInfo();
                    break;
                    
                case 'paired':
                    partnerId = message.partner;
                    partnerName = message.partnerName;
                    question = message.question;
                    
                    // Clear any existing countdown timer
                    if (countdownTimer) {
                        clearInterval(countdownTimer);
                        countdownTimer = null;
                    }
                    
                    // Update UI with the new question and timer
                    partnerNameEl.textContent = partnerName;
                    ratingPartnerNameEl.textContent = partnerName;
                    questionTextEl.textContent = question;
                    ratingQuestionTextEl.textContent = question;
                    timerDisplayEl.textContent = message.countdownSeconds;
                    timerDisplayEl.parentElement.style.backgroundColor = '#3498db'; // Reset timer color
                    
                    showDiscussionArea();
                    break;
                    
                case 'countdown':
                    timerDisplayEl.textContent = message.timeLeft;
                    
                    // Flash timer when low
                    if (message.timeLeft <= 10) {
                        timerDisplayEl.parentElement.style.backgroundColor = message.timeLeft % 2 === 0 ? '#e74c3c' : '#3498db';
                    }
                    break;
                    
                case 'ratePartner':
                    showRatingArea();
                    break;
                    
                case 'ratingConfirmed':
                    showRatingConfirmation();
                    break;
                    
                case 'gameEnded':
                    showLeaderboard(message.leaderboard);
                    break;
                    
                case 'kicked':
                    alert('You have been kicked from the game by the host.');
                    // Clear cookies and reload
                    document.cookie = "playerId=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
                    window.location.reload();
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
    
    function registerPlayer() {
        const name = playerNameInput.value.trim();
        
        if (!name) {
            alert('Please enter your name');
            return;
        }
        
        // Send registration to server
        socket.send(JSON.stringify({
            type: 'register',
            name: name
        }));
    }
    
    function submitRating() {
        const rating = wrongnessSlider.value;
        
        // Send rating to server
        socket.send(JSON.stringify({
            type: 'ratePartner',
            rating: rating
        }));
    }
    
    // UI Functions
    function showWaitingArea() {
        registrationEl.classList.add('hidden');
        waitingAreaEl.classList.remove('hidden');
        discussionAreaEl.classList.add('hidden');
        ratingAreaEl.classList.add('hidden');
        ratingConfirmationEl.classList.add('hidden');
        leaderboardAreaEl.classList.add('hidden');
        
        // Update waiting text for players with no partners yet
        playerNameDisplay.textContent = playerName;
        document.querySelector('#waiting-area p').textContent = "Awaiting game start...";
    }
    
    function showPairInfo() {
        registrationEl.classList.add('hidden');
        waitingAreaEl.classList.remove('hidden');
        discussionAreaEl.classList.add('hidden');
        ratingAreaEl.classList.add('hidden');
        ratingConfirmationEl.classList.add('hidden');
        leaderboardAreaEl.classList.add('hidden');
        
        // Update heading to emphasize finding the partner
        playerNameDisplay.textContent = playerName;
        document.querySelector('#waiting-area h2').innerHTML = `<strong>Find ${partnerName}!</strong>`;
        document.querySelector('#waiting-area p').textContent = `Waiting for the host to start the round...`;
    }
    
    function showDiscussionArea() {
        registrationEl.classList.add('hidden');
        waitingAreaEl.classList.add('hidden');
        discussionAreaEl.classList.remove('hidden');
        ratingAreaEl.classList.add('hidden');
        ratingConfirmationEl.classList.add('hidden');
        leaderboardAreaEl.classList.add('hidden');
        
        // Reset timer styling
        timerDisplayEl.parentElement.style.backgroundColor = '#3498db';
    }
    
    function showRatingArea() {
        registrationEl.classList.add('hidden');
        waitingAreaEl.classList.add('hidden');
        discussionAreaEl.classList.add('hidden');
        ratingAreaEl.classList.remove('hidden');
        ratingConfirmationEl.classList.add('hidden');
        leaderboardAreaEl.classList.add('hidden');
        
        // Reset slider
        wrongnessSlider.value = 5;
        sliderValueDisplay.textContent = 5;
        
        // Display the question they were discussing
        ratingQuestionTextEl.textContent = question;
    }
    
    function showRatingConfirmation() {
        registrationEl.classList.add('hidden');
        waitingAreaEl.classList.add('hidden');
        discussionAreaEl.classList.add('hidden');
        ratingAreaEl.classList.add('hidden');
        ratingConfirmationEl.classList.remove('hidden');
        leaderboardAreaEl.classList.add('hidden');
    }
    
    function showLeaderboard(leaderboardData) {
        registrationEl.classList.add('hidden');
        waitingAreaEl.classList.add('hidden');
        discussionAreaEl.classList.add('hidden');
        ratingAreaEl.classList.add('hidden');
        ratingConfirmationEl.classList.add('hidden');
        leaderboardAreaEl.classList.remove('hidden');
        
        // Populate leaderboard
        leaderboardEl.innerHTML = '';
        
        leaderboardData.forEach((player, index) => {
            const item = document.createElement('div');
            item.className = 'leaderboard-item';
            
            // Highlight current player
            if (player.id === playerId) {
                item.style.backgroundColor = '#e8f8f5';
                item.style.borderLeft = '5px solid #2ecc71';
            }
            
            // Format name for disconnected players
            const displayName = player.connected ? player.name : `${player.name} (disconnected)`;
            
            item.innerHTML = `
                <div class="leaderboard-rank">${index + 1}.</div>
                <div class="leaderboard-name">${displayName}</div>
                <div class="leaderboard-score">${player.averageBasedness}/10</div>
                <div class="leaderboard-stats">(${player.ratingsReceived} ratings)</div>
            `;
            
            leaderboardEl.appendChild(item);
        });
    }
    
    // Helper function to set cookies
    function setCookie(name, value, days) {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "") + expires + "; path=/";
    }
    
    // Event listeners
    registerButton.addEventListener('click', registerPlayer);
    
    playerNameInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            registerPlayer();
        }
    });
    
    wrongnessSlider.addEventListener('input', () => {
        sliderValueDisplay.textContent = wrongnessSlider.value;
    });
    
    submitRatingButton.addEventListener('click', submitRating);
    
    // Initialize
    initializeWebSocket();
});
