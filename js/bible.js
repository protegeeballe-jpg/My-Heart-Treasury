/**
 * Bible Study Controller for My Heart Treasury
 *
 * Data contract:
 * - Supports the app's flat verse-array JSON: [{ book, chapter, verse, text }].
 * - Also supports the verified KJV wrapper format: { metadata, verses: [...] },
 *   where each verse record has book_name, numeric book, chapter, verse, text.
 * - Unknown structures are rejected. Scripture text is never fabricated or
 *   silently borrowed from another translation.
 *
 * Lazy loading + a two-translation cache limit help avoid retaining all 46
 * *parsed* Bible files in memory after a user browses multiple translations.
 */
const BibleController = {
    versions: [
        // English & Historical
        { id: 'bishops_bible', name: 'Bishops Bible', lang: 'English', file: 'bishops_bible.json' },
        { id: 'english_akjv', name: 'American King James', lang: 'English', file: 'english_akjv.json' },
        { id: 'english_asv', name: 'American Standard (ASV)', lang: 'English', file: 'english_asv.json' },
        { id: 'english_bbe', name: 'Bible in Basic English', lang: 'English', file: 'english_bbe.json' },
        { id: 'english_erv', name: 'English Revised', lang: 'English', file: 'english_erv.json' },
        { id: 'english_gb', name: 'Geneva Bible', lang: 'English', file: 'english_gb.json' },
        { id: 'english_hnv', name: 'Hebrew Names Version', lang: 'English', file: 'english_hnv.json' },
        { id: 'english_mil', name: 'Millennium Bible', lang: 'English', file: 'english_mil.json' },
        { id: 'english_mstc', name: 'Tyndale Bible', lang: 'English', file: 'english_mstc.json' },
        { id: 'english_septuagint', name: 'Septuagint', lang: 'English', file: 'english_septuagint.json' },
        { id: 'english_web', name: 'World English Bible (WEB)', lang: 'English', file: 'english_web.json' },
        { id: 'english_wtt', name: 'Westminster Leningrad Codex', lang: 'Hebrew/English', file: 'english_wtt.json' },
        { id: 'english_ylt', name: 'Youngs Literal Translation', lang: 'English', file: 'english_ylt.json' },
        { id: 'kjv', name: 'King James Version (KJV)', lang: 'English', file: 'kjv.json' },

        // Chinese
        { id: 'chinese_bpv', name: 'Chinese BPV', lang: 'Chinese', file: 'chinese_bpv.json' },
        { id: 'chinese_ov', name: 'Chinese OV', lang: 'Chinese', file: 'chinese_ov.json' },
        { id: 'chinese_ovs', name: 'Chinese OVS', lang: 'Chinese', file: 'chinese_ovs.json' },

        // Filipino & Regional Philippine Languages
        { id: 'fil_ceb', name: 'Cebuano Bible', lang: 'Cebuano', file: 'fil_ceb.json' },
        { id: 'fil_cebpv', name: 'Cebuano BPV', lang: 'Cebuano', file: 'fil_cebpv.json' },
        { id: 'fil_cebv', name: 'Cebuano V', lang: 'Cebuano', file: 'fil_cebv.json' },
        { id: 'filipino_1905', name: 'Filipino 1905', lang: 'Filipino', file: 'filipino_1905.json' },
        { id: 'filipino_adb', name: 'Ang Dating Biblia (ADB)', lang: 'Filipino', file: 'filipino_adb.json' },
        { id: 'filipino_bicol', name: 'Bicolano Bible', lang: 'Bicolano', file: 'filipino_bicol.json' },
        { id: 'filipino_mb', name: 'Magandang Balita Biblia', lang: 'Filipino', file: 'filipino_mb.json' },
        { id: 'hiligaynon', name: 'Hiligaynon Bible', lang: 'Hiligaynon', file: 'hiligaynon.json' },
        { id: 'ilocano', name: 'Ilocano Bible', lang: 'Ilocano', file: 'ilocano.json' },
        { id: 'pampango', name: 'Pampango Bible', lang: 'Pampango', file: 'pampango.json' },
        { id: 'pangasinense', name: 'Pangasinense Bible', lang: 'Pangasinense', file: 'pangasinense.json' },
        { id: 'waray', name: 'Waray Bible', lang: 'Waray', file: 'waray.json' },

        // European & Other Languages
        { id: 'dutch', name: 'Dutch Bible', lang: 'Dutch', file: 'dutch.json' },
        { id: 'french', name: 'French Bible', lang: 'French', file: 'french.json' },
        { id: 'french_darby', name: 'French Darby', lang: 'French', file: 'french_darby.json' },
        { id: 'french_martin', name: 'French Martin', lang: 'French', file: 'french_martin.json' },
        { id: 'german_elberfelder', name: 'German Elberfelder', lang: 'German', file: 'german_elberfelder.json' },
        { id: 'german_luther', name: 'German Luther', lang: 'German', file: 'german_luther.json' },
        { id: 'greek', name: 'Greek Bible', lang: 'Greek', file: 'greek.json' },
        { id: 'greek_eberhard', name: 'Greek Eberhard', lang: 'Greek', file: 'greek_eberhard.json' },
        { id: 'haitian_creole', name: 'Haitian Creole', lang: 'Haitian Creole', file: 'haitian_creole.json' },
        { id: 'italian_gd', name: 'Italian Diodati', lang: 'Italian', file: 'italian_gd.json' },
        { id: 'latin_dr', name: 'Latin Douay-Rheims', lang: 'Latin', file: 'latin_dr.json' },
        { id: 'latin_vulgate', name: 'Latin Vulgate', lang: 'Latin', file: 'latin_vulgate.json' },
        { id: 'norwegian', name: 'Norwegian Bible', lang: 'Norwegian', file: 'norwegian.json' },
        { id: 'portuguese', name: 'Portuguese Bible', lang: 'Portuguese', file: 'portuguese.json' },
        { id: 'spanish_ba', name: 'Spanish Reina Valera', lang: 'Spanish', file: 'spanish_ba.json' },
        { id: 'spanish_vm', name: 'Spanish Versión Moderna', lang: 'Spanish', file: 'spanish_vm.json' },
        { id: 'swedish', name: 'Swedish Bible', lang: 'Swedish', file: 'swedish.json' }
    ],

    cache: Object.create(null),
    cacheOrder: [],
    cacheLimit: 2,
    currentVersion: 'english_web',

    /**
     * Convert only the two explicitly supported source structures into the
     * flat record format required by app.js. Does not rewrite verse wording.
     */
    normalizeVersionData(data) {
        let records;

        if (Array.isArray(data)) {
            records = data;
        } else if (data && typeof data === 'object' && Array.isArray(data.verses)) {
            // Verified KJV file shape: { metadata: {...}, verses: [...] }
            records = data.verses;
        } else {
            throw new TypeError('Unsupported Bible JSON structure. Expected a verse array or an object containing a verses array.');
        }

        const normalized = records.map((record) => {
            if (!record || typeof record !== 'object' || Array.isArray(record)) return record;

            if (typeof record.book === 'string' && record.book.trim()) {
                return record;
            }

            // Verified KJV shape uses a numeric `book` index and readable `book_name`.
            if (typeof record.book_name === 'string' && record.book_name.trim()) {
                return { ...record, book: record.book_name };
            }

            return record;
        });

        const hasRecognizedRecord = normalized.some((record) =>
            record &&
            typeof record === 'object' &&
            typeof record.book === 'string' &&
            record.book.trim().length > 0 &&
            Number.isSafeInteger(Number(record.chapter)) &&
            Number(record.chapter) > 0 &&
            Number.isSafeInteger(Number(record.verse)) &&
            Number(record.verse) > 0 &&
            typeof record.text === 'string'
        );

        if (!hasRecognizedRecord) {
            throw new TypeError('Bible JSON does not contain recognizable verse records. Expected book, chapter, verse, and text fields.');
        }

        return normalized;
    },

    _touchCache(versionId) {
        this.cacheOrder = this.cacheOrder.filter((id) => id !== versionId);
        this.cacheOrder.push(versionId);
    },

    _storeCache(versionId, data) {
        this.cache[versionId] = data;
        this._touchCache(versionId);

        while (this.cacheOrder.length > this.cacheLimit) {
            const evictedId = this.cacheOrder.shift();
            if (evictedId) delete this.cache[evictedId];
        }
    },

    async getVersionData(versionId) {
        const versionObj = this.versions.find((version) => version.id === versionId);
        if (!versionObj) {
            console.error(`[BibleController] Unknown translation ID: ${String(versionId)}. No fallback translation will be loaded.`);
            return null;
        }

        if (Object.prototype.hasOwnProperty.call(this.cache, versionId)) {
            this._touchCache(versionId);
            return this.cache[versionId];
        }

        try {
            const response = await fetch(`bible/${versionObj.file}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} while loading bible/${versionObj.file}`);
            }

            const sourceData = await response.json();
            const normalizedData = this.normalizeVersionData(sourceData);
            this._storeCache(versionId, normalizedData);
            return normalizedData;
        } catch (error) {
            console.error(`[BibleController] Failed to load or validate ${versionId}:`, error);
            return null;
        }
    },

    async getChapter(versionId, book, chapter) {
        if (typeof book !== 'string' || !book.trim()) return [];
        const chapterNumber = Number(chapter);
        if (!Number.isSafeInteger(chapterNumber) || chapterNumber < 1) return [];

        const data = await this.getVersionData(versionId);
        if (!Array.isArray(data)) return [];

        const requestedBook = book.trim().toLocaleUpperCase();
        return data.filter((item) =>
            item &&
            typeof item.book === 'string' &&
            item.book.trim().toLocaleUpperCase() === requestedBook &&
            Number(item.chapter) === chapterNumber
        );
    },

    async getBooks(versionId) {
        const data = await this.getVersionData(versionId);
        if (!Array.isArray(data)) return [];

        const seen = new Set();
        const books = [];
        data.forEach((item) => {
            if (!item || typeof item.book !== 'string' || !item.book.trim()) return;
            const name = item.book.trim();
            const key = name.toLocaleUpperCase();
            if (!seen.has(key)) {
                seen.add(key);
                books.push(name);
            }
        });
        return books;
    },

    async getChapters(versionId, book) {
        if (typeof book !== 'string' || !book.trim()) return [];
        const data = await this.getVersionData(versionId);
        if (!Array.isArray(data)) return [];

        const requestedBook = book.trim().toLocaleUpperCase();
        const chapters = new Set();
        data.forEach((item) => {
            if (!item || typeof item.book !== 'string' || item.book.trim().toLocaleUpperCase() !== requestedBook) return;
            const chapter = Number(item.chapter);
            if (Number.isSafeInteger(chapter) && chapter > 0) chapters.add(chapter);
        });
        return Array.from(chapters).sort((a, b) => a - b);
    },

    /**
     * This is retained for compatibility with the existing app.js.
     * It is a fixed display quote, not dynamically retrieved from the selected
     * translation. The reference is narrowed to Proverbs 3:5 because the text
     * supplied here contains only verse 5, not verses 5-6.
     */
    getVerseOfTheDay() {
        return {
            reference: 'Proverbs 3:5',
            text: 'Trust in the LORD with all your heart, and do not lean on your own understanding.'
        };
   
    /**
     * Select a real verse from the requested translation.
     * The selection is stable for the local calendar day and changes daily.
     */
    async getVerseOfTheDay(versionId = this.currentVersion) {
        const version = this.versions.find(item => item.id === versionId);
        if (!version) return null;

        const data = await this.getVersionData(versionId);
        if (!Array.isArray(data)) return null;

        const candidates = data.filter(record =>
            record &&
            typeof record.book === 'string' &&
            record.book.trim() &&
            Number.isSafeInteger(Number(record.chapter)) &&
            Number(record.chapter) > 0 &&
            Number.isSafeInteger(Number(record.verse)) &&
            Number(record.verse) > 0 &&
            typeof record.text === 'string' &&
            record.text.trim()
        );

        if (candidates.length === 0) return null;

        // Create a stable translation-specific sequence of daily verses.
        let hash = 2166136261;
        for (let i = 0; i < versionId.length; i += 1) {
            hash = Math.imul(hash ^ versionId.charCodeAt(i), 16777619);
        }

        const seed = hash >>> 0;
        const count = candidates.length;

        const gcd = (a, b) => {
            while (b !== 0) {
                const remainder = a % b;
                a = b;
                b = remainder;
            }
            return a;
        };

        let step = (seed % count) || 1;
        while (gcd(step, count) !== 1) {
            step += 1;
            if (step >= count) step = 1;
        }

        const offset = seed % count;
        const today = new Date();
        const dayNumber = Math.floor(
            Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000
        );

        const index = (((dayNumber % count) * step) + offset) % count;
        const selected = candidates[index];

        return {
            reference: `${selected.book.trim()} ${Number(selected.chapter)}:${Number(selected.verse)}`,
            text: selected.text,
            versionId: versionId,
            versionName: version.name
        };
    },

    /**
     * Highlight colors and storage are separate from Treasury records.
     */
    highlightColors: ['yellow', 'green', 'blue', 'pink'],

    async _openHighlightDatabase() {
        if (typeof indexedDB === 'undefined') {
            throw new Error('This browser does not support IndexedDB.');
        }

        return new Promise((resolve, reject) => {
            const request = indexedDB.open('myHeartTreasuryBibleHighlights', 1);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains('highlights')) {
                    db.createObjectStore('highlights', { keyPath: 'id' });
                }
            };

            request.onsuccess = () => {
                const db = request.result;
                db.onversionchange = () => db.close();
                resolve(db);
            };

            request.onerror = () => {
                reject(request.error || new Error('Unable to open Bible highlight storage.'));
            };
        });
    },

    _makeHighlightRecord(versionId, book, chapter, verse, color) {
        const versionExists = this.versions.some(item => item.id === versionId);
        const chapterNumber = Number(chapter);
        const verseNumber = Number(verse);

        if (!versionExists) {
            throw new TypeError('Unknown Bible translation.');
        }
        if (typeof book !== 'string' || !book.trim()) {
            throw new TypeError('A valid Bible book is required.');
        }
        if (!Number.isSafeInteger(chapterNumber) || chapterNumber < 1) {
            throw new TypeError('A valid chapter number is required.');
        }
        if (!Number.isSafeInteger(verseNumber) || verseNumber < 1) {
            throw new TypeError('A valid verse number is required.');
        }

        const bookName = book.trim();
        const bookKey = bookName.toLocaleUpperCase();

        return {
            id: `${versionId}::${bookKey}::${chapterNumber}::${verseNumber}`,
            versionId: versionId,
            book: bookName,
            bookKey: bookKey,
            chapter: chapterNumber,
            verse: verseNumber,
            color: color || null,
            updatedAt: Date.now()
        };
    },

    async _writeHighlightRecord(record, remove = false) {
        const db = await this._openHighlightDatabase();

        return new Promise((resolve, reject) => {
            let transaction;

            try {
                transaction = db.transaction('highlights', 'readwrite');
                const store = transaction.objectStore('highlights');

                if (remove) {
                    store.delete(record.id);
                } else {
                    store.put(record);
                }
            } catch (error) {
                db.close();
                reject(error);
                return;
            }

            transaction.oncomplete = () => {
                db.close();
                resolve(true);
            };

            transaction.onerror = () => {
                const error = transaction.error || new Error('Highlight storage failed.');
                db.close();
                reject(error);
            };

            transaction.onabort = () => {
                const error = transaction.error || new Error('Highlight storage was interrupted.');
                db.close();
                reject(error);
            };
        });
    },

    async getChapterHighlights(versionId, book, chapter) {
        const target = this._makeHighlightRecord(
            versionId, book, chapter, 1, null
        );
        const db = await this._openHighlightDatabase();

        return new Promise((resolve, reject) => {
            let highlights = Object.create(null);
            let transaction;

            try {
                transaction = db.transaction('highlights', 'readonly');
                const request = transaction.objectStore('highlights').getAll();

                request.onsuccess = () => {
                    (request.result || []).forEach(record => {
                        if (
                            record.versionId === target.versionId &&
                            record.bookKey === target.bookKey &&
                            record.chapter === target.chapter &&
                            this.highlightColors.includes(record.color)
                        ) {
                            highlights[record.verse] = record.color;
                        }
                    });
                };
            } catch (error) {
                db.close();
                reject(error);
                return;
            }

            transaction.oncomplete = () => {
                db.close();
                resolve(highlights);
            };

            transaction.onerror = () => {
                const error = transaction.error || new Error('Unable to read Bible highlights.');
                db.close();
                reject(error);
            };

            transaction.onabort = () => {
                const error = transaction.error || new Error('Reading Bible highlights was interrupted.');
                db.close();
                reject(error);
            };
        });
    },

    async saveHighlight(versionId, book, chapter, verse, color) {
        if (!this.highlightColors.includes(color)) {
            throw new TypeError('Invalid Bible highlight color.');
        }

        const record = this._makeHighlightRecord(
            versionId, book, chapter, verse, color
        );

        return this._writeHighlightRecord(record, false);
    },

    async removeHighlight(versionId, book, chapter, verse) {
        const record = this._makeHighlightRecord(
            versionId, book, chapter, verse, null
        );

        return this._writeHighlightRecord(record, true);
    },
    generateVerseImage(verseText, reference, versionLabel) {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1080;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Canvas 2D context is unavailable.');

        const gradient = context.createLinearGradient(0, 0, 1080, 1080);
        gradient.addColorStop(0, '#0f172a');
        gradient.addColorStop(1, '#1e293b');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 1080, 1080);

        context.strokeStyle = '#f43f5e';
        context.lineWidth = 8;
        context.strokeRect(60, 60, 960, 960);

        context.fillStyle = '#f43f5e';
        context.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
        context.fillText('MY HEART TREASURY • BIBLE STUDY', 100, 140);

        context.fillStyle = '#f8fafc';
        context.font = '42px "Plus Jakarta Sans", sans-serif';
        this._wrapText(context, `"${verseText}"`, 100, 280, 880, 60);

        context.fillStyle = '#cbd5e1';
        context.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
        context.fillText(`${reference} (${String(versionLabel || 'Bible')})`, 100, 920);

        const link = document.createElement('a');
        const safeReference = reference.replace(/[^a-z0-9_-]+/gi, '_');
        link.download = `bible_verse_${safeReference}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    },

    _wrapText(context, text, x, y, maxWidth, lineHeight) {
        const words = String(text).split(/\s+/);
        let line = '';
        for (let index = 0; index < words.length; index += 1) {
            const candidate = line ? `${line} ${words[index]}` : words[index];
            if (context.measureText(candidate).width > maxWidth && line) {
                context.fillText(line, x, y);
                line = words[index];
                y += lineHeight;
            } else {
                line = candidate;
            }
        }
        if (line) context.fillText(line, x, y);
    }
};
