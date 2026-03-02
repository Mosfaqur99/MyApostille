// frontend/src/components/ActionBar.tsx
import React, { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { toast } from 'react-toastify';

const ActionBar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const barRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    // Initialize GSAP animations
    gsap.fromTo(barRef.current,
      { opacity: 0, y: -20 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
    );
    
    // Animate buttons with stagger
    gsap.fromTo(buttonsRef.current,
      { opacity: 0, y: 20 },
      { 
        opacity: 1, 
        y: 0, 
        duration: 0.5,
        stagger: 0.1,
        ease: 'power2.out'
      }
    );
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleContact = () => {
    gsap.to(buttonsRef.current[1], {
      scale: 1.05,
      duration: 0.2,
      onComplete: () => {
        gsap.to(buttonsRef.current[1], { scale: 1 });
      }
    });
    toast.info('যোগাযোগ বিভাগ: ফোন: ১৬১২২, ইমেইল: support@gov.bd', {
      autoClose: 5000
    });
  };

  const handleChangePassword = () => {
    gsap.to(buttonsRef.current[2], {
      scale: 1.05,
      duration: 0.2,
      onComplete: () => {
        gsap.to(buttonsRef.current[2], { scale: 1 });
      }
    });
    toast.warning('পাসওয়ার্ড পরিবর্তন পৃষ্ঠা শীঘ্রই যোগ করা হবে', {
      autoClose: 3000
    });
  };

  return (
    <div 
      ref={barRef}
      className="bg-white rounded-lg shadow-md p-6 mb-6 border border-gray-200 overflow-hidden"
    >
      <div className="flex flex-wrap justify-between items-center gap-4">
        {/* Dashboard Title Section */}
        <div className="flex-1 min-w-[250px]">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-green-600 text-white p-3 rounded-lg shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-800">ড্যাশবোর্ড</h1>
          </div>
          <p className="text-gray-600 text-sm">আপনার সকল আবেদন এখানে পরিচালনা করুন</p>
        </div>
        
        {/* Action Buttons Section */}
        <div className="flex flex-wrap gap-3">
          {/* New Application Button - NOW NAVIGATES TO UPLOAD PAGE */}
          <button 
            ref={el => buttonsRef.current[0] = el}
            onClick={() => {
              // Visual feedback animation
              gsap.to(buttonsRef.current[0], {
                scale: 1.05,
                duration: 0.15,
                onComplete: () => {
                  gsap.to(buttonsRef.current[0], { 
                    scale: 1,
                    duration: 0.15,
                    onComplete: () => {
                      // Navigate after animation completes
                      navigate('/upload');
                    }
                  });
                }
              });
            }}
            className="bg-green-600 text-white px-6 py-3 rounded-lg font-medium text-lg hover:bg-green-700 transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-1 relative overflow-hidden flex items-center gap-2 group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span className="relative z-10">নতুন আবেদন</span>
            <span className="absolute inset-0 bg-green-700 opacity-0 group-hover:opacity-20 transition-opacity"></span>
          </button>
          
          {/* Contact Button - Shows contact info */}
          <button 
            ref={el => buttonsRef.current[1] = el}
            onClick={handleContact}
            className="border border-green-600 text-green-600 px-6 py-3 rounded-lg font-medium text-lg hover:bg-green-50 transition-all duration-300 flex items-center gap-2 group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <span className="relative z-10">যোগাযোগ</span>
            <span className="absolute inset-0 bg-green-100 opacity-0 group-hover:opacity-50 transition-opacity"></span>
          </button>
          
          {/* Password Change Button - Placeholder */}
          <button 
            ref={el => buttonsRef.current[2] = el}
            onClick={handleChangePassword}
            className="border border-green-600 text-green-600 px-6 py-3 rounded-lg font-medium text-lg hover:bg-green-50 transition-all duration-300 flex items-center gap-2 group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="relative z-10">পাসওয়ার্ড পরিবর্তন</span>
            <span className="absolute inset-0 bg-green-100 opacity-0 group-hover:opacity-50 transition-opacity"></span>
          </button>
          
          {/* Logout Button */}
          <button 
            ref={el => buttonsRef.current[3] = el}
            onClick={handleLogout}
            className="bg-red-100 text-red-600 px-6 py-3 rounded-lg font-medium text-lg hover:bg-red-200 transition-all duration-300 flex items-center gap-2 group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="relative z-10">লগআউট</span>
            <span className="absolute inset-0 bg-red-200 opacity-0 group-hover:opacity-50 transition-opacity"></span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionBar;