require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { 
    DynamoDBClient, 
    GetItemCommand, 
    PutItemCommand, 
    ScanCommand 
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
const CASES_TABLE = "CustomerCases"; // Make sure your table name is correct!

// ✅ Add New User (Plain Text Password)
app.post("/add-user", async (req, res) => {
    const { username, password, role } = req.body;

    if (!username || !password || !role) {
        return res.status(400).json({ error: "Username, password, and role are required" });
    }

    const userData = {
        username,
        password,  
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

// ✅ User Login (With Token — No Expiry)
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

            // Generate a JWT token (no expiry)
            const token = jwt.sign({ username: user.username, role: user.role }, process.env.JWT_SECRET);

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

// ✅ Fetch All Cases (Token Required)
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
            TableName: CASES_TABLE
        };

        const data = await dbClient.send(new ScanCommand(params));

        if (!data.Items) {
            return res.json([]);
        }

        // Unmarshall the items
        const cases = data.Items.map(item => unmarshall(item));

        console.log("📂 Fetched cases data:", cases); // Log the fetched data

        res.json(cases);
    } catch (error) {
        console.error("Invalid token or DB error:", error);
        res.status(403).json({ error: "Invalid or expired token" });
    }
});

// ✅ Start Server
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
