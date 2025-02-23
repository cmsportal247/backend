const { DynamoDBClient, GetItemCommand, PutItemCommand, ScanCommand, DeleteItemCommand } = require("@aws-sdk/client-dynamodb");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const app = express();
const port = 4000;

app.use(cors());
app.use(bodyParser.json());

// ✅ AWS DynamoDB Configuration
const dbClient = new DynamoDBClient({ region: "your-region" }); // Replace with your region
const TABLE_NAME = "Users";

// ✅ Login Route
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    console.log("🔑 Login Attempt:", { username });

    const params = {
        TableName: TABLE_NAME,
        Key: marshall({ id: username }),
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
        console.error("❌ Login failed:", error);
        res.status(500).json({ error: "Login failed. Check server logs." });
    }
});

// ✅ Fetch Cases
app.get("/cases", async (req, res) => {
    const params = { TableName: "Cases" };

    try {
        const { Items } = await dbClient.send(new ScanCommand(params));

        if (Items && Items.length > 0) {
            const cases = Items.map((item) => unmarshall(item));
            res.json(cases);
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error("❌ Fetch cases failed:", error);
        res.status(500).json({ error: "Failed to fetch cases." });
    }
});

// ✅ Add Case
app.post("/add-case", async (req, res) => {
    const caseData = req.body;

    const params = {
        TableName: "Cases",
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

// ✅ Delete Case
app.delete("/delete-case/:id", async (req, res) => {
    const { id } = req.params;

    const params = {
        TableName: "Cases",
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

// ✅ Start Server
app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
});
