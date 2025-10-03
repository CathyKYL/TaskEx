// FaceBomp Game JavaScript
// This file contains all the game logic for the Whack-A-Mole style game

// Game state variables
let gameActive = false;           // Tracks if the game is currently running
let score = 0;                   // Player's current score
let timeLeft = 30;               // Time remaining in seconds
let gameTimer = null;            // Reference to the countdown timer
let faceTimer = null;            // Reference to the face appearance timer
let currentActiveFace = null;    // Currently visible face (null if none)

// DOM element references - getting all the HTML elements we need to interact with
const startButton = document.getElementById('start-button');
const scoreDisplay = document.getElementById('score');
const timerDisplay = document.getElementById('timer');
const finalMessage = document.getElementById('final-message');
const finalScore = document.getElementById('final-score');
const restartButton = document.getElementById('restart-button');
// Audio element references
const whackSound = document.getElementById('whack-sound');
const gameEndSound = document.getElementById('game-end-sound');

// Get all hole elements and their face images
const holes = document.querySelectorAll('.hole');
const faceImages = document.querySelectorAll('.face-image');

// Initialize the game when the page loads
document.addEventListener('DOMContentLoaded', function() {
    console.log('FaceBomp game loaded!');
    
    // Add click event listeners to all holes
    holes.forEach((hole, index) => {
        hole.addEventListener('click', function() {
            handleHoleClick(index);
        });
    });
    
    // Add click event listener to start/restart button
    startButton.addEventListener('click', startGame);
    restartButton.addEventListener('click', startGame);
    
    // Initially hide the final message
    finalMessage.style.display = 'none';
});

/**
 * Starts a new game
 * Resets all game variables and begins the countdown timer
 */
function startGame() {
    console.log('Starting new game...');
    
    // Reset game state
    gameActive = true;
    score = 0;
    timeLeft = 30;
    
    // Update display elements
    updateScore();
    updateTimer();
    
    // Hide final message and show game elements
    finalMessage.style.display = 'none';
    startButton.textContent = 'Game Running...';
    startButton.disabled = true;
    
    // Hide any currently visible faces
    hideAllFaces();
    
    // Start the countdown timer
    startCountdown();
    
    // Start showing faces at random intervals
    scheduleNextFace();
}

/**
 * Handles the countdown timer
 * Decreases timeLeft every second and updates the display
 */
function startCountdown() {
    gameTimer = setInterval(function() {
        timeLeft--;
        updateTimer();
        
        // Check if time is up
        if (timeLeft <= 0) {
            endGame();
        }
    }, 1000); // Run every 1000ms (1 second)
}

/**
 * Updates the timer display on the page
 */
function updateTimer() {
    timerDisplay.textContent = timeLeft;
}

/**
 * Updates the score display on the page
 */
function updateScore() {
    scoreDisplay.textContent = score;
}

/**
 * Schedules the next face to appear at a random interval
 * This creates the unpredictable timing of face appearances
 */
function scheduleNextFace() {
    if (!gameActive) return; // Don't schedule if game is over
    
    // Random interval between 500ms and 2000ms (0.5 to 2 seconds)
    const randomDelay = Math.random() * 1500 + 500;
    
    faceTimer = setTimeout(function() {
        if (gameActive) {
            showRandomFace();
            scheduleNextFace(); // Schedule the next one
        }
    }, randomDelay);
}

/**
 * Shows a face in a random hole
 * Only shows one face at a time
 */
function showRandomFace() {
    if (!gameActive) return;
    
    // Hide any currently visible face first
    hideAllFaces();
    
    // Pick a random hole (0 to 5)
    const randomHoleIndex = Math.floor(Math.random() * holes.length);
    const faceImage = faceImages[randomHoleIndex];
    
    // Show the face with pop-in animation
    faceImage.style.display = 'block';
    faceImage.classList.remove('pop-out');
    faceImage.classList.add('pop-in');
    
    // Remember which face is currently active
    currentActiveFace = randomHoleIndex;
    
    // Auto-hide the face after 1.5 seconds if not clicked
    setTimeout(function() {
        if (currentActiveFace === randomHoleIndex) {
            hideFace(randomHoleIndex);
        }
    }, 1500);
}

/**
 * Hides a specific face with pop-out animation
 * @param {number} holeIndex - The index of the hole to hide the face in
 */
function hideFace(holeIndex) {
    const faceImage = faceImages[holeIndex];
    
    if (faceImage.style.display !== 'none') {
        faceImage.classList.remove('pop-in');
        faceImage.classList.add('pop-out');
        
        // Hide the image after animation completes
        setTimeout(function() {
            faceImage.style.display = 'none';
            faceImage.classList.remove('pop-out');
        }, 300); // Match the CSS animation duration
    }
    
    // Clear the current active face if this was it
    if (currentActiveFace === holeIndex) {
        currentActiveFace = null;
    }
}

