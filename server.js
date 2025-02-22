const express = require("express");
const TABLE_NAME = "CustomerCases";
const { DynamoDBClient, ScanCommand, PutItemCommand, DeleteItemCommand } = require("@aws-sdk/client-dynamodb");
const cors = require("cors");
const bodyParser = require("body-parser");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");

const app = express();
const port = 4000;

app.use(cors());
app.use(bodyParser.json());

// ✅ AWS DynamoDB Configuration (Direct Credentials)
const client = new DynamoDBClient({
    region: "eu-north-1",
    credentials: {
        accessKeyId: "AKIAUBKFB7SHVAAB7HE3",
        secretAccessKey: "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",
    },
});


// ✅ Test Route
app.get("/", (req, res) => {
    res.json({ message: "Customer Management System API is running with AWS SDK v3!" });
});

// ✅ Fetch All Cases
app.get("/cases", async (req, res) => {
    const params = {
        TableName: TABLE_NAME,
        
    };

    try {
        const command = new ScanCommand(params);
        const data = await client.send(command);
        const cases = data.Items.map((item) => unmarshall(item));
        res.json(cases);
    } catch (err) {
        res.status(500).json({ error: "Could not fetch cases", details: err.message });
    }
});

// ✅ Add a New Case
app.post("/add-case", async (req, res) => {
    const { date_received, staff, mobile, name, work, info, pending, remarks, status } = req.body;

    if (!name || !mobile) {
        return res.status(400).json({ error: "Name and Mobile are required" });
    }

    const params = {
        TableName: TABLE_NAME,
        Item: marshall({
            id: Date.now().toString(),
            date_received,
            staff,
            mobile,
            name,
            work,
            info,
            pending,
            remarks,
            status,
        }),
    };

    try {
        const command = new PutItemCommand(params);
        await client.send(command);
        res.json({ success: true, message: "Case added successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Could not add case", details: err.message });
    }
});

// ✅ Delete a Case
app.delete("/delete-case/:id", async (req, res) => {
    const { id } = req.params;

    const params = {
        TableName: TABLE_NAME,
        Key: marshall({ id }),
    };

    try {
        const command = new DeleteItemCommand(params);
        await client.send(command);
        res.json({ success: true, message: "Case deleted successfully!" });
    } catch (err) {
        res.status(500).json({ error: "Could not delete case", details: err.message });
    }
});

// ✅ Start the Server
app.listen(port, () => {
    console.log(`✅ Server running on http://localhost:${port}`);
});
