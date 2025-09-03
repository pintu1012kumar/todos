'use client';

import React, { useState } from 'react';
import mammoth from 'mammoth';

export default function HomeTextExtractor() {
  const [isConverting, setIsConverting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string>('');

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setErrorMessage(null);
    setTextContent('');
    setFileName(file ? file.name : null);
    if (!file) return;

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || (extension !== 'pdf' && extension !== 'docx')) {
      setErrorMessage('Please select a PDF or DOCX file.');
      return;
    }

    try {
      setIsConverting(true);
      const arrayBuffer = await file.arrayBuffer();

      if (extension === 'pdf') {
        const pdfjsLib = (await import('pdfjs-dist')).default;
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let accumulated = '';
        for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex++) {
          const page = await pdf.getPage(pageIndex);
          const content = await page.getTextContent();
          accumulated += content.items.map((item: any) => item.str).join(' ') + '\n\n';
        }
        setTextContent(accumulated.trim());
      } else if (extension === 'docx') {
        const result = await mammoth.extractRawText({ arrayBuffer });
        setTextContent(result.value.trim());
      }
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to convert file.');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-2">Extract text from PDF or DOCX</h1>
      <p className="text-gray-600 mb-6">Select a local file. We will parse it in your browser and display the text below.</p>

      <input
        type="file"
        accept=".pdf,.docx"
        onChange={handleFileChange}
        className="block w-full border rounded p-2"
      />

      {fileName && (
        <div className="mt-3 text-sm text-gray-700">Selected: {fileName}</div>
      )}

      {isConverting && (
        <div className="mt-4 text-gray-700">Converting file...</div>
      )}

      {errorMessage && (
        <div className="mt-4 p-3 border border-red-300 bg-red-50 text-red-700 rounded">
          {errorMessage}
        </div>
      )}

      {textContent && !isConverting && !errorMessage && (
        <div className="mt-6">
          <h2 className="text-lg font-medium mb-2">Extracted Text</h2>
          <div className="whitespace-pre-wrap p-4 border rounded bg-gray-50 text-gray-800 max-h-[70vh] overflow-auto">
            {textContent}
          </div>
        </div>
      )}
    </div>
  );
}