// frontend/src/pages/VerificationPage.tsx
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-toastify';
import Header from '../components/Header';
import Footer from '../components/Footer';

const VerificationPage = () => {
  const { certificateNumber } = useParams<{ certificateNumber: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeDocIndex, setActiveDocIndex] = useState(0);

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

  useEffect(() => {
    fetchVerificationData();
  }, [certificateNumber]);

  const fetchVerificationData = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/files/verify/${certificateNumber}`);
      setData(res.data);
    } catch (err) {
      toast.error('Certificate not found or invalid');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const downloadCertificate = () => {
    if (data?.certificatePath) {
      window.open(`${API_URL}${data.certificatePath}`, '_blank');
    }
  };

  const goBack = () => {
    navigate(-1); // Go back to previous page
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Loading verification data...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header />
        <div className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-lg shadow-lg text-center max-w-md border-t-4 border-red-500">
            <div className="text-6xl mb-4">❌</div>
            <h1 className="text-2xl font-bold text-red-600 mb-2">Certificate Not Found</h1>
            <p className="text-gray-600 mb-4">The certificate number you entered is invalid or does not exist in our system.</p>
            <button 
              onClick={() => navigate('/')}
              className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors"
            >
              Go Home
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
      
      <main className="flex-grow container mx-auto px-4 py-8 max-w-5xl">
        
        {/* ========== GO BACK BUTTON ========== */}
        <div className="mb-4">
          <button
            onClick={goBack}
            className="inline-flex items-center gap-2 text-gray-600 hover:text-green-700 font-medium transition-colors bg-white px-4 py-2 rounded-lg shadow-sm hover:shadow-md border border-gray-200"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Go Back
          </button>
        </div>

        {/* ========== HEADER SECTION ========== */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6 border-l-4 border-green-600">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-green-600 text-white p-3 rounded-lg">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">e-APOSTILLE Verification</h1>
                <p className="text-gray-500 text-sm">Ministry of Foreign Affairs, Bangladesh</p>
              </div>
            </div>
            <div className="bg-gray-50 px-4 py-2 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Certificate No</p>
              <p className="text-lg font-bold text-green-700 font-mono tracking-wider">{data.certificateNumber}</p>
            </div>
          </div>
        </div>
        {/* ========== CERTIFICATE SECTION (TOP) ========== */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="bg-green-50 px-6 py-4 border-b border-green-100 flex justify-between items-center">
            <h2 className="text-lg font-bold text-green-800 flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              e-APOSTILLE Certificate
            </h2>
            <span className="bg-green-600 text-white text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
              <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Verified Authentic
            </span>
          </div>
          
          {/* Certificate Preview */}
          <div className="p-6 bg-gray-50">
            <div className="border border-gray-300 rounded-lg overflow-hidden shadow-inner bg-white max-w-3xl mx-auto">
              <iframe
                src={`${API_URL}${data.certificatePath}`}
                className="w-full h-[500px]"
                title="e-APOSTILLE Certificate"
              />
            </div>
          </div>

          {/* Download Button */}
          <div className="px-6 pb-6 pt-2 bg-gray-50 border-t border-gray-200">
            <button
              onClick={downloadCertificate}
              className="w-full max-w-md mx-auto block bg-green-600 hover:bg-green-700 text-white py-3 px-6 rounded-lg font-bold transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Apostille Certificate
            </button>
          </div>
        </div>

        {/* ========== CERTIFIED DOCUMENTS SECTION (BELOW) ========== */}
        {data.reuploadedFiles && data.reuploadedFiles.length > 0 && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
            <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
              <h2 className="text-lg font-bold text-blue-800 flex items-center gap-2">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Certified Documents
              </h2>
              <p className="text-sm text-blue-600 mt-1">
                These documents have been verified and digitally signed
              </p>
            </div>

            <div className="p-6">
              {/* Document Tabs */}
              {data.reuploadedFiles.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {data.reuploadedFiles.map((file: string, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setActiveDocIndex(idx)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        activeDocIndex === idx
                          ? 'bg-blue-600 text-white shadow-md'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Document {idx + 1}
                    </button>
                  ))}
                </div>
              )}

              {/* Document Preview - View Only (No Download) */}
              <div className="border-2 border-gray-200 rounded-lg overflow-hidden bg-gray-800">
                <div className="bg-gray-700 px-4 py-2 flex justify-between items-center">
                  <span className="font-medium text-white text-sm">
                    {data.reuploadedFiles.length > 1 ? `Document ${activeDocIndex + 1} of ${data.reuploadedFiles.length}` : 'Verified Document'}
                  </span>
                  <span className="text-xs text-gray-300 bg-gray-600 px-2 py-1 rounded flex items-center gap-1">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    View Only
                  </span>
                </div>
                {/* Using object tag with disabled toolbar to prevent download */}
                <object
                  data={`${API_URL}${data.reuploadedFiles[activeDocIndex]}#toolbar=0&navpanes=0&scrollbar=1`}
                  type="application/pdf"
                  className="w-full h-[700px] bg-white"
                >
                  <iframe
                    src={`${API_URL}${data.reuploadedFiles[activeDocIndex]}#toolbar=0&navpanes=0&scrollbar=1`}
                    className="w-full h-[700px]"
                    title={`Document ${activeDocIndex + 1}`}
                    sandbox="allow-same-origin allow-scripts"
                  />
                </object>
              </div>
              
              <p className="text-center text-xs text-gray-400 mt-3">
                Documents are for viewing only. Download not permitted.
              </p>
            </div>
          </div>
        )}

      </main>

      <Footer />
    </div>
  );
};

export default VerificationPage;