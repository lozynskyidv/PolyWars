// Configuration for the game
const CONFIG = {
  // Connect to the appropriate backend based on the current domain
  SERVER_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? `http://${window.location.hostname}:3001` 
    : 'https://polywars-6d2a9df068d1.herokuapp.com'  // Use Heroku for all non-local environments
}; 

// Log the configuration
console.log("Game config:", CONFIG); 