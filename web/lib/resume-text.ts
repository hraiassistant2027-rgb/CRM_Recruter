import 'server-only';

// Отримання тексту з файлу резюме на сервері.
// PDF — unpdf (pdf.js), DOCX — mammoth, TXT/RTF — напряму. Сканам (JPG/PNG, PDF-картинки) потрібне
// розпізнавання зображень — воно з'явиться разом з AI-обробкою.

const MAX_TEXT = 200_000;

function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\'([0-9a-f]{2})/gi, (_m, hex) => {
      const code = parseInt(hex, 16);
      // Типове кодування українських RTF — Windows-1251
      return new TextDecoder('windows-1251').decode(new Uint8Array([code]));
    })
    .replace(/\\u(-?\d+)\??/g, (_m, n) => String.fromCharCode(Number(n) < 0 ? Number(n) + 65536 : Number(n)))
    .replace(/\{\\\*[^{}]*\}/g, '')
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '');
}

// Текст PDF зі збереженням рядків: ім'я, телефон, місто зазвичай стоять окремими рядками,
// і без розривів їх неможливо відрізнити від решти тексту
type PdfItem = { str?: string; transform?: number[]; width?: number; hasEOL?: boolean };

async function pdfText(bytes: Uint8Array): Promise<string> {
  const { getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const pages: string[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    let out = '';
    let lastY: number | null = null;
    let lastXEnd = 0;
    for (const raw of content.items as PdfItem[]) {
      if (typeof raw.str !== 'string' || !raw.transform) continue;
      const x = raw.transform[4];
      const y = raw.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        if (!out.endsWith('\n')) out += '\n';
      } else if (out && !out.endsWith('\n') && !out.endsWith(' ') && raw.str && !raw.str.startsWith(' ') && x - lastXEnd > 1) {
        out += ' ';
      }
      out += raw.str;
      lastY = y;
      lastXEnd = x + (raw.width ?? 0);
      if (raw.hasEOL) out += '\n';
    }
    pages.push(out);
  }
  return pages.join('\n');
}

export async function extractResumeText(bytes: Uint8Array, ext: string): Promise<string | null> {
  try {
    let text = '';
    if (ext === 'pdf') {
      text = await pdfText(bytes);
    } else if (ext === 'docx') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
      text = result.value;
    } else if (ext === 'txt') {
      text = new TextDecoder('utf-8').decode(bytes);
      if (text.includes('�')) text = new TextDecoder('windows-1251').decode(bytes);
    } else if (ext === 'rtf') {
      text = rtfToText(new TextDecoder('latin1').decode(bytes));
    } else {
      return null;
    }
    text = text.replace(/\u0000/g, '').replace(/[ \t]+\n/g, '\n').trim();
    return text.length >= 20 ? text.slice(0, MAX_TEXT) : null;
  } catch (error) {
    console.error('[resume-text]', ext, error instanceof Error ? error.message : error);
    return null;
  }
}

// Безпечний HTML для перегляду DOCX: лише базові теги без атрибутів (mammoth уже екранує текст)
const ALLOWED = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'br', 'sup', 'sub']);

export async function docxToSafeHtml(bytes: Uint8Array): Promise<string | null> {
  try {
    const mammoth = await import('mammoth');
    const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
    return value.replace(/<(\/?)([a-zA-Z0-9]+)[^>]*>/g, (_m, slash: string, tag: string) =>
      ALLOWED.has(tag.toLowerCase()) ? `<${slash}${tag.toLowerCase()}>` : '',
    );
  } catch (error) {
    console.error('[docx-html]', error instanceof Error ? error.message : error);
    return null;
  }
}
