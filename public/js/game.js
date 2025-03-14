// Import needed modules
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// Connect to Socket.IO server with configuration
let socket;
try {
    console.log("Attempting to connect to Socket.IO server at:", CONFIG.SERVER_URL);
    socket = io(CONFIG.SERVER_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10
    });
    
    console.log("Socket.IO connection initialized");
    
    // Setup socket connection error handling
    socket.on('connect_error', (error) => {
        console.error("Socket.IO connection error:", error);
        alert("Failed to connect to game server. Please try again later.");
    });
} catch (error) {
    console.error("Error initializing Socket.IO:", error);
    alert("Failed to initialize game connection. Please try again later.");
}

// Device detection
const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// Detect iOS specifically
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Ensure login form is properly visible on mobile
function ensureLoginFormVisibility() {
    // Get references to the login form elements
    const startScreen = document.getElementById('startScreen');
    const startContainer = startScreen.querySelector('.start-container');
    
    if (isTouchDevice) {
        console.log('Ensuring login form visibility on mobile device');
        
        // Make sure the start screen is visible and on top
        startScreen.style.display = 'flex';
        startScreen.style.zIndex = '3000';
        
        // For iOS, add extra touchability improvements
        if (isIOS) {
            console.log('Applying iOS-specific form fixes');
            
            // Set minimum heights for form elements
            const formElements = startScreen.querySelectorAll('input, button, .team-option');
            formElements.forEach(elem => {
                elem.style.minHeight = '50px';
            });
            
            // Make start container more visible
            startContainer.style.backgroundColor = 'rgba(50, 50, 50, 0.95)';
        }
    }
}

// Call this function when the window loads
window.addEventListener('load', function() {
    console.log("Window loaded - initializing login form");
    
    // Make sure player data is reset
    playerData = {
        name: '',
        team: '',
        color: null
    };
    
    // Get references to form elements
    const startScreen = document.getElementById('startScreen');
    const playerNameInput = document.getElementById('playerName');
    const teamDemocrat = document.getElementById('teamDemocrat');
    const teamRepublican = document.getElementById('teamRepublican');
    const startButton = document.getElementById('startButton');
    
    if (!startScreen || !playerNameInput || !teamDemocrat || !teamRepublican || !startButton) {
        console.error("Failed to find all required form elements!");
        return;
    }
    
    // Reset team selection
    teamDemocrat.classList.remove('selected');
    teamRepublican.classList.remove('selected');
    
    // Clear name input and focus it
    playerNameInput.value = '';
    
    // Only try to focus on desktop - can cause issues on mobile
    if (!isTouchDevice) {
        setTimeout(() => {
            playerNameInput.focus();
        }, 500);
    }
    
    // Team selection
    teamDemocrat.addEventListener('click', () => {
        console.log("Democrat team selected");
        teamDemocrat.classList.add('selected');
        teamRepublican.classList.remove('selected');
        playerData.team = 'democrats';
        validateForm();
    });

    teamRepublican.addEventListener('click', () => {
        console.log("Republican team selected");
        teamRepublican.classList.add('selected');
        teamDemocrat.classList.remove('selected');
        playerData.team = 'republicans';
        validateForm();
    });
    
    // Add touchstart handlers for mobile
    if (isTouchDevice) {
        console.log("Setting up mobile-specific form handlers");
        
        teamDemocrat.addEventListener('touchstart', (e) => {
            e.preventDefault();
            console.log("Democrat team touchstart");
            teamDemocrat.classList.add('selected');
            teamRepublican.classList.remove('selected');
            playerData.team = 'democrats';
            validateForm();
        });

        teamRepublican.addEventListener('touchstart', (e) => {
            e.preventDefault();
            console.log("Republican team touchstart");
            teamRepublican.classList.add('selected');
            teamDemocrat.classList.remove('selected');
            playerData.team = 'republicans';
            validateForm();
        });
        
        // Add touchstart handler for the start button
        startButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            console.log("Start button touchstart");
            if (!startButton.disabled) {
                startGame();
            }
        });
    }
    
    // Name input validation
    playerNameInput.addEventListener('input', () => {
        console.log("Name input changed: " + playerNameInput.value);
        validateForm();
    });
    
    // Start game when form is submitted
    startButton.addEventListener('click', startGame);
    
    // Force validation to update button state
    validateForm();
    
    function validateForm() {
        const name = playerNameInput.value.trim();
        const team = playerData.team;
        
        console.log(`Validating form - Name: "${name}" (${name.length} chars), Team: ${team}`);
        
        // Enable button if both name and team are selected
        if (name.length >= 2 && team) {
            console.log("Form valid - enabling button");
            startButton.disabled = false;
            startButton.style.backgroundColor = "#4CAF50";
            startButton.style.cursor = "pointer";
        } else {
            console.log("Form invalid - disabling button");
            startButton.disabled = true;
            startButton.style.backgroundColor = "#cccccc";
            startButton.style.cursor = "not-allowed";
        }
    }
    
    console.log("Login form initialized");
    
    // Ensure the login form is visible on mobile
    ensureLoginFormVisibility();
});

// Player data
let playerData = {
    name: '',
    team: '',
    color: null
};

// Store other players
const otherPlayers = {};

