process.env.TF_CPP_MIN_LOG_LEVEL = "2";
const express = require("express");
const cors = require("cors");
const { loadModel, encryptVariableLength, decryptVariableLength } = require("./encryption_Handler");

const app = express();
app.use(cors());
app.use(express.json());

let models = {};

// Load TensorFlow model asynchronously at startup
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
    try {
        if (!models.encryptionModel) {
            return res.status(503).json({ error: "Model is still loading. Try again later." });
        }

        const { plaintext, key } = req.body;
        if (!plaintext || !key) {
            return res.status(400).json({ error: "Missing plaintext or key" });
        }

        const encryptedBinary = await encryptVariableLength(plaintext, key, models.encryptionModel);
        res.json({ encryptedBinary });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ** Decryption Endpoint **
app.post("/decrypt", async (req, res) => {
    try {
        if (!models.decryptionModel) {
            return res.status(503).json({ error: "Model is still loading. Try again later." });
        }

        const { encryptedBinary, key } = req.body;
        if (!encryptedBinary || !key) {
            return res.status(400).json({ error: "Missing ciphertext or key" });
        }

        const plaintext = await decryptVariableLength(encryptedBinary, key, models.decryptionModel);
        res.json({ plaintext });
    } catch (error) {
        console.error("❌ Decryption error:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
