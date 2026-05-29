const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);const app = require('./src/app');
require('dotenv').config();
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`GIU Nexus API running on port ${PORT} [${process.env.NODE_ENV}]`);
  });
});
