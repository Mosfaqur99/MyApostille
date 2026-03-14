import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";
import Header from "../components/Header";
import Footer from "../components/Footer";

const VerificationPage = () => {
  const { certificateNumber } = useParams();
  const navigate = useNavigate();

  const [verificationData, setVerificationData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null);
  const [processedFiles, setProcessedFiles] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"certificate" | "documents">(
    "certificate"
  );

  useEffect(() => {
    let isMounted = true;

    // frontend/src/pages/VerificationPage.tsx

// Inside VerificationPage.tsx
// frontend/src/pages/VerificationPage.tsx

const verifyCertificate = async () => {
  try {
    setLoading(true);
    setError(null);
    const response = await api.get(`/files/verify/${certificateNumber}`);
    
    // DEBUG: See what the server actually sent
    console.log("Full Server Response:", response.data);

    setVerificationData(response.data);

    const baseURL = "https://bangladesh-apostille-api.onrender.com";

    // 1. Handle the main Certificate PDF
    if (response.data.certificatePath) {
      setCertificateUrl(`${baseURL}/${response.data.certificatePath.replace(/^\/+/, '')}`);
    }

    // 2. Handle the Verified Documents (The tab content)
    if (response.data.upload && response.data.upload.verified_paths) {
      const paths = response.data.upload.verified_paths;
      
      const urls = paths.map((pathStr: string) => {
        // Ensure path starts correctly
        const cleanPath = pathStr.replace(/^\/+/, '');
        return `${baseURL}/${cleanPath}`;
      });

      console.log("Generated Document URLs:", urls);
      setProcessedFiles(urls);
    } else {
      console.warn("No processed documents found in response.data.upload.verified_paths");
    }
    
    setLoading(false);
  } catch (err: any) {
    console.error("Verification failed", err);
    setError(err.response?.data?.message || "যাচাইকরণ ব্যর্থ হয়েছে");
    setLoading(false);
  }
};

    verifyCertificate();
    return () => {
      isMounted = false;
    };
  }, [certificateNumber]);

  const handleDownloadCertificate = async () => {
    if (!certificateUrl) return;

    try {
      const response = await fetch(certificateUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `e-APOSTILLE-${certificateNumber}.pdf`;

      document.body.appendChild(link);
      link.click();

      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("ডাউনলোড ব্যর্থ হয়েছে। আবার চেষ্টা করুন।");
    }
  };

  const PDFViewer = ({ url }: { url: string }) => (
    <div className="w-full border rounded-lg overflow-hidden bg-gray-100">
      <iframe
        src={url}
        title="PDF Viewer"
        className="w-full h-[65vh] md:h-[75vh]"
      />
    </div>
  );

  const ImageViewer = ({ url }: { url: string }) => {
    const ext = url.split(".").pop()?.toLowerCase();

    if (ext === "pdf") {
      return <PDFViewer url={url} />;
    }

    return (
      <div className="flex justify-center bg-gray-100 rounded-lg overflow-hidden">
        <img
          src={url}
          alt="Verified Document"
          className="max-w-full max-h-[70vh] object-contain"
        />
      </div>
    );
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-16 w-16 border-b-2 border-green-600 rounded-full"></div>
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-2">
            যাচাই ব্যর্থ
          </h2>
          <p className="text-gray-600 mb-6">{error}</p>

          <button
            onClick={() => navigate("/")}
            className="bg-green-600 text-white px-6 py-2 rounded-lg"
          >
            হোম পেজে ফিরে যান
          </button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header />

      <main className="flex-grow container mx-auto px-4 py-6">
        <div className="max-w-5xl mx-auto">
          {/* Certificate info */}
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h1 className="text-2xl font-bold text-green-700">
              e-APOSTILLE যাচাইকৃত
            </h1>

            <p className="mt-2 text-gray-600">
              নম্বর:{" "}
              <span className="font-bold font-mono">
                {certificateNumber}
              </span>
            </p>

            <div className="grid md:grid-cols-3 gap-4 mt-6 text-sm">
              <div>
                <p className="text-gray-400">আবেদনকারী</p>
                <p className="font-semibold">
                  {verificationData?.userName || "N/A"}
                </p>
              </div>

              <div>
                <p className="text-gray-400">যাচাইকারী কর্তৃপক্ষ</p>
                <p className="font-semibold">
                  Ministry of Foreign Affairs
                </p>
              </div>

              <div>
                <p className="text-gray-400">যাচাইয়ের তারিখ</p>
                <p className="font-semibold">
                  {verificationData?.verifiedAt
                    ? new Date(
                        verificationData.verifiedAt
                      ).toLocaleDateString("bn-BD")
                    : "N/A"}
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-lg shadow-md">
            <div className="flex border-b">
              <button
                onClick={() => setActiveTab("certificate")}
                className={`flex-1 py-4 font-bold ${
                  activeTab === "certificate"
                    ? "border-b-4 border-green-600 text-green-700"
                    : "text-gray-500"
                }`}
              >
                📜 সার্টিফিকেট দেখুন
              </button>

              <button
                onClick={() => setActiveTab("documents")}
                className={`flex-1 py-4 font-bold ${
                  activeTab === "documents"
                    ? "border-b-4 border-blue-600 text-blue-700"
                    : "text-gray-500"
                }`}
              >
                📂 মূল নথি ({processedFiles.length})
              </button>
            </div>

            <div className="p-6">
              {activeTab === "certificate" ? (
                <>
                  {certificateUrl ? (
                    <>
                      <PDFViewer url={certificateUrl} />

                      <div className="text-center mt-6">
                        <button
                          onClick={handleDownloadCertificate}
                          className="bg-green-600 text-white px-8 py-3 rounded-lg font-bold hover:bg-green-700"
                        >
                          📥 ডাউনলোড সার্টিফিকেট
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-center py-20 text-gray-400">
                      সার্টিফিকেট পাওয়া যায়নি
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-6">
                  {processedFiles.map((url, i) => (
                    <div
                      key={i}
                      className="bg-gray-50 p-4 rounded-xl border"
                    >
                      <p className="text-sm font-bold text-gray-500 mb-3">
                        যাচাইকৃত নথি {i + 1}
                      </p>

                      <ImageViewer url={url} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Back button */}
          <div className="mt-8 text-center">
            <button
              onClick={() => navigate(-1)}
              className="bg-white border px-6 py-3 rounded-lg hover:bg-gray-100"
            >
              ← আগের পেজে ফিরে যান
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default VerificationPage;