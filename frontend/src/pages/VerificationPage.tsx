import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';
import  api  from '../api';
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
    const verifyCertificate = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/files/verify/${certificateNumber}`);
        console.log('Verification response:', response.data); // Debug log
        
        setVerificationData(response.data);
        
        // Construct URLs - match backend field names exactly
        const baseURL = process.env.REACT_APP_API_URL || 'https://bangladesh-apostille-api.onrender.com';
        
        // Certificate URL - backend returns 'certificatePath'
        if (response.data?.certificatePath) {
          const certPath = response.data.certificatePath.replace(/^\/+/, '');
          const fullUrl = `${baseURL}/${certPath}`;
          console.log('Certificate URL:', fullUrl);
          setCertificateUrl(fullUrl);
        } else {
          console.warn('No certificatePath in response');
        }
        
        // Processed files - backend returns 'reuploadedFiles'
        if (response.data?.reuploadedFiles && Array.isArray(response.data.reuploadedFiles)) {
          const files = response.data.reuploadedFiles.map((file: string) => {
            const cleanPath = file.replace(/^\/+/, '');
            return `${baseURL}/${cleanPath}`;
          });
          console.log('Processed files:', files);
          setProcessedFiles(files);
        }
      } catch (err: any) {
        console.error('Verification failed', err);
        setError(err.response?.data?.message || 'Certificate verification failed');
      } finally {
        setLoading(false);
      }
    };

    if (certificateNumber) {
      verifyCertificate();
    }
  }, [certificateNumber]);

  const handleDownloadCertificate = async () => {
    if (!certificateUrl) {
      alert('সার্টিফিকেট URL পাওয়া যায়নি');
      return;
    }
    
    try {
      // Use fetch to get the file, then download
      const response = await fetch(certificateUrl);
      if (!response.ok) throw new Error('Failed to fetch');
      
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
      console.error('Download failed', err);
      alert('ডাউনলোড ব্যর্থ হয়েছে। আবার চেষ্টা করুন।');
    }
  };

  // Mobile-friendly PDF viewer wrapper
  const PDFViewer = ({ url, height = '500px' }: { url: string; height?: string }) => (
    <div className="w-full" style={{ height }}>
      <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js">
        <Viewer
          fileUrl={url}
          plugins={[defaultLayoutPluginInstance]}
          defaultScale={0.8}
          renderError={(error: any) => (
            <div className="flex items-center justify-center h-full bg-gray-50">
              <div className="text-center p-4">
                <p className="text-red-600 font-medium mb-2">PDF লোড করতে ব্যর্থ</p>
                <p className="text-gray-500 text-sm">{error.message || 'অজানা ত্রুটি'}</p>
                <button
                  onClick={() => window.open(url, '_blank')}
                  className="mt-2 text-blue-600 underline text-sm"
                >
                  নতুন ট্যাবে খুলুন
                </button>
              </div>
            </div>
          )}
          renderLoader={(percentages: number) => (
            <div className="flex items-center justify-center h-full bg-gray-50">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-2"></div>
                <p className="text-gray-600">লোড হচ্ছে... {Math.round(percentages)}%</p>
              </div>
            </div>
          )}
        />
      </Worker>
    </div>
  );

  // Image viewer for processed documents
  const ImageViewer = ({ url }: { url: string }) => {
    const ext = url.split('.').pop()?.toLowerCase();
    
    if (ext === 'pdf') {
      return <PDFViewer url={url} height="400px" />;
    }
    
    return (
      <div className="w-full flex justify-center bg-gray-100 rounded-lg overflow-hidden">
        <img 
          src={url} 
          alt="Processed document" 
          className="max-w-full max-h-[500px] object-contain"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <div className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 mx-auto"></div>
            <p className="mt-4 text-gray-600 font-medium">যাচাই করা হচ্ছে...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <div className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
            <div className="text-red-500 text-5xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-red-600 mb-2">যাচাই ব্যর্থ</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button 
              onClick={() => navigate('/')}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              হোম পেজে ফিরে যান
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      
      <main className="flex-grow container mx-auto px-4 py-6">
        <div className="max-w-5xl mx-auto">
          {/* Certificate Info Card */}
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-green-100 p-2 rounded-full">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-800">e-APOSTILLE সার্টিফিকেট</h1>
                <p className="text-sm text-gray-600">নম্বর: {certificateNumber}</p>
              </div>
            </div>

            {verificationData && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">আবেদনকারী</p>
                  <p className="font-medium">{verificationData.userName || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">যাচাইকারী</p>
                  <p className="font-medium">{verificationData.verifiedBy || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">যাচাই তারিখ</p>
                  <p className="font-medium">
                    {verificationData.verifiedAt 
                      ? new Date(verificationData.verifiedAt).toLocaleDateString('bn-BD') 
                      : 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">নথির সংখ্যা</p>
                  <p className="font-medium">{processedFiles.length}টি</p>
                </div>
              </div>
            )}
          </div>

          {/* Mobile-friendly Tabs */}
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            {/* Tab Buttons */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setActiveTab('certificate')}
                className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 ${
                  activeTab === 'certificate'
                    ? 'bg-green-50 text-green-700 border-b-2 border-green-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                সার্টিফিকেট
                {certificateUrl && (
                  <span className="ml-1 bg-green-600 text-white text-xs px-2 py-0.5 rounded-full">
                    ডাউনলোড
                  </span>
                )}
              </button>
              
              {processedFiles.length > 0 && (
                <button
                  onClick={() => setActiveTab('documents')}
                  className={`flex-1 py-3 px-4 text-sm font-medium flex items-center justify-center gap-2 ${
                    activeTab === 'documents'
                      ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  যাচাইকৃত নথি
                  <span className="ml-1 bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                    {processedFiles.length}
                  </span>
                </button>
              )}
            </div>

            {/* Tab Content */}
            <div className="p-4">
              {activeTab === 'certificate' && (
                <div>
                  {certificateUrl ? (
                    <>
                      {/* Certificate Preview */}
                      <div className="mb-4 rounded-lg overflow-hidden border border-gray-200">
                        <PDFViewer url={certificateUrl} height="500px" />
                      </div>
                      
                      {/* Download Button - Prominent for mobile */}
                      <button
                        onClick={handleDownloadCertificate}
                        className="w-full bg-green-600 text-white py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-green-700 transition-colors shadow-md active:scale-95 transform"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        সার্টিফিকেট ডাউনলোড করুন
                      </button>
                      
                      <p className="text-center text-xs text-gray-500 mt-2">
                        PDF ফরম্যাটে ডাউনলোড করতে উপরের বাটনে চাপুন
                      </p>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-gray-500 mb-2">কোনো সার্টিফিকেট পাওয়া যায়নি</p>
                      <p className="text-xs text-gray-400">certificatePath: {verificationData?.certificatePath || 'N/A'}</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'documents' && (
                <div>
                  <p className="text-sm text-gray-600 mb-3">
                    যাচাইকৃত নথিগুলো শুধুমাত্র দেখার জন্য (ভিউ-অনলি):
                  </p>
                  
                  <div className="space-y-4">
                    {processedFiles.map((fileUrl, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 flex justify-between items-center">
                          <span className="text-sm font-medium text-gray-700">
                            নথি #{index + 1}
                          </span>
                          <span className="text-xs text-gray-500">
                            {fileUrl.split('.').pop()?.toUpperCase()}
                          </span>
                        </div>
                        <div className="p-2">
                          <ImageViewer url={fileUrl} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Back Button */}
          <div className="mt-4 text-center">
            <button
              onClick={() => navigate('/')}
              className="text-gray-600 hover:text-gray-800 text-sm flex items-center justify-center gap-1 mx-auto"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              হোম পেজে ফিরে যান
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default VerificationPage;