import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mic, Loader2, Sparkles } from 'lucide-react';
import { API_BASE } from '../config';
import { useStore } from '../store/useStore';
import { chunksToWavBlob } from '../utils/audioWav';
import { normalizeSpokenSymbols } from '../utils/speechNormalize';
import {
  detectVoiceIntents,
  hintForBackendIntent,
  buildWordTimings,
  captionForTime,
} from '../utils/voiceIntent';

const SpeechRecognition =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

const STATES = {
  IDLE: 'idle',
  RECORDING: 'recording',
  PROCESSING: 'processing',
  SPEAKING: 'speaking',
  AWAITING_CONFIRMATION: 'awaiting_confirmation',
  ERROR: 'error',
  TOO_SHORT: 'too_short',
};

const STATUS = {
  idle: { label: 'Ready', sub: 'Tap the orb to begin' },
  recording: { label: 'Listening', sub: 'Pause when finished — I\'ll respond automatically' },
  processing: { label: 'Processing', sub: 'Understanding your request…' },
  speaking: { label: 'Speaking', sub: 'Tap to interrupt' },
  awaiting_confirmation: { label: 'Awaiting approval', sub: 'Say "send" to confirm · "cancel" to abort' },
  error: { label: 'Error', sub: 'Something went wrong' },
  too_short: { label: 'Try again', sub: "I didn't catch that" },
};

const MIN_AUDIO_BYTES = 1500;
const SILENCE_MS = 2200;
const SPEECH_RMS_THRESHOLD = 10;
const TTS_PLAYBACK_RATE = 1.25;
const N = 40;

