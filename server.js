const express = require("express");
const AWS = require("aws-sdk");
const { DynamoDBClient, GetItemCommand, ScanCommand, PutItemCommand, DeleteItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

const dbClient = new DynamoDBClient({ region: "us-east-1" });
const USERS_TABLE = "Users";
const CASES_TABLE = "Cases";

// ✅ Login Route (Fixed with detailed logs)
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    console.log("🔑 Login Attempt:", { username });

    if (!username || !password) {
        return res.status(400).json({ error: "Username and password are required" });
    }

    try {
        const params = {
            TableName: USERS_TABLE,
            Key: marshall({ id: username }),
        };

        const { Item } = await dbClient.send(new GetItemCommand(params));

        if (Item) {
            const user = unmarshall(Item);
            console.log("👤 User Found:", user);

            if (user.password === password) {
                res.json({ message: "Login successful", user: { username: user.id, role: user.role } });
            } else {
                res.status(401).json({ error: "Invalid password" });
            }
        } else {
            res.status(404).json({ error: "User not found" });
        }
    } catch (err) {
        console.error("❌ Login failed:", err);
        res.status(500).json({ error: "Login failed", details: err.message });
    }
});

// ✅ Fetch Cases
app.get("/cases", async (req, res) => {
    try {
        const { search } = req.query;
        console.log("🔍 Fetching cases with search:", search || "No search");

        const params = { TableName: CASES_TABLE };
        const { Items } = await dbClient.send(new ScanCommand(params));

        const cases = Items.map((item) => unmarshall(item));

        if (search) {
            const filteredCases = cases.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));
            res.json(filteredCases);
        } else {
            res.json(cases);
        }
    } catch (err) {
        console.error("❌ Error fetching cases:", err);
        res.status(500).json({ error: "Failed to fetch cases", details: err.message });
    }
});

// ✅ Add Case
app.post("/add-case", async (req, res) => {
    const caseData = req.body;

    console.log("➕ Adding new case:", caseData);

    try {
        if (!caseData.id) {
            caseData.id = Date.now().toString(); // Add unique ID if missing
        }

        const params = {
            TableName: CASES_TABLE,
            Item: marshall(caseData),
        };

        await dbClient.send(new PutItemCommand(params));
        res.json({ message: "Case added successfully!" });
    } catch (err) {
        console.error("❌ Error adding case:", err);
        res.status(500).json({ error: "Failed to add case", details: err.message });
    }
});

// ✅ Delete Case
app.delete("/delete-case/:id", async (req, res) => {
    const { id } = req.params;

    console.log("🗑️ Deleting case with ID:", id);

    try {
        const params = {
            TableName: CASES_TABLE,
            Key: marshall({ id }),
        };

        await dbClient.send(new DeleteItemCommand(params));
        res.json({ message: "Case deleted successfully!" });
    } catch (err) {
        console.error("❌ Error deleting case:", err);
        res.status(500).json({ error: "Failed to delete case", details: err.message });
    }
});

// ✅ Start Server
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
