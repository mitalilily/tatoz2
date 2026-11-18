require('dotenv').config();
const mongoose = require('mongoose');

function pickKeeper(docs) {
  // Priority: isPhoneVerified=true, then highest orderCount, then oldest createdAt.
  return docs.slice().sort((a, b) => {
    if (!!b.isPhoneVerified !== !!a.isPhoneVerified) return b.isPhoneVerified ? 1 : -1;
    if ((b.orderCount || 0) !== (a.orderCount || 0)) return (b.orderCount || 0) - (a.orderCount || 0);
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  })[0];
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const coll = mongoose.connection.collection('users');

  console.log('Step 1: remove duplicate phone users (keep best, delete rest)...');
  const dupGroups = await coll.aggregate([
    { $match: { phone: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$phone', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();

  for (const g of dupGroups) {
    const docs = await coll.find({ _id: { $in: g.ids } }).toArray();
    const keeper = pickKeeper(docs);
    const deleteIds = docs.filter(d => !d._id.equals(keeper._id)).map(d => d._id);
    console.log(`  phone ${g._id}: keep ${keeper._id} (${keeper.email || 'no email'}), delete ${deleteIds.length}`);
    await coll.deleteMany({ _id: { $in: deleteIds } });
  }

  console.log('Step 2: remove duplicate email users (keep best, delete rest)...');
  const dupEmails = await coll.aggregate([
    { $match: { email: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$email', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();
  for (const g of dupEmails) {
    const docs = await coll.find({ _id: { $in: g.ids } }).toArray();
    const keeper = pickKeeper(docs);
    const deleteIds = docs.filter(d => !d._id.equals(keeper._id)).map(d => d._id);
    console.log(`  email ${g._id}: keep ${keeper._id}, delete ${deleteIds.length}`);
    await coll.deleteMany({ _id: { $in: deleteIds } });
  }

  console.log('Step 3: unset null email/phone fields so partial indexes skip them...');
  const e = await coll.updateMany({ email: null }, { $unset: { email: '' } });
  const p = await coll.updateMany({ phone: null }, { $unset: { phone: '' } });
  console.log(`  email cleaned: ${e.modifiedCount}, phone cleaned: ${p.modifiedCount}`);

  console.log('Step 4: drop legacy email_1 / phone_1 indexes...');
  const before = await coll.indexes();
  for (const name of ['email_1', 'phone_1']) {
    if (before.some(i => i.name === name)) {
      console.log(`  dropping ${name}`);
      await coll.dropIndex(name);
    }
  }

  console.log('Step 5: sync indexes from Mongoose schema...');
  require('../models/User');
  await mongoose.model('User').syncIndexes();

  const after = await coll.indexes();
  console.log('\nFinal indexes:');
  for (const i of after) {
    console.log(`  ${i.name}`, {
      key: i.key,
      unique: i.unique || false,
      partialFilterExpression: i.partialFilterExpression,
    });
  }

  const total = await coll.countDocuments({});
  console.log(`\nTotal users now: ${total}`);

  await mongoose.disconnect();
  console.log('Done.');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
