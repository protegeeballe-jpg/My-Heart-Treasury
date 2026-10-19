/**
 * LocalStorage repository & Export/Import manager for My Heart Treasury.
 */
const TreasuryStorage = {
    KEY_TREASURY: 'my_heart_treasury_db_v1',
    KEY_SESSION: 'my_heart_active_session_v1',

    getDatabase() {
        const raw = localStorage.getItem(this.KEY_TREASURY);
        return raw ? JSON.parse(raw) : {};
    },

    saveDayEntry(dateStr, sessionData) {
        const db = this.getDatabase();
        if (!db[dateStr]) {
            db[dateStr] = { totalHearts: 0, entries: [] };
        }
        
        db[dateStr].totalHearts += sessionData.hearts;
        if (sessionData.attachment) {
            db[dateStr].entries.push(sessionData.attachment);
        }

        try {
            localStorage.setItem(this.KEY_TREASURY, JSON.stringify(db));
            return db[dateStr];
        } catch (err) {
            if (err.name === 'QuotaExceededError' || err.code === 22) {
                alert("⚠️ Storage Limit Reached! Videos and photos take up space. Try exporting your backup JSON file and clearing older entries to free up space.");
            } else {
                alert("⚠️ Error saving to device storage: " + err.message);
            }
            throw err;
        }
    },

    getActiveSession() {
        const raw = localStorage.getItem(this.KEY_SESSION);
        return raw ? JSON.parse(raw) : null;
    },

    setActiveSession(sessionConfig) {
        localStorage.setItem(this.KEY_SESSION, JSON.stringify(sessionConfig));
    },

    exportData() {
        const backupData = {
            treasury: this.getDatabase(),
            session: this.getActiveSession()
        };
        const jsonStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `heart_treasury_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    importData(file, onComplete) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const parsed = JSON.parse(e.target.result);
                if (parsed.treasury) {
                    localStorage.setItem(this.KEY_TREASURY, JSON.stringify(parsed.treasury));
                }
                if (parsed.session) {
                    localStorage.setItem(this.KEY_SESSION, JSON.stringify(parsed.session));
                }
                onComplete(true);
            } catch (err) {
                onComplete(false);
            }
        };
        reader.readAsText(file);
    }
};
