'use client'

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation'; // Import useRouter for redirection
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '../supabase-client';
import { Card, CardHeader, CardContent, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, Trash2, Eye } from "lucide-react";

// Assuming you have this file in '../supabase' with the logout function
import { handleLogout } from '../supabase'; 

// Define a type for the uploaded files for better type safety
interface UploadedFile {
    name: string;
    id: string;
}

export default function FileUploadForm() {
    const router = useRouter(); // Initialize the router
    const [files, setFiles] = useState<FileList | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isFetchingFiles, setIsFetchingFiles] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [successMessage, setSuccessMessage] = useState<string>('');
    const [errorMessages, setErrorMessages] = useState<string[]>([]);
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);

    const fetchFiles = async () => {
        if (!userId) return;
        setIsFetchingFiles(true);
        const folderPath = `documents/${userId}/`;
        const { data, error } = await supabase.storage.from('files').list(folderPath);

        if (error) {
            console.error('Error fetching files:', error);
            setErrorMessages(['Failed to fetch files. Please check your Supabase RLS policies.']);
        } else {
            const normalized = (data || []).map((f) => ({ name: f.name, id: f.id ?? f.name }));
            setUploadedFiles(normalized);
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

        const uploadPromises = Array.from(files).map(async (file: File) => {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
            const filePath = `documents/${userId}/${fileName}`;

            const { data, error } = await supabase.storage
                .from('files')
                .upload(filePath, file);

            if (error) {
                console.error('Upload Error:', error);
                return { success: false, fileName: file.name, error: error.message };
            }
            return { success: true, fileName: file.name, data };
        });

        const results = await Promise.all(uploadPromises);
        setIsUploading(false);

        const successfulUploads = results.filter(result => result.success).length;
        const failedUploads = results.filter(result => !result.success);

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
                failedUploads.map(fail => `Failed to upload ${fail.fileName}: ${fail.error}`)
            );
        }
    };

    const handleDelete = async (fileName: string) => {
        if (!userId) {
            setErrorMessages(['Unable to determine user. Please sign in again.']);
            return;
        }

        const filePath = `documents/${userId}/${fileName}`;

        const { data, error } = await supabase.storage
            .from('files')
            .remove([filePath]);

        if (error) {
            console.error('Delete Error:', error);
            setErrorMessages([`Failed to delete ${fileName}: ${error.message}`]);
        } else {
            setSuccessMessage(`${fileName} deleted successfully!`);
            setUploadedFiles(prevFiles => prevFiles.filter(file => file.name !== fileName));
        }
    };

    const handleView = (fileName: string) => {
        if (!userId) {
            setErrorMessages(['User not authenticated.']);
            return;
        }
        const filePath = `documents/${userId}/${fileName}`;

        // Get the public URL for the file
        const { data } = supabase.storage
            .from('files')
            .getPublicUrl(filePath);

        if (data?.publicUrl) {
            // Open the URL in a new browser tab
            window.open(data.publicUrl, '_blank');
        } else {
            setErrorMessages(['Could not generate public URL.']);
        }
    };

    // The new logout handler function
    const handleUserLogout = async () => {
        await handleLogout(router); // Pass the router instance to your shared logout function
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
                                Upload PDF, DOCX, and JPG files to your Supabase storage.
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
        </div>
    );
}