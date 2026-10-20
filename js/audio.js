/**
 * Realistic Human Heartbeat Synthesizer ("Lub-Dub" Rhythm)
 */
const AudioController = (() => {
    let audioCtx = null;
    let isMuted = false;

    function getAudioContext() {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContextClass();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    function toggleMute() {
        isMuted = !isMuted;
        return isMuted;
    }

    // Synthesizes an authentic biological human "Lub-Dub" heartbeat sound
    function playHeartPop() {
        if (isMuted) return;

        try {
            const ctx = getAudioContext();
            const now = ctx.currentTime;

            // Master volume gain node
            const masterGain = ctx.createGain();
            masterGain.gain.setValueAtTime(0.85, now);

            // Low-pass filter simulating sound muffling through organic chest tissue
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(150, now);

            masterGain.connect(filter);
            filter.connect(ctx.destination);

            // 1. "LUB" (S1 - Systole: Deeper, slightly longer thud)
            createThump(ctx, filter, now, 65, 32, 0.10, 0.9);

            // 2. "DUB" (S2 - Diastole: Sharper, shorter snap occurring precisely after the natural interval)
            createThump(ctx, filter, now + 0.13, 85, 45, 0.07, 0.7);

        } catch (err) {
            console.warn('Audio playback restricted:', err);
        }
    }

    function createThump(ctx, destination, startTime, startFreq, endFreq, duration, volume) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(startFreq, startTime);
        osc.frequency.exponentialRampToValueAtTime(endFreq, startTime + duration);

        gain.gain.setValueAtTime(volume, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

        osc.connect(gain);
        gain.connect(destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
    }

    return {
        playHeartPop,
        toggleMute
    };
})();
