import mammoth from "mammoth";
import { supabase } from "../supabase-client";

export interface UploadedFile {
  name: string;
  id: string;
}

const CONTACT_RE = /@|twitter|linkedin|github|\d{7,}|\.com/i;
const SECTION_RE = /(technical skills|experience|projects|education)/i;

// Minimal pdf.js types
interface PdfTextItem {
  str: string;
  transform: number[];
  fontName: string;
  width: number;
  height: number;
}
interface PdfTextContent {
  items: PdfTextItem[];
}
interface PdfPageProxy {
  getTextContent(options?: {
    normalizeWhitespace?: boolean;
    disableCombineTextItems?: boolean;
  }): Promise<PdfTextContent>;
}
interface PdfDocumentProxy {
  numPages: number;
  getPage(pageNumber: number): Promise<PdfPageProxy>;
}
interface PdfJsLib {
  version?: string;
  GlobalWorkerOptions: { workerSrc: string };
  disableWorker?: boolean;
  getDocument(params: { data: ArrayBuffer }): {
    promise: Promise<PdfDocumentProxy>;
  };
}

let pdfjsLoader: Promise<PdfJsLib> | null = null;
export const loadPdfJsFromCdn = (): Promise<PdfJsLib> => {
  if (typeof window === "undefined")
    return Promise.reject(new Error("No window"));
  if (pdfjsLoader) return pdfjsLoader;
  pdfjsLoader = new Promise<PdfJsLib>((resolve, reject) => {
    const w = window as unknown as { pdfjsLib?: PdfJsLib };
    if (w.pdfjsLib) return resolve(w.pdfjsLib);
    const script = document.createElement("script");
    script.src = "/pdf.min.js";
    script.async = true;
    script.onload = () =>
      resolve((window as unknown as { pdfjsLib: PdfJsLib }).pdfjsLib);
    script.onerror = () => {
      const cdn = document.createElement("script");
      cdn.src =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js";
      cdn.async = true;
      cdn.onload = () =>
        resolve((window as unknown as { pdfjsLib: PdfJsLib }).pdfjsLib);
      cdn.onerror = () => reject(new Error("Failed to load pdf.js"));
      document.head.appendChild(cdn);
    };
    document.head.appendChild(script);
  });
  return pdfjsLoader;
};

// Helper: Get CSS styles from font properties
const getStyleFromFont = (item: PdfTextItem): string => {
  let styles = "";
  const fontSize = Math.max(12, item.transform[3]);
  const isBold =
    item.fontName.toLowerCase().includes("bold") ||
    item.fontName.toLowerCase().includes("black") ||
    item.fontName.toLowerCase().includes("semibold");
  const isItalic =
    item.fontName.toLowerCase().includes("italic") ||
    item.fontName.toLowerCase().includes("oblique");

  styles += `font-size: ${fontSize}px; `;
  styles += `font-weight: ${isBold ? "700" : "400"}; `;
  if (isItalic) {
    styles += "font-style: italic; ";
  }
  if (item.fontName && !item.fontName.includes("+")) {
    styles += `font-family: "${item.fontName}", Arial, sans-serif; `;
  }
  return styles;
};

export const convertFileUrlToHtml = async (
  fileUrl: string,
  fileType: string
): Promise<string> => {
  const response = await fetch(fileUrl);
  if (!response.ok) throw new Error(`HTTP error ${response.status}`);

  if (fileType === "pdf") {
    const pdfjsLib: PdfJsLib = await loadPdfJsFromCdn();
    try {
      const headLocal = await fetch("/pdf.worker.min.js", { method: "HEAD" });
      if (headLocal.ok) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js";
      } else {
        const headCdn = await fetch(
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js",
          { method: "HEAD" }
        );
        if (headCdn.ok) {
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
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
      const content = await page.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      });
      const items = content.items as PdfTextItem[];

      // Group items by lines (Y position)
      const lines: { y: number; items: PdfTextItem[] }[] = [];
      const tolerance = 2;
      items.forEach((it: PdfTextItem) => {
        const [, , , , , y] = it.transform as number[];
        let line = lines.find((l) => Math.abs(l.y - y) <= tolerance);
        if (!line) {
          line = { y, items: [] };
          lines.push(line);
        }
        line.items.push(it);
      });
      lines.sort((a, b) => b.y - a.y);

      // Table detection helpers
      const isTableRow = (line: { items: PdfTextItem[] }) => {
        if (line.items.length < 2) return false;
        let prevX = line.items[0].transform[4];
        let colGaps = 0;
        for (let i = 1; i < line.items.length; i++) {
          const x = line.items[i].transform[4];
          if (x - prevX > 40) colGaps++;
          prevX = x;
        }
        return colGaps >= 1;
      };

      const renderTable = (rows: PdfTextItem[][]) => {
        let html = `<table class="pdf-table" style="margin:16px 0;width:100%;border-collapse:collapse;">`;
        for (const row of rows) {
          html += "<tr>";
          for (const cell of row) {
            const isBold = cell.fontName.toLowerCase().includes("bold");
            html += `<td style="border:1px solid #333;padding:6px 8px;font-size:13px;${isBold ? "font-weight:700;" : ""}">${cell.str}</td>`;
          }
          html += "</tr>";
        }
        html += "</table>";
        return html;
      };

      let pageHtml = "";
      let tableRows: PdfTextItem[][] = [];

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        line.items.sort((a, b) => a.transform[4] - b.transform[4]);
        const lineText = line.items.map((item) => item.str).join(" ").trim();
        if (!lineText) continue;

        if (isTableRow(line)) {
          tableRows.push(line.items);
          // If next line is not a table row or end of lines, render the table
          const nextLine = lines[lineIdx + 1];
          if (!nextLine || !isTableRow(nextLine)) {
            if (tableRows.length > 0) {
              pageHtml += renderTable(tableRows);
            }
            tableRows = [];
          }
          continue;
        }

        // Not a table row, render any pending table
        if (tableRows.length > 0) {
          pageHtml += renderTable(tableRows);
          tableRows = [];
        }

        // Render normal line with bold/spacing if needed
        let customStyle = "";
        const customClassName = "";
        const isHeader =
          line.items.length === 1 &&
          (line.items[0].fontName.toLowerCase().includes("bold") ||
            line.items[0].fontName.toLowerCase().includes("black"));
        if (isHeader) {
          customStyle =
            "font-size:18px;font-weight:700;margin:12px 0 4px;text-align:left;";
        }
        let lineHtml = "";
        line.items.forEach((item, index) => {
          const str = item.str;
          if (!str.trim()) return;
          const isBold = item.fontName.toLowerCase().includes("bold");
          const style = `font-size:${Math.max(
            12,
            item.transform[3]
          )}px;${isBold ? "font-weight:700;" : ""}`;
          const previousItem = line.items[index - 1];
          let spacing = "";
          if (previousItem) {
            const prevX = previousItem.transform[4] + previousItem.width;
            const currentX = item.transform[4];
            const spaceWidth = currentX - prevX;
            if (spaceWidth > 2) {
              spacing = `<span style="display:inline-block;width:${Math.min(
                spaceWidth,
                20
              )}px;"></span>`;
            }
          }
          lineHtml += `${spacing}<span style="${style}">${str}</span>`;
        });

        pageHtml += `<div style="${customStyle}" class="${customClassName}">${lineHtml}</div>`;
      }

      // Render any remaining table at the end of the page
      if (tableRows.length > 0) {
        pageHtml += renderTable(tableRows);
      }

      htmlParts.push(pageHtml);
    }
    return `<div class="pdf-content">${htmlParts.join("<br/><br/>")}</div>`;
  }

  if (fileType === "docx") {
    const arrayBuffer = await response.arrayBuffer();

    // Define a stricter type for options
    interface MammothOptions {
      arrayBuffer: ArrayBuffer;
      convertImage?: ReturnType<typeof mammoth.images.imgElement>;
    }

    const options: MammothOptions = {
      arrayBuffer,
      convertImage: mammoth.images.imgElement((image) => {
        return image.read("base64").then((imageBuffer: string) => {
          const dataUri =
            "data:" + image.contentType + ";base64," + imageBuffer;
          return {
            src: dataUri,
            style:
              "max-width: 100%; height: auto; display: block; margin: 16px auto; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);",
          };
        });
      }),
    };

    // Enhanced mammoth conversion with image handling
    const result = await mammoth.convertToHtml(options);

    // Post-process the HTML output for additional enhancements
    let enhancedHtml = result.value;

    // Add custom classes and structure for better styling
    enhancedHtml = enhancedHtml
      // Enhance image structure with standardized sizing
      .replace(/<img([^>]*)>/g, '<img$1 class="docx-image">')

      // Enhance table structure
      .replace(/<table([^>]*)>/g, '<table$1 class="docx-table">')
      .replace(/<tr([^>]*)>/g, '<tr$1 class="docx-table-row">')
      .replace(/<td([^>]*)>/g, '<td$1 class="docx-table-cell">')
      .replace(/<th([^>]*)>/g, '<th$1 class="docx-table-header">')

      // Enhance paragraph structure
      .replace(/<p([^>]*)>/g, '<p$1 class="docx-paragraph">')

      // Enhance list structure
      .replace(/<ul([^>]*)>/g, '<ul$1 class="docx-list docx-list-unordered">')
      .replace(/<ol([^>]*)>/g, '<ol$1 class="docx-list docx-list-ordered">')
      .replace(/<li([^>]*)>/g, '<li$1 class="docx-list-item">')

      // Enhance text formatting
      .replace(/<strong([^>]*)>/g, '<strong$1 class="docx-strong">')
      .replace(/<em([^>]*)>/g, '<em$1 class="docx-emphasis">')
      .replace(/<a([^>]*)>/g, '<a$1 class="docx-link">');
      
    // Remove page break logic and apply new heading styles
    enhancedHtml = enhancedHtml
      // Replace the old heading logic and add new inline styles for smaller fonts
      .replace(
        /<h1([^>]*)>/g,
        '<h1$1 class="docx-heading docx-heading-1" style="font-size: 20px;">'
      )
      .replace(
        /<h2([^>]*)>/g,
        '<h2$1 class="docx-heading docx-heading-2" style="font-size: 18px;">'
      )
      .replace(
        /<h3([^>]*)>/g,
        '<h3$1 class="docx-heading docx-heading-3" style="font-size: 16px;">'
      )
      .replace(
        /<h4([^>]*)>/g,
        '<h4$1 class="docx-heading docx-heading-4" style="font-size: 14px;">'
      )
      .replace(
        /<h5([^>]*)>/g,
        '<h5$1 class="docx-heading docx-heading-5" style="font-size: 13px;">'
      )
      .replace(
        /<h6([^>]*)>/g,
        '<h6$1 class="docx-heading docx-heading-6" style="font-size: 12px;">'
      );
    
    // Add CSS for list item display
    const listStyles = `
      <style>
        .docx-list-unordered, .docx-list-ordered {
          /* Use padding to create space for markers, prevents text from overlapping */
          padding-left: 20px !important; 
          margin-left: 0 !important;
        }
        .docx-list-unordered {
          /* Force display of bullets */
          list-style-type: disc !important;
        }
        .docx-list-ordered {
          /* Force display of numbers */
          list-style-type: decimal !important;
        }
        /* Style for nested lists to ensure proper indentation */
        .docx-list-item ul, .docx-list-item ol {
            margin-top: 0;
            margin-bottom: 0;
        }
      </style>
    `;

    return `<div class="docx-content enhanced-docx">${listStyles}${enhancedHtml}</div>`;
  }

  throw new Error("Unsupported file type");
};

