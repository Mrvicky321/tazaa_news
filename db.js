const mysql = require("mysql2/promise");

const poolConfig = {
    host: "217.21.87.103",
    user: "u205680228_vicky_sharma",
    password: "Sharma@vicky13",
    database: "u205680228_tazaa_news",
    port: 3306,   // FIXED PORT
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 20000,
    acquireTimeout: 20000 
};

const db = mysql.createPool(poolConfig);

db.getConnection()
    .then(connection => {
        console.log("Database connected and pool ready.");
        connection.release();
    })
    .catch(error => {
        console.error(
            "Database connection error (Please check config/credentials):",
            error.message
        );
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
