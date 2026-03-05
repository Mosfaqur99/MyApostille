// frontend/src/pages/AdminDashboard.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

import Header from '../components/Header';
import Footer from '../components/Footer';
import { toast } from 'react-toastify';
import { extractFilename } from '../Utils/FileUtils';
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
    authorityName: 'ANIK'
  });
  
  const [isVerifying, setIsVerifying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        
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
      const token = localStorage.getItem('token');
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
    // Reset states
    setSelectedSigners([]);
    setReuploadedFiles([]);
    
    // Pre-fill with sensible defaults
    setCertificateData({
      documentIssuer: upload.user_name || '',
      actingCapacity: 'Metropolitan Magistrate',
      documentLocation: 'Dhaka',
      certificateLocation: 'Dhaka',
      certificateDate: new Date().toISOString().split('T')[0],
      authorityName: 'ANIK'
    });
  };

  const handleVerify = async () => {
    if (!selectedUpload) return;
    
    // Validate all required fields
    if (!certificateData.documentIssuer || !certificateData.actingCapacity || 
        !certificateData.documentLocation || !certificateData.certificateLocation || 
        !certificateData.certificateDate || !certificateData.authorityName) {
      toast.error('All certificate fields are required');
      return;
    }

    // Validate re-uploaded files
    if (reuploadedFiles.length === 0) {
      toast.error('Please re-upload documents with stamps (Field 8)');
      return;
    }

    setIsVerifying(true);
    try {
      const token = localStorage.getItem('token');
      
      // Create FormData for file upload
      const formData = new FormData();
      
      // Add re-uploaded files
      reuploadedFiles.forEach(file => {
        formData.append('reuploadedFiles', file);
      });
      
      // Add certificate data
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
      
      // Refresh data
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
    if (!window.confirm('আপনি কি নিশ্চিত আপনি এই আবেদনটি মুছে ফেলতে চান? এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await api.delete(`/files/${uploadId}`);
      
      toast.success('আবেদন সফলভাবে মুছে ফেলা হয়েছে!');
      
     const pendingRes = await api.get('/files/pending');
      setPendingUploads(pendingRes.data);
    } catch (error: any) {
      console.error('Delete failed', error);
      toast.error(error.response?.data?.message || 'আবেদন মোছা ব্যর্থ হয়েছে');
    }
  };

  // Add this function in AdminDashboard component (after handleDeleteUpload)
const downloadUserDocument = async (filePath: string, filename: string) => {
  try {
    const token = localStorage.getItem('token');
    const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    
    // Extract just the filename from the full Windows path
    // Handle both Windows backslashes and forward slashes
    const pathSeparator = filePath.includes('\\') ? '\\' : '/';
    const fileNameOnly = filePath.split(pathSeparator).pop() || 'document';
    
    console.log('Downloading file:', fileNameOnly); // Debug log
    
    // Use the download endpoint with just the filename
    const response = await api.get(`/files/uploads/${fileNameOnly}`, {
  responseType: 'blob'
});
    
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename || fileNameOnly);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Download failed', error);
    toast.error('ডাউনলোড ব্যর্থ হয়েছে');
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
                          <div className="flex items-center gap-2">
                            <button
  onClick={() => downloadUserDocument(upload.file_path, upload.original_filename || extractFilename(upload.file_path))}
  className="inline-flex items-center px-3 py-1 border border-blue-600 text-blue-700 text-xs font-medium rounded-full bg-blue-50 hover:bg-blue-100 transition-colors"
  title="Download Original Document"
>
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
  ডাউনলোড
</button>
                            <button
                              onClick={() => handleVerifyClick(upload)}
                              className="px-3 py-1 border border-green-600 text-green-700 text-xs font-medium rounded-full bg-green-50 hover:bg-green-100 transition-colors"
                            >
                              যাচাই করুন
                            </button>
                            <button
                              onClick={() => handleDeleteUpload(upload.id)}
                              className="px-3 py-1 border border-red-600 text-red-700 text-xs font-medium rounded-full bg-red-50 hover:bg-red-100 transition-colors flex items-center gap-1"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ডাউনলোড</th>
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
                
                <div className="mb-5 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="font-medium text-gray-800 mb-1 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.21-.24-2.368-.666-3.452m1.618 4.016A11.95 11.95 0 0112 21a11.95 11.95 0 01-8.618-3.04" />
                    </svg>
                    Document Details
                  </p>
                  <p className="text-gray-700 truncate font-medium">{selectedUpload.original_filename}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    Applicant: <span className="font-medium text-green-700">{selectedUpload.user_name}</span>
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Field 1: Country */}
                  <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <span className="bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded mr-2">1</span>
                      Country (Fixed)
                    </label>
                    <input type="text" value="BANGLADESH" disabled className="w-full px-3 py-2 bg-green-100 border border-green-300 rounded-lg font-bold text-green-800 cursor-not-allowed" />
                  </div>

                  {/* Issuing Authority Section */}
                  <div className="bg-gray-100 p-2 rounded-lg border border-gray-200">
                    <h4 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Issuing Authority</h4>
                  </div>

                  {/* Field 2 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">2</span>
                      has been signed by: *
                    </label>
                    <input
                      type="text"
                      value={certificateData.documentIssuer}
                      onChange={(e) => setCertificateData({...certificateData, documentIssuer: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="e.g., Metropolitan Magistrate, Registrar"
                    />
                  </div>

                  {/* Field 3 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">3</span>
                      acting in the capacity of: *
                    </label>
                    <input
                      type="text"
                      value={certificateData.actingCapacity}
                      onChange={(e) => setCertificateData({...certificateData, actingCapacity: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="e.g., Metropolitan Magistrate, Director"
                    />
                  </div>

                  {/* Field 4 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">4</span>
                      bears the seal/stamp of: *
                    </label>
                    <input
                      type="text"
                      value={certificateData.documentLocation}
                      onChange={(e) => setCertificateData({...certificateData, documentLocation: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="e.g., Dhaka"
                    />
                  </div>

                  {/* Certified Section */}
                  <div className="bg-blue-50 p-2 rounded-lg border border-blue-200">
                    <h4 className="font-bold text-blue-800 text-sm uppercase tracking-wide">Certified</h4>
                  </div>

                  {/* Field 5 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">5</span>
                      at [location], Bangladesh *
                    </label>
                    <input
                      type="text"
                      value={certificateData.certificateLocation}
                      onChange={(e) => setCertificateData({...certificateData, certificateLocation: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="e.g., Dhaka"
                    />
                  </div>

                  {/* Field 6 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">6</span>
                      the [date] *
                    </label>
                    <input
                      type="date"
                      value={certificateData.certificateDate}
                      onChange={(e) => setCertificateData({...certificateData, certificateDate: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>

                  {/* Field 7 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
                      <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded">7</span>
                      by [name], Assistant Secretary, Ministry of Foreign Affairs *
                    </label>
                    <select
                      value={certificateData.authorityName}
                      onChange={(e) => setCertificateData({...certificateData, authorityName: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="MD. ASIF KHAN PRANTO">MD. ASIF KHAN PRANTO</option>
                      <option value="TUSHAR">TUSHAR</option>
                      <option value="ANIK">ANIK</option>
                    </select>
                  </div>

                  {/* Field 8: Re-upload Documents */}
                  <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <span className="bg-yellow-600 text-white text-xs font-bold px-2 py-0.5 rounded mr-2">8</span>
                      Re-upload Documents with Stamps/Annotations *
                    </label>
                    <input
                      type="file"
                      multiple
                      accept="image/*,application/pdf"
                      onChange={handleReuploadFiles}
                      className="w-full px-3 py-2 border border-yellow-300 rounded-lg bg-white"
                    />
                    <p className="text-xs text-yellow-700 mt-1">
                      {reuploadedFiles.length > 0 ? `${reuploadedFiles.length} file(s) selected` : 'No files selected'}
                    </p>
                    {reuploadedFiles.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {reuploadedFiles.map((file, idx) => (
                          <p key={idx} className="text-xs text-gray-600 flex items-center gap-1">
                            <svg className="h-3 w-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            {file.name}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Field 9: Additional Signatures */}
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <span className="bg-purple-600 text-white text-xs font-bold px-2 py-0.5 rounded mr-2">9</span>
                      Additional Signatures for Documents
                    </label>
                    
                    <select
                      onChange={(e) => addSigner(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-purple-300 rounded-lg mb-3 bg-white"
                      value=""
                    >
                      <option value="">Select a signer to add...</option>
                      {additionalSigners.map(signer => (
                        <option key={signer.id} value={signer.id}>
                          {signer.name} - {signer.designation}
                        </option>
                      ))}
                    </select>
                    
                    {selectedSigners.length > 0 && (
                      <div className="space-y-2">
                        {selectedSigners.map(selected => {
                          const signer = additionalSigners.find(s => s.id === selected.signerId);
                          return (
                            <div key={selected.signerId} className="flex items-center gap-2 bg-white p-2 rounded border border-purple-200">
                              <div className="flex-1">
                                <p className="font-medium text-sm text-gray-800">{signer?.name}</p>
                                <p className="text-xs text-gray-500">{signer?.designation}, {signer?.organization}</p>
                              </div>
                              <input
                                type="date"
                                value={selected.date}
                                onChange={(e) => updateSignerDate(selected.signerId, e.target.value)}
                                className="px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                              <button
                                onClick={() => removeSigner(selected.signerId)}
                                className="text-red-600 hover:text-red-800 p-1"
                              >
                                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Field 10: Auto-generated info */}
                  <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <span className="bg-gray-600 text-white text-xs font-bold px-2 py-0.5 rounded mr-2">10</span>
                      Seal/Stamp & Signature (Auto-generated)
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-3 bg-white rounded border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Field 9</p>
                        <p className="text-sm font-medium text-gray-700">Seal/stamp</p>
                        <p className="text-xs text-gray-400">[BANGLADESH GOVERNMENT SEAL]</p>
                      </div>
                      <div className="text-center p-3 bg-white rounded border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Field 10</p>
                        <p className="text-sm font-medium text-gray-700">Signature</p>
                        <p className="text-xs text-gray-400">[AUTHORITY SIGNATURE]</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-3">
                  <button
                    onClick={() => setSelectedUpload(null)}
                    className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium w-full sm:w-auto"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleVerify}
                    disabled={isVerifying || !certificateData.documentIssuer || !certificateData.actingCapacity || 
                              !certificateData.documentLocation || !certificateData.certificateLocation || reuploadedFiles.length === 0}
                    className={`px-5 py-2.5 rounded-lg text-white font-medium flex items-center justify-center gap-2 w-full sm:w-auto ${
                      isVerifying 
                        ? 'bg-green-400 cursor-not-allowed' 
                        : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {isVerifying ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating Certificate...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.21-.24-2.368-.666-3.452m1.618 4.016A11.95 11.95 0 0112 21a11.95 11.95 0 01-8.618-3.04" />
                        </svg>
                        Generate e-APOSTILLE Certificate
                      </>
                    )}
                  </button>
                </div>
                
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-800 font-medium flex items-start gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                      Certificate Format: Fields 9 (Seal) and 10 (Signature) will be automatically added based on the authority selected. Additional signatures (Field 9) will be attached to the bottom of re-uploaded documents.
                    </span>
                  </p>
                </div>
                
                <p className="mt-3 text-xs text-yellow-600 bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                  ⚠️ <strong>গুরুত্বপূর্ণ:</strong> দয়া করে শুধুমাত্র ইংরেজি অক্ষর ব্যবহার করুন (বাংলা অক্ষর সার্টিফিকেটে সমর্থিত নয়)
                </p>
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