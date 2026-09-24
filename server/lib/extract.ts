import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function extractResumeText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const name = fileName.toLowerCase();
  if (mimeType === 'application/pdf' || name.endsWith('.pdf')) {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return (result.text ?? '').trim();
    } finally {
      await parser.destroy();
    }
  }
  if (mimeType === DOCX_MIME || name.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value ?? '').trim();
  }
  throw new Error('Unsupported file type. Upload a PDF or DOCX resume.');
}
