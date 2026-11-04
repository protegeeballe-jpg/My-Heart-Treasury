/**
 * Media capture controller for notes, photos, and short video clips.
 */
const MediaController = {
    pendingAttachment: null,
    mediaRecorder: null,
    recordedChunks: [],
    isRecording: false,
    recordingTimer: null,

    async startThreeSecondRecording(videoElement, progressBarElement, onComplete) {
        if (this.isRecording) return false;

        this.isRecording = true;
        this.recordedChunks = [];

        let stream = null;
        let recorder = null;
        let completed = false;

        const clearRecordingTimer = () => {
            if (this.recordingTimer !== null) {
                clearInterval(this.recordingTimer);
                this.recordingTimer = null;
            }
        };

        const stopStream = () => {
            if (stream) {
                stream.getTracks().forEach(track => {
                    try { track.stop(); } catch (error) {
                        console.warn('Could not stop a media track:', error);
                    }
                });
                stream = null;
            }
        };

        const resetPreview = () => {
            if (!videoElement) return;
            try { videoElement.pause(); } catch (_) {}
            videoElement.srcObject = null;
        };

        const finish = (attachment) => {
            if (completed) return;
            completed = true;
            clearRecordingTimer();
            stopStream();
            resetPreview();
            this.isRecording = false;
            this.mediaRecorder = null;
            this.recordedChunks = [];

            // Make completed recordings available to Save Vault and its preview.
            if (attachment) this.pendingAttachment = attachment;

            if (typeof onComplete === 'function') {
                try {
                    onComplete(attachment || null);
                } catch (callbackError) {
                    console.error('Recording completion callback failed:', callbackError);
                }
            }
        };

        try {
            if (typeof MediaRecorder === 'undefined') {
                throw new Error('MediaRecorder is not supported in this browser.');
            }

            if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
                throw new Error('Camera access is unavailable in this browser or context.');
            }

            // Prefer audio, but keep video recording available when microphone access is denied.
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        frameRate: { ideal: 30 }
                    },
                    audio: true
                });
            } catch (audioError) {
                console.warn('Audio capture unavailable; trying video-only.', audioError);

                stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 640 }, height: { ideal: 480 } },
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
                } catch (playError) {
                    console.warn('Video preview autoplay failed:', playError);
                }
            }

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
                    } catch (_) {
                        return false;
                    }
                });

                if (supportedMimeType) {
                    options = {
                        mimeType: supportedMimeType,
                        videoBitsPerSecond: 800000
                    };
                }
            }

            try {
                recorder = new MediaRecorder(stream, options);
            } catch (optionsError) {
                console.warn('Configured recorder options were rejected; using browser defaults.', optionsError);
                recorder = new MediaRecorder(stream);
            }

            this.mediaRecorder = recorder;

            recorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            recorder.onerror = (event) => {
                console.error('MediaRecorder internal error:', event.error || event);
                clearRecordingTimer();

                if (recorder.state !== 'inactive') {
                    try { recorder.stop(); } catch (_) {}
                }

                finish(null);
            };

            recorder.onstop = () => {
                if (completed) return;
                clearRecordingTimer();
                stopStream();
                resetPreview();

                if (this.recordedChunks.length === 0) {
                    console.error('Recording failed: No recorded chunks captured.');
                    finish(null);
                    return;
                }

                const recorderMimeType =
                    recorder.mimeType ||
                    this.recordedChunks.find(chunk => chunk.type)?.type ||
                    'video/webm';

                const containerMimeType = recorderMimeType.split(';', 1)[0].trim().toLowerCase();
                const recordedChunks = this.recordedChunks.slice();
                this.recordedChunks = [];
                const blob = new Blob(recordedChunks, { type: containerMimeType });
                const reader = new FileReader();

                reader.onload = () => {
                    finish({
                        type: 'video',
                        dataUrl: reader.result
                    });
                };

                reader.onerror = () => {
                    console.error('Video reading failed:', reader.error);
                    finish(null);
                };

                reader.onabort = () => finish(null);
                try {
                    reader.readAsDataURL(blob);
                } catch (readError) {
                    console.error('Video data could not be read:', readError);
                    finish(null);
                }
            };

            recorder.start(100);

            const recordingDurationMs = 3200;
            const startedAt = performance.now();

            this.recordingTimer = setInterval(() => {
                const elapsed = performance.now() - startedAt;
                const progress = Math.min((elapsed / recordingDurationMs) * 100, 100);

                if (progressBarElement) {
                    progressBarElement.style.width = progress + '%';
                }

                if (elapsed >= recordingDurationMs) {
                    clearRecordingTimer();

                    if (recorder.state !== 'inactive') {
                        try {
                            recorder.stop();
                        } catch (stopError) {
                            console.error('Could not stop the video recorder:', stopError);
                            finish(null);
                        }
                    }
                }
            }, 50);

            return true;
        } catch (error) {
            console.error('Video recording setup failed:', error);
            finish(null);

            alert(
                'Unable to start recording. Please check camera ' +
                'and microphone permissions, then try again.'
            );

            return false;
        }
    },

    readImageFile(file, onComplete) {
        const finish = (attachment) => {
            if (typeof onComplete === 'function') onComplete(attachment || null);
        };

        if (!file) {
            finish(null);
            return;
        }

        const supportedImage = typeof file.type === 'string' && file.type.startsWith('image/');
        if (!supportedImage) {
            alert('Please choose a valid image file.');
            finish(null);
            return;
        }

        const MAX_FILE_SIZE = 20 * 1024 * 1024;
        if (file.size > MAX_FILE_SIZE) {
            alert('Please choose an image smaller than 20 MB.');
            finish(null);
            return;
        }

        const reader = new FileReader();

        reader.onerror = () => {
            console.error('FileReader failed to read the image file:', reader.error);
            finish(null);
        };

        reader.onabort = () => finish(null);

        reader.onload = (event) => {
            const img = new Image();

            img.onerror = () => {
                console.error('Image decoding failed (corrupted or unsupported format).');
                alert('Invalid image format or corrupted file.');
                finish(null);
            };

            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 800;
                    const MAX_HEIGHT = 800;
                    let width = img.width;
                    let height = img.height;

                    if (!width || !height) {
                        throw new Error('The selected image has invalid dimensions.');
                    }

                    const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
                    width = Math.max(1, Math.round(width * scale));
                    height = Math.max(1, Math.round(height * scale));

                    canvas.width = width;
                    canvas.height = height;

                    const context = canvas.getContext('2d');
                    if (!context) {
                        throw new Error('Image processing is unavailable in this browser.');
                    }

                    context.drawImage(img, 0, 0, width, height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

                    if (!dataUrl || !dataUrl.startsWith('data:image/jpeg')) {
                        throw new Error('The selected image could not be converted.');
                    }

                    const attachment = { type: 'photo', dataUrl };
                    this.pendingAttachment = attachment;
                    finish(attachment);
                } catch (error) {
                    console.error('Image processing failed:', error);
                    alert('The selected image could not be processed. Please try another image.');
                    finish(null);
                }
            };

            img.src = event.target.result;
        };

        try {
            reader.readAsDataURL(file);
        } catch (readError) {
            console.error('Image file reading could not start:', readError);
            finish(null);
        }
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
