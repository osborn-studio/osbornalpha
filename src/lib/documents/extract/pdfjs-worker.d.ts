// Ambient type for the pdf.js worker module: pdfjs-dist 4.x ships no .d.mts for it. Imported only for
// its side effect (globalThis.pdfjsWorker = {WorkerMessageHandler}); see extract/pdf.ts.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs';
