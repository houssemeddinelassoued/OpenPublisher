import type { CanvasElementData, PubDocument, PubImportReport } from './model';

const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * Generates a realistic synthetic OLE2 .pub binary buffer in memory so users can test
 * the binary OLE2/Quill text & JPEG extractor without needing an external file on disk.
 */
export function createSamplePubBinaryBuffer(): { fileName: string; buffer: ArrayBuffer } {
  const stories = [
    'ANNUAL HERITAGE FESTIVAL 2025',
    'Imported from Legacy Microsoft Publisher (.PUB) Binary Stream',
    'Saturday, November 15 • Civic Gardens & Printmakers Pavilion',
    'Featuring archival letterpress demonstrations, community choir performances, autumn botanical exhibitions, and local culinary stalls.',
    'NOTE: Verify multi-column flow and custom BorderArt against original Publisher layout.'
  ];

  const totalBytes = 4096;
  const buf = new ArrayBuffer(totalBytes);
  const view = new Uint8Array(buf);

  // 1. Write OLE2 Compound Document Magic Header
  OLE2_SIGNATURE.forEach((byte, idx) => {
    view[idx] = byte;
  });

  // 2. Write simulated Escher/MSPHeader metadata marker in ASCII
  const marker = 'MSPublisher.Document.2010.QuillSubstream';
  for (let i = 0; i < marker.length; i++) {
    view[64 + i] = marker.charCodeAt(i);
  }

  // 3. Encode UTF-16LE text streams (how Publisher Quill stores text runs)
  let offset = 256;
  for (const story of stories) {
    for (let i = 0; i < story.length; i++) {
      view[offset] = story.charCodeAt(i) & 0xff;
      view[offset + 1] = 0x00;
      offset += 2;
    }
    // Null separator run
    offset += 32;
  }

  return {
    fileName: 'Heritage_Festival_2010_Archive.pub',
    buffer: buf
  };
}

/**
 * Parses a binary .pub ArrayBuffer by inspecting OLE2 headers, scanning for UTF-16LE
 * Quill text stories and printable ASCII segments, and carving embedded JPEG streams.
 */
export async function parsePublisherBinaryBuffer(
  fileName: string,
  buffer: ArrayBuffer
): Promise<PubImportReport> {
  const bytes = new Uint8Array(buffer);
  const ole2MagicValid = OLE2_SIGNATURE.every((b, idx) => bytes[idx] === b);

  const extractedStrings: string[] = [];

  // 1. Scan for UTF-16LE text runs (standard in Publisher 2000-2013 Quill streams)
  let currentUtf16 = '';
  for (let i = 0; i < bytes.length - 1; i += 2) {
    const low = bytes[i];
    const high = bytes[i + 1];
    if (high === 0 && ((low >= 32 && low <= 126) || low === 10 || low === 13)) {
      currentUtf16 += String.fromCharCode(low);
    } else if (low === 0x22 && high === 0x20) {
      currentUtf16 += '•';
    } else {
      const cleaned = currentUtf16.trim();
      if (cleaned.length >= 10 && /[a-zA-Z]{3,}/.test(cleaned)) {
        extractedStrings.push(cleaned);
      }
      currentUtf16 = '';
    }
  }
  if (currentUtf16.trim().length >= 10) {
    extractedStrings.push(currentUtf16.trim());
  }

  // 2. Scan for ASCII text runs if UTF-16LE yielded few blocks
  if (extractedStrings.length < 2) {
    let currentAscii = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b >= 32 && b <= 126) {
        currentAscii += String.fromCharCode(b);
      } else {
        const cleaned = currentAscii.trim();
        if (
          cleaned.length >= 14 &&
          /[a-zA-Z]{4,}/.test(cleaned) &&
          !cleaned.startsWith('MSPublisher') &&
          !cleaned.includes('Root Entry')
        ) {
          extractedStrings.push(cleaned);
        }
        currentAscii = '';
      }
    }
  }

  // Deduplicate and filter noise
  const uniqueBlocks = Array.from(new Set(extractedStrings)).slice(0, 12);
  if (uniqueBlocks.length === 0) {
    uniqueBlocks.push(
      `Imported Publication: ${fileName.replace(/\.pub$/i, '')}`,
      'Binary stream contained compressed or non-standard Escher records. Use the canvas tools to touch up layout blocks.'
    );
  }

  // 3. Scan for embedded JPEG streams (FF D8 FF ... FF D9)
  const extractedImageUrls: string[] = [];
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      let end = i + 3;
      while (end < bytes.length - 1 && !(bytes[end] === 0xff && bytes[end + 1] === 0xd9)) {
        end++;
      }
      if (end < bytes.length - 1 && end - i > 256) {
        const jpegSlice = bytes.slice(i, end + 2);
        const blob = new Blob([jpegSlice], { type: 'image/jpeg' });
        extractedImageUrls.push(URL.createObjectURL(blob));
        i = end + 1;
      }
    }
  }

  // Build canvas elements from extracted blocks
  const elements: CanvasElementData[] = [
    {
      id: `pub-border-${Date.now()}`,
      type: 'border',
      x: 28,
      y: 28,
      width: 738,
      height: 1066,
      zIndex: 1,
      strokeColor: '#4f46e5',
      strokeWidth: 2,
      borderPreset: 'classic'
    },
    {
      id: `pub-badge-${Date.now()}`,
      type: 'shape',
      shapeVariant: 'rectangle',
      x: 48,
      y: 48,
      width: 698,
      height: 44,
      zIndex: 2,
      fillColor: '#eef2ff',
      strokeColor: '#c7d2fe',
      strokeWidth: 1,
      borderRadius: 6
    },
    {
      id: `pub-meta-${Date.now()}`,
      type: 'text',
      x: 60,
      y: 58,
      width: 674,
      height: 26,
      zIndex: 3,
      text: `IMPORTED .PUB FILE: ${fileName}  •  ${ole2MagicValid ? 'OLE2 Compound Binary Verified' : 'Raw Binary Stream'}  •  Please verify layout fidelity`,
      fontFamily: 'Inter, sans-serif',
      fontSize: 11,
      fontColor: '#4338ca',
      bold: true,
      textAlign: 'left',
      fillColor: 'transparent',
      strokeColor: 'transparent',
      strokeWidth: 0
    }
  ];

  let cursorY = 115;
  uniqueBlocks.forEach((block, idx) => {
    const isHeading = idx === 0;
    const height = isHeading ? 72 : Math.max(64, Math.ceil(block.length / 65) * 28 + 24);
    elements.push({
      id: `pub-txt-${Date.now()}-${idx}`,
      type: 'text',
      x: 48,
      y: cursorY,
      width: 698,
      height,
      zIndex: idx + 4,
      text: block,
      fontFamily: isHeading ? 'Georgia, serif' : 'Inter, sans-serif',
      fontSize: isHeading ? 28 : 15,
      fontColor: isHeading ? '#0f172a' : '#334155',
      bold: isHeading,
      textAlign: 'left',
      fillColor: isHeading ? 'transparent' : '#f8fafc',
      strokeColor: isHeading ? 'transparent' : '#e2e8f0',
      strokeWidth: isHeading ? 0 : 1
    });
    cursorY += height + 18;
  });

  extractedImageUrls.forEach((imgUrl, idx) => {
    elements.push({
      id: `pub-img-${Date.now()}-${idx}`,
      type: 'image',
      x: 48,
      y: Math.min(cursorY, 780),
      width: 320,
      height: 220,
      zIndex: 25 + idx,
      imageUrl: imgUrl,
      strokeColor: '#cbd5e1',
      strokeWidth: 1
    });
    cursorY += 240;
  });

  const generatedDoc: PubDocument = {
    id: `imported-pub-${Date.now()}`,
    title: fileName.replace(/\.[^.]+$/, ''),
    category: 'Imported .PUB Document',
    updatedAt: new Date().toISOString(),
    pageSize: 'A4',
    widthMm: 210,
    heightMm: 297,
    orientation: 'portrait',
    marginMm: 15,
    pages: [
      {
        id: `page-pub-1`,
        name: 'Imported Page 1',
        background: '#ffffff',
        backgroundPattern: 'none',
        elements
      }
    ]
  };

  const warnings: string[] = [
    'Complex multi-frame text autoflow links and proprietary BorderArt are converted into independent editable frames.',
    'Always verify files with years of archival work side-by-side against Microsoft Publisher.'
  ];
  if (!ole2MagicValid) {
    warnings.unshift(
      'File header did not match standard OLE2 signature (D0 CF 11 E0); used heuristic text-stream recovery.'
    );
  }

  return {
    fileName,
    fileSize: buffer.byteLength,
    formatDetected: ole2MagicValid ? 'OLE2-PUB' : 'RAW-BINARY-PUB',
    ole2MagicValid,
    extractedTextBlocks: uniqueBlocks,
    extractedImagesCount: extractedImageUrls.length,
    detectedPageSize: {
      preset: 'A4',
      widthMm: 210,
      heightMm: 297,
      orientation: 'portrait'
    },
    warnings,
    generatedDoc
  };
}

/**
 * Fallback importer for .html, .htm, .docx, and plain text files
 */
export async function parseFallbackDocumentFile(file: File): Promise<PubImportReport> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const textContent = await file.text();
  const blocks: string[] = [];

  if (ext === 'html' || ext === 'htm') {
    const parser = new DOMParser();
    const dom = parser.parseFromString(textContent, 'text/html');
    const nodes = dom.querySelectorAll('h1, h2, h3, p, li, td');
    nodes.forEach((n) => {
      const t = n.textContent?.trim();
      if (t && t.length > 2) blocks.push(t);
    });
  } else {
    // Extract readable XML/text runs from .docx or plain text
    const cleaned = textContent
      .replace(/<[^>]+>/g, '\n')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s.length > 3 && /[a-zA-Z]{2,}/.test(s));
    blocks.push(...cleaned.slice(0, 15));
  }

  if (blocks.length === 0) {
    blocks.push(`Imported Fallback Document (${file.name})`, 'Edit this frame on the canvas.');
  }

  const elements: CanvasElementData[] = blocks.slice(0, 10).map((b, i) => ({
    id: `fb-el-${Date.now()}-${i}`,
    type: 'text',
    x: 50,
    y: 60 + i * 92,
    width: 690,
    height: 76,
    zIndex: i + 1,
    text: b,
    fontFamily: i === 0 ? 'Georgia, serif' : 'Inter, sans-serif',
    fontSize: i === 0 ? 26 : 14,
    fontColor: '#0f172a',
    bold: i === 0,
    textAlign: 'left',
    fillColor: i === 0 ? 'transparent' : '#f8fafc',
    strokeColor: i === 0 ? 'transparent' : '#e2e8f0',
    strokeWidth: i === 0 ? 0 : 1
  }));

  const generatedDoc: PubDocument = {
    id: `imported-fb-${Date.now()}`,
    title: file.name.replace(/\.[^.]+$/, ''),
    category: `Imported ${ext.toUpperCase()} Fallback`,
    updatedAt: new Date().toISOString(),
    pageSize: 'A4',
    widthMm: 210,
    heightMm: 297,
    orientation: 'portrait',
    marginMm: 15,
    pages: [
      {
        id: 'page-fb-1',
        name: 'Imported Page 1',
        background: '#ffffff',
        backgroundPattern: 'none',
        elements
      }
    ]
  };

  return {
    fileName: file.name,
    fileSize: file.size,
    formatDetected: ext === 'docx' ? 'DOCX-FALLBACK' : 'HTML-FALLBACK',
    ole2MagicValid: true,
    extractedTextBlocks: blocks.slice(0, 10),
    extractedImagesCount: 0,
    detectedPageSize: { preset: 'A4', widthMm: 210, heightMm: 297, orientation: 'portrait' },
    warnings: [
      'Imported via HTML/.DOCX fallback pipeline. Paragraph blocks were mapped to individual Publisher text frames.'
    ],
    generatedDoc
  };
}
