// frontend/src/pages/VerificationPage.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { toast } from 'react-toastify';

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

  const getViewablePdfUrl = (url: string) => {
    if (!url) return '';
    if (url.includes('cloudinary.com')) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}fl_inline=true`;
    }
    return url;
  };

  // Helper to get correct signature image URL
  const getSignatureImageUrl = (signatureImage: string) => {
    if (!signatureImage) return '';
    // If it's already a full URL, use it
    if (signatureImage.startsWith('http')) return signatureImage;
    // If it starts with /, use as is
    if (signatureImage.startsWith('/')) return signatureImage;
    // Otherwise, prepend the assets path (singular 'signature' as per your folder structure)
    return `/assets/signature/documents/${signatureImage}`;
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
      
      const response = await api.get(`/files/verify/${certificateNumber}`, {
        signal: abortController.current.signal
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
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
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
            <button 
              onClick={() => {
                fetchedCerts.current.delete(certificateNumber || '');
                fetchData();
              }} 
              className="mt-4 px-6 py-3 bg-green-600 text-white rounded-lg font-bold"
            >
              আবার চেষ্টা করুন
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const hasCertificate = !!verificationData.certificatePath;
  const hasDocuments = Array.isArray(verificationData.documents) && verificationData.documents.length > 0;
  const viewableCertificateUrl = getViewablePdfUrl(verificationData.certificatePath);

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          
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
              <div className="bg-gray-50 px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-bold text-gray-800">ই-আপোস্টিল সার্টিফিকেট</h2>
              </div>
              <div className="p-6">
                <div className="w-full border-2 border-gray-200 rounded-xl overflow-hidden bg-white shadow-inner">
                  <object
                    data={viewableCertificateUrl}
                    type="application/pdf"
                    className="w-full h-[60vh] md:h-[75vh]"
                  >
                    <div className="p-8 text-center text-gray-500">
                      <p className="mb-4 text-lg">PDF ভিউয়ার লোড করা যাচ্ছে না</p>
                      <p className="text-sm mb-4">ব্রাউজার সাপোর্টের সমস্যা হতে পারে</p>
                      <a 
                        href={verificationData.certificatePath} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        <span>নতুন ট্যাবে খুলুন</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </object>
                </div>
                
                <button 
                  onClick={handleDownloadCertificate} 
                  className="w-full mt-6 bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  📥 সার্টিফিকেট ডাউনলোড করুন
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

                  {/* Signature Blocks - ALL signers appear below each document */}
                  {doc.signers && doc.signers.length > 0 && (
                    <div className="px-6 py-6 bg-white border-t border-gray-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {doc.signers.map((signer, signerIndex) => (
                          <div key={signerIndex} className="flex flex-col items-start space-y-1 p-4 bg-gray-50 rounded-lg border border-gray-200">
                            {/* Attested Text */}
                            <div className="text-purple-800 font-serif italic text-base font-semibold">
                              Attested
                            </div>
                            
                            {/* Date */}
                            <div className="text-gray-600 text-xs mb-1">
                              {formatDate(signer.signatureDate)}
                            </div>
                            
                            {/* Signature Image */}
                            {signer.signature_image && (
                              <div className="my-1">
                                <img 
                                  src={getSignatureImageUrl(signer.signature_image)}
                                  alt={`${signer.name} signature`}
                                  className="h-12 w-auto object-contain"
                                  onError={(e) => {
                                    console.error('Signature image failed to load:', signer.signature_image);
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              </div>
                            )}
                            
                            {/* Signer Name - Bold */}
                            <div className="font-bold text-gray-900 text-sm">
                              {signer.name}
                            </div>
                            
                            {/* Designation */}
                            {signer.designation && (
                              <div className="text-gray-700 text-xs">
                                {signer.designation}
                              </div>
                            )}
                            
                            {/* Organization */}
                            {signer.organization && (
                              <div className="text-gray-500 text-xs">
                                {signer.organization}
                              </div>
                            )}
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