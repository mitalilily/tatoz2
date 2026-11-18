import { jsPDF } from 'jspdf';

// jsPDF's default fonts can't render ₹, so use a PDF-safe symbol
const pdfCurrencySymbol = (settings) => {
  const sym = settings?.currencySymbol || 'Rs.';
  // ₹ is not in Helvetica — replace with "Rs."
  return sym === '₹' ? 'Rs.' : sym;
};

const formatCurrency = (amount, settings) => {
  const symbol = pdfCurrencySymbol(settings);
  const num = Number(amount || 0);
  return `${symbol} ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const generateInvoice = (order, settings) => {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();
  let y = 20;
  const invoiceNumber = order.invoiceNumber || order.orderNumber || 'invoice';
  const documentLabel = order.documentType === 'commission_invoice' ? 'COMMISSION INVOICE'
    : order.documentType === 'courier_invoice' ? 'COURIER INVOICE'
      : order.documentType === 'proforma' ? 'PROFORMA INVOICE'
        : order.documentType === 'credit_note' ? 'CREDIT NOTE'
          : order.documentType === 'debit_note' ? 'DEBIT NOTE' : 'TAX INVOICE';

  const line = (yPos) => { doc.setDrawColor(220, 220, 220); doc.line(15, yPos, pw - 15, yPos); };

  // ─── Header ───
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(settings?.siteName || 'Store', 15, y);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text(documentLabel, pw - 15, y, { align: 'right' });
  y += 10;
  line(y);
  y += 10;

  // ─── Order Info ───
  doc.setTextColor(60);
  doc.setFontSize(9);
  doc.text(`Invoice No: ${invoiceNumber}`, 15, y);
  doc.text(`Date: ${new Date(order.issueDate || order.createdAt || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`, pw - 15, y, { align: 'right' });
  y += 6;
  doc.text(`Payment: ${(order.paymentMethod || '').toUpperCase()}`, 15, y);
  doc.text(`Status: ${(order.paymentStatus || '').toUpperCase()}`, pw - 15, y, { align: 'right' });
  y += 10;

  // ─── Bill To ───
  doc.setFontSize(8);
  doc.setTextColor(130);
  if (order.seller?.businessName) {
    doc.setTextColor(130);
    doc.text('SELLER', pw / 2, y);
    doc.setTextColor(30);
    doc.setFont('helvetica', 'bold');
    doc.text(order.seller.businessName, pw / 2, y + 5);
    doc.setFont('helvetica', 'normal');
    if (order.seller.gstin) doc.text(`GSTIN: ${order.seller.gstin}`, pw / 2, y + 10);
    y += 4;
  }
  doc.setTextColor(130);
  doc.text('BILL TO', 15, y);
  y += 5;
  doc.setFontSize(10);
  doc.setTextColor(30);
  doc.setFont('helvetica', 'bold');
  doc.text(order.buyer?.name || order.shippingAddress?.fullName || 'Customer', 15, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80);
  const addr = order.buyer?.address || order.shippingAddress;
  if (addr) {
    if (addr.street) { doc.text(addr.street, 15, y); y += 4.5; }
    doc.text(`${addr.city || ''}, ${addr.state || ''} ${addr.pincode || ''}`, 15, y); y += 4.5;
    if (addr.phone) { doc.text(`Phone: ${addr.phone}`, 15, y); y += 4.5; }
  }
  if (order.buyer?.email) { doc.text(`Email: ${order.buyer.email}`, 15, y); y += 4.5; }
  y += 8;

  // ─── Items Table Header ───
  line(y);
  y += 6;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(100);
  doc.text('#', 15, y);
  doc.text('ITEM', 25, y);
  doc.text('QTY', 130, y, { align: 'center' });
  doc.text('PRICE', 155, y, { align: 'right' });
  doc.text('TOTAL', pw - 15, y, { align: 'right' });
  y += 4;
  line(y);
  y += 6;

  // ─── Items ───
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(40);
  doc.setFontSize(9);
  (order.items || []).forEach((item, i) => {
    if (y > 260) { doc.addPage(); y = 20; }
    const title = `${(item.title || 'Product').substring(0, 42)}${item.hsnCode ? ` (HSN ${item.hsnCode})` : ''}`;
    const unitPrice = item.unitPrice ?? item.price ?? 0;
    const lineTotal = item.grossAmount ?? (unitPrice * item.quantity);
    doc.text(`${i + 1}`, 15, y);
    doc.text(title, 25, y);
    doc.text(`${item.quantity}`, 130, y, { align: 'center' });
    doc.text(formatCurrency(unitPrice, settings), 155, y, { align: 'right' });
    doc.text(formatCurrency(lineTotal, settings), pw - 15, y, { align: 'right' });
    y += 7;
  });

  y += 4;
  line(y);
  y += 8;

  // ─── Summary ───
  const summaryX = 130;
  const valX = pw - 15;
  doc.setFontSize(9);
  doc.setTextColor(80);

  const addRow = (label, value, bold = false) => {
    if (bold) doc.setFont('helvetica', 'bold');
    else doc.setFont('helvetica', 'normal');
    doc.text(label, summaryX, y);
    doc.text(value, valX, y, { align: 'right' });
    y += 6;
  };

  addRow('Subtotal', formatCurrency(order.subtotal, settings));

  if (order.shippingCost > 0) {
    addRow('Shipping', formatCurrency(order.shippingCost, settings));
  } else {
    doc.setTextColor(22, 163, 74);
    addRow('Shipping', 'FREE');
    doc.setTextColor(80);
  }

  if (order.tax > 0) addRow('Tax', formatCurrency(order.tax, settings));

  if (order.discount > 0) {
    doc.setTextColor(220, 38, 38);
    addRow('Discount', `- ${formatCurrency(order.discount, settings)}`);
    doc.setTextColor(80);
  }

  y += 2;
  doc.setDrawColor(60);
  doc.line(summaryX, y, valX, y);
  y += 7;
  doc.setFontSize(11);
  doc.setTextColor(20);
  addRow('TOTAL', formatCurrency(order.total, settings), true);

  // ─── Footer ───
  y += 15;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150);
  if (order.invoiceNote) {
    doc.text(order.invoiceNote.substring(0, 120), pw / 2, y, { align: 'center' });
    y += 5;
  }
  doc.text('This is a computer-generated invoice and does not require a signature.', pw / 2, y, { align: 'center' });
  y += 5;
  doc.text(`${settings?.siteName || 'Store'} - Thank you for your purchase!`, pw / 2, y, { align: 'center' });

  doc.save(`Invoice-${invoiceNumber}.pdf`);
};