// Store projectiles
const projectiles = {};

// Shooting cooldown management
let canShoot = true;
const SHOOT_COOLDOWN = 500; // milliseconds between shots

// Player position update rate management
let lastPositionUpdate = 0;
const positionUpdateInterval = 30; // milliseconds between position updates for non-mobile

// Position sync debugging - track last known positions from server
let lastSentPosition = null;
let forceSyncCounter = 0;
const FORCE_SYNC_INTERVAL = 10; // Force sync every ~10 frames (1/6 second)
const POSITION_SYNC_DEBUG = true; // Enable detailed position logging

// Position sync reliability
let syncAttempts = 0;
const MAX_SYNC_RETRIES = 3;
let syncSuccess = false;
let initialSyncComplete = false;

// Store joystick input for mobile movement
let joystickInputVector = {x: 0, y: 0};

// Initialize scene, camera, and renderer
const scene = new THREE.Scene();
// Add a blue sky background
scene.background = new THREE.Color(0x87CEEB);
// Add fog to create depth and atmosphere
scene.fog = new THREE.FogExp2(0x87CEEB, 0.01);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputEncoding = THREE.sRGBEncoding || THREE.LinearSRGBColorSpace; // Updated for Three.js compatibility
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Add lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7); // Increased brightness
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0); // Increased brightness
directionalLight.position.set(5, 10, 7);
directionalLight.castShadow = true;
// Optimize shadows
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
scene.add(directionalLight);

// Add a second directional light from another angle to reduce shadows
const secondaryLight = new THREE.DirectionalLight(0xffffff, 0.5);
secondaryLight.position.set(-5, 8, -7);
scene.add(secondaryLight);

// Add ground plane if map doesn't include it
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x7CFC00, // Bright green like grass
    roughness: 0.8,
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2; // Rotate to be horizontal
ground.position.y = -0.1; // Slightly below the origin
ground.receiveShadow = true;
scene.add(ground);

// Set up first-person controls
const controls = new PointerLockControls(camera, document.body);

// iOS Safari workaround for PointerLockControls
if (isIOS) {
    // Patch the PointerLockControls for iOS Safari
    const originalLock = controls.lock;
    controls.lock = function() {
        console.log('Patched lock method called for iOS');
        try {
            originalLock.call(controls);
        } catch (error) {
            console.warn('Error in original lock:', error);
            // Fire the lock event manually if the API fails
            controls.dispatchEvent({ type: 'lock' });
        }
    };
}

// Additional mobile device compatibility
if (isTouchDevice) {
    // Add a debug tap event to document.body for testing
    document.body.addEventListener('touchstart', function(e) {
        console.log('Body touchstart registered');
    });
}

// Create an instructions overlay
const instructions = document.createElement('div');
instructions.id = 'instructions';
instructions.style.position = 'absolute';
instructions.style.top = '50%';
instructions.style.width = '100%';
instructions.style.textAlign = 'center';
instructions.style.color = 'white';
instructions.style.fontSize = '18px';
instructions.style.transform = 'translateY(-50%)';
instructions.style.padding = '20px';
instructions.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
instructions.style.zIndex = '2000';
instructions.style.cursor = 'pointer';

// Mobile-specific styles to improve touchability
if (isTouchDevice) {
    instructions.style.fontSize = '22px';
    instructions.style.padding = '30px 20px';
}

// Default instructions for desktop
const desktopInstructions = 'Click to play<br>WASD = Move<br>Mouse = Look<br>SPACE = Shoot<br>ESC = Pause';
// Mobile-friendly instructions
const mobileInstructions = 'Tap to play<br>Left joystick = Move<br>Right joystick = Look<br>Red button = Shoot';

// Set appropriate instructions based on device
instructions.innerHTML = isTouchDevice ? mobileInstructions : desktopInstructions;
document.body.appendChild(instructions);
// Initially hide instructions until the start screen is completed
instructions.style.display = 'none';

// Create orientation message for mobile
const orientationMessage = document.createElement('div');
orientationMessage.style.position = 'absolute';
orientationMessage.style.top = '0';
orientationMessage.style.left = '0';
orientationMessage.style.width = '100%';
orientationMessage.style.height = '100%';
orientationMessage.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
orientationMessage.style.color = 'white';
orientationMessage.style.display = 'flex';
orientationMessage.style.alignItems = 'center';
orientationMessage.style.justifyContent = 'center';
orientationMessage.style.zIndex = '2000';
orientationMessage.style.fontSize = '24px';
orientationMessage.innerHTML = '<div>Please rotate your device to landscape mode for the best experience</div>';
orientationMessage.style.display = 'none';
document.body.appendChild(orientationMessage);

let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let canJump = false;

// NippleJS joystick instances
let leftJoystick = null;
let rightJoystick = null;
let shootButton = null;

