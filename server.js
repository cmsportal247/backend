require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require('uuid');
const bcrypt = require("bcrypt");
const excelJS = require("exceljs");
const { 
    DynamoDBClient, 
    GetItemCommand, 
    PutItemCommand, 
    ScanCommand, 
    DeleteItemCommand 
} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const app = express();
const port = 4000;

app.use(cors());
app.use(bodyParser.json());

// AWS DynamoDB Configuration
const dbClient = new DynamoDBClient({ 
    region: process.env.AWS_REGION, 
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const USERS_TABLE = "users";
const CASES_TABLE = "CustomerCases";

// ✅ User Login
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    const params = {
        TableName: USERS_TABLE,
        Key: marshall({ username }),
    };

    try {
        const { Item } = await dbClient.send(new GetItemCommand(params));

        if (!Item) {
            return res.status(404).json({ error: "User not found" });
        }

        const user = unmarshall(Item);

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (passwordMatch) {
            res.json({ 
                message: "Login successful!", 
                user: { username: user.username, role: user.role } 
            });
        } else {
            res.status(401).json({ error: "Invalid password" });
        }
    } catch (error) {
        console.error("Login failed:", error);
        res.status(500).json({ error: "Login failed." });
    }
});

// ✅ Fetch All Cases (with Search)
app.get("/cases", async (req, res) => {
    const search = req.query.search || "";

    const params = { TableName: CASES_TABLE };

    try {
        const { Items } = await dbClient.send(new ScanCommand(params));

        if (Items && Items.length > 0) {
            const cases = Items.map((item) => unmarshall(item));

            // Manually filter results
            const filteredCases = cases.filter((c) => 
                c.name?.toLowerCase().includes(search.toLowerCase()) ||
                c.mobile?.includes(search) ||
                c.status?.toLowerCase().includes(search.toLowerCase())
            );

            res.json(filteredCases);
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error("Fetch cases failed:", error);
        res.status(500).json({ error: "Failed to fetch cases." });
    }
});

// ✅ Add New Case
app.post("/add-case", async (req, res) => {
    const caseData = req.body;

    if (!caseData.id) {
        caseData.id = uuidv4();
    }

    if (!caseData.createdAt) {
        caseData.createdAt = new Date().toISOString();
    }

    const params = {
        TableName: CASES_TABLE,
        Item: marshall(caseData),
    };

    try {
        await dbClient.send(new PutItemCommand(params));
        res.json({ message: "Case added successfully!", caseId: caseData.id });
    } catch (error) {
        console.error("Add case failed:", error);
        res.status(500).json({ error: "Failed to add case." });
    }
});

// ✅ Update Existing Case
app.put("/update-case/:id", async (req, res) => {
    const { id } = req.params;
    const updatedCase = req.body;

    updatedCase.updatedAt = new Date().toISOString();

    const params = {
        TableName: CASES_TABLE,
        Item: marshall({ id, ...updatedCase }),
    };

    try {
        await dbClient.send(new PutItemCommand(params));
        res.json({ message: "Case updated successfully!" });
    } catch (error) {
        console.error("Update case failed:", error);
        res.status(500).json({ error: "Failed to update case." });
    }
});

// ✅ Delete Case (Admin Only)
app.delete("/delete-case/:id", async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (role !== "admin") {
        return res.status(403).json({ error: "Unauthorized access" });
    }

    const params = {
        TableName: CASES_TABLE,
        Key: marshall({ id }),
    };

    try {
        await dbClient.send(new DeleteItemCommand(params));
        res.json({ message: "Case deleted successfully!" });
    } catch (error) {
        console.error("Delete case failed:", error);
        res.status(500).json({ error: "Failed to delete case." });
    }
});

// ✅ Export Cases to Excel
app.get("/export-excel", async (req, res) => {
    const params = { TableName: CASES_TABLE };

    try {
        const { Items } = await dbClient.send(new ScanCommand(params));
        const cases = Items.map((item) => unmarshall(item));

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

        cases.forEach((caseItem) => {
            worksheet.addRow(caseItem);
        });

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=cases.xlsx");

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error("Export cases failed:", error);
        res.status(500).json({ error: "Failed to export cases." });
    }
});

// ✅ Change Password
app.put("/change-password", async (req, res) => {
    const { username, oldPassword, newPassword } = req.body;

    const params = {
        TableName: USERS_TABLE,
        Key: marshall({ username }),
    };

    try {
        const { Item } = await dbClient.send(new GetItemCommand(params));

        if (!Item) {
            return res.status(404).json({ error: "User not found" });
        }

        const user = unmarshall(Item);

        const passwordMatch = await bcrypt.compare(oldPassword, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: "Old password is incorrect" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const updateParams = {
            TableName: USERS_TABLE,
            Item: marshall({ ...user, password: hashedPassword }),
        };

        await dbClient.send(new PutItemCommand(updateParams));

        res.json({ message: "Password updated successfully" });
    } catch (error) {
        console.error("Password change failed:", error);
        res.status(500).json({ error: "Failed to change password." });
    }
});

// ✅ Start Server
app.listen(port, () => {
    console.log(` Server running on port ${port}`);
});
