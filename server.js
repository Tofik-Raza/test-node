const express = require("express");
const cors = require("cors");
const { loadModel, encryptVariableLength, decryptVariableLength } = require("./encryption_Handler");

const app = express();
app.use(cors());
app.use(express.json());

let models = {};

// Load the TensorFlow model at startup
(async () => {
    try {
        models = await loadModel();
        console.log("✅ Model loaded successfully!");
    } catch (error) {
        console.error("❌ Error loading model:", error);
    }
})();

// ** Status Check Route **
app.get("/status", (req, res) => {
    res.json({ status: "Server is running successfully!" });
});

// ** Encryption Endpoint **
app.post("/encrypt", async (req, res) => {
    const { plaintext, key } = req.body;
    if (!plaintext || !key) {
        return res.status(400).json({ error: "Missing plaintext or key" });
    }

    try {
        const encryptedBinary = await encryptVariableLength(plaintext, key, models.encryptionModel);
        res.json({ encryptedBinary });
    } catch (error) {
        console.error("❌ Encryption error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ** Decryption Endpoint **
app.post("/decrypt", async (req, res) => {
    const { encryptedBinary, key } = req.body;
    if (!encryptedBinary || !key) {
        return res.status(400).json({ error: "Missing ciphertext or key" });
    }

    try {
        const plaintext = await decryptVariableLength(encryptedBinary, key, models.decryptionModel);
        res.json({ plaintext });
    } catch (error) {
        console.error("❌ Decryption error:", error);
        res.status(500).json({ error: error.message });
    }
});

// ** Test Encryption Route **
app.get("/test-encryption", async (req, res) => {
    const plaintext = "HelloWorld";
    const key = "MySecretKey123";
    
    try {
        const encryptedBinary = await encryptVariableLength(plaintext, key, models.encryptionModel);
        res.json({ plaintext, encryptedBinary });
    } catch (error) {
        res.status(500).json({ error: "Encryption failed", details: error.message });
    }
});

// ** Test Decryption Route **
app.get("/test-decryption", async (req, res) => {
    const plaintext = "HelloWorld";
    const key = "MySecretKey123";
    
    try {
        const encryptedBinary = await encryptVariableLength(plaintext, key, models.encryptionModel);
        const decryptedText = await decryptVariableLength(encryptedBinary, key, models.decryptionModel);
        res.json({ plaintext, encryptedBinary, decryptedText });
    } catch (error) {
        res.status(500).json({ error: "Decryption failed", details: error.message });
    }
});

// ** Start the Server **
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
