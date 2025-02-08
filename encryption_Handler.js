const tf = require("@tensorflow/tfjs");
const path = require("path");

// Helper function to convert string to binary
function stringToBinary(str) {
    return str.split('').map(char => char.charCodeAt(0).toString(2).padStart(8, '0'))
        .join('').split('').map(bit => parseInt(bit, 10));
}

// Helper function to pad binary arrays
function padBinaryArray(arr, length) {
    return arr.length >= length ? arr.slice(0, length) : [...arr, ...Array(length - arr.length).fill(0)];
}

// Load the TensorFlow model

async function loadModel() {
    const encryptedmodel = await tf.loadLayersModel(`file://${path.join(__dirname, "models/encryption-model.json")}`);
    const decryptedmodel = await tf.loadLayersModel(`file://${path.join(__dirname, "models/decryption-model.json")}`);
    return { encryptedmodel, decryptedmodel };
}

// Encrypt function
async function encryptVariableLength(plaintext, key, model, chunkSize = 32) {
    const plaintextBinary = stringToBinary(plaintext);
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
        const ciphertextChunk = await model.predict(inputData).dataSync().map(bit => bit > 0.5 ? 1 : 0);
        ciphertextFlat.push(...ciphertextChunk);
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
        const plaintextChunk = await model.predict(inputData).dataSync().map(bit => bit > 0.5 ? 1 : 0);
        plaintextFlat.push(...plaintextChunk);
    }

    return plaintextFlat;
}

module.exports = { loadModel, encryptVariableLength, decryptVariableLength };
