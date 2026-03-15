// frontend/src/pages/AdminDashboard.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

import Header from '../components/Header';
import Footer from '../components/Footer';
import { toast } from 'react-toastify';
import api from '../api';

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [pendingUploads, setPendingUploads] = useState<any[]>([]);
  const [completedUploads, setCompletedUploads] = useState<any[]>([]);
  const [selectedUpload, setSelectedUpload] = useState<any>(null);
  
  // Additional signers state
  const [additionalSigners, setAdditionalSigners] = useState<any[]>([]);
  const [selectedSigners, setSelectedSigners] = useState<{signerId: number, date: string}[]>([]);
  const [reuploadedFiles, setReuploadedFiles] = useState<File[]>([]);
  
  // Certificate data state
  const [certificateData, setCertificateData] = useState({
    documentIssuer: '',
    actingCapacity: '',
    documentLocation: 'Dhaka',
    certificateLocation: 'Dhaka',
    certificateDate: new Date().toISOString().split('T')[0],
    authorityName: 'MD. ASIF KHAN PRANTO'
  });
  
  const [isVerifying, setIsVerifying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        const [pendingRes, completedRes] = await Promise.all([
          api.get('/files/pending'),
          api.get('/files/completed')
        ]);
        
        setPendingUploads(pendingRes.data);
        setCompletedUploads(completedRes.data);
      } catch (err) {
        console.error('Error fetching data', err);
        toast.error('Failed to load uploads');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (selectedUpload) {
      fetchAdditionalSigners();
    }
  }, [selectedUpload]);

  const fetchAdditionalSigners = async () => {
    try {
      const res = await api.get('/files/additional-signers');
      setAdditionalSigners(res.data);
    } catch (err) {
      console.error('Failed to fetch signers', err);
      toast.error('Failed to load additional signers');
    }
  };

  // Handle signer selection
  const addSigner = (signerId: number) => {
    if (!selectedSigners.find(s => s.signerId === signerId)) {
      setSelectedSigners([...selectedSigners, {
        signerId,
        date: new Date().toISOString().split('T')[0]
      }]);
    }
  };

  const handleDeleteVerifiedUpload = async (uploadId: number) => {
    if (!window.confirm('আপনি কি নিশ্চিত আপনি এই যাচাইকৃত আবেদনটি মুছে ফেলতে চান? এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।')) {
      return;
    }

    try {
      await api.delete(`/files/${uploadId}`);
      toast.success('যাচাইকৃত আবেদন সফলভাবে মুছে ফেলা হয়েছে!');
      
      const completedRes = await api.get('/files/completed');
      setCompletedUploads(completedRes.data);
    } catch (error: any) {
      console.error('Delete failed', error);
      toast.error(error.response?.data?.message || 'আবেদন মোছা ব্যর্থ হয়েছে');
    }
  };

  const removeSigner = (signerId: number) => {
    setSelectedSigners(selectedSigners.filter(s => s.signerId !== signerId));
  };

  const updateSignerDate = (signerId: number, date: string) => {
    setSelectedSigners(selectedSigners.map(s => 
      s.signerId === signerId ? { ...s, date } : s
    ));
  };

  // Handle re-uploaded files
  const handleReuploadFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setReuploadedFiles(Array.from(e.target.files));
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleVerifyClick = (upload: any) => {
    setSelectedUpload(upload);
    setSelectedSigners([]);
    setReuploadedFiles([]);
    
    setCertificateData({
      documentIssuer: upload.user_name || '',
      actingCapacity: 'Metropolitan Magistrate',
      documentLocation: 'Dhaka',
      certificateLocation: 'Dhaka',
      certificateDate: new Date().toISOString().split('T')[0],
      authorityName: 'MD. ASIF KHAN PRANTO'
    });
  };

  const handleVerify = async () => {
    if (!selectedUpload) return;
    
    if (!certificateData.documentIssuer || !certificateData.actingCapacity || 
        !certificateData.documentLocation || !certificateData.certificateLocation || 
        !certificateData.certificateDate || !certificateData.authorityName) {
      toast.error('All certificate fields are required');
      return;
    }

    if (reuploadedFiles.length === 0) {
      toast.error('Please re-upload documents with stamps (Field 8)');
      return;
    }

    setIsVerifying(true);
    try {
      const formData = new FormData();
      
      reuploadedFiles.forEach(file => {
        formData.append('reuploadedFiles', file);
      });
      
      formData.append('documentIssuer', certificateData.documentIssuer);
      formData.append('documentTitle', certificateData.actingCapacity);
      formData.append('documentLocation', certificateData.documentLocation);
      formData.append('certificateLocation', certificateData.certificateLocation);
      formData.append('certificateDate', certificateData.certificateDate);
      formData.append('authorityName', certificateData.authorityName);
      formData.append('additionalSigners', JSON.stringify(selectedSigners));
      
      const response = await api.post(
        `/files/verify/${selectedUpload.id}`,
        formData
      );
      
      toast.success('e-APOSTILLE Certificate and signed documents generated successfully!');
      
      const [pendingRes, completedRes] = await Promise.all([
        api.get('/files/pending'),
        api.get('/files/completed')
      ]);
      
      setPendingUploads(pendingRes.data);
      setCompletedUploads(completedRes.data);
      setSelectedUpload(null);
      setSelectedSigners([]);
      setReuploadedFiles([]);
    } catch (error: any) {
      console.error('Verification failed', error);
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Certificate generation failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDeleteUpload = async (uploadId: number) => {
    if (!window.confirm('আপনি কি নিশ্চিত আপনি এই আবেদনটি মুছে ফেলতে চান?')) {
      return;
    }

    try {
      await api.delete(`/files/${uploadId}`);
      toast.success('আবেদন সফলভাবে মুছে ফেলা হয়েছে!');
      
      const pendingRes = await api.get('/files/pending');
      setPendingUploads(pendingRes.data);
    } catch (error: any) {
      console.error('Delete failed', error);
      toast.error(error.response?.data?.message || 'আবেদন মোছা ব্যর্থ হয়েছে');
    }
  };

  // DOWNLOAD FUNCTION - Works for both pending and completed
  const handleDownload = async (uploadId: number, type = 'all') => {
    try {
      const token = localStorage.getItem('token');
      const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://bangladesh-apostille-api.onrender.com';
      if(!token) {
        toast.error('Authentication token not found. Please log in again.');
        return;
      }
      const response = await fetch(
        `${API_BASE_URL}/api/files/download/${uploadId}?type=${type}`,
        {
          headers: { 'x-auth-token': token }
        }
      );
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Download failed: ${response.status}`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `apostille-${uploadId}-${type}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast.success('ডাউনলোড শুরু হয়েছে!');
    } catch (error: any) {
      console.error('Download failed:', error);
      toast.error(error.message || 'ডাউনলোড ব্যর্থ হয়েছে');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">তথ্য লোড হচ্ছে...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      
      <div className="bg-white border-b border-gray-200 py-4 mb-6 shadow-sm">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-green-800 flex items-center gap-3">
              <div className="bg-green-600 text-white p-2 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              অ্যাডমিন ড্যাশবোর্ড
            </h1>
            <p className="text-gray-600 mt-1">
              মোট পেন্ডিং: <span className="font-bold text-yellow-600">{pendingUploads.length}</span> | 
              মোট যাচাইকৃত: <span className="font-bold text-green-600">{completedUploads.length}</span>
            </p>
          </div>
          
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 bg-red-100 text-red-700 px-5 py-2.5 rounded-lg hover:bg-red-200 transition-colors font-medium group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>লগআউট</span>
          </button>
        </div>
      </div>

      <main className="container mx-auto px-4 py-2 flex-grow">
        <div className="space-y-6">
          {/* Pending Uploads Table */}
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-3 py-1 rounded-full">
                  পেন্ডিং
                </span>
                <h2 className="font-bold text-gray-800">অপেক্ষাধীন আবেদন ({pendingUploads.length})</h2>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">আবেদন নং</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ব্যবহারকারী</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">নথি</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">তারিখ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">কার্যক্রম</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pendingUploads.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                        <div className="text-4xl mb-2">✅</div>
                        <p className="font-medium">সকল আবেদন প্রক্রিয়াজাত হয়েছে</p>
                      </td>
                    </tr>
                  ) : (
                    pendingUploads.map((upload) => (
                      <tr key={upload.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{upload.id}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{upload.user_name}</div>
                          <div className="text-xs text-gray-500">{upload.user_email}</div>
                        </td>
                        <td className="px-4 py-3 max-w-[120px] truncate text-gray-700">
                          {upload.original_filename}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {new Date(upload.created_at).toLocaleDateString('bn-BD')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Download Button for PENDING - Only originals */}
                            <div className="relative group">
                              <button className="inline-flex items-center px-3 py-1 border border-blue-600 text-blue-700 text-xs font-medium rounded-full bg-blue-50 hover:bg-blue-100 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                ডাউনলোড
                              </button>
                              
                              {/* Dropdown Menu - Only originals for pending */}
                              <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 hidden group-hover:block z-10">
                                <button
                                  onClick={() => handleDownload(upload.id, 'originals')}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                                >
                                  📁 মূল নথি ডাউনলোড
                                </button>
                              </div>
                            </div>

                            {/* Verify Button */}
                            <button
                              onClick={() => handleVerifyClick(upload)}
                              className="px-3 py-1 border border-green-600 text-green-700 text-xs font-medium rounded-full bg-green-50 hover:bg-green-100 transition-colors"
                            >
                              যাচাই করুন
                            </button>
                            
                            {/* Delete Button */}
                            <button
                              onClick={() => handleDeleteUpload(upload.id)}
                              className="inline-flex items-center px-3 py-1 border border-red-600 text-red-700 text-xs font-medium rounded-full bg-red-50 hover:bg-red-100 transition-colors"
                              title="আবেদন মুছুন"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              মুছুন
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Completed Uploads Table */}
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="bg-green-100 text-green-800 text-xs font-medium px-3 py-1 rounded-full">
                  সম্পন্ন
                </span>
                <h2 className="font-bold text-gray-800">যাচাইকৃত আবেদন ({completedUploads.length})</h2>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">আবেদন নং</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ব্যবহারকারী</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">সার্টিফিকেট নম্বর</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">অনুমোদনকারী</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">তারিখ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">কার্যক্রম</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {completedUploads.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                        <div className="text-4xl mb-2">📁</div>
                        <p className="font-medium">এখনো কোনো যাচাইকৃত আবেদন নেই</p>
                      </td>
                    </tr>
                  ) : (
                    completedUploads.map((upload) => (
                      <tr key={upload.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{upload.id}</td>
                        <td className="px-4 py-3 text-gray-700">{upload.user_name}</td>
                        <td className="px-4 py-3 text-blue-600 font-medium">
                          {upload.certificate_number || 'N/A'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{upload.verified_by_name}</div>
                          <div className="text-xs text-gray-500">{upload.certificate_data?.authorityName || 'N/A'}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {new Date(upload.verified_at).toLocaleDateString('bn-BD')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* View/Verify Button */}
                            <button
                              onClick={() => navigate(`/verify/${upload.certificate_number}`)}
                              className="inline-flex items-center px-3 py-1 border border-green-600 text-green-700 text-xs font-medium rounded-full bg-green-50 hover:bg-green-100 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              দেখুন ও যাচাই
                            </button>
                            
                            {/* Download Dropdown for COMPLETED - All options */}
                            <div className="relative group">
                              <button className="inline-flex items-center px-3 py-1 border border-blue-600 text-blue-700 text-xs font-medium rounded-full bg-blue-50 hover:bg-blue-100 transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                ডাউনলোড
                              </button>
                              
                              {/* Dropdown Menu - All options for completed */}
                              <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 hidden group-hover:block z-10">
                                <button
                                  onClick={() => handleDownload(upload.id, 'all')}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg"
                                >
                                  📦 সব ফাইল
                                </button>
                                <button
                                  onClick={() => handleDownload(upload.id, 'certificate')}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  📜 সার্টিফিকেট
                                </button>
                                <button
                                  onClick={() => handleDownload(upload.id, 'verified')}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  ✅ যাচাইকৃত নথি
                                </button>
                                <button
                                  onClick={() => handleDownload(upload.id, 'originals')}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 last:rounded-b-lg"
                                >
                                  📁 মূল নথি
                                </button>
                              </div>
                            </div>
                            
                            {/* Delete Button */}
                            <button
                              onClick={() => handleDeleteVerifiedUpload(upload.id)}
                              className="inline-flex items-center px-3 py-1 border border-red-600 text-red-700 text-xs font-medium rounded-full bg-red-50 hover:bg-red-100 transition-colors"
                              title="যাচাইকৃত আবেদন মুছুন"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              মুছুন
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Verification Modal */}
        {selectedUpload && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto">
              {/* ... rest of modal code ... */}
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <div className="bg-blue-100 text-blue-800 p-1.5 rounded-lg">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.21-.24-2.368-.666-3.452m1.618 4.016A11.95 11.95 0 0112 21a11.95 11.95 0 01-8.618-3.04" />
                      </svg>
                    </div>
                    e-APOSTILLE Certificate Generator
                  </h3>
                  <button 
                    onClick={() => setSelectedUpload(null)}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded-full"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                {/* ... rest of form fields ... */}
                
                <div className="mt-6 pt-4 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-3">
                  <button
                    onClick={() => setSelectedUpload(null)}
                    className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium w-full sm:w-auto"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleVerify}
                    disabled={isVerifying}
                    className={`px-5 py-2.5 rounded-lg text-white font-medium flex items-center justify-center gap-2 w-full sm:w-auto ${
                      isVerifying ? 'bg-green-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {isVerifying ? 'Generating...' : 'Generate Certificate'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default AdminDashboard;