// Add touch controls for mobile
const createTouchControls = () => {
    try {
        console.log('Creating touch controls...');
        
        // First, check if there's an existing touch controls container and remove it
        const existingControls = document.getElementById('touchControls');
        if (existingControls) {
            existingControls.remove();
            console.log('Removed existing touch controls');
        }
        
        // Create container for joysticks
        const touchControls = document.createElement('div');
        touchControls.style.position = 'absolute';
        touchControls.style.top = '0';
        touchControls.style.left = '0';
        touchControls.style.width = '100%';
        touchControls.style.height = '100%';
        touchControls.style.pointerEvents = 'none';
        touchControls.style.zIndex = '1000'; // Lower z-index than start screen
        touchControls.style.display = 'none'; // Initially hidden
        touchControls.id = 'touchControls';
        document.body.appendChild(touchControls);
        
        // Left joystick container (for movement)
        const leftJoystickContainer = document.createElement('div');
        leftJoystickContainer.style.position = 'absolute';
        leftJoystickContainer.style.bottom = '70px';
        leftJoystickContainer.style.left = '70px';
        leftJoystickContainer.style.width = '120px';
        leftJoystickContainer.style.height = '120px';
        leftJoystickContainer.style.pointerEvents = 'auto';
        leftJoystickContainer.style.backgroundColor = 'rgba(255,255,255,0.3)'; // Make it more visible
        leftJoystickContainer.style.borderRadius = '50%'; // Make it round
        leftJoystickContainer.style.border = '2px solid rgba(255,255,255,0.6)'; // Add border
        leftJoystickContainer.id = 'leftJoystick';
        touchControls.appendChild(leftJoystickContainer);
        
        // Right joystick container (for camera rotation)
        const rightJoystickContainer = document.createElement('div');
        rightJoystickContainer.style.position = 'absolute';
        rightJoystickContainer.style.bottom = '70px';
        rightJoystickContainer.style.right = '70px';
        rightJoystickContainer.style.width = '120px';
        rightJoystickContainer.style.height = '120px';
        rightJoystickContainer.style.pointerEvents = 'auto';
        rightJoystickContainer.style.backgroundColor = 'rgba(255,255,255,0.3)'; // Make it more visible
        rightJoystickContainer.style.borderRadius = '50%'; // Make it round
        rightJoystickContainer.style.border = '2px solid rgba(255,255,255,0.6)'; // Add border
        rightJoystickContainer.id = 'rightJoystick';
        touchControls.appendChild(rightJoystickContainer);
        
        // Shoot button
        shootButton = document.createElement('div');
        shootButton.style.position = 'absolute';
        shootButton.style.right = '70px';
        shootButton.style.top = '70px';
        shootButton.style.width = '70px';
        shootButton.style.height = '70px';
        shootButton.style.borderRadius = '50%';
        shootButton.style.backgroundColor = 'rgba(255, 0, 0, 0.6)';
        shootButton.style.border = '2px solid white';
        shootButton.style.pointerEvents = 'auto';
        shootButton.style.display = 'flex';
        shootButton.style.alignItems = 'center';
        shootButton.style.justifyContent = 'center';
        shootButton.style.color = 'white';
        shootButton.style.fontSize = '14px';
        shootButton.style.fontWeight = 'bold';
        shootButton.innerHTML = 'SHOOT';
        shootButton.id = 'shootButton';
        touchControls.appendChild(shootButton);
        
        // Initialize nippleJS joysticks
        console.log('Initializing joysticks with nippleJS version:', nipplejs ? nipplejs.version || 'unknown' : 'not loaded');
        
        if (!nipplejs) {
            throw new Error('nippleJS library not found! Mobile controls will not work.');
        }
        
        leftJoystick = nipplejs.create({
            zone: document.getElementById('leftJoystick'),
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'white',
            size: 100,
            threshold: 0.05 // Lower threshold for more responsive movement
        });
        
        rightJoystick = nipplejs.create({
            zone: document.getElementById('rightJoystick'),
            mode: 'static',
            position: { left: '50%', top: '50%' },
            color: 'white',
            size: 120,                    // Larger size for better touch area
            threshold: 0.05,              // Lower threshold for more sensitivity
            fadeTime: 0,                  // No fade for instant feedback
            multitouch: true,             // Support multitouch
            maxNumberOfNipples: 2,        // Allow both joysticks to work
            dynamicPage: true,            // Better for full-screen apps
            restOpacity: 0.8,             // More visible at rest
            shape: 'circle',              // Circle shape
            lockX: false,                 // Don't lock axis
            lockY: false,
            restJoystick: true            // Return to center when released
        });
        
        // Setup left joystick for movement
        leftJoystick.on('move', function(evt, data) {
            try {
                // Calculate normalized direction vector
                const angle = data.angle.radian;
                const force = Math.min(data.force, 1);  // Cap force at 1
                
                // Convert polar to cartesian coordinates
                // Note: NippleJS treats 0° as right, and goes clockwise
                const x = Math.cos(angle) * force;
                const y = Math.sin(angle) * force;
                
                console.log(`Left joystick: angle=${(angle * 180 / Math.PI).toFixed(0)}°, force=${force.toFixed(2)}, x=${x.toFixed(2)}, y=${y.toFixed(2)}`);
                
                // Set movement flags based on direction - reduce threshold for more sensitivity
                moveForward = y < -0.2;  // Up direction
                moveBackward = y > 0.2;  // Down direction
                moveLeft = x < -0.2;     // Left direction
                moveRight = x > 0.2;     // Right direction
                
                // Override camera direction for direct movement on mobile
                // This stores the joystick input for use in the animate loop
                joystickInputVector = {x: x, y: y};
                
                // Force an immediate position update to ensure sync
                if (controls.isLocked && playerMesh) {
                    sendPositionUpdate(true);
                }
            } catch (error) {
                console.error('Error in left joystick move handler:', error);
            }
        });
        
        leftJoystick.on('end', function() {
            // Reset all movement flags when joystick is released
            moveForward = false;
            moveBackward = false;
            moveLeft = false;
            moveRight = false;
            
            // Reset joystick input vector
            joystickInputVector = {x: 0, y: 0};
            
            console.log('Left joystick released, stopping movement');
            
            // Force an immediate position update to ensure sync
            if (controls.isLocked && playerMesh) {
                sendPositionUpdate(true);
            }
        });
        
        // Setup right joystick for camera rotation
        rightJoystick.on('move', (evt, data) => {
            // Get the joystick position using vector components
            const xInput = data.vector.x;
            const yInput = data.vector.y;
            
            // Debug info to show joystick values
            console.log(`[Right Joystick] Raw x: ${xInput.toFixed(2)}, y: ${yInput.toFixed(2)}, direction: ${data.direction?.angle || 'none'}`);
            
            // Calculate rotation speed based on distance from center (force)
            const rotationSpeed = 0.05 * data.force;
            
            // Apply horizontal rotation (looking left/right)
            // Negative xInput turns camera left, positive turns right
            camera.rotation.y -= xInput * rotationSpeed;
            
            // Apply vertical rotation (looking up/down) with limits
            // Invert the Y input to fix the up/down inversion
            // Negative yInput now looks down, positive looks up
            const newRotationX = camera.rotation.x + yInput * rotationSpeed; // Inverted from - to +
            
            // Limit the vertical rotation to prevent flipping
            const maxVerticalRotation = Math.PI/2 - 0.1; // Just under 90 degrees
            camera.rotation.x = Math.max(-maxVerticalRotation, Math.min(maxVerticalRotation, newRotationX));
            
            console.log(`[Camera] rotation x: ${camera.rotation.x.toFixed(2)}, y: ${camera.rotation.y.toFixed(2)}`);
        });
        
        // Setup shoot button
        shootButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            shootProjectile();
        });
        
        // Make sure touch controls are hidden until game starts
        touchControls.style.display = 'none';
        
        console.log('Touch controls created successfully! (initially hidden)');
    } catch (error) {
        console.error('Error creating touch controls:', error);
        alert('Failed to initialize mobile controls. Error: ' + error.message);
    }
};

