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

// ✅ Health Check
app.get("/", (req, res) => {
    res.send("Customer Management System Backend is Running!");
});

// ✅ User Login
app.post("/login", async (req, res) => {
    const { username, password } = req.body;
    console.log("Login request received:", { username });

    const params = {
        TableName: USERS_TABLE,
        Key: marshall({ username }),
    };

    try {
        const { Item } = await dbClient.send(new GetItemCommand(params));

        if (!Item) {
            console.log("User not found in database!");
            return res.status(404).json({ error: "User not found" });
        }

        const user = unmarshall(Item);
        console.log("User found:", user);

        const passwordMatch = await bcrypt.compare(password, user.password);
        console.log("Password match result:", passwordMatch);

        if (passwordMatch) {
            res.json({ 
                message: "Login successful!", 
                user: { username: user.username, role: user.role } 
            });
        } else {
            console.log("Invalid password!");
            res.status(401).json({ error: "Invalid password" });
        }
    } catch (error) {
        console.error("Login failed:", error);
        res.status(500).json({ error: "Login failed." });
    }
});

// ✅ Add New User
app.post("/add-user", async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: "All fields are required (username, password, role)" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const params = {
            TableName: USERS_TABLE,
            Item: marshall({ 
                username,
                password: hashedPassword,
                role
            }),
        };

        await dbClient.send(new PutItemCommand(params));
        res.json({ message: "User added successfully!" });

    } catch (error) {
        console.error("Add user failed:", error);
        res.status(500).json({ error: "Failed to add user." });
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

// ✅ Start Server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
