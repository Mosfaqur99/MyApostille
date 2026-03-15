// frontend/src/pages/VerificationPage.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { toast } from 'react-toastify';

const VerificationPage = () => {
  const { certificateNumber } = useParams();
  const navigate = useNavigate();

  const [verificationData, setVerificationData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"certificate" | "documents">("certificate");
  
  const hasFetched = useRef(false);

  // Helper to make PDF viewable in browser
  const getViewablePdfUrl = (url: string) => {
    if (!url) return '';
    // Force inline viewing for Cloudinary PDFs
    if (url.includes('cloudinary.com')) {
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}fl_inline=true`;
    }
    return url;
  };

  const fetchData = useCallback(async () => {
    if (hasFetched.current) {
      console.log('[VerificationPage] Skipping duplicate fetch');
      return;
    }
    
    if (!certificateNumber) {
      setError("সার্টিফিকেট নম্বর পাওয়া যায়নি");
      setLoading(false);
      return;
    }

    hasFetched.current = true;
    
    try {
      setLoading(true);
      setError(null);
      
      console.log('[VerificationPage] Fetching certificate:', certificateNumber);
      const response = await api.get(`/files/verify/${certificateNumber}`);
      
      console.log('[VerificationPage] Data received:', response.data);
      
      if (!response.data || !response.data.certificatePath) {
        throw new Error("Invalid data received from server");
      }

      setVerificationData(response.data);
    } catch (err: any) {
      console.error("Verification failed", err);
      setError(err.response?.data?.message || err.message || "সার্টিফিকেট পাওয়া যায়নি");
      hasFetched.current = false;
    } finally {
      setLoading(false);
    }
  }, [certificateNumber]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDownloadCertificate = () => {
    if (!verificationData?.certificatePath) {
      toast.error('সার্টিফিকেট লিংক পাওয়া যায়নি');
      return;
    }
    window.open(verificationData.certificatePath, '_blank');
    toast.success('সার্টিফিকেট ডাউনলোড শুরু হয়েছে!');
  };

  // LOADING STATE
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

  // ERROR STATE
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
              onClick={() => navigate("/")} 
              className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition-colors"
            >
              হোম পেজে ফিরে যান
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // NO DATA STATE
  if (!verificationData) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        <Header />
        <main className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-xl shadow-lg text-center">
            <p className="text-gray-600">কোনো তথ্য পাওয়া যায়নি</p>
            <button 
              onClick={() => {
                hasFetched.current = false;
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

  // SUCCESS - MAIN CONTENT
  const hasCertificate = !!verificationData.certificatePath;
  const hasDocuments = Array.isArray(verificationData.reuploadedFiles) && verificationData.reuploadedFiles.length > 0;
  
  // Transform URL for viewing
  const viewableCertificateUrl = getViewablePdfUrl(verificationData.certificatePath);

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          
          {/* Header Card */}
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 border border-green-100">
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
                <p className="text-xs text-gray-500 uppercase font-bold">যাচাইয়ের তারিখ</p>
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

          {/* Tabs */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-6">
            <div className="flex bg-gray-50 p-2">
              <button
                onClick={() => setActiveTab("certificate")}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                  activeTab === "certificate" 
                    ? "bg-white shadow-md text-green-700 ring-2 ring-green-100" 
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                📜 সার্টিফিকেট
              </button>
              <button
                onClick={() => setActiveTab("documents")}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all ${
                  activeTab === "documents" 
                    ? "bg-white shadow-md text-blue-700 ring-2 ring-blue-100" 
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                📂 মূল নথি ({verificationData.reuploadedFiles?.length || 0})
              </button>
            </div>

            <div className="p-4 md:p-6">
              {activeTab === "certificate" ? (
                <div className="space-y-6">
                  {hasCertificate ? (
                    <>
                      {/* Certificate Viewer - Using object tag with transformed URL */}
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
                      
                      {/* Download Button */}
                      <button 
                        onClick={handleDownloadCertificate} 
                        className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 transition-all duration-300 shadow-lg hover:shadow-xl flex items-center justify-center gap-3"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        📥 সার্টিফিকেট ডাউনলোড করুন
                      </button>
                    </>
                  ) : (
                    <div className="py-20 text-center text-red-500 bg-red-50 rounded-xl">
                      <p className="text-xl font-bold">❌ সার্টিফিকেট পাওয়া যায়নি</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {hasDocuments ? (
                    verificationData.reuploadedFiles.map((url: string, i: number) => (
                      <div key={i} className="border-2 border-gray-200 rounded-xl overflow-hidden">
                        <div className="bg-gray-100 px-4 py-3 border-b-2 border-gray-200 flex justify-between items-center">
                          <span className="font-bold text-gray-700">নথি {i + 1}</span>
                          <a 
                            href={url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline font-medium"
                          >
                            নতুন ট্যাবে খুলুন ↗
                          </a>
                        </div>
                        <div className="p-4 bg-gray-50">
                          {url.toLowerCase().endsWith('.pdf') ? (
                            <iframe
                              src={`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`}
                              className="w-full h-[500px] border-none"
                              title={`Document ${i + 1}`}
                            />
                          ) : (
                            <img
                              src={url}
                              alt={`Document ${i + 1}`}
                              className="max-w-full h-auto mx-auto rounded-lg shadow-md"
                              onError={(e) => {
                                console.error('Image failed to load:', url);
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center text-gray-500 bg-gray-50 rounded-xl">
                      <div className="text-6xl mb-4">📭</div>
                      <p className="text-xl">কোনো মূল নথি পাওয়া যায়নি</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Back Button */}
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