// Check and update orientation
function checkOrientation() {
    if (!isTouchDevice) return;
    
    // Check if device is in portrait mode
    const isPortrait = window.innerHeight > window.innerWidth;
    
    if (isPortrait) {
        orientationMessage.style.display = 'flex';
    } else {
        orientationMessage.style.display = 'none';
    }
}

// Detect if user is on mobile and create touch controls
if (isTouchDevice) {
    // Check if nippleJS is already loaded
    if (typeof nipplejs !== 'undefined') {
        console.log('nippleJS is already loaded from HTML');
        // Create touch controls immediately
        createTouchControls();
        // Check initial orientation
        checkOrientation();
        
        // Special handling for iOS
        if (isIOS) {
            console.log("Adding iOS-specific touch handlers");
            
            // Make joystick elements larger and more responsive on iOS
            const joystickElements = [
                document.getElementById('leftJoystick'),
                document.getElementById('rightJoystick'),
                document.getElementById('shootButton')
            ];
            
            // Add special iOS-specific touch handlers to each joystick
            joystickElements.forEach(element => {
                if (element) {
                    // Make the elements more visible on iOS
                    element.style.border = '2px solid rgba(255, 255, 255, 0.8)';
                    element.style.borderRadius = '50%';
                    element.style.backgroundColor = 'rgba(50, 50, 50, 0.3)';
                    
                    // Add touch event listeners with non-passive option for iOS
                    ['touchstart', 'touchmove', 'touchend'].forEach(eventType => {
                        element.addEventListener(eventType, function(e) {
                            console.log(`Touch ${eventType} on ${element.id}`);
                            e.preventDefault();
                            // Don't stop propagation so nippleJS can handle the event
                        }, { passive: false });
                    });
                    
                    // Special handling for left joystick on iOS to ensure movement works
                    if (element.id === 'leftJoystick') {
                        element.style.width = '150px';  // Make left joystick bigger
                        element.style.height = '150px';
                        
                        // Add a specialized touch handler to ensure movement on iOS
                        element.addEventListener('touchmove', function(e) {
                            if (e.touches && e.touches[0]) {
                                // Calculate center of the joystick container
                                const rect = element.getBoundingClientRect();
                                const centerX = rect.left + rect.width / 2;
                                const centerY = rect.top + rect.height / 2;
                                
                                // Calculate touch position relative to center
                                const touchX = e.touches[0].clientX - centerX;
                                const touchY = e.touches[0].clientY - centerY;
                                
                                // Normalize to get vector with -1 to 1 range
                                const maxRadius = rect.width / 2;
                                let x = touchX / maxRadius;
                                let y = touchY / maxRadius;
                                
                                console.log(`[iOS direct touch] x: ${x.toFixed(2)}, y: ${y.toFixed(2)}`);
                                
                                // Set movement flags directly with INVERTED Y-axis
                                moveForward = y < -0.1;     // Up on joystick = forward
                                moveBackward = y > 0.1;     // Down on joystick = backward
                                moveLeft = x < -0.1;        // Left on joystick = left (unchanged)
                                moveRight = x > 0.1;        // Right on joystick = right (unchanged)
                                
                                // Force an immediate position update to ensure sync
                                if (controls.isLocked && playerMesh) {
                                    sendPositionUpdate(true);
                                }
                            }
                        }, { passive: false });
                    }
                }
            });
            
            // Enhanced handling for iOS touch events on the document, but only during gameplay
            document.addEventListener('touchstart', function(e) {
                // Only prevent default when in game mode (controls locked) and not touching UI elements
                if (controls.isLocked) {
                    const isStartScreen = e.target.closest('#startScreen');
                    const isUIelement = isStartScreen || 
                                      e.target.closest('#instructionScreen') ||
                                      e.target.closest('#shootButton');
                    
                    // Don't prevent default on start screen to ensure form works
                    if (!isUIelement) {
                        e.preventDefault();
                    }
                    
                    // Log what's happening
                    console.log(`Touch on document - isStartScreen: ${isStartScreen}, prevent: ${!isUIelement}`);
                }
            }, { passive: false });
            
            // Add touchend and touchcancel handlers to ensure movement stops
            document.addEventListener('touchend', function(e) {
                if (controls.isLocked) {
                    console.log("iOS document touchend event");
                }
            }, { passive: true });
            
            // Add enhanced iOS viewport meta tags dynamically
            const metaViewport = document.querySelector('meta[name=viewport]');
            if (metaViewport) {
                metaViewport.setAttribute('content', 
                    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
            }
        }
    } else {
        // Fallback to dynamic loading if not already loaded
        console.log('Attempting to load nippleJS dynamically');
        const nippleScript = document.createElement('script');
        nippleScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/nipplejs/0.10.1/nipplejs.min.js';
        nippleScript.onload = () => {
            console.log('nippleJS loaded dynamically');
            // Create touch controls once nippleJS is loaded
            createTouchControls();
            // Check initial orientation
            checkOrientation();
            
            // Special handling for iOS
            if (isIOS) {
                console.log("Adding iOS-specific touch handlers");
                // ... existing iOS handling code ...
            }
        };
        nippleScript.onerror = (err) => {
            console.error('Failed to load nippleJS:', err);
            alert('Failed to load mobile controls. Please try refreshing the page.');
        };
        document.head.appendChild(nippleScript);
    }
    
    // Add orientation change listener
    window.addEventListener('resize', checkOrientation);
}

// Event listeners for pointer lock
instructions.addEventListener('click', function () {
    console.log('Click event fired');
    controls.lock();
});

// Enhanced handling for iOS
instructions.addEventListener('touchstart', function (e) {
    console.log('Touchstart event fired on iOS: ' + isIOS);
    e.preventDefault();
    
    // For iOS Safari, we need a more aggressive approach
    if (isIOS) {
        console.log('iOS device detected, attempting multiple methods');
        
        // Direct method - try without delay first
        controls.lock();
        
        // Also try with a sequence of delays as fallbacks
        setTimeout(() => {
            console.log('iOS fallback 1: trying lock again after 100ms');
            controls.lock();
            
            // Create a simulated click as another fallback
            setTimeout(() => {
                console.log('iOS fallback 2: simulating click event');
                const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });
                instructions.dispatchEvent(clickEvent);
                
                // Last attempt with longer delay
                setTimeout(() => {
                    console.log('iOS fallback 3: final attempt with direct DOM API');
                    // For iOS Safari, try to focus an element first
                    document.body.focus();
                    controls.lock();
                }, 300);
            }, 200);
        }, 100);
    } else {
        controls.lock();
    }
});

