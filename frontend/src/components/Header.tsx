// frontend/src/components/Header.tsx
import React, { useEffect } from 'react';
import govLogo from '../assets/gov.jpg';
import { gsap } from 'gsap';

const Header: React.FC = () => {
  useEffect(() => {
    // Add GSAP animation for logo
    gsap.fromTo('.gov-logo', 
      { opacity: 0, scale: 0.8 },
      { opacity: 1, scale: 1, duration: 0.5, ease: 'power2.out' }
    );
  }, []);

  return (
    <header className="bg-white border-b border-gray-200 py-4">
      <div className="container mx-auto px-4">
        <div className="flex justify-center items-center">
          <div className="text-center">
            <img 
              src={govLogo} 
              alt="Government Logo" 
              className="h-16 mx-auto gov-logo" // Larger logo
            />
            <p className="text-lg font-bold text-green-800 mt-2">
              গণপ্রজাতন্ত্রী বাংলাদেশ সরকার
            </p>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;