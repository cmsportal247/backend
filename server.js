require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { 
    DynamoDBClient, 
    GetItemCommand, 
    PutItemCommand, 
    ScanCommand, 
    DeleteItemCommand 
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
const CASES_TABLE = "CustomerCases";

// Middleware to verify token
function verifyToken(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
        return res.status(401).json({ error: "Unauthorized - No token provided" });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error("Invalid token:", error);
        res.status(403).json({ error: "Invalid or expired token" });
    }
}

// Add New User
app.post("/add-user", async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password || !role) {
        return res.status(400).json({ error: "Username, password, and role are required" });
    }
    const userData = { username, password, role };
    const params = {
        TableName: USERS_TABLE,
        Item: marshall(userData),
    };
    try {
        await dbClient.send(new PutItemCommand(params));
        res.json({ message: "User added successfully!" });
    } catch (error) {
        console.error("❌ Add user failed:", error);
        res.status(500).json({ error: "Failed to add user." });
    }
});

// User Login
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
            return res.status(404).json({ error: "Invalid credentials" });
        }
        const user = unmarshall(Item);
        if (password === user.password) {
            const token = jwt.sign({ username: user.username, role: user.role }, process.env.JWT_SECRET);
            res.json({ message: "Login successful!", token, user: { username: user.username, role: user.role } });
        } else {
            res.status(401).json({ error: "Invalid credentials" });
        }
    } catch (error) {
        console.error("❌ Login failed:", error);
        res.status(500).json({ error: "Login failed." });
    }
});

// Fetch All Cases
app.get("/cases", verifyToken, async (req, res) => {
    try {
        const params = { TableName: CASES_TABLE };
        const data = await dbClient.send(new ScanCommand(params));
        if (!data.Items) return res.json([]);
        const cases = data.Items.map(item => unmarshall(item));
        res.json(cases);
    } catch (error) {
        console.error("❌ Fetch cases failed:", error);
        res.status(500).json({ error: "Failed to fetch cases." });
    }
});

// Add New Case
app.post("/add-case", verifyToken, async (req, res) => {
    const { date, staff, mobile, name, work, info, pending, remarks, status } = req.body;
    if (!date || !staff || !mobile || !name) {
        return res.status(400).json({ error: "Date, staff, mobile, and name are required" });
    }
    const caseData = { id: Date.now().toString(), date, staff, mobile, name, work, info, pending, remarks, status };
    const params = {
        TableName: CASES_TABLE,
        Item: marshall(caseData),
    };
    try {
        await dbClient.send(new PutItemCommand(params));
        res.json({ message: "Case added successfully!" });
    } catch (error) {
        console.error("❌ Add case failed:", error);
        res.status(500).json({ error: "Failed to add case." });
    }
});

// Delete Case
app.delete("/delete-case/:id", verifyToken, async (req, res) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).json({ error: "Case ID is required" });
    }
    const params = {
        TableName: CASES_TABLE,
        Key: marshall({ id }),
    };
    try {
        await dbClient.send(new DeleteItemCommand(params));
        res.json({ message: "Case deleted successfully!" });
    } catch (error) {
        console.error("❌ Delete case failed:", error);
        res.status(500).json({ error: "Failed to delete case." });
    }
});

// Start Server
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
