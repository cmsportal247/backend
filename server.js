require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  DeleteItemCommand,
  UpdateItemCommand
} = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const jwt = require("jsonwebtoken");

const app = express();
const port = process.env.PORT || 4000;

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
  const { date, name, mobile, altMobile, work, frameSize, frameColor, requiredDetails, advance, actualPrice, status } = req.body;
  if (!date || !name || !mobile) {
    return res.status(400).json({ error: "Date, name, and mobile are required" });
  }
  const caseData = {
    id: Date.now().toString(),
    date, name, mobile, altMobile, work, frameSize, frameColor,
    requiredDetails, advance, actualPrice, status
  };
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

// Update Case
app.put("/update-case/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { date, name, mobile, altMobile, work, frameSize, frameColor, requiredDetails, advance, actualPrice, status } = req.body;
  if (!date || !name || !mobile) {
    return res.status(400).json({ error: "Date, name, and mobile are required" });
  }
  const updateValues = {
    ":date": date,
    ":name": name,
    ":mobile": mobile,
    ":altMobile": altMobile || "",
    ":work": work || "",
    ":frameSize": frameSize || "",
    ":frameColor": frameColor || "",
    ":requiredDetails": requiredDetails || "",
    ":advance": advance || "0",
    ":actualPrice": actualPrice || "0",
    ":status": status
  };
  const params = {
    TableName: CASES_TABLE,
    Key: marshall({ id }),
    UpdateExpression: `set #date = :date, #name = :name, mobile = :mobile, altMobile = :altMobile,
                        #work = :work, frameSize = :frameSize, frameColor = :frameColor,
                        requiredDetails = :requiredDetails, advance = :advance, actualPrice = :actualPrice,
                        #status = :status`,
    ExpressionAttributeNames: {
      "#date": "date",
      "#name": "name",
      "#work": "work",
      "#status": "status"
    },
    ExpressionAttributeValues: marshall(updateValues),
    ReturnValues: "ALL_NEW"
  };
  try {
    const data = await dbClient.send(new UpdateItemCommand(params));
    const updatedCase = unmarshall(data.Attributes);
    res.json({ message: "Case updated successfully!", updatedCase });
  } catch (error) {
    console.error("❌ Update case failed:", error);
    res.status(500).json({ error: "Failed to update case.", details: error.message });
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

// Export Cases to Excel
app.get("/export-excel", async (req, res) => {
  let token = req.headers.authorization?.split(" ")[1] || req.query.token;
  if (!token) {
    return res.status(401).json({ error: "Unauthorized - No token provided" });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }

  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: "Both from and to dates are required" });
  }

  try {
    const data = await dbClient.send(new ScanCommand({ TableName: CASES_TABLE }));
    let cases = data.Items ? data.Items.map(item => unmarshall(item)) : [];

    // Filter by date
    cases = cases.filter(c => c.date >= from && c.date <= to);

    // Build CSV
    const headers = "id,date,name,mobile,altMobile,work,frameSize,frameColor,requiredDetails,advance,actualPrice,status\n";
    const csvRows = cases.map(c =>
      `"${c.id}","${c.date}","${c.name}","${c.mobile}","${c.altMobile || ""}","${c.work || ""}","${c.frameSize || ""}","${c.frameColor || ""}","${c.requiredDetails || ""}","${c.advance || ""}","${c.actualPrice || ""}","${c.status || ""}"`
    );
    const csv = headers + csvRows.join("\n");

    res.setHeader('Content-Disposition', 'attachment; filename="cases.csv"');
    res.set('Content-Type', 'text/csv');
    res.status(200).send(csv);
  } catch (error) {
    console.error("❌ Export cases failed:", error);
    res.status(500).json({ error: "Failed to export cases." });
  }
});

// Change Password
app.post("/change-password", verifyToken, async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const username = req.user.username;

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: "Old and new passwords are required" });
  }

  try {
    const { Item } = await dbClient.send(new GetItemCommand({ TableName: USERS_TABLE, Key: marshall({ username }) }));
    if (!Item) return res.status(404).json({ error: "User not found" });

    const user = unmarshall(Item);
    if (oldPassword !== user.password) {
      return res.status(401).json({ error: "Old password is incorrect" });
    }

    const updateParams = {
      TableName: USERS_TABLE,
      Key: marshall({ username }),
      UpdateExpression: "set password = :newPassword",
      ExpressionAttributeValues: marshall({ ":newPassword": newPassword }),
      ReturnValues: "ALL_NEW"
    };
    const updateData = await dbClient.send(new UpdateItemCommand(updateParams));
    const updatedUser = unmarshall(updateData.Attributes);
    res.json({ message: "Password updated successfully!", updatedUser });
  } catch (error) {
    console.error("❌ Change password failed:", error);
    res.status(500).json({ error: "Failed to change password.", details: error.message });
  }
});

// Start Server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