// Older iOS devices sometimes work better with touchend
instructions.addEventListener('touchend', function (e) {
    console.log('Touchend event fired');
    if (isIOS) {
        e.preventDefault();
        console.log('iOS touchend handler triggered');
        setTimeout(() => {
            controls.lock();
        }, 10);
    }
});

// Add special handling for iOS Safari
if (isIOS) {
    // Add a persistent tap overlay that's always active
    const iosTapOverlay = document.createElement('div');
    iosTapOverlay.id = 'iosTapOverlay';
    iosTapOverlay.style.position = 'absolute';
    iosTapOverlay.style.top = '0';
    iosTapOverlay.style.left = '0';
    iosTapOverlay.style.width = '100%';
    iosTapOverlay.style.height = '100%';
    iosTapOverlay.style.zIndex = '3000';
    iosTapOverlay.style.display = 'none';
    iosTapOverlay.style.background = 'transparent';
    document.body.appendChild(iosTapOverlay);
    
    // Add instructions to the specific overlay
    const iosTapText = document.createElement('div');
    iosTapText.style.position = 'absolute';
    iosTapText.style.top = '50%';
    iosTapText.style.left = '50%';
    iosTapText.style.transform = 'translate(-50%, -50%)';
    iosTapText.style.color = 'white';
    iosTapText.style.fontSize = '26px';
    iosTapText.style.textAlign = 'center';
    iosTapText.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    iosTapText.style.padding = '30px';
    iosTapText.style.borderRadius = '15px';
    iosTapText.innerHTML = 'Tap anywhere<br>to start';
    iosTapOverlay.appendChild(iosTapText);
    
    // Handle touch on this overlay
    iosTapOverlay.addEventListener('touchstart', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log('iOS overlay touchstart fired');
        
        // Hide the overlay
        iosTapOverlay.style.display = 'none';
        
        // Try to lock controls
        controls.lock();
    });
    
    // Show the iOS-specific overlay when needed
    controls.addEventListener('unlock', function() {
        if (startScreen.style.display === 'none') {
            instructions.style.display = 'none';
            iosTapOverlay.style.display = 'block';
        }
    });
}

