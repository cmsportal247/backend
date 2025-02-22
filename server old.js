const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcrypt");
const path = require("path");
const ExcelJS = require("exceljs");

const app = express();
app.use(cors({ origin: "*" }));

app.use(express.json());
app.use(express.static(path.join(__dirname, "../Frontend")));

// ✅ MySQL Database Configuration
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "customer_management"
});

db.connect((err) => {
    if (err) {
        console.error("❌ Database connection failed:", err.message);
    } else {
        console.log("✅ Connected to MySQL Database");
    }
});

// ✅ Fetch Cases (With Search)
app.get("/cases", (req, res) => {
    const search = req.query.search || "";
    let sql = "SELECT * FROM cases WHERE name LIKE ? OR mobile LIKE ? ORDER BY id DESC";
    let searchValue = `%${search}%`;

    db.query(sql, [searchValue, searchValue], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(result);
    });
});

// ✅ Add a New Case
app.post("/add-case", (req, res) => {
    const { date_received, staff, mobile, name, work, info, pending, remarks, status } = req.body;

    if (!date_received || !staff || !mobile || !name || mobile.length !== 10) {
        return res.status(400).json({ error: "Invalid input data. Ensure all required fields are filled correctly." });
    }

    db.query(
        "INSERT INTO cases (date_received, staff, mobile, name, work, info, pending, remarks, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [date_received, staff, mobile, name, work, info, pending, remarks, status],
        (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: "✅ Case added successfully!" });
        }
    );
});

// ✅ Delete a Case
app.delete("/delete-case/:id", (req, res) => {
    const caseId = req.params.id;

    db.query("DELETE FROM cases WHERE id = ?", [caseId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "✅ Case deleted successfully!" });
    });
});

// ✅ Login (With Hashed Password)
app.post("/login", (req, res) => {
    const { username, password } = req.body;

    db.query("SELECT * FROM users WHERE username = ?", [username], async (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        if (result.length === 0) {
            return res.status(401).json({ error: "Invalid username or password" });
        }

        const user = result[0];
        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            return res.status(401).json({ error: "Invalid username or password" });
        }

        res.json({ user: { username: user.username, role: user.role } });
    });
});

// ✅ Change Password (With Hashing)
app.put("/change-password", async (req, res) => {
    const { username, oldPassword, newPassword } = req.body;

    if (!username || !oldPassword || !newPassword) {
        return res.status(400).json({ error: "All fields are required." });
    }

    db.query("SELECT * FROM users WHERE username = ?", [username], async (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        if (result.length === 0) {
            return res.status(401).json({ error: "User not found." });
        }

        const user = result[0];
        const passwordMatch = await bcrypt.compare(oldPassword, user.password);
        
        if (!passwordMatch) {
            return res.status(401).json({ error: "Old password is incorrect." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        db.query("UPDATE users SET password = ? WHERE username = ?", [hashedPassword, username], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, message: "✅ Password changed successfully!" });
        });
    });
});

// ✅ Export Cases to Excel (Fixed)
app.get("/export-excel", async (req, res) => {
    const { from, to } = req.query;

    if (!from || !to) {
        return res.status(400).json({ error: "Please provide a valid date range." });
    }

    let formattedFrom = new Date(from).toISOString().split("T")[0];
    let formattedTo = new Date(to).toISOString().split("T")[0];

    db.query("SELECT * FROM cases WHERE date_received BETWEEN ? AND ?", [formattedFrom, formattedTo], async (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        if (result.length === 0) {
            return res.status(404).json({ error: "No cases found in the selected date range." });
        }

        let workbook = new ExcelJS.Workbook();
        let worksheet = workbook.addWorksheet("Cases Report");

        worksheet.addRow(["ID", "Date Received", "Staff", "Mobile", "Name", "Work", "Info", "Pending", "Remarks", "Status"]);

        result.forEach((caseItem) => {
            worksheet.addRow([
                caseItem.id,
                new Date(caseItem.date_received).toLocaleDateString("en-GB"),
                caseItem.staff,
                caseItem.mobile,
                caseItem.name,
                caseItem.work || "-",
                caseItem.info || "-",
                caseItem.pending || "-",
                caseItem.remarks || "-",
                caseItem.status
            ]);
        });

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=Cases_Report.xlsx");

        await workbook.xlsx.write(res);
        res.end();
    });
});

// ✅ Start Server
const PORT = 4000;
app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
