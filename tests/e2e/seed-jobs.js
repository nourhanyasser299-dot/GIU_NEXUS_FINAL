// One-off helper: approve every recruiter profile so they can post jobs.
// Resolves mongoose from the repo's own Backend/node_modules so this works
// regardless of where the repo is checked out.
const path = require('path');
const mongoose = require(path.resolve(__dirname, '..', '..', 'Backend', 'node_modules', 'mongoose'));

(async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set; export it before running.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const RecruiterProfile = mongoose.connection.db.collection('recruiterprofiles');
  const r = await RecruiterProfile.updateMany({}, { $set: { approvalStatus: 'approved' } });
  console.log('updated', r.modifiedCount, 'recruiter profiles to approved');
  await mongoose.disconnect();
})();
