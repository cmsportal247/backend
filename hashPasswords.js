const mysql = require("mysql2");
const bcrypt = require("bcrypt");

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "customer_management"
});

db.connect(async (err) => {
    if (err) {
        console.error("❌ Database connection failed:", err.message);
        return;
    }
    console.log("✅ Connected to MySQL Database");

    db.query("SELECT id, password FROM users", async (err, users) => {
        if (err) return console.error("❌ Error fetching users:", err);

        for (let user of users) {
            if (!user.password.startsWith("$2b$")) { // Check if already hashed
                let hashedPassword = await bcrypt.hash(user.password, 10);
                db.query("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, user.id], (err) => {
                    if (err) console.error("❌ Error updating password:", err);
                    else console.log(`✅ Password updated for user ID: ${user.id}`);
                });
            }
        }
    });
});
