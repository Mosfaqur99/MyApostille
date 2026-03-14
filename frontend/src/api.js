import axios from 'axios';

// ⚠️ FIXED: Removed trailing space that was causing 404 errors
const API_URL = 'https://bangladesh-apostille-api.onrender.com'; // No space at end!

console.log('Using API URL:', API_URL);

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['x-auth-token'] = token;
    }
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    console.log('Request to:', config.baseURL + config.url);
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const API_BASE_URL = API_URL; // Cleaner export
export default api;