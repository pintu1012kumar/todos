'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '../supabase-client';
import { convertFileUrlToText, deleteUserFile, getPublicUrlForUserFile, listUserFiles, uploadFilesForUser } from './file-service';
import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, Trash2, Eye } from "lucide-react";

import { handleLogout } from '../supabase';



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
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [successMessage, setSuccessMessage] = useState<string>('');
    const [errorMessages, setErrorMessages] = useState<string[]>([]);
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

    // State for the custom modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalContent, setModalContent] = useState('');
    const [modalTitle, setModalTitle] = useState('');
    const [isConverting, setIsConverting] = useState(false);

    const fetchFiles = async () => {
        if (!userId) return;
        setIsFetchingFiles(true);
        try {
            const files = await listUserFiles(userId);
            setUploadedFiles(files);
        } catch (error) {
            console.error('Error fetching files:', error);
            setErrorMessages(['Failed to fetch files. Please check your Supabase RLS policies.']);
        }
        setIsFetchingFiles(false);
    };

    useEffect(() => {
        const loadUser = async () => {
            const { data } = await supabase.auth.getUser();
            const uid = data.user?.id ?? null;
            setUserId(uid);
        };
        loadUser();
    }, []);

    useEffect(() => {
        if (userId) {
            fetchFiles();
        }
    }, [userId]);

    useEffect(() => {
        if (!successMessage) return;
        const timerId = setTimeout(() => setSuccessMessage(''), 2000);
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
            setSuccessMessage('');
            setErrorMessages(['Please select files to upload.']);
            return;
        }
        if (!userId) {
            setSuccessMessage('');
            setErrorMessages(['Unable to determine user. Please sign in again.']);
            return;
        }
        setIsUploading(true);

        const results = await uploadFilesForUser(userId, files);
        setIsUploading(false);

        const successfulUploads = results.filter(r => r.success).length;
        const failedUploads = results.filter(r => !r.success) as any[];

        if (successfulUploads > 0) {
            setSuccessMessage(`${successfulUploads} files uploaded successfully!`);
            setErrorMessages([]);
            setFiles(null);
            if (inputRef.current) {
                inputRef.current.value = '';
            }
            fetchFiles();
        }
        if (failedUploads.length > 0) {
            setSuccessMessage('');
            setErrorMessages(
                failedUploads.map(fail => `Failed to upload ${fail.original}: ${fail.error}`)
            );
        }
    };

    const handleDelete = async (fileName: string) => {
        if (!userId) {
            setErrorMessages(['Unable to determine user. Please sign in again.']);
            return;
        }

        try {
            await deleteUserFile(userId, fileName);
            setSuccessMessage(`${fileName} deleted successfully!`);
            setUploadedFiles(prevFiles => prevFiles.filter(file => file.name !== fileName));
        } catch (error: any) {
            console.error('Delete Error:', error);
            setErrorMessages([`Failed to delete ${fileName}: ${error.message}`]);
        }
    };

    const convertAndDisplay = async (fileUrl: string, fileType: string) => {
        setIsConverting(true);
        setModalContent('');
        setModalTitle(`Content of ${fileType.toUpperCase()} file`);
        setIsModalOpen(true);

        try {
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            if (fileType === 'pdf') {
                // Delegate to service for conversion
                const text = await convertFileUrlToText(fileUrl, 'pdf');
                setModalContent(text);
            } else if (fileType === 'docx') {
                const text = await convertFileUrlToText(fileUrl, 'docx');
                setModalContent(text);
            } else {
                setModalContent('This file type is not supported for text conversion.');
            }
        } catch (error) {
            console.error('Conversion Error:', error);
            setModalContent('Failed to convert file to text. Please try again.');
        } finally {
            setIsConverting(false);
        }
    };

    const handleView = (fileName: string) => {
        if (!userId) {
            setErrorMessages(['User not authenticated.']);
            return;
        }

        const fileExt = fileName.split('.').pop()?.toLowerCase();
        const publicUrl = getPublicUrlForUserFile(userId, fileName);
        if (!publicUrl) {
            setErrorMessages(['Could not generate public URL.']);
            return;
        }

        if (fileExt === 'pdf' || fileExt === 'docx') {
            convertAndDisplay(publicUrl, fileExt);
        } else {
            window.open(publicUrl, '_blank');
        }
    };

    const handleUserLogout = async () => {
        await handleLogout(router);
    };

    const Modal = ({ isOpen, title, onClose, children }: {
        isOpen: boolean;
        title: string;
        onClose: () => void;
        children: React.ReactNode;
    }) => {
        if (!isOpen) return null;

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl h-3/4 p-6 flex flex-col">
                    <div className="flex justify-between items-center border-b pb-4 mb-4">
                        <h2 className="text-xl font-semibold">{title}</h2>
                        <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition">
                            &times;
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {children}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="w-full max-w-5xl mx-auto p-4">
            <div className="flex justify-end mb-4">
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
                                Upload PDF, DOCX, and other files to your Supabase storage.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {successMessage && (
                                <Alert className="border-green-300 bg-green-50">
                                    <AlertTitle className="text-green-800">Success</AlertTitle>
                                    <AlertDescription className="text-green-700">{successMessage}</AlertDescription>
                                </Alert>
                            )}
                            {errorMessages.length > 0 && (
                                <Alert variant="destructive" className="border-red-300 bg-red-50">
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
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading...
                                    </>
                                ) : (
                                    'Upload Files'
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
                            ) : (
                                uploadedFiles.length > 0 ? (
                                    <ul className="space-y-2">
                                        {uploadedFiles.map((file) => (
                                            <li key={file.id} className="flex items-center justify-between gap-3 p-2 border rounded-md hover:bg-gray-50 transition">
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
                                                        onClick={() => handleDelete(file.name)}
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
                                )
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            <Modal isOpen={isModalOpen} title={modalTitle} onClose={() => setIsModalOpen(false)}>
                {isConverting ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                        <Loader2 className="h-8 w-8 animate-spin" />
                        <span className="mt-2">Converting file...</span>
                    </div>
                ) : (
                    <div className="h-full overflow-y-auto p-4 border rounded-md bg-gray-50 text-gray-700 whitespace-pre-wrap">
                        {modalContent || 'No text content could be extracted or an error occurred.'}
                    </div>
                )}
            </Modal>
        </div>
    );
}