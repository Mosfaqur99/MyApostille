import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import loginlogo from '../assets/loginlogo.png'

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid email or password');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <div className="text-center mb-6">
          <img 
            src={loginlogo} 
            alt="Government Logo" 
            className="mx-auto h-16"
          />
          <h1 className="text-2xl font-bold text-green-800 mt-4">ব্যবহারকারী লগইন</h1>
        </div>
        
        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded-md mb-4">
            {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
              আপনার ইমেইল লিখুন
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
          </div>
          
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
              আপনার পাসওয়ার্ড লিখুন
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              required
            />
          </div>
          
          <button
            type="submit"
            className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            লগইন
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <p className="text-gray-600">
            নতুন আকাউন্ট নেই?{' '}
            <a href="/register" className="text-green-600 hover:underline">নতুন আবেদন</a>
          </p>
          <p className="text-gray-600 mt-2">
            <a href="#" className="text-green-600 hover:underline">পাসওয়ার্ড ভুলে গেছেন?</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;