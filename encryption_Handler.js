const tf = require("@tensorflow/tfjs-node");
const CryptoJS = require("crypto-js");
const path = require("path");
const fs = require("fs");

// Helper function to convert string to binary
function stringToBinary(str) {
    return str.split('').map(char => char.charCodeAt(0).toString(2).padStart(8, '0'))
        .join('').split('').map(bit => parseInt(bit, 10));
}

// Helper function to pad binary arrays
function padBinaryArray(arr, length) {
    return arr.length >= length ? arr.slice(0, length) : [...arr, ...Array(length - arr.length).fill(0)];
}

// Convert binary array back to string
function binaryToString(binaryArray) {
    let binaryString = binaryArray.join("");
    let text = "";
    for (let i = 0; i < binaryString.length; i += 8) {
        text += String.fromCharCode(parseInt(binaryString.slice(i, i + 8), 2));
    }
    return text;
}

// Load TensorFlow models using file:// for local storage

async function loadModel() {
    const encryptionModelPath = path.join(__dirname, "models/encryption-model.json");
    const decryptionModelPath = path.join(__dirname, "models/decryption-model.json");

    if (!fs.existsSync(encryptionModelPath) || !fs.existsSync(decryptionModelPath)) {
        throw new Error("Model files not found. Ensure models exist in the correct path.");
    }

    const encryptionModel = await tf.loadLayersModel(`file://${encryptionModelPath}`);
    const decryptionModel = await tf.loadLayersModel(`file://${decryptionModelPath}`);

    return { encryptionModel, decryptionModel };
}

// AES Encryption
async function cryptoEncrypt(message, key) {
    const keyPadded = key.padEnd(32).slice(0, 32); // Ensure 32-byte key for AES-256
    const iv = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(message, CryptoJS.enc.Utf8.parse(keyPadded), {
        iv,
        mode: CryptoJS.mode.CFB,
    }).ciphertext;

    return CryptoJS.enc.Base64.stringify(iv.concat(encrypted));
}

// AES Decryption
async function cryptoDecrypt(encryptedMessage, key) {
    try {
        const keyPadded = key.padEnd(32).slice(0, 32); // Ensure 32-byte key for AES-256
        const encryptedData = CryptoJS.enc.Base64.parse(encryptedMessage);
        const iv = CryptoJS.lib.WordArray.create(encryptedData.words.slice(0, 4), 16); // Extract IV
        const ciphertext = CryptoJS.lib.WordArray.create(encryptedData.words.slice(4), encryptedData.sigBytes - 16); // Extract ciphertext

        const decrypted = CryptoJS.AES.decrypt(
            { ciphertext },
            CryptoJS.enc.Utf8.parse(keyPadded),
            { iv, mode: CryptoJS.mode.CFB }
        );

        return decrypted.toString(CryptoJS.enc.Utf8); // Convert decrypted data to UTF-8
    } catch (error) {
        console.error("Decryption error:", error);
        return "Decryption failed";
    }
}

// Encrypt function
async function encryptVariableLength(plaintext, key, model, chunkSize = 32) {
    const cryptoEncryptedMessage = await cryptoEncrypt(plaintext, key);
    const plaintextBinary = stringToBinary(cryptoEncryptedMessage);
    const keyBinary = stringToBinary(key);

    const chunks = [];
    for (let i = 0; i < plaintextBinary.length; i += chunkSize) {
        const plaintextChunk = plaintextBinary.slice(i, i + chunkSize);
        const keyChunk = keyBinary.slice(i % keyBinary.length, (i % keyBinary.length) + chunkSize);

        const paddedPlaintextChunk = padBinaryArray(plaintextChunk, chunkSize);
        const paddedKeyChunk = padBinaryArray(keyChunk, chunkSize);

        chunks.push({ plaintextChunk: paddedPlaintextChunk, keyChunk: paddedKeyChunk });
    }

    let ciphertextFlat = [];
    for (const { plaintextChunk, keyChunk } of chunks) {
        const combinedChunk = plaintextChunk.concat(keyChunk);

        if (combinedChunk.length !== chunkSize * 2) {
            console.error(`Chunk length mismatch`);
            continue;
        }

        const inputData = tf.tensor2d([combinedChunk], [1, chunkSize * 2]);
        const ciphertextChunk = model.predict(inputData).dataSync().map(bit => bit > 0.5 ? 1 : 0);
        ciphertextFlat.push(...ciphertextChunk);
        inputData.dispose();
    }

    return ciphertextFlat;
}

// Decrypt function
async function decryptVariableLength(ciphertext, key, model, chunkSize = 32) {
    const keyBinary = stringToBinary(key);

    const chunks = [];
    for (let i = 0; i < ciphertext.length; i += chunkSize) {
        const ciphertextChunk = ciphertext.slice(i, i + chunkSize);
        const keyChunk = keyBinary.slice(i % keyBinary.length, (i % keyBinary.length) + chunkSize);

        const paddedCiphertextChunk = padBinaryArray(ciphertextChunk, chunkSize);
        const paddedKeyChunk = padBinaryArray(keyChunk, chunkSize);

        chunks.push({ ciphertextChunk: paddedCiphertextChunk, keyChunk: paddedKeyChunk });
    }

    let plaintextFlat = [];
    for (const { ciphertextChunk, keyChunk } of chunks) {
        const combinedChunk = ciphertextChunk.concat(keyChunk);

        if (combinedChunk.length !== chunkSize * 2) {
            console.error(`Chunk length mismatch`);
            continue;
        }

        const inputData = tf.tensor2d([combinedChunk], [1, chunkSize * 2]);
        const plaintextChunk = model.predict(inputData).dataSync().map(bit => bit > 0.5 ? 1 : 0);
        plaintextFlat.push(...plaintextChunk);
        inputData.dispose();
    }

    const cryptoEncryptedText = binaryToString(plaintextFlat);
    return await cryptoDecrypt(cryptoEncryptedText, key);
}

module.exports = { loadModel, encryptVariableLength, decryptVariableLength};
