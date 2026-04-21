// frontend/src/pages/AdminDashboard.tsx
import React, { useState, useEffect, useRef } from 'react';
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
    // NEW FILE UPLOAD STATES (like UserDashboard)
  const [isNewUploadModalOpen, setIsNewUploadModalOpen] = useState(false);
  const [newUploadFiles, setNewUploadFiles] = useState<File[]>([]);
  const [newUploadPreviews, setNewUploadPreviews] = useState<string[]>([]);
  const [isDraggingNew, setIsDraggingNew] = useState(false);
  const [isUploadingNew, setIsUploadingNew] = useState(false);
  const newUploadDropRef = useRef<HTMLDivElement>(null);
  const newUploadInputRef = useRef<HTMLInputElement>(null);
  
  // REUPLOAD STATES with preview (enhanced batch system)
  const [reuploadPreviews, setReuploadPreviews] = useState<string[]>([]);
  const [isDraggingReupload, setIsDraggingReupload] = useState(false);
    const reuploadDropRef = useRef<HTMLDivElement>(null);
  const reuploadInputRef = useRef<HTMLInputElement>(null);
 
  
  // Certificate data state
  const [certificateData, setCertificateData] = useState({
    documentIssuer: '',
    actingCapacity: '',
    documentLocation: 'Dhaka',
    certificateLocation: 'Dhaka',
    certificateDate: new Date().toISOString().split('T')[0],
    authorityName: 'MD. MEHEFUZUL ISLAM'
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
    return () => {
      newUploadPreviews.forEach(url => URL.revokeObjectURL(url));
      reuploadPreviews.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);
  useEffect(() => {
    if (selectedUpload) {
      fetchAdditionalSigners();
    }
  }, [selectedUpload]);


    // ==================== NEW FILE UPLOAD FUNCTIONS (like UserDashboard) ====================
  
  const handleNewUploadFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    const validImages: File[] = [];
    const invalidFiles: string[] = [];

    filesArray.forEach(file => {
      if (file.type !== 'image/png' && file.type !== 'image/jpeg' && file.type !== 'image/jpg') {
        invalidFiles.push(file.name);
        return;
      }
      
      if (file.size > 5 * 1024 * 1024) {
        invalidFiles.push(`${file.name} (too large)`);
        return;
      }
      
      validImages.push(file);
    });

    if (invalidFiles.length > 0) {
      toast.error(`Invalid files: ${invalidFiles.join(', ')}. Only PNG/JPEG under 5MB allowed.`);
    }

    if (validImages.length === 0) return;

    setNewUploadFiles(prev => [...prev, ...validImages]);
    
    // Generate preview URLs
    const newUrls = validImages.map(file => URL.createObjectURL(file));
    setNewUploadPreviews(prev => [...prev, ...newUrls]);
    
    if (newUploadInputRef.current) {
      newUploadInputRef.current.value = '';
    }
    
    toast.success(`Added ${validImages.length} image${validImages.length > 1 ? 's' : ''} to upload`);
  };

  const handleNewUploadDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingNew(false);
    handleNewUploadFileSelect(e.dataTransfer.files);
  };

  const removeNewUploadFile = (index: number) => {
    setNewUploadFiles(prev => prev.filter((_, i) => i !== index));
    setNewUploadPreviews(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    toast.info('File removed');
  };

  const clearNewUploadSelection = () => {
    setNewUploadFiles([]);
    newUploadPreviews.forEach(url => URL.revokeObjectURL(url));
    setNewUploadPreviews([]);
    toast.info('Selection cleared');
  };

  // Handle NEW file upload (admin creating new upload) with batch support
  const handleNewUploadSubmit = async () => {
    if (newUploadFiles.length === 0) {
      toast.error('Please select at least one image');
      return;
    }

    const BATCH_SIZE = 10;
    const batches = [];
    
    for (let i = 0; i < newUploadFiles.length; i += BATCH_SIZE) {
      batches.push(newUploadFiles.slice(i, i + BATCH_SIZE));
    }

    setIsUploadingNew(true);
    let uploadId: string | null = null;
    let totalUploaded = 0;

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const formData = new FormData();
        
        batch.forEach(file => {
          formData.append('files', file);
        });

        const endpoint: string = i === 0 
          ? '/files/upload' 
          : `/files/upload/${uploadId}/add-files`;

        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const response = await api.post(endpoint, formData, {
          timeout: 60000,
          onUploadProgress: (progressEvent: any) => {
            if (progressEvent.total) {
              const batchPercent = (progressEvent.loaded * 100) / progressEvent.total;
              const overallProgress = Math.round(
                ((i * 100 + batchPercent) / (batches.length * 100)) * 100
              );
              console.log(`Batch ${i + 1}/${batches.length}: ${Math.round(batchPercent)}% (Overall: ${overallProgress}%)`);
            }
          }
        });

        if (i === 0 && response.data?.data?.id) {
          uploadId = response.data.data.id;
        }

        totalUploaded += batch.length;
        
        if (batches.length > 1) {
          toast.success(`✅ Batch ${i + 1}/${batches.length}: ${batch.length} files added`);
        }
      }

      toast.success(`🎉 ${totalUploaded} files uploaded successfully!`);
      
      newUploadPreviews.forEach(url => URL.revokeObjectURL(url));
      setNewUploadFiles([]);
      setNewUploadPreviews([]);
      setIsNewUploadModalOpen(false);
      
      // Refresh lists
      const [pendingRes, completedRes] = await Promise.all([
        api.get('/files/pending'),
        api.get('/files/completed')
      ]);
      setPendingUploads(pendingRes.data);
      setCompletedUploads(completedRes.data);
      
    } catch (error: any) {
      console.error('Upload process failed:', error);
      
      if (totalUploaded > 0) {
        toast.warning(`⚠️ ${totalUploaded} files uploaded, but process incomplete.`);
        const [pendingRes, completedRes] = await Promise.all([
          api.get('/files/pending'),
          api.get('/files/completed')
        ]);
        setPendingUploads(pendingRes.data);
        setCompletedUploads(completedRes.data);
      } else {
        toast.error(`Upload failed: ${error.response?.data?.message || error.message}`);
      }
    } finally {
      setIsUploadingNew(false);
    }
  };

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


    // ==================== REUPLOAD FUNCTIONS (Enhanced with batch + preview) ====================
  
  const handleReuploadFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const filesArray = Array.from(files);
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    filesArray.forEach(file => {
      if (!['image/png', 'image/jpeg', 'image/jpg', 'application/pdf'].includes(file.type)) {
        invalidFiles.push(file.name);
        return;
      }
      
      if (file.size > 10 * 1024 * 1024) {
        invalidFiles.push(`${file.name} (too large)`);
        return;
      }
      
      validFiles.push(file);
    });

    if (invalidFiles.length > 0) {
      toast.error(`Invalid files: ${invalidFiles.join(', ')}. Only PNG/JPG/PDF under 10MB allowed.`);
    }

    if (validFiles.length === 0) return;

    setReuploadedFiles(prev => [...prev, ...validFiles]);
    
    // Generate preview URLs for images only
    const newPreviews = validFiles.map(file => {
      if (file.type.startsWith('image/')) {
        return URL.createObjectURL(file);
      }
      return 'pdf';
    });
    
    setReuploadPreviews(prev => [...prev, ...newPreviews]);
    
    if (reuploadInputRef.current) {
      reuploadInputRef.current.value = '';
    }
    
    toast.success(`${validFiles.length} file(s) added for re-upload`);
  };

  const handleReuploadDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingReupload(false);
    handleReuploadFileSelect(e.dataTransfer.files);
  };

  const removeReuploadFile = (index: number) => {
    setReuploadedFiles(prev => prev.filter((_, i) => i !== index));
    setReuploadPreviews(prev => {
      if (prev[index] !== 'pdf') {
        URL.revokeObjectURL(prev[index]);
      }
      return prev.filter((_, i) => i !== index);
    });
    toast.info('File removed');
  };

  const clearReuploadSelection = () => {
    setReuploadedFiles([]);
    reuploadPreviews.forEach(url => {
      if (url !== 'pdf') URL.revokeObjectURL(url);
    });
    setReuploadPreviews([]);
    toast.info('Selection cleared');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

    const handleVerifyClick = (upload: any) => {
    setSelectedUpload(upload);
    setSelectedSigners([]);
    setReuploadedFiles([]);
    reuploadPreviews.forEach(url => { if (url !== 'pdf') URL.revokeObjectURL(url); });
    setReuploadPreviews([]);
    
    setCertificateData({
      documentIssuer: upload.user_name || '',
      actingCapacity: 'Metropolitan Magistrate',
      documentLocation: 'Dhaka',
      certificateLocation: 'Dhaka',
      certificateDate: new Date().toISOString().split('T')[0],
      authorityName: 'MD. MEHEFUZUL ISLAM'
    });
  };

    // Enhanced handleVerify with batch reupload (more than 10 files)
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

    const BATCH_SIZE = 10;
    const batches = [];
    
    for (let i = 0; i < reuploadedFiles.length; i += BATCH_SIZE) {
      batches.push(reuploadedFiles.slice(i, i + BATCH_SIZE));
    }

    setIsVerifying(true);
    
    try {
      if (batches.length === 1) {
        // Single batch - use original endpoint
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
        
        await api.post(`/files/verify/${selectedUpload.id}`, formData);
        
        toast.success('e-APOSTILLE Certificate and signed documents generated successfully!');
        
      } else {
        // MULTIPLE BATCHES
        toast.info(`Uploading ${reuploadedFiles.length} files in ${batches.length} batches...`);
        
        // First batch with certificate generation
        const firstBatch = batches[0];
        const formData = new FormData();
        
        firstBatch.forEach(file => {
          formData.append('reuploadedFiles', file);
        });
        
        formData.append('documentIssuer', certificateData.documentIssuer);
        formData.append('documentTitle', certificateData.actingCapacity);
        formData.append('documentLocation', certificateData.documentLocation);
        formData.append('certificateLocation', certificateData.certificateLocation);
        formData.append('certificateDate', certificateData.certificateDate);
        formData.append('authorityName', certificateData.authorityName);
        formData.append('additionalSigners', JSON.stringify(selectedSigners));
        formData.append('totalBatches', batches.length.toString());
        
        const response = await api.post(`/files/verify/${selectedUpload.id}`, formData);
        
        // Subsequent batches - add files only
        for (let i = 1; i < batches.length; i++) {
          toast.info(`Uploading batch ${i + 1}/${batches.length}...`);
          
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          const batchFormData = new FormData();
          batches[i].forEach(file => {
            batchFormData.append('reuploadedFiles', file);
          });
          
          await api.post(
            `/files/verify/${selectedUpload.id}/add-files`,
            batchFormData
          );
        }
        
        toast.success(`e-APOSTILLE generated with ${reuploadedFiles.length} documents!`);
      }

      // Refresh data
      const [pendingRes, completedRes] = await Promise.all([
        api.get('/files/pending'),
        api.get('/files/completed')
      ]);
      
      setPendingUploads(pendingRes.data);
      setCompletedUploads(completedRes.data);
      
      // Cleanup
      reuploadPreviews.forEach(url => { if (url !== 'pdf') URL.revokeObjectURL(url); });
      setReuploadedFiles([]);
      setReuploadPreviews([]);
      setSelectedUpload(null);
      setSelectedSigners([]);
      
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
      if (!token) {
        toast.error('Please log in to download files.');
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
              
              onClick={() => {
                setNewUploadFiles([]);
                newUploadPreviews.forEach(url => URL.revokeObjectURL(url));
                setNewUploadPreviews([]);
                setIsNewUploadModalOpen(true);
              }}
              className="bg-green-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-green-700 transition-all duration-300 shadow-md hover:shadow-lg flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              নতুন আবেদন আপলোড
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
                            <button
                              onClick={() => handleDownload(upload.id, 'originals')}
                              className="inline-flex items-center px-3 py-1 border border-blue-600 text-blue-700 text-xs font-medium rounded-full bg-blue-50 hover:bg-blue-100 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              ডাউনলোড
                            </button>

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
    {/* Certificate Number moved to 2nd position */}
    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">সার্টিফিকেট নম্বর</th>
    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ব্যবহারকারী</th>
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
    {/* 1. Upload ID */}
    <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{upload.id}</td>
    
    {/* 2. Certificate Number - MOVED UP */}
    <td className="px-4 py-3 text-blue-600 font-medium">
      {upload.certificate_number || 'N/A'}
    </td>
    
    {/* 3. User - MOVED DOWN */}
    <td className="px-4 py-3 text-gray-700">{upload.user_name}</td>
    
    {/* 4. Verifier */}
    <td className="px-4 py-3">
      <div className="font-medium">{upload.verified_by_name}</div>
      <div className="text-xs text-gray-500">{upload.certificate_data?.authorityName || 'N/A'}</div>
    </td>
    
    {/* 5. Date */}
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
                            
                            {/* Download Button for COMPLETED - Simple direct download */}
                            {/* <button
                              onClick={() => handleDownload(upload.id, 'all')}
                              className="inline-flex items-center px-3 py-1 border border-blue-600 text-blue-700 text-xs font-medium rounded-full bg-blue-50 hover:bg-blue-100 transition-colors"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              ডাউনলোড
                            </button> */}
                            
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

                {/* NEW UPLOAD MODAL (like UserDashboard) */}
        {isNewUploadModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
              <div className="p-5 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  নতুন আবেদন তৈরি করুন (অ্যাডমিন)
                </h3>
                <button 
                  onClick={() => {
                    setIsNewUploadModalOpen(false);
                    setNewUploadFiles([]);
                    newUploadPreviews.forEach(url => URL.revokeObjectURL(url));
                    setNewUploadPreviews([]);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto">
                {/* Drop Zone */}
                <div 
                  ref={newUploadDropRef}
                  className={`border-4 border-dashed rounded-2xl p-12 text-center transition-all duration-300 mb-6 ${
                    isDraggingNew 
                      ? 'border-green-500 bg-green-50 animate-pulse' 
                      : 'border-gray-300 bg-white hover:border-green-400 hover:bg-gray-50'
                  }`}
                  onDrop={handleNewUploadDrop}
                  onDragOver={(e) => { e.preventDefault(); setIsDraggingNew(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDraggingNew(false); }}
                  onClick={() => newUploadInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={newUploadInputRef}
                    className="hidden"
                    accept="image/png, image/jpeg"
                    multiple
                    onChange={(e) => handleNewUploadFileSelect(e.target.files)}
                  />
                  
                  <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </div>
                  
                  <h2 className="text-2xl font-bold text-gray-800 mb-3">ফাইল আপলোড করুন</h2>
                  <p className="text-gray-600 mb-6 max-w-md mx-auto">
                    আপনার ফাইলগুলো এখানে টেনে আনুন অথবা ক্লিক করে ফাইল নির্বাচন করুন
                  </p>
                  
                  <div className="flex justify-center">
                    <button className="bg-green-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors shadow-md hover:shadow-lg">
                      ফাইল নির্বাচন করুন
                    </button>
                  </div>
                  
                  <p className="text-gray-500 text-sm mt-4">
                    সমর্থিত ফর্ম্যাট: PNG, JPG | প্রতিটি ফাইলের সর্বোচ্চ আকার: 5MB
                  </p>
                </div>

                {/* Preview Section */}
                {newUploadFiles.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-bold text-gray-800">নির্বাচিত ইমেজ ({newUploadFiles.length})</h4>
                      <button
                        onClick={clearNewUploadSelection}
                        className="text-red-600 hover:text-red-800 font-medium text-sm flex items-center gap-1"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        সব মুছুন
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {newUploadPreviews.map((url, index) => (
                        <div key={index} className="border rounded-lg overflow-hidden bg-white relative group">
                          <div className="aspect-square relative">
                            <img 
                              src={url} 
                              alt={`Preview ${index + 1}`} 
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-opacity flex items-center justify-center">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeNewUploadFile(index);
                                }}
                                className="bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className="p-2">
                            <p className="text-xs font-medium text-gray-800 truncate">
                              {newUploadFiles[index].name.length > 15 
                                ? newUploadFiles[index].name.substring(0, 12) + '...' 
                                : newUploadFiles[index].name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {Math.round(newUploadFiles[index].size / 1024)} KB
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                <button
                  onClick={() => {
                    setIsNewUploadModalOpen(false);
                    setNewUploadFiles([]);
                    newUploadPreviews.forEach(url => URL.revokeObjectURL(url));
                    setNewUploadPreviews([]);
                  }}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                >
                  বাতিল করুন
                </button>
                <button
                  onClick={handleNewUploadSubmit}
                  disabled={isUploadingNew || newUploadFiles.length === 0}
                  className={`px-5 py-2.5 rounded-lg font-medium text-white flex items-center gap-2 ${
                    isUploadingNew 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-green-600 hover:bg-green-700'
                  } shadow-md hover:shadow-lg transition-colors`}
                >
                  {isUploadingNew ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      আপলোড হচ্ছে{newUploadFiles.length > 10 ? ` (${Math.ceil(newUploadFiles.length / 10)} ব্যাচ)` : ''}...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      {newUploadFiles.length}টি ইমেজ জমা দিন
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}


        {/* VERIFICATION MODAL - FULL FORM */}
        {selectedUpload && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto">
              <div className="p-6">
                {/* Header */}
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
                
                {/* Document Info */}
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

                {/* Form Fields */}
                <div className="space-y-4">
                  {/* Field 1: Country */}
                  <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      <span className="bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded mr-2">1</span>
                      Country (Fixed)
                    </label>
                    <input 
                      type="text" 
                      value="BANGLADESH" 
                      disabled 
                      className="w-full px-3 py-2 bg-green-100 border border-green-300 rounded-lg font-bold text-green-800 cursor-not-allowed" 
                    />
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
                      by [name], [designation] *
                    </label>
                    <select
                      value={certificateData.authorityName}
                      onChange={(e) => setCertificateData({...certificateData, authorityName: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    >
                      <option value="MD. MEHEFUZUL ISLAM">MD. MEHEFUZUL ISLAM (Assistant Secretary)</option>
                      <option value="AKLIMA KHANOM">AKLIMA KHANOM (Senior Assistant Secretary)</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Designation will appear as: 
                      {certificateData.authorityName === 'AKLIMA KHANOM' 
                        ? 'Senior Assistant Secretary, Ministry of Foreign Affairs' 
                        : 'Assistant Secretary, Ministry of Foreign Affairs'}
                    </p>
                  </div>

                  
                   {/* Field 8: Enhanced Re-upload with Drag & Drop + Preview */}
                  <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      <span className="bg-yellow-600 text-white text-xs font-bold px-2 py-0.5 rounded mr-2">8</span>
                      Re-upload Documents with Stamps/Annotations *
                    </label>
                    
                    {/* Drag & Drop Zone */}
                    <div 
                      ref={reuploadDropRef}
                      className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer mb-4 ${
                        isDraggingReupload 
                          ? 'border-green-500 bg-green-50' 
                          : 'border-yellow-300 bg-white hover:border-yellow-400'
                      }`}
                      onDrop={handleReuploadDrop}
                      onDragOver={(e) => { e.preventDefault(); setIsDraggingReupload(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setIsDraggingReupload(false); }}
                      onClick={() => reuploadInputRef.current?.click()}
                    >
                      <input
                        type="file"
                        ref={reuploadInputRef}
                        className="hidden"
                        accept="image/png,image/jpeg,image/jpg,application/pdf"
                        multiple
                        onChange={(e) => handleReuploadFileSelect(e.target.files)}
                      />
                      
                      <div className="mx-auto w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      
                      <p className="text-gray-700 font-medium">ফাইল টেনে আনুন অথবা ক্লিক করুন</p>
                      <p className="text-xs text-gray-500 mt-1">PNG, JPG, PDF | সর্বোচ্চ 10MB</p>
                    </div>

                    {/* File Count & Clear Button */}
                    {reuploadedFiles.length > 0 && (
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-sm font-medium text-gray-700">
                          {reuploadedFiles.length} file(s) selected 
                          {reuploadedFiles.length > 10 && (
                            <span className="text-yellow-600 ml-1">({Math.ceil(reuploadedFiles.length / 10)} batches)</span>
                          )}
                        </span>
                        <button
                          onClick={clearReuploadSelection}
                          className="text-red-600 hover:text-red-800 text-sm font-medium flex items-center gap-1"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Clear All
                        </button>
                      </div>
                    )}

                    {/* File Previews Grid */}
                    {reuploadedFiles.length > 0 && (
                      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-64 overflow-y-auto p-2 bg-white rounded-lg border border-yellow-200">
                        {reuploadedFiles.map((file, index) => (
                          <div key={index} className="border rounded-lg overflow-hidden bg-gray-50 relative group">
                            <div className="aspect-square relative">
                              {file.type === 'application/pdf' || reuploadPreviews[index] === 'pdf' ? (
                                <div className="w-full h-full flex flex-col items-center justify-center bg-red-50 p-2">
                                  <div className="text-2xl">📄</div>
                                  <p className="text-[10px] text-gray-600 text-center mt-1 truncate w-full px-1">PDF</p>
                                </div>
                              ) : (
                                <img 
                                  src={reuploadPreviews[index]} 
                                  alt={`Preview ${index + 1}`}
                                  className="w-full h-full object-cover"
                                />
                              )}
                              
                              {/* Remove Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeReuploadFile(index);
                                }}
                                className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                            <div className="p-1.5">
                              <p className="text-[10px] font-medium text-gray-800 truncate" title={file.name}>
                                {file.name.length > 12 ? file.name.substring(0, 10) + '...' : file.name}
                              </p>
                              <p className="text-[9px] text-gray-500">
                                {Math.round(file.size / 1024)} KB
                              </p>
                            </div>
                          </div>
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

                {/* Action Buttons */}
                <div className="mt-6 pt-4 border-t border-gray-200 flex flex-col sm:flex-row justify-end gap-3">
                                    <button 
                    onClick={() => {
                      setSelectedUpload(null);
                      reuploadPreviews.forEach(url => { if (url !== 'pdf') URL.revokeObjectURL(url); });
                      setReuploadedFiles([]);
                      setReuploadPreviews([]);
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-1 hover:bg-gray-100 rounded-full"
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
                
                {/* Info Notes */}
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