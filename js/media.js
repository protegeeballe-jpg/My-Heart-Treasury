/**
 * Media capture controller for notes, photos, and short video clips.
 */
const MediaController = {
    pendingAttachment: null,
    mediaRecorder: null,
    recordedChunks: [],

    async startThreeSecondRecording(videoElement, progressBarElement, onComplete) {
        this.recordedChunks = [];
        let stream = null;

        try {
            if (typeof MediaRecorder === 'undefined') {
                throw new Error('MediaRecorder is not supported in this browser.');
            }

            // Try to capture video and microphone audio.
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: true
                });
            } catch (audioError) {
                console.warn('Audio capture unavailable; trying video-only.', audioError);

                stream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: false
                });

                alert(
                    'Microphone access is unavailable. ' +
                    'This clip will be silent. Please check microphone permissions.'
                );
            }

            if (videoElement) {
                videoElement.srcObject = stream;
                try {
                    await videoElement.play();
                } catch (playErr) {
                    console.warn('Video preview autoplay failed:', playErr);
                }
            }

           // Prefer MP4 when supported, then try WebM formats.
           const mimeTypes = [
               'video/mp4',
               'video/webm;codecs=vp8,opus',
               'video/webm;codecs=vp9,opus',
               'video/webm'
           ];

            let options = {};
            if (typeof MediaRecorder.isTypeSupported === 'function') {
                const supportedMimeType = mimeTypes.find(type => {
                    try {
                        return MediaRecorder.isTypeSupported(type);
                    } catch {
                        return false;
                    }
                });

                if (supportedMimeType) {
                    options = { mimeType: supportedMimeType };
                }
            }

            // Safeguard instantiation in case options cause unsupported state
            try {
                this.mediaRecorder = new MediaRecorder(stream, options);
            } catch (err) {
                console.warn('Configured options failed, falling back to default MediaRecorder:', err);
                this.mediaRecorder = new MediaRecorder(stream);
            }

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    this.recordedChunks.push(e.data);
                }
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('MediaRecorder internal error:', event.error);
            };

            this.mediaRecorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop());

                if (this.recordedChunks.length === 0) {
                    console.error('Recording failed: No recorded chunks captured.');
                    if (onComplete) onComplete(null);
                    return;
                }

                const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder.mimeType || 'video/webm' });
                const reader = new FileReader();

                reader.onloadend = () => {
                    const attachment = { type: 'video', dataUrl: reader.result };
                    this.pendingAttachment = attachment;
                    if (onComplete) onComplete(attachment);
                };

                reader.onerror = () => {
                    console.error("Video reading failed.");
                    if (onComplete) onComplete(null);
                };

                reader.readAsDataURL(blob);
            };

            // CRITICAL FIX: Pass a 100ms timeslice to start() so chunks are continuously collected.
            // This prevents empty chunks upon stop() in strict browsers.
           this.mediaRecorder.start();

            // Use actual elapsed time for consistent recording duration.
            const recordingDurationMs = 3200;
            const startedAt = performance.now();

            const interval = setInterval(() => {
                const elapsed = performance.now() - startedAt;
                const progress = Math.min(
                    (elapsed / recordingDurationMs) * 100,
                    100
                );

                if (progressBarElement) {
                    progressBarElement.style.width = `${progress}%`;
                }

                if (elapsed >= recordingDurationMs) {
                    clearInterval(interval);

                    const recorder = this.mediaRecorder;
                    if (recorder && recorder.state !== 'inactive') {
                        recorder.stop();
                    }
                }
            }, 50);

               } catch (err) {
            console.error('Video recording setup failed:', err);

            // Release camera and microphone if setup fails.
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }

            if (videoElement) {
                videoElement.srcObject = null;
            }

            alert(
                'Unable to start recording. Please check camera ' +
                'and microphone permissions, then try again.'
            );

            if (onComplete) onComplete(null);
        }
    },
    readImageFile(file, onComplete) {
        if (!file) {
            if (onComplete) onComplete(null);
            return;
        }

        const reader = new FileReader();

        reader.onerror = () => {
            console.error("FileReader failed to read the image file.");
            if (onComplete) onComplete(null);
        };

        reader.onload = (e) => {
            const img = new Image();

            img.onerror = () => {
                console.error("Image decoding failed (corrupted or unsupported format).");
                alert('Invalid image format or corrupted file.');
                if (onComplete) onComplete(null);
            };

            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
                const attachment = { type: 'photo', dataUrl: dataUrl };
                this.pendingAttachment = attachment;
                if (onComplete) onComplete(attachment);
            };

            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    },

    setNoteAttachment(text) {
        if (text && text.trim() !== '') {
            this.pendingAttachment = { type: 'note', text: text.trim() };
        } else {
            this.pendingAttachment = null;
        }
    },

    clear() {
        this.pendingAttachment = null;
    }
};
