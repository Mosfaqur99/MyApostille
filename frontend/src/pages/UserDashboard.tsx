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
  const [editingUpload, setEditingUpload] = useState<any>(null);
  const [viewingUpload, setViewingUpload] = useState<any>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  // Add these AFTER your existing state declarations
const [currentFiles, setCurrentFiles] = useState<any[]>([]);
const [newFiles, setNewFiles] = useState<File[]>([]);
const [newFilePreviews, setNewFilePreviews] = useState<string[]>([]);
const [isDraggingNew, setIsDraggingNew] = useState(false);
const [filesToRemove, setFilesToRemove] = useState<number[]>([]);
const [isSaving, setIsSaving] = useState(false);
const newFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchUploads();
    const interval = setInterval(fetchUploads, 30000);
    return () => clearInterval(interval);
  }, []);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  // Initialize current files when edit modal opens
useEffect(() => {
  if (editingUpload) {
    // Initialize current files from editingUpload
    const files = getFileUrls(editingUpload).map((file, index) => ({
      url: file.url,
      name: file.name,
      type: editingUpload.file_type || 'image',
      size: editingUpload.file_size || 0,
      isExisting: true,
      originalIndex: index
    }));
    setCurrentFiles(files);
    setNewFiles([]);
    setNewFilePreviews([]);
    setFilesToRemove([]);
  }
}, [editingUpload]);

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

  // Handle new files selection in edit modal
const handleNewFilesSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
  if (e.target.files) {
    const filesArray = Array.from(e.target.files);
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];
    
    filesArray.forEach(file => {
      if (!['image/png', 'image/jpeg', 'application/pdf'].includes(file.type)) {
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
      toast.error(`অবৈধ ফাইল: ${invalidFiles.join(', ')}`);
    }
    
    if (validFiles.length > 0) {
      setNewFiles(prev => [...prev, ...validFiles]);
      
      // Generate previews
      const previews = validFiles.map(file => URL.createObjectURL(file));
      setNewFilePreviews(prev => [...prev, ...previews]);
      
      toast.success(`${validFiles.length}টি নতুন ফাইল যোগ করা হয়েছে`);
    }
    
    // Reset input
    if (newFileInputRef.current) newFileInputRef.current.value = '';
  }
};

// Handle drag & drop for new files
const handleNewFilesDrop = (e: React.DragEvent<HTMLDivElement>) => {
  e.preventDefault();
  setIsDraggingNew(false);
  if (e.dataTransfer.files) {
    const event = {
      target: { files: e.dataTransfer.files }
    } as unknown as React.ChangeEvent<HTMLInputElement>;
    handleNewFilesSelect(event);
  }
};

// Remove new file from selection
const removeNewFile = (index: number) => {
  setNewFiles(prev => prev.filter((_, i) => i !== index));
  setNewFilePreviews(prev => {
    URL.revokeObjectURL(prev[index]);
    return prev.filter((_, i) => i !== index);
  });
  toast.info('ফাইল মুছে ফেলা হয়েছে');
};

