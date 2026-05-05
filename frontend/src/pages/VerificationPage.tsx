import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { toast } from "react-toastify";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload } from "@fortawesome/free-solid-svg-icons";

const API_URL =
  process.env.REACT_APP_API_URL ||
  "https://bangladesh-apostille-api.onrender.com/api";
const normalizedApiUrl = API_URL.endsWith("/api") ? API_URL : `${API_URL}/api`;

interface SignerData {
  id?: number;
  name: string;
  designation: string;
  organization: string;
  signature_image: string;
  signatureDate: string;
}

interface DocumentData {
  url: string;
  originalName: string;
  fileType?: string;
  signers: SignerData[];
}

interface VerificationData {
  certificateNumber: string;
  certificatePath: string;
   certificateImageUrl?: string;
  documents: DocumentData[];
  userName: string;
  userEmail: string;
  verifiedByName: string;
  verifiedAt: string;
  authorityName: string;
}

const VerificationPage = () => {
  const { certificateNumber } = useParams();
  const navigate = useNavigate();

  const [verificationData, setVerificationData] =
    useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchedCerts = useRef<Set<string>>(new Set());
  const abortController = useRef<AbortController | null>(null);

  const getSignatureImageUrl = (signatureImage: string) => {
    if (!signatureImage) return "";
    if (signatureImage.startsWith("http")) return signatureImage;
    // Use normalizedApiUrl without /api for static assets
    const baseUrl = normalizedApiUrl.slice(0, -4);
    return `${baseUrl}/api/signatures/${signatureImage}`;
  };

  const getAttestedImageUrl = () => {
    const baseUrl = normalizedApiUrl.slice(0, -4);
    return `${baseUrl}/api/signatures/attested_text.png`;
  };

  const fetchData = useCallback(async () => {
    if (!certificateNumber) {
      setError("সার্টিফিকেট নম্বর পাওয়া যায়নি");
      setLoading(false);
      return;
    }

    if (fetchedCerts.current.has(certificateNumber)) {
      return;
    }

    fetchedCerts.current.add(certificateNumber);

    if (abortController.current) {
      abortController.current.abort();
    }
    abortController.current = new AbortController();

    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(
        `${normalizedApiUrl}/files/verify/${certificateNumber}`,
        {
          signal: abortController.current.signal,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.data || !response.data.certificatePath) {
        throw new Error("Invalid data received from server");
      }

      setVerificationData(response.data);
    } catch (err: any) {
      if (err.name === "AbortError" || err.code === "ERR_CANCELED") {
        return;
      }

      console.error("Verification failed", err);
      setError(
        err.response?.data?.message ||
          err.message ||
          "সার্টিফিকেট পাওয়া যায়নি"
      );
      fetchedCerts.current.delete(certificateNumber);
    } finally {
      setLoading(false);
    }
  }, [certificateNumber]);

  useEffect(() => {
    fetchData();
    return () => {
      if (abortController.current) {
        abortController.current.abort();
      }
    };
  }, [fetchData]);

  useEffect(() => {
    fetchedCerts.current.clear();
  }, [certificateNumber]);

  const handleDownloadCertificate = () => {
    if (!verificationData?.certificatePath) {
      toast.error("সার্টিফিকেট লিংক পাওয়া যায়নি");
      return;
    }
    window.open(verificationData.certificatePath, "_blank");
    toast.success("সার্টিফিকেট ডাউনলোড শুরু হয়েছে!");
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, "0");
    const month = date.toLocaleString("default", { month: "short" });
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        <Header />
        <main className="flex-grow flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin h-16 w-16 border-4 border-green-600 border-t-transparent rounded-full mx-auto"></div>
            <p className="mt-4 text-gray-600 font-medium text-lg">
              লোড হচ্ছে...
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        <Header />
        <main className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md">
            <div className="text-red-500 text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold mb-2 text-gray-800">
              যাচাই ব্যর্থ
            </h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={() => {
                fetchedCerts.current.delete(certificateNumber || "");
                fetchData();
              }}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition-colors"
            >
              আবার চেষ্টা করুন
            </button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!verificationData) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        <Header />
        <main className="flex-grow flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-xl shadow-lg text-center">
            <p className="text-gray-600">কোনো তথ্য পাওয়া যায়নি</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const hasCertificate = !!verificationData.certificatePath;
  const hasDocuments =
    Array.isArray(verificationData.documents) &&
    verificationData.documents.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <Header />
      {/* FULL WIDTH - no padding, no max-width constraints */}
      <main className="flex-grow w-full">
        <div className="container mx-auto">
          <div className="w-full space-y-6">
            {/* E-Apostille Certificate Section */}
{hasCertificate && (
  <div className="bg-white shadow-sm overflow-hidden mb-6 border-b border-gray-200">
    <div className="bg-gray-100 px-4 py-3 border-b">
      <h2 className="text-lg font-bold text-gray-800">ই-অ্যপোস্টিল সার্টিফিকেট</h2>
    </div>
    
    <div className="p-2 flex flex-col items-center">
      {/* PHONE FRIENDLY DISPLAY: 
         We use an <img> tag which is much lighter than an iframe 
      */}
      {verificationData.certificateImageUrl ? (
        <div className="w-full bg-white shadow-inner border rounded-md overflow-hidden mb-4">
          <img 
            src={verificationData.certificateImageUrl} 
            alt="Certificate Preview" 
            className="w-full h-auto block" // Makes the image responsive
            loading="lazy"
          />
        </div>
      ) : (
        <div className="p-10 text-gray-400 text-center">
          লোড হচ্ছে...
        </div>
      )}

      {/* Action Button - Still downloads the high-res PDF */}
      <div className="w-full px-2 pb-4">
        <button 
          onClick={handleDownloadCertificate} 
          className="w-full bg-black text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <FontAwesomeIcon icon={faDownload} /> 
          অ্যাপোস্টিল  ডাউনলোড করুন
        </button>
      </div>
    </div>
  </div>
)}


