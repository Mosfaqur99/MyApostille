import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import api from '../api';
import Header from '../components/Header';
import Footer from '../components/Footer';

const VerificationPage = () => {
  const { certificateNumber } = useParams();
  const navigate = useNavigate();
  
  const defaultLayoutPluginInstance = defaultLayoutPlugin();
  
  const [verificationData, setVerificationData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null);
  const [processedFiles, setProcessedFiles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'certificate' | 'documents'>('certificate');

  useEffect(() => {
  let isMounted = true;

  const verifyCertificate = async () => {
    try {
      setLoading(true);
      // Fetching from the public GET route [cite: 30]
      const response = await api.get(`/files/verify/${certificateNumber}`);
      
      if (isMounted) {
        setVerificationData(response.data);
        
        const baseURL = 'https://bangladesh-apostille-api.onrender.com';
        const buildUrl = (path: string) => {
          if (!path) return null;
          if (path.startsWith('http')) return path;
          return `${baseURL}/${path.replace(/^\/+/, '')}`;
        };

        // Map certificatePath from API 
        if (response.data.certificatePath) {
          setCertificateUrl(buildUrl(response.data.certificatePath));
        }

        // Map reuploadedFiles from API 
        if (response.data.reuploadedFiles) {
          const files = response.data.reuploadedFiles.map((f: string) => buildUrl(f));
          setProcessedFiles(files.filter(Boolean));
        }
        
        setLoading(false); // Move this inside successful block
      }
    } catch (err: any) {
      if (isMounted) {
        setError(err.response?.data?.message || 'সার্টিফিকেট পাওয়া যায়নি');
        setLoading(false);
      }
    }
  };

  verifyCertificate();
  return () => { isMounted = false; };
}, [certificateNumber]);

  const handleDownloadCertificate = async () => {
    if (!certificateUrl) return;
    try {
      const response = await fetch(certificateUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `e-APOSTILLE-${certificateNumber}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('ডাউনলোড ব্যর্থ হয়েছে। আবার চেষ্টা করুন।');
    }
  };

  const PDFViewer = ({ url, height = '500px' }: { url: string; height?: string }) => (
    <div className="w-full" style={{ height }}>
      <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js">
        <Viewer
          fileUrl={url}
          plugins={[defaultLayoutPluginInstance]}
          defaultScale={0.8}
          renderError={() => (
            <div className="flex items-center justify-center h-full bg-gray-50 border border-dashed border-gray-300">
              <div className="text-center p-4">
                <p className="text-red-600 font-medium mb-2">PDF লোড করা সম্ভব হচ্ছে না</p>
                <button onClick={() => window.open(url, '_blank')} className="mt-2 text-blue-600 underline text-sm">সরাসরি নতুন ট্যাবে দেখুন</button>
              </div>
            </div>
          )}
        />
      </Worker>
    </div>
  );

  const ImageViewer = ({ url }: { url: string }) => {
    const ext = url.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return <PDFViewer url={url} height="400px" />;
    return (
      <div className="w-full flex justify-center bg-gray-100 rounded-lg overflow-hidden">
        <img src={url} alt="Verified" className="max-w-full max-h-[500px] object-contain" />
      </div>
    );
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
      <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600"></div>
      <p className="mt-4 text-gray-600">যাচাই করা হচ্ছে...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-md w-full">
        <div className="text-red-500 text-5xl mb-4">⚠️</div>
        <h2 className="text-2xl font-bold text-red-600 mb-2">যাচাই ব্যর্থ</h2>
        <p className="text-gray-600 mb-6">{error}</p>
        <button onClick={() => navigate('/')} className="bg-green-600 text-white px-6 py-2 rounded-lg w-full">হোম পেজে ফিরে যান</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-6">
        <div className="max-w-5xl mx-auto">
          {/* Certificate Info Header */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="bg-green-100 p-3 rounded-full text-green-600">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">e-APOSTILLE যাচাইকৃত</h1>
                <p className="text-gray-600">নম্বর: <span className="font-mono font-bold text-green-700">{certificateNumber}</span></p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 border-t border-gray-100">
              <div>
                <label className="text-xs text-gray-400 uppercase font-bold">আবেদনকারী</label>
                <p className="text-gray-800 font-medium">{verificationData?.userName || 'N/A'}</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase font-bold">যাচাইকারী কর্তৃপক্ষ</label>
                <p className="text-gray-800 font-medium">Ministry of Foreign Affairs</p>
              </div>
              <div>
                <label className="text-xs text-gray-400 uppercase font-bold">যাচাইয়ের তারিখ</label>
                <p className="text-gray-800 font-medium">
                  {verificationData?.verifiedAt ? new Date(verificationData.verifiedAt).toLocaleDateString('bn-BD') : 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Document Tabs */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden min-h-[500px]">
            <div className="flex border-b">
              <button 
                onClick={() => setActiveTab('certificate')}
                className={`flex-1 py-4 text-center font-bold transition-all ${activeTab === 'certificate' ? 'bg-green-50 text-green-700 border-b-4 border-green-600' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                📜 সার্টিফিকেট দেখুন
              </button>
              <button 
                onClick={() => setActiveTab('documents')}
                className={`flex-1 py-4 text-center font-bold transition-all ${activeTab === 'documents' ? 'bg-blue-50 text-blue-700 border-b-4 border-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                📂 মূল নথি ({processedFiles.length})
              </button>
            </div>

            <div className="p-4 md:p-6">
              {activeTab === 'certificate' ? (
                <div className="animate-fadeIn">
                  {certificateUrl ? (
                    <>
                      <div className="mb-6 rounded-lg overflow-hidden border border-gray-200">
                        <PDFViewer url={certificateUrl} />
                      </div>
                      <button onClick={handleDownloadCertificate} className="w-full md:w-auto bg-green-600 text-white px-8 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-green-700 mx-auto shadow-md">
                        📥 ডাউনলোড সার্টিফিকেট
                      </button>
                    </>
                  ) : <p className="text-center py-20 text-gray-400">সার্টিফিকেট পাওয়া যায়নি</p>}
                </div>
              ) : (
                <div className="space-y-6">
                  {processedFiles.map((url, idx) => (
                    <div key={idx} className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                      <p className="text-sm font-bold text-gray-500 mb-2">যাচাইকৃত নথি {idx + 1}</p>
                      <ImageViewer url={url} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Updated Go Back Button */}
<div className="mt-8 text-center pb-10">
  <button
    onClick={() => navigate(-1)} // Changed from navigate('/') to navigate(-1)
    className="bg-white text-gray-700 px-8 py-3 rounded-xl border border-gray-300 hover:bg-gray-200 transition-all flex items-center justify-center gap-2 mx-auto font-medium shadow-sm"
  >
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
    </svg>
    আগের পেজে ফিরে যান
  </button>
</div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default VerificationPage;