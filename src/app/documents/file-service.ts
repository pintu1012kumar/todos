// file-service.ts

import mammoth from 'mammoth';
import { supabase } from '../supabase-client';

export interface UploadedFile {
    name: string;
    id: string;
}

// Minimal pdf.js types used in this module
interface PdfTextItem {
    str: string;
    transform: number[];
    fontName: string;
    width: number;
    height: number;
}
interface PdfTextContent { items: PdfTextItem[]; }
interface PdfPageProxy { getTextContent(options?: { normalizeWhitespace?: boolean; disableCombineTextItems?: boolean }): Promise<PdfTextContent>; }
interface PdfDocumentProxy { numPages: number; getPage(pageNumber: number): Promise<PdfPageProxy>; }
interface PdfJsLib {
    version?: string;
    GlobalWorkerOptions: { workerSrc: string };
    disableWorker?: boolean;
    getDocument(params: { data: ArrayBuffer }): { promise: Promise<PdfDocumentProxy> };
}

let pdfjsLoader: Promise<PdfJsLib> | null = null;
export const loadPdfJsFromCdn = (): Promise<PdfJsLib> => {
    if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
    if (pdfjsLoader) return pdfjsLoader;
    pdfjsLoader = new Promise<PdfJsLib>((resolve, reject) => {
        const w = window as unknown as { pdfjsLib?: PdfJsLib };
        if (w.pdfjsLib) return resolve(w.pdfjsLib);
        const script = document.createElement('script');
        script.src = '/pdf.min.js';
        script.async = true;
        script.onload = () => resolve((window as unknown as { pdfjsLib: PdfJsLib }).pdfjsLib);
        script.onerror = () => {
            const cdn = document.createElement('script');
            cdn.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
            cdn.async = true;
            cdn.onload = () => resolve((window as unknown as { pdfjsLib: PdfJsLib }).pdfjsLib);
            cdn.onerror = () => reject(new Error('Failed to load pdf.js'));
            document.head.appendChild(cdn);
        };
        document.head.appendChild(script);
    });
    return pdfjsLoader;
};

// New function to identify bold and italic text
const isBold = (fontName: string): boolean => {
    return fontName.toLowerCase().includes('bold') || fontName.toLowerCase().includes('black');
};

const isItalic = (fontName: string): boolean => {
    return fontName.toLowerCase().includes('italic') || fontName.toLowerCase().includes('oblique');
};

export const convertFileUrlToHtml = async (fileUrl: string, fileType: string): Promise<string> => {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);

    if (fileType === 'pdf') {
        const pdfjsLib: PdfJsLib = await loadPdfJsFromCdn();
        try {
            const headLocal = await fetch('/pdf.worker.min.js', { method: 'HEAD' });
            if (headLocal.ok) {
                pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
            } else {
                const headCdn = await fetch('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js', { method: 'HEAD' });
                if (headCdn.ok) {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
                } else {
                    pdfjsLib.disableWorker = true;
                }
            }
        } catch {
            pdfjsLib.disableWorker = true;
        }

        const arrayBuffer = await response.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const htmlParts: string[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            
            // Find the most common font size as a baseline for paragraph text
            const fontSizes = (content.items as PdfTextItem[]).map(item => item.transform[3]);
            const baselineFontSize = fontSizes.length > 0 ? fontSizes.sort((a, b) => b - a)[Math.floor(fontSizes.length / 2)] : 12;

            const buckets: { y: number; items: PdfTextItem[] }[] = [];
            const tolerance = 2;
            (content.items as PdfTextItem[]).forEach((it: PdfTextItem) => {
                const [, , , , x, y] = it.transform as number[];
                let bucket = buckets.find(b => Math.abs(b.y - y) <= tolerance);
                if (!bucket) {
                    bucket = { y, items: [] };
                    buckets.push(bucket);
                }
                bucket.items.push(it);
            });
            buckets.sort((a, b) => b.y - a.y);

            let pageHtml = '';
            for (const bucket of buckets) {
                bucket.items.sort((a, b) => a.transform[4] - b.transform[4]);
                
                let lineHtml = '';
                const firstItem = bucket.items[0];
                if (!firstItem) continue;

                const isHeading = firstItem.transform[3] > baselineFontSize * 1.2 && isBold(firstItem.fontName);
                const isH1 = firstItem.transform[3] > baselineFontSize * 1.5;

                for (const item of bucket.items) {
                    const str = item.str.trim();
                    if (!str) continue;
                    
                    let wrappedStr = str;
                    if (isBold(item.fontName)) {
                        wrappedStr = `<strong>${wrappedStr}</strong>`;
                    }
                    if (isItalic(item.fontName)) {
                        wrappedStr = `<em>${wrappedStr}</em>`;
                    }

                    lineHtml += `${wrappedStr} `;
                }

                if (isH1) {
                    pageHtml += `<h1>${lineHtml.trim()}</h1>`;
                } else if (isHeading) {
                    pageHtml += `<h2>${lineHtml.trim()}</h2>`;
                } else {
                    pageHtml += `<p>${lineHtml.trim()}</p>`;
                }
            }
            htmlParts.push(pageHtml);
        }
        return `<div>${htmlParts.join('<br/><br/>')}</div>`;
    }

    if (fileType === 'docx') {
        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        return result.value;
    }

    throw new Error('Unsupported file type');
};

export const listUserFiles = async (userId: string): Promise<UploadedFile[]> => {
    const folderPath = `documents/${userId}/`;
    const { data, error } = await supabase.storage.from('files').list(folderPath);
    if (error) throw error;
    // Supabase StorageObject does not guarantee an id field; fall back to name
    type MaybeWithId = { name: string; id?: string };
    return (data || []).map((f) => {
        const obj = f as unknown as MaybeWithId;
        return { name: obj.name, id: obj.id ?? obj.name } as UploadedFile;
    });
};

export const uploadFilesForUser = async (userId: string, files: FileList) => {
    const uploadPromises = Array.from(files).map(async (file: File) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `documents/${userId}/${fileName}`;
        const { data, error } = await supabase.storage.from('files').upload(filePath, file);
        if (error) return { success: false, original: file.name, error: error.message };
        return { success: true, original: file.name, stored: fileName, data };
    });
    return Promise.all(uploadPromises);
};

export const deleteUserFile = async (userId: string, fileName: string) => {
    const filePath = `documents/${userId}/${fileName}`;
    const { error } = await supabase.storage.from('files').remove([filePath]);
    if (error) throw error;
};

export const getPublicUrlForUserFile = (userId: string, fileName: string): string | null => {
    const filePath = `documents/${userId}/${fileName}`;
    const { data } = supabase.storage.from('files').getPublicUrl(filePath);
    return data?.publicUrl ?? null;
};