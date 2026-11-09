'use client';

import { registerPlugin } from '@capacitor/core';

// Centralise l'enregistrement JS : le plugin natif est déclaré une seule fois.
export const PataSms = registerPlugin('PataSms');
