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

// Detect Android specifically
const isAndroid = /Android/.test(navigator.userAgent);

// Detect Samsung browser and devices specifically
const isSamsungBrowser = /SamsungBrowser/.test(navigator.userAgent);
// Also detect Samsung devices that might not use Samsung browser
const isSamsungDevice = /Samsung/i.test(navigator.userAgent) || 
                        /SM-[A-Z0-9]+/i.test(navigator.userAgent) ||
                        /SAMSUNG/i.test(navigator.userAgent);

// Log device information for debugging
console.log("Device detection:", {
    isTouchDevice,
    isIOS,
    isAndroid,
    isSamsungBrowser,
    isSamsungDevice,
    userAgent: navigator.userAgent
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
// Make controls accessible globally for Samsung fixes
window.gameControls = controls;

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
    leftJoystick.on('move', (evt, data) => {
        // Get the raw joystick position (data.vector has x and y normalized between -1 and 1)
        const xInput = data.vector.x;
        const yInput = data.vector.y;
        
        // Log raw joystick values and force for debugging
        console.log(`[Left Joystick] Raw x: ${xInput.toFixed(2)}, y: ${yInput.toFixed(2)}, force: ${data.force.toFixed(2)}, direction: ${data.direction?.angle || 'none'}`);
        
        // Clear all movement flags first
        moveForward = false;
        moveBackward = false;
        moveLeft = false;
        moveRight = false;
        
        // Use a lower threshold for better response (0.1 instead of 0.2)
        // Map joystick values to movement directions with correct orientation
        if (yInput < -0.1) moveForward = true;   // Up on joystick = forward
        if (yInput > 0.1) moveBackward = true;   // Down on joystick = backward
        if (xInput < -0.1) moveLeft = true;      // Left on joystick = left
        if (xInput > 0.1) moveRight = true;      // Right on joystick = right
        
        // Log movement flags so we can see which directions are active
        console.log(`[Movement Flags] forward: ${moveForward}, backward: ${moveBackward}, left: ${moveLeft}, right: ${moveRight}`);
        
        // On iOS, ensure movement flags trigger immediate camera position updates
        if (isIOS) {
            // Apply movement immediately for iOS - this helps with responsiveness
            // Calculate movement direction based on the flags we just set
            direction.z = Number(moveForward) - Number(moveBackward);
            direction.x = Number(moveRight) - Number(moveLeft);
            
            if (direction.z !== 0 || direction.x !== 0) {
                direction.normalize();
                
                // Get the camera's forward and right vectors
                const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
                const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
                
                // Scale vectors by input
                forward.multiplyScalar(direction.z);
                right.multiplyScalar(direction.x);
                
                // Combine movement vectors
                const moveVector = new THREE.Vector3();
                moveVector.addVectors(forward, right);
                
                if (moveVector.length() > 0) {
                    moveVector.normalize();
                    
                    // Apply stronger movement for iOS devices
                    const iosSpeedMultiplier = 2.5;
                    moveVector.multiplyScalar(speed * iosSpeedMultiplier);
                    
                    // Force camera position update
                    camera.position.add(moveVector);
                }
            }
        }
    });
    
    // Ensure we reset movement when joystick is released
    leftJoystick.on('end', () => {
        console.log('[Left Joystick] Released - stopping movement');
        moveForward = false;
        moveBackward = false;
        moveLeft = false;
        moveRight = false;
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
        // Negative yInput looks up, positive looks down
        const newRotationX = camera.rotation.x - yInput * rotationSpeed;
        
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
                                
                                // Clamp values to -1 to 1 range
                                x = Math.max(-1, Math.min(1, x));
                                y = Math.max(-1, Math.min(1, y));
                                
                                console.log(`[iOS direct touch] x: ${x.toFixed(2)}, y: ${y.toFixed(2)}`);
                                
                                // Set movement flags directly
                                moveForward = y < -0.1;
                                moveBackward = y > 0.1;
                                moveLeft = x < -0.1;
                                moveRight = x > 0.1;
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
        // Add special handling for Android devices
        else if (isAndroid) {
            console.log("Adding Android-specific touch handlers");
            
            // For Samsung devices, ensure touch events are correctly propagated
            const joystickElements = [
                document.getElementById('leftJoystick'),
                document.getElementById('rightJoystick'),
                document.getElementById('shootButton')
            ];
            
            joystickElements.forEach(element => {
                if (element) {
                    // Make elements more visible and larger touch targets
                    element.style.border = '2px solid rgba(255, 255, 255, 0.8)';
                    element.style.borderRadius = '50%';
                    element.style.backgroundColor = 'rgba(50, 50, 50, 0.3)';
                    
                    // For Samsung devices, use non-passive handlers
                    ['touchstart', 'touchmove', 'touchend'].forEach(eventType => {
                        element.addEventListener(eventType, function(e) {
                            console.log(`Android touch ${eventType} on ${element.id}`);
                            e.preventDefault();
                        }, { passive: false });
                    });
                    
                    // Special handling for left joystick on Android to ensure movement works
                    if (element.id === 'leftJoystick') {
                        element.style.width = '150px';  // Make left joystick bigger
                        element.style.height = '150px';
                        
                        // Add a specialized touch handler to ensure movement on Android
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
                                
                                // Clamp values to -1 to 1 range
                                x = Math.max(-1, Math.min(1, x));
                                y = Math.max(-1, Math.min(1, y));
                                
                                console.log(`[Android direct touch] x: ${x.toFixed(2)}, y: ${y.toFixed(2)}`);
                                
                                // Set movement flags directly
                                moveForward = y < -0.1;
                                moveBackward = y > 0.1;
                                moveLeft = x < -0.1;
                                moveRight = x > 0.1;
                            }
                        }, { passive: false });
                    }
                }
            });
            
            // Add a dedicated touch handler for the instructions element
            document.addEventListener('touchstart', function(e) {
                console.log("Android document touchstart");
                
                // If instructions are visible, try to start the game
                if (instructions.style.display !== 'none' && !controls.isLocked) {
                    console.log("Android: instructions visible, attempting to start game");
                    controls.lock();
                }
            });
            
            // Samsung-specific fixes
            if (isSamsungBrowser) {
                console.log("Samsung browser detected, applying Samsung-specific fixes");
                
                // Make instructions element super responsive on Samsung devices
                instructions.style.position = 'absolute';
                instructions.style.zIndex = '9999'; // Ensure it's above everything
                
                // Add explicit tap handler with multiple approaches for Samsung
                instructions.addEventListener('touchstart', function(e) {
                    console.log("Samsung touchstart on instructions");
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Use timeout to allow the touch to complete
                    setTimeout(() => {
                        controls.lock();
                        
                        // If that didn't work, try a click event
                        setTimeout(() => {
                            const clickEvent = new MouseEvent('click', {
                                view: window,
                                bubbles: true,
                                cancelable: true
                            });
                            instructions.dispatchEvent(clickEvent);
                            
                            // Last resort - direct DOM interaction
                            setTimeout(() => {
                                instructions.style.display = 'none';
                                if (document.getElementById('touchControls')) {
                                    document.getElementById('touchControls').style.display = 'block';
                                }
                                // Directly trigger the lock event
                                controls.dispatchEvent({ type: 'lock' });
                            }, 50);
                        }, 50);
                    }, 20);
                }, { passive: false });
                
                // Add a document-level tap handler specifically for Samsung
                document.addEventListener('touchstart', function(e) {
                    console.log("Samsung document touchstart");
                    
                    if (instructions.style.display !== 'none' && !controls.isLocked && startScreen.style.display === 'none') {
                        console.log("Samsung: Attempting to start game from document touchstart");
                        e.preventDefault();
                        
                        // Hide instructions
                        instructions.style.display = 'none';
                        
                        // Try to lock controls
                        controls.lock();
                        
                        // If controls lock fails, show touch controls directly
                        setTimeout(() => {
                            if (!controls.isLocked && document.getElementById('touchControls')) {
                                document.getElementById('touchControls').style.display = 'block';
                                controls.dispatchEvent({ type: 'lock' });
                            }
                        }, 100);
                    }
                }, { passive: false });
            }
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
    console.log('Touchstart event fired on device: iOS=' + isIOS + ', Android=' + isAndroid);
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
    } else if (isAndroid) {
        console.log('Android device detected, using specific handling');
        // Use a short delay for Android devices
        setTimeout(() => {
            controls.lock();
            
            // Fallback with click simulation for Samsung devices
            setTimeout(() => {
                console.log('Android fallback: simulating click event');
                const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });
                instructions.dispatchEvent(clickEvent);
            }, 100);
        }, 50);
    } else {
        controls.lock();
    }
});

