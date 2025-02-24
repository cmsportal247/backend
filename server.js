require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { 
    DynamoDBClient, 
    GetItemCommand, 
    PutItemCommand,
    ScanCommand   // ✅ Added ScanCommand here!
} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const jwt = require("jsonwebtoken");

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

// ✅ Add New User (Plain Text Password)
app.post("/add-user", async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: "Username, password, and role are required" });
    }

    const userData = {
        username,
        password,  // 🚨 Plain text password (for demo purposes)
        role
    };

    const params = {
        TableName: USERS_TABLE,
        Item: marshall(userData),
    };

    try {
        await dbClient.send(new PutItemCommand(params));
        console.log(`✅ User ${username} added successfully!`);
        res.json({ message: "User added successfully!" });
    } catch (error) {
        console.error("❌ Add user failed:", error);
        res.status(500).json({ error: "Failed to add user." });
    }
});

// ✅ User Login (With Token)
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }

    const params = {
        TableName: USERS_TABLE,
        Key: marshall({ username }),
    };

    try {
        const { Item } = await dbClient.send(new GetItemCommand(params));

        if (!Item) {
            console.log("❌ User not found:", username);
            return res.status(404).json({ error: "Invalid credentials" });
        }

        const user = unmarshall(Item);

        // 🚨 Plain text password check
        if (password === user.password) {
            console.log("✅ Login successful:", username);

            // Generate a JWT token
            const token = jwt.sign({ username: user.username, role: user.role }, process.env.JWT_SECRET, { expiresIn: "1h" });

            res.json({ 
                message: "Login successful!", 
                token,
                user: { username: user.username, role: user.role }
            });
        } else {
            console.log("❌ Invalid password for:", username);
            res.status(401).json({ error: "Invalid credentials" });
        }
    } catch (error) {
        console.error("❌ Login failed:", error);
        res.status(500).json({ error: "Login failed." });
    }
});

// ✅ Protected Route Example (Token Required)
app.get("/cases", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Unauthorized - No token provided" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log("🔓 Token verified:", decoded);

        // Fetching cases from DynamoDB
        const params = {
            TableName: "cases"  // Make sure the table name matches exactly!
        };

        const data = await dbClient.send(new ScanCommand(params));  // ✅ ScanCommand fixed
        console.log("📂 Fetched cases data:", data.Items); // Log the fetched data

        res.json(data.Items || []);
    } catch (error) {
        console.error("Invalid token or DB error:", error);
        res.status(403).json({ error: "Invalid or expired token" });
    }
});

// ✅ Start Server
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
