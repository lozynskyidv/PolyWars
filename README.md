# PolyWars

A web-based 3D multiplayer FPS game built with Three.js and Node.js.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to `http://localhost:3001`

## Features

- 3D scene with basic lighting
- Mobile-friendly responsive design
- Prepared for multiplayer functionality

## Development

The project uses:
- Three.js for 3D rendering
- Express.js for the server
- Node.js for the backend
- Socket.IO for real-time communication

## Deployment

### Heroku (Backend)

1. Create a Heroku account and install the Heroku CLI
2. Login to Heroku CLI:
```bash
heroku login
```

3. Create a new Heroku app:
```bash
heroku create your-app-name
```

4. Deploy to Heroku:
```bash
git push heroku main
```

5. Make note of your Heroku app URL (e.g., https://your-app-name.herokuapp.com)

### Netlify (Frontend)

1. Create a Netlify account
2. Update the `SERVER_URL` in `public/js/config.js` with your Heroku app URL
3. Deploy to Netlify using one of these methods:

   **Option 1: Netlify CLI**
   ```bash
   # Install Netlify CLI
   npm install netlify-cli -g
   
   # Login to Netlify
   netlify login
   
   # Deploy
   netlify deploy --prod
   ```

   **Option 2: Netlify Dashboard**
   - Go to [Netlify](https://app.netlify.com/)
   - Drag and drop your 'public' folder to the deployment area
   - Or connect your GitHub repository and configure build settings

4. After deployment, your game will be available at the Netlify URL

### Important Configuration Notes

- Make sure to update `public/js/config.js` with the correct Heroku app URL before deploying to Netlify
- The Procfile for Heroku is already configured to start the server correctly
- The netlify.toml file configures your single-page application routing

## License

MIT 