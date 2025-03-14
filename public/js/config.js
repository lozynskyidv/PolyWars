// Configuration for the game
const CONFIG = {
  // In production, this will connect to your Heroku backend
  // In development, it will connect to localhost
  SERVER_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? `http://${window.location.hostname}:3001` 
    : 'https://your-heroku-app-name.herokuapp.com'
}; 