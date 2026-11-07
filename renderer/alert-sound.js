'use strict';

// Short tones synthesized on the spot, so the app ships no audio assets.
// The pet window keeps its renderer alive while hidden, so tones still play.
(function () {
  const TONES = {
    attention: [{ frequency: 659.25, at: 0, length: 0.16 }, { frequency: 880, at: 0.13, length: 0.24 }],
    done: [{ frequency: 1046.5, at: 0, length: 0.22 }],
  };
  const VOLUME = 0.14;
  let context = null;

  async function play(name) {
    const notes = TONES[name];
    if (!notes) return false;
    context = context || new AudioContext();
    if (context.state === 'suspended') await context.resume();
    const start = context.currentTime + 0.01;
    for (const note of notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = note.frequency;
      gain.gain.setValueAtTime(0.0001, start + note.at);
      gain.gain.exponentialRampToValueAtTime(VOLUME, start + note.at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.at + note.length);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start + note.at);
      oscillator.stop(start + note.at + note.length + 0.02);
    }
    return true;
  }

  window.AgentPawAlertSound = { play };
  if (window.pet && window.pet.onAlertSound) window.pet.onAlertSound(name => { play(name).catch(() => {}); });
})();