function IntentChips({ intents, processingHint }) {
  if (!intents?.length && !processingHint) return null;
  return (
    <div className="flex flex-wrap justify-center gap-2 px-5 mb-3 min-h-[28px]">
      {intents.map((intent) => (
        <motion.span
          key={intent.id}
          initial={{ opacity: 0, y: 6, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide bg-[#E6F4EC] text-[#2D6A4F] border border-[#2D6A4F]/20"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F] animate-pulse" />
          {intent.label}
        </motion.span>
      ))}
      {processingHint && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium text-[#7A7065] bg-[#F7F5F2] border border-[#E8E4DE]"
        >
          {processingHint}
        </motion.span>
      )}
    </div>
  );
}

function AssistantOrb({ state }) {
  const isListening = state === STATES.RECORDING || state === STATES.AWAITING_CONFIRMATION;
  const isThinking = state === STATES.PROCESSING;
  const isSpeaking = state === STATES.SPEAKING;
  const isConfirm = state === STATES.AWAITING_CONFIRMATION;

  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <motion.div
        className="absolute inset-0 rounded-full border border-[#2D6A4F]/20"
        animate={isListening ? { scale: [1, 1.18, 1], opacity: [0.5, 0.9, 0.5] } : { scale: 1, opacity: 0.3 }}
        transition={{ duration: 2.2, repeat: isListening ? Infinity : 0, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute inset-3 rounded-full border border-[#2D6A4F]/15"
        animate={isListening ? { scale: [1, 1.12, 1], opacity: [0.4, 0.7, 0.4] } : isThinking ? { rotate: 360 } : { scale: 1, opacity: 0.25 }}
        transition={isThinking
          ? { duration: 3, repeat: Infinity, ease: 'linear' }
          : { duration: 1.8, repeat: isListening ? Infinity : 0, ease: 'easeInOut', delay: 0.2 }}
      />
      <motion.div
        className="absolute inset-6 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(192,96,58,0.12) 0%, transparent 70%)' }}
        animate={isSpeaking ? { scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] } : {}}
        transition={{ duration: 1.4, repeat: isSpeaking ? Infinity : 0 }}
      />
      <motion.div
        className="relative z-10 w-24 h-24 rounded-full flex items-center justify-center shadow-xl"
        style={{
          background: isSpeaking
            ? 'linear-gradient(135deg, #2D6A4F 0%, #40916C 50%, #52B788 100%)'
            : isConfirm
              ? 'linear-gradient(135deg, #B45309 0%, #D97706 50%, #F59E0B 100%)'
              : isThinking
                ? 'linear-gradient(135deg, #4A5568 0%, #718096 50%, #A0AEC0 100%)'
                : 'linear-gradient(135deg, #9A3412 0%, #2D6A4F 45%, #E07A5F 100%)',
          boxShadow: isListening
            ? '0 0 40px rgba(192,96,58,0.45), inset 0 -8px 20px rgba(0,0,0,0.15)'
            : '0 8px 32px rgba(26,24,20,0.12), inset 0 -6px 16px rgba(0,0,0,0.1)',
        }}
        animate={isListening ? { scale: [1, 1.04, 1] } : {}}
        transition={{ duration: 1.6, repeat: isListening ? Infinity : 0 }}
      >
        <div className="absolute inset-0 rounded-full opacity-40"
          style={{ background: 'radial-gradient(ellipse at 35% 30%, rgba(255,255,255,0.55) 0%, transparent 55%)' }}
        />
        {isThinking ? (
          <Loader2 size={28} className="text-white animate-spin" strokeWidth={2} />
        ) : isSpeaking ? (
          <Sparkles size={26} className="text-white/90" />
        ) : (
          <Mic size={26} className="text-white/95" strokeWidth={2} />
        )}
      </motion.div>
    </div>
  );
}

export default function AetherVoiceMode({ isOpen, onClose, onProcessText }) {
  const [voiceState, setVoiceState] = useState(STATES.IDLE);
  const [liveIntents, setLiveIntents] = useState([]);
  const [processingHint, setProcessingHint] = useState('');
  const [spokenCaption, setSpokenCaption] = useState('');
  const [contactOptions, setContactOptions] = useState([]);

  const pendingActionRef = useRef(null);
  const [pendingAction, setPendingAction] = useState(null);
  const setPendingActionWithRef = useCallback((val) => {
    pendingActionRef.current = val;
    setPendingAction(val);
  }, []);
  const awaitingConfirmRef = useRef(false);
  const voiceHistoryRef = useRef([]);

  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const mimeTypeRef = useRef('audio/webm');
  const startRecordingRef = useRef(null);
  const stopRecordingRef = useRef(null);
  const speakTextRef = useRef(null);
  const processAudioRef = useRef(null);
  const recognitionRef = useRef(null);
  const finalCaptionRef = useRef('');
  const interimCaptionRef = useRef('');
  const audioRef = useRef(null);
  const analyserRef = useRef(null);
  const audioCtxRef = useRef(null);
  const recordCtxRef = useRef(null);
  const recordAnalyserRef = useRef(null);
  const waveTimerRef = useRef(null);
  const vadTimerRef = useRef(null);
  const barsRef = useRef([]);
  const stateRef = useRef(STATES.IDLE);
  const hasSpokenRef = useRef(false);
  const silenceStartRef = useRef(null);
  const wordTimingsRef = useRef([]);
  const fullReplyRef = useRef('');

  const setState = useCallback((s) => {
    stateRef.current = s;
    setVoiceState(s);
  }, []);

  const clearRecordingText = useCallback(() => {
    finalCaptionRef.current = '';
    interimCaptionRef.current = '';
    setLiveIntents([]);
  }, []);

  const stopWave = useCallback(() => {
    clearInterval(waveTimerRef.current);
    barsRef.current.forEach((bar) => {
      if (!bar) return;
      bar.style.height = '3px';
      bar.style.background = '#E8E4DE';
    });
  }, []);

  const driveWaveFromAnalyser = useCallback((analyser, color = '#2D6A4F') => {
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    clearInterval(waveTimerRef.current);
    waveTimerRef.current = setInterval(() => {
      analyser.getByteFrequencyData(data);
      barsRef.current.forEach((bar, i) => {
        if (!bar) return;
        const dist = Math.abs(i - N / 2) / (N / 2);
        const env = 1 - dist * 0.7;
        const idx = Math.floor((i / N) * data.length);
        const val = (data[idx] / 255) * 44 * env;
        bar.style.height = `${Math.max(3, Math.round(val))}px`;
        bar.style.background = color;
      });
    }, 50);
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    try { recognitionRef.current?.stop(); } catch (_) { /* ignore */ }
    recognitionRef.current = null;
  }, []);

  const stopVad = useCallback(() => {
    clearInterval(vadTimerRef.current);
    vadTimerRef.current = null;
    hasSpokenRef.current = false;
    silenceStartRef.current = null;
    recordCtxRef.current?.close().catch(() => { });
    recordCtxRef.current = null;
    recordAnalyserRef.current = null;
  }, []);

  const updateLiveIntents = useCallback((text) => {
    const detected = detectVoiceIntents(text);
    setLiveIntents(detected);
  }, []);

  const startSpeechRecognition = useCallback(() => {
    if (!SpeechRecognition) return;
    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = normalizeSpokenSymbols(event.results[i][0].transcript);
          if (event.results[i].isFinal) {
            finalCaptionRef.current += text + ' ';
            hasSpokenRef.current = true;
            silenceStartRef.current = null;
          } else {
            interim += text;
          }
        }
        const trimmedInterim = normalizeSpokenSymbols(interim.trim());
        interimCaptionRef.current = trimmedInterim;
        const combined = normalizeSpokenSymbols(
          (finalCaptionRef.current + ' ' + trimmedInterim).trim()
        );
        updateLiveIntents(combined);
      };

      recognition.onerror = (e) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('Speech recognition:', e.error);
        }
      };

      recognition.onend = () => {
        if (stateRef.current === STATES.RECORDING && recognitionRef.current) {
          try { recognition.start(); } catch (_) { /* ignore */ }
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Speech recognition unavailable:', err);
    }
  }, [updateLiveIntents]);

  const startVad = useCallback((stream) => {
    stopVad();
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      ctx.createMediaStreamSource(stream).connect(analyser);
      recordCtxRef.current = ctx;
      recordAnalyserRef.current = analyser;

      const timeData = new Uint8Array(analyser.fftSize);
      vadTimerRef.current = setInterval(() => {
        if (stateRef.current !== STATES.RECORDING) return;
        analyser.getByteTimeDomainData(timeData);
        let sum = 0;
        for (let i = 0; i < timeData.length; i++) {
          const v = (timeData[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / timeData.length) * 100;

        if (rms > SPEECH_RMS_THRESHOLD || finalCaptionRef.current.trim()) {
          hasSpokenRef.current = true;
          silenceStartRef.current = null;
        } else if (hasSpokenRef.current) {
          if (!silenceStartRef.current) silenceStartRef.current = Date.now();
          else if (Date.now() - silenceStartRef.current >= SILENCE_MS) {
            stopRecordingRef.current?.();
          }
        }
      }, 80);

      driveWaveFromAnalyser(analyser, '#C0603A');
    } catch (err) {
      console.warn('VAD unavailable:', err);
    }
  }, [stopVad, driveWaveFromAnalyser]);

  const fetchStt = useCallback(async () => {
    const wavBlob = await chunksToWavBlob(audioChunksRef.current, mimeTypeRef.current);
    const blob = wavBlob || new Blob(audioChunksRef.current, { type: 'audio/webm' });
    if (blob.size < MIN_AUDIO_BYTES) return '';

    const formData = new FormData();
    const filename = wavBlob ? 'recording.wav' : 'recording.webm';
    formData.append('audio', blob, filename);

    const token = useStore.getState().auth?.user?.accessToken;
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const sttRes = await fetch(`${API_BASE}/ai/stt`, { method: 'POST', headers, body: formData });
    const sttData = await sttRes.json().catch(() => ({}));
    return sttData.transcript?.trim() || '';
  }, []);

  const appendVoiceHistory = useCallback((userText, assistantText) => {
    voiceHistoryRef.current = [
      ...voiceHistoryRef.current,
      { role: 'user', content: userText },
      { role: 'assistant', content: assistantText },
    ].slice(-8);
  }, []);

  const processAudio = useCallback(async (captionText = '') => {
    setState(STATES.PROCESSING);
    stopWave();
    setSpokenCaption('');

    const preIntent = detectVoiceIntents(
      captionText || (finalCaptionRef.current + ' ' + interimCaptionRef.current).trim()
    );
    setProcessingHint(
      preIntent[0]?.processingHint || 'Processing…'
    );

    try {
      let userText = captionText.trim();
      if (!userText) {
        userText = (finalCaptionRef.current + ' ' + interimCaptionRef.current).trim();
      }
      if (!userText) {
        userText = await fetchStt();
      }
      userText = normalizeSpokenSymbols(userText);

      if (!userText) {
        setProcessingHint('');
        setState(STATES.TOO_SHORT);
        setTimeout(() => startRecordingRef.current?.(), 900);
        return;
      }

      const wasAlreadyPending = !!pendingActionRef.current;
      const result = await onProcessText(
        userText,
        pendingActionRef.current,
        voiceHistoryRef.current
      );
      const aiText = result?.spoken ?? result;
      const pending = result?.pendingConfirmation ?? false;

      setProcessingHint(result?.intentHint || hintForBackendIntent(result?.intent));

      const isContactPick = result?.pendingAction?.stage === 'contact_pick';
      if (pending && result?.pendingAction) {
        setPendingActionWithRef(result.pendingAction);
        awaitingConfirmRef.current = true;
        setContactOptions(result?.contactOptions || []);
      } else {
        setPendingActionWithRef(null);
        awaitingConfirmRef.current = false;
        setContactOptions([]);
      }

      appendVoiceHistory(userText, aiText);
      await speakTextRef.current?.(aiText, pending && !isContactPick);

    } catch (err) {
      console.error('Pipeline error:', err);
      setProcessingHint('');
      setState(STATES.ERROR);
      setTimeout(() => setState(STATES.IDLE), 2000);
    }
  }, [setState, stopWave, onProcessText, fetchStt, appendVoiceHistory, setPendingActionWithRef]);

  const startRecording = useCallback(async () => {
    try {
      clearRecordingText();
      setSpokenCaption('');
      setProcessingHint('');
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : 'audio/webm';
      mimeTypeRef.current = mimeType;

      const mr = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mr;
      mediaStreamRef.current = stream;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stopSpeechRecognition();
        stopVad();
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        await new Promise((r) => setTimeout(r, 80));

        const caption = normalizeSpokenSymbols(
          (finalCaptionRef.current + ' ' + interimCaptionRef.current).trim()
        );
        const totalSize = audioChunksRef.current.reduce((s, c) => s + c.size, 0);

        if (!caption && totalSize < MIN_AUDIO_BYTES) {
          setProcessingHint('');
          setState(STATES.TOO_SHORT);
          setTimeout(() => startRecordingRef.current?.(), 900);
          return;
        }

        await processAudioRef.current?.(caption);
      };

      mr.start(200);
      setState(STATES.RECORDING);
      startSpeechRecognition();
      startVad(stream);
    } catch (err) {
      console.error('Mic error:', err);
      setState(STATES.ERROR);
    }
  }, [setState, clearRecordingText, startSpeechRecognition, startVad, stopSpeechRecognition, stopVad]);

  const stopRecording = useCallback(() => {
    const mr = mediaRecorderRef.current;
    if (mr?.state !== 'recording') return;
    setState(STATES.PROCESSING);
    stopWave();
    stopSpeechRecognition();
    try { mr.requestData(); } catch (_) { /* ignore */ }
    mr.stop();
  }, [setState, stopWave, stopSpeechRecognition]);

  useEffect(() => {
    startRecordingRef.current = startRecording;
    stopRecordingRef.current = stopRecording;
    processAudioRef.current = processAudio;
  }, [startRecording, stopRecording, processAudio]);

  const speakText = useCallback(async (text, willAwaitConfirm = false) => {
    const clean = (text || '').replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').trim();
    fullReplyRef.current = clean;
    wordTimingsRef.current = [];
    setSpokenCaption('');
    setProcessingHint('');
    setState(STATES.SPEAKING);

    try {
      const token = useStore.getState().auth?.user?.accessToken;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/ai/tts`, {
        method: 'POST', headers, body: JSON.stringify({ text: clean })
      });

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = TTS_PLAYBACK_RATE;
      audioRef.current = audio;

      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      audio.onloadedmetadata = () => {
        wordTimingsRef.current = buildWordTimings(clean);
      };

      audio.ontimeupdate = () => {
        const caption = captionForTime(
          wordTimingsRef.current,
          audio.currentTime,
          audio.duration
        );
        if (caption) setSpokenCaption(caption);
      };

      audio.onended = () => {
        URL.revokeObjectURL(url);
        stopWave();
        setSpokenCaption(clean);
        setTimeout(() => {
          if (stateRef.current !== STATES.SPEAKING) return;
          setSpokenCaption('');
          if (willAwaitConfirm || awaitingConfirmRef.current) {
            setState(STATES.AWAITING_CONFIRMATION);
            startRecordingRef.current?.();
          } else {
            startRecordingRef.current?.();
          }
        }, 400);
      };

      driveWaveFromAnalyser(analyser, '#2D6A4F');
      await audio.play();
    } catch (err) {
      console.error('TTS error:', err);
      setState(STATES.IDLE);
    }
  }, [setState, stopWave, driveWaveFromAnalyser]);

  useEffect(() => { speakTextRef.current = speakText; }, [speakText]);

  const cleanup = useCallback(() => {
    stopSpeechRecognition();
    stopVad();
    if (mediaRecorderRef.current?.state === 'recording') {
      try { mediaRecorderRef.current.requestData(); } catch (_) { /* ignore */ }
      mediaRecorderRef.current.stop();
    }
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;
    audioRef.current?.pause();
    audioCtxRef.current?.close().catch(() => { });
    clearInterval(waveTimerRef.current);
    voiceHistoryRef.current = [];
    setPendingActionWithRef(null);
    awaitingConfirmRef.current = false;
    setState(STATES.IDLE);
    clearRecordingText();
    setSpokenCaption('');
    setProcessingHint('');
    setContactOptions([]);
  }, [setState, stopSpeechRecognition, stopVad, clearRecordingText, setPendingActionWithRef]);

  const applyVoiceResult = useCallback(async (result, userUtterance = '') => {
    const spoken = result?.spoken ?? result;
    const pending = result?.pendingConfirmation ?? false;
    if (pending && result?.pendingAction) {
      setPendingActionWithRef(result.pendingAction);
      awaitingConfirmRef.current = true;
      setContactOptions(result?.contactOptions || []);
    } else {
      setPendingActionWithRef(null);
      awaitingConfirmRef.current = false;
      setContactOptions([]);
    }
    if (userUtterance) appendVoiceHistory(userUtterance, spoken);
    await speakTextRef.current?.(spoken, pending);
  }, [setPendingActionWithRef, appendVoiceHistory]);

  useEffect(() => {
    if (isOpen) {
      voiceHistoryRef.current = [];
      const t = setTimeout(startRecording, 300);
      return () => clearTimeout(t);
    }
    cleanup();
  }, [isOpen]);

  const handleOrbClick = () => {
    if (mediaRecorderRef.current?.state === 'recording') stopRecording();
    else if (voiceState === STATES.SPEAKING) {
      audioRef.current?.pause();
      stopWave();
      setSpokenCaption('');
      startRecording();
    } else if ([STATES.IDLE, STATES.ERROR, STATES.TOO_SHORT].includes(voiceState)) {
      startRecording();
    }
  };

  const isRecording = voiceState === STATES.RECORDING || voiceState === STATES.AWAITING_CONFIRMATION;
  const isAwaitingConfirm = voiceState === STATES.AWAITING_CONFIRMATION;
  const isSpeaking = voiceState === STATES.SPEAKING;
  const status = STATUS[voiceState] || STATUS.idle;
  const showCaption = isSpeaking && spokenCaption.length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="absolute inset-0 bg-[#1A1814]/40 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { cleanup(); onClose(); }}
          />

          <motion.div
            className="relative w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl border border-[#E8E4DE] overflow-hidden"
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-1">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#A09488]">Aether Voice</p>
                <p className="font-fraunces text-lg text-[#1A1814] leading-tight">{status.label}</p>
              </div>
              <button
                type="button"
                onClick={() => { cleanup(); onClose(); }}
                className="w-8 h-8 rounded-full border border-[#E8E4DE] flex items-center justify-center text-[#7A7065] hover:bg-[#F7F5F2] transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            <p className="px-5 text-xs text-[#A09488] mb-2">{status.sub}</p>

            <IntentChips
              intents={isRecording ? liveIntents : []}
              processingHint={voiceState === STATES.PROCESSING ? processingHint : ''}
            />

            <div className="flex justify-center py-2">
              <button type="button" onClick={handleOrbClick} className="focus:outline-none" aria-label="Voice control">
                <AssistantOrb state={voiceState} />
              </button>
            </div>

            <div className="flex items-center justify-center gap-[3px] h-10 px-8 mb-3">
              {Array.from({ length: N }).map((_, i) => (
                <div
                  key={i}
                  ref={(el) => { barsRef.current[i] = el; }}
                  className="w-[3px] rounded-full transition-[height] duration-75"
                  style={{ height: 3, background: '#E8E4DE' }}
                />
              ))}
            </div>

            <AnimatePresence>
              {showCaption && (
                <motion.div
                  className="mx-5 mb-4"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="rounded-2xl border border-[#2D6A4F]/20 bg-[#E6F4EC]/60 px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F] animate-pulse" />
                      <span className="text-[9px] font-bold uppercase tracking-widest text-[#2D6A4F]">Live caption</span>
                    </div>
                    <p className="text-sm text-[#1A1814] leading-relaxed font-dm">
                      {spokenCaption}
                      <span className="inline-block w-[2px] h-[14px] bg-[#2D6A4F] ml-0.5 animate-pulse align-middle" />
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {contactOptions.length > 0 && isAwaitingConfirm && (
              <div className="mx-5 mb-4 rounded-2xl border border-[#6366F1]/25 bg-[#EEF2FF] px-4 py-3">
                <p className="text-[9px] font-bold uppercase tracking-widest text-[#6366F1] mb-2">Choose a contact</p>
                <div className="flex flex-col gap-2">
                  {contactOptions.map((opt, i) => (
                    <button
                      key={opt.email}
                      type="button"
                      onClick={async () => {
                        const utterance = `contact_pick:${i}`;
                        const result = await onProcessText(
                          utterance,
                          pendingActionRef.current,
                          voiceHistoryRef.current
                        );
                        await applyVoiceResult(result, utterance);
                      }}
                      className="text-left px-3 py-2.5 rounded-xl border border-[#E8E4DE] bg-white hover:border-[#6366F1]/40 hover:bg-[#F7F5F2] transition-all"
                    >
                      <span className="text-xs font-bold text-[#6366F1]">Option {opt.index || i + 1}</span>
                      <p className="text-sm font-medium text-[#1A1814]">{opt.name || opt.email}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="px-5 pb-6 flex flex-col items-center gap-2">
              {isAwaitingConfirm && pendingAction?.stage === 'confirm' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      const utterance = 'send it';
                      const result = await onProcessText(
                        utterance,
                        pendingActionRef.current,
                        voiceHistoryRef.current
                      );
                      await applyVoiceResult(result, utterance);
                    }}
                    className="h-10 px-5 rounded-full bg-[#2D6A4F] text-white text-sm font-semibold hover:brightness-105 active:scale-[0.98] transition-all"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const utterance = 'cancel';
                      const result = await onProcessText(
                        utterance,
                        pendingActionRef.current,
                        voiceHistoryRef.current
                      );
                      await applyVoiceResult(result, utterance);
                    }}
                    className="h-10 px-5 rounded-full border border-[#E8E4DE] text-[#7A7065] text-sm font-semibold hover:bg-[#F7F5F2] active:scale-[0.98] transition-all"
                  >
                    Cancel
                  </button>
                </div>
              )}
              <p className="text-[10px] text-[#A09488] tracking-wide text-center">
                {voiceState === STATES.RECORDING && 'Pause speaking to auto-send'}
                {isAwaitingConfirm && contactOptions.length > 0 && 'Say "first one" or tap an option'}
                {isAwaitingConfirm && !contactOptions.length && pendingAction?.stage === 'confirm' && 'Say "send" to confirm · "cancel" to abort'}
                {isSpeaking && 'Tap orb to interrupt'}
                {voiceState === STATES.PROCESSING && (processingHint || 'One moment…')}
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
