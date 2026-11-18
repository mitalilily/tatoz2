import { jsPDF } from 'jspdf';

const lineValue = value => String(value || '').trim();

export const generatePackingSlip = (slip, settings) => {
  const doc = new jsPDF();
  const width = doc.internal.pageSize.getWidth();
  let y = 18;
  const divider = () => {
    doc.setDrawColor(210, 210, 210);
    doc.line(15, y, width - 15, y);
  };
  const ensureRoom = (height = 10) => {
    if (y + height > 275) {
      doc.addPage();
      y = 18;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(settings?.siteName || 'Store', 15, y);
  doc.setFontSize(14);
  doc.text('PACKING SLIP', width - 15, y, { align: 'right' });
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(`Order: ${lineValue(slip.orderNumber)}`, 15, y);
  doc.text(`Date: ${new Date(slip.orderDate || Date.now()).toLocaleDateString('en-IN')}`, width - 15, y, { align: 'right' });
  y += 8;
  divider();
  y += 8;

  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('SHIP TO', 15, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30);
  doc.text(lineValue(slip.customer?.name) || 'Customer', 15, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const address = slip.shippingAddress || {};
  const addressLines = [
    address.street,
    `${address.city || ''}, ${address.state || ''} ${address.pincode || ''}`.trim(),
    address.country,
    address.phone ? `Phone: ${address.phone}` : '',
  ].filter(Boolean);
  addressLines.forEach(value => {
    doc.text(lineValue(value), 15, y);
    y += 4.5;
  });
  y += 5;
  divider();
  y += 7;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('#', 15, y);
  doc.text('ITEM', 27, y);
  doc.text('SKU', 125, y);
  doc.text('QTY', width - 15, y, { align: 'right' });
  y += 5;
  divider();
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(35);
  (slip.items || []).forEach((item, index) => {
    ensureRoom(14);
    doc.text(String(index + 1), 15, y);
    doc.text(lineValue(item.title).slice(0, 45), 27, y);
    doc.text(lineValue(item.sku).slice(0, 24) || '—', 125, y);
    doc.text(String(item.quantity || 0), width - 15, y, { align: 'right' });
    y += 5;
    const variants = Object.entries(item.variant || {}).map(([key, value]) => `${key}: ${value}`).join(' · ');
    if (variants) {
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(variants.slice(0, 90), 27, y);
      doc.setFontSize(9);
      doc.setTextColor(35);
      y += 6;
    } else y += 2;
  });

  ensureRoom(25);
  y += 3;
  divider();
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text(`Total units: ${Number(slip.totalUnits || 0)}`, 15, y);
  doc.text(`Payment: ${lineValue(slip.paymentMethod).toUpperCase()} · ${lineValue(slip.paymentStatus).toUpperCase()}`, width - 15, y, { align: 'right' });
  if (slip.customerNote) {
    y += 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80);
    doc.text(`Customer note: ${lineValue(slip.customerNote).slice(0, 150)}`, 15, y);
  }
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text('Generated from the server-authoritative order snapshot. No pricing is shown on this warehouse copy.', width / 2, y, { align: 'center' });
  doc.save(`Packing-Slip-${lineValue(slip.orderNumber) || 'order'}.pdf`);
};
