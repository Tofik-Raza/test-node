const tf = require("@tensorflow/tfjs-node"); 
const CryptoJS = require("crypto-js");
const path = require("path");
const fs = require("fs");

// ** Convert string to binary array **
const stringToBinary = (str) => 
    str.split("").flatMap(char => char.charCodeAt(0).toString(2).padStart(8, "0").split("").map(Number));

// ** Convert binary array to string **
const binaryToString = (binaryArray) => 
    binaryArray.reduce((acc, bit, idx) => {
        if (idx % 8 === 0) acc.push([]);
        acc[acc.length - 1].push(bit);
        return acc;
    }, []).map(byte => String.fromCharCode(parseInt(byte.join(""), 2))).join("");

// ** Pad binary array to required length **
const padBinaryArray = (arr, length) => arr.concat(Array(Math.max(length - arr.length, 0)).fill(0)).slice(0, length);

// ** Load TensorFlow models **
async function loadModel() {
    try {
        const modelPaths = {
            encryptionModel: path.resolve(__dirname, "models/encryption-model.json"),
            decryptionModel: path.resolve(__dirname, "models/decryption-model.json"),
        };

        for (const key in modelPaths) {
            if (!fs.existsSync(modelPaths[key])) throw new Error(`❌ Model file missing: ${modelPaths[key]}`);
        }

        const encryptionModel = await tf.loadLayersModel(`file://${modelPaths.encryptionModel}`);
        const decryptionModel = await tf.loadLayersModel(`file://${modelPaths.decryptionModel}`);

        return { encryptionModel, decryptionModel };
    } catch (error) {
        console.error("❌ Failed to load models:", error);
        throw error;
    }
}

// ** AES Encryption **
const cryptoEncrypt = async (message, key) => {
    try {
        const keyPadded = key.padEnd(32).slice(0, 32); // Ensure 32-byte key for AES-256
        const iv = CryptoJS.lib.WordArray.random(16);
        const encrypted = CryptoJS.AES.encrypt(message, CryptoJS.enc.Utf8.parse(keyPadded), { iv, mode: CryptoJS.mode.CFB }).ciphertext;
        return CryptoJS.enc.Base64.stringify(iv.concat(encrypted));
    } catch (error) {
        console.error("❌ Encryption error:", error);
        throw error;
    }
};

// ** AES Decryption **
const cryptoDecrypt = async (encryptedMessage, key) => {
    try {
        const keyPadded = key.padEnd(32).slice(0, 32);
        const encryptedData = CryptoJS.enc.Base64.parse(encryptedMessage);
        const iv = CryptoJS.lib.WordArray.create(encryptedData.words.slice(0, 4), 16);
        const ciphertext = CryptoJS.lib.WordArray.create(encryptedData.words.slice(4), encryptedData.sigBytes - 16);
        const decrypted = CryptoJS.AES.decrypt({ ciphertext }, CryptoJS.enc.Utf8.parse(keyPadded), { iv, mode: CryptoJS.mode.CFB });

        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
        console.error("❌ Decryption error:", error);
        return "Decryption failed";
    }
};

// ** Encrypt Function (Neural Network + AES) **
async function encryptVariableLength(plaintext, key, model, chunkSize = 32) {
    try {
        const cryptoEncryptedMessage = await cryptoEncrypt(plaintext, key);
        const plaintextBinary = stringToBinary(cryptoEncryptedMessage);
        const keyBinary = stringToBinary(key);

        const chunks = plaintextBinary.map((_, i) => ({
            plaintextChunk: padBinaryArray(plaintextBinary.slice(i, i + chunkSize), chunkSize),
            keyChunk: padBinaryArray(keyBinary.slice(i % keyBinary.length, (i % keyBinary.length) + chunkSize), chunkSize),
        }));

        let ciphertextFlat = [];
        for (const { plaintextChunk, keyChunk } of chunks) {
            const inputData = tf.tensor2d([plaintextChunk.concat(keyChunk)], [1, chunkSize * 2]);
            const ciphertextChunk = model.predict(inputData).dataSync().map(bit => (bit > 0.5 ? 1 : 0));
            ciphertextFlat.push(...ciphertextChunk);
            inputData.dispose();
        }

        return ciphertextFlat;
    } catch (error) {
        console.error("❌ Encryption error:", error);
        throw error;
    }
}

// ** Decrypt Function (Neural Network + AES) **
async function decryptVariableLength(ciphertext, key, model, chunkSize = 32) {
    try {
        const keyBinary = stringToBinary(key);
        const chunks = ciphertext.map((_, i) => ({
            ciphertextChunk: padBinaryArray(ciphertext.slice(i, i + chunkSize), chunkSize),
            keyChunk: padBinaryArray(keyBinary.slice(i % keyBinary.length, (i % keyBinary.length) + chunkSize), chunkSize),
        }));

        let plaintextFlat = [];
        for (const { ciphertextChunk, keyChunk } of chunks) {
            const inputData = tf.tensor2d([ciphertextChunk.concat(keyChunk)], [1, chunkSize * 2]);
            const plaintextChunk = model.predict(inputData).dataSync().map(bit => (bit > 0.5 ? 1 : 0));
            plaintextFlat.push(...plaintextChunk);
            inputData.dispose();
        }

        return await cryptoDecrypt(binaryToString(plaintextFlat), key);
    } catch (error) {
        console.error("❌ Decryption error:", error);
        throw error;
    }
}

module.exports = { loadModel, encryptVariableLength, decryptVariableLength };
