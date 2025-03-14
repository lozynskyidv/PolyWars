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
        size: 100
    });
    
    rightJoystick = nipplejs.create({
        zone: document.getElementById('rightJoystick'),
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: 'white',
        size: 100
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
        if (forward < -0.5) moveForward = true;
        if (forward > 0.5) moveBackward = true;
        if (right < -0.5) moveLeft = true;
        if (right > 0.5) moveRight = true;
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
    };
    document.head.appendChild(nippleScript);
    
    // Add orientation change listener
    window.addEventListener('resize', checkOrientation);
}

// Event listeners for pointer lock
instructions.addEventListener('click', function () {
    controls.lock();
});

// Add touchstart event listener for iOS devices
instructions.addEventListener('touchstart', function (e) {
    e.preventDefault();
    controls.lock();
});

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
        direction.normalize(); // Normalize for consistent movement speed
        
        // Apply movement to velocity
        if (moveForward || moveBackward) velocity.z -= direction.z * speed;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed;
        
        // Apply velocity to controls (camera)
        controls.moveRight(-velocity.x);
        controls.moveForward(-velocity.z);
        
        // Dampen velocity for smooth stops
        velocity.x *= 0.9;
        velocity.z *= 0.9;
        
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