controls.addEventListener('lock', function () {
    instructions.style.display = 'none';
    // Show touch controls when game starts if on a touch device
    if (isTouchDevice) {
        const touchControls = document.getElementById('touchControls');
        if (touchControls) {
            console.log('Enabling mobile touch controls');
            touchControls.style.display = 'block';
        } else {
            console.error('Touch controls element not found when trying to display them');
            // Try to recreate the controls
            createTouchControls();
            const newTouchControls = document.getElementById('touchControls');
            if (newTouchControls) {
                newTouchControls.style.display = 'block';
            }
        }
    }
});

controls.addEventListener('unlock', function () {
    instructions.style.display = 'block';
});

// Setup key controls
const onKeyDown = function (event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = true;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = true;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = true;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = true;
            break;
        case 'Space':
            // Shoot when space is pressed
            if (controls.isLocked && canShoot) {
                shootProjectile();
            }
            break;
    }
};

const onKeyUp = function (event) {
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
            moveForward = false;
            break;
        case 'ArrowLeft':
        case 'KeyA':
            moveLeft = false;
            break;
        case 'ArrowDown':
        case 'KeyS':
            moveBackward = false;
            break;
        case 'ArrowRight':
        case 'KeyD':
            moveRight = false;
            break;
    }
};

// Only add keyboard listeners on non-touch devices or hybrid devices
document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

// Function to create and shoot a projectile
function shootProjectile() {
    if (!canShoot) return;
    
    // Implement shooting cooldown
    canShoot = false;
    setTimeout(() => {
        canShoot = true;
    }, SHOOT_COOLDOWN);
    
    // Get the direction the camera is facing
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    
    // Scale the direction to set projectile speed
    const velocity = direction.multiplyScalar(0.7);
    
    // Set projectile starting position slightly in front of the camera
    const position = new THREE.Vector3();
    position.copy(camera.position);
    position.add(direction.multiplyScalar(1)); // Start 1 unit in front
    
    // Send projectile data to server
    socket.emit('shootProjectile', {
        position: {
            x: position.x,
            y: position.y,
            z: position.z
        },
        velocity: {
            x: velocity.x,
            y: velocity.y,
            z: velocity.z
        }
    });
}

// Player movement speed
const speed = 0.1;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

// Position the camera
camera.position.y = 1.6; // Typical eye height

// Create a loading screen
const loadingScreen = document.createElement('div');
loadingScreen.style.position = 'absolute';
loadingScreen.style.top = '0';
loadingScreen.style.left = '0';
loadingScreen.style.width = '100%';
loadingScreen.style.height = '100%';
loadingScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
loadingScreen.style.display = 'flex';
loadingScreen.style.flexDirection = 'column';
loadingScreen.style.alignItems = 'center';
loadingScreen.style.justifyContent = 'center';
loadingScreen.style.zIndex = '1000';
loadingScreen.style.color = 'white';
loadingScreen.style.fontSize = '24px';
document.body.appendChild(loadingScreen);
// Initially hide loading screen until start screen is completed
loadingScreen.style.display = 'none';

// Loading progress text
const loadingText = document.createElement('div');
loadingText.textContent = 'Loading map: 0%';
loadingScreen.appendChild(loadingText);

// Loading progress bar container
const progressBarContainer = document.createElement('div');
progressBarContainer.style.width = '50%';
progressBarContainer.style.height = '20px';
progressBarContainer.style.backgroundColor = '#333';
progressBarContainer.style.borderRadius = '10px';
progressBarContainer.style.marginTop = '20px';
progressBarContainer.style.overflow = 'hidden';
loadingScreen.appendChild(progressBarContainer);

// Loading progress bar
const progressBar = document.createElement('div');
progressBar.style.width = '0%';
progressBar.style.height = '100%';
progressBar.style.backgroundColor = '#4CAF50';
progressBar.style.transition = 'width 0.3s';
progressBarContainer.appendChild(progressBar);

// Player representation
let playerMesh;
let playerModel;

