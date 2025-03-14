const { Server } = require('socket.io');
const { createServer } = require('http');

// This is a simplified version of the server for Netlify Functions
// Note: Netlify Functions don't fully support WebSockets in the same way as a dedicated server
// This is a basic implementation to demonstrate functionality

exports.handler = async (event, context) => {
  // Log request for debugging
  console.log("Received request:", {
    path: event.path,
    httpMethod: event.httpMethod,
    headers: event.headers
  });

  // Handle CORS preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: 'CORS preflight handled' })
    };
  }

  // Handle WebSocket upgrade requests
  if (event.headers['upgrade'] === 'websocket') {
    return {
      statusCode: 101,
      headers: {
        'Upgrade': 'websocket',
        'Connection': 'Upgrade'
      }
    };
  }

  // For regular HTTP requests, return a message
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      message: "Socket.IO server endpoint is running on Netlify. Note that full WebSocket functionality is limited on Netlify Functions.",
      timestamp: new Date().toISOString()
    })
  };
}; 