import React from 'react';
import foorterlogo from '../assets/footerlogo.png';

const Footer = () => {
  return (
    <footer className="bg-white border-t border-gray-200 mt-12">
      <div className="container mx-auto px-4 py-6 flex justify-between items-center">
        <div>
          <p className="text-gray-600 text-sm">কপিরাইট © ২০২৬ সর্বস্ব সংরক্ষিত</p>
          <p className="text-gray-600 text-sm">গণপ্রজাতন্ত্রী বাংলাদেশ সরকার</p>
        </div>
        <div className="flex items-center space-x-4">
          <p className="text-gray-600 text-sm">পরিকল্পনা ও বাস্তবায়নে</p>
          <div className="flex space-x-6">
            <img 
              src={foorterlogo}
              alt="Logo" 
              className="h-12"
            />
           
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;