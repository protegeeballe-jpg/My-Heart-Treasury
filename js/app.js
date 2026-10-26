/**
 * Main Application Orchestrator for My Heart Treasury.
 */

/**
 * Offline-Ready Geolocation Controller
 */
const LocationController = {
    // Captures device latitude & longitude via hardware GPS (Works 100% offline)
    async getCurrentLocation() {
        if (!('geolocation' in navigator)) {
            console.warn('Geolocation is not supported by this browser.');
            return null;
        }

        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude, accuracy } = position.coords;
                    resolve({
                        latitude,
                        longitude,
                        accuracy,
                        mapsUrl: `https://www.google.com/maps?q=${latitude},${longitude}`,
                        timestamp: Date.now()
                    });
                },
                (error) => {
                    console.warn(`Geolocation error (${error.code}): ${error.message}`);
                    resolve(null); // Graceful fallback if GPS is denied or unavailable
                },
                {
                    enableHighAccuracy: true, // Forces hardware GPS where available
                    timeout: 5000,           // 5-second max wait to prevent hangs
                    maximumAge: 0            // Forces fresh coordinates
                }
            );
        });
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    await TreasuryStorage.init();
    lucide.createIcons();

    // Register Service Worker for Offline PWA Support
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('Service Worker registered successfully with scope: ', registration.scope);
                })
                .catch(error => {
                    console.log('Service Worker registration failed: ', error);
                });
        });
    }

    // App State & In-Memory Session PIN (Never saved to persistent storage)
    let currentHeartCount = 0;
    let selectedDurationHours = 24;
    let activeTimerInterval = null;
    let currentSelectedDateKey = null;
    let cachedSession = null;
    let sessionPin = null;

    // DOM References
    const savingsDateInput = document.getElementById('savingsDate');
    const sessionCountdown = document.getElementById('sessionCountdown');
    const heartCountBadge = document.getElementById('heartCountBadge');
    const tapHeartBtn = document.getElementById('tapHeartBtn');
    const saveTreasuryBtn = document.getElementById('saveTreasuryBtn');
    const particleCanvas = document.getElementById('particleCanvas');

    function getTodayLocalDate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    if (savingsDateInput) {
        savingsDateInput.value = getTodayLocalDate();
    }

    function showAppModal({ title, message, icon = '✨', isPrompt = false, isConfirm = false, inputPlaceholder = '••••', inputType = 'password' }) {
        return new Promise((resolve) => {
            const modal = document.getElementById('appModal');
            const titleEl = document.getElementById('appModalTitle');
            const descEl = document.getElementById('appModalDesc');
            const iconEl = document.getElementById('appModalIcon');
            const inputEl = document.getElementById('appModalInput');
            const okBtn = document.getElementById('appModalOkBtn');
            const cancelBtn = document.getElementById('appModalCancelBtn');

            if (!modal) {
                resolve(isPrompt ? null : true);
                return;
            }

            titleEl.textContent = title;
            descEl.textContent = message;
            iconEl.textContent = icon;

            if (isPrompt) {
                inputEl.classList.remove('hidden');
                inputEl.type = inputType;
                inputEl.placeholder = inputPlaceholder;
                inputEl.value = '';
                setTimeout(() => inputEl.focus(), 50);
            } else {
                inputEl.classList.add('hidden');
            }

            if (isConfirm || isPrompt) {
                cancelBtn.classList.remove('hidden');
            } else {
                cancelBtn.classList.add('hidden');
            }

            modal.classList.remove('hidden');

            const cleanup = () => {
                modal.classList.add('hidden');
                okBtn.onclick = null;
                cancelBtn.onclick = null;
                inputEl.onkeydown = null;
            };

            okBtn.onclick = () => {
                const val = inputEl.value;
                cleanup();
                resolve(isPrompt ? val : true);
            };

            cancelBtn.onclick = () => {
                cleanup();
                resolve(isPrompt ? null : false);
            };

            inputEl.onkeydown = (e) => {
                if (e.key === 'Enter') okBtn.click();
            };
        });
    }

    // Google Drive Sync Setup
    const GOOGLE_CLIENT_ID = '493219318956-1r4ma1h1pp8qqjqf8djjfqrdhp2s6us4.apps.googleusercontent.com';
    const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
    let tokenClient = null;
    let accessToken = null;

    function initGoogleAuth() {
        if (typeof google !== 'undefined' && google.accounts) {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: DRIVE_SCOPE,
                callback: async (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        accessToken = tokenResponse.access_token;
                        await performDriveBackup();
                    }
                },
            });
        }
    }
    window.addEventListener('load', initGoogleAuth);

    document.getElementById('gdriveSyncBtn')?.addEventListener('click', () => {
        if (!tokenClient) initGoogleAuth();
        if (!accessToken) {
            tokenClient?.requestAccessToken({ prompt: 'consent' });
        } else {
            performDriveBackup();
        }
    });

    async function performDriveBackup() {
        try {
            const syncStatusText = document.getElementById('attachmentIndicator');
            if (syncStatusText) syncStatusText.textContent = "Syncing to Cloud...";

            const dbDump = await TreasuryStorage.getDatabase(sessionPin);
            const fileContent = JSON.stringify(dbDump, null, 2);

            const searchRes = await fetch(
                "https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='treasury-backup.json'",
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const searchData = await searchRes.json();
            const existingFile = searchData.files && searchData.files[0];

            const metadata = {
                name: 'treasury-backup.json',
                mimeType: 'application/json',
                parents: existingFile ? [] : ['appDataFolder']
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', new Blob([fileContent], { type: 'application/json' }));

            let uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
            let method = 'POST';

            if (existingFile) {
                uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart`;
                method = 'PATCH';
            }

            const uploadRes = await fetch(uploadUrl, {
                method: method,
                headers: { Authorization: `Bearer ${accessToken}` },
                body: form
            });

            if (uploadRes.ok) {
                if (syncStatusText) syncStatusText.textContent = "Attach";
                await showAppModal({
                    title: "Sync Successful",
                    message: "✨ Your treasury backup has been securely saved to your Google Drive App Folder!",
                    icon: "☁️"
                });
            } else {
                throw new Error(`Upload failed with status ${uploadRes.status}`);
            }
        } catch (err) {
            console.error('Google Drive Sync Error:', err);
            const syncStatusText = document.getElementById('attachmentIndicator');
            if (syncStatusText) syncStatusText.textContent = "Attach";
            await showAppModal({
                title: "Sync Failed",
                message: "⚠️ Could not complete Google Drive sync. Please check your internet connection.",
                icon: "⚠️"
            });
        }
    }

    // ==========================================
    // 🔒 STRICT STARTUP PIN UNLOCK CHECK
    // ==========================================
    async function checkPinLock() {
        const savedPinToken = await TreasuryStorage.getPin();
        const pinModal = document.getElementById('pinLockModal');
        const pinInput = document.getElementById('pinInput');
        const submitPinBtn = document.getElementById('submitPinBtn');

        if (savedPinToken && pinModal) {
            pinModal.classList.remove('hidden');
            document.getElementById('pinModalTitle').textContent = "Unlock Your Treasury";
            document.getElementById('pinModalDesc').textContent = "Enter your PIN code to access your vault.";
            submitPinBtn.textContent = "Unlock";

            return new Promise((resolve) => {
                const handleUnlock = async () => {
                    const enteredPin = pinInput ? pinInput.value : '';
                    const isValid = await TreasuryStorage.verifyPin(enteredPin);

                    if (isValid) {
                        sessionPin = enteredPin; // Store ONLY in memory
                        pinModal.classList.add('hidden');
                        if (pinInput) pinInput.value = '';
                        resolve();
                    } else {
                        await showAppModal({
                            title: "Incorrect PIN",
                            message: "⚠️ Incorrect PIN. Please try again.",
                            icon: "⚠️"
                        });
                        if (pinInput) pinInput.value = '';
                    }
                };

                submitPinBtn.onclick = handleUnlock;
                if (pinInput) {
                    pinInput.onkeydown = (e) => {
                        if (e.key === 'Enter') handleUnlock();
                    };
                }
            });
        }
    }
    await checkPinLock();

    // ==========================================
    // 🛡️ STRICT PIN SETTINGS & CHANGE MANAGEMENT
    // ==========================================
    document.getElementById('openPinSettingsBtn')?.addEventListener('click', async () => {
        const currentPinToken = await TreasuryStorage.getPin();
        
        if (currentPinToken) {
            const enteredCurrent = await showAppModal({
                title: "Verify Current PIN",
                message: "Enter your CURRENT PIN to proceed with changes:",
                icon: "🔒",
                isPrompt: true,
                inputPlaceholder: "••••"
            });
            if (enteredCurrent === null) return;

            const isCurrentValid = await TreasuryStorage.verifyPin(enteredCurrent);
            if (!isCurrentValid) {
                await showAppModal({
                    title: "Incorrect PIN",
                    message: "⚠️ Incorrect current PIN. Action cancelled.",
                    icon: "⚠️"
                });
                return;
            }

            const actionChoice = await showAppModal({
                title: "PIN Management",
                message: "Click OK to Change your PIN.\nClick Cancel to Remove PIN protection completely.",
                icon: "🛡️",
                isConfirm: true
            });

            if (actionChoice) {
                const newPin = await showAppModal({
                    title: "Set New PIN",
                    message: "Enter a new 4 to 6-digit numerical PIN code:",
                    icon: "🔑",
                    isPrompt: true,
                    inputPlaceholder: "4-6 digits"
                });
                if (newPin === null) return;

                if (/^\d{4,6}$/.test(newPin)) {
                    await TreasuryStorage.setPin(newPin, enteredCurrent);
                    sessionPin = newPin;
                    await showAppModal({
                        title: "Success",
                        message: "✨ PIN updated successfully and vault encrypted!",
                        icon: "✨"
                    });
                } else {
                    await showAppModal({
                        title: "Invalid PIN",
                        message: "⚠️ Please enter a valid 4 to 6-digit numerical code.",
                        icon: "⚠️"
                    });
                }
            } else {
                const confirmRemoval = await showAppModal({
                    title: "Remove PIN Protection",
                    message: "⚠️ Are you sure you want to completely remove PIN protection?",
                    icon: "🔓",
                    isConfirm: true
                });
                if (confirmRemoval) {
                    await TreasuryStorage.removePin(enteredCurrent);
                    sessionPin = null;
                    await showAppModal({
                        title: "Protection Removed",
                        message: "🔒 PIN protection removed successfully.",
                        icon: "🔒"
                    });
                }
            }
        } else {
            const newPin = await showAppModal({
                title: "Set New PIN",
                message: "Enter a 4 to 6-digit numerical PIN code to protect your vault:",
                icon: "🔑",
                isPrompt: true,
                inputPlaceholder: "4-6 digits"
            });
            if (newPin === null) return;

            if (/^\d{4,6}$/.test(newPin)) {
                await TreasuryStorage.setPin(newPin);
                sessionPin = newPin;
                await showAppModal({
                    title: "Success",
                    message: "✨ PIN created successfully and vault encrypted!",
                    icon: "✨"
                });
            } else {
                await showAppModal({
                    title: "Invalid PIN",
                    message: "⚠️ Please enter a valid 4 to 6-digit numerical code.",
                    icon: "⚠️"
                });
            }
        }
    });

    // Session & Countdown
    async function initSession() {
        cachedSession = await TreasuryStorage.getActiveSession();
        if (!cachedSession) {
            const targetTime = Date.now() + selectedDurationHours * 3600 * 1000;
            cachedSession = { targetTime, duration: selectedDurationHours };
            await TreasuryStorage.setActiveSession(cachedSession);
        }
        updateCountdownDisplay();
    }

    function updateCountdownDisplay() {
        if (!cachedSession || !sessionCountdown) return;

        const diff = Math.max(0, Math.floor((cachedSession.targetTime - Date.now()) / 1000));
        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;

        sessionCountdown.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    await initSession();
    clearInterval(activeTimerInterval);
    activeTimerInterval = setInterval(updateCountdownDisplay, 1000);

    // Duration Selector Buttons
    document.querySelectorAll('.btn-duration').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            document.querySelectorAll('.btn-duration').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            selectedDurationHours = parseInt(e.target.dataset.duration);
            
            const targetTime = Date.now() + selectedDurationHours * 3600 * 1000;
            cachedSession = { targetTime, duration: selectedDurationHours };
            await TreasuryStorage.setActiveSession(cachedSession);
            updateCountdownDisplay();
        });
    });

    // Heart Counter & Particles
    tapHeartBtn?.addEventListener('click', (e) => {
        currentHeartCount++;
        if (heartCountBadge) heartCountBadge.textContent = `${currentHeartCount} ${currentHeartCount === 1 ? 'Heart' : 'Hearts'}`;
        AudioController.playHeartPop();
        spawnFloatingHeart(e);
    });

    function spawnFloatingHeart(event) {
        if (!particleCanvas) return;
        const particle = document.createElement('div');
        particle.textContent = '❤️';
        particle.style.position = 'absolute';
        
        const rect = particleCanvas.getBoundingClientRect();
        particle.style.left = `${event.clientX - rect.left}px`;
        particle.style.top = `${event.clientY - rect.top}px`;
        particle.style.fontSize = `${Math.random() * 16 + 16}px`;
        particle.style.pointerEvents = 'none';
        particle.style.transition = 'all 1s ease-out';
        particle.style.opacity = '1';

        particleCanvas.appendChild(particle);

        requestAnimationFrame(() => {
            particle.style.transform = `translateY(-80px) scale(1.4)`;
            particle.style.opacity = '0';
        });

        setTimeout(() => particle.remove(), 1000);
    }

    // Save Treasury Entry (Includes Automatic Offline Location Tagging)
    saveTreasuryBtn?.addEventListener('click', async () => {
        if (currentHeartCount === 0) {
            await showAppModal({
                title: "Empty Treasury",
                message: "Tap the heart to collect acts of kindness, love & forgiveness first!",
                icon: "❤️"
            });
            return;
        }

        const dateKey = savingsDateInput ? savingsDateInput.value : getTodayLocalDate();
        
        // Automatically capture hardware GPS coordinates (works offline)
        const locationData = await LocationController.getCurrentLocation();

        const sessionPayload = {
            hearts: currentHeartCount,
            attachment: {
                ...(MediaController.pendingAttachment || {}),
                location: locationData // Automatically embedded in attachment payload
            }
        };

        await TreasuryStorage.saveDayEntry(dateKey, sessionPayload, sessionPin);

        const locationNotice = locationData ? "\n📍 Location tagged!" : "";
        await showAppModal({
            title: "Treasury Saved",
            message: `Successfully deposited ${currentHeartCount} ${currentHeartCount === 1 ? 'heart' : 'hearts'} to ${dateKey}! ✨${locationNotice}`,
            icon: "🌟"
        });
        
        currentHeartCount = 0;
        if (heartCountBadge) heartCountBadge.textContent = "0 Hearts";
        MediaController.pendingAttachment = null;
        const indicator = document.getElementById('attachmentIndicator');
        if (indicator) indicator.textContent = "Attach";
    });

    // ==========================================
    // 📎 ATTACHMENT MODAL WIRING & PREVIEW HANDLERS
    // ==========================================
    const attachmentModal = document.getElementById('attachmentModal');
    const calendarModal = document.getElementById('calendarModal');
    const timelineModal = document.getElementById('timelineModal');

    document.getElementById('openAttachmentModalBtn')?.addEventListener('click', () => {
        attachmentModal?.classList.remove('hidden');
    });

    document.getElementById('closeAttachmentModalBtn')?.addEventListener('click', () => {
        attachmentModal?.classList.add('hidden');
    });

    const photoInput = document.getElementById('photoInput');
    const heartNoteInput = document.getElementById('heartNoteInput');
    const mediaPreviewBox = document.getElementById('mediaPreviewBox');
    const previewContent = document.getElementById('previewContent');
    const clearMediaBtn = document.getElementById('clearMediaBtn');
    const confirmAttachmentBtn = document.getElementById('confirmAttachmentBtn');
    const attachmentIndicator = document.getElementById('attachmentIndicator');
    const startRecorderBtn = document.getElementById('startRecorderBtn');
    const cameraViewportContainer = document.getElementById('cameraViewportContainer');
    const cameraPreview = document.getElementById('cameraPreview');
    const recordProgress = document.getElementById('recordProgress');

    // Handle Photo Selection & Compression Preview
    photoInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        MediaController.readImageFile(file, (attachment) => {
            if (attachment && attachment.dataUrl) {
                previewContent.innerHTML = `<img src="${attachment.dataUrl}" class="w-full h-32 object-cover rounded-lg">`;
                mediaPreviewBox.classList.remove('hidden');
            }
        });
    });

  // Preserve an existing photo or video when adding a note.
heartNoteInput?.addEventListener('input', (e) => {
    const text = e.target.value.trim();
    const attachment = MediaController.pendingAttachment;

    if (
        attachment &&
        (attachment.type === 'photo' ||
         attachment.type === 'video')
    ) {
        if (text) {
            attachment.note = text;
        } else {
            delete attachment.note;
        }
    } else {
        MediaController.setNoteAttachment(text);
    }
});

    // Handle 3s Video Recording Trigger
    startRecorderBtn?.addEventListener('click', async () => {
        cameraViewportContainer?.classList.remove('hidden');
        await MediaController.startThreeSecondRecording(cameraPreview, recordProgress, (attachment) => {
            cameraViewportContainer?.classList.add('hidden');
            if (attachment && attachment.dataUrl) {
                previewContent.innerHTML = `<video src="${attachment.dataUrl}" controls class="w-full h-32 object-cover rounded-lg"></video>`;
                mediaPreviewBox.classList.remove('hidden');
            }
        });
    });

    // Clear Media Preview
    clearMediaBtn?.addEventListener('click', () => {
        MediaController.clear();
        mediaPreviewBox?.classList.add('hidden');
        if (previewContent) previewContent.innerHTML = '';
        if (photoInput) photoInput.value = '';
    });

    // Confirm Attachment Button (Saves to pending state & closes modal)
    confirmAttachmentBtn?.addEventListener('click', () => {
        const noteText = heartNoteInput?.value?.trim() || '';

        if (noteText && MediaController.pendingAttachment) {
            MediaController.pendingAttachment.note = noteText;
        } else if (noteText && !MediaController.pendingAttachment) {
            MediaController.setNoteAttachment(noteText);
        }

        if (MediaController.pendingAttachment) {
            if (attachmentIndicator) {
                attachmentIndicator.textContent = "Attached ✓";
                attachmentIndicator.classList.add('text-rose-400', 'font-bold');
            }
        } else {
            if (attachmentIndicator) {
                attachmentIndicator.textContent = "Attach";
                attachmentIndicator.classList.remove('text-rose-400', 'font-bold');
            }
        }

        attachmentModal?.classList.add('hidden');
    });

    document.getElementById('openCalendarBtn')?.addEventListener('click', async () => {
        calendarModal?.classList.remove('hidden');
        await renderCalendar();
    });

    document.getElementById('closeCalendarModalBtn')?.addEventListener('click', () => {
        calendarModal?.classList.add('hidden');
    });

    document.getElementById('closeTimelineModalBtn')?.addEventListener('click', () => {
        timelineModal?.classList.add('hidden');
    });

    async function renderCalendar() {
        const grid = document.getElementById('calendarGrid');
        const monthLabel = document.getElementById('calendarMonthLabel');
        if (!grid) return;

        grid.innerHTML = '';
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        if (monthLabel) {
            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            monthLabel.textContent = `${monthNames[month]} ${year} Treasury`;
        }

        const firstDayIndex = new Date(year, month, 1).getDay();
        const totalDays = new Date(year, month + 1, 0).getDate();
        const allEntries = await TreasuryStorage.getAllEntries(sessionPin);

        ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].forEach(d => {
            const headerCell = document.createElement('div');
            headerCell.className = 'text-center text-[10px] text-slate-500 font-bold py-1';
            headerCell.textContent = d;
            grid.appendChild(headerCell);
        });

        for (let i = 0; i < firstDayIndex; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'calendar-day-cell opacity-20 pointer-events-none';
            grid.appendChild(emptyCell);
        }

        for (let day = 1; day <= totalDays; day++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day-cell';
            const dayStr = String(day).padStart(2, '0');
            const monthStr = String(month + 1).padStart(2, '0');
            const dateKey = `${year}-${monthStr}-${dayStr}`;

            cell.innerHTML = `<span class="font-bold">${day}</span>`;

            if (allEntries[dateKey]) {
                cell.classList.add('has-data');
                const count = allEntries[dateKey].totalHearts || allEntries[dateKey].hearts || 0;
                const badge = document.createElement('span');
                badge.className = 'text-[9px] text-rose-300 font-semibold mt-0.5';
                badge.textContent = `${count}♥`;
                cell.appendChild(badge);
            }

            cell.addEventListener('click', () => {
                currentSelectedDateKey = dateKey;
                const titleEl = document.getElementById('selectedDateTitle');
                const countEl = document.getElementById('selectedDateHeartsCount');
                const viewBtn = document.getElementById('viewMemoriesBtn');

                if (titleEl) titleEl.textContent = dateKey;
                const entry = allEntries[dateKey];
                const hearts = entry ? (entry.totalHearts || entry.hearts || 0) : 0;
                if (countEl) countEl.textContent = `Total hearts: ${hearts}`;

                if (entry && (entry.attachment || hearts > 0)) {
                    viewBtn?.classList.remove('hidden');
                } else {
                    viewBtn?.classList.add('hidden');
                }
            });

            grid.appendChild(cell);
        }
        lucide.createIcons();
    }

    document.getElementById('viewMemoriesBtn')?.addEventListener('click', async () => {
        if (!currentSelectedDateKey) return;
        const allEntries = await TreasuryStorage.getAllEntries(sessionPin);
        const entry = allEntries[currentSelectedDateKey];
        if (!entry) return;

        const timelineList = document.getElementById('timelineList');
        const timelineTitle = document.getElementById('timelineModalTitle');
        if (timelineTitle) timelineTitle.textContent = `Memories for ${currentSelectedDateKey}`;
        if (timelineList) {
            timelineList.innerHTML = '';
            
            const card = document.createElement('div');
            card.className = 'bg-slate-800/80 p-4 rounded-xl border border-slate-700 space-y-2';
            
            const heartsCount = entry.totalHearts || entry.hearts || 0;
            card.innerHTML = `
                <div class="flex justify-between items-center text-xs text-rose-400 font-semibold">
                    <span>❤️ ${heartsCount} Hearts Collected</span>
                </div>
            `;

            // RENDER GOOGLE MAPS LINK IF LOCATION EXISTS AT ROOT ATTACHMENT
            const rootLocation = entry.attachment?.location;
            if (rootLocation && rootLocation.mapsUrl) {
                const locBtn = document.createElement('a');
                locBtn.href = rootLocation.mapsUrl;
                locBtn.target = '_blank';
                locBtn.rel = 'noopener noreferrer';
                locBtn.className = 'inline-flex items-center gap-1 mt-2 px-2.5 py-1 text-[11px] font-medium text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded-full hover:bg-rose-900/50 transition-colors';
                locBtn.innerHTML = `📍 View on Google Maps (${rootLocation.latitude.toFixed(4)}, ${rootLocation.longitude.toFixed(4)})`;
                card.appendChild(locBtn);
            }

            if (entry.entries && Array.isArray(entry.entries)) {
                entry.entries.forEach(sub => {
                    if (sub.note) {
                        const p = document.createElement('p');
                        p.className = 'text-xs text-slate-200 mt-1 italic';
                        p.textContent = `"${sub.note}"`;
                        card.appendChild(p);
                    }
                    if (sub.media && sub.media.dataUrl) {
                        if (sub.media.type === 'photo') {
                            const img = document.createElement('img');
                            img.src = sub.media.dataUrl;
                            img.className = 'w-full h-36 object-cover rounded-lg mt-2';
                            card.appendChild(img);
                        } else if (sub.media.type === 'video') {
                            const vid = document.createElement('video');
                            vid.src = sub.media.dataUrl;
                            vid.controls = true;
                            vid.className = 'w-full h-36 object-cover rounded-lg mt-2';
                            card.appendChild(vid);
                        }
                    }

                    // RENDER GOOGLE MAPS LINK IF LOCATION EXISTS IN SUB-ENTRY
                    const subLocation = sub.location;
                    if (subLocation && subLocation.mapsUrl) {
                        const locBtn = document.createElement('a');
                        locBtn.href = subLocation.mapsUrl;
                        locBtn.target = '_blank';
                        locBtn.rel = 'noopener noreferrer';
                        locBtn.className = 'inline-flex items-center gap-1 mt-2 px-2.5 py-1 text-[11px] font-medium text-rose-300 bg-rose-950/40 border border-rose-800/50 rounded-full hover:bg-rose-900/50 transition-colors';
                        locBtn.innerHTML = `📍 View on Google Maps (${subLocation.latitude.toFixed(4)}, ${subLocation.longitude.toFixed(4)})`;
                        card.appendChild(locBtn);
                    }
                });
            }
            timelineList.appendChild(card);
        }

        timelineModal?.classList.remove('hidden');
        lucide.createIcons();
    });

    // Export & Import Handlers
    document.getElementById('exportBtn')?.addEventListener('click', async () => {
        await TreasuryStorage.exportData(sessionPin);
    });

    document.getElementById('importFileInput')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        TreasuryStorage.importData(file, sessionPin, async (success) => {
            if (success) {
                await showAppModal({
                    title: "Import Successful",
                    message: "✨ Your treasury backup has been successfully restored!",
                    icon: "📂"
                });
                location.reload();
            } else {
                await showAppModal({
                    title: "Import Failed",
                    message: "⚠️ The backup file is invalid or corrupted.",
                    icon: "⚠️"
                });
            }
        });
    });

    // Sound Toggle Handler
    let soundEnabled = true;
    document.getElementById('soundToggleBtn')?.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        AudioController.setEnabled(soundEnabled);
        const soundBtn = document.getElementById('soundToggleBtn');
        if (soundBtn) {
            soundBtn.innerHTML = `<i data-lucide="${soundEnabled ? 'volume-2' : 'volume-x'}" id="soundIcon"></i>`;
            lucide.createIcons();
        }
    });
});
