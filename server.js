const express = require('express');
const path = require('path');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const port = process.env.PORT || 3001;

// Store connected players (up to 16)
const players = {};
let playerCount = 0;
const MAX_PLAYERS = 16;

// Store active projectiles
const projectiles = {};
let projectileId = 0;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve Three.js from node_modules
app.use('/three.min.js', express.static(path.join(__dirname, 'node_modules/three/build/three.min.js')));

// Serve Socket.IO client
app.use('/socket.io', express.static(path.join(__dirname, 'node_modules/socket.io/client-dist')));

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Log all requests to help with debugging
app.use((req, res, next) => {
    console.log(`Request: ${req.method} ${req.url}`);
    next();
});

// Socket.IO connection handler
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
    
    // Handle player joining
    socket.on('joinGame', (playerData) => {
        // Check if we already have max players
        if (playerCount >= MAX_PLAYERS) {
            socket.emit('serverFull');
            return;
        }
        
        // Create new player
        players[socket.id] = {
            id: socket.id,
            name: playerData.name,
            team: playerData.team,
            position: { x: 0, y: 1.6, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            color: playerData.team === 'democrats' ? 0x3b5998 : 0xdb2828
        };
        playerCount++;
        
        // Send the new player all existing players
        socket.emit('currentPlayers', players);
        
        // Send the new player all active projectiles
        socket.emit('currentProjectiles', projectiles);
        
        // Notify all other players of the new player
        socket.broadcast.emit('newPlayer', players[socket.id]);
        
        console.log(`Player joined: ${playerData.name} (${playerData.team}), Total: ${playerCount}`);
    });
    
    // Handle player position and rotation updates
    socket.on('updatePlayer', (data) => {
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            players[socket.id].rotation = data.rotation;
            
            // Broadcast the updated position to all other players
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                position: data.position,
                rotation: data.rotation
            });
        }
    });
    
    // Handle shooting projectiles
    socket.on('shootProjectile', (projectileData) => {
        if (players[socket.id]) {
            // Create a unique ID for this projectile
            const id = socket.id + '-' + projectileId++;
            
            // Store projectile data
            projectiles[id] = {
                id: id,
                playerId: socket.id,
                position: projectileData.position,
                velocity: projectileData.velocity,
                color: players[socket.id].color,
                createdAt: Date.now()
            };
            
            // Broadcast new projectile to all players including the shooter
            io.emit('newProjectile', projectiles[id]);
            
            // Set timeout to remove projectile after 3 seconds
            setTimeout(() => {
                if (projectiles[id]) {
                    delete projectiles[id];
                    io.emit('removeProjectile', id);
                }
            }, 3000);
        }
    });
    
    // Handle player disconnection
    socket.on('disconnect', () => {
        if (players[socket.id]) {
            console.log(`Player disconnected: ${players[socket.id].name}, ID: ${socket.id}`);
            
            // Remove the player from the players object
            delete players[socket.id];
            playerCount--;
            
            // Remove all projectiles from this player
            Object.keys(projectiles).forEach(id => {
                if (projectiles[id].playerId === socket.id) {
                    delete projectiles[id];
                    io.emit('removeProjectile', id);
                }
            });
            
            // Notify all other players of the disconnection
            io.emit('playerDisconnected', socket.id);
        } else {
            console.log('Unknown user disconnected:', socket.id);
        }
    });
});

// Function to find available port
const findAvailablePort = (startPort) => {
    return new Promise((resolve) => {
        const testServer = require('http').createServer();
        testServer.listen(startPort, () => {
            const port = testServer.address().port;
            testServer.close(() => resolve(port));
        });
        
        testServer.on('error', () => {
            // Port is in use, try the next one
            resolve(findAvailablePort(startPort + 1));
        });
    });
};

// Start server with available port
findAvailablePort(port)
    .then(availablePort => {
        server.listen(availablePort, () => {
            console.log(`PolyWars server running at http://localhost:${availablePort}`);
        });
    })
    .catch(err => {
        console.error('Could not start server:', err);
    }); 