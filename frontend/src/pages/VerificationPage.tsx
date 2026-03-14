import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { toast } from 'react-toastify';
import Header from '../components/Header';
import Footer from '../components/Footer';

// PDF Viewer Imports
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';

// Import Viewer Styles
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

const VerificationPage = () => {
  // 1. Initialize the plugin at the top level. 
  // DO NOT wrap this in useMemo or useEffect.
  const defaultLayoutPluginInstance = defaultLayoutPlugin();

  // 2. Standard State Hooks
  const { certificateNumber } = useParams<{ certificateNumber: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeDocIndex, setActiveDocIndex] = useState(0);

  // 3. Side Effects
  useEffect(() => {
    const fetchVerificationData = async () => {
      try {
        const res = await api.get(`/files/verify/${certificateNumber}`);
        setData(res.data);
      } catch (err) {
        toast.error('Certificate not found');
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchVerificationData();
  }, [certificateNumber]);

  // 4. Helpers
  const getFullUrl = (path: string) => {
    if (!path) return '';
    const baseURL = (api.defaults.baseURL || '').replace('/api', '');
    return `${baseURL}${path}`;
  };

  // 5. Early return logic (Must be after ALL hook calls)
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!data) return <div>Data not found</div>;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-grow container mx-auto px-4 py-8 max-w-5xl">
        {/* ... Header UI ... */}
        
        <div className="bg-white rounded-lg shadow-md overflow-hidden mb-6">
          <div className="p-4 bg-gray-100">
            <div className="h-[600px] border border-gray-300 rounded-lg overflow-hidden bg-white">
              <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js">
                <Viewer 
                  fileUrl={getFullUrl(data.certificatePath)} 
                  plugins={[defaultLayoutPluginInstance]} 
                />
              </Worker>
            </div>
          </div>
        </div>

        {/* Certified Documents Section */}
        {data.reuploadedFiles && data.reuploadedFiles.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
             <div className="h-[600px] border border-gray-200 rounded-lg overflow-hidden">
                <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js">
                  {/* Note: We don't use the plugin instance here to keep it "View Only" */}
                  <Viewer fileUrl={getFullUrl(data.reuploadedFiles[activeDocIndex])} />
                </Worker>
             </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default VerificationPage;