// Create player marker based on team
function createPlayerMarker() {
    // Choose color based on team
    const teamColor = playerData.team === 'democrats' ? 0x3b5998 : 0xdb2828;
    playerData.color = teamColor;
    
    // Create a container for player model
    playerMesh = new THREE.Group();
    
    // Load the 3D model
    const loader = new GLTFLoader();
    loader.load(
        '/assets/republicans.glb',
        function(gltf) {
            playerModel = gltf.scene;
            
            // Add the model to the player mesh
            playerMesh.add(playerModel);
            
            // Apply team color to the model
            playerModel.traverse((node) => {
                if (node.isMesh && node.material) {
                    // Create a new material with the team color
                    const newMaterial = new THREE.MeshStandardMaterial({
                        color: new THREE.Color(teamColor),
                        roughness: 0.7,
                        metalness: 0.3
                    });
                    node.material = newMaterial;
                }
            });
            
            // Scale and position the model as needed
            playerModel.scale.set(0.006, 0.006, 0.006);
            playerModel.position.y = -0.9; // Adjust based on model
            
            // Make model cast shadows
            playerModel.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            
            // Hide the player's model in first person view
            playerModel.visible = false;
            
            // Add a nametag above the player
            createNameTag(playerData.name, playerMesh);
            
            // Add the player mesh to the scene
            scene.add(playerMesh);
            
            console.log(`Player model loaded: ${playerData.name} (${playerData.team})`);
        },
        function(xhr) {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        function(error) {
            console.error('An error happened loading the player model:', error);
            
            // Fallback to a simple cylinder if model fails to load
            const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1.8, 8);
            const material = new THREE.MeshStandardMaterial({ color: teamColor });
            const cylinder = new THREE.Mesh(geometry, material);
            cylinder.castShadow = true;
            playerMesh.add(cylinder);
            
            // Store reference to cylinder as playerModel for visibility control
            playerModel = cylinder;
            
            // Hide the player's model in first person view
            playerModel.visible = false;
            
            // Add a nametag above the player
            createNameTag(playerData.name, playerMesh);
            
            // Add the player mesh to the scene
            scene.add(playerMesh);
        }
    );
}

// Function to create a nametag
function createNameTag(name, parent) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    
    // Draw background
    context.fillStyle = '#00000088';
    context.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw text
    context.font = 'bold 36px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(name, canvas.width / 2, canvas.height / 2);
    
    // Create texture and sprite
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(0, 1.5, 0);
    sprite.scale.set(2, 0.5, 1);
    
    // Add the nametag to the parent
    parent.add(sprite);
}

// Function to add another player to the scene
function addOtherPlayer(playerInfo) {
    // Create a group for the player
    const otherPlayerMesh = new THREE.Group();
    
    // Set position and rotation
    otherPlayerMesh.position.set(
        playerInfo.position.x,
        playerInfo.position.y,
        playerInfo.position.z
    );
    otherPlayerMesh.rotation.set(
        playerInfo.rotation.x,
        playerInfo.rotation.y,
        playerInfo.rotation.z
    );
    
    // Store whether this player is on a mobile device
    otherPlayerMesh.userData = otherPlayerMesh.userData || {};
    otherPlayerMesh.userData.isMobile = playerInfo.isMobile || false;
    
    // Add visual indicator for mobile players (optional)
    if (playerInfo.isMobile) {
        const mobileIndicator = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0x00ffff })
        );
        mobileIndicator.position.y = 2.2; // Position above head
        otherPlayerMesh.add(mobileIndicator);
    }
    
    // Load the 3D model
    const loader = new GLTFLoader();
    loader.load(
        '/assets/republicans.glb',
        function(gltf) {
            const model = gltf.scene;
            
            // Add the model to the player mesh
            otherPlayerMesh.add(model);
            
            // Apply team color to the model
            model.traverse((node) => {
                if (node.isMesh && node.material) {
                    // Create a new material with the team color
                    const newMaterial = new THREE.MeshStandardMaterial({
                        color: new THREE.Color(playerInfo.color),
                        roughness: 0.7,
                        metalness: 0.3
                    });
                    node.material = newMaterial;
                }
            });
            
            // Scale and position the model as needed
            model.scale.set(0.006, 0.006, 0.006);
            model.position.y = -0.9; // Adjust based on model
            
            // Make model cast shadows
            model.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            
            console.log(`Other player model loaded: ${playerInfo.name} (${playerInfo.team})`);
        },
        null,
        function(error) {
            console.error('An error happened loading other player model:', error);
            
            // Fallback to a simple cylinder if model fails to load
            const geometry = new THREE.CylinderGeometry(0.5, 0.5, 1.8, 8);
            const material = new THREE.MeshStandardMaterial({ color: playerInfo.color });
            const cylinder = new THREE.Mesh(geometry, material);
            cylinder.castShadow = true;
            otherPlayerMesh.add(cylinder);
        }
    );
    
    // Add a nametag above the player
    createNameTag(playerInfo.name, otherPlayerMesh);
    
    // Add the player to the scene and to our otherPlayers object
    scene.add(otherPlayerMesh);
    otherPlayers[playerInfo.id] = otherPlayerMesh;
    
    console.log(`Added other player: ${playerInfo.name} (${playerInfo.team})`);
}

// Function to remove player from scene
function removePlayer(playerId) {
    if (otherPlayers[playerId]) {
        scene.remove(otherPlayers[playerId]);
        delete otherPlayers[playerId];
    }
}

