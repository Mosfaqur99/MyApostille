// frontend/src/pages/VerificationPage.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios"; // Remove this if you have a custom api instance
import Header from "../components/Header";
import Footer from "../components/Footer";
import { toast } from 'react-toastify';

// Use your existing api instance OR create one with correct base URL
const API_URL = process.env.REACT_APP_API_URL || 'https://bangladesh-apostille-api.onrender.com/api';

// If you have an api.js file, import it instead:
// import api from '../api';

interface SignerData {
  id?: number;
  name: string;
  designation: string;
  organization: string;
  signature_image: string;
  signatureDate: string;
}

interface DocumentData {
  url: string;
  originalName: string;
  fileType?: string;
  signers: SignerData[];
}

interface VerificationData {
  certificateNumber: string;
  certificatePath: string;
  documents: DocumentData[];
  userName: string;
  userEmail: string;
  verifiedByName: string;
  verifiedAt: string;
  authorityName: string;
}

const VerificationPage = () => {
  const { certificateNumber } = useParams();
  const navigate = useNavigate();

  const [verificationData, setVerificationData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const fetchedCerts = useRef<Set<string>>(new Set());
  const abortController = useRef<AbortController | null>(null);

  // Helper to get signature image URL
  const getSignatureImageUrl = (signatureImage: string) => {
  if (!signatureImage) return '';
  if (signatureImage.startsWith('http')) return signatureImage;
  if (signatureImage.startsWith('/')) return signatureImage;
  // Use API URL instead of frontend path
  return `${API_URL}/signatures/${signatureImage}`; // ✅ Backend API path
};

  // Helper to get attested image URL
  const getAttestedImageUrl = () => {
  return `${API_URL}/signatures/attested_text.png`;
};
  const fetchData = useCallback(async () => {
    if (!certificateNumber) {
      setError("সার্টিফিকেট নম্বর পাওয়া যায়নি");
      setLoading(false);
      return;
    }

    if (fetchedCerts.current.has(certificateNumber)) {
      return;
    }

    fetchedCerts.current.add(certificateNumber);
    
    if (abortController.current) {
      abortController.current.abort();
    }
    abortController.current = new AbortController();
    
    try {
      setLoading(true);
      setError(null);
      
      // FIXED: Use the correct API URL with full base URL
      const response = await axios.get(`${API_URL}/files/verify/${certificateNumber}`, {
        signal: abortController.current.signal,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.data || !response.data.certificatePath) {
        throw new Error("Invalid data received from server");
      }

      setVerificationData(response.data);
    } catch (err: any) {
      if (err.name === 'AbortError' || err.code === 'ERR_CANCELED') {
        return;
      }
      
      console.error("Verification failed", err);
      setError(err.response?.data?.message || err.message || "সার্টিফিকেট পাওয়া যায়নি");
      fetchedCerts.current.delete(certificateNumber);
    } finally {
      setLoading(false);
    }
  }, [certificateNumber]);

  useEffect(() => {
    fetchData();
    return () => {
      if (abortController.current) {
        abortController.current.abort();
      }
    };
  }, [fetchData]);

  useEffect(() => {
    fetchedCerts.current.clear();
  }, [certificateNumber]);

  const handleDownloadCertificate = () => {
    if (!verificationData?.certificatePath) {
      toast.error('সার্টিফিকেট লিংক পাওয়া যায়নি');
      return;
    }
    window.open(verificationData.certificatePath, '_blank');
    toast.success('সার্টিফিকেট ডাউনলোড শুরু হয়েছে!');
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('default', { month: 'short' });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        <Header />
        <main className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin h-16 w-16 border-4 border-green-600 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-4 text-gray-600 font-medium text-lg">লোড হচ্ছে...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        <Header />
        <main className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold mb-2 text-gray-800">যাচাই ব্যর্থ</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button 
              onClick={() => {
                fetchedCerts.current.delete(certificateNumber || '');
                fetchData();
              }} 
              className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition-colors"
            >
              আবার চেষ্টা করুন
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!verificationData) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        <Header />
        <main className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-xl shadow-lg text-center">
            <p className="text-gray-600">কোনো তথ্য পাওয়া যায়নি</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const hasCertificate = !!verificationData.certificatePath;
  const hasDocuments = Array.isArray(verificationData.documents) && verificationData.documents.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="max-w-5xl mx-auto space-y-8">
          
          {/* Header Card */}
          <div className="bg-white rounded-2xl shadow-sm p-6 border border-green-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
              <div>
                <h1 className="text-2xl font-black text-green-800 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  e-APOSTILLE যাচাইকৃত
                </h1>
                <p className="text-gray-500 font-mono mt-2 text-lg">নম্বর: {certificateNumber}</p>
              </div>
              <div className="mt-4 md:mt-0 text-left md:text-right bg-green-50 px-4 py-2 rounded-lg">
                <p className="text-xs text-gray-500 uppercase font-bold">যাচাইয়ের তারিখ</p>
                <p className="font-bold text-green-800">
                  {verificationData.verifiedAt 
                    ? new Date(verificationData.verifiedAt).toLocaleDateString('bn-BD') 
                    : 'N/A'}
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-gray-100">
               <div className="bg-gray-50 p-3 rounded-lg">
                 <p className="text-xs text-gray-500 uppercase font-bold">আবেদনকারী</p>
                 <p className="font-medium text-gray-800 text-lg">{verificationData.userName || 'N/A'}</p>
               </div>
               <div className="bg-gray-50 p-3 rounded-lg">
                 <p className="text-xs text-gray-500 uppercase font-bold">যাচাইকারী কর্তৃপক্ষ</p>
                 <p className="font-medium text-gray-800 text-lg">Ministry of Foreign Affairs</p>
                 <p className="text-sm text-blue-600">{verificationData.authorityName || 'N/A'}</p>
               </div>
            </div>
          </div>

          {/* E-Apostille Certificate Section */}
          {hasCertificate && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-200">
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-800">ই-আপোস্টিল সার্টিফিকেট</h2>
                <span className="text-sm text-gray-500">প্রিভিউ</span>
              </div>
              <div className="p-6">
                <div className="w-full border-2 border-gray-200 rounded-xl overflow-hidden bg-white shadow-inner">
                  <embed
  src={verificationData.certificatePath}
  type="application/pdf"
  className="w-full h-[600px]"
/>
                </div>
                
                <button 
                  onClick={handleDownloadCertificate} 
                  className="w-full mt-6 bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  📥 সার্টিফিকেট ডাউনলোড করুন (PDF)
                </button>
              </div>
            </div>
          )}

          {/* Attested Documents Section */}
          {hasDocuments && (
            <div className="space-y-8">
              <div className="border-b-2 border-green-600 pb-2">
                <h2 className="text-xl font-bold text-gray-800">স্বাক্ষরিত মূল নথিসমূহ</h2>
                <p className="text-sm text-gray-600 mt-1">নিচের নথিগুলি আপোস্টিল করা হয়েছে</p>
              </div>

              {verificationData.documents.map((doc, docIndex) => (
                <div key={docIndex} className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-200">
                  {/* Document Image */}
                  <div className="p-4 bg-gray-50">
                    <div className="bg-white rounded-lg overflow-hidden shadow-inner">
                      {doc.url?.toLowerCase().endsWith('.pdf') ? (
                        <iframe
                          src={`https://docs.google.com/viewer?url=${encodeURIComponent(doc.url)}&embedded=true`}
                          className="w-full h-[600px] border-none"
                          title={`Document ${docIndex + 1}`}
                        />
                      ) : (
                        <img
                          src={doc.url}
                          alt={`Document ${docIndex + 1}`}
                          className="w-full h-auto object-contain"
                          onError={(e) => {
                            console.error('Image failed to load:', doc.url);
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                  </div>

                  {/* Signature Blocks - Centered Layout */}
                  {/* Signature Blocks - Responsive Grid */}
{doc.signers && doc.signers.length > 0 && (
  <div className="px-6 py-10 bg-white border-t border-gray-200">
    {/* Grid: 1 col on mobile, 2 cols on tablet/PC with a gap */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-12 gap-x-8 justify-items-center">
      {doc.signers.map((signer, signerIndex) => (
        <div 
          key={signerIndex} 
          className="flex flex-col items-center text-center w-full max-w-[320px]"
        >
          {/* 1. "Attested" Image */}
          <div className="mb-2">
            <img 
              src={getAttestedImageUrl()}
              alt="Attested"
              className="h-10 w-auto object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                if (target.parentElement) {
                  target.parentElement.innerHTML = '<span style="color: #4c1d95; font-family: serif; font-size: 1.5rem; font-style: italic; font-weight: 700;">Attested</span>';
                }
              }}
            />
          </div>
          
          {/* 2. Signature Image */}
          <div className="h-16 flex items-center justify-center mb-2">
            {signer.signature_image ? (
              <img 
                src={getSignatureImageUrl(signer.signature_image)}
                alt={`${signer.name} signature`}
                className="max-h-16 w-auto object-contain mix-blend-multiply"
              />
            ) : (
              <div className="h-16" /> // Spacer if no signature
            )}
          </div>
          
          {/* 3. Date - Matches your image purple */}
          <div className="text-[#4c1d95] text-lg font-semibold mb-1">
            {formatDate(signer.signatureDate)}
          </div>
          
          {/* 4. Name - Bold Purple */}
          <div className="font-bold text-[#4c1d95] text-xl leading-tight mb-1">
            {signer.name}
          </div>
          
          {/* 5. Designation & Org */}
          <div className="text-[#4c1d95] text-lg leading-snug">
            <p>{signer.designation}</p>
            <p>{signer.organization}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
                </div>
              ))}
            </div>
          )}

          {!hasDocuments && (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-500 border border-gray-200">
              <div className="text-6xl mb-4">📭</div>
              <p className="text-xl">কোনো মূল নথি পাওয়া যায়নি</p>
            </div>
          )}

          <button 
            onClick={() => navigate(-1)} 
            className="w-full bg-white border-2 border-green-600 text-green-700 py-3.5 rounded-xl font-bold text-lg hover:bg-green-50 transition-all duration-300 shadow-md hover:shadow-lg flex items-center justify-center gap-3 group"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-5 w-5 group-hover:-translate-x-1 transition-transform" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>ফিরে যান</span>
          </button>

        </div>
      </main>
      <Footer />
    </div>
  );
};

export default VerificationPage;