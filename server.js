require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require('uuid'); // For unique ID generation
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

// Login Route
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    console.log("Login Attempt:", { username });

    const params = {
        TableName: USERS_TABLE,
        Key: marshall({ username }),   // Match with DynamoDB primary key
    };

    try {
        const { Item } = await dbClient.send(new GetItemCommand(params));

        if (Item) {
            const user = unmarshall(Item);

            if (user.password === password) {
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

// Fetch Cases
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

// Add Case
app.post("/add-case", async (req, res) => {
    const caseData = req.body;

    // Ensure ID and createdAt timestamp
    if (!caseData.id) {
        caseData.id = uuidv4(); // Generate a unique ID if not provided
    }

    if (!caseData.createdAt) {
        caseData.createdAt = new Date().toISOString(); // Add timestamp if missing
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


// Delete Case
app.delete("/delete-case/:id", async (req, res) => {
    const { id } = req.params;

    const params = {
        TableName: CASES_TABLE,
        Key: marshall({ id }),
    };

    try {
        const result = await dbClient.send(new DeleteItemCommand(params));

        if (result) {
            res.json({ message: "Case deleted successfully!" });
        } else {
            res.status(404).json({ error: "Case not found" });
        }
    } catch (error) {
        console.error("Delete case failed:", error);
        res.status(500).json({ error: "Failed to delete case." });
    }
});

// Start Server
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
