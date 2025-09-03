import mammoth from 'mammoth';
import { supabase } from '../supabase-client';

export interface UploadedFile {
    name: string;
    id: string;
}


let pdfjsLoader: Promise<any> | null = null;
export const loadPdfJsFromCdn = (): Promise<any> => {
    if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
    if (pdfjsLoader) return pdfjsLoader;
    pdfjsLoader = new Promise((resolve, reject) => {
        const w = window as any;
        if (w.pdfjsLib) return resolve(w.pdfjsLib);
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js';
        script.async = true;
        script.onload = () => resolve((window as any).pdfjsLib);
        script.onerror = () => reject(new Error('Failed to load pdf.js'));
        document.head.appendChild(script);
    });
    return pdfjsLoader;
};

export const convertFileUrlToText = async (fileUrl: string, fileType: string): Promise<string> => {
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);

    if (fileType === 'pdf') {
        const pdfjsLib: any = await loadPdfJsFromCdn();
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
        const arrayBuffer = await response.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        const lines: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false });

            const buckets: { y: number; items: { x: number; str: string }[] }[] = [];
            const tolerance = 2;
            (content.items as any[]).forEach((it: any) => {
                const [, , , , x, y] = it.transform as number[];
                let bucket = buckets.find(b => Math.abs(b.y - y) <= tolerance);
                if (!bucket) {
                    bucket = { y, items: [] };
                    buckets.push(bucket);
                }
                bucket.items.push({ x, str: it.str });
            });
            buckets.sort((a, b) => b.y - a.y);
            for (const bucket of buckets) {
                bucket.items.sort((a, b) => a.x - b.x);
                const line = bucket.items.map(w => w.str).join(' ');
                lines.push(line.trim());
            }
            lines.push('');
        }
        return lines.join('\n');
    }

    if (fileType === 'docx') {
        const arrayBuffer = await response.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        return result.value.trim();
    }

    throw new Error('Unsupported file type');
};

export const listUserFiles = async (userId: string): Promise<UploadedFile[]> => {
    const folderPath = `documents/${userId}/`;
    const { data, error } = await supabase.storage.from('files').list(folderPath);
    if (error) throw error;
    return (data || []).map((f) => ({ name: f.name, id: (f as any).id ?? f.name }));
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


