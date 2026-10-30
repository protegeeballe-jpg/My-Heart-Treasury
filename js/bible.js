/**
 * Bible Study Controller for My Heart Treasury
 * Optimized with Lazy-Loading to preserve zero-impact performance on core app state.
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

    cache: {},
    currentVersion: 'english_web',

    async getVersionData(versionId) {
        if (this.cache[versionId]) {
            return this.cache[versionId];
        }

        const versionObj = this.versions.find(v => v.id === versionId) || this.versions[0];
        try {
            const response = await fetch(`./bible/${versionObj.file}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            this.cache[versionId] = data;
            return data;
        } catch (err) {
            console.error(`Failed to load version ${versionId}:`, err);
            return null;
        }
    },

    getVerseOfTheDay() {
        return {
            reference: "Proverbs 3:5-6",
            text: "Trust in the LORD with all your heart, and do not lean on your own understanding."
        };
    },

    generateVerseImage(verseText, reference, versionLabel) {
        const canvas = document.createElement('canvas');
        canvas.width = 1080;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createLinearGradient(0, 0, 1080, 1080);
        gradient.addColorStop(0, '#0f172a');
        gradient.addColorStop(1, '#1e293b');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 1080, 1080);

        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 8;
        ctx.strokeRect(60, 60, 960, 960);

        ctx.fillStyle = '#f43f5e';
        ctx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
        ctx.fillText("MY HEART TREASURY • BIBLE STUDY", 100, 140);

        ctx.fillStyle = '#f8fafc';
        ctx.font = '42px "Plus Jakarta Sans", sans-serif';
        this._wrapText(ctx, `"${verseText}"`, 100, 280, 880, 60);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
        ctx.fillText(`${reference} (${versionLabel})`, 100, 920);

        const link = document.createElement('a');
        link.download = `bible_verse_${reference.replace(/\s+/g, '_')}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    },

    _wrapText(context, text, x, y, maxWidth, lineHeight) {
        const words = text.split(' ');
        let line = '';
        for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            const metrics = context.measureText(testLine);
            const testWidth = metrics.width;
            if (testWidth > maxWidth && n > 0) { // <-- Bug fixed here (removed accidental backticks)
                context.fillText(line, x, y);
                line = words[n] + ' ';
                y += lineHeight;
            } else {
                line = testLine;
            }
        }
        context.fillText(line, x, y);
    }
};
