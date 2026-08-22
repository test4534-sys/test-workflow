// src/lib/api.ts
import axios from 'axios'

// Simple configuration that works for both local and network access
const getApiBaseUrl = () => {
  const hostname = window.location.hostname;

  // If accessing from localhost, use localhost:2435
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:2435';
  }

  // If accessing from another machine, use the server's IP with port 2435
  return `http://${hostname}:2435`;
};

const API_BASE_URL = getApiBaseUrl();

console.log('Connecting to backend at:', API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 5000, // Reduced timeout for faster responses
});

// Add authentication token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  // Add cache busting to GET requests
  if (config.method === 'get') {
    config.params = {
      ...config.params,
      _t: Date.now()
    }
  }
  return config
});

// Handle connection errors with better error messages
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - redirect to login
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
      error.userMessage = 'Session expired. Please login again.'
    } else if (error.code === 'ECONNREFUSED' || error.message?.includes('Network Error')) {
      console.error('Backend connection failed. Make sure the server is running on port 8000');
      error.userMessage = 'Cannot connect to the backend server. Please ensure the server is running.';
    } else if (error.response?.status === 500) {
      console.error('Server error:', error.response.data);
      error.userMessage = 'Server error occurred. Please try again later.';
    } else if (error.response?.status === 404) {
      console.error('Endpoint not found:', error.config?.url);
      error.userMessage = 'Requested resource not found.';
    }
    return Promise.reject(error);
  }
);

export { api };