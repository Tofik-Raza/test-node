const tf = require("@tensorflow/tfjs-node");
const CryptoJS = require("crypto-js");
const path = require("path");

// Convert string to binary
function stringToBinary(str) {
    return str.split('').map(char => char.charCodeAt(0).toString(2).padStart(8, '0'))
        .join('').split('').map(bit => parseInt(bit, 10));
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

// Load TensorFlow models
async function loadModel() {
    try {
        const encryptionModel = await tf.loadLayersModel(`file://${path.join(__dirname, "models/encryption-model.json")}`);
        const decryptionModel = await tf.loadLayersModel(`file://${path.join(__dirname, "models/decryption-model.json")}`);
        return { encryptionModel, decryptionModel };
    } catch (error) {
        console.error("❌ Error loading TensorFlow model:", error);
        throw error;
    }
}

// AES Encryption
async function cryptoEncrypt(message, key) {
    const keyPadded = key.padEnd(32).slice(0, 32); 
    const iv = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(message, CryptoJS.enc.Utf8.parse(keyPadded), { iv, mode: CryptoJS.mode.CFB }).ciphertext;
    return CryptoJS.enc.Base64.stringify(iv.concat(encrypted));
}

// AES Decryption
async function cryptoDecrypt(encryptedMessage, key) {
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
}

// Encrypt function
async function encryptVariableLength(plaintext, key, model, chunkSize = 32) {
    const cryptoEncryptedMessage = await cryptoEncrypt(plaintext, key);
    const plaintextBinary = stringToBinary(cryptoEncryptedMessage);
    const keyBinary = stringToBinary(key);

    let ciphertextFlat = [];
    for (let i = 0; i < plaintextBinary.length; i += chunkSize) {
        const inputData = tf.tensor2d([plaintextBinary.slice(i, i + chunkSize).concat(keyBinary.slice(0, chunkSize))], [1, chunkSize * 2]);
        const ciphertextChunk = model.predict(inputData).dataSync().map(bit => bit > 0.5 ? 1 : 0);
        ciphertextFlat.push(...ciphertextChunk);
        inputData.dispose();
    }

    return ciphertextFlat;
}

// Decrypt function
async function decryptVariableLength(ciphertext, key, model, chunkSize = 32) {
    const keyBinary = stringToBinary(key);
    let plaintextFlat = [];

    for (let i = 0; i < ciphertext.length; i += chunkSize) {
        const inputData = tf.tensor2d([ciphertext.slice(i, i + chunkSize).concat(keyBinary.slice(0, chunkSize))], [1, chunkSize * 2]);
        const plaintextChunk = model.predict(inputData).dataSync().map(bit => bit > 0.5 ? 1 : 0);
        plaintextFlat.push(...plaintextChunk);
        inputData.dispose();
    }

    const cryptoEncryptedText = binaryToString(plaintextFlat);
    return await cryptoDecrypt(cryptoEncryptedText, key);
}

module.exports = { loadModel, encryptVariableLength, decryptVariableLength };
