require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const excelJS = require('exceljs');

const { 
    DynamoDBClient, 
    GetItemCommand, 
    PutItemCommand, 
    ScanCommand, 
    DeleteItemCommand, 
    UpdateItemCommand 
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

const USERS_TABLE = "Users";
const CASES_TABLE = "CustomerCases";

// 🟢 User Login
app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    console.log("Login Attempt:", { username });

    const params = {
        TableName: USERS_TABLE,
        Key: marshall({ username })
    };

    try {
        const { Item } = await dbClient.send(new GetItemCommand(params));

        if (Item) {
            const user = unmarshall(Item);

            // Compare password
            const isMatch = await bcrypt.compare(password, user.password);

            if (isMatch) {
                res.json({ user });
            } else {
                res.status(401).json({ error: "Invalid password" });
            }
        } else {
            res.status(404).json({ error: "User not found" });
        }
    } catch (error) {
        console.error("Login failed:", error);
        res.status(500).json({ error: "Login failed. Check server logs." });
    }
});

// 🟠 Change Password
app.post("/change-password", async (req, res) => {
    const { username, currentPassword, newPassword } = req.body;

    if (!username || !currentPassword || !newPassword) {
        return res.status(400).json({ error: "All fields are required." });
    }

    const params = {
        TableName: USERS_TABLE,
        Key: marshall({ username })
    };

    try {
        const { Item } = await dbClient.send(new GetItemCommand(params));

        if (!Item) {
            return res.status(404).json({ error: "User not found." });
        }

        const user = unmarshall(Item);

        // Check current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);

        if (!isMatch) {
            return res.status(401).json({ error: "Current password is incorrect." });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password in DynamoDB
        const updateParams = {
            TableName: USERS_TABLE,
            Key: marshall({ username }),
            UpdateExpression: "SET password = :password",
            ExpressionAttributeValues: marshall({ ":password": hashedPassword })
        };

        await dbClient.send(new UpdateItemCommand(updateParams));
        res.json({ message: "Password changed successfully." });

    } catch (error) {
        console.error("Change password failed:", error);
        res.status(500).json({ error: "Failed to change password." });
    }
});

// 🟡 Fetch Cases
app.get("/cases", async (req, res) => {
    const params = { TableName: CASES_TABLE };

    try {
        const { Items } = await dbClient.send(new ScanCommand(params));

        if (Items && Items.length > 0) {
            const cases = Items.map((item) => unmarshall(item));
            res.json(cases);
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error("Fetch cases failed:", error);
        res.status(500).json({ error: "Failed to fetch cases." });
    }
});

// 🟡 Add Case
app.post("/add-case", async (req, res) => {
    const caseData = req.body;
    caseData.id = caseData.id || uuidv4();

    const params = {
        TableName: CASES_TABLE,
        Item: marshall(caseData)
    };

    try {
        await dbClient.send(new PutItemCommand(params));
        res.json({ message: "Case added successfully!", caseId: caseData.id });
    } catch (error) {
        console.error("Add case failed:", error);
        res.status(500).json({ error: "Failed to add case." });
    }
});

// 🟡 Update Case
app.put("/update-case", async (req, res) => {
    const updatedCase = req.body;

    if (!updatedCase.id) {
        return res.status(400).json({ error: "Case ID is required for updating." });
    }

    const params = {
        TableName: CASES_TABLE,
        Key: marshall({ id: updatedCase.id }),
        UpdateExpression: "SET #info = :info, #status = :status",
        ExpressionAttributeNames: {
            "#info": "information",
            "#status": "caseStatus"
        },
        ExpressionAttributeValues: marshall({
            ":info": updatedCase.information,
            ":status": updatedCase.caseStatus
        })
    };

    try {
        await dbClient.send(new UpdateItemCommand(params));
        res.json({ message: "Case updated successfully!" });
    } catch (error) {
        console.error("Update case failed:", error);
        res.status(500).json({ error: "Failed to update case." });
    }
});

// 🟡 Delete Case
app.delete("/delete-case/:id", async (req, res) => {
    const { id } = req.params;

    const params = {
        TableName: CASES_TABLE,
        Key: marshall({ id })
    };

    try {
        await dbClient.send(new DeleteItemCommand(params));
        res.json({ message: "Case deleted successfully!" });
    } catch (error) {
        console.error("Delete case failed:", error);
        res.status(500).json({ error: "Failed to delete case." });
    }
});

// 🟠 Export Cases to Excel
app.get("/export-excel", async (req, res) => {
    try {
        const { Items } = await dbClient.send(new ScanCommand({ TableName: CASES_TABLE }));

        if (!Items || Items.length === 0) {
            return res.status(404).json({ error: "No cases found to export." });
        }

        const workbook = new excelJS.Workbook();
        const worksheet = workbook.addWorksheet("Customer Cases");

        worksheet.columns = [
            { header: "ID", key: "id", width: 25 },
            { header: "Name", key: "name", width: 25 },
            { header: "Mobile", key: "mobileNumber", width: 20 },
            { header: "Work", key: "work", width: 25 },
            { header: "Status", key: "caseStatus", width: 20 }
        ];

        Items.forEach((item) => worksheet.addRow(unmarshall(item)));

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", "attachment; filename=cases.xlsx");

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error("Export to Excel failed:", error);
        res.status(500).json({ error: "Failed to export cases to Excel." });
    }
});

// 🟢 Start Server
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