// Remove current file (frontend only - will be handled on save)
const removeCurrentFile = (index: number) => {
  setCurrentFiles(prev => prev.filter((_, i) => i !== index));
  toast.info('ফাইল মুছে ফেলা হয়েছে (সেভ করার পর চূড়ান্ত হবে)');
};
const handleSavePartialChanges = async () => {
  if (filesToRemove.length === 0 && newFiles.length === 0) {
    toast.error('অন্তত একটি পরিবর্তন করুন (ফাইল মুছুন বা নতুন ফাইল যোগ করুন)');
    return;
  }
  
  // Prepare request body
  const requestBody = {
    removeFiles: filesToRemove,
    addFiles: []
  };
  
  // Create FormData for new files
  const formData = new FormData();
  newFiles.forEach(file => {
    formData.append('files', file);
  });
  
  // Add request body as JSON
  formData.append('operations', JSON.stringify(requestBody));
  
  setIsSaving(true);
  try {
    // Use PATCH instead of PUT for partial updates
    const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    const response = await axios.patch(
      `${API_BASE_URL}/api/files/edit/${editingUpload.id}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' }
      }
    );
    
    toast.success(response.data.message);
    fetchUploads();
    setEditingUpload(null);
    setCurrentFiles([]);
    setNewFiles([]);
    setNewFilePreviews([]);
    setFilesToRemove([]);
  } catch (error: any) {
    console.error('Partial update failed', error);
    toast.error(error.response?.data?.message || 'পরিবর্তন সংরক্ষণ ব্যর্থ হয়েছে');
  } finally {
    setIsSaving(false);
  }
};
// Save all changes
const handleSaveEditChanges = async () => {
  if (currentFiles.length === 0 && newFiles.length === 0) {
    toast.error('অন্তত একটি ফাইল রাখুন');
    return;
  }
  
  // CRITICAL: Use absolute URL for API calls
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  
  const formData = new FormData();
  
  // Add new files
  newFiles.forEach(file => {
    formData.append('files', file);
  });
  
  setIsSaving(true);
  try {
    // CRITICAL: Use absolute URL to avoid 400 errors
    const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    await axios.put(
      `${API_BASE_URL}/api/files/replace/${editingUpload.id}`, 
      formData, 
      {
        headers: { 'Content-Type': 'multipart/form-data' }
      }
    );
    
    toast.success('ফাইলসমূহ সফলভাবে আপডেট করা হয়েছে!');
    fetchUploads();
    setEditingUpload(null);
    setCurrentFiles([]);
    setNewFiles([]);
    setNewFilePreviews([]);
  } catch (error: any) {
    console.error('Update failed', error);
    
    // Handle specific backend errors
    if (error.response && error.response.status === 400) {
      toast.error('অবৈধ ফাইল ফর্ম্যাট বা আকার। দয়া করে আপনার ফাইল চেক করুন।');
    } else {
      toast.error(error.response?.data?.message || 'আপডেট ব্যর্থ হয়েছে');
    }
  } finally {
    setIsSaving(false);
  }
};

  // Handle file selection for NEW upload modal
  const handleFileSelect = (files: FileList | null) => {
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

    setSelectedFiles(prev => [...prev, ...validImages]);
    
    // Generate preview URLs
    const newUrls = validImages.map(file => URL.createObjectURL(file));
    setPreviewUrls(prev => [...prev, ...newUrls]);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    toast.success(`Added ${validImages.length} image${validImages.length > 1 ? 's' : ''} to upload`);
  };

  // Handle file drop for NEW upload modal
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  // Handle file input change for NEW upload modal
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files);
  };

  // Remove specific file from NEW upload selection
  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => {
      URL.revokeObjectURL(prev[index]);
      return prev.filter((_, i) => i !== index);
    });
    toast.info('File removed');
  };

  // Clear all selected files in NEW upload modal
  const clearSelection = () => {
    setSelectedFiles([]);
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setPreviewUrls([]);
    toast.info('Selection cleared');
  };

  // Handle NEW upload
  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast.error('Please select at least one image');
      return;
    }

    const formData = new FormData();
    selectedFiles.forEach(file => {
      formData.append('files', file);
    });

    setIsUploading(true);
    try {
      await axios.post('/api/files/upload', formData, {
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            console.log(`Upload progress: ${percentCompleted}%`);
          }
        }
      });
      
      toast.success(`${selectedFiles.length} image${selectedFiles.length > 1 ? 's' : ''} uploaded successfully!`);
      
      // Clear selection and close modal
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      setSelectedFiles([]);
      setPreviewUrls([]);
      setIsUploadModalOpen(false);
      
      // Refresh uploads list
      fetchUploads();
    } catch (error: any) {
      console.error('Upload failed', error);
      toast.error(error.response?.data?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle drag events for NEW upload modal
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isDragging) {
      setIsDragging(true);
      gsap.to(dropZoneRef.current, { scale: 1.03, duration: 0.3, ease: 'power1.out' });
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    gsap.to(dropZoneRef.current, { scale: 1, duration: 0.3, ease: 'power1.out' });
  };

  // Handle EDIT upload - Open modal with current files
  const handleEditUpload = async (upload: any) => {
    // For editing, we need to show current files
    // Since we can't re-upload existing files without downloading them,
    // we'll show them for viewing and allow complete replacement
    setEditingUpload(upload);
    
    // Clear previous selection
    setSelectedFiles([]);
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setPreviewUrls([]);
  };

  // Handle REPLACE files in edit modal
  const handleReplaceFiles = async (files: FileList | null) => {
    if (!files || files.length === 0 || !editingUpload) return;

    const filesArray = Array.from(files);
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];
    
    filesArray.forEach(file => {
      const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
      if (!validTypes.includes(file.type)) {
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
      toast.error(`Invalid files: ${invalidFiles.join(', ')}`);
      return;
    }

    if (validFiles.length === 0) return;

    const formData = new FormData();
    validFiles.forEach(file => {
      formData.append('files', file);
    });

    try {
      await axios.put(`/api/files/replace/${editingUpload.id}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      const fileCount = validFiles.length;
      toast.success(`${fileCount} file${fileCount > 1 ? 's' : ''} replaced successfully!`);
      fetchUploads();
      setEditingUpload(null);
      setSelectedFiles([]);
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      setPreviewUrls([]);
    } catch (error: any) {
      console.error('Replace failed', error);
      toast.error(error.response?.data?.message || 'ফাইল প্রতিস্থাপন ব্যর্থ হয়েছে');
      setEditingUpload(null);
    }
  };

  // Handle REPLACE file selection in edit modal
  const handleReplaceFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (editingUpload && e.target.files) {
      handleReplaceFiles(e.target.files);
      e.target.value = '';
    }
  };

  // Trigger REPLACE dialog in edit modal
  const triggerReplaceDialog = () => {
    setTimeout(() => {
      replaceFileInputRef.current?.click();
    }, 0);
  };

  // Handle delete upload
  // const handleDeleteUpload = async (uploadId: number) => {
  //   if (!window.confirm('আপনি কি নিশ্চিত আপনি এই আবেদনটি মুছে ফেলতে চান? এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।')) {
  //     return;
  //   }

  //   try {
  //     await axios.delete(`/api/files/${uploadId}`);
  //     toast.success('আবেদন সফলভাবে মুছে ফেলা হয়েছে!');
  //     fetchUploads();
  //   } catch (error: any) {
  //     console.error('Delete failed', error);
  //     toast.error(error.response?.data?.message || 'আবেদন মোছা ব্যর্থ হয়েছে');
  //   }
  // };

  // Handle view upload
  const handleViewUpload = (upload: any) => {
    if (upload.file_type === 'pdf') {
      const filename = extractFilename(upload.file_path);
      const pdfUrl = `${process.env.REACT_APP_API_URL || 'http://localhost:5000'}/uploads/${filename}`;
      window.open(pdfUrl, '_blank');
    } else {
      setViewingUpload(upload);
    }
  };

  // Get file URLs for viewing
 // REPLACE the existing getFileUrls function with this
