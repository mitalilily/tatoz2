require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const coll = mongoose.connection.collection('users');

  const dups = await coll.aggregate([
    { $match: { phone: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$phone', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();

  console.log('Duplicate phones:', JSON.stringify(dups, null, 2));

  for (const d of dups) {
    const docs = await coll.find({ phone: d._id }).toArray();
    console.log(`\n--- phone ${d._id} ---`);
    for (const u of docs) {
      console.log({
        _id: u._id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        role: u.role,
        isPhoneVerified: u.isPhoneVerified,
        createdAt: u.createdAt,
        orderCount: u.orderCount,
      });
    }
  }

  await mongoose.disconnect();
})();
