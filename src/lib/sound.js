// src/lib/sound.js
// Petits sons encodés en Base64 pour éviter les requêtes réseaux

const SOUND_CLICK = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="; // Remplacer par un vrai son de clic court
const SOUND_SUCCESS = "data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="; // Remplacer par un vrai son de succès

export function playClick() {
  try {
    const audio = new Audio(SOUND_CLICK);
    audio.volume = 0.3;
    audio.play().catch(() => {});
  } catch (e) {}
}

export function playSuccess() {
  try {
    const audio = new Audio(SOUND_SUCCESS);
    audio.volume = 0.5;
    audio.play().catch(() => {});
  } catch (e) {}
}
