/** Real-time voice intent detection from partial transcripts */

export const VOICE_INTENTS = [
  {
    id: 'email',
    label: 'Email',
    keywords: [
      'email', 'e-mail', 'mail', 'inbox', 'gmail', 'send to', 'draft',
      'reply', 'message to', 'write to',
    ],
    liveHint: 'Email',
    processingHint: 'Checking inbox…',
    backendIntents: ['send_email', 'check_emails'],
  },
  {
    id: 'schedule',
    label: 'Schedule',
    keywords: [
      'meeting', 'schedule', 'calendar', 'book', 'appointment', 'invite',
      'tomorrow at', 'today at', 'next week', 'sync', 'call with',
    ],
    liveHint: 'Schedule',
    processingHint: 'Checking calendar…',
    backendIntents: ['schedule_meeting', 'check_calendar'],
  },
  {
    id: 'slack',
    label: 'Slack',
    keywords: ['slack', 'channel', 'post to', 'post in', '#'],
    liveHint: 'Slack',
    processingHint: 'Preparing Slack message…',
    backendIntents: ['send_slack'],
  },
  {
    id: 'task',
    label: 'Task',
    keywords: ['task', 'todo', 'to-do', 'remind me', 'reminder', 'follow up', 'add a note'],
    liveHint: 'Task',
    processingHint: 'Creating task…',
    backendIntents: ['create_task'],
  },
];

export function detectVoiceIntents(text) {
  const t = (text || '').toLowerCase();
  if (!t.trim()) return [];
  return VOICE_INTENTS.filter((intent) =>
    intent.keywords.some((kw) => t.includes(kw))
  );
}

export function hintForBackendIntent(intent) {
  const match = VOICE_INTENTS.find((v) => v.backendIntents.includes(intent));
  return match?.processingHint || 'Processing…';
}

export function buildWordTimings(text) {
  const words = (text || '').split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const weights = words.map((w) => Math.max(1, w.replace(/[^a-zA-Z]/g, '').length));
  const total = weights.reduce((a, b) => a + b, 0);
  let cursor = 0;
  return words.map((word, i) => {
    const share = weights[i] / total;
    const start = cursor;
    cursor += share;
    return { word, start, end: cursor };
  });
}

export function captionForTime(timings, currentTime, duration) {
  if (!timings.length || !duration) return '';
  const progress = Math.min(1, currentTime / duration);
  const visible = [];
  for (const t of timings) {
    if (t.start <= progress) visible.push(t.word);
    else break;
  }
  return visible.join(' ');
}
