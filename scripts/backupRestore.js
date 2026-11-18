/*
 * Production-safe logical Mongo backup/restore utility.
 *
 * Backup is additive and non-destructive. Restore is dry-run by default and
 * only upserts documents after --confirm plus an exact --database match. It
 * never deletes documents that are absent from the archive; use a separately
 * reviewed mongorestore procedure for destructive disaster recovery.
 */
require('dotenv').config();
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const readline = require('readline');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { EJSON } = require('bson');
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const ARCHIVE_VERSION = 1;
const safeLabel = value => String(value || 'database').replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 80) || 'database';
const stamp = date => date.toISOString().replace(/[:.]/g, '-');
const flag = (name, fallback = '') => {
  const inline = process.argv.find(item => item.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
};
const hasFlag = name => process.argv.includes(name) || process.argv.some(item => item.startsWith(`${name}=`));

const ensurePrivateDir = async directory => {
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 });
  await fsp.chmod(directory, 0o700);
};

const sha256File = file => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(file);
  stream.on('data', chunk => hash.update(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(hash.digest('hex')));
});

const collectionNames = async db => (await db.listCollections({}, { nameOnly: true }).toArray())
  .map(item => item.name)
  .filter(name => name && !name.startsWith('system.'))
  .sort();

async function backupDatabase({ db, outputDir = path.join(__dirname, '..', 'backups'), label = 'database', now = new Date() } = {}) {
  if (!db) throw new Error('Mongo database handle is required');
  await ensurePrivateDir(outputDir);
  const createdAt = now.toISOString();
  const base = `${safeLabel(label)}-${stamp(now)}`;
  const archive = path.resolve(outputDir, `${base}.jsonl.gz`);
  const partial = `${archive}.partial`;
  const manifestPath = path.resolve(outputDir, `${base}.manifest.json`);
  const names = await collectionNames(db);
  const counts = {};

  async function* documents() {
    yield `${JSON.stringify({ type: 'header', format: 'tatoz-mongo-logical-backup', version: ARCHIVE_VERSION, createdAt, database: db.databaseName, collections: names })}\n`;
    for (const name of names) {
      let count = 0;
      const cursor = db.collection(name).find({}).batchSize(500);
      for await (const document of cursor) {
        count += 1;
        yield `${EJSON.stringify({ type: 'document', collection: name, document }, { relaxed: false })}\n`;
      }
      counts[name] = count;
    }
  }

  try {
    await pipeline(Readable.from(documents()), zlib.createGzip({ level: 9 }), fs.createWriteStream(partial, { mode: 0o600 }));
    await fsp.chmod(partial, 0o600);
    await fsp.rename(partial, archive);
    const checksum = await sha256File(archive);
    const manifest = {
      format: 'tatoz-mongo-logical-backup',
      version: ARCHIVE_VERSION,
      createdAt,
      database: db.databaseName,
      archive: path.basename(archive),
      sha256: checksum,
      collections: counts,
      totalDocuments: Object.values(counts).reduce((sum, count) => sum + count, 0),
      restoreMode: 'upsert-only',
    };
    await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await fsp.chmod(manifestPath, 0o600);
    return { ...manifest, archive, manifest: manifestPath };
  } catch (error) {
    await fsp.rm(partial, { force: true }).catch(() => {});
    throw error;
  }
}

async function inspectBackup({ file } = {}) {
  if (!file) throw new Error('Backup archive path is required');
  const counts = {};
  let header = null;
  const input = fs.createReadStream(path.resolve(file)).pipe(zlib.createGunzip());
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      const record = EJSON.parse(line);
      if (record.type === 'header') header = record;
      else if (record.type === 'document') counts[record.collection] = (counts[record.collection] || 0) + 1;
    }
  } finally {
    lines.close();
  }
  if (!header || header.format !== 'tatoz-mongo-logical-backup' || header.version !== ARCHIVE_VERSION) {
    throw new Error('Unsupported or invalid Tatoz backup archive');
  }
  return { header, collections: counts, totalDocuments: Object.values(counts).reduce((sum, count) => sum + count, 0) };
}

async function restoreDatabase({ db, file, confirm = false, confirmDatabase = '' } = {}) {
  if (!db) throw new Error('Mongo database handle is required');
  if (!file) throw new Error('Backup archive path is required');
  const archive = path.resolve(file);
  const summary = await inspectBackup({ file: archive });
  if (confirm && String(confirmDatabase) !== String(summary.header.database)) {
    throw new Error(`Restore database confirmation mismatch: archive=${summary.header.database}, supplied=${confirmDatabase || '(missing)'}`);
  }
  const result = { dryRun: !confirm, database: summary.header.database, collections: summary.collections, totalDocuments: summary.totalDocuments, upserted: 0, modified: 0, errors: [] };
  if (!confirm) return result;

  const pending = new Map();
  const flush = async (name, force = false) => {
    const operations = pending.get(name) || [];
    if (!force && operations.length < 500) return;
    if (!operations.length) return;
    try {
      const response = await db.collection(name).bulkWrite(operations, { ordered: false });
      result.upserted += Number(response.upsertedCount || 0);
      result.modified += Number(response.modifiedCount || 0);
      pending.set(name, []);
    } catch (error) {
      result.errors.push({ collection: name, message: String(error.message || 'Restore failed').slice(0, 500) });
      pending.set(name, []);
    }
  };

  const input = fs.createReadStream(archive).pipe(zlib.createGunzip());
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      const record = EJSON.parse(line);
      if (record.type !== 'document' || !record.collection || !record.document?._id) continue;
      const operations = pending.get(record.collection) || [];
      operations.push({ replaceOne: { filter: { _id: record.document._id }, replacement: record.document, upsert: true } });
      pending.set(record.collection, operations);
      await flush(record.collection);
    }
  } finally {
    lines.close();
  }
  for (const name of pending.keys()) await flush(name, true);
  return result;
}

async function main() {
  const mode = process.argv[2];
  if (!['backup', 'restore', 'inspect'].includes(mode)) throw new Error('Usage: node scripts/backupRestore.js <backup|inspect|restore> [options]');
  if (mode === 'backup') {
    await connectDB();
    try {
      const result = await backupDatabase({ db: mongoose.connection.db, outputDir: flag('--output', path.join(__dirname, '..', 'backups')), label: flag('--label', mongoose.connection.name) });
      console.log(JSON.stringify(result, null, 2));
    } finally { await mongoose.disconnect(); }
    return;
  }
  const file = flag('--file');
  if (!file) throw new Error('--file is required');
  if (mode === 'inspect') {
    console.log(JSON.stringify(await inspectBackup({ file }), null, 2));
    return;
  }
  const confirm = hasFlag('--confirm');
  await connectDB();
  try {
    const result = await restoreDatabase({ db: mongoose.connection.db, file, confirm, confirmDatabase: flag('--database') });
    console.log(JSON.stringify(result, null, 2));
    if (result.errors?.length) process.exitCode = 2;
  } finally { await mongoose.disconnect(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { ARCHIVE_VERSION, backupDatabase, inspectBackup, restoreDatabase, collectionNames, sha256File };
