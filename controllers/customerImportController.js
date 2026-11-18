const asyncHandler = require('express-async-handler');
const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const User = require('../models/User');
const TenantCustomer = require('../models/TenantCustomer');
const { getTenantCustomerIds } = require('../services/customerScopeService');

const HEADERS = ['Name', 'Email', 'Phone', 'Segment', 'Tags', 'Active'];
const asText = value => String(value ?? '').trim();
const normalizePhone = value => {
  const digits = asText(value).replace(/\D/g, '');
  if (!digits) return '';
  return digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
};
const parseActive = value => !['false', '0', 'no', 'blocked', 'inactive'].includes(asText(value).toLowerCase());
const tenantId = req => req.tenant?._id;

const exportCustomers = asyncHandler(async (req, res) => {
  if (!tenantId(req)) { res.status(400); throw new Error('Tenant context is required'); }
  const ids = await getTenantCustomerIds(tenantId(req));
  const users = await User.find({ _id: { $in: ids }, role: 'customer' })
    .select('name email phone segment tags isActive').sort({ createdAt: -1 }).lean();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Customers');
  sheet.columns = HEADERS.map(header => ({ header, key: header.toLowerCase(), width: header === 'Tags' ? 32 : 22 }));
  sheet.getRow(1).font = { bold: true };
  users.forEach(user => sheet.addRow({
    name: user.name || '', email: user.email || '', phone: user.phone || '', segment: user.segment || 'new',
    tags: (user.tags || []).join(', '), active: user.isActive !== false ? 'true' : 'false',
  }));
  const buffer = await workbook.csv.writeBuffer();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="customers-export-${Date.now()}.csv"`);
  res.send(buffer);
});

const downloadCustomerTemplate = asyncHandler(async (_req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Customers');
  sheet.addRow(HEADERS);
  sheet.getRow(1).font = { bold: true };
  sheet.addRow(['Example Customer', 'customer@example.com', '9876543210', 'new', 'vip, newsletter', 'true']);
  const buffer = await workbook.csv.writeBuffer();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="customers-import-template.csv"');
  res.send(buffer);
});

const importCustomers = asyncHandler(async (req, res) => {
  if (!tenantId(req)) { res.status(400); throw new Error('Tenant context is required'); }
  if (!req.file) { res.status(400); throw new Error('CSV file is required'); }
  const workbook = new ExcelJS.Workbook();
  await workbook.csv.read(Readable.from(req.file.buffer));
  const sheet = workbook.worksheets[0];
  if (!sheet) { res.status(400); throw new Error('Empty CSV file'); }
  const results = { created: 0, updated: 0, skipped: 0, errors: [] };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const values = sheet.getRow(rowNumber).values;
    try {
      const name = asText(values[1]);
      const email = asText(values[2]).toLowerCase();
      const phone = normalizePhone(values[3]);
      const segment = ['new', 'active', 'vip', 'at_risk', 'dormant'].includes(asText(values[4])) ? asText(values[4]) : 'new';
      const tags = asText(values[5]).split(',').map(item => item.trim()).filter(Boolean).slice(0, 50);
      const active = parseActive(values[6]);
      if (!email && !phone) throw new Error('Email or phone is required');
      if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new Error('Email is invalid');
      if (phone && !/^\d{10}$/.test(phone)) throw new Error('Phone must contain 10 digits');

      const byEmail = email ? await User.findOne({ email }).select('_id') : null;
      const byPhone = phone ? await User.findOne({ phone }).select('_id') : null;
      if (byEmail && byPhone && String(byEmail._id) !== String(byPhone._id)) throw new Error('Email and phone belong to different users');
      let user = byEmail || byPhone;
      if (user) {
        user = await User.findByIdAndUpdate(user._id, { $set: { ...(name ? { name } : {}), ...(email ? { email } : {}), ...(phone ? { phone } : {}), segment, tags } }, { new: true });
        results.updated += 1;
      } else {
        user = await User.create({ name, email: email || undefined, phone: phone || undefined, role: 'customer', segment, tags });
        results.created += 1;
      }
      await TenantCustomer.findOneAndUpdate(
        { tenant: tenantId(req), user: user._id },
        { $set: { status: active ? 'active' : 'blocked', lastSeenAt: new Date() }, $setOnInsert: { source: 'commerce', firstSeenAt: new Date() } },
        { upsert: true, new: true },
      );
    } catch (error) {
      results.skipped += 1;
      results.errors.push({ row: rowNumber, message: String(error.message || 'Customer import failed').slice(0, 300) });
    }
  }
  res.json({ success: true, ...results });
});

module.exports = { exportCustomers, downloadCustomerTemplate, importCustomers };
