const mysql = require("mysql2/promise");
require("dotenv").config();

const poolConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 20000,
  acquireTimeout: 20000,
};

const db = mysql.createPool(poolConfig);

db.getConnection()
  .then((connection) => {
    console.log("✅ Database connected & pool ready");
    connection.release();
  })
  .catch((error) => {
    console.error("❌ Database connection error:", error.message);
  });

module.exports = db;

// const mysql = require("mysql2");

// const db = mysql.createConnection({
//   host: "localhost",
//   user: "root",
//   password: "",
//   database: "tazaa_news",
// });

// db.connect((err) => {
//   if (err) console.log("DB Error: ", err);
//   else console.log("MYSQL Connected");
// });

// module.exports = db;