const getFileUrls = (upload: any) => {
  if (!upload) return [];
  
  let files: any[] = [];
  
  if (upload.file_paths && Array.isArray(upload.file_paths)) {
    files = upload.file_paths;
  } else if (upload.file_path) {
    files = [{ path: upload.file_path, original_name: upload.original_filename }];
  }
  
  // CRITICAL: Use absolute URL with proper protocol
  const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  
  return files.map(file => {
    const filename = extractFilename(file.path || file);
    // Ensure URL starts with http/https
    const cleanUrl = filename.startsWith('http') 
      ? filename 
      : `${API_BASE_URL}/uploads/${encodeURIComponent(filename)}`;
    
    return {
      url: cleanUrl,
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
            {/* FIXED: New Application button now opens modal */}
            <button 
  onClick={() => {
    // Clear any edit state first
    setEditingUpload(null);
    setSelectedFiles([]);
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setPreviewUrls([]);
    // Open upload modal
    setIsUploadModalOpen(true);
  }}
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
                onClick={() => setIsUploadModalOpen(true)}
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
                              {/* FIXED: Edit button now opens modal with current files */}
                              <button
                                onClick={() => handleEditUpload(upload)}
                                className="px-3 py-1 border border-purple-600 text-purple-700 text-xs font-medium rounded-full bg-purple-50 hover:bg-purple-100 transition-colors flex items-center gap-1"
                                title="ফাইল সম্পাদনা করুন"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                সম্পাদনা
                              </button>
                              {/* <button
                                onClick={() => handleDeleteUpload(upload.id)}
                                className="px-3 py-1 border border-red-600 text-red-700 text-xs font-medium rounded-full bg-red-50 hover:bg-red-100 transition-colors flex items-center gap-1"
                                title="আবেদন মুছুন"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                মুছুন
                              </button> */}
                            </div>
                          ) : (
                            <button
  onClick={() => navigate(`/verify/${upload.certificate_number}`)}
  className="inline-flex items-center px-3 py-1 border border-green-600 text-green-700 text-xs font-medium rounded-full bg-green-50 hover:bg-green-100 transition-colors"
>
  দেখুন ও ডাউনলোড
</button>
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

        {/* NEW UPLOAD MODAL - FIXED BUTTON */}
        {isUploadModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-auto">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
              <div className="p-5 border-b border-gray-200 flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  নতুন আবেদন তৈরি করুন
                </h3>
                <button 
                  onClick={() => {
                    setIsUploadModalOpen(false);
                    setSelectedFiles([]);
                    previewUrls.forEach(url => URL.revokeObjectURL(url));
                    setPreviewUrls([]);
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="বন্ধ করুন"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto">
                {/* Drop Zone */}
                <div 
                  ref={dropZoneRef}
                  className={`border-4 border-dashed rounded-2xl p-12 text-center transition-all duration-300 mb-6 ${
                    isDragging 
                      ? 'border-green-500 bg-green-50 animate-pulse' 
                      : 'border-gray-300 bg-white hover:border-green-400 hover:bg-gray-50'
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/png, image/jpeg"
                    multiple
                    onChange={handleFileInputChange}
                    onClick={(e) => (e.target as HTMLInputElement).value = ''}
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
                    <button className="bg-green-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors shadow-md hover:shadow-lg transform hover:-translate-y-1">
                      ফাইল নির্বাচন করুন
                    </button>
                  </div>
                  
                  <p className="text-gray-500 text-sm mt-4">
                    সমর্থিত ফর্ম্যাট: PNG, JPG | প্রতিটি ফাইলের সর্বোচ্চ আকার: 5MB
                  </p>
                </div>

                {/* Preview Section */}
                {selectedFiles.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="font-bold text-gray-800">নির্বাচিত ইমেজ ({selectedFiles.length})</h4>
                      <button
                        onClick={clearSelection}
                        className="text-red-600 hover:text-red-800 font-medium text-sm flex items-center gap-1"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        সব মুছুন
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                      {previewUrls.map((url, index) => (
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
                                  removeFile(index);
                                }}
                                className="bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                title="Remove file"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className="p-2">
                            <p className="text-xs font-medium text-gray-800 truncate" title={selectedFiles[index].name}>
                              {selectedFiles[index].name.length > 15 
                                ? selectedFiles[index].name.substring(0, 12) + '...' 
                                : selectedFiles[index].name}
                            </p>
                            <p className="text-xs text-gray-500">
                              {Math.round(selectedFiles[index].size / 1024)} KB
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
                    setIsUploadModalOpen(false);
                    setSelectedFiles([]);
                    previewUrls.forEach(url => URL.revokeObjectURL(url));
                    setPreviewUrls([]);
                  }}
                  className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                >
                  বাতিল করুন
                </button>
                <button
                  onClick={handleUpload}
                  disabled={isUploading || selectedFiles.length === 0}
                  className={`px-5 py-2.5 rounded-lg font-medium text-white flex items-center gap-2 ${
                    isUploading 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-green-600 hover:bg-green-700'
                  } shadow-md hover:shadow-lg transition-colors`}
                >
                  {isUploading ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      আপলোড হচ্ছে...
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      {selectedFiles.length}টি ইমেজ জমা দিন
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

       
        {/* EDIT UPLOAD MODAL - EXACTLY AS REQUESTED */}
{editingUpload && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-auto">
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
      <div className="p-5 border-b border-gray-200 flex justify-between items-center bg-gradient-to-r from-purple-50 to-purple-100">
        <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          আবেদন সম্পাদনা করুন: #{editingUpload.id}
        </h3>
        <button 
          onClick={() => {
            setEditingUpload(null);
            setCurrentFiles([]);
            setNewFiles([]);
            setNewFilePreviews([]);
            setFilesToRemove([]);
          }}
          className="text-gray-400 hover:text-gray-600 transition-colors p-2 hover:bg-gray-100 rounded-full"
          title="বন্ধ করুন"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div className="p-6 overflow-y-auto">
        {/* CURRENT FILES SECTION - WITH INDIVIDUAL DELETE */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 01-3 3H1m8-9a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              বর্তমান ফাইলসমূহ ({currentFiles.length})
            </h4>
            <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {filesToRemove.length}টি মুছার জন্য নির্বাচিত
            </span>
          </div>
          
          {currentFiles.length === 0 ? (
            <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <div className="text-5xl mb-3">📭</div>
              <p className="text-gray-600 font-medium">কোনো ফাইল নেই</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {currentFiles.map((file, index) => (
                <div key={`current-${index}`} className="border rounded-lg overflow-hidden bg-gray-50 group relative">
                  <div className="aspect-square relative bg-gray-200">
                    {file.type.includes('image') ? (
                      <img 
                        src={file.url} 
                        alt={`Current ${index + 1}`} 
                        className="w-full h-full object-contain p-2"
                        onError={(e) => {
                          e.currentTarget.parentElement!.innerHTML = `
                            <div class="w-full h-full flex items-center justify-center bg-gray-100">
                              <div class="text-center p-3">
                                <div class="text-3xl mb-2">⚠️</div>
                                <p class="text-xs text-gray-600">লোড ব্যর্থ</p>
                              </div>
                            </div>
                          `;
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100 p-2">
                        <div className="text-4xl mb-2">📄</div>
                        <p className="text-xs text-gray-600 text-center">PDF ফাইল</p>
                      </div>
                    )}
                    {/* DELETE BUTTON FOR CURRENT FILE */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        // Toggle file removal
                        if (filesToRemove.includes(index)) {
                          setFilesToRemove(prev => prev.filter(i => i !== index));
                        } else {
                          setFilesToRemove(prev => [...prev, index]);
                        }
                      }}
                      className={`absolute top-2 right-2 ${
                        filesToRemove.includes(index) 
                          ? 'bg-green-500' 
                          : 'bg-red-500'
                      } text-white p-1.5 rounded-full opacity-100 group-hover:opacity-100 transition-opacity hover:opacity-100 shadow-lg z-10`}
                      title={filesToRemove.includes(index) ? "মুছার জন্য বাতিল করুন" : "এই ফাইল মুছুন"}
                    >
                      {filesToRemove.includes(index) ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <div className="p-2 text-center">
                    <p className="text-xs font-medium text-gray-800 truncate" title={file.name}>
                      {file.name.length > 15 ? file.name.substring(0, 12) + '...' : file.name}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {file.size ? `${file.size} KB` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <p className="text-sm text-yellow-600 mt-3">
            ⚠️ <strong>নোট:</strong> ফাইল মুছার জন্য একটি বা একাধিক ফাইল নির্বাচন করুন (লাল X → সবুজ ✓)। সেভ করার পর পরিবর্তনগুলো চূড়ান্ত হবে।
          </p>
        </div>

        {/* ADD NEW FILES SECTION */}
        <div className="border-t pt-6">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              নতুন ফাইল যোগ করুন ({newFiles.length})
            </h4>
          </div>
          
          <div 
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
              isDraggingNew ? 'border-green-500 bg-green-50' : 'border-gray-300 bg-gray-50 hover:border-green-400'
            }`}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingNew(false);
              handleNewFilesDrop(e);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              if (!isDraggingNew) setIsDraggingNew(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setIsDraggingNew(false);
            }}
            onClick={() => newFileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={newFileInputRef}
              className="hidden"
              accept="image/png, image/jpeg, application/pdf"
              multiple
              onChange={handleNewFilesSelect}
            />
            
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            
            <h3 className="text-xl font-bold text-gray-800 mb-2">ফাইল যোগ করুন</h3>
            <p className="text-gray-600 mb-4">
              ফাইলগুলো টেনে আনুন অথবা ক্লিক করে নির্বাচন করুন
            </p>
            <p className="text-sm text-gray-500">
              সমর্থিত: PNG, JPG, PDF | সর্বোচ্চ আকার: 10MB
            </p>
          </div>

          {/* NEW FILE PREVIEWS */}
          {newFiles.length > 0 && (
            <div className="mt-6">
              <h5 className="font-medium text-gray-700 mb-3 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 01-3 3H1m8-9a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                নতুন ফাইল প্রিভিউ ({newFiles.length})
              </h5>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {newFilePreviews.map((preview, index) => (
                  <div key={`new-${index}`} className="border rounded-lg overflow-hidden bg-white group relative">
                    <div className="aspect-square relative">
                      <img 
                        src={preview} 
                        alt={`New preview ${index + 1}`} 
                        className="w-full h-full object-contain p-2"
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNewFile(index);
                        }}
                        className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-lg z-10"
                        title="এই ফাইল মুছুন"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <div className="p-2 text-center">
                      <p className="text-xs font-medium text-gray-800 truncate" title={newFiles[index].name}>
                        {newFiles[index].name.length > 15 
                          ? newFiles[index].name.substring(0, 12) + '...' 
                          : newFiles[index].name}
                      </p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {Math.round(newFiles[index].size / 1024)} KB
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
        <button
          onClick={() => {
            setEditingUpload(null);
            setCurrentFiles([]);
            setNewFiles([]);
            setNewFilePreviews([]);
            setFilesToRemove([]);
          }}
          className="px-6 py-2.5 border-2 border-gray-400 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-colors flex items-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          বাতিল করুন
        </button>
        <button
          onClick={handleSavePartialChanges}
          disabled={isSaving || (filesToRemove.length === 0 && newFiles.length === 0)}
          className={`px-6 py-2.5 rounded-lg font-medium text-white flex items-center gap-2 ${
            isSaving 
              ? 'bg-purple-400 cursor-not-allowed' 
              : 'bg-purple-600 hover:bg-purple-700'
          } shadow-md hover:shadow-lg transition-colors`}
        >
          {isSaving ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              সংরক্ষণ হচ্ছে...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {filesToRemove.length > 0 && newFiles.length > 0 
                ? `মুছুন (${filesToRemove.length}) + যোগ করুন (${newFiles.length})`
                : filesToRemove.length > 0 
                  ? `মুছুন (${filesToRemove.length})`
                  : `যোগ করুন (${newFiles.length})`
              }
            </>
          )}
        </button>
      </div>
    </div>
  </div>
)}

        {/* View Upload Modal (unchanged from previous version) */}
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
                          {file &&(
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
                          )}
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

        {/* Contact Modal (unchanged) */}
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
      </main>

      <Footer />
    </div>
  );
};

export default UserDashboard;