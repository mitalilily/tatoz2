require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const coll = mongoose.connection.collection('users');
  const indexes = await coll.indexes();
  console.log('INDEXES:', JSON.stringify(indexes, null, 2));

  const nullEmail = await coll.countDocuments({ email: null });
  const noEmailField = await coll.countDocuments({ email: { $exists: false } });
  const nullPhone = await coll.countDocuments({ phone: null });
  const noPhoneField = await coll.countDocuments({ phone: { $exists: false } });
  console.log({ nullEmail, noEmailField, nullPhone, noPhoneField });

  const total = await coll.countDocuments({});
  console.log('total users:', total);

  await mongoose.disconnect();
})();
