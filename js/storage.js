/**
 * IndexedDB repository & Export/Import manager for My Heart Treasury.
 */
const TreasuryStorage = {
    KEY_TREASURY: 'my_heart_treasury_db_v1',
    KEY_SESSION: 'my_heart_active_session_v1',

    async getDatabase() {
        try {
            const db = await idbKeyval.get(this.KEY_TREASURY);
            return db || {};
        } catch (err) {
            console.error('Failed to load database from IndexedDB:', err);
            return {};
        }
    },

    async saveDayEntry(dateStr, sessionData) {
        const db = await this.getDatabase();
        if (!db[dateStr]) {
            db[dateStr] = { totalHearts: 0, entries: [] };
        }
        
        db[dateStr].totalHearts += sessionData.hearts;
        if (sessionData.attachment) {
            db[dateStr].entries.push(sessionData.attachment);
        }

        try {
            await idbKeyval.set(this.KEY_TREASURY, db);
            return db[dateStr];
        } catch (err) {
            alert("⚠️ Error saving to device storage: " + err.message);
            throw err;
        }
    },

    async getActiveSession() {
        try {
            return await idbKeyval.get(this.KEY_SESSION) || null;
        } catch (err) {
            console.error('Failed to load active session:', err);
            return null;
        }
    },

    async setActiveSession(sessionConfig) {
        try {
            await idbKeyval.set(this.KEY_SESSION, sessionConfig);
        } catch (err) {
            console.error('Failed to set active session:', err);
        }
    },

    async exportData() {
        try {
            const backupData = {
                treasury: await this.getDatabase(),
                session: await this.getActiveSession()
            };
            const jsonStr = JSON.stringify(backupData, null, 2);
            const blob = new Blob([jsonStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `heart_treasury_backup_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Export failed:', err);
            alert("⚠️ Export failed: " + err.message);
        }
    },

    importData(file, onComplete) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (parsed.treasury) {
                    await idbKeyval.set(this.KEY_TREASURY, parsed.treasury);
                }
                if (parsed.session) {
                    await idbKeyval.set(this.KEY_SESSION, parsed.session);
                }
                onComplete(true);
            } catch (err) {
                onComplete(false);
            }
        };
        reader.readAsText(file);
    }
};
