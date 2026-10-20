/**
 * Main Application Orchestrator for My Heart Treasury.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialize icons
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

    // App State
    let currentHeartCount = 0;
    let selectedDurationHours = 24;
    let activeTimerInterval = null;
    let currentSelectedDateKey = null;
    let cachedSession = null;

    // DOM References
    const savingsDateInput = document.getElementById('savingsDate');
    const sessionCountdown = document.getElementById('sessionCountdown');
    const heartCountBadge = document.getElementById('heartCountBadge');
    const tapHeartBtn = document.getElementById('tapHeartBtn');
    const saveTreasuryBtn = document.getElementById('saveTreasuryBtn');
    const particleCanvas = document.getElementById('particleCanvas');

    // Function to get today's date in YYYY-MM-DD using local device timezone
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

    // PIN Lock Check on App Startup
    async function checkPinLock() {
        const savedPin = await TreasuryStorage.getPin();
        const pinModal = document.getElementById('pinLockModal');
        const pinInput = document.getElementById('pinInput');
        const submitPinBtn = document.getElementById('submitPinBtn');

        if (savedPin && pinModal) {
            pinModal.classList.remove('hidden');
            document.getElementById('pinModalTitle').textContent = "Unlock Your Treasury";
            document.getElementById('pinModalDesc').textContent = "Enter your PIN code to access your vault.";
            submitPinBtn.textContent = "Unlock";

            submitPinBtn.onclick = async () => {
                if (pinInput.value === savedPin) {
                    pinModal.classList.add('hidden');
                    pinInput.value = '';
                } else {
                    alert("⚠️ Incorrect PIN. Please try again.");
                    pinInput.value = '';
                }
            };
        }
    }
    checkPinLock();

    // PIN Setup & Change Listener (Secured against unauthorized overwrites)
    document.getElementById('openPinSettingsBtn')?.addEventListener('click', async () => {
        const currentPin = await TreasuryStorage.getPin();
        
        if (currentPin) {
            // Force user to verify current PIN before making any changes
            const enteredCurrent = prompt("Enter your CURRENT PIN to proceed:");
            if (enteredCurrent === null) return; // Cancelled
            
            if (enteredCurrent !== currentPin) {
                alert("⚠️ Incorrect current PIN. Action cancelled.");
                return;
            }
        }

        const newPin = prompt("Enter a 4 to 6-digit PIN code (leave blank to remove PIN protection):");
        if (newPin === null) return; // Cancelled

        if (newPin.trim() === "") {
            await TreasuryStorage.removePin();
            alert("🔒 PIN protection removed successfully.");
        } else if (newPin.length >= 4 && newPin.length <= 6 && !isNaN(newPin)) {
            await TreasuryStorage.setPin(newPin);
            alert("✨ PIN set successfully!");
        } else {
            alert("⚠️ Invalid PIN. Please enter a 4 to 6-digit numerical code.");
        }
    });

    // Optimized Countdown Timer
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

    initSession();
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
        if (heartCountBadge) heartCountBadge.textContent = `${currentHeartCount} Hearts`;
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

    // Save Treasury Entry
    saveTreasuryBtn?.addEventListener('click', async () => {
        if (currentHeartCount === 0) {
            alert("Tap the heart to collect acts of kindness, love & forgiveness first!");
            return;
        }

        const dateKey = savingsDateInput ? savingsDateInput.value : getTodayLocalDate();
        const sessionPayload = {
            hearts: currentHeartCount,
            attachment: MediaController.pendingAttachment
        };

        await TreasuryStorage.saveDayEntry(dateKey, sessionPayload);

        alert(`Successfully deposited ${currentHeartCount} hearts to ${dateKey}!`);
        
        currentHeartCount = 0;
        if (heartCountBadge) heartCountBadge.textContent = "0 Hearts";
        MediaController.pendingAttachment = null;
        const indicator = document.getElementById('attachmentIndicator');
        if (indicator) indicator.textContent = "Attach";
    });

    // Attachment Modal Handlers
    const attachmentModal = document.getElementById('attachmentModal');
    
    document.getElementById('openAttachmentModalBtn')?.addEventListener('click', () => {
        attachmentModal?.classList.remove('hidden');
    });

    document.getElementById('closeAttachmentModalBtn')?.addEventListener('click', () => {
        attachmentModal?.classList.add('hidden');
    });

    document.getElementById('photoInput')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            MediaController.readImageFile(file, (media) => {
                setMediaPreview(media);
            });
        }
    });

    document.getElementById('startRecorderBtn')?.addEventListener('click', () => {
        const cameraBox = document.getElementById('cameraViewportContainer');
        const videoElem = document.getElementById('cameraPreview');
        const progressElem = document.getElementById('recordProgress');
        
        cameraBox?.classList.remove('hidden');
        
        MediaController.startThreeSecondRecording(videoElem, progressElem, (media) => {
            cameraBox?.classList.add('hidden');
            setMediaPreview(media);
        });
    });

    function setMediaPreview(media) {
        const previewBox = document.getElementById('mediaPreviewBox');
        const previewContent = document.getElementById('previewContent');
        if (!previewBox || !previewContent) return;

        previewBox.classList.remove('hidden');
        previewContent.innerHTML = ''; // Clear previous content

        if (media.type === 'photo') {
            const img = document.createElement('img');
            img.src = media.dataUrl;
            img.className = 'w-full h-32 object-cover rounded-md';
            previewContent.appendChild(img);
        } else {
            const video = document.createElement('video');
            video.src = media.dataUrl;
            video.controls = true;
            video.className = 'w-full h-32 object-cover rounded-md';
            previewContent.appendChild(video);
        }

        MediaController.activeMedia = media;
    }

    document.getElementById('clearMediaBtn')?.addEventListener('click', () => {
        MediaController.activeMedia = null;
        document.getElementById('mediaPreviewBox')?.classList.add('hidden');
    });

    document.getElementById('confirmAttachmentBtn')?.addEventListener('click', () => {
        const noteInput = document.getElementById('heartNoteInput');
        const noteText = noteInput ? noteInput.value.trim() : '';
        
        MediaController.pendingAttachment = {
            note: noteText || null,
            media: MediaController.activeMedia || null,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        if (noteText || MediaController.activeMedia) {
            const indicator = document.getElementById('attachmentIndicator');
            if (indicator) indicator.textContent = "Memory Attached ✨";
        }

        attachmentModal?.classList.add('hidden');
    });

    // Calendar & Timeline
    const calendarModal = document.getElementById('calendarModal');
    const calendarGrid = document.getElementById('calendarGrid');

    document.getElementById('openCalendarBtn')?.addEventListener('click', async () => {
        await renderCalendar();
        calendarModal?.classList.remove('hidden');
    });

    document.getElementById('closeCalendarModalBtn')?.addEventListener('click', () => {
        calendarModal?.classList.add('hidden');
    });

    async function renderCalendar() {
        if (!calendarGrid) return;
        calendarGrid.innerHTML = '';
        const db = await TreasuryStorage.getDatabase();
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        const monthLabel = document.getElementById('calendarMonthLabel');
        if (monthLabel) {
            monthLabel.textContent = now.toLocaleString('default', { month: 'long', year: 'numeric' });
        }

        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayCell = document.createElement('div');
            dayCell.className = `calendar-day-cell ${db[dateStr] ? 'has-data' : ''}`;
            
            dayCell.innerHTML = `
                <span class="font-bold">${day}</span>
                ${db[dateStr] ? `<span class="text-[10px]">❤️ ${db[dateStr].totalHearts}</span>` : ''}
            `;

            dayCell.addEventListener('click', async () => {
                currentSelectedDateKey = dateStr;
                const titleElem = document.getElementById('selectedDateTitle');
                if (titleElem) titleElem.textContent = dateStr;
                
                const freshDb = await TreasuryStorage.getDatabase();
                const heartsCountElem = document.getElementById('selectedDateHeartsCount');
                const viewMemoriesBtn = document.getElementById('viewMemoriesBtn');

                if (freshDb[dateStr]) {
                    if (heartsCountElem) heartsCountElem.textContent = `Total hearts: ${freshDb[dateStr].totalHearts}`;
                    if (viewMemoriesBtn) viewMemoriesBtn.classList.remove('hidden');
                } else {
                    if (heartsCountElem) heartsCountElem.textContent = 'No hearts saved on this day';
                    if (viewMemoriesBtn) viewMemoriesBtn.classList.add('hidden');
                }
            });

            calendarGrid.appendChild(dayCell);
        }
    }

    const timelineModal = document.getElementById('timelineModal');
    
    // Secure Timeline Renderer (Safe from XSS Injection)
    document.getElementById('viewMemoriesBtn')?.addEventListener('click', async () => {
        const db = await TreasuryStorage.getDatabase();
        const dayData = db[currentSelectedDateKey];
        const timelineList = document.getElementById('timelineList');
        
        if (!timelineList) return;
        timelineList.innerHTML = '';
        
        const modalTitle = document.getElementById('timelineModalTitle');
        if (modalTitle) modalTitle.textContent = `Memories for ${currentSelectedDateKey}`;

        if (dayData && dayData.entries && dayData.entries.length > 0) {
            dayData.entries.forEach(entry => {
                const item = document.createElement('div');
                item.className = 'p-3 bg-slate-800/80 rounded-lg border border-slate-700 space-y-2';
                
                // Timestamp
                const timeDiv = document.createElement('div');
                timeDiv.className = 'text-xs text-rose-300 font-semibold';
                timeDiv.textContent = entry.timestamp;
                item.appendChild(timeDiv);

                // Note (Safe textContent assignment to prevent XSS)
                if (entry.note) {
                    const notePara = document.createElement('p');
                    notePara.className = 'text-sm text-slate-200';
                    notePara.textContent = entry.note;
                    item.appendChild(notePara);
                }

                // Media Attachment
                if (entry.media) {
                    if (entry.media.type === 'photo') {
                        const img = document.createElement('img');
                        img.src = entry.media.dataUrl;
                        img.className = 'w-full h-40 object-cover rounded';
                        item.appendChild(img);
                    } else {
                        const video = document.createElement('video');
                        video.src = entry.media.dataUrl;
                        video.controls = true;
                        video.className = 'w-full h-40 object-cover rounded';
                        item.appendChild(video);
                    }
                }

                timelineList.appendChild(item);
            });
        } else {
            const emptyPara = document.createElement('p');
            emptyPara.className = 'text-slate-400 text-center py-4';
            emptyPara.textContent = 'No notes or media attachments saved for this date.';
            timelineList.appendChild(emptyPara);
        }

        timelineModal?.classList.remove('hidden');
    });

    document.getElementById('closeTimelineModalBtn')?.addEventListener('click', () => {
        timelineModal?.classList.add('hidden');
    });

    // Audio Toggle Listener
    document.getElementById('soundToggleBtn')?.addEventListener('click', () => {
        const isMuted = AudioController.toggleMute();
        const icon = document.getElementById('soundIcon');
        if (icon) {
            if (isMuted) {
                icon.setAttribute('data-lucide', 'volume-x');
                icon.classList.replace('text-rose-400', 'text-slate-500');
            } else {
                icon.setAttribute('data-lucide', 'volume-2');
                icon.classList.replace('text-slate-500', 'text-rose-400');
            }
            lucide.createIcons();
        }
    });

    // Export & Import Backup Listeners
    document.getElementById('exportBtn')?.addEventListener('click', () => {
        TreasuryStorage.exportData();
    });

    // Trigger file dialog on button click
    document.getElementById('importBtn')?.addEventListener('click', () => {
        document.getElementById('importFileInput')?.click();
    });

    document.getElementById('importFileInput')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            TreasuryStorage.importData(file, (success) => {
                if (success) {
                    alert('Treasury backup successfully imported! Reloading page...');
                    location.reload();
                } else {
                    alert('Import failed. Please make sure you selected a valid Heart Treasury JSON file.');
                }
            });
        }
    });
});