{/* Attested Documents Section */}
            {hasDocuments && (
              <div className="w-full space-y-6">
                <div className="p-3">
                  <h2 className="text-xl font-bold text-gray-800">
                    সনদপত্র/নম্বরপত্র/একাডেমিক ট্রান্সক্রিপ্ট/ডকুমেন্টস
                  </h2>
                </div>

                {verificationData.documents.map((doc, docIndex) => (
                  <div
                    key={docIndex}
                    className="bg-white shadow-sm overflow-hidden"
                  >
                    {/* Document Image - No more iframes/embeds */}
<div className="p-0 bg-gray-50">
  <div className="bg-white overflow-hidden shadow-inner">
    {/* We optimize the Cloudinary URL on the fly by inserting 'q_auto,f_auto' 
      This ensures the images load fast on mobile devices.
    */}
    <img
      src={
        doc.url?.includes("cloudinary.com") 
          ? doc.url.replace("/upload/", "/upload/q_auto,f_auto,w_1000/") 
          : doc.url
      }
      alt={`Document ${docIndex + 1}`}
      className="w-full h-auto object-contain block"
      loading="lazy" // Improves page performance
      onError={(e) => {
        console.error("Document image failed to load:", doc.url);
        // Fallback: if optimization fails, try the original URL
        const target = e.target as HTMLImageElement;
        if (target.src !== doc.url) {
          target.src = doc.url;
        } else {
          target.style.display = "none";
        }
      }}
    />
  </div>
</div>

                    {/* Signature Blocks */}
{doc.signers && doc.signers.length > 0 && (
  <div className="px-4 py-8 bg-white border-t border-gray-200">
    <div 
      className={`
        grid gap-y-8 gap-x-4 justify-items-center
        ${doc.signers.length === 1 || doc.signers.length === 3
          ? 'grid-cols-1 place-items-center' 
          : 'grid-cols-1 sm:grid-cols-2'
        }
      `}
    >
      {doc.signers.map((signer, signerIndex) => (
        <div
          key={signerIndex}
          className={`
            flex flex-col items-center text-center w-full
            ${doc.signers.length === 1 || doc.signers.length === 3
              ? 'max-w-[480px]' 
              : 'max-w-[320px]'
            }
          `}
        >
          {/* Attested Image */}
          <div className="mb-2">
            <img
              src={getAttestedImageUrl()}
              alt="Attested"
              className="h-12 w-auto object-contain"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
                if (target.parentElement) {
                  target.parentElement.innerHTML =
                    '<span style="color: #4c1d95; font-family: serif; font-size: 1.75rem; font-style: italic; font-weight: 700;">Attested</span>';
                }
              }}
            />
          </div>

          {/* Signature Image */}
          <div className="h-24 flex items-center justify-center mb-2">
            {signer.signature_image ? (
              <img
                src={getSignatureImageUrl(
                  signer.signature_image
                )}
                alt={`${signer.name} signature`}
                className="max-h-24 w-auto object-contain mix-blend-multiply"
              />
            ) : (
              <div className="h-24" />
            )}
          </div>

          {/* Date */}
          <div className="text-[#4c1d95] text-lg font-semibold mb-1">
            {formatDate(signer.signatureDate)}
          </div>

          {/* Name */}
          <div className="font-bold text-[#4c1d95] text-xl leading-tight mb-1">
            {signer.name}
          </div>

          {/* Designation & Org */}
          <div className="text-[#4c1d95] text-lg leading-snug">
            <p>{signer.designation}</p>
            <p>{signer.organization}</p>
          </div>
        </div>
      ))}
    </div>
  </div>
)}
                  </div>
                ))}
              </div>
            )}

            {!hasDocuments && (
              <div className="bg-white p-12 text-center text-gray-500">
                <div className="text-6xl mb-4">📭</div>
                <p className="text-xl">কোনো মূল নথি পাওয়া যায়নি</p>
              </div>
            )}

            
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default VerificationPage;