// Older iOS devices and some Android devices work better with touchend
instructions.addEventListener('touchend', function (e) {
    console.log('Touchend event fired');
    if (isIOS) {
        e.preventDefault();
        console.log('iOS touchend handler triggered');
        setTimeout(() => {
            controls.lock();
        }, 10);
    } else if (isAndroid) {
        e.preventDefault();
        console.log('Android touchend handler triggered');
        controls.lock();
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

// Add special handling for Samsung devices
if (isSamsungBrowser || isSamsungDevice) {
    // Create fullscreen overlay for Samsung devices
    const samsungTapOverlay = document.createElement('div');
    samsungTapOverlay.id = 'samsungTapOverlay';
    samsungTapOverlay.style.position = 'absolute';
    samsungTapOverlay.style.top = '0';
    samsungTapOverlay.style.left = '0';
    samsungTapOverlay.style.width = '100%';
    samsungTapOverlay.style.height = '100%';
    samsungTapOverlay.style.zIndex = '3000';
    samsungTapOverlay.style.display = 'none';
    samsungTapOverlay.style.background = 'transparent';
    document.body.appendChild(samsungTapOverlay);
    
    // Add instructions text
    const samsungTapText = document.createElement('div');
    samsungTapText.style.position = 'absolute';
    samsungTapText.style.top = '50%';
    samsungTapText.style.left = '50%';
    samsungTapText.style.transform = 'translate(-50%, -50%)';
    samsungTapText.style.color = 'white';
    samsungTapText.style.fontSize = '26px';
    samsungTapText.style.textAlign = 'center';
    samsungTapText.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    samsungTapText.style.padding = '30px';
    samsungTapText.style.borderRadius = '15px';
    samsungTapText.style.width = '80%';
    samsungTapText.style.maxWidth = '400px';
    samsungTapText.innerHTML = 'Tap anywhere<br>to start';
    samsungTapOverlay.appendChild(samsungTapText);
    
    // Multiple touch event listeners for Samsung
    ['touchstart', 'touchend', 'click'].forEach(eventType => {
        samsungTapOverlay.addEventListener(eventType, function(e) {
            console.log(`Samsung overlay ${eventType} fired`);
            e.preventDefault();
            e.stopPropagation();
            
            // Hide the overlay
            samsungTapOverlay.style.display = 'none';
            
            // Try multiple methods to start the game
            controls.lock();
            
            // Timeout approach as fallback
            setTimeout(() => {
                // Direct DOM manipulation if needed
                instructions.style.display = 'none';
                if (document.getElementById('touchControls')) {
                    document.getElementById('touchControls').style.display = 'block';
                }
                // Manually dispatch the lock event
                controls.dispatchEvent({ type: 'lock' });
            }, 50);
        }, { passive: false });
    });
    
    // Show the Samsung overlay when needed
    controls.addEventListener('unlock', function() {
        if (startScreen.style.display === 'none') {
            instructions.style.display = 'none';
            samsungTapOverlay.style.display = 'block';
        }
    });
    
    // Also update the main instructions handling for Samsung devices
    instructions.addEventListener('touchstart', function(e) {
        if (isSamsungBrowser || isSamsungDevice) {
            console.log("Samsung device touchstart on instructions");
            e.preventDefault();
            e.stopPropagation();
            
            // Hide instructions and show Samsung overlay
            instructions.style.display = 'none';
            samsungTapOverlay.style.display = 'block';
        }
    }, { passive: false });
}

controls.addEventListener('lock', function () {
    instructions.style.display = 'none';
    // Hide any Samsung overlay that might be visible
    if (document.getElementById('samsungTapOverlay')) {
        document.getElementById('samsungTapOverlay').style.display = 'none';
    }
    // Show touch controls when game starts if on a touch device
    if (isTouchDevice && document.getElementById('touchControls')) {
        document.getElementById('touchControls').style.display = 'block';
    }
});

controls.addEventListener('unlock', function () {
    // For Samsung devices, show the dedicated overlay instead of regular instructions
    if ((isSamsungBrowser || isSamsungDevice) && 
        startScreen.style.display === 'none' && 
        document.getElementById('samsungTapOverlay')) {
        instructions.style.display = 'none';
        document.getElementById('samsungTapOverlay').style.display = 'block';
    } else {
        instructions.style.display = 'block';
    }
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
}

// Name input validation
playerNameInput.addEventListener('input', () => {
    console.log("Name input changed: " + playerNameInput.value);
    validateForm();
});

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

// Start game when form is submitted
startButton.addEventListener('click', startGame);

// Add touchstart handler for the start button on mobile
if (isTouchDevice) {
    startButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        console.log("Start button touchstart");
        if (!startButton.disabled) {
            startGame();
        }
    });
}

function startGame() {
    console.log("startGame function called");
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
        // Calculate movement direction based on keyboard or joystick input
        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        
        // Debug movement direction vector
        if (direction.z !== 0 || direction.x !== 0) {
            // Normalize only if there's actual movement
            direction.normalize();
            console.log(`[Direction Vector] x: ${direction.x.toFixed(2)}, z: ${direction.z.toFixed(2)}`);
            
            // Get the camera's forward and right vectors
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
            const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
            
            // Scale vectors by input
            forward.multiplyScalar(direction.z);
            right.multiplyScalar(direction.x);
            
            // Combine movement vectors
            const moveVector = new THREE.Vector3();
            moveVector.addVectors(forward, right);
            
            // Only normalize if there's movement
            if (moveVector.length() > 0) {
                moveVector.normalize();
                
                // Apply different movement speed multipliers based on device type
                let deviceSpeedMultiplier = 1.0;
                if (isTouchDevice) {
                    deviceSpeedMultiplier = 2.0;
                    // Extra boost for iOS devices
                    if (isIOS) {
                        deviceSpeedMultiplier = 2.5;
                    }
                    // Extra boost for Android devices
                    else if (isAndroid) {
                        deviceSpeedMultiplier = 2.5;
                    }
                }
                
                moveVector.multiplyScalar(speed * deviceSpeedMultiplier);
                
                // Apply movement directly to camera position
                camera.position.add(moveVector);
                
                console.log(`[Position] x: ${camera.position.x.toFixed(2)}, y: ${camera.position.y.toFixed(2)}, z: ${camera.position.z.toFixed(2)}`);
            }
        }
        
        // Update player mesh position to match camera
        if (playerMesh) {
            playerMesh.position.copy(camera.position);
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

// Ensure login form is properly initialized
window.addEventListener('load', function() {
    console.log("Window loaded - initializing login form");
    
    // Make sure player data is reset
    playerData = {
        name: '',
        team: '',
        color: null
    };
    
    // Reset team selection
    teamDemocrat.classList.remove('selected');
    teamRepublican.classList.remove('selected');
    
    // Clear name input and focus it
    if (playerNameInput) {
        playerNameInput.value = '';
        
        // Only try to focus on desktop - can cause issues on mobile
        if (!isTouchDevice) {
            setTimeout(() => {
                playerNameInput.focus();
            }, 500);
        }
    }
    
    // Force validation to update button state
    validateForm();
    
    // Add special handling for iOS devices
    if (isIOS) {
        console.log("Adding iOS-specific form handlers");
        
        // Add touchstart handler for start button to make it more responsive
        if (startButton) {
            startButton.style.webkitTapHighlightColor = 'rgba(0,0,0,0)';
            startButton.addEventListener('touchstart', function(e) {
                if (!startButton.disabled) {
                    e.preventDefault();
                    // Visual feedback
                    this.style.backgroundColor = '#45a049';
                    setTimeout(() => {
                        startGame();
                    }, 50);
                }
            }, false);
        }
        
        // Add touchstart handlers for team options with visual feedback
        [teamDemocrat, teamRepublican].forEach(elem => {
            if (elem) {
                elem.style.webkitTapHighlightColor = 'rgba(0,0,0,0)';
            }
        });
    }
    
    console.log("Login form initialized");
});

// Start the animation
animate();

// Add a custom event listener for Samsung devices
document.addEventListener('startGame', function() {
    console.log('Custom startGame event received');
    
    // Try to lock controls
    if (!controls.isLocked) {
        controls.lock();
        
        // Fallback direct manipulation if needed
        setTimeout(() => {
            if (!controls.isLocked) {
                console.log('Fallback method for Samsung devices');
                instructions.style.display = 'none';
                if (document.getElementById('touchControls')) {
                    document.getElementById('touchControls').style.display = 'block';
                }
                // Manually dispatch the lock event
                controls.dispatchEvent({ type: 'lock' });
            }
        }, 100);
    }
});

// Add a listener for the gameStarted event for Samsung devices
document.addEventListener('gameStarted', function(e) {
    console.log('gameStarted event received with data:', e.detail);
    
    // Update player data with event details
    if (e.detail) {
        playerData.name = e.detail.name || 'Player';
        playerData.team = e.detail.team || 'republicans';
    }
    
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
    
    console.log('Game started from gameStarted event with player:', playerData);
}); 