export const listUserFiles = async (
  userId: string
): Promise<UploadedFile[]> => {
  const folderPath = `documents/${userId}/`;
  const { data, error } = await supabase.storage.from("files").list(folderPath);
  if (error) throw error;
  type MaybeWithId = { name: string; id?: string };
  return (data || []).map((f) => {
    const obj = f as unknown as MaybeWithId;
    return { name: obj.name, id: obj.id ?? obj.name } as UploadedFile;
  });
};

export const uploadFilesForUser = async (userId: string, files: FileList) => {
  const uploadPromises = Array.from(files).map(async (file: File) => {
    // Use the original file name directly
    const fileName = file.name;
    const filePath = `documents/${userId}/${fileName}`;
    const { data, error } = await supabase.storage
      .from("files")
      .upload(filePath, file, { upsert: true }); // upsert allows overwriting if needed
    if (error)
      return { success: false, original: file.name, error: error.message };
    return { success: true, original: file.name, stored: fileName, data };
  });
  return Promise.all(uploadPromises);
};

export const deleteUserFile = async (userId: string, fileName: string) => {
  const filePath = `documents/${userId}/${fileName}`;
  const { error } = await supabase.storage.from("files").remove([filePath]);
  if (error) throw error;
};

export const getPublicUrlForUserFile = (
  userId: string,
  fileName: string
): string | null => {
  const filePath = `documents/${userId}/${fileName}`;
  const { data } = supabase.storage.from("files").getPublicUrl(filePath);
  return data?.publicUrl ?? null;
};