// Create a projectile object
function createProjectile(projectileInfo) {
    // Create a sphere for the projectile
    const geometry = new THREE.SphereGeometry(0.2, 8, 8);
    const material = new THREE.MeshStandardMaterial({
        color: projectileInfo.color || 0xffffff,
        emissive: projectileInfo.color || 0xffffff,
        emissiveIntensity: 0.5
    });
    const sphere = new THREE.Mesh(geometry, material);
    
    // Set position
    sphere.position.set(
        projectileInfo.position.x,
        projectileInfo.position.y,
        projectileInfo.position.z
    );
    
    // Add to scene
    scene.add(sphere);
    
    // Store projectile with velocity
    projectiles[projectileInfo.id] = {
        mesh: sphere,
        velocity: projectileInfo.velocity,
        createdAt: Date.now()
    };
    
    // Add a light to the projectile to make it glow
    const light = new THREE.PointLight(projectileInfo.color || 0xffffff, 1, 2);
    sphere.add(light);
}

// Function to remove a projectile
function removeProjectile(id) {
    if (projectiles[id] && projectiles[id].mesh) {
        scene.remove(projectiles[id].mesh);
        delete projectiles[id];
    }
}

// Socket.IO event handlers
socket.on('connect', function() {
    console.log('Connected to server with id:', socket.id);
});

// Handle join confirmation from server
socket.on('joinConfirmed', function(data) {
    console.log('[SERVER] Join confirmed with ID:', data.id);
    console.log('[SERVER] Server knows our position:', 
        `x=${data.position.x.toFixed(2)}, ` +
        `y=${data.position.y.toFixed(2)}, ` +
        `z=${data.position.z.toFixed(2)}`
    );
    
    // If we're in a significantly different position than the server thinks,
    // immediately send an update to correct it
    if (playerMesh) {
        const distanceFromServerPosition = Math.sqrt(
            Math.pow(camera.position.x - data.position.x, 2) +
            Math.pow(camera.position.y - data.position.y, 2) +
            Math.pow(camera.position.z - data.position.z, 2)
        );
        
        if (distanceFromServerPosition > 0.5) {
            console.log(`[SYNC] Position mismatch with server (${distanceFromServerPosition.toFixed(2)} units), sending correction`);
            sendPositionUpdate(true, true);
        }
    }
});

socket.on('currentPlayers', function(players) {
    console.log('Received current players:', players);
    
    // Add all existing players except ourselves
    Object.keys(players).forEach(function(id) {
        if (id !== socket.id) {
            console.log(`Adding player ${id} at position:`,
                `x=${players[id].position.x.toFixed(2)}, ` +
                `y=${players[id].position.y.toFixed(2)}, ` +
                `z=${players[id].position.z.toFixed(2)}`
            );
            addOtherPlayer(players[id]);
        }
    });
});

// Start game function
function startGame() {
    console.log("startGame function called");
    
    // Get references to form elements
    const startScreen = document.getElementById('startScreen');
    const playerNameInput = document.getElementById('playerName');
    
    // Save player data
    playerData.name = playerNameInput.value.trim();
    
    // Validate inputs
    if (!playerData.name) {
        console.error("Missing player name!");
        alert("Please enter your name before starting");
        return;
    }
    
    if (!playerData.team) {
        console.error("Missing team selection!");
        alert("Please select a team before starting");
        return;
    }
    
    // Reset sync variables
    syncAttempts = 0;
    syncSuccess = false;
    initialSyncComplete = false;
    
    // Hide start screen
    if (startScreen) {
        startScreen.style.display = 'none';
        console.log("Start screen hidden");
    } else {
        console.error("Start screen element not found!");
    }
    
    // Show loading screen
    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
        console.log("Loading screen displayed");
    }
    
    // Create player marker
    createPlayerMarker();
    
    // Load the map
    loadMap();
    
    // Show instructions after hiding the start screen
    instructions.style.display = 'block';
    
    // Set initial position (this will be sent to server when joining)
    camera.position.set(0, 1.6, 0); // Reset to spawn point
    
    // Check orientation if on mobile and prepare touch controls
    if (isTouchDevice) {
        // Check orientation
        checkOrientation();
        
        // Make sure touch controls exist and are ready to be displayed
        const touchControls = document.getElementById('touchControls');
        if (!touchControls) {
            // If controls don't exist yet, create them
            createTouchControls();
            console.log("Touch controls created for game start");
        }
    }
    
    // Join the game via Socket.IO - include the initial position
    socket.emit('joinGame', {
        name: playerData.name,
        team: playerData.team,
        position: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z
        },
        rotation: {
            x: camera.rotation.x,
            y: camera.rotation.y,
            z: camera.rotation.z
        },
        isMobile: isTouchDevice
    });
    
    console.log('Game started with player:', playerData, 'isMobile:', isTouchDevice);
    
    // Setup a sequence of forced position updates to ensure initial sync
    const syncSchedule = [500, 1000, 2000, 3000, 5000]; // Send updates at these intervals (ms)
    
    syncSchedule.forEach(delay => {
        setTimeout(() => {
            if (controls.isLocked && playerMesh) {
                sendPositionUpdate(true, true); // Force sync with log
                console.log(`[SYNC] Sent scheduled position update after ${delay}ms`);
            }
        }, delay);
    });
}