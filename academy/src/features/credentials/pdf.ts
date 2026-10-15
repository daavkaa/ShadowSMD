import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";

export type CertificatePdfInput = {
  holderName: string;
  title: string;
  credentialNumber: string;
  issuedAt: Date;
  issuerName: string;
  verifyUrl: string;
  isDemo: boolean;
};

const fontDir = path.join(process.cwd(), "assets", "fonts");

export async function renderCertificatePdf(c: CertificatePdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`${c.title} — ${c.credentialNumber}`);
  doc.setAuthor(c.issuerName);
  const [regular, bold] = await Promise.all([
    readFile(path.join(fontDir, "DejaVuSans.ttf")).then((b) => doc.embedFont(b, { subset: true })),
    readFile(path.join(fontDir, "DejaVuSans-Bold.ttf")).then((b) => doc.embedFont(b, { subset: true })),
  ]);
  const page = doc.addPage([842, 595]); // A4 landscape
  const { width, height } = page.getSize();
  const purple = rgb(0x24 / 255, 0x1a / 255, 0x43 / 255);
  const primary = rgb(0x80 / 255, 0x56 / 255, 0xea / 255);
  const muted = rgb(0.38, 0.36, 0.45);

  page.drawRectangle({ x: 0, y: 0, width, height, color: rgb(0.985, 0.98, 1) });
  page.drawRectangle({ x: 24, y: 24, width: width - 48, height: height - 48, borderColor: primary, borderWidth: 2 });
  page.drawRectangle({ x: 0, y: height - 14, width, height: 14, color: purple });

  const center = (text: string, y: number, size: number, font = regular, color = purple) => {
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: (width - w) / 2, y, size, font, color });
  };

  center(c.issuerName.toUpperCase(), height - 80, 14, bold, primary);
  center("СЕРТИФИКАТ", height - 130, 34, bold);
  center("Энэхүү сертификатыг", height - 175, 13, regular, muted);
  center(c.holderName, height - 220, 30, bold);
  center("дараах сургалтын эцсийн шалгалтыг амжилттай өгсний үндсэн дээр олгов:", height - 255, 12, regular, muted);
  const words = c.title.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? line + " " + w : w;
    if (bold.widthOfTextAtSize(next, 18) > width - 220) {
      lines.push(line);
      line = w;
    } else line = next;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => center(l, height - 290 - i * 24, 18, bold, primary));

  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(c.issuedAt);
  page.drawText(`Дугаар: ${c.credentialNumber}`, { x: 60, y: 110, size: 11, font: regular, color: muted });
  page.drawText(`Олгосон огноо: ${dateStr}`, { x: 60, y: 92, size: 11, font: regular, color: muted });
  page.drawText(`Баталгаажуулах: ${c.verifyUrl}`, { x: 60, y: 74, size: 9, font: regular, color: muted });
  page.drawText(
    `Олгогч: ${c.issuerName}. Энэ нь хувийн сургалтын байгууллагын сертификат бөгөөд Meta болон төрийн магадлан итгэмжлэлийн баталгаа биш.`,
    { x: 60, y: 48, size: 8, font: regular, color: muted, maxWidth: width - 240 },
  );

  const qrPng = await QRCode.toBuffer(c.verifyUrl, { margin: 1, width: 240, errorCorrectionLevel: "M" });
  const qr = await doc.embedPng(qrPng);
  page.drawImage(qr, { x: width - 170, y: 50, width: 110, height: 110 });

  if (c.isDemo) {
    page.drawText("ДЕМО — бодит төлбөргүй туршилтын эрхээр олгогдсон", { x: 60, y: height - 50, size: 12, font: bold, color: rgb(0.8, 0.1, 0.1) });
  }
  return doc.save();
}
