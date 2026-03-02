// frontend/src/pages/UserDashboard.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { toast } from 'react-toastify';
import { gsap } from 'gsap';
import { extractFilename } from '../Utils/FileUtils';

const UserDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [uploads, setUploads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUploadId, setEditingUploadId] = useState<number | null>(null);
  const [viewingUpload, setViewingUpload] = useState<any>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUploads();
    const interval = setInterval(fetchUploads, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchUploads = async () => {
    try {
      const res = await axios.get('/api/files/my-uploads');
      setUploads(res.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching uploads:', err);
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleContact = () => {
    setShowContactModal(true);
  };

  const handleChangePassword = () => {
    toast.warning('পাসওয়ার্ড পরিবর্তন পৃষ্ঠা শীঘ্রই যোগ করা হবে', {
      autoClose: 3000
    });
  };

  // Handle file replacement (supports multiple files)
  const handleReplaceFile = async (uploadId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Validate files
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];
    
    Array.from(files).forEach(file => {
      const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
      if (!validTypes.includes(file.type)) {
        invalidFiles.push(file.name);
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        invalidFiles.push(`${file.name} (too large)`);
        return;
      }
      
      validFiles.push(file);
    });

    if (invalidFiles.length > 0) {
      toast.error(`Invalid files: ${invalidFiles.join(', ')}`);
      return;
    }

    if (validFiles.length === 0) return;

    const formData = new FormData();
    validFiles.forEach(file => {
      formData.append('files', file); // Use 'files' for multiple
    });

    try {
      await axios.put(`/api/files/replace/${uploadId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const fileCount = validFiles.length;
      toast.success(`${fileCount} file${fileCount > 1 ? 's' : ''} replaced successfully!`);
      fetchUploads();
      setEditingUploadId(null);
    } catch (error: any) {
      console.error('Replace failed', error);
      toast.error(error.response?.data?.message || 'ফাইল প্রতিস্থাপন ব্যর্থ হয়েছে');
      setEditingUploadId(null);
    }
  };

  // Handle delete upload
  const handleDeleteUpload = async (uploadId: number) => {
    if (!window.confirm('আপনি কি নিশ্চিত আপনি এই আবেদনটি মুছে ফেলতে চান? এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।')) {
      return;
    }

    try {
      await axios.delete(`/api/files/${uploadId}`);
      toast.success('আবেদন সফলভাবে মুছে ফেলা হয়েছে!');
      fetchUploads();
    } catch (error: any) {
      console.error('Delete failed', error);
      toast.error(error.response?.data?.message || 'আবেদন মোছা ব্যর্থ হয়েছে');
    }
  };

  // Handle view upload (preview images)
  const handleViewUpload = (upload: any) => {
    // Only allow viewing for image types
    if (upload.file_type === 'pdf') {
      // Open PDF in new tab
      const filename = extractFilename(upload.file_path);
      const pdfUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/uploads/${filename}`;
      window.open(pdfUrl, '_blank');
    } else {
      setViewingUpload(upload);
    }
  };

  // Handle multiple file upload
  const handleMultipleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const files = Array.from(e.target.files);
    const formData = new FormData();
    
    for (const file of files) {
      const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
      if (!validTypes.includes(file.type)) {
        toast.error(`অবৈধ ফাইল: ${file.name}. শুধুমাত্র PDF, PNG, এবং JPEG অনুমোদিত`);
        return;
      }
    }

    const hasPDF = files.some(f => f.type === 'application/pdf');
    const hasImages = files.some(f => f.type.startsWith('image/'));
    
    if (hasPDF && hasImages) {
      toast.error('PDF এবং ইমেজ একসাথে আপলোড করা যাবে না। আলাদাভাবে আপলোড করুন।');
      return;
    }

    const pdfCount = files.filter(f => f.type === 'application/pdf').length;
    if (pdfCount > 1) {
      toast.error('শুধুমাত্র একটি PDF ফাইল আপলোড করুন। একাধিক ইমেজের জন্য শুধুমাত্র ইমেজ ফাইল নির্বাচন করুন।');
      return;
    }

    files.forEach(file => formData.append('files', file));

    try {
      await axios.post('/api/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            console.log(`Upload progress: ${percentCompleted}%`);
          }
        }
      });
      
      toast.success(files.length > 1 
        ? `${files.length}টি ফাইল সফলভাবে আপলোড হয়েছে!`
        : 'ফাইল সফলভাবে আপলোড হয়েছে!'
      );
      fetchUploads();
    } catch (error: any) {
      console.error('Upload failed', error);
      toast.error(error.response?.data?.message || 'আপলোড ব্যর্থ হয়েছে');
    } finally {
      if (uploadInputRef.current) {
        uploadInputRef.current.value = '';
      }
    }
  };

  // Trigger replace dialog
  const triggerReplaceDialog = (uploadId: number) => {
    setEditingUploadId(uploadId);
    setTimeout(() => {
      replaceFileInputRef.current?.click();
    }, 0);
  };

  // Handle replace file selection
  const handleReplaceFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (editingUploadId && e.target.files) {
      handleReplaceFile(editingUploadId, e.target.files);
      e.target.value = '';
    }
  };

  // Get file URLs for viewing
  const getFileUrls = (upload: any) => {
    if (!upload) return [];
    
    let files: any[] = [];
    
    if (upload.file_paths && Array.isArray(upload.file_paths)) {
      files = upload.file_paths;
    } else if (upload.file_path) {
      files = [{ path: upload.file_path, original_name: upload.original_filename }];
    }
    
    return files.map(file => {
      const filename = extractFilename(file.path || file);
      return {
        url: `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/uploads/${filename}`,
        name: file.original_name || filename
      };
    });
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
      
      {/* User Action Bar */}
      <div className="bg-white border-b border-gray-200 py-4 mb-6 shadow-sm">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="text-2xl font-bold text-green-800 flex items-center gap-2">
              <div className="bg-green-600 text-white p-2 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              সকল আবেদন
            </h1>
            <div className="text-gray-600">
              মোট: <span className="font-bold">{uploads.length}</span> | 
              পেন্ডিং: <span className="font-bold text-yellow-600">{uploads.filter(u => u.status === 'pending').length}</span> | 
              যাচাইকৃত: <span className="font-bold text-green-600">{uploads.filter(u => u.status === 'verified').length}</span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={() => navigate('/upload')}
              className="bg-green-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-green-700 transition-all duration-300 shadow-md hover:shadow-lg flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              নতুন আবেদন
            </button>
            
            <button 
              onClick={handleContact}
              className="flex items-center gap-2 border border-green-600 text-green-600 px-5 py-2.5 rounded-lg hover:bg-green-50 transition-colors font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              <span>যোগাযোগ</span>
            </button>
            
            <button 
              onClick={handleChangePassword}
              className="flex items-center gap-2 border border-green-600 text-green-600 px-5 py-2.5 rounded-lg hover:bg-green-50 transition-colors font-medium"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>পাসওয়ার্ড পরিবর্তন</span>
            </button>
            
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
      </div>

      <main className="container mx-auto px-4 py-2 flex-grow">
        {/* Uploads Table */}
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          {uploads.length === 0 ? (
            <div className="text-center py-16 bg-gray-50">
              <div className="text-6xl mb-4">📁</div>
              <h3 className="text-2xl font-bold text-gray-800 mb-3">এখনো কোনো আবেদন নেই</h3>
              <p className="text-gray-600 max-w-md mx-auto mb-6">
                "নতুন আবেদন" বাটনে ক্লিক করে আপনার প্রথম আবেদন জমা দিন
              </p>
              <button 
                onClick={() => navigate('/upload')}
                className="bg-green-600 text-white px-8 py-3 rounded-lg font-medium text-lg hover:bg-green-700 transition-all duration-300 shadow-md hover:shadow-lg inline-flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                নতুন আবেদন করুন
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">আবেদন নং</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">অবস্থা</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">নথি</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">জমা দেওয়ার তারিখ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">সর্বশেষ হালনাগাদ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">কার্যক্রম</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {uploads.map((upload) => {
                    const fileCount = Array.isArray(upload.file_paths) 
                      ? upload.file_paths.length 
                      : (upload.file_paths ? JSON.parse(upload.file_paths).length : 1);
                    
                    return (
                      <tr key={upload.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{upload.id}</td>
                        <td className="px-4 py-3">
                          {upload.status === 'pending' ? (
                            <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                              পেন্ডিং
                            </span>
                          ) : (
                            <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800 flex items-center gap-1">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              যাচাইকৃত
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-xs truncate">
                          <div className="flex items-center gap-2">
                            {upload.file_type === 'multi-image' ? (
                              <span className="text-blue-600 font-medium">🖼️ {fileCount}টি ইমেজ</span>
                            ) : upload.file_type === 'pdf' ? (
                              <span className="text-red-600 font-medium">📄 PDF</span>
                            ) : (
                              <span className="text-gray-700">{upload.original_filename}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {new Date(upload.created_at).toLocaleDateString('bn-BD')}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {upload.verified_at 
                            ? new Date(upload.verified_at).toLocaleDateString('bn-BD')
                            : upload.updated_at 
                              ? new Date(upload.updated_at).toLocaleDateString('bn-BD')
                              : 'না'}
                        </td>
                        <td className="px-4 py-3">
                          {upload.status === 'pending' ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button
                                onClick={() => handleViewUpload(upload)}
                                className="px-3 py-1 border border-blue-600 text-blue-700 text-xs font-medium rounded-full bg-blue-50 hover:bg-blue-100 transition-colors flex items-center gap-1"
                                title="ফাইল দেখুন"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                দেখুন
                              </button>
                              <button
                                onClick={() => triggerReplaceDialog(upload.id)}
                                className="px-3 py-1 border border-purple-600 text-purple-700 text-xs font-medium rounded-full bg-purple-50 hover:bg-purple-100 transition-colors flex items-center gap-1"
                                title="ফাইল প্রতিস্থাপন করুন"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                সম্পাদনা
                              </button>
                              <button
                                onClick={() => handleDeleteUpload(upload.id)}
                                className="px-3 py-1 border border-red-600 text-red-700 text-xs font-medium rounded-full bg-red-50 hover:bg-red-100 transition-colors flex items-center gap-1"
                                title="আবেদন মুছুন"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                মুছুন
                              </button>
                            </div>
                          ) : (
                            <a 
                              href={`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/uploads/${extractFilename(upload.file_path)}`} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-3 py-1 border border-green-600 text-green-700 text-xs font-medium rounded-full bg-green-50 hover:bg-green-100 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              ডাউনলোড
                            </a>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* View Upload Modal */}
        {viewingUpload && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
              <div className="p-5 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 01-3 3H1m8-9a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  আপলোড প্রিভিউ: আবেদন #{viewingUpload.id}
                </h3>
                <button 
                  onClick={() => setViewingUpload(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="বন্ধ করুন"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="p-6 max-h-[70vh] overflow-y-auto">
                {viewingUpload.file_type === 'pdf' ? (
                  <div className="text-center py-12">
                    <div className="text-6xl mb-4">📄</div>
                    <h4 className="text-xl font-bold text-gray-800 mb-2">PDF ফাইল</h4>
                    <p className="text-gray-600 mb-4">{viewingUpload.original_filename}</p>
                    <button
                      onClick={() => {
                        const filename = extractFilename(viewingUpload.file_path);
                        window.open(`${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/uploads/${filename}`, '_blank');
                      }}
                      className="bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 mx-auto"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 01-3 3H1m8-9a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      PDF দেখুন
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {getFileUrls(viewingUpload).map((file, index) => (
                      <div key={index} className="border rounded-lg overflow-hidden bg-gray-50 hover:shadow-lg transition-shadow">
                        <div className="aspect-square relative bg-gray-200">
                          <img 
                            src={file.url} 
                            alt={`Preview ${index + 1}`} 
                            className="w-full h-full object-contain p-2"
                            onError={(e) => {
                              e.currentTarget.onerror = null;
                              e.currentTarget.parentElement!.innerHTML = `
                                <div class="w-full h-full flex items-center justify-center bg-gray-100">
                                  <div class="text-center p-4">
                                    <div class="text-4xl mb-2">⚠️</div>
                                    <p class="text-gray-600 font-medium">ইমেজ লোড করতে ব্যর্থ</p>
                                  </div>
                                </div>
                              `;
                            }}
                          />
                        </div>
                        <div className="p-3">
                          <p className="text-xs font-medium text-gray-800 truncate" title={file.name}>
                            {file.name.length > 20 ? file.name.substring(0, 17) + '...' : file.name}
                          </p>
                          <a 
                            href={file.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="mt-2 inline-block w-full text-center bg-blue-50 text-blue-700 text-xs font-medium py-1.5 rounded hover:bg-blue-100 transition-colors"
                          >
                            ফুল সাইজে দেখুন
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end">
                <button
                  onClick={() => setViewingUpload(null)}
                  className="px-5 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                >
                  বন্ধ করুন
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Contact Modal */}
        {showContactModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    যোগাযোগের তথ্য
                  </h3>
                  <button 
                    onClick={() => setShowContactModal(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="space-y-4 mt-4">
                  <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <div>
                      <p className="font-medium text-gray-800">হেল্পলাইন নম্বর</p>
                      <p className="text-gray-600">১৬১২২ (সকাল ৯টা - রাত ৯টা)</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    <div>
                      <p className="font-medium text-gray-800">ইমেইল</p>
                      <p className="text-gray-600">support@gov.bd</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <div>
                      <p className="font-medium text-gray-800">ঠিকানা</p>
                      <p className="text-gray-600">জাতীয় ভবন, বাংলাদেশ সচিবালয়, ঢাকা-১০০০</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="font-medium text-gray-800">কার্যালয় সময়</p>
                      <p className="text-gray-600">সকাল ৯:০০ - বিকাল ৫:০০ (সোমবার থেকে বৃহস্পতিবার)</p>
                      <p className="text-gray-600">সকাল ৯:০০ - দুপুর ১:৩০ (শুক্রবার)</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end">
                  <button
                    onClick={() => setShowContactModal(false)}
                    className="px-5 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
                  >
                    বন্ধ করুন
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Hidden file inputs */}
        <input
          type="file"
          ref={replaceFileInputRef}
          className="hidden"
          accept="application/pdf,image/png,image/jpeg"
          multiple
          onChange={handleReplaceFileSelect}
        />
        <input
          type="file"
          ref={uploadInputRef}
          className="hidden"
          accept="application/pdf,image/png,image/jpeg"
          multiple
          onChange={handleMultipleUpload}
        />
      </main>

      <Footer />
    </div>
  );
};

export default UserDashboard;