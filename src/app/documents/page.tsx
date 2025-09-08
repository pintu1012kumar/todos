"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "../supabase-client";
import type { User } from "@supabase/supabase-js";
import {
  convertFileUrlToHtml,
  deleteUserFile,
  getPublicUrlForUserFile,
  listUserFiles,
  uploadFilesForUser,
} from "./file-service";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  CardFooter,
} from "@/components/ui/card";
import { Loader2, Trash2, Eye } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { handleLogout } from "../supabase";

interface UploadedFile {
  name: string;
  id: string;
}

export default function FileUploadForm() {
  const router = useRouter();
  const [files, setFiles] = useState<FileList | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isFetchingFiles, setIsFetchingFiles] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  // New state for delete confirmation
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);

  // State for the custom modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalContent, setModalContent] = useState("");
  const [modalTitle, setModalTitle] = useState("");
  const [isConverting, setIsConverting] = useState(false);

  // Split modal content into HTML and Markdown segments (for tables)
  const modalSegments = useMemo(() => {
    if (!modalContent)
      return [] as Array<{ type: "html" | "md"; content: string; key: string }>;
    const startTag = "<!--MD_TABLE_START-->";
    const endTag = "<!--MD_TABLE_END-->";
    if (!modalContent.includes(startTag)) {
      return [{ type: "html", content: modalContent, key: "html-0" }];
    }
    const segments: Array<{
      type: "html" | "md";
      content: string;
      key: string;
    }> = [];
    let remaining = modalContent;
    let index = 0;
    while (remaining.length > 0) {
      const sIdx = remaining.indexOf(startTag);
      if (sIdx === -1) {
        segments.push({
          type: "html",
          content: remaining,
          key: `html-${index++}`,
        });
        break;
      }
      if (sIdx > 0) {
        segments.push({
          type: "html",
          content: remaining.slice(0, sIdx),
          key: `html-${index++}`,
        });
      }
      const afterStart = remaining.slice(sIdx + startTag.length);
      const eIdx = afterStart.indexOf(endTag);
      const mdBlock = eIdx === -1 ? afterStart : afterStart.slice(0, eIdx);
      segments.push({
        type: "md",
        content: mdBlock.trim(),
        key: `md-${index++}`,
      });
      remaining = eIdx === -1 ? "" : afterStart.slice(eIdx + endTag.length);
    }
    return segments;
  }, [modalContent]);

  const fetchFiles = useCallback(async () => {
    if (!userId) return;
    setIsFetchingFiles(true);
    try {
      const files = await listUserFiles(userId);
      setUploadedFiles(files);
    } catch (error) {
      console.error("Error fetching files:", error);
      setErrorMessages([
        "Failed to fetch files. Please check your Supabase RLS policies.",
      ]);
    }
    setIsFetchingFiles(false);
  }, [userId]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        setUser(null);
        setUserId(null);
        setUploadedFiles([]);
        setFiles(null);
        setSuccessMessage("");
        setErrorMessages([]);
        router.push("/login");
      } else {
        setUser(session.user);
        setUserId(session.user.id);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (userId) {
      fetchFiles();
    }
  }, [userId, fetchFiles]);

  useEffect(() => {
    if (!successMessage) return;
    const timerId = setTimeout(() => setSuccessMessage(""), 2000);
    return () => clearTimeout(timerId);
  }, [successMessage]);

  useEffect(() => {
    if (errorMessages.length === 0) return;
    const timerId = setTimeout(() => setErrorMessages([]), 2000);
    return () => clearTimeout(timerId);
  }, [errorMessages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(e.target.files);
    }
  };

  const handleUpload = async () => {
    if (!files || files.length === 0) {
      setSuccessMessage("");
      setErrorMessages(["Please select files to upload."]);
      return;
    }
    if (!userId) {
      setSuccessMessage("");
      setErrorMessages(["Unable to determine user. Please sign in again."]);
      return;
    }
    setIsUploading(true);

    const results = (await uploadFilesForUser(userId, files)) as Array<{
      success: boolean;
      original: string;
      error?: string;
      stored?: string;
    }>;
    setIsUploading(false);

    const successfulUploads = results.filter((r) => r.success).length;
    const failedUploads = results.filter((r) => !r.success);

    if (successfulUploads > 0) {
      setSuccessMessage(`${successfulUploads} files uploaded successfully!`);
      setErrorMessages([]);
      setFiles(null);
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      fetchFiles();
    }
    if (failedUploads.length > 0) {
      setSuccessMessage("");
      setErrorMessages(
        failedUploads.map(
          (fail) => `Failed to upload ${fail.original}: ${fail.error}`
        )
      );
    }
  };

  const handleDelete = async (fileName: string) => {
    if (!userId) {
      setErrorMessages(["Unable to determine user. Please sign in again."]);
      return;
    }
console.log(handleDelete);

    try {
      await deleteUserFile(userId, fileName);
      setSuccessMessage(`${fileName} deleted successfully!`);
      setUploadedFiles((prevFiles) =>
        prevFiles.filter((file) => file.name !== fileName)
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Delete Error:", error);
      setErrorMessages([`Failed to delete ${fileName}: ${message}`]);
    }
  };

  // New function to handle confirmed deletion
  const confirmDelete = async () => {
    if (!fileToDelete || !userId) {
      setErrorMessages(["Unable to determine file or user."]);
      setShowConfirmModal(false);
      return;
    }

    try {
      await deleteUserFile(userId, fileToDelete);
      setSuccessMessage(`${fileToDelete} deleted successfully!`);
      setUploadedFiles((prevFiles) =>
        prevFiles.filter((file) => file.name !== fileToDelete)
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Delete Error:", error);
      setErrorMessages([`Failed to delete ${fileToDelete}: ${message}`]);
    } finally {
      setShowConfirmModal(false);
      setFileToDelete(null);
    }
  };

  const cancelDelete = () => {
    setShowConfirmModal(false);
    setFileToDelete(null);
  };

  const ConfirmModal = ({
    isOpen,
    message,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) => {
    if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6 flex flex-col">
        <h3 className="text-lg font-semibold mb-4">Confirm Deletion</h3>
        <p className="text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <Button onClick={onCancel} variant="outline">
            Cancel
          </Button>
          <Button onClick={onConfirm} variant="destructive">
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
};

  const convertAndDisplay = async (
    fileUrl: string,
    fileType: string,
    fileName: string
  ) => {
    setIsConverting(true);
    setModalContent("");
    setModalTitle(`Content of ${fileName}`);
    setIsModalOpen(true);

    try {
      const html = await convertFileUrlToHtml(fileUrl, fileType);
      setModalContent(html);
    } catch (error) {
      console.error("Conversion Error:", error);
      setModalContent(
        "Failed to convert file. Please check the file format or try again."
      );
    } finally {
      setIsConverting(false);
    }
  };

  const handleView = (fileName: string) => {
    if (!userId) {
      setErrorMessages(["User not authenticated."]);
      return;
    }

    const fileExt = fileName.split(".").pop()?.toLowerCase();
    const publicUrl = getPublicUrlForUserFile(userId, fileName);
    if (!publicUrl) {
      setErrorMessages(["Could not generate public URL."]);
      return;
    }

    if (fileExt === "pdf" || fileExt === "docx") {
      convertAndDisplay(publicUrl, fileExt, fileName);
    } else {
      window.open(publicUrl, "_blank");
    }
  };

  const handleUserLogout = async () => {
    await handleLogout(router);
  };

  const handleBackToTodo = () => {
    router.push("/todo");
  };

const Modal = ({
  isOpen,
  title,
  onClose,
  children,
}: {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl h-[90vh] p-6 flex flex-col">
        <div className="flex justify-between items-center border-b pb-4 mb-4">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-800 transition"
          >
            &times;
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

  if (!user && !loading) {
    return null;
  }

  return (
    <div className="w-full max-w-5xl mx-auto p-4">
      {/* Toast Alerts */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 items-end">
        {successMessage && (
          <Alert className="border-green-300 bg-green-50 shadow-lg min-w-[250px]">
            <AlertTitle className="text-green-800">Success</AlertTitle>
            <AlertDescription className="text-green-700">
              {successMessage}
            </AlertDescription>
          </Alert>
        )}
        {errorMessages.length > 0 && (
          <Alert
            variant="destructive"
            className="border-red-300 bg-red-50 shadow-lg min-w-[250px]"
          >
            <AlertTitle className="text-red-800">Upload failed</AlertTitle>
            <AlertDescription className="text-red-700">
              <ul className="list-disc pl-5 space-y-1">
                {errorMessages.map((msg, idx) => (
                  <li key={idx}>{msg}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </div>

      <div className="flex justify-between items-center mb-8">
        <Button onClick={handleBackToTodo} variant="secondary" size="sm">
          Back to Todo
        </Button>
        {userId && (
          <Button onClick={handleUserLogout} variant="outline" size="sm">
            Logout
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10 items-start mt-6">
        <div>
          <Card>
            <CardHeader>
              <CardTitle>File Upload</CardTitle>
              <CardDescription>
                Upload PDF, DOCX, Jpg, and Png to your Supabase storage.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Alerts removed from here */}
              <div className="space-y-2">
                <Label htmlFor="files">Select Files</Label>
                <Input
                  id="files"
                  type="file"
                  multiple
                  accept=".pdf,.docx,.jpg,image/jpeg,image/png"
                  onChange={handleFileChange}
                  ref={inputRef}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleUpload}
                disabled={isUploading || !files || files.length === 0}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                    Uploading...
                  </>
                ) : (
                  "Upload Files"
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div>
          <Card className="border border-gray-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle>Uploaded Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[70vh] overflow-auto pr-2">
              {isFetchingFiles ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading files...</span>
                </div>
              ) : uploadedFiles.length > 0 ? (
                <ul className="space-y-2">
                  {uploadedFiles.map((file) => (
                    <li
                      key={file.id}
                      className="flex items-center justify-between gap-3 p-2 border rounded-md hover:bg-gray-50 transition"
                    >
                      <span className="truncate max-w-[70%]">{file.name}</span>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleView(file.name)}
                          title="View File"
                        >
                          <Eye className="h-4 w-4 text-blue-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setFileToDelete(file.name);
                            setShowConfirmModal(true);
                          }}
                          title="Delete File"
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-500">No files uploaded yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        title={modalTitle}
        onClose={() => setIsModalOpen(false)}
      >
        {isConverting ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin" />
            <span className="mt-2">Converting file...</span>
          </div>
        ) : (
          <>
            <style jsx global>{`
              /* General styling for converted document content */
              .document-content {
                font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
                color: #333;
                line-height: 1.4;
                background: white;
                padding: 20px;
                max-width: 800px;
                margin: 0 auto;
              }

              /* Enhanced styles for Mammoth DOCX output */
              .docx-content h1,
              .docx-content h2,
              .docx-content h3,
              .docx-content h4,
              .docx-content h5,
              .docx-content h6 {
                font-weight: 700;
                color: #1a202c;
                margin-top: 1.5em;
                margin-bottom: 0.5em;
                line-height: 1.2;
                border-bottom: 2px solid #e2e8f0;
                padding-bottom: 0.25em;
              }
              .docx-content h1 {
                font-size: 2em;
                color: #2d3748;
              }
              .docx-content h2 {
                font-size: 1.5em;
                color: #2d3748;
              }
              .docx-content h3 {
                font-size: 1.25em;
                color: #4a5568;
              }
              .docx-content h4 {
                font-size: 1.1em;
                color: #4a5568;
              }
              .docx-content h5 {
                font-size: 1em;
                color: #718096;
              }
              .docx-content h6 {
                font-size: 0.9em;
                color: #718096;
              }

              /* Enhanced paragraph and text styling */
              .docx-content .docx-paragraph {
                margin-bottom: 1em;
                line-height: 1.6;
                color: #2d3748;
                text-align: justify;
              }
              .docx-content p,
              .docx-content li {
                margin-bottom: 1em;
                line-height: 1.6;
              }

              /* Enhanced list styling */
              .docx-content .docx-list-unordered,
              .docx-content .docx-list-ordered {
                padding-left: 2em;
                margin-bottom: 1em;
              }
              .docx-content .docx-list-item {
                margin-bottom: 0.5em;
                line-height: 1.5;
              }

              /* Enhanced text formatting */
              .docx-content .docx-strong {
                font-weight: 700;
                color: #1a202c;
              }
              .docx-content .docx-emphasis {
                font-style: italic;
                color: #4a5568;
              }
              .docx-content .docx-link {
                color: #3182ce;
                text-decoration: none;
                border-bottom: 1px solid #3182ce;
                transition: color 0.2s ease;
              }
              .docx-content .docx-link:hover {
                color: #2c5282;
                border-bottom-color: #2c5282;
              }

              /* Enhanced table styling for DOCX */
              .docx-content .docx-table {
                border-collapse: collapse;
                width: 100%;
                margin: 20px 0;
                border: 2px solid #2d3748;
                background: white;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                border-radius: 8px;
                overflow: hidden;
              }

              .docx-content .docx-table .docx-table-row:nth-child(even) {
                background-color: #f7fafc;
              }

              .docx-content .docx-table .docx-table-row:hover {
                background-color: #edf2f7;
                transition: background-color 0.2s ease;
              }

              .docx-content .docx-table .docx-table-cell,
              .docx-content .docx-table .docx-table-header {
                border: 1px solid #cbd5e0;
                padding: 12px 16px;
                text-align: left;
                vertical-align: top;
                font-size: 14px;
              }

              .docx-content .docx-table .docx-table-header {
                background: linear-gradient(135deg, #4a5568 0%, #2d3748 100%);
                color: white;
                font-weight: 600;
                text-align: center;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                font-size: 13px;
              }

              .docx-content .docx-table .docx-table-cell {
                color: #2d3748;
              }

              /* Section breaks for better readability */
              .docx-content .docx-section-break {
                margin: 2em 0 1em 0;
                padding: 1em 0;
                border-top: 1px solid #e2e8f0;
                border-bottom: 1px solid #e2e8f0;
                background: linear-gradient(to right, #f7fafc, transparent, #f7fafc);
              }

              .docx-content .docx-section-break .docx-heading {
                margin-top: 0;
                margin-bottom: 0.5em;
              }

              /* Special styling for contact information */
              .docx-content .contact-info {
                background-color: #e6fffa;
                border-left: 4px solid #38b2ac;
                padding: 12px 16px;
                margin: 16px 0;
                border-radius: 0 4px 4px 0;
                font-weight: 500;
              }

              /* Special styling for section headers */
              .docx-content .section-header {
                background-color: #ebf8ff;
                border-left: 4px solid #4299e1;
                padding: 12px 16px;
                margin: 16px 0;
                border-radius: 0 4px 4px 0;
                font-weight: 600;
                font-size: 1.1em;
                color: #2b6cb0;
              }

              /* Enhanced image styling for standardized display */
              .docx-content .docx-image {
                max-width: 100%;
                height: auto;
                display: block;
                margin: 20px auto;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                border: 1px solid #e2e8f0;
                background: white;
                padding: 8px;
                transition: transform 0.2s ease, box-shadow 0.2s ease;
              }

              .docx-content .docx-image:hover {
                transform: scale(1.02);
                box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
              }

              /* Standard image sizes for different contexts */
              .docx-content p .docx-image,
              .docx-content .docx-paragraph .docx-image {
                max-width: 90%;
                margin: 16px auto;
              }

              /* Images in tables */
              .docx-content .docx-table .docx-image {
                max-width: 120px;
                max-height: 80px;
                margin: 4px auto;
                border-radius: 4px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
              }

              /* Large images (full-width) */
              .docx-content .docx-image[style*="width: 100%"],
              .docx-content .docx-image[style*="width:100%"] {
                width: 100%;
                max-width: 100%;
                height: auto;
                margin: 24px 0;
                border-radius: 12px;
                box-shadow: 0 6px 24px rgba(0, 0, 0, 0.1);
              }

              /* Medium images */
              .docx-content .docx-image[style*="width: 50%"],
              .docx-content .docx-image[style*="width:50%"] {
                max-width: 50%;
                height: auto;
                margin: 16px;
              }

              /* Small images */
              .docx-content .docx-image[style*="width: 25%"],
              .docx-content .docx-image[style*="width:25%"] {
                max-width: 25%;
                height: auto;
                margin: 8px;
                float: left;
                margin-right: 16px;
                margin-bottom: 8px;
              }

              /* Image containers for better layout */
              .docx-content .image-container {
                text-align: center;
                margin: 24px 0;
                padding: 16px;
                background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
                border-radius: 12px;
                border: 1px solid #e2e8f0;
              }

              .docx-content .image-container .docx-image {
                margin: 0;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
                border: none;
                padding: 0;
              }

              /* Image captions */
              .docx-content .image-caption {
                font-size: 14px;
                color: #718096;
                margin-top: 8px;
                font-style: italic;
                text-align: center;
              }

              /* Responsive design for images */
              @media (max-width: 768px) {
                .docx-content .docx-image {
                  margin: 16px auto;
                  border-radius: 6px;
                  padding: 6px;
                }

                .docx-content .docx-image[style*="width: 25%"],
                .docx-content .docx-image[style*="width:25%"] {
                  max-width: 100%;
                  float: none;
                  margin: 16px auto;
                }

                .docx-content .docx-image[style*="width: 50%"],
                .docx-content .docx-image[style*="width:50%"] {
                  max-width: 90%;
                  margin: 16px auto;
                }

                .docx-content .image-container {
                  padding: 12px;
                  margin: 16px 0;
                }

                .docx-content .docx-table .docx-image {
                  max-width: 80px;
                  max-height: 60px;
                }
              }

              /* Print styles for images */
              @media print {
                .docx-content .docx-image {
                  max-width: 100%;
                  height: auto;
                  margin: 12px 0;
                  box-shadow: none;
                  border: 1px solid #ccc;
                  page-break-inside: avoid;
                }
              }

              /* Responsive design for tables */
              @media (max-width: 768px) {
                .docx-content .docx-table {
                  font-size: 12px;
                }

                .docx-content .docx-table .docx-table-cell,
                .docx-content .docx-table .docx-table-header {
                  padding: 8px 12px;
                }

                .docx-content .docx-paragraph {
                  text-align: left;
                }
              }

              /* Styles for custom PDF HTML output */
              .pdf-content div {
                display: block;
                margin: 0;
                padding: 0;
              }
              .pdf-content .pdf-title {
                text-align: center;
                font-weight: 700;
                font-size: 28px;
                margin: 6px 0 10px;
              }
              .pdf-content .pdf-contact-line {
                text-align: center;
                color: #374151;
                font-size: 13px;
                margin-bottom: 12px;
              }
              .pdf-content span {
                display: inline;
                color: #000000;
                /* Bolder and darker for specific sections in PDF */
                font-weight: 700;
                font-size: 1.2em;
              }

              /* Specific overrides for your heading sections */
              .pdf-content span:has(> strong) {
                font-weight: 900 !important;
                color: #000000;
                font-size: 1.2em;
              }

              /* Enhanced table styling for PDF */
              .pdf-table {
                border-collapse: collapse;
                width: 100%;
                margin: 16px 0;
                border: 2px solid #333;
                background: white;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                font-size: 12px;
              }

              .pdf-table td,
              .pdf-table th {
                border: 1px solid #333;
                padding: 8px 12px;
                text-align: left;
                vertical-align: top;
                background: white;
              }

              .pdf-table th {
                background-color: #4a5568;
                color: white;
                font-weight: 600;
                text-align: center;
              }

              .pdf-table tr:nth-child(even) {
                background-color: #f8f9fa;
              }

              .pdf-table tr:nth-child(even) td {
                background-color: #f8f9fa;
              }

              .pdf-table tr:hover {
                background-color: #e9ecef;
              }

              .pdf-table tr:hover td {
                background-color: #e9ecef;
              }

              /* Special styling for table headers in PDF */
              .pdf-table thead th {
                background-color: #2d3748;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
              }

              /* Table caption styling */
              .pdf-table caption {
                font-weight: 600;
                margin-bottom: 8px;
                color: #333;
                font-size: 14px;
              }

              /* Responsive table styling */
              @media (max-width: 768px) {
                .pdf-table,
                .docx-content table {
                  font-size: 10px;
                }

                .pdf-table td,
                .pdf-table th,
                .docx-content table td,
                .docx-content table th {
                  padding: 4px 6px;
                }
              }
            `}</style>
            <div className="h-full overflow-y-auto p-4 border rounded-md bg-gray-50 text-gray-700 document-content">
              {modalSegments.length === 0 ? (
                <div>No content could be extracted or an error occurred.</div>
              ) : (
                modalSegments.map((seg) =>
                  seg.type === "md" ? (
                    <div key={seg.key} className="my-3 md-table">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {seg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div
                      key={seg.key}
                      dangerouslySetInnerHTML={{ __html: seg.content }}
                    />
                  )
                )
              )}
            </div>
          </>
        )}
      </Modal>
      <ConfirmModal
        isOpen={showConfirmModal}
        message={`Are you sure you want to delete "${fileToDelete}"? This action cannot be undone.`}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
}
