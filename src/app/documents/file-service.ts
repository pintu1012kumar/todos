import mammoth from "mammoth";
import { supabase } from "../supabase-client";

export interface UploadedFile {
  name: string;
  id: string;
}

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

// Enhanced function to get CSS styles from font properties
const getStyleFromFont = (item: PdfTextItem): string => {
  let styles = "";
  const scalingFactor = 1.0; // More accurate scaling
  const fontSize = Math.max(8, item.transform[3] * scalingFactor); // Minimum font size
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

  // Add font family if available
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
      const content = await page.getTextContent();
      const items = content.items as PdfTextItem[];

      // Group items by lines with better tolerance
      const lines: { y: number; items: PdfTextItem[] }[] = [];
      const tolerance = 3; // Increased tolerance for better line grouping

      items.forEach((it: PdfTextItem) => {
        const [, , , , , y] = it.transform as number[];
        let line = lines.find((l) => Math.abs(l.y - y) <= tolerance);
        if (!line) {
          line = { y, items: [] };
          lines.push(line);
        }
        line.items.push(it);
      });

      // Sort lines from top to bottom
      lines.sort((a, b) => b.y - a.y);

      let pageHtml = "";
      let currentSection = "";
      let tableData: {
        rows: PdfTextItem[][];
        startY: number;
        endY: number;
      } | null = null;

      // Function to detect if a line looks like a table row
      const isTableRow = (line: {
        y: number;
        items: PdfTextItem[];
      }): boolean => {
        if (line.items.length < 2) return false;

        const lineText = line.items
          .map((item) => item.str)
          .join(" ")
          .trim();

        // Check for skill section patterns (Programming Languages:, Frameworks:, etc.)
        const isSkillSection =
          /^(Programming Languages|Frameworks|Tools|UI Tools|ORM and Database|Cloud and Platforms):/.test(
            lineText
          );

        // Check for contact info patterns
        const isContactInfo =
          /^[^:]+@[^:]+|^\d{10}|\.com|Twitter|LinkedIn|GitHub/.test(lineText);

        // Check for experience patterns
        const isExperience =
          /(Intern|Full stack|June|March|May|July|present|on-site|Remote)/.test(
            lineText
          );

        // Check for project patterns
        const isProject = /^\d+x[A-Za-z]+|Tech Stack|Live Link|GitHub/.test(
          lineText
        );

        // Check for education patterns
        const isEducation =
          /(Engineering|College|University|B-tech|Higher Secondary)/.test(
            lineText
          );

        // Check if items are spread horizontally (table-like)
        const firstX = line.items[0].transform[4];
        const lastX = line.items[line.items.length - 1].transform[4];
        const spread = lastX - firstX;

        // Check for common table patterns
        const hasNumbers = /\d+/.test(lineText);
        const hasColons = lineText.includes(":");
        const hasMultipleWords = lineText.split(/\s+/).length >= 2;
        const hasTableKeywords =
          /(college|university|students|graduating|change|item|needed|total|undergraduate|graduate)/i.test(
            lineText
          );
        const hasTableStructure =
          lineText.includes(":") ||
          !!lineText.match(/\d+\s*[-+]\s*\d+/) ||
          !!lineText.match(/\w+\s*:\s*\d+/);

        // Restrict to skill section lines only for markdown table rendering
        return isSkillSection;
      };

      // Function to render table
      const renderTable = (table: {
        rows: PdfTextItem[][];
        startY: number;
        endY: number;
      }): string => {
        if (table.rows.length === 0) return "";

        // We will return a markdown table wrapped with markers to be
        // post-processed by ReactMarkdown in the viewer.
        const firstRowText = table.rows[0]
          .map((item) => item.str)
          .join(" ")
          .trim();
        const isSkillTable =
          /^(Programming Languages|Frameworks|Tools|UI Tools|ORM and Database|Cloud and Platforms):/.test(
            firstRowText
          );

        let md = "<!--MD_TABLE_START-->\n\n";
        // Always render as 2-column markdown for skills
        md += `| Category | Details |\n| --- | --- |\n`;
        table.rows.forEach((row) => {
          const rowText = row
            .map((item) => item.str)
            .join(" ")
            .trim();
          const colonIndex = rowText.indexOf(":");
          if (colonIndex > -1) {
            const category = rowText.substring(0, colonIndex).trim();
            const skills = rowText.substring(colonIndex + 1).trim();
            md += `| ${category} | ${skills} |\n`;
          } else {
            md += `|  | ${rowText} |\n`;
          }
        });
        md += "\n\n<!--MD_TABLE_END-->";
        return md;
      };

      for (const line of lines) {
        // Sort items left to right
        line.items.sort((a, b) => a.transform[4] - b.transform[4]);
        let lineText = line.items
          .map((item) => item.str)
          .join(" ")
          .trim();

        if (!lineText) continue;

        // Check if this line is part of a table
        if (isTableRow(line)) {
          if (!tableData) {
            tableData = { rows: [], startY: line.y, endY: line.y };
          }
          tableData.rows.push(line.items);
          tableData.endY = line.y;
          continue; // Skip normal processing for table rows
        } else if (tableData) {
          // Check if we should continue the table (for skill sections)
          const lineText = line.items
            .map((item) => item.str)
            .join(" ")
            .trim();
          const isSkillContinuation =
            /^(Programming Languages|Frameworks|Tools|UI Tools|ORM and Database|Cloud and Platforms):/.test(
              lineText
            );

          if (isSkillContinuation) {
            // Continue the table
            tableData.rows.push(line.items);
            tableData.endY = line.y;
            continue;
          } else {
            // End of table, render it
            pageHtml += renderTable(tableData);
            tableData = null;
          }
        }

        // Identify and apply specific styles to title, contact and headings
        let customStyle = "";
        let customClassName = "";

        const lineIndex = lines.indexOf(line);
        const looksLikeName = /^[A-Z][a-z]+\s+[A-Z][a-z]+$/.test(lineText) && lineIndex <= 2;
        const looksLikeContact =
          (lineText.includes("@") || /\d{7,}/.test(lineText) || /(LinkedIn|Twitter|GitHub)/i.test(lineText)) &&
          lineIndex <= 6;

        if (looksLikeName) {
          customClassName = "pdf-title";
          customStyle = `font-size: 28px; font-weight: 700; text-align: center; margin: 6px 0 10px;`;
        } else if (looksLikeContact) {
          customClassName = "pdf-contact-line";
          customStyle = `font-size: 13px; color: #374151; text-align: center; margin-bottom: 12px;`;
        } else if (
          lineText.includes("TECHNICAL SKILLS") ||
          lineText.includes("Experience") ||
          lineText.includes("Projects") ||
          lineText.includes("Education")
        ) {
          customStyle = `font-size: 16px; font-weight: 700; letter-spacing: .3px; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 4px; margin: 14px 0 8px;`;
          customClassName = "pdf-heading";
        }

        let lineHtml = "";
        line.items.forEach((item, index) => {
          const str = item.str;
          if (!str.trim()) return;

          const style = getStyleFromFont(item);
          const previousItem = line.items[index - 1];
          let spacing = "";

          // Calculate spacing between words
          if (previousItem) {
            const prevX = previousItem.transform[4] + previousItem.width;
            const currentX = item.transform[4];
            const spaceWidth = currentX - prevX;
            if (spaceWidth > 2) {
              spacing = `<span style="display: inline-block; width: ${Math.min(
                spaceWidth,
                20
              )}px;"></span>`;
            }
          }

          lineHtml += `${spacing}<span style="${style}">${str}</span>`;
        });

        // Wrap each line in appropriate container
        pageHtml += `<div style="${customStyle}" class="${customClassName}">${lineHtml}</div>`;
      }

      // Render any remaining table
      if (tableData) {
        pageHtml += renderTable(tableData);
      }

      htmlParts.push(pageHtml);
    }
    return `<div class="pdf-content">${htmlParts.join("<br/><br/>")}</div>`;
  }

  if (fileType === "docx") {
    const arrayBuffer = await response.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    return `<div class="docx-content">${result.value}</div>`;
  }

  throw new Error("Unsupported file type");
};

export const listUserFiles = async (
  userId: string
): Promise<UploadedFile[]> => {
  const folderPath = `documents/${userId}/`;
  const { data, error } = await supabase.storage.from("files").list(folderPath);
  if (error) throw error; // Supabase StorageObject does not guarantee an id field; fall back to name
  type MaybeWithId = { name: string; id?: string };
  return (data || []).map((f) => {
    const obj = f as unknown as MaybeWithId;
    return { name: obj.name, id: obj.id ?? obj.name } as UploadedFile;
  });
};

export const uploadFilesForUser = async (userId: string, files: FileList) => {
  const uploadPromises = Array.from(files).map(async (file: File) => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}.${fileExt}`;
    const filePath = `documents/${userId}/${fileName}`;
    const { data, error } = await supabase.storage
      .from("files")
      .upload(filePath, file);
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
