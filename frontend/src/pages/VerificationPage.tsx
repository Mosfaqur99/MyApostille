// frontend/src/pages/VerificationPage.tsx
import React, { useState, useEffect } from "react";
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

  useEffect(() => {
    let isMounted = true;
    
    const verifyCertificate = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/files/verify/${certificateNumber}`);
        
        if (!isMounted) return;
        
        console.log('[VerificationPage] Data received:', response.data);
        setVerificationData(response.data);
        setLoading(false);
      } catch (err: any) {
        console.error("Verification failed", err);
        setError(err.response?.data?.message || "সার্টিফিকেট পাওয়া যায়নি");
        setLoading(false);
      }
    };

    verifyCertificate();
    return () => { isMounted = false; };
  }, [certificateNumber]);

  const handleDownloadCertificate = async () => {
    if (!verificationData?.certificatePath) {
      toast.error('সার্টিফিকেট লিংক পাওয়া যায়নি');
      return;
    }
    
    try {
      // Open Cloudinary URL directly in new tab for download
      window.open(verificationData.certificatePath, '_blank');
    } catch {
      toast.error("ডাউনলোড ব্যর্থ হয়েছে।");
    }
  };

  /**
   * PDF Viewer component for the main Certificate tab
   */
  const PDFViewer = ({ url }: { url: string }) => {
    // Google's PDF viewer proxy for Cloudinary URLs
    const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;

    return (
      <div className="w-full border rounded-lg overflow-hidden bg-white shadow-inner">
        <iframe
          src={googleViewerUrl}
          title="Certificate Viewer"
          className="w-full h-[60vh] md:h-[75vh] border-none"
          style={{ width: '100%' }}
        />
      </div>
    );
  };

  /**
   * DOCUMENT VIEWER for reuploaded files
   */
  const DocumentViewer = ({ url }: { url: string }) => {
    const isPdf = url.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      const googleViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
      
      return (
        <div className="w-full bg-gray-100 rounded-lg overflow-hidden border mb-4">
          <div className="relative w-full h-[500px] md:h-[70vh]">
            <iframe
              src={googleViewerUrl}
              className="absolute top-0 left-0 w-full h-full"
              title="PDF Document"
            />
          </div>
        </div>
      );
    }

    return (
      <div className="flex justify-center bg-gray-200 rounded-lg overflow-hidden mb-4">
        <img
          src={url}
          alt="Verified Document"
          className="max-w-full h-auto object-contain shadow-md"
        />
      </div>
    );
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="animate-spin h-12 w-12 border-4 border-green-600 border-t-transparent rounded-full"></div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-sm">
        <div className="text-red-500 text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold mb-2">যাচাই ব্যর্থ</h2>
        <p className="text-gray-600 mb-6">{error}</p>
        <button onClick={() => navigate("/")} className="w-full bg-green-600 text-white py-2 rounded-lg">
          হোম পেজে ফিরে যান
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          
          {/* Top Header Card */}
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-6 border border-green-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
              <div>
                <h1 className="text-2xl font-black text-green-800">e-APOSTILLE যাচাইকৃত</h1>
                <p className="text-gray-500 font-mono mt-1">নম্বর: {certificateNumber}</p>
              </div>
              <div className="mt-4 md:mt-0 text-left md:text-right">
                <p className="text-xs text-gray-400 uppercase">যাচাইয়ের তারিখ</p>
                <p className="font-bold">
                  {verificationData?.verifiedAt 
                    ? new Date(verificationData.verifiedAt).toLocaleDateString('bn-BD') 
                    : 'N/A'}
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 mt-6 pt-6 border-t border-gray-100">
               <div>
                 <p className="text-xs text-gray-400">আবেদনকারী</p>
                 <p className="font-medium text-gray-800">{verificationData?.userName || 'N/A'}</p>
               </div>
               <div>
                 <p className="text-xs text-gray-400">যাচাইকারী কর্তৃপক্ষ</p>
                 <p className="font-medium text-gray-800">Ministry of Foreign Affairs</p>
               </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="flex bg-gray-50 p-1">
              <button
                onClick={() => setActiveTab("certificate")}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all ${activeTab === "certificate" ? "bg-white shadow-sm text-green-700" : "text-gray-500"}`}
              >
                📜 সার্টিফিকেট
              </button>
              <button
                onClick={() => setActiveTab("documents")}
                className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold transition-all ${activeTab === "documents" ? "bg-white shadow-sm text-blue-700" : "text-gray-500"}`}
              >
                📂 মূল নথি ({verificationData?.reuploadedFiles?.length || 0})
              </button>
            </div>

            <div className="p-4 md:p-6">
              {activeTab === "certificate" ? (
                <div className="space-y-6">
                  {verificationData?.certificatePath ? (
                    <>
                      <PDFViewer url={verificationData.certificatePath} />
                      <button 
                        onClick={handleDownloadCertificate} 
                        className="w-full bg-green-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-green-700 transition-colors shadow-lg shadow-green-100"
                      >
                        📥 সার্টিফিকেট ডাউনলোড করুন
                      </button>
                    </>
                  ) : (
                    <div className="py-20 text-center text-gray-400">সার্টিফিকেট লোড করা সম্ভব হচ্ছে না</div>
                  )}
                </div>
              ) : (
                <div className="space-y-8">
                  {verificationData?.reuploadedFiles?.length > 0 ? (
                    verificationData.reuploadedFiles.map((url: string, i: number) => (
                      <div key={i} className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                           <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">নথি {i + 1}</span>
                        </div>
                        <DocumentViewer url={url} />
                      </div>
                    ))
                  ) : (
                    <div className="py-20 text-center text-gray-400">কোনো মূল নথি পাওয়া যায়নি</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <button onClick={() => navigate(-1)} className="mt-8 w-full py-3 text-gray-500 font-medium">
            ← ফিরে যান
          </button>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default VerificationPage;