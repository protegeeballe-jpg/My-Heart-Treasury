/**
 * Native IndexedDB Storage Engine for My Heart Treasury (No external dependencies)
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
            return await this.get('treasury_db') || {};
        } catch (err) {
            console.error('Failed to get database:', err);
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
            await this.set('treasury_db', db);
        } catch (err) {
            alert(`Error saving to device storage: ${err.message}`);
        }
    },

    async getPin() {
        try {
            return await this.get('my_heart_treasury_pin_v1') || null;
        } catch (err) {
            return null;
        }
    },

    async setPin(pin) {
        try {
            await this.set('my_heart_treasury_pin_v1', pin);
        } catch (err) {
            console.error('Failed to save PIN:', err);
        }
    },

    async removePin() {
        try {
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
                await this.set('treasury_db', importedData);
                callback(true);
            } catch (e) {
                console.error("Import parse error:", e);
                callback(false);
            }
        };
        reader.readAsText(file);
    }
};
