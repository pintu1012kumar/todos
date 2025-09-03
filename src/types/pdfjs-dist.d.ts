interface PDFTextItem { str: string }
interface PDFTextContent { items: PDFTextItem[] }
interface PDFPageProxy { getTextContent(options?: unknown): Promise<PDFTextContent> }
interface PDFDocumentProxy { numPages: number; getPage(pageNumber: number): Promise<PDFPageProxy> }
interface PDFGlobalWorkerOptions { workerSrc: string }
interface PDFJSStatic {
  version?: string;
  GlobalWorkerOptions: PDFGlobalWorkerOptions;
  getDocument(params: { data: ArrayBuffer }): { promise: Promise<PDFDocumentProxy> };
}

declare module 'pdfjs-dist/build/pdf' {
  const pdfjs: PDFJSStatic;
  export default pdfjs;
}

declare module 'pdfjs-dist/legacy/build/pdf' {
  const pdfjs: PDFJSStatic;
  export default pdfjs;
}

declare module 'pdfjs-dist/build/pdf.mjs' {
  const pdfjs: PDFJSStatic;
  export default pdfjs;
}


