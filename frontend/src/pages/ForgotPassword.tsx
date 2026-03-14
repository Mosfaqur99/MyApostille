import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api'; // Your centralized API
import { toast } from 'react-toastify';
import loginlogo from '../assets/loginlogo.png';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error('ইমেইল ঠিকানা দিন');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      toast.error('সঠিক ইমেইল ঠিকানা দিন');
      return;
    }

    setLoading(true);

    try {
      // Uses your centralized api - automatically goes to https://bangladesh-apostille-api.onrender.com/api/auth/forgot-password
      const response = await api.post('/auth/forgot-password', {
        email: email.trim().toLowerCase()
      });

      setSubmitted(true);
      toast.success(response.data.message);

    } catch (err: any) {
      console.error('Forgot password error:', err);
      toast.error(err.response?.data?.message || 'সার্ভার ত্রুটি। পরে আবার চেষ্টা করুন।');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          
          <h2 className="text-2xl font-bold text-green-800 mb-2">ইমেইল পাঠানো হয়েছে</h2>
          <p className="text-gray-600 mb-2">
            <strong>{email}</strong> ঠিকানায় পাসওয়ার্ড রিসেট নির্দেশনা পাঠানো হয়েছে।
          </p>
          <p className="text-sm text-gray-500 mb-6">
            ইমেইল না পেলে স্প্যাম ফোল্ডার চেক করুন।
          </p>
          
          <div className="space-y-3">
            <button
              onClick={() => navigate('/login')}
              className="w-full bg-green-600 text-white py-2.5 rounded-md hover:bg-green-700 transition-colors font-medium"
            >
              লগইন পেজে ফিরে যান
            </button>
            <button
              onClick={() => { setSubmitted(false); setEmail(''); }}
              className="w-full border border-gray-300 text-gray-600 py-2.5 rounded-md hover:bg-gray-50 transition-colors text-sm"
            >
              অন্য ইমেইল ব্যবহার করুন
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <div className="text-center mb-6">
          <img src={loginlogo} alt="Government Logo" className="mx-auto h-16" />
          <h1 className="text-2xl font-bold text-green-800 mt-4">পাসওয়ার্ড ভুলে গেছেন?</h1>
          <p className="text-gray-600 text-sm mt-1">আপনার ইমেইল ঠিকানা দিন। রিসেট লিংক পাঠানো হবে।</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-gray-700 text-sm font-bold mb-2">ইমেইল ঠিকানা</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="your@email.com"
              required
              disabled={loading}
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-2.5 px-4 rounded-md font-medium transition-all ${
              loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 text-white shadow-md'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                পাঠানো হচ্ছে...
              </span>
            ) : 'রিসেট লিংক পাঠান'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-600 text-sm">
            পাসওয়ার্ড মনে আছে?{' '}
            <Link to="/login" className="text-green-600 hover:underline font-medium">লগইন করুন</Link>
          </p>
        </div>

        <div className="mt-6 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-800 flex items-start gap-2">
            <svg className="h-4 w-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>রিসেট লিংক ১ ঘন্টার জন্য বৈধ থাকবে। একবার ব্যবহার করলে আর কাজ করবে না।</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;