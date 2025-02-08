const express = require("express");
const cors = require("cors");
const { loadModel, encryptVariableLength, decryptVariableLength } = require("./hope");

const app = express();
app.use(cors());
app.use(express.json());

let model;

// Load the TensorFlow model at startup
let models = {};
(async () => {
    models = await loadModel();
    console.log("Model loaded successfully!");
})();

// Encryption endpoint
app.post("/encrypt", async (req, res) => {
    const { plaintext, key } = req.body;
    if (!plaintext || !key) {
        return res.status(400).json({ error: "Missing plaintext or key" });
    }

    try {
        const encryptedBinary = await encryptVariableLength(plaintext, key, models.encryptionModel);
        res.json({ encryptedBinary });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Decryption endpoint
app.post("/decrypt", async (req, res) => {
    const { encryptedBinary, key } = req.body;
    if (!encryptedBinary || !key) {
        return res.status(400).json({ error: "Missing ciphertext or key" });
    }

    try {
        const plaintext = await decryptVariableLength(encryptedBinary, key, models.decryptionModel);

        res.json({ plaintext });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Helper function to convert binary array to string
function binaryToString(binaryArray) {
    let binaryString = binaryArray.join("");
    let text = "";
    for (let i = 0; i < binaryString.length; i += 8) {
        text += String.fromCharCode(parseInt(binaryString.slice(i, i + 8), 2));
    }
    return text;
}

// Start the server
const PORT = 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
