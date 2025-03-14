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
    // Create container for joysticks
    const touchControls = document.createElement('div');
    touchControls.style.position = 'absolute';
    touchControls.style.top = '0';
    touchControls.style.left = '0';
    touchControls.style.width = '100%';
    touchControls.style.height = '100%';
    touchControls.style.pointerEvents = 'none';
    touchControls.style.zIndex = '1000';
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
    leftJoystick = nipplejs.create({
        zone: document.getElementById('leftJoystick'),
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'white',
        size: 100,
        threshold: 0.1,        // Lower threshold to detect movement
        fadeTime: 100,         // Faster fade time for better responsiveness
        multitouch: true,      // Allow multiple touches
        maxNumberOfNipples: 2, // Allow both joysticks to work simultaneously
        dataOnly: false        // We need the UI elements
    });
    
    rightJoystick = nipplejs.create({
        zone: document.getElementById('rightJoystick'),
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'white',
        size: 100,
        threshold: 0.1,        // Lower threshold to detect movement
        fadeTime: 100,         // Faster fade time for better responsiveness
        multitouch: true,      // Allow multiple touches
        maxNumberOfNipples: 2, // Allow both joysticks to work simultaneously
        dataOnly: false        // We need the UI elements
    });
    
    // Setup left joystick for movement
    leftJoystick.on('move', (evt, data) => {
        const forward = data.vector.y;
        const right = data.vector.x;
        
        // Reset movement flags
        moveForward = false;
        moveBackward = false;
        moveLeft = false;
        moveRight = false;
        
        // Set movement based on joystick position
        // Fix the inverted coordinates for iOS/mobile
        if (forward < -0.2) moveBackward = true; // Changed: < -0.2 triggers backward
        if (forward > 0.2) moveForward = true;   // Changed: > 0.2 triggers forward
        if (right < -0.2) moveLeft = true;       // Left is unchanged
        if (right > 0.2) moveRight = true;       // Right is unchanged
        
        // More detailed logging for debugging
        console.log(`[Joystick] Raw values - Y: ${forward.toFixed(2)}, X: ${right.toFixed(2)}`);
        console.log(`[Movement] forward: ${moveForward}, backward: ${moveBackward}, left: ${moveLeft}, right: ${moveRight}`);
    });
    
    leftJoystick.on('end', () => {
        moveForward = false;
        moveBackward = false;
        moveLeft = false;
        moveRight = false;
    });
    
    // Setup right joystick for camera rotation
    rightJoystick.on('move', (evt, data) => {
        // Rotate camera based on joystick position
        // Higher multiplier means faster rotation
        const rotationSpeed = 0.05;
        camera.rotation.y -= data.vector.x * rotationSpeed;
        
        // Limit vertical rotation to avoid flipping
        const newRotationX = camera.rotation.x - data.vector.y * rotationSpeed;
        camera.rotation.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, newRotationX));
    });
    
    // Setup shoot button
    shootButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        shootProjectile();
    });
    
    // Initially hide touch controls until player spawns
    touchControls.style.display = 'none';
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
    // Load nippleJS script
    const nippleScript = document.createElement('script');
    nippleScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/nipplejs/0.10.1/nipplejs.min.js';
    nippleScript.onload = () => {
        console.log('nippleJS loaded');
        // Create touch controls once nippleJS is loaded
        createTouchControls();
        // Check initial orientation
        checkOrientation();
        
        // Special handling for iOS
        if (isIOS) {
            console.log("Adding iOS-specific touch handlers");
            
            // Add preventable touch handler to ensure joysticks work on iOS
            document.addEventListener('touchstart', function(e) {
                if (controls.isLocked) {
                    // Only prevent default on game elements, not UI elements
                    if (!e.target.closest('#startScreen') && !e.target.closest('#instructionScreen')) {
                        e.preventDefault();
                    }
                }
            }, { passive: false });
            
            // Ensure joystick containers have iOS-friendly touch handling
            const joystickElements = [
                document.getElementById('leftJoystick'),
                document.getElementById('rightJoystick'),
                document.getElementById('shootButton')
            ];
            
            joystickElements.forEach(element => {
                if (element) {
                    element.addEventListener('touchstart', function(e) {
                        console.log("Touch start on joystick element");
                        e.preventDefault();
                    }, { passive: false });
                }
            });
        }
    };
    document.head.appendChild(nippleScript);
    
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
    if (isTouchDevice && document.getElementById('touchControls')) {
        document.getElementById('touchControls').style.display = 'block';
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

socket.on('currentPlayers', function(players) {
    console.log('Received current players:', players);
    
    // Add all existing players except ourselves
    Object.keys(players).forEach(function(id) {
        if (id !== socket.id) {
            addOtherPlayer(players[id]);
        }
    });
});

socket.on('newPlayer', function(playerInfo) {
    console.log('New player joined:', playerInfo);
    addOtherPlayer(playerInfo);
});

socket.on('playerMoved', function(moveData) {
    if (otherPlayers[moveData.id]) {
        otherPlayers[moveData.id].position.set(
            moveData.position.x,
            moveData.position.y,
            moveData.position.z
        );
        otherPlayers[moveData.id].rotation.set(
            moveData.rotation.x,
            moveData.rotation.y,
            moveData.rotation.z
        );
    }
});

socket.on('playerDisconnected', function(playerId) {
    console.log('Player disconnected:', playerId);
    removePlayer(playerId);
});

socket.on('serverFull', function() {
    alert('Server is full (maximum 16 players). Please try again later.');
});

// Handle projectile events
socket.on('newProjectile', function(projectileInfo) {
    createProjectile(projectileInfo);
});

socket.on('removeProjectile', function(projectileId) {
    removeProjectile(projectileId);
});

socket.on('currentProjectiles', function(currentProjectiles) {
    // Add all existing projectiles
    Object.keys(currentProjectiles).forEach(function(id) {
        createProjectile(currentProjectiles[id]);
    });
});

// Start screen functionality
const startScreen = document.getElementById('startScreen');
const playerNameInput = document.getElementById('playerName');
const teamDemocrat = document.getElementById('teamDemocrat');
const teamRepublican = document.getElementById('teamRepublican');
const startButton = document.getElementById('startButton');

// Team selection
teamDemocrat.addEventListener('click', () => {
    teamDemocrat.classList.add('selected');
    teamRepublican.classList.remove('selected');
    playerData.team = 'democrats';
    validateForm();
});

teamRepublican.addEventListener('click', () => {
    teamRepublican.classList.add('selected');
    teamDemocrat.classList.remove('selected');
    playerData.team = 'republicans';
    validateForm();
});

// Name input validation
playerNameInput.addEventListener('input', validateForm);

function validateForm() {
    const name = playerNameInput.value.trim();
    const team = playerData.team;
    
    // Enable button if both name and team are selected
    if (name.length >= 2 && team) {
        startButton.disabled = false;
    } else {
        startButton.disabled = true;
    }
}

// Start game when form is submitted
startButton.addEventListener('click', startGame);

function startGame() {
    // Save player data
    playerData.name = playerNameInput.value.trim();
    
    // Hide start screen
    startScreen.style.display = 'none';
    
    // Show loading screen
    loadingScreen.style.display = 'flex';
    
    // Create player marker
    createPlayerMarker();
    
    // Load the map
    loadMap();
    
    // Show instructions after hiding the start screen
    instructions.style.display = 'block';
    
    // Join the game via Socket.IO
    socket.emit('joinGame', playerData);
    
    // Check orientation if on mobile
    if (isTouchDevice) {
        checkOrientation();
    }
    
    console.log('Game started with player:', playerData);
}

// Load the map
const loader = new GLTFLoader();
let map;

function loadMap() {
    loader.load(
        // Resource URL
        '/assets/map.glb',
        // Called when resource is loaded
        function (gltf) {
            map = gltf.scene;
            scene.add(map);
            
            // Optionally adjust map position
            map.position.set(0, 0, 0);
            
            // Make the map cast and receive shadows
            map.traverse((node) => {
                if (node.isMesh) {
                    node.castShadow = true;
                    node.receiveShadow = true;
                }
            });
            
            console.log('Map loaded successfully');
            
            // Hide loading screen
            loadingScreen.style.display = 'none';
        },
        // Called when loading is in progress
        function (xhr) {
            const percent = Math.round((xhr.loaded / xhr.total) * 100);
            loadingText.textContent = `Loading map: ${percent}%`;
            progressBar.style.width = `${percent}%`;
            console.log(`${percent}% loaded`);
        },
        // Called when loading has errors
        function (error) {
            console.error('An error happened while loading the map:', error);
            loadingText.textContent = 'Error loading map. Please refresh to try again.';
            loadingText.style.color = 'red';
        }
    );
}

// Animation loop
function animate() {
    requestAnimationFrame(animate);
    
    // Only update controls if locked (user is playing)
    if (controls.isLocked) {
        // Time delta for smooth movement
        const delta = 1 / 60;
        
        // Calculate movement direction
        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        
        // Make sure we have a valid direction vector
        if (direction.z !== 0 || direction.x !== 0) {
            direction.normalize(); // Normalize for consistent movement speed
            
            // Add debug logging for movement direction
            console.log(`[Direction] x: ${direction.x.toFixed(2)}, z: ${direction.z.toFixed(2)}`);
        }
        
        // Apply movement to velocity with more direct control
        // Multiply by higher value for more responsive mobile controls
        const mobileSpeedMultiplier = isTouchDevice ? 1.5 : 1.0; // Higher speed for mobile
        
        velocity.z = direction.z * speed * mobileSpeedMultiplier;
        velocity.x = direction.x * speed * mobileSpeedMultiplier;
        
        // Log velocity values for debugging
        if (moveForward || moveBackward || moveLeft || moveRight) {
            console.log(`[Velocity] x: ${velocity.x.toFixed(2)}, z: ${velocity.z.toFixed(2)}`);
        }
        
        // Apply velocity to controls (camera)
        controls.moveRight(-velocity.x);
        controls.moveForward(-velocity.z);
        
        // Dampen velocity for smooth stops (slightly stronger dampening)
        velocity.x *= 0.85;
        velocity.z *= 0.85;
        
        // Update player mesh position to match camera
        if (playerMesh) {
            playerMesh.position.copy(camera.position);
            // Offset slightly down to align with camera
            playerMesh.position.y = camera.position.y;
            // Rotate to match camera direction
            playerMesh.rotation.y = camera.rotation.y;
            
            // Hide the player's own model from themselves in first person view
            if (playerModel) {
                playerModel.visible = false;
            }
            
            // Send position update to server
            socket.emit('updatePlayer', {
                position: {
                    x: camera.position.x,
                    y: camera.position.y,
                    z: camera.position.z
                },
                rotation: {
                    x: camera.rotation.x,
                    y: camera.rotation.y,
                    z: camera.rotation.z
                }
            });
        }
    }
    
    // Update projectile positions
    Object.keys(projectiles).forEach(id => {
        const projectile = projectiles[id];
        if (projectile && projectile.mesh) {
            // Move projectile according to its velocity
            projectile.mesh.position.x += projectile.velocity.x;
            projectile.mesh.position.y += projectile.velocity.y;
            projectile.mesh.position.z += projectile.velocity.z;
        }
    });
    
    renderer.render(scene, camera);
}

// Handle window resize
window.addEventListener('resize', onWindowResize, false);

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // Check orientation on resize if on mobile
    if (isTouchDevice) {
        checkOrientation();
    }
}

// Start the animation
animate(); 