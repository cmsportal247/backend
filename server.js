require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require('uuid');
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

// ✅ Add New User (Plain Text Password)
app.post("/add-user", async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: "Username, password, and role are required" });
    }

    const userData = {
        username,
        password, // 🚨 Plain text password (for demo)
        role
    };

    const params = {
        TableName: USERS_TABLE,
        Item: marshall(userData),
    };

    try {
        await dbClient.send(new PutItemCommand(params));
        res.json({ message: "User added successfully!" });
    } catch (error) {
        console.error("Add user failed:", error);
        res.status(500).json({ error: "Failed to add user." });
    }
});

// ✅ User Login (Plain Text Password)
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

        // 🚨 Plain text comparison
        if (password === user.password) {
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

// ✅ Start Server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