/**
 * Hides all faces immediately
 * Used when starting a new game or ending the current game
 */
function hideAllFaces() {
    faceImages.forEach(function(faceImage, index) {
        faceImage.style.display = 'none';
        faceImage.classList.remove('pop-in', 'pop-out');
    });
    currentActiveFace = null;
}

/**
 * Handles when a player clicks on a hole
 * @param {number} holeIndex - The index of the clicked hole
 */
function handleHoleClick(holeIndex) {
    if (!gameActive) return; // Don't respond if game isn't running
    
    const faceImage = faceImages[holeIndex];
    
    // Check if there's a face in this hole
    if (faceImage.style.display !== 'none' && currentActiveFace === holeIndex) {
        // Player hit the face! Increase score
        score++;
        updateScore();
        
        // Play whack sound effect
        playWhackSound();
        
        // Apply whack effect to the image
        applyWhackEffect(faceImage);
        
        // Hide the face after whack effect
        setTimeout(function() {
            hideFace(holeIndex);
        }, 200); // Delay to show the whack effect
        
        console.log('Face hit! Score:', score);
    }
}

/**
 * Applies a visual "whack" effect to a face image
 * @param {HTMLElement} faceImage - The image element to apply the effect to
 */
function applyWhackEffect(faceImage) {
    // Add whack effect classes
    faceImage.classList.add('whacked');
    
    // Apply immediate visual changes
    faceImage.style.transform = 'scale(1.3) rotate(15deg)';
    faceImage.style.filter = 'brightness(1.5) contrast(1.2)';
    faceImage.style.boxShadow = '0 0 20px rgba(255, 255, 0, 0.8)';
    
    // Reset the effect after animation
    setTimeout(function() {
        faceImage.style.transform = 'scale(1) rotate(0deg)';
        faceImage.style.filter = 'brightness(1) contrast(1)';
        faceImage.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
        faceImage.classList.remove('whacked');
    }, 200);
}

/**
 * Ends the current game
 * Stops all timers and shows the final results
 */
function endGame() {
    console.log('Game ended! Final score:', score);
    
    // Stop the game
    gameActive = false;
    
    // Clear all timers
    if (gameTimer) {
        clearInterval(gameTimer);
        gameTimer = null;
    }
    if (faceTimer) {
        clearTimeout(faceTimer);
        faceTimer = null;
    }
    
    // Hide all faces
    hideAllFaces();
    
    // Play game end sound
    playGameEndSound();
    
    // Show final message with witty comment
    showFinalMessage();
    
    // Reset the start button
    startButton.textContent = 'Start Game';
    startButton.disabled = false;
}

/**
 * Shows the final game results with a witty message based on score
 */
function showFinalMessage() {
    // Update the final score display
    finalScore.textContent = score;
    
    // Generate a witty message based on the score
    let wittyMessage = '';
    
    if (score === 0) {
        wittyMessage = "Ouch! Maybe try opening your eyes next time? 😅";
    } else if (score <= 5) {
        wittyMessage = "Not bad for a beginner! Keep practicing! 🎯";
    } else if (score <= 10) {
        wittyMessage = "Pretty good! You're getting the hang of it! 👍";
    } else if (score <= 15) {
        wittyMessage = "Excellent work! You've got some serious skills! 🏆";
    } else if (score <= 20) {
        wittyMessage = "Wow! You're a FaceBomp master! Incredible! 🌟";
    } else {
        wittyMessage = "LEGENDARY! You're the FaceBomp champion! 🥇👑";
    }
    
    // Update the final message (we'll need to add this element to HTML)
    const messageElement = finalMessage.querySelector('p:last-of-type');
    if (messageElement) {
        messageElement.textContent = wittyMessage;
    }
    
    // Show the final message
    finalMessage.style.display = 'block';
}

// Optional: Add keyboard support for accessibility
document.addEventListener('keydown', function(event) {
    // Press spacebar to start/restart game
    if (event.code === 'Space' && !gameActive) {
        event.preventDefault();
        startGame();
    }
});

/**
 * Plays the whack sound effect when hitting a face
 */
function playWhackSound() {
    if (whackSound) {
        whackSound.currentTime = 0; // Reset to beginning
        whackSound.play().catch(function(error) {
            console.log('Could not play whack sound:', error);
        });
    }
}

/**
 * Plays the game end sound effect (clapping/cheering)
 */
function playGameEndSound() {
    if (gameEndSound) {
        gameEndSound.currentTime = 0; // Reset to beginning
        gameEndSound.play().catch(function(error) {
            console.log('Could not play game end sound:', error);
        });
    }
}
