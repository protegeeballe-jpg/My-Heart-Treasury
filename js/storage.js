/**
 * Native IndexedDB Storage Engine with Web Crypto API (AES-GCM / PBKDF2)
 * Zero external dependencies, fully backward compatible, 100% free.
 */
const TreasuryStorage = {
    dbName: 'HeartTreasuryDB',
    storeName: 'vault',
    dbInstance: null,
    initPromise: null,
    saveQueue: Promise.resolve(),

    async init() {
        if (this.dbInstance) return this.dbInstance;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onerror = () => {
                this.initPromise = null;
                reject(request.error);
            };
            request.onsuccess = () => {
                this.dbInstance = request.result;
                resolve(this.dbInstance);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
        });

        return this.initPromise;
    },

    async openDB() {
        return await this.init();
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

            transaction.oncomplete = () => resolve(request.result);
            transaction.onerror = () => reject(transaction.error || request.error || new Error('Storage write failed.'));
            transaction.onabort = () => reject(transaction.error || new Error('Storage write was interrupted.'));
        });
    },

    async del(key) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.storeName, 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(key);

            transaction.oncomplete = () => resolve(request.result);
            transaction.onerror = () => reject(transaction.error || request.error || new Error('Storage deletion failed.'));
            transaction.onabort = () => reject(transaction.error || new Error('Storage deletion was interrupted.'));
        });
    },

    async setMany(values = {}, deleteKeys = []) {
        const db = await this.openDB();

        return new Promise((resolve, reject) => {
            let transaction;

            try {
                transaction = db.transaction(this.storeName, 'readwrite');
                const store = transaction.objectStore(this.storeName);
                Object.entries(values).forEach(([key, value]) => store.put(value, key));
                deleteKeys.forEach((key) => store.delete(key));
            } catch (error) {
                if (transaction) transaction.abort();
                reject(error);
                return;
            }

            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(transaction.error || new Error('Atomic storage update failed.'));
            transaction.onabort = () => reject(transaction.error || new Error('Atomic storage update was interrupted.'));
        });
    },

    async _withVaultWriteLock(task) {
        if (typeof task !== 'function') {
            throw new TypeError('A vault write task is required.');
        }

        // Web Locks coordinates writes across same-origin tabs and installed PWAs.
        if (typeof navigator !== 'undefined' &&
            navigator.locks &&
            typeof navigator.locks.request === 'function') {
            return navigator.locks.request(
                'my-heart-treasury-vault-write',
                { mode: 'exclusive' },
                task
            );
        }

        // Fallback for browsers without Web Locks: serialize writes in this page.
        const queuedWrite = this.saveQueue.then(task, task);
        this.saveQueue = queuedWrite.catch(() => undefined);
        return queuedWrite;
    },

    _isValidDateKey(dateKey) {
        if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return false;
        const parsed = new Date(dateKey + 'T00:00:00.000Z');
        return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === dateKey;
    },

    _validateDatabase(database) {
        if (!database || typeof database !== 'object' || Array.isArray(database)) {
            throw new TypeError('Backup data must be a date-keyed Treasury object.');
        }

        for (const [dateKey, record] of Object.entries(database)) {
            if (!this._isValidDateKey(dateKey)) {
                throw new TypeError('Invalid Treasury date key: ' + dateKey);
            }

            if (!record || typeof record !== 'object' || Array.isArray(record)) {
                throw new TypeError('Treasury entry for ' + dateKey + ' is invalid.');
            }

            const totalHearts = record.totalHearts ?? record.hearts;
            if (totalHearts !== undefined &&
                (!Number.isSafeInteger(Number(totalHearts)) || Number(totalHearts) < 0)) {
                throw new TypeError('Heart total for ' + dateKey + ' must be a non-negative whole number.');
            }

            if (record.entries !== undefined && !Array.isArray(record.entries)) {
                throw new TypeError('Memory entries for ' + dateKey + ' must be an array.');
            }

            if (Array.isArray(record.entries)) {
                record.entries.forEach((entry, index) => {
                    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
                        throw new TypeError('Memory entry ' + (index + 1) + ' for ' + dateKey + ' is invalid.');
                    }

                    if (entry.hearts !== undefined &&
                        (!Number.isSafeInteger(Number(entry.hearts)) || Number(entry.hearts) < 0)) {
                        throw new TypeError('Heart count in memory entry ' + (index + 1) + ' for ' + dateKey + ' is invalid.');
                    }

                    if (entry.note !== undefined && entry.note !== null && typeof entry.note !== 'string') {
                        throw new TypeError('Memory note ' + (index + 1) + ' for ' + dateKey + ' must be text.');
                    }

                    if (entry.media !== undefined && entry.media !== null) {
                        if (typeof entry.media !== 'object' || Array.isArray(entry.media)) {
                            throw new TypeError('Memory media ' + (index + 1) + ' for ' + dateKey + ' is invalid.');
                        }

                        if (entry.media.type !== undefined &&
                            !['photo', 'video'].includes(entry.media.type)) {
                            throw new TypeError('Memory media type for ' + dateKey + ' is unsupported.');
                        }

                        if (entry.media.dataUrl !== undefined) {
                            const expectedPrefix = entry.media.type === 'video' ? 'data:video/' : 'data:image/';
                            if (typeof entry.media.dataUrl !== 'string' ||
                                !entry.media.dataUrl.startsWith(expectedPrefix)) {
                                throw new TypeError('Memory media data for ' + dateKey + ' is invalid.');
                            }
                        }
                    }
                });
            }

            if (record.attachment !== undefined && record.attachment !== null &&
                (typeof record.attachment !== 'object' || Array.isArray(record.attachment))) {
                throw new TypeError('Attachment metadata for ' + dateKey + ' is invalid.');
            }
        }

        return database;
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

    async getActiveSession() {
        try {
            await this.init();
            return await this.get('active_session') || null;
        } catch (err) {
            return null;
        }
    },

    async setActiveSession(session) {
        try {
            await this.init();
            await this.set('active_session', session);
        } catch (err) {
            console.error('Failed to save active session:', err);
        }
    },

    async getDatabase(overridePin = null) {
        try {
            await this.init();
            const rawData = await this.get('treasury_db');
            if (!rawData) return {};

            if (!rawData.encrypted) {
                return this._validateDatabase(rawData);
            }

            if (!overridePin) {
                throw new Error("Vault is locked. Valid PIN required to read database.");
            }

            const decrypted = await this._decrypt(overridePin, rawData);
            return this._validateDatabase(decrypted);
        } catch (err) {
            console.error('Failed to get or decrypt database:', err);
            throw err;
        }
    },

    async getAllEntries(sessionPin) {
        return await this.getDatabase(sessionPin);
    },

    async createBackupPackage(sessionPin) {
        return this._withVaultWriteLock(async () => {
            const database = await this.getDatabase(sessionPin);
            const pinToken = await this.getPin();

            if (pinToken) {
                if (!sessionPin || !(await this.verifyPin(sessionPin))) {
                    throw new Error('A valid Treasury PIN is required to encrypt this backup.');
                }

                return {
                    backupFormat: 'my-heart-treasury',
                    backupVersion: 1,
                    encrypted: true,
                    payload: await this._encrypt(sessionPin, database)
                };
            }

            return {
                backupFormat: 'my-heart-treasury',
                backupVersion: 1,
                encrypted: false,
                data: database
            };
        });
    },

    async saveDayEntry(dateKey, payload, sessionPin) {
        const persistEntry = async () => {
            try {
                if (!this._isValidDateKey(dateKey)) {
                    throw new TypeError('Choose a valid calendar date before saving.');
                }
    
                if (!payload || !Number.isSafeInteger(payload.hearts) || payload.hearts < 1) {
                    throw new TypeError('At least one whole heart is required to save a Treasury entry.');
                }
    
                await this.init();
                const db = await this.getDatabase(sessionPin);
                const existingEntry = db[dateKey] || {};
                if (typeof existingEntry !== 'object' || Array.isArray(existingEntry)) {
                    throw new TypeError('Existing Treasury entry for ' + dateKey + ' is invalid.');
                }
    
                const currentTotal = Number(existingEntry.totalHearts ?? existingEntry.hearts ?? 0);
                if (!Number.isSafeInteger(currentTotal) || currentTotal < 0 ||
                    !Number.isSafeInteger(currentTotal + payload.hearts)) {
                    throw new TypeError('Heart total for ' + dateKey + ' is invalid or too large.');
                }
    
                if (existingEntry.entries !== undefined && !Array.isArray(existingEntry.entries)) {
                    throw new TypeError('Memory entries for ' + dateKey + ' are invalid.');
                }
    
                const entry = existingEntry;
                entry.totalHearts = currentTotal + payload.hearts;
                if (!Array.isArray(entry.entries)) entry.entries = [];
    
                const attachment = payload.attachment || {};
                let media = null;
    
                if (attachment.type === 'photo' || attachment.type === 'video') {
                    if (typeof attachment.dataUrl !== 'string' || !attachment.dataUrl.startsWith('data:')) {
                        throw new TypeError('The attached media data is invalid. Please attach the file again.');
                    }
                    media = { type: attachment.type, dataUrl: attachment.dataUrl };
                }
    
                const note = attachment.type === 'note'
                    ? (attachment.text || null)
                    : (attachment.note || null);
    
                if (note !== null && typeof note !== 'string') {
                    throw new TypeError('The attached memory note must be text.');
                }
    
                entry.entries.push({
                    timestamp: attachment.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    hearts: payload.hearts,
                    note,
                    media
                });
    
                if (payload.attachment) {
                    // Media bytes are stored once in the timeline entry. The root
                    // attachment keeps only lightweight metadata (e.g. location).
                    const attachmentMetadata = { ...payload.attachment };
                    delete attachmentMetadata.dataUrl;
                    entry.attachment = attachmentMetadata;
                }
                db[dateKey] = entry;
                this._validateDatabase(db);
    
                const pinCheck = await this.getPin();
                if (pinCheck) {
                    if (!sessionPin || !(await this.verifyPin(sessionPin))) {
                        throw new Error('A valid Treasury PIN is required to save the encrypted vault.');
                    }
                    await this.set('treasury_db', await this._encrypt(sessionPin, db));
                } else {
                    await this.set('treasury_db', db);
                }
    
                return true;
            } catch (error) {
                console.error('Failed to save Treasury entry:', error);
                throw error;
            }
        };

        return this._withVaultWriteLock(persistEntry);
    },
    async getPin() {
        try {
            await this.init();
            return await this.get('my_heart_treasury_pin_v1') || null;
        } catch (err) {
            return null;
        }
    },

    async setPin(pin, oldPin = null) {
        return this._withVaultWriteLock(async () => {    
            try {
                await this.init();
    
                if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) {
                    throw new TypeError('PIN must contain 4 to 6 digits.');
                }
    
                const existingPinToken = await this.getPin();
                if (existingPinToken) {
                    if (!oldPin) {
                        throw new Error('Current PIN is required to change or update your PIN.');
                    }
                    if (!(await this.verifyPin(oldPin))) {
                        throw new Error('Incorrect current PIN provided.');
                    }
                }
    
                // Prepare encryption before writing anything. The PIN marker and
                // database are committed together so they cannot become mismatched.
                const database = await this.getDatabase(existingPinToken ? oldPin : null);
                const validationCanary = await this._encrypt(pin, { status: 'VALID_PIN' });
                const values = { my_heart_treasury_pin_v1: validationCanary };
    
                if (database && Object.keys(database).length > 0) {
                    values.treasury_db = await this._encrypt(pin, database);
                }
    
                await this.setMany(values);
                return true;
            } catch (error) {
                console.error('Failed to save PIN:', error);
                throw error;
            }
        });
    },
    async verifyPin(pin) {
        try {
            await this.init();
            const token = await this.getPin();
            if (!token) return false;
            await this._decrypt(pin, token);
            return true;
        } catch (err) {
            return false;
        }
    },

    async removePin(currentPin) {
        return this._withVaultWriteLock(async () => {    
            try {
                await this.init();
                if (!(await this.verifyPin(currentPin))) {
                    throw new Error('Incorrect PIN. Cannot remove security protection.');
                }
    
                const database = await this.getDatabase(currentPin);
                // Keep the plain database and remove the PIN marker atomically.
                await this.setMany({ treasury_db: database }, ['my_heart_treasury_pin_v1']);
                return true;
            } catch (error) {
                console.error('Failed to remove PIN:', error);
                throw error;
            }
        });
    },
    async restoreDatabase(importedData, sessionPin, backupPin = sessionPin) {
        return this._withVaultWriteLock(async () => {
            await this.init();

            let databaseToRestore = importedData;

            if (importedData && importedData.backupFormat === 'my-heart-treasury') {
                if (importedData.backupVersion !== 1) {
                    throw new TypeError('This Treasury backup version is not supported.');
                }

                if (importedData.encrypted === true) {
                    if (typeof backupPin !== 'string' || !/^\d{4,6}$/.test(backupPin)) {
                        throw new Error('Enter the 4 to 6-digit PIN used when this backup was created.');
                    }
                    databaseToRestore = await this._decrypt(backupPin, importedData.payload);
                } else if (importedData.encrypted === false) {
                    databaseToRestore = importedData.data;
                } else {
                    throw new TypeError('The Treasury backup encryption setting is invalid.');
                }
            }

            const validatedData = this._validateDatabase(databaseToRestore);
            const pinCheck = await this.getPin();

            if (pinCheck) {
                if (!sessionPin || !(await this.verifyPin(sessionPin))) {
                    throw new Error('A valid current Treasury PIN is required to restore the vault.');
                }
                await this.set('treasury_db', await this._encrypt(sessionPin, validatedData));
            } else {
                await this.set('treasury_db', validatedData);
            }

            return true;
        });
    },
    async exportData(sessionPin) {
        try {
            const backupPackage = await this.createBackupPackage(sessionPin);
            const backupBlob = new Blob([JSON.stringify(backupPackage, null, 2)], { type: 'application/json' });
            const downloadUrl = URL.createObjectURL(backupBlob);
            const downloadAnchor = document.createElement('a');
            downloadAnchor.href = downloadUrl;
            downloadAnchor.download = `heart_treasury_backup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
            setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);
        } catch (err) {
            alert("Export failed: " + err.message);
        }
    },

    async importData(file, sessionPin, callback, requestBackupPin = null) {
        let callbackFinished = false;
        const finish = (success, error = null) => {
            if (callbackFinished) return;
            callbackFinished = true;
            if (error) console.error('Import failed:', error);
            if (typeof callback === 'function') callback(success);
        };

        if (!file || (typeof file.text !== 'function' && typeof FileReader === 'undefined')) {
            finish(false, new TypeError('Select a valid JSON backup file.'));
            return;
        }

        try {
            let fileText;

            if (typeof file.text === 'function') {
                fileText = await file.text();
            } else {
                fileText = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = () => reject(reader.error || new Error('Could not read the backup file.'));
                    reader.onabort = () => reject(new Error('Backup file reading was cancelled.'));
                    reader.readAsText(file);
                });
            }

            if (typeof fileText !== 'string' || !fileText.trim()) {
                throw new TypeError('The selected backup file is empty.');
            }

            const importedData = JSON.parse(fileText);
            let backupPin = sessionPin;

            if (importedData &&
                importedData.backupFormat === 'my-heart-treasury' &&
                importedData.encrypted === true) {
                if (typeof requestBackupPin === 'function') {
                    backupPin = await requestBackupPin();
                }

                if (typeof backupPin !== 'string' || !/^\d{4,6}$/.test(backupPin)) {
                    throw new Error('Backup import was cancelled or the backup PIN is invalid.');
                }
            }

            await this.restoreDatabase(importedData, sessionPin, backupPin);
            finish(true);
        } catch (error) {
            finish(false, error);
        }
    }
};
