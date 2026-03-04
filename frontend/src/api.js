import axios from 'axios';

// Hardcode for testing - replace with your actual Render URL
const API_URL = 'https://bangladesh-apostille-api.onrender.com';

console.log('Using API URL:', API_URL); // Debug

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
    console.log('Request to:', config.baseURL + config.url); // Debug
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

export const API_BASE_URL = (api.defaults.baseURL || '').replace('/api', '');
export default api;