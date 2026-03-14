// components/PDFViewer.tsx

import React from "react";

interface Props {
  url: string;
  allowDownload?: boolean;
}

const PDFViewer: React.FC<Props> = ({ url, allowDownload = false }) => {
  return (
    <div className="w-full">
      <div className="w-full border rounded-lg overflow-hidden bg-gray-100">
        <iframe
          src={url}
          title="PDF Viewer"
          className="w-full h-[75vh]"
        />
      </div>

      {allowDownload && (
        <div className="mt-4 text-center">
          <a
            href={url}
            download
            className="bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700"
          >
            📥 Download Certificate
          </a>
        </div>
      )}
    </div>
  );
};

export default PDFViewer;