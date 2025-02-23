const express = require("express");
const mysql = require("mysql2");
const bodyParser = require("body-parser");
const cors = require("cors");
const excelJS = require("exceljs");
const bcrypt = require("bcrypt");

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

// ✅ MySQL Connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "cms_db",
});

db.connect((err) => {
    if (err) {
        console.error("Database connection failed: " + err.stack);
        return;
    }
    console.log("Connected to MySQL database ✅");
});

// ✅ Fetch All Cases (with Search)
app.get("/cases", (req, res) => {
    const search = req.query.search || "";

    const sql = `
        SELECT * FROM cases 
        WHERE name LIKE ? OR mobile LIKE ? OR status LIKE ? 
        ORDER BY date_received DESC
    `;

    db.query(sql, [`%${search}%`, `%${search}%`, `%${search}%`], (err, results) => {
        if (err) {
            res.status(500).json({ error: "Database error" });
        } else {
            res.json(results);
        }
    });
});

// ✅ Add New Case
app.post("/add-case", (req, res) => {
    const newCase = req.body;

    const sql = "INSERT INTO cases SET ?";
    db.query(sql, newCase, (err, result) => {
        if (err) {
            res.status(500).json({ error: "Failed to add case" });
        } else {
            res.json({ message: "Case added successfully" });
        }
    });
});

// ✅ Update Existing Case
app.put("/update-case/:id", (req, res) => {
    const caseId = req.params.id;
    const updatedCase = req.body;

    const sql = "UPDATE cases SET ? WHERE id = ?";
    db.query(sql, [updatedCase, caseId], (err, result) => {
        if (err) {
            res.status(500).json({ error: "Failed to update case" });
        } else {
            res.json({ message: "Case updated successfully" });
        }
    });
});

// ✅ Delete Case
app.delete("/delete-case/:id", (req, res) => {
    const caseId = req.params.id;

    const sql = "DELETE FROM cases WHERE id = ?";
    db.query(sql, caseId, (err, result) => {
        if (err) {
            res.status(500).json({ error: "Failed to delete case" });
        } else {
            res.json({ message: "Case deleted successfully" });
        }
    });
});

// ✅ Export Cases to Excel
app.get("/export-excel", (req, res) => {
    const sql = "SELECT * FROM cases";

    db.query(sql, (err, results) => {
        if (err) {
            res.status(500).json({ error: "Failed to fetch cases for export" });
            return;
        }

        const workbook = new excelJS.Workbook();
        const worksheet = workbook.addWorksheet("Cases");

        worksheet.columns = [
            { header: "Date Received", key: "date_received", width: 15 },
            { header: "Staff", key: "staff", width: 20 },
            { header: "Mobile", key: "mobile", width: 15 },
            { header: "Name", key: "name", width: 20 },
            { header: "Work", key: "work", width: 20 },
            { header: "Information", key: "info", width: 30 },
            { header: "Pending", key: "pending", width: 15 },
            { header: "Remarks", key: "remarks", width: 25 },
            { header: "Status", key: "status", width: 15 },
        ];

        results.forEach((caseItem) => {
            worksheet.addRow(caseItem);
        });

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=cases.xlsx");

        workbook.xlsx.write(res).then(() => {
            res.end();
        });
    });
});

// ✅ User Login
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    const sql = "SELECT * FROM users WHERE username = ?";
    db.query(sql, [username], (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).json({ error: "Invalid username or password" });
        }

        const user = results[0];

        bcrypt.compare(password, user.password, (err, result) => {
            if (result) {
                res.json({ message: "Login successful", user: { username: user.username, role: user.role } });
            } else {
                res.status(401).json({ error: "Invalid username or password" });
            }
        });
    });
});

// ✅ Change Password
app.put("/change-password", (req, res) => {
    const { username, oldPassword, newPassword } = req.body;

    const sql = "SELECT * FROM users WHERE username = ?";
    db.query(sql, [username], (err, results) => {
        if (err || results.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const user = results[0];

        bcrypt.compare(oldPassword, user.password, (err, result) => {
            if (!result) {
                return res.status(401).json({ error: "Old password is incorrect" });
            }

            bcrypt.hash(newPassword, 10, (err, hash) => {
                if (err) {
                    return res.status(500).json({ error: "Failed to hash new password" });
                }

                const updateSql = "UPDATE users SET password = ? WHERE username = ?";
                db.query(updateSql, [hash, username], (err) => {
                    if (err) {
                        res.status(500).json({ error: "Failed to update password" });
                    } else {
                        res.json({ message: "Password updated successfully" });
                    }
                });
            });
        });
    });
});

// ✅ Server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
