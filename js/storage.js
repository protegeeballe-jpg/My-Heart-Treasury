/**
 * Native IndexedDB Storage Engine with Web Crypto API (AES-GCM / PBKDF2)
 * Zero external dependencies, fully backward compatible, 100% free.
 */
const TreasuryStorage = {
    dbName: 'HeartTreasuryDB',
    storeName: 'vault',

    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });
    },

    async get(key) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async set(key, val) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.put(val, key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async del(key) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    // --- Crypto Helper Functions (AES-GCM & PBKDF2) ---
    async _deriveKey(pin, salt) {
        const enc = new TextEncoder();
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(pin),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );
        return window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: salt,
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt", "decrypt"]
        );
    },

    async _encrypt(pin, dataObj) {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const key = await this._deriveKey(pin, salt);
        const encoded = new TextEncoder().encode(JSON.stringify(dataObj));
        const ciphertext = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv: iv },
            key,
            encoded
        );
        return {
            encrypted: true,
            salt: Array.from(salt),
            iv: Array.from(iv),
            ciphertext: Array.from(new Uint8Array(ciphertext))
        };
    },

    async _decrypt(pin, storedObj) {
        try {
            const salt = new Uint8Array(storedObj.salt);
            const iv = new Uint8Array(storedObj.iv);
            const ciphertext = new Uint8Array(storedObj.ciphertext);
            const key = await this._deriveKey(pin, salt);
            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv },
                key,
                ciphertext
            );
            return JSON.parse(new TextDecoder().decode(decrypted));
        } catch (err) {
            throw new Error("Invalid PIN or corrupted data vault.");
        }
    },
    // --------------------------------------------------

    async getActiveSession() {
        try {
            return await this.get('active_session') || null;
        } catch (err) {
            console.error('Failed to get active session:', err);
            return null;
        }
    },

    async setActiveSession(session) {
        try {
            await this.set('active_session', session);
        } catch (err) {
            console.error('Failed to save active session:', err);
        }
    },

    async getDatabase() {
        try {
            const rawData = await this.get('treasury_db');
            if (!rawData) return {};

            // Backward Compatibility: If data is stored in plain text (legacy), return it directly
            if (!rawData.encrypted) {
                return rawData;
            }

            // If encrypted, we require the active session PIN to decrypt it
            const activeSession = await this.getActiveSession();
            if (!activeSession || !activeSession.pin) {
                return {}; // Locked until PIN is provided
            }

            return await this._decrypt(activeSession.pin, rawData);
        } catch (err) {
            console.error('Failed to get or decrypt database:', err);
            return {};
        }
    },

    async saveDayEntry(dateKey, payload) {
        try {
            let db = await this.getDatabase();
            if (!db[dateKey]) {
                db[dateKey] = { totalHearts: 0, entries: [] };
            }
            db[dateKey].totalHearts += payload.hearts;
            db[dateKey].entries.push({
                timestamp: payload.attachment ? payload.attachment.timestamp : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                hearts: payload.hearts,
                note: payload.attachment ? payload.attachment.note : null,
                media: payload.attachment ? payload.attachment.media : null
            });

            // Check if PIN protection is active, encrypt before saving
            const activeSession = await this.getActiveSession();
            if (activeSession && activeSession.pin) {
                const encryptedPayload = await this._encrypt(activeSession.pin, db);
                await this.set('treasury_db', encryptedPayload);
            } else {
                await this.set('treasury_db', db);
            }
        } catch (err) {
            alert(`Error saving to device storage: ${err.message}`);
        }
    },

    async getPin() {
        try {
            // Returns the encrypted verification token object
            return await this.get('my_heart_treasury_pin_v1') || null;
        } catch (err) {
            return null;
        }
    },

    async setPin(pin) {
        try {
            // Securely store an encrypted validation canary instead of the raw PIN
            const validationCanary = await this._encrypt(pin, { status: "VALID_PIN" });
            await this.set('my_heart_treasury_pin_v1', validationCanary);

            // Also encrypt existing database immediately with the new PIN
            let db = await this.getDatabase();
            if (db && Object.keys(db).length > 0 && !db.encrypted) {
                const encryptedDb = await this._encrypt(pin, db);
                await this.set('treasury_db', encryptedDb);
            }
        } catch (err) {
            console.error('Failed to save PIN:', err);
        }
    },

    async verifyPin(pin) {
        try {
            const token = await this.getPin();
            if (!token) return false;
            await this._decrypt(pin, token);
            return true;
        } catch (err) {
            return false;
        }
    },

    async removePin() {
        try {
            // Decrypt database to plain text before removing PIN lockdown
            const activeSession = await this.getActiveSession();
            if (activeSession && activeSession.pin) {
                let db = await this.getDatabase();
                await this.set('treasury_db', db);
            }
            await this.del('my_heart_treasury_pin_v1');
        } catch (err) {
            console.error('Failed to remove PIN:', err);
        }
    },

    async exportData() {
        try {
            const db = await this.getDatabase();
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", `heart_treasury_backup_${new Date().toISOString().split('T')[0]}.json`);
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        } catch (err) {
            alert("Export failed: " + err.message);
        }
    },

    async importData(file, callback) {
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                
                // If a PIN is active, encrypt the imported backup automatically
                const activeSession = await this.getActiveSession();
                if (activeSession && activeSession.pin) {
                    const encryptedPayload = await this._encrypt(activeSession.pin, importedData);
                    await this.set('treasury_db', encryptedPayload);
                } else {
                    await this.set('treasury_db', importedData);
                }

                callback(true);
            } catch (e) {
                console.error("Import parse error:", e);
                callback(false);
            }
        };
        reader.readAsText(file